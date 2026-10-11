import { z } from "zod";
import type { Business } from "./business.js";
import { Operations } from "./operations.js";
import { BusinessError, offerInput, type Actor } from "../shared/contracts.js";
import { specsSchema } from "../shared/purchasing.js";
import { deadlineEnd } from "../shared/time.js";

// Accepted consent, rather than a mutable catalogue or model-supplied quantity,
// is the source of the specification and remaining demand.
export function procurementRequirements(
  business: Business,
  actor: Actor,
  caseId: string,
) {
  const detail = new Operations(business).detail(actor, caseId);
  const { case: row, order, inventory, budget, reservations } = detail;
  const summary = JSON.parse(
    business.store.one<{ summary: string }>(
      "SELECT summary FROM order_offers WHERE id=?",
      order.consent_offer_id,
    )!.summary,
  ) as unknown;
  const accepted = offerInput
    .extend({ productSpecs: z.string() })
    .strip()
    .safeParse(summary);
  let rawSpecs: unknown = null;
  try {
    if (accepted.success) rawSpecs = JSON.parse(accepted.data.productSpecs);
  } catch {
    /* Missing specifications require clarification. */
  }
  const specs = specsSchema.safeParse(rawSpecs);
  const blockers: string[] = [];
  if (row.status === "closed") throw new BusinessError("CASE_CLOSED");
  if (
    !accepted.success ||
    !specs?.success ||
    accepted.data.productId !== row.product_id ||
    accepted.data.quantity !== order.quantity ||
    deadlineEnd(accepted.data.deadline) !== order.deadline ||
    accepted.data.destination !== order.destination ||
    accepted.data.allowPartial !== !!order.allow_partial ||
    accepted.data.allowSubstitution !== !!order.allow_substitution
  )
    blockers.push("ACCEPTED_REQUIREMENTS_INCOMPLETE");
  if (!["awaiting_supply", "confirmed"].includes(order.status))
    blockers.push("ORDER_NOT_AWAITING_PROCUREMENT");
  if (
    row.status === "committed" ||
    budget.reserved > 0 ||
    budget.committed > 0 ||
    business.store.one(
      "SELECT po.id FROM purchase_orders po JOIN proposals p ON p.id=po.proposal_id WHERE p.case_id=? AND po.status NOT IN ('cancelled','failed')",
      caseId,
    )
  )
    blockers.push("PURCHASING_ALREADY_COMMITTED");
  const requiredQuantity = Math.max(
    0,
    order.quantity - order.delivered_quantity - inventory.reservedForOrder,
  );
  if (!requiredQuantity) blockers.push("NO_REMAINING_DEMAND");
  if (budget.remaining < 0) blockers.push("OVER_BUDGET");
  if (Date.parse(order.deadline) <= Date.parse(detail.businessClock))
    blockers.push("DEADLINE_ELAPSED");
  return {
    caseId,
    orderId: order.id,
    productId: row.product_id,
    caseStatus: row.status,
    orderStatus: order.status,
    consentOfferId: order.consent_offer_id,
    consentVersion: order.consent_version,
    specs: specs?.success ? specs.data : null,
    acceptedQuantity: order.quantity,
    originalShortage: row.quantity,
    deliveredQuantity: order.delivered_quantity,
    requiredQuantity,
    deadline: order.deadline,
    destination: order.destination,
    allowPartial: !!order.allow_partial,
    allowSubstitution: !!order.allow_substitution,
    inventory,
    reservations,
    budget: { limit: row.budget, ...budget },
    blockers,
    // Unreserved physical stock is visible evidence, never silently allocated here.
    reservationRevalidationRequired: reservations.some(
      (r) => r.effectiveStatus === "expired",
    ),
  };
}
