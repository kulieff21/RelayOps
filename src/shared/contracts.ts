import { z } from "zod";

export const localeSchema = z.enum(["en", "az"]);
export type Locale = z.infer<typeof localeSchema>;
export type Role = "customer" | "operator" | "purchaser" | "owner";
export interface Actor {
  id: string;
  roles: Role[];
  locale: Locale;
}
export type ApiResponse<T> =
  { data: T } | { error: { code: string; correlationId: string } };
export const id = z.string().min(1).max(100);
export const key = z.string().min(8).max(100);
export const quantity = z.number().int().positive().max(10000);
export const money = z.number().int().nonnegative().max(100000000);
export const offerInput = z.strictObject({
  productId: id,
  quantity,
  deadline: z.iso.date(),
  destination: z.literal("baku"),
  allowSubstitution: z.boolean(),
  allowPartial: z.boolean(),
});
export const confirmInput = z.strictObject({
  offerId: id,
  version: z.literal(1),
  confirmed: z.literal(true),
  key,
});
export const cancelInput = z.strictObject({
  reason: z.string().min(1).max(1000),
  key,
});
export const returnInput = z.strictObject({
  orderId: id,
  quantity,
  reason: z.string().min(1).max(1000),
  resolution: z.enum(["refund", "exchange"]),
  key,
});
export const inspectInput = z.strictObject({
  outcome: z.enum(["sellable", "damaged", "incomplete", "wrong_item"]),
  notes: z.string().min(1).max(1000),
  key,
});
export const loginInput = z.strictObject({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});
export const transitionInput = z.strictObject({
  status: z.enum(["processing", "shipped", "delivered", "cancelled"]),
  evidence: z.string().min(1).max(1000),
  key,
});
export const toolContracts = {
  searchProducts: {
    roles: ["customer", "operator", "purchaser", "owner"],
    input: z.strictObject({ query: z.string().max(100), locale: localeSchema }),
  },
  getOrder: {
    roles: ["customer", "operator", "purchaser", "owner"],
    input: z.strictObject({ orderId: id }),
  },
  getDeliveryOptions: {
    roles: ["customer"],
    input: z.strictObject({
      productId: id,
      quantity,
      deadline: z.iso.date().optional(),
    }),
  },
  getOrderProgress: {
    roles: ["customer"],
    input: z.strictObject({ orderId: id }),
  },
  prepareOrder: { roles: ["customer"], input: offerInput },
  confirmOrder: { roles: ["customer"], input: confirmInput },
  cancelOrder: {
    roles: ["customer", "operator", "owner"],
    input: cancelInput.extend({ orderId: id }),
  },
  requestReturn: { roles: ["customer"], input: returnInput },
  compareQuotes: {
    roles: ["purchaser", "owner"],
    input: z.strictObject({ caseId: id }),
  },
  getProcurementRequirements: {
    roles: ["purchaser", "owner"],
    input: z.strictObject({ caseId: id }),
  },
  getSupplierQuotes: {
    roles: ["purchaser", "owner"],
    input: z.strictObject({ caseId: id }),
  },
  preparePurchaseProposal: {
    roles: ["purchaser", "owner"],
    input: z.strictObject({
      caseId: id,
      expectedVersion: z.number().int().nonnegative(),
      evidenceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      rationale: z.string().trim().min(1).max(2000),
      revisionReason: z.string().trim().min(1).max(1000).nullable(),
    }),
  },
} as const;
export const toolSchemas = Object.fromEntries(
  Object.entries(toolContracts).map(([name, contract]) => [
    name,
    { roles: contract.roles, input: z.toJSONSchema(contract.input) },
  ]),
);

export class BusinessError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export function requireRole(actor: Actor, ...roles: Role[]) {
  if (!roles.some((role) => actor.roles.includes(role)))
    throw new BusinessError("FORBIDDEN", 403);
}
