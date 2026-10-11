import { Business } from "./business.js";
import { BusinessError, requireRole, type Actor } from "../shared/contracts.js";
import { addBusinessDays, deadlineEnd } from "../shared/time.js";

export class CustomerEvidence {
  constructor(private business: Business) {}
  delivery(productId: string, quantity: number, deadline?: string) {
    const business = this.business;
    const product = business.product(productId);
    const available = business.available(productId);
    const earliest = addBusinessDays(business.clock.now(), 3);
    const full = available >= quantity;
    const meetsDeadline = deadline ? earliest <= deadlineEnd(deadline) : null;
    return {
      productId: product.id,
      quantity,
      available,
      allocation: Math.min(quantity, available),
      shortage: Math.max(0, quantity - available),
      destination: "baku" as const,
      businessClock: business.clock.now(),
      requestedDeadline: deadline ?? null,
      supportedDelivery: full && meetsDeadline !== false ? earliest : null,
      meetsDeadline: full ? meetsDeadline : null,
      supplyStatus: full
        ? ("local_stock" as const)
        : ("supplier_confirmation_required" as const),
      reservationCreated: false,
    };
  }
  order(actor: Actor, orderId: string) {
    requireRole(actor, "customer");
    // Keep customer scope even for multi-role accounts and human confirmations.
    const customer = { ...actor, roles: ["customer" as const] };
    const order = this.business.getOrder(customer, orderId);
    if (order.customer_id !== actor.id)
      throw new BusinessError("ORDER_NOT_FOUND", 404);
    const store = this.business.store;
    return {
      order,
      cases: store.all<{
        id: string;
        product_id: string;
        quantity: number;
        status: string;
      }>(
        "SELECT id,product_id,quantity,status FROM procurement_cases WHERE order_id=? ORDER BY created_at,id",
        orderId,
      ),
      fulfillment: store.all<{
        quantity: number;
        promised_at: string;
        status: string;
      }>(
        "SELECT b.quantity,b.promised_at,b.status FROM fulfillment_batches b JOIN order_lines l ON l.id=b.order_line_id WHERE l.order_id=? ORDER BY b.promised_at,b.id",
        orderId,
      ),
      businessClock: this.business.clock.now(),
    };
  }
}
