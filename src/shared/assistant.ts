import { z } from "zod";
import { id, key, localeSchema, toolContracts } from "./contracts.js";
import type { ToolResult } from "../agent/tools.js";
import type { Business } from "../domain/business.js";
import type { CustomerEvidence } from "../domain/customer-evidence.js";

export const guidedAction = z.discriminatedUnion("name", [
  z.strictObject({
    name: z.literal("searchProducts"),
    input: toolContracts.searchProducts.input,
  }),
  z.strictObject({
    name: z.literal("getDeliveryOptions"),
    input: toolContracts.getDeliveryOptions.input,
  }),
  z.strictObject({
    name: z.literal("getOrderProgress"),
    input: toolContracts.getOrderProgress.input,
  }),
  z.strictObject({
    name: z.literal("prepareOrder"),
    input: toolContracts.prepareOrder.input,
  }),
  z.strictObject({
    name: z.literal("cancelOrder"),
    input: toolContracts.cancelOrder.input,
  }),
  z.strictObject({
    name: z.literal("requestReturn"),
    input: toolContracts.requestReturn.input,
  }),
]);
export type GuidedAction = z.infer<typeof guidedAction>;
export const assistantRequest = z.strictObject({
  key,
  conversationId: id.optional(),
  locale: localeSchema,
  mode: z.enum(["mock", "live"]).default("mock"),
  userText: z.string().trim().min(1).max(4000),
  action: guidedAction.optional(),
});
export type AssistantRequest = z.input<typeof assistantRequest>;
export type AssistantEvidence = Extract<ToolResult, { status: "completed" }>;
type Pending = Extract<ToolResult, { status: "confirmation_required" }>;
export type ConfirmationView = Pending & {
  state: "pending" | "confirmed" | "declined";
  expiresAt: string;
  snapshot: {
    offer?: ReturnType<Business["prepareOrder"]>;
    progress?: ReturnType<CustomerEvidence["order"]>;
  };
  result?: {
    orderId?: string;
    returnId?: string;
    status: string;
    progress?: ReturnType<CustomerEvidence["order"]>;
  };
};
export type HandoffView = {
  id: string;
  queue: "customer_support" | "procurement_review";
  reason: string;
  caseId: string | null;
  status: string;
  createdAt: string;
};
export type AssistantTurn = {
  runId: string;
  userText: string;
  mode: "mock" | "live";
  status:
    | "running"
    | "interrupted"
    | "completion"
    | "clarification"
    | "escalation"
    | "confirmation_required"
    | "stopped";
  phase: string;
  canResume: boolean;
  outcome?: {
    message?: string;
    question?: string;
    missingFields?: string[];
    code?: string;
  };
  tools: { id: string; name: string; status: string; code?: string }[];
  evidence: AssistantEvidence[];
  confirmation?: ConfirmationView;
  handoffs: HandoffView[];
};
export type ConversationSummary = {
  id: string;
  locale: "en" | "az";
  updatedAt: string;
  lastText: string;
};
export type AssistantConversation = { id: string; turns: AssistantTurn[] };
export type AssistantSettings = {
  defaultMode: "mock";
  liveAvailable: boolean;
  businessClock: string;
};
