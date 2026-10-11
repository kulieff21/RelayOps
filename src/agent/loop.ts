import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  completionInput,
  type CompletionInput,
  type CompletionOptions,
  type OpenRouter,
  type UsageObservation,
} from "../model/openrouter.js";
import { BusinessError } from "../shared/contracts.js";
import { toolCallSchema, type ToolCall } from "../shared/tool-call.js";
import { ToolDispatcher, type ToolContext, type ToolResult } from "./tools.js";
import type { AgentOutcome } from "../shared/agent-outcome.js";
import { resolveAgentOutcome } from "./outcomes.js";

export type ModelCompletion = Omit<
  Awaited<ReturnType<OpenRouter["complete"]>>,
  "mode" | "attemptId" | "providerRequestId"
> & {
  mode: "live" | "mock";
  attemptId: string;
  providerRequestId: string | null;
};
export interface AgentModel {
  complete(
    input: CompletionInput,
    options?: CompletionOptions,
  ): Promise<ModelCompletion>;
}
export type AgentStep = {
  completion: ModelCompletion;
  toolResults: ToolResult[];
  skippedToolCallIds: string[];
};
type Trace = { iterations: number; steps: AgentStep[] };
type Terminal =
  | AgentOutcome
  | {
      status: "confirmation_required";
      pending: Extract<ToolResult, { status: "confirmation_required" }>;
    }
  | { status: "stopped"; error: { code: string; correlationId: string } };
export type AgentResult = Trace & Terminal;

export const runRequest = z.strictObject({
  userText: z.string().trim().min(1).max(16000),
  maxIterations: z.number().int().min(1).max(8).default(4),
  maxTimeMs: z.number().int().min(10).max(120000).default(60000),
  maxTokens: z.number().int().min(64).max(128000).default(64000),
  maxOutputTokens: z.number().int().min(1).max(2048).default(512),
  maxRetries: z.number().int().min(0).max(2).default(1),
});
export type RunRequest = z.input<typeof runRequest>;
export type RunState = {
  version: 1;
  request: z.output<typeof runRequest>;
  messages: CompletionInput["messages"];
  steps: AgentStep[];
  iterations: number;
  retries: number;
  seenIds: string[];
  elapsedMs: number;
  tokenAllowanceSpent: number;
  toolIndex: number;
  phase: "ready" | "model_pending" | "tools" | "finished";
};
export interface RunPersistence {
  save(state: RunState): void;
  atomic<T>(action: () => T): T;
  tool(call: ToolCall, result: ToolResult): void;
  usage(record: UsageObservation): void;
  finish(result: AgentResult, state: RunState): void;
}
const observationSchema = z.object({
  content: z.string().max(16000).nullable(),
  toolCalls: z.array(toolCallSchema).max(8),
  finishReason: z.enum(["stop", "length", "tool_calls"]),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    costMicroUsd: z.number().int().nonnegative().nullable(),
  }),
});
const authorityErrors = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CASE_NOT_FOUND",
  "TOOL_CONTEXT_INVALID",
]);
const providerErrors = new Set([
  "MODEL_INPUT_INVALID",
  "MODEL_INPUT_TOO_LARGE",
  "MODEL_TOOLS_INVALID",
  "MODEL_CATALOGUE_UNAVAILABLE",
  "MODEL_CATALOGUE_INVALID",
  "MODEL_PROVIDER_UNSUPPORTED",
  "MODEL_PRICE_CAP_EXCEEDED",
  "MODEL_PRICING_OUTSIDE_BUDGET_POLICY",
  "MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN",
  "MODEL_AUTHENTICATION_FAILED",
  "MODEL_CREDITS_UNAVAILABLE",
  "MODEL_PROVIDER_FAILED_CHARGE_UNKNOWN",
  "MODEL_RESPONSE_INVALID_CHARGE_UNKNOWN",
  "MODEL_RESPONSE_INVALID",
  "MODEL_BUDGET_EXHAUSTED",
]);

export class AgentLoop {
  constructor(
    private model: AgentModel,
    private dispatcher: ToolDispatcher,
    private now = () => performance.now(),
  ) {}

  async run(
    context: ToolContext,
    raw: RunRequest,
    persistence?: RunPersistence,
    recovered?: RunState,
    history: CompletionInput["messages"] = [],
  ): Promise<AgentResult> {
    const parsed = runRequest.safeParse(raw);
    if (!parsed.success)
      return {
        status: "stopped",
        error: { code: "AGENT_INPUT_INVALID", correlationId: randomUUID() },
        iterations: 0,
        steps: [],
      };
    const state: RunState = recovered ?? {
      version: 1,
      request: parsed.data,
      messages: [
        { role: "system", content: "" },
        ...structuredClone(history),
        { role: "user", content: parsed.data.userText },
      ],
      steps: [],
      iterations: 0,
      retries: 0,
      seenIds: [],
      elapsedMs: 0,
      tokenAllowanceSpent: 0,
      toolIndex: 0,
      phase: "ready",
    };
    const limits = state.request;
    let last = this.now();
    const tick = () => {
      const current = this.now();
      state.elapsedMs += Math.max(0, current - last);
      last = current;
    };
    const save = () => {
      tick();
      persistence?.save(state);
    };
    const finish = (outcome: Terminal): AgentResult => {
      tick();
      state.phase = "finished";
      const result = {
        ...outcome,
        iterations: state.iterations,
        steps: state.steps,
      } as AgentResult;
      persistence?.finish(result, state);
      return result;
    };
    const stop = (code: string) =>
      finish({
        status: "stopped",
        error: { code, correlationId: randomUUID() },
      });
    if (state.elapsedMs >= limits.maxTimeMs) return stop("AGENT_TIME_LIMIT");
    const signal = AbortSignal.timeout(
      Math.max(1, Math.ceil(limits.maxTimeMs - state.elapsedMs)),
    );
    const expired = () => {
      tick();
      return signal.aborted || state.elapsedMs >= limits.maxTimeMs;
    };
    const bounded = async (
      input: CompletionInput,
    ): Promise<ModelCompletion> => {
      if (expired()) throw new Error("AGENT_TIME_LIMIT");
      let listener: () => void = () => {};
      const timeout = new Promise<never>((_, reject) => {
        listener = () => reject(new Error("AGENT_TIME_LIMIT"));
        signal.addEventListener("abort", listener, { once: true });
      });
      try {
        return await Promise.race([
          this.model.complete(structuredClone(input), {
            signal,
            maxOutputTokens: limits.maxOutputTokens,
            observeUsage: (r) => persistence?.usage(r),
          }),
          timeout,
        ]);
      } finally {
        signal.removeEventListener("abort", listener);
      }
    };
    try {
      const tools = this.dispatcher.bind(context);
      if (state.phase === "model_pending")
        return stop("AGENT_INTERRUPTED_MODEL_CALL");
      for (;;) {
        if (expired()) return stop("AGENT_TIME_LIMIT");
        tools.definitions();
        if (state.phase === "ready") {
          if (state.iterations >= limits.maxIterations)
            return stop("AGENT_ITERATION_LIMIT");
          state.messages[0] = { role: "system", content: tools.instructions() };
          const input: CompletionInput = {
            messages: state.messages,
            tools: tools.definitions(),
            toolChoice: "auto",
          };
          const bytes = Buffer.byteLength(JSON.stringify(input));
          if (!completionInput.safeParse(input).success || bytes > 16000)
            return stop("AGENT_CONTEXT_LIMIT");
          const allowance = bytes + 1024 + limits.maxOutputTokens;
          if (state.tokenAllowanceSpent + allowance > limits.maxTokens)
            return stop("AGENT_TOKEN_LIMIT");
          state.iterations++;
          state.phase = "model_pending";
          save();
          let completion: ModelCompletion;
          try {
            completion = await bounded(input);
          } catch (error) {
            if (expired()) return stop("AGENT_TIME_LIMIT");
            if (
              error instanceof Error &&
              error.message === "MODEL_CATALOGUE_UNAVAILABLE" &&
              state.retries < limits.maxRetries &&
              state.iterations < limits.maxIterations
            ) {
              state.retries++;
              state.phase = "ready";
              save();
              await delay(100 * state.retries, undefined, { signal });
              continue;
            }
            throw error;
          }
          persistence?.usage({
            attemptId: completion.attemptId,
            providerRequestId: completion.providerRequestId,
            ...completion.usage,
          });
          const observation = observationSchema.safeParse(completion);
          if (!observation.success) return stop("MODEL_RESPONSE_INVALID");
          const { content, toolCalls, finishReason, usage } = observation.data;
          const step: AgentStep = {
            completion: structuredClone(completion),
            toolResults: [],
            skippedToolCallIds: toolCalls.map((call) => call.id),
          };
          state.steps.push(step);
          state.tokenAllowanceSpent +=
            usage.inputTokens === null || usage.outputTokens === null
              ? allowance
              : usage.inputTokens + usage.outputTokens;
          tools.definitions();
          if (expired()) return stop("AGENT_TIME_LIMIT");
          if (
            state.tokenAllowanceSpent > limits.maxTokens ||
            (usage.outputTokens !== null &&
              usage.outputTokens > limits.maxOutputTokens)
          )
            return stop("AGENT_TOKEN_LIMIT");
          if (finishReason === "length") return stop("MODEL_OUTPUT_TRUNCATED");
          const names = new Set(
            tools.definitions().map((t) => t.function.name),
          );
          if (
            (finishReason === "tool_calls") !== toolCalls.length > 0 ||
            new Set(toolCalls.map((c) => c.id)).size !== toolCalls.length ||
            toolCalls.some(
              (c) =>
                state.seenIds.includes(c.id) || !names.has(c.function.name),
            )
          )
            return stop("MODEL_RESPONSE_INVALID");
          if (!toolCalls.length) {
            if (!content?.trim()) return stop("MODEL_EMPTY_RESPONSE");
            const resolved = resolveAgentOutcome(
              content,
              state.steps.flatMap((s) => s.toolResults),
              tools.handoffQueue(),
            );
            if (!resolved.ok) return stop(resolved.code);
            return finish(resolved.outcome);
          }
          state.messages.push({
            role: "assistant",
            content,
            tool_calls: toolCalls,
          });
          state.phase = "tools";
          state.toolIndex = 0;
          save();
        }
        let step = state.steps.at(-1)!;
        // The process can die after committing a terminal tool result but before
        // committing the turn outcome. Recovery must honor that same boundary.
        const prior = step.toolResults.at(-1);
        if (prior?.status === "confirmation_required")
          return finish({ status: "confirmation_required", pending: prior });
        if (
          prior?.status === "rejected" &&
          (authorityErrors.has(prior.error.code) ||
            ["TOOL_INTERNAL_ERROR", "TOOL_TEMPORARILY_UNAVAILABLE"].includes(
              prior.error.code,
            ))
        )
          return stop(prior.error.code);
        if (prior && Buffer.byteLength(JSON.stringify(prior)) > 16000)
          return stop("AGENT_CONTEXT_LIMIT");
        while (state.toolIndex < step.completion.toolCalls.length) {
          if (expired()) return stop("AGENT_TIME_LIMIT");
          const call = step.completion.toolCalls[state.toolIndex]!;
          const execute = () => {
            const result = tools.dispatch(call);
            if (
              result.status === "rejected" &&
              result.error.code === "TOOL_TEMPORARILY_UNAVAILABLE" &&
              state.retries < limits.maxRetries
            ) {
              state.retries++;
              save();
              return result;
            }
            step.toolResults.push(result);
            step.skippedToolCallIds.shift();
            state.seenIds.push(call.id);
            state.toolIndex++;
            const serialized = JSON.stringify(result);
            if (Buffer.byteLength(serialized) <= 16000)
              state.messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: serialized,
              });
            persistence?.tool(call, result);
            save();
            return result;
          };
          const before = structuredClone(state);
          let result: ToolResult;
          try {
            result = persistence ? persistence.atomic(execute) : execute();
          } catch (error) {
            Object.assign(state, before);
            step = state.steps.at(-1)!;
            // BEGIN/COMMIT lock failures also roll back through Store. They cannot
            // repeat a committed effect because effect/evidence/checkpoint are atomic.
            if (
              error instanceof Error &&
              "errcode" in error &&
              (error.errcode === 5 || error.errcode === 6)
            ) {
              if (state.retries < limits.maxRetries && !expired()) {
                state.retries++;
                await delay(100 * state.retries, undefined, { signal });
                continue;
              }
              return stop("TOOL_TEMPORARILY_UNAVAILABLE");
            }
            throw error;
          }
          if (
            result.status === "rejected" &&
            result.error.code === "TOOL_TEMPORARILY_UNAVAILABLE" &&
            state.toolIndex === before.toolIndex
          )
            continue;
          if (result.status === "confirmation_required")
            return finish({ status: "confirmation_required", pending: result });
          if (
            result.status === "rejected" &&
            (authorityErrors.has(result.error.code) ||
              ["TOOL_INTERNAL_ERROR", "TOOL_TEMPORARILY_UNAVAILABLE"].includes(
                result.error.code,
              ))
          )
            return stop(result.error.code);
          if (Buffer.byteLength(JSON.stringify(result)) > 16000)
            return stop("AGENT_CONTEXT_LIMIT");
          if (expired()) return stop("AGENT_TIME_LIMIT");
        }
        state.phase = "ready";
        save();
      }
    } catch (error) {
      if (expired()) return stop("AGENT_TIME_LIMIT");
      if (error instanceof BusinessError && authorityErrors.has(error.code))
        return stop(error.code);
      return stop(
        error instanceof Error && providerErrors.has(error.message)
          ? error.message
          : "AGENT_INTERNAL_ERROR",
      );
    }
  }
}
