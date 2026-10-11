import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "../db/database.js";
import { digest } from "./auth.js";
import { evaluateQuote, exactTotal, type Requirement } from "./quotes.js";
import { capabilitiesSchema } from "../shared/purchasing.js";
import { procurementRequirements } from "./procurement-requirements.js";
import {
  BusinessError,
  requireRole,
  offerInput,
  confirmInput,
  cancelInput,
  returnInput,
  inspectInput,
  transitionInput,
  type Actor,
  type Locale,
} from "../shared/contracts.js";
import {
  addHours,
  addBusinessDays,
  calendarDays,
  deadlineEnd,
  type Clock,
} from "../shared/time.js";

interface Product {
  id: string;
  specs: string;
  price: number;
  stock: number;
  name_en: string;
  name_az: string;
  description_en: string;
  description_az: string;
  category_id: string;
}
interface Order {
  id: string;
  customer_id: string;
  status: string;
  total: number;
  deadline: string;
  created_at: string;
  delivered_at: string | null;
}
interface Line {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  delivered_quantity: number;
}
interface Summary extends z.infer<typeof offerInput> {
  productSpecs: string;
  unitPrice: number;
  total: number;
  availableAllocation: number;
  shortage: number;
  supportedDelivery: string | null;
  exchangeReturnId?: string;
  exchangeCredit?: number;
}
interface Offer {
  id: string;
  customer_id: string;
  version: number;
  summary: string;
  expires_at: string;
  consumed_order_id: string | null;
}
interface ReturnRow {
  id: string;
  order_line_id: string;
  customer_id: string;
  quantity: number;
  resolution: string;
  status: string;
  outcome: string | null;
  replacement_offer_id: string | null;
}
export class Business {
  constructor(
    readonly store: Store,
    readonly clock: Clock,
    private newId: () => string = randomUUID,
  ) {}
  audit(
    actor: Actor,
    action: string,
    entity: string,
    data: unknown,
    correlation = entity,
  ) {
    this.store.run(
      "INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)",
      this.newId(),
      actor.id,
      action,
      entity,
      correlation,
      JSON.stringify(data),
      this.clock.now(),
    );
  }
  effect<T>(
    actor: Actor,
    operation: string,
    key: string,
    input: unknown,
    execute: () => T,
  ): T {
    const fingerprint = digest(JSON.stringify(input));
    return this.store.transaction(() => {
      const cached = this.store.one<{ fingerprint: string; result: string }>(
        "SELECT fingerprint,result FROM idempotency WHERE actor_id=? AND operation=? AND key=?",
        actor.id,
        operation,
        key,
      );
      if (cached) {
        if (cached.fingerprint !== fingerprint)
          throw new BusinessError("IDEMPOTENCY_CONFLICT");
        return JSON.parse(cached.result) as T;
      }
      const result = execute();
      this.store.run(
        "INSERT INTO idempotency VALUES (?,?,?,?,?)",
        actor.id,
        operation,
        key,
        fingerprint,
        JSON.stringify(result),
      );
      return result;
    });
  }
  product(id: string) {
    const product = this.store.one<Product>(
      "SELECT * FROM products WHERE id=?",
      id,
    );
    if (!product) throw new BusinessError("PRODUCT_NOT_FOUND", 404);
    return product;
  }
  available(productId: string) {
    const product = this.product(productId);
    const reserved = this.store.one<{ quantity: number }>(
      "SELECT COALESCE(SUM(quantity),0) quantity FROM reservations WHERE product_id=? AND status='active' AND expires_at>?",
      productId,
      this.clock.now(),
    )!.quantity;
    return product.stock - reserved;
  }
  search(query: string, locale: Locale = "en") {
    z.string().max(100).parse(query);
    if (!["en", "az"].includes(locale))
      throw new BusinessError("INVALID_LOCALE", 400);
    // Search both translations without allowing wildcard queries to broaden results.
    return this.store
      .all<Product>("SELECT * FROM products ORDER BY id")
      .filter((p) =>
        `${p.id} ${p.name_en} ${p.name_az}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      )
      .map((p) => ({
        id: p.id,
        category: p.category_id,
        name: locale === "az" ? p.name_az : p.name_en,
        description: locale === "az" ? p.description_az : p.description_en,
        specs: JSON.parse(p.specs) as Record<string, unknown>,
        price: p.price,
        currency: "AZN",
        available: this.available(p.id),
        incoming: this.store.one<{ qty: number }>(
          "SELECT COALESCE(SUM(po.quantity-po.received_quantity-po.cancelled_quantity),0) qty FROM purchase_orders po JOIN proposals pp ON pp.id=po.proposal_id JOIN procurement_cases c ON c.id=pp.case_id WHERE c.product_id=? AND po.status IN ('created','acknowledged','partially_received')",
          p.id,
        )!.qty,
      }));
  }
  prepareOrder(actor: Actor, raw: unknown) {
    requireRole(actor, "customer");
    const input = offerInput.parse(raw);
    const deadline = deadlineEnd(input.deadline);
    if (deadline <= this.clock.now())
      throw new BusinessError("DEADLINE_IN_PAST");
    const product = this.product(input.productId);
    const allocation = Math.min(input.quantity, this.available(product.id));
    const supportedDelivery =
      allocation === input.quantity
        ? addBusinessDays(this.clock.now(), 3)
        : null;
    if (supportedDelivery && supportedDelivery > deadline)
      throw new BusinessError("DELIVERY_NOT_FEASIBLE");
    const summary: Summary = {
      ...input,
      productSpecs: product.specs,
      unitPrice: product.price,
      total: exactTotal(product.price, input.quantity, 0, 0),
      availableAllocation: allocation,
      shortage: input.quantity - allocation,
      supportedDelivery,
    };
    const id = this.newId();
    const expiresAt = addHours(this.clock.now(), 0.25);
    this.store.transaction(() => {
      this.store.run(
        "INSERT INTO order_offers VALUES (?,?,?,?,?,NULL)",
        id,
        actor.id,
        1,
        JSON.stringify(summary),
        expiresAt,
      );
      this.audit(actor, "order.offer_prepared", id, summary);
    });
    return {
      id,
      version: 1,
      summary,
      expiresAt,
      supplyPromise: supportedDelivery
        ? "supported"
        : "pending_supplier_confirmation",
    };
  }
  confirmOrder(actor: Actor, raw: unknown) {
    requireRole(actor, "customer");
    const input = confirmInput.parse(raw);
    return this.effect(actor, "order.confirm", input.key, input, () => {
      const offer = this.store.one<Offer>(
        "SELECT * FROM order_offers WHERE id=? AND customer_id=?",
        input.offerId,
        actor.id,
      );
      if (!offer) throw new BusinessError("OFFER_NOT_FOUND", 404);
      if (offer.version !== input.version)
        throw new BusinessError("CONSENT_VERSION_MISMATCH");
      if (offer.consumed_order_id)
        return this.getOrder(actor, offer.consumed_order_id);
      if (offer.expires_at <= this.clock.now())
        throw new BusinessError("CONSENT_EXPIRED");
      const summary = JSON.parse(offer.summary) as Summary;
      if (summary.exchangeReturnId) {
        const returned = this.getReturn(summary.exchangeReturnId);
        if (
          returned.customer_id !== actor.id ||
          returned.status !== "inspected" ||
          returned.replacement_offer_id !== offer.id
        )
          throw new BusinessError("EXCHANGE_CONSENT_STALE");
      }
      const product = this.product(summary.productId);
      const allocation = Math.min(summary.quantity, this.available(product.id));
      if (
        allocation !== summary.availableAllocation ||
        product.price !== summary.unitPrice ||
        product.specs !== summary.productSpecs
      )
        throw new BusinessError("NEW_CONSENT_REQUIRED");
      const id = this.newId();
      const lineId = this.newId();
      const status = summary.shortage > 0 ? "awaiting_supply" : "confirmed";
      const deadline = deadlineEnd(summary.deadline);
      this.store.run(
        "INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)",
        id,
        actor.id,
        status,
        summary.total,
        deadline,
        summary.destination,
        offer.id,
        input.version,
        Number(summary.allowPartial),
        Number(summary.allowSubstitution),
        this.clock.now(),
      );
      this.store.run(
        "INSERT INTO order_lines VALUES (?,?,?,?,?,0)",
        lineId,
        id,
        product.id,
        summary.quantity,
        product.price,
      );
      this.store.run(
        "UPDATE order_offers SET consumed_order_id=? WHERE id=?",
        id,
        offer.id,
      );
      if (allocation > 0)
        this.store.run(
          "INSERT INTO reservations VALUES (?,?,?,?,'active',?)",
          this.newId(),
          id,
          product.id,
          allocation,
          status === "awaiting_supply"
            ? addHours(this.clock.now(), 24)
            : deadline,
        );
      if (summary.shortage > 0) {
        const caseId = this.newId();
        this.store.run(
          "INSERT INTO procurement_cases VALUES (?,?,?,?,?,'open',?)",
          caseId,
          id,
          product.id,
          summary.shortage,
          200000,
          this.clock.now(),
        );
        this.store.run(
          "INSERT INTO processes VALUES (?,?,'ready',?,1,?)",
          this.newId(),
          caseId,
          JSON.stringify({ step: "compare_quotes", consentOffer: offer.id }),
          this.clock.now(),
        );
        this.audit(
          actor,
          "procurement.shortage_created",
          caseId,
          { quantity: summary.shortage, orderId: id },
          id,
        );
      }
      if (summary.supportedDelivery)
        this.store.run(
          "INSERT INTO fulfillment_batches VALUES (?,?,?,?,'planned',NULL)",
          this.newId(),
          lineId,
          summary.quantity,
          summary.supportedDelivery,
        );
      if (summary.exchangeReturnId) {
        this.store.run(
          "UPDATE returns SET status='resolved' WHERE id=?",
          summary.exchangeReturnId,
        );
        this.audit(
          actor,
          "exchange.confirmed",
          summary.exchangeReturnId,
          { replacementOrderId: id, credit: summary.exchangeCredit },
          id,
        );
      }
      this.audit(actor, "order.confirmed", id, {
        consentOffer: offer.id,
        version: input.version,
        status,
        allocation,
        bulk: summary.quantity >= 10,
      });
      return this.getOrder(actor, id);
    });
  }
  getOrder(actor: Actor, id: string) {
    const order = this.store.one<Order>("SELECT * FROM orders WHERE id=?", id);
    const linkedPurchaser =
      actor.roles.includes("purchaser") &&
      !!this.store.one("SELECT id FROM procurement_cases WHERE order_id=?", id);
    if (
      !order ||
      !(
        order.customer_id === actor.id ||
        actor.roles.includes("operator") ||
        actor.roles.includes("owner") ||
        linkedPurchaser
      )
    )
      throw new BusinessError("ORDER_NOT_FOUND", 404);
    return {
      ...order,
      lines: this.store.all<Line>(
        "SELECT * FROM order_lines WHERE order_id=?",
        id,
      ),
    };
  }
  cancelOrder(actor: Actor, orderId: string, raw: unknown) {
    requireRole(actor, "customer", "operator", "owner");
    const input = cancelInput.parse(raw);
    this.getOrder(actor, orderId);
    return this.effect(
      actor,
      "order.cancel",
      input.key,
      { orderId, ...input },
      () => {
        const order = this.getOrder(actor, orderId);
        if (["shipped", "delivered"].includes(order.status))
          throw new BusinessError("ALREADY_DISPATCHED");
        if (order.status === "cancelled") return order;
        const status = ["processing", "cancellation_requested"].includes(
          order.status,
        )
          ? "cancellation_requested"
          : "cancelled";
        this.store.run(
          "UPDATE orders SET status=? WHERE id=?",
          status,
          orderId,
        );
        if (status === "cancelled") this.release(orderId);
        this.audit(actor, "order.cancellation", orderId, {
          status,
          reason: input.reason,
        });
        return this.getOrder(actor, orderId);
      },
    );
  }
  private release(orderId: string) {
    this.store.run(
      "UPDATE reservations SET status='released' WHERE order_id=? AND status='active'",
      orderId,
    );
    this.store.run(
      "UPDATE fulfillment_batches SET status='cancelled' WHERE order_line_id IN (SELECT id FROM order_lines WHERE order_id=?) AND status='planned'",
      orderId,
    );
    this.store.run(
      "UPDATE procurement_cases SET status='closed' WHERE order_id=?",
      orderId,
    );
    // Purchase orders and purchasing commitments deliberately remain recorded.
  }
  transitionOrder(actor: Actor, orderId: string, raw: unknown) {
    requireRole(actor, "operator", "owner");
    const input = transitionInput.parse(raw);
    return this.effect(
      actor,
      "order.transition",
      input.key,
      { orderId, ...input },
      () => {
        const order = this.getOrder(actor, orderId);
        const allowed: Record<string, string[]> = {
          confirmed: ["processing", "cancelled"],
          processing: ["shipped"],
          cancellation_requested: ["processing", "shipped", "cancelled"],
          shipped: ["delivered"],
        };
        if (!allowed[order.status]?.includes(input.status))
          throw new BusinessError("INVALID_ORDER_TRANSITION");
        if (input.status === "processing" || input.status === "shipped") {
          for (const line of order.lines) {
            const reservation = this.store.one<{ quantity: number }>(
              "SELECT quantity FROM reservations WHERE order_id=? AND product_id=? AND status='active' AND expires_at>?",
              orderId,
              line.product_id,
              this.clock.now(),
            );
            if (!reservation || reservation.quantity < line.quantity)
              throw new BusinessError("RESERVATION_REVALIDATION_REQUIRED");
            if (input.status === "shipped") {
              const changed = this.store.run(
                "UPDATE products SET stock=stock-? WHERE id=? AND stock>=?",
                line.quantity,
                line.product_id,
                line.quantity,
              );
              if (changed.changes !== 1)
                throw new BusinessError("STOCK_CONFLICT");
              this.store.run(
                "INSERT INTO inventory_movements VALUES (?,?,?,?,?)",
                this.newId(),
                line.product_id,
                -line.quantity,
                `dispatch:${line.id}`,
                this.clock.now(),
              );
              this.store.run(
                "UPDATE reservations SET status='consumed' WHERE order_id=? AND product_id=?",
                orderId,
                line.product_id,
              );
            }
          }
        }
        if (input.status === "cancelled") this.release(orderId);
        if (input.status === "delivered") {
          this.store.run(
            "UPDATE order_lines SET delivered_quantity=quantity WHERE order_id=?",
            orderId,
          );
          this.store.run(
            "UPDATE orders SET delivered_at=? WHERE id=?",
            this.clock.now(),
            orderId,
          );
        }
        if (["shipped", "delivered"].includes(input.status))
          this.store.run(
            "UPDATE fulfillment_batches SET status=?,evidence=? WHERE order_line_id IN (SELECT id FROM order_lines WHERE order_id=?)",
            input.status,
            input.evidence,
            orderId,
          );
        this.store.run(
          "UPDATE orders SET status=? WHERE id=?",
          input.status,
          orderId,
        );
        this.audit(actor, "order.status_changed", orderId, {
          from: order.status,
          to: input.status,
          evidence: input.evidence,
        });
        return this.getOrder(actor, orderId);
      },
    );
  }
  expireReservations(actor: Actor) {
    requireRole(actor, "operator", "owner");
    return this.store.transaction(() => {
      const expired = this.store.all<{
        id: string;
        order_id: string;
        quantity: number;
      }>(
        "SELECT id,order_id,quantity FROM reservations WHERE status='active' AND expires_at<=?",
        this.clock.now(),
      );
      for (const row of expired) {
        this.store.run(
          "UPDATE reservations SET status='expired' WHERE id=?",
          row.id,
        );
        this.audit(
          actor,
          "stock.reservation_expired",
          row.id,
          { orderId: row.order_id, quantity: row.quantity },
          row.order_id,
        );
      }
      return { expired: expired.length };
    });
  }
  requestReturn(actor: Actor, raw: unknown) {
    requireRole(actor, "customer");
    const input = returnInput.parse(raw);
    return this.effect(actor, "return.request", input.key, input, () => {
      const order = this.getOrder(actor, input.orderId);
      if (order.customer_id !== actor.id)
        throw new BusinessError("FORBIDDEN", 403);
      if (order.status !== "delivered" || !order.delivered_at)
        throw new BusinessError("NOT_DELIVERED");
      const days = calendarDays(order.delivered_at, this.clock.now());
      if (days < 0 || days > 14)
        throw new BusinessError("OWNER_EXCEPTION_REQUIRED");
      const line = order.lines[0]!;
      const returned = this.store.one<{ qty: number }>(
        "SELECT COALESCE(SUM(quantity),0) qty FROM returns WHERE order_line_id=? AND (status!='rejected' OR outcome IS NOT NULL)",
        line.id,
      )!.qty;
      if (input.quantity > line.delivered_quantity - returned)
        throw new BusinessError("RETURN_QUANTITY_EXCEEDED");
      const id = this.newId();
      this.store.run(
        "INSERT INTO returns VALUES (?,?,?,?,?,?, 'requested',NULL,NULL,NULL,NULL,?)",
        id,
        line.id,
        actor.id,
        input.quantity,
        input.reason,
        input.resolution,
        this.clock.now(),
      );
      this.audit(actor, "return.requested", id, { ...input }, input.orderId);
      return { id, status: "requested" };
    });
  }
  private getReturn(id: string) {
    const row = this.store.one<ReturnRow>(
      "SELECT * FROM returns WHERE id=?",
      id,
    );
    if (!row) throw new BusinessError("RETURN_NOT_FOUND", 404);
    return row;
  }
  transitionReturn(actor: Actor, returnId: string, raw: unknown) {
    requireRole(actor, "operator", "owner");
    const input = z
      .strictObject({
        status: z.enum(["authorized", "received", "rejected"]),
        notes: z.string().min(1).max(1000),
        key: z.string().min(8).max(100),
      })
      .parse(raw);
    return this.effect(
      actor,
      "return.transition",
      input.key,
      { returnId, ...input },
      () => {
        const row = this.getReturn(returnId);
        const allowed: Record<string, string[]> = {
          requested: ["authorized", "rejected"],
          authorized: ["received", "rejected"],
        };
        if (!allowed[row.status]?.includes(input.status))
          throw new BusinessError("INVALID_RETURN_TRANSITION");
        this.store.run(
          "UPDATE returns SET status=? WHERE id=?",
          input.status,
          returnId,
        );
        this.audit(actor, "return.status_changed", returnId, input);
        return this.getReturn(returnId);
      },
    );
  }
  inspectReturn(actor: Actor, returnId: string, raw: unknown) {
    requireRole(actor, "operator", "owner");
    const input = inspectInput.parse(raw);
    return this.effect(
      actor,
      "return.inspect",
      input.key,
      { returnId, ...input },
      () => {
        const row = this.getReturn(returnId);
        if (row.status !== "received")
          throw new BusinessError("INVALID_RETURN_TRANSITION");
        const line = this.store.one<Line>(
          "SELECT * FROM order_lines WHERE id=?",
          row.order_line_id,
        )!;
        const sellable = input.outcome === "sellable";
        this.store.run(
          "UPDATE returns SET status=?,outcome=?,inspection_notes=? WHERE id=?",
          sellable ? "inspected" : "rejected",
          input.outcome,
          input.notes,
          returnId,
        );
        if (sellable) {
          this.store.run(
            "UPDATE products SET stock=stock+? WHERE id=?",
            row.quantity,
            line.product_id,
          );
          this.store.run(
            "INSERT INTO inventory_movements VALUES (?,?,?,?,?)",
            this.newId(),
            line.product_id,
            row.quantity,
            `return:${returnId}`,
            this.clock.now(),
          );
        } else
          this.store.run(
            "INSERT INTO quarantine VALUES (?,?,?,?,?)",
            this.newId(),
            returnId,
            row.quantity,
            input.outcome,
            input.notes,
          );
        this.audit(actor, "return.inspected", returnId, {
          ...input,
          restocked: sellable ? row.quantity : 0,
        });
        return this.getReturn(returnId);
      },
    );
  }
  resolveReturn(actor: Actor, returnId: string, raw: unknown) {
    requireRole(actor, "operator", "owner");
    const input = z
      .strictObject({ key: z.string().min(8).max(100) })
      .parse(raw);
    return this.effect(
      actor,
      "return.resolve",
      input.key,
      { returnId, ...input },
      () => {
        const row = this.getReturn(returnId);
        if (row.status === "resolved") return row;
        if (row.status !== "inspected" || row.outcome !== "sellable")
          throw new BusinessError("RETURN_NOT_SELLABLE");
        const line = this.store.one<Line>(
          "SELECT * FROM order_lines WHERE id=?",
          row.order_line_id,
        )!;
        if (row.resolution === "refund") {
          this.store.run(
            "INSERT INTO refund_ledger VALUES (?,?,?)",
            returnId,
            row.quantity * line.unit_price,
            this.clock.now(),
          );
        } else {
          // A replacement offer must be confirmed by the customer separately.
          if (!row.replacement_offer_id)
            throw new BusinessError("REPLACEMENT_CONSENT_REQUIRED");
          const replacement = this.store.one<Offer>(
            "SELECT * FROM order_offers WHERE id=?",
            row.replacement_offer_id,
          );
          if (!replacement?.consumed_order_id)
            throw new BusinessError("REPLACEMENT_CONSENT_REQUIRED");
        }
        this.store.run(
          "UPDATE returns SET status='resolved' WHERE id=?",
          returnId,
        );
        this.audit(actor, "return.resolved", returnId, {
          resolution: row.resolution,
        });
        return this.getReturn(returnId);
      },
    );
  }
  prepareExchange(actor: Actor, returnId: string, raw: unknown) {
    requireRole(actor, "customer");
    const input = z.strictObject({ deadline: z.iso.date() }).parse(raw);
    const row = this.getReturn(returnId);
    if (row.customer_id !== actor.id)
      throw new BusinessError("RETURN_NOT_FOUND", 404);
    if (row.status !== "inspected" || row.resolution !== "exchange")
      throw new BusinessError("EXCHANGE_NOT_READY");
    const line = this.store.one<Line>(
      "SELECT * FROM order_lines WHERE id=?",
      row.order_line_id,
    )!;
    // The exchange credit offsets the original item price; there is no new cash payment.
    if (this.product(line.product_id).price !== line.unit_price)
      throw new BusinessError("EXCHANGE_PRICE_REVIEW_REQUIRED");
    const offer = this.prepareOrder(actor, {
      productId: line.product_id,
      quantity: row.quantity,
      deadline: input.deadline,
      destination: "baku",
      allowPartial: false,
      allowSubstitution: false,
    });
    const summary = {
      ...offer.summary,
      total: 0,
      exchangeCredit: line.unit_price * row.quantity,
      exchangeReturnId: returnId,
    };
    this.store.transaction(() => {
      this.store.run(
        "UPDATE order_offers SET summary=? WHERE id=?",
        JSON.stringify(summary),
        offer.id,
      );
      this.store.run(
        "UPDATE returns SET replacement_offer_id=? WHERE id=?",
        offer.id,
        returnId,
      );
      this.audit(actor, "exchange.offer_linked", returnId, {
        offerId: offer.id,
      });
    });
    return {
      ...offer,
      summary,
      settlement: "sandbox_exchange_credit",
      credit: line.unit_price * row.quantity,
    };
  }
  compareQuotes(actor: Actor, caseId: string, excludeAllocation?: string) {
    requireRole(actor, "purchaser", "owner");
    const row = this.store.one<{
      product_id: string;
      quantity: number;
      budget: number;
      order_id: string;
      status: string;
    }>("SELECT * FROM procurement_cases WHERE id=?", caseId);
    if (!row) throw new BusinessError("CASE_NOT_FOUND", 404);
    if (row.status === "closed") throw new BusinessError("CASE_CLOSED");
    const product = this.product(row.product_id);
    const requirements = procurementRequirements(
      this,
      actor,
      caseId,
      excludeAllocation,
    );
    const req: Requirement = {
      productId: product.id,
      specs: JSON.stringify(requirements.specs ?? {}),
      quantity: Math.max(1, requirements.requiredQuantity),
      budget: requirements.budget.remaining,
      deadline: requirements.deadline,
      destination: requirements.destination,
    };
    const options = this.store
      .all<{ id: string; supplier_id: string }>(
        "SELECT * FROM quotes WHERE product_id=? AND version=(SELECT MAX(q2.version) FROM quotes q2 WHERE q2.supplier_id=quotes.supplier_id AND q2.product_id=quotes.product_id)",
        product.id,
      )
      .map((quote) => {
        const option = evaluateQuote(quote, req, this.clock.now());
        option.reasons.push(...requirements.blockers);
        if (requirements.blockers.length) option.feasible = false;
        const supplier = this.store.one<{ capabilities: string }>(
          "SELECT capabilities FROM suppliers WHERE id=?",
          quote.supplier_id,
        )!;
        const caps = capabilitiesSchema.safeParse(
          JSON.parse(supplier.capabilities),
        );
        if (
          !caps.success ||
          !caps.data.categories.some(
            (category) => category === product.category_id,
          ) ||
          caps.data.zone !== req.destination
        ) {
          option.feasible = false;
          option.reasons.push("SUPPLIER_CAPABILITY_MISMATCH");
        }
        return option;
      });
    const feasible = options
      .filter((option) => option.feasible)
      .sort(
        (a, b) =>
          a.total! - b.total! ||
          a.customerDelivery!.localeCompare(b.customerDelivery!) ||
          a.supplier.localeCompare(b.supplier),
      );
    return {
      caseId,
      requirements,
      options,
      selectedQuoteId: feasible[0]?.id ?? null,
      outcome: feasible.length ? "feasible" : "clarification_or_escalation",
    };
  }
}
