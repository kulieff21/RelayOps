import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  money,
  quantity,
  BusinessError,
  requireRole,
  type Actor,
} from "../shared/contracts.js";
import { addBusinessDays } from "../shared/time.js";

export function exactTotal(
  unitPrice: number,
  count: number,
  delivery: number,
  other: number,
) {
  money.parse(unitPrice);
  quantity.parse(count);
  money.parse(delivery);
  money.parse(other);
  const total = unitPrice * count + delivery + other;
  if (!Number.isSafeInteger(total)) throw new BusinessError("AMOUNT_OVERFLOW");
  return total;
}
export const quoteSchema = z.strictObject({
  id: z.string(),
  supplier_id: z.string(),
  product_id: z.string(),
  version: quantity,
  available: z.number().int().nonnegative(),
  moq: quantity,
  unit_price: money,
  currency: z.literal("AZN"),
  delivery_fee: money,
  other_fees: money,
  valid_until: z.iso.datetime(),
  receipt_at: z.iso.datetime(),
  destination: z.string(),
  availability_at: z.iso.datetime(),
  specs: z.string().refine((value) => {
    try {
      return (
        typeof JSON.parse(value) === "object" && JSON.parse(value) !== null
      );
    } catch {
      return false;
    }
  }),
  terms: z.string().min(1),
  evidence: z.string().min(1),
});
export type Quote = z.infer<typeof quoteSchema>;
export interface Requirement {
  productId: string;
  specs: string;
  quantity: number;
  deadline: string;
  budget: number;
  destination: string;
}
export function evaluateQuote(raw: unknown, req: Requirement, now: string) {
  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success)
    return {
      id:
        typeof raw === "object" && raw !== null && "id" in raw
          ? String(raw.id)
          : "unknown",
      feasible: false,
      reasons: ["INCOMPLETE_OR_UNSUPPORTED_QUOTE"],
      total: null,
      customerDelivery: null,
      quantity: null,
      excess: null,
      supplier: "",
    };
  const quote = parsed.data;
  const count = Math.max(req.quantity, quote.moq);
  const total = exactTotal(
    quote.unit_price,
    count,
    quote.delivery_fee,
    quote.other_fees,
  );
  const customerDelivery = addBusinessDays(quote.receipt_at, 3);
  const reasons: string[] = [];
  if (
    quote.product_id !== req.productId ||
    !isDeepStrictEqual(JSON.parse(quote.specs), JSON.parse(req.specs))
  )
    reasons.push("SPEC_MISMATCH");
  if (quote.destination !== req.destination)
    reasons.push("DESTINATION_MISMATCH");
  if (Date.parse(quote.valid_until) <= Date.parse(now))
    reasons.push("QUOTE_EXPIRED");
  if (
    Date.parse(quote.availability_at) > Date.parse(now) ||
    Date.parse(quote.receipt_at) <= Date.parse(now)
  )
    reasons.push("INVALID_PROMISE");
  if (quote.available < count) reasons.push("INSUFFICIENT_SUPPLIER_STOCK");
  if (total > req.budget) reasons.push("OVER_BUDGET");
  if (Date.parse(customerDelivery) > Date.parse(req.deadline))
    reasons.push("MISSES_DEADLINE");
  return {
    id: quote.id,
    supplier: quote.supplier_id,
    feasible: reasons.length === 0,
    reasons,
    total,
    customerDelivery,
    quantity: count,
    excess: count - req.quantity,
  };
}
export function checkApprovalPolicy(
  actor: Actor,
  total: number,
  budget: number,
  allocated = 0,
) {
  money.parse(total);
  money.parse(budget);
  money.parse(allocated);
  requireRole(actor, "purchaser", "owner");
  if (total > 100000 && !actor.roles.includes("owner"))
    throw new BusinessError("OWNER_REQUIRED", 403);
  if (total + allocated > budget) throw new BusinessError("OVER_BUDGET");
  return { permitted: true, requiresHumanDecision: true };
}
