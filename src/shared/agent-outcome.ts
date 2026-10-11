import { z } from "zod";

const evidenceIds = z
  .array(z.string().min(1).max(200))
  .max(64)
  .refine((ids) => new Set(ids).size === ids.length);
const missingFields = z
  .array(
    z.enum([
      "product",
      "specification",
      "quantity",
      "deadline",
      "destination",
      "order",
      "offer",
      "reason",
      "resolution",
      "substitution",
      "partial_fulfillment",
      "other",
    ]),
  )
  .min(1)
  .max(12)
  .refine((fields) => new Set(fields).size === fields.length);

// Model-requested terminal outcomes never contain identity, permissions or effects.
export const agentOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("completion"),
    message: z.string().trim().min(1).max(4000),
    evidenceToolCallIds: evidenceIds.min(1),
  }),
  z.strictObject({
    status: z.literal("clarification"),
    question: z.string().trim().min(1).max(2000),
    missingFields,
    evidenceToolCallIds: evidenceIds,
  }),
  z.strictObject({
    status: z.literal("escalation"),
    message: z.string().trim().min(1).max(4000),
    reason: z.enum([
      "unsupported_request",
      "policy_exception",
      "missing_business_data",
      "no_feasible_quote",
      "manual_review",
    ]),
    evidenceToolCallIds: evidenceIds,
  }),
]);
export type RequestedAgentOutcome = z.infer<typeof agentOutcomeSchema>;
export type HandoffQueue = "customer_support" | "procurement_review";
export type AgentOutcome =
  | Exclude<RequestedAgentOutcome, { status: "escalation" }>
  | (Extract<RequestedAgentOutcome, { status: "escalation" }> & {
      handoff: { queue: HandoffQueue; state: "not_created" };
    });

export const agentOutcomeJsonSchema = z.toJSONSchema(agentOutcomeSchema);
