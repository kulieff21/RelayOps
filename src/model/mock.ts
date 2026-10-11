import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AgentModel, ModelCompletion } from "../agent/loop.js";
import {
  completionInput,
  type CompletionInput,
  type CompletionOptions,
} from "./openrouter.js";
import { agentOutcomeSchema } from "../shared/agent-outcome.js";

export type MockResponse = Pick<
  ModelCompletion,
  "content" | "toolCalls" | "finishReason"
>;
type Script = readonly (
  MockResponse | Error | ((input: CompletionInput) => MockResponse)
)[];
type Demo =
  | { scenario: "catalog"; query: string }
  | { scenario: "quotes"; caseId: string }
  | { scenario: "clarification" };

// No network, credentials, spending ledger or automatic replacement of a live failure.
// Scripted fixtures and explicitly selected catalog/quote/clarification demos only.
export class MockModel implements AgentModel {
  private cursor = 0;
  constructor(private source: Script | Demo = { scenario: "clarification" }) {}
  async complete(
    raw: CompletionInput,
    options: CompletionOptions = {},
  ): Promise<ModelCompletion> {
    options.signal?.throwIfAborted();
    const input = completionInput.parse(raw);
    let response: MockResponse;
    if (Array.isArray(this.source)) {
      const next = this.source[this.cursor++];
      if (!next) throw new Error("MODEL_MOCK_EXHAUSTED");
      if (next instanceof Error) throw next;
      response =
        typeof next === "function"
          ? next(structuredClone(input))
          : structuredClone(next);
    } else response = this.demo(input, this.source as Demo);
    return {
      ...response,
      mode: "mock",
      model: "relayops/deterministic-mock",
      attemptId: randomUUID(),
      providerRequestId: null,
      // No provider tokenization occurred. Zero cost is known; token counts are unknown.
      usage: { inputTokens: null, outputTokens: null, costMicroUsd: 0 },
    };
  }
  private demo(input: CompletionInput, demo: Demo): MockResponse {
    const az = input.messages[0]?.content?.includes("Respond in Azerbaijani.");
    let lastUser = -1;
    input.messages.forEach((message, index) => {
      if (message.role === "user") lastUser = index;
    });
    const observations = input.messages
      .slice(lastUser + 1)
      .filter((m) => m.role === "tool");
    if (demo.scenario === "clarification")
      return {
        content: JSON.stringify(
          agentOutcomeSchema.parse({
            status: "clarification",
            question: az
              ? "Hansı məhsul və neçə ədəd lazımdır?"
              : "Which product and how many units do you need?",
            missingFields: ["product", "quantity"],
            evidenceToolCallIds: [],
          }),
        ),
        toolCalls: [],
        finishReason: "stop",
      };
    if (!observations.length) {
      const name =
        demo.scenario === "catalog" ? "searchProducts" : "compareQuotes";
      if (!input.tools?.some((t) => t.function.name === name))
        throw new Error("MODEL_TOOLS_INVALID");
      const args =
        demo.scenario === "catalog"
          ? { query: demo.query, locale: az ? "az" : "en" }
          : { caseId: demo.caseId };
      const hash = createHash("sha256")
        .update(JSON.stringify(input.messages))
        .digest("hex")
        .slice(0, 16);
      return {
        content: null,
        finishReason: "tool_calls",
        toolCalls: [
          {
            id: `mock-${name}-${hash}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      };
    }
    const observation = observations.at(-1)!;
    const result = z
      .object({ status: z.string(), data: z.unknown().optional() })
      .parse(JSON.parse(observation.content!));
    if (result.status !== "completed")
      return {
        content: JSON.stringify({
          status: "escalation",
          message: az
            ? "Sorğu üçün insan yoxlaması lazımdır."
            : "The request requires human review.",
          reason: "manual_review",
          evidenceToolCallIds: [
            observation.role === "tool" ? observation.tool_call_id : "",
          ],
        }),
        toolCalls: [],
        finishReason: "stop",
      };
    const noQuote =
      demo.scenario === "quotes" &&
      z.object({ outcome: z.string() }).parse(result.data).outcome ===
        "clarification_or_escalation";
    const outcome = noQuote
      ? {
          status: "escalation",
          message: az
            ? "Uyğun təklif yoxdur; insan yoxlaması lazımdır."
            : "No feasible quotation; human review is needed.",
          reason: "no_feasible_quote",
          evidenceToolCallIds: [
            observation.role === "tool" ? observation.tool_call_id : "",
          ],
        }
      : {
          status: "completion",
          message: `${az ? "Mock rejim — qeydə alınmış nəticə" : "Mock mode — stored result"}: ${JSON.stringify(result.data)}`,
          evidenceToolCallIds: [
            observation.role === "tool" ? observation.tool_call_id : "",
          ],
        };
    return {
      content: JSON.stringify(agentOutcomeSchema.parse(outcome)),
      toolCalls: [],
      finishReason: "stop",
    };
  }
}
