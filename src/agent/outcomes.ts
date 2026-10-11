import {
  agentOutcomeSchema,
  type AgentOutcome,
  type HandoffQueue,
} from "../shared/agent-outcome.js";
import type { ToolResult } from "./tools.js";

export function resolveAgentOutcome(
  content: string,
  results: readonly ToolResult[],
  queue: HandoffQueue,
):
  | { ok: true; outcome: AgentOutcome }
  | { ok: false; code: "AGENT_OUTCOME_INVALID" | "AGENT_EVIDENCE_INVALID" } {
  let raw: unknown;
  try {
    raw = JSON.parse(content) as unknown;
  } catch {
    return { ok: false, code: "AGENT_OUTCOME_INVALID" };
  }
  const parsed = agentOutcomeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "AGENT_OUTCOME_INVALID" };
  const outcome = parsed.data;
  const records = new Map(results.map((result) => [result.toolCallId, result]));
  const cited = outcome.evidenceToolCallIds.map((id) => records.get(id));
  if (
    cited.some(
      (result) =>
        !result ||
        result.status === "confirmation_required" ||
        (outcome.status === "completion" && result.status !== "completed"),
    )
  )
    return { ok: false, code: "AGENT_EVIDENCE_INVALID" };
  if (
    outcome.status === "escalation" &&
    outcome.reason === "no_feasible_quote"
  ) {
    const latest = [...results]
      .reverse()
      .find(
        (result) =>
          result.status === "completed" && result.name === "compareQuotes",
      );
    if (
      latest?.status !== "completed" ||
      latest.name !== "compareQuotes" ||
      latest.data.outcome !== "clarification_or_escalation" ||
      !outcome.evidenceToolCallIds.includes(latest.toolCallId)
    )
      return { ok: false, code: "AGENT_EVIDENCE_INVALID" };
  }
  return {
    ok: true,
    outcome:
      outcome.status === "escalation"
        ? { ...outcome, handoff: { queue, state: "not_created" } }
        : outcome,
  };
}
