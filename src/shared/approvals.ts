import { z } from "zod";
import { key } from "./contracts.js";
export const approvalSubmit = z.strictObject({
  mode: z.enum(["mock", "live"]),
  expectedVersion: z.number().int().positive(),
  key,
});
export const approvalDecision = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(1000),
  key,
});
export type ApprovalView = {
  id: string;
  proposalId: string;
  version: number;
  status: string;
  effectiveStatus: string;
  mode: "mock" | "live";
  delivery: string;
  expiresAt: string;
  locale: "en" | "az";
  canDecide: boolean;
  decision: { decision: string; reason: string; created_at: string } | null;
};
export type ApprovalState = {
  configured: boolean;
  liveAvailable: boolean;
  recipientAccount: string | null;
  recipientLocale: "en" | "az" | null;
  requests: ApprovalView[];
};
