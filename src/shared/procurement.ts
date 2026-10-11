import { z } from "zod";
import { key, localeSchema } from "./contracts.js";
import type { procurementRequirements } from "../domain/procurement-requirements.js";
import type { Business } from "../domain/business.js";
import type { QuoteRecord, Supplier } from "./purchasing.js";

export const proposalInput = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  evidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  rationale: z.string().trim().min(1).max(2000),
  revisionReason: z.string().trim().min(1).max(1000).nullable(),
});
export const procurementRequest = z.strictObject({
  mode: z.enum(["mock", "live"]),
  locale: localeSchema,
  key,
  expectedVersion: z.number().int().nonnegative(),
  revisionReason: z.string().trim().min(1).max(1000).nullable(),
});
export type ProcurementRequest = z.infer<typeof procurementRequest>;
export type Requirements = ReturnType<typeof procurementRequirements>;
export type Comparison = ReturnType<Business["compareQuotes"]>;
export type ProcurementEvidence = {
  requirements: Requirements;
  quotations: QuoteRecord[];
  suppliers: Supplier[];
  comparison: Comparison;
  fingerprint: string;
  latestVersion: number;
};
export type ProposalSnapshot = {
  schemaVersion: 1;
  evidence: ProcurementEvidence;
  selectedQuoteId: string;
  explanation: Record<"en" | "az", string>;
  modelNote: { locale: "en" | "az"; text: string };
  revisionReason: string | null;
  previousProposalId: string | null;
  humanDecisionRequired: true;
  purchasingExecuted: false;
};
export type ProposalDetail = {
  id: string;
  caseId: string;
  version: number;
  status: string;
  effectiveStatus: string;
  invalidationReasons: string[];
  expiresAt: string;
  quantity: number;
  total: number;
  snapshot: ProposalSnapshot;
};
export type ProcurementTurn = {
  runId: string;
  mode: "mock" | "live";
  status: string;
  outcome: { status: string; message: string; errorCode?: string } | null;
  proposal: ProposalDetail | null;
  needsResume: boolean;
};
