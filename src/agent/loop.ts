import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  completionInput,
  type CompletionInput,
  type OpenRouter,
} from "../model/openrouter.js";
import { BusinessError } from "../shared/contracts.js";
import { toolCallSchema } from "../shared/tool-call.js";
import { ToolDispatcher, type ToolContext, type ToolResult } from "./tools.js";

export type ModelCompletion = Awaited<ReturnType<OpenRouter["complete"]>>;
export interface AgentModel {
  complete(input: CompletionInput): Promise<ModelCompletion>;
}
export type AgentStep = {
  completion: ModelCompletion;
  toolResults: ToolResult[];
  skippedToolCallIds: string[];
};
type Trace = { iterations: number; steps: AgentStep[] };
export type AgentResult = Trace &
  (
    | { status: "responded"; content: string }
    | {
        status: "confirmation_required";
        pending: Extract<ToolResult, { status: "confirmation_required" }>;
      }
    | {
        status: "stopped";
        error: { code: string; correlationId: string };
      }
  );

const requestSchema = z.strictObject({
  userText: z.string().trim().min(1).max(16000),
  // Minimal safety bound for 09.09. Full run time/token policy follows in 09.11.
  maxIterations: z.number().int().min(1).max(8).default(4),
});
const observationSchema = z.object({
  content: z.string().max(16000).nullable(),
  toolCalls: z.array(toolCallSchema).max(8),
  finishReason: z.enum(["stop", "length", "tool_calls"]),
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

// Server-only, single invocation. This is not a durable conversation or resume API.
export class AgentLoop {
  constructor(
    private model: AgentModel,
    private dispatcher: ToolDispatcher,
  ) {}

  async run(
    context: ToolContext,
    raw: { userText: string; maxIterations?: number },
  ): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    let iterations = 0;
    const stop = (code: string): AgentResult => ({
      status: "stopped",
      error: { code, correlationId: randomUUID() },
      iterations,
      steps,
    });
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) return stop("AGENT_INPUT_INVALID");
    const { userText, maxIterations } = parsed.data;
    const messages: CompletionInput["messages"] = [
      { role: "system", content: "" },
      { role: "user", content: userText },
    ];
    const seenIds = new Set<string>();
    try {
      const tools = this.dispatcher.bind(context);
      for (; iterations < maxIterations;) {
        // Refresh authentication before every request, without forwarding the token.
        messages[0] = { role: "system", content: tools.instructions() };
        const input: CompletionInput = {
          messages,
          tools: tools.definitions(),
          toolChoice: "auto",
        };
        // Reject a growing transcript before the provider reserves or spends money.
        if (
          !completionInput.safeParse(input).success ||
          Buffer.byteLength(JSON.stringify(input)) > 16000
        )
          return stop("AGENT_CONTEXT_LIMIT");
        iterations++;
        // Snapshot the input so a provider/mock cannot mutate this run's transcript.
        const completion = await this.model.complete(structuredClone(input));
        const observation = observationSchema.safeParse(completion);
        if (!observation.success) return stop("MODEL_RESPONSE_INVALID");
        const { content, toolCalls, finishReason } = observation.data;
        const step: AgentStep = {
          completion: structuredClone(completion),
          toolResults: [],
          skippedToolCallIds: toolCalls.map((call) => call.id),
        };
        steps.push(step);
        // A session may expire/be revoked while awaiting the provider. Recheck even
        // for text-only replies, before returning prose or executing any call.
        const names = new Set(
          tools.definitions().map((tool) => tool.function.name),
        );
        if (finishReason === "length") return stop("MODEL_OUTPUT_TRUNCATED");
        if (
          (finishReason === "tool_calls") !== toolCalls.length > 0 ||
          new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length ||
          toolCalls.some(
            (call) => seenIds.has(call.id) || !names.has(call.function.name),
          )
        )
          return stop("MODEL_RESPONSE_INVALID");
        if (!toolCalls.length) {
          if (!content?.trim()) return stop("MODEL_EMPTY_RESPONSE");
          // A model response is prose, not a claim of verified business completion.
          return { status: "responded", content, iterations, steps };
        }
        messages.push({
          role: "assistant",
          content,
          tool_calls: toolCalls,
        });
        for (const call of toolCalls) {
          seenIds.add(call.id);
          const result = tools.dispatch(call);
          step.toolResults.push(result);
          step.skippedToolCallIds.shift();
          if (result.status === "confirmation_required")
            return {
              status: "confirmation_required",
              pending: result,
              iterations,
              steps,
            };
          if (
            result.status === "rejected" &&
            (authorityErrors.has(result.error.code) ||
              result.error.code === "TOOL_INTERNAL_ERROR")
          )
            return stop(result.error.code);
          // Keep the exact typed result separate from model prose and also supply it
          // as a tool observation. Ordinary domain/argument rejections may be corrected.
          const serialized = JSON.stringify(result);
          if (Buffer.byteLength(serialized) > 16000)
            return stop("AGENT_CONTEXT_LIMIT");
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: serialized,
          });
        }
      }
      return stop("AGENT_ITERATION_LIMIT");
    } catch (error) {
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
