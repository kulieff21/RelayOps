import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Business } from "./business.js";
import { Procurement } from "./procurement.js";
import { notifyOrder } from "./notifications.js";
import {
  BusinessError,
  requireRole,
  key,
  offerInput,
  type Actor,
} from "../shared/contracts.js";
import { addBusinessDays, deadlineEnd } from "../shared/time.js";
import {
  receiptInput,
  receiptInspectionInput,
  supplierEventInput,
  type OrderProgress,
} from "../shared/fulfillment.js";

interface Purchase {
  id: string;
  proposal_id: string;
  quantity: number;
  received_quantity: number;
  cancelled_quantity: number;
  status: string;
  case_id: string;
  product_id: string;
  order_id: string;
  unit_price: number;
  total: number;
  quote_specs: string;
  receipt_at: string;
}
interface Receipt {
  id: string;
  purchase_order_id: string;
  quantity: number;
  inspection: string;
  created_at: string;
}

// All effects, immutable evidence and retry results commit under the same write lock.
export class Fulfillment {
  constructor(readonly business: Business) {}
  private purchase(id: string): Purchase {
    const row = this.business.store.one<Purchase>(
      `SELECT po.*,p.case_id,p.total,c.product_id,c.order_id,q.unit_price,q.specs quote_specs,q.receipt_at
       FROM purchase_orders po JOIN proposals p ON p.id=po.proposal_id JOIN procurement_cases c ON c.id=p.case_id
       JOIN quotes q ON q.id=p.quote_id WHERE po.id=?`,
      id,
    );
    if (!row) throw new BusinessError("PURCHASE_NOT_FOUND", 404);
    return row;
  }
  receive(actor: Actor, purchaseId: string, raw: unknown) {
    requireRole(actor, "operator", "owner");
    const input = receiptInput.parse(raw);
    return this.business.effect(
      actor,
      "goods.receive",
      input.key,
      { purchaseId, ...input },
      () => {
        const po = this.purchase(purchaseId),
          store = this.business.store;
        if (
          store.one(
            "SELECT id FROM goods_receipts WHERE idempotency_key=?",
            input.key,
          )
        )
          throw new BusinessError("IDEMPOTENCY_CONFLICT");
        if (!["acknowledged", "partially_received"].includes(po.status))
          throw new BusinessError("PURCHASE_NOT_RECEIVABLE");
        if (
          input.quantity >
          po.quantity - po.received_quantity - po.cancelled_quantity
        )
          throw new BusinessError("RECEIPT_QUANTITY_EXCEEDED");
        if (
          input.serials.length &&
          (input.serials.length !== input.quantity ||
            new Set(input.serials).size !== input.serials.length)
        )
          throw new BusinessError("RECEIPT_SERIALS_INVALID", 400);
        for (const serial of input.serials)
          if (
            store.one(
              "SELECT receipt_id FROM receipt_serials WHERE product_id=? AND serial=?",
              po.product_id,
              serial,
            )
          )
            throw new BusinessError("RECEIPT_SERIAL_DUPLICATE");
        const id = randomUUID(),
          now = this.business.clock.now();
        store.run(
          "INSERT INTO goods_receipts VALUES (?,?,?,'pending',?,NULL,?,?)",
          id,
          purchaseId,
          input.quantity,
          JSON.stringify(input.serials),
          input.key,
          now,
        );
        for (const serial of input.serials)
          store.run(
            "INSERT INTO receipt_serials VALUES (?,?,?)",
            po.product_id,
            serial,
            id,
          );
        store.run(
          "UPDATE purchase_orders SET received_quantity=received_quantity+?,status=? WHERE id=?",
          input.quantity,
          po.received_quantity + po.cancelled_quantity + input.quantity ===
            po.quantity
            ? "received"
            : "partially_received",
          purchaseId,
        );
        this.business.audit(
          actor,
          "goods.received",
          id,
          {
            purchaseId,
            quantity: input.quantity,
            evidence: input.evidence,
            mode: "mock",
            inspection: "pending",
          },
          po.case_id,
        );
        this.checkpoint(po, "waiting_supply", "receipt_inspection_required");
        notifyOrder(this.business, po.order_id, "nGoodsReceived", {
          quantity: input.quantity,
        });
        return {
          id,
          purchaseOrderId: purchaseId,
          quantity: input.quantity,
          inspection: "pending",
        };
      },
    );
  }
  inspect(actor: Actor, receiptId: string, raw: unknown) {
    requireRole(actor, "operator", "owner");
    const input = receiptInspectionInput.parse(raw);
    return this.business.effect(
      actor,
      "goods.inspect",
      input.key,
      { receiptId, ...input },
      () => {
        const store = this.business.store,
          receipt = store.one<Receipt>(
            "SELECT * FROM goods_receipts WHERE id=?",
            receiptId,
          );
        if (!receipt) throw new BusinessError("RECEIPT_NOT_FOUND", 404);
        if (
          receipt.inspection !== "pending" ||
          store.one(
            "SELECT receipt_id FROM receipt_inspections WHERE receipt_id=?",
            receiptId,
          )
        )
          throw new BusinessError("INSPECTION_ALREADY_RECORDED");
        const po = this.purchase(receipt.purchase_order_id),
          now = this.business.clock.now();
        store.run(
          "INSERT INTO receipt_inspections VALUES (?,?,?,?,?)",
          receiptId,
          actor.id,
          input.outcome,
          input.notes,
          now,
        );
        store.run(
          "UPDATE goods_receipts SET inspection=? WHERE id=?",
          input.outcome,
          receiptId,
        );
        if (input.outcome === "sellable") {
          store.run(
            "INSERT INTO inventory_movements VALUES (?,?,?,?,?)",
            randomUUID(),
            po.product_id,
            receipt.quantity,
            `receipt:${receiptId}`,
            now,
          );
          store.run(
            "UPDATE products SET stock=stock+? WHERE id=?",
            receipt.quantity,
            po.product_id,
          );
        }
        this.business.audit(
          actor,
          "goods.inspected",
          receiptId,
          {
            outcome: input.outcome,
            notes: input.notes,
            restocked: input.outcome === "sellable" ? receipt.quantity : 0,
          },
          po.case_id,
        );
        const allocated =
          input.outcome === "sellable" ? this.allocate(actor, po, receipt) : 0;
        if (input.outcome !== "sellable")
          this.review(actor, po, "GOODS_NOT_SELLABLE");
        return { id: receiptId, inspection: input.outcome, allocated };
      },
    );
  }
  private allocate(actor: Actor, po: Purchase, receipt: Receipt): number {
    const { business } = this,
      store = business.store,
      now = business.clock.now();
    const order = business.getOrder(actor, po.order_id);
    if (!["awaiting_supply", "confirmed"].includes(order.status)) return 0;
    const acceptedRaw = store.one<{ summary: string; version: number }>(
      "SELECT summary,version FROM order_offers WHERE id=?",
      store.one<{ consent_offer_id: string }>(
        "SELECT consent_offer_id FROM orders WHERE id=?",
        po.order_id,
      )!.consent_offer_id,
    )!;
    const parsed = offerInput
      .extend({
        productSpecs: z.string(),
        total: z.number().int(),
        supportedDelivery: z.iso.datetime().nullable(),
      })
      .strip()
      .safeParse(JSON.parse(acceptedRaw.summary));
    const line = order.lines.find((l) => l.product_id === po.product_id)!;
    const flags = store.one<{
      consent_version: number;
      allow_partial: number;
      allow_substitution: number;
      destination: string;
    }>(
      "SELECT consent_version,allow_partial,allow_substitution,destination FROM orders WHERE id=?",
      order.id,
    )!;
    let specificationsMatch = false;
    try {
      specificationsMatch =
        parsed.success &&
        isDeepStrictEqual(
          JSON.parse(parsed.data.productSpecs),
          JSON.parse(po.quote_specs),
        );
    } catch {
      /* Invalid accepted specifications require review, never an invented match. */
    }
    if (
      !parsed.success ||
      parsed.data.productId !== po.product_id ||
      parsed.data.quantity !== line.quantity ||
      parsed.data.total !== order.total ||
      !specificationsMatch ||
      parsed.data.allowPartial !== !!flags.allow_partial ||
      parsed.data.allowSubstitution !== !!flags.allow_substitution ||
      parsed.data.destination !== flags.destination ||
      acceptedRaw.version !== flags.consent_version ||
      deadlineEnd(parsed.data.deadline) !== order.deadline
    ) {
      this.review(actor, po, "FULFILLMENT_CONSENT_STALE");
      return 0;
    }
    // Actual inspection is observed; only the remaining two-business-day handling is estimated.
    const deliveryAt = addBusinessDays(now, 2);
    if (
      deliveryAt > order.deadline ||
      (parsed.data.supportedDelivery &&
        deliveryAt > parsed.data.supportedDelivery)
    ) {
      this.review(actor, po, "FULFILLMENT_DEADLINE_REVIEW");
      return 0;
    }
    const reservation = store.one<{
      id: string;
      quantity: number;
      status: string;
      expires_at: string;
    }>(
      "SELECT * FROM reservations WHERE order_id=? AND product_id=?",
      order.id,
      po.product_id,
    );
    const held =
      reservation?.status === "active" && reservation.expires_at > now
        ? reservation.quantity
        : 0;
    const required = Math.max(
      0,
      line.quantity - line.delivered_quantity - held,
    );
    if (!required && order.status === "confirmed") return 0;
    const added = Math.min(
      required,
      Math.max(0, business.available(po.product_id)),
    );
    if (added) {
      store.run(
        `INSERT INTO reservations VALUES (?,?,?,?,'active',?) ON CONFLICT(order_id,product_id)
        DO UPDATE SET quantity=excluded.quantity,status='active',expires_at=excluded.expires_at`,
        reservation?.id ?? randomUUID(),
        order.id,
        po.product_id,
        held + added,
        order.deadline,
      );
      const receiptAllocated = Math.min(receipt.quantity, added);
      store.run(
        "INSERT INTO receipt_allocations VALUES (?,?,?,?)",
        receipt.id,
        line.id,
        receiptAllocated,
        now,
      );
      business.audit(
        actor,
        "stock.allocated",
        receipt.id,
        {
          orderId: order.id,
          quantity: added,
          receiptQuantity: receiptAllocated,
          reacquiredLocalStock: added - receiptAllocated,
        },
        po.case_id,
      );
      notifyOrder(business, order.id, "nStockAllocated", { quantity: added });
    }
    if (held + added >= line.quantity - line.delivered_quantity) {
      // A partial-fulfillment flag alone is not consent to new batch quantities/dates.
      // Keep one whole-order batch until every accepted unit is reserved.
      const planned = store.one<{
        id: string;
        quantity: number;
        promised_at: string;
      }>(
        "SELECT id,quantity,promised_at FROM fulfillment_batches WHERE order_line_id=? AND status='planned'",
        line.id,
      );
      if (!planned)
        store.run(
          "INSERT INTO fulfillment_batches VALUES (?,?,?,?,'planned',?)",
          randomUUID(),
          line.id,
          line.quantity - line.delivered_quantity,
          deliveryAt,
          `inspected:${receipt.id}`,
        );
      else if (deliveryAt > planned.promised_at) {
        this.review(actor, po, "FULFILLMENT_DEADLINE_REVIEW");
        return Math.min(receipt.quantity, added);
      }
      store.run(
        "UPDATE orders SET status='confirmed' WHERE id=? AND status='awaiting_supply'",
        order.id,
      );
      store.run(
        "UPDATE procurement_cases SET status='closed' WHERE id=?",
        po.case_id,
      );
      this.checkpoint(po, "completed", "stock_allocated_order_ready");
      business.audit(
        actor,
        "order.supply_ready",
        order.id,
        { quantity: line.quantity, deliveryAt, receiptId: receipt.id },
        po.case_id,
      );
      notifyOrder(business, order.id, "nOrderReady", {
        quantity: line.quantity,
        deliveryAt,
      });
    } else if (
      po.quantity === po.received_quantity + po.cancelled_quantity &&
      !store.one(
        "SELECT r.id FROM goods_receipts r WHERE r.purchase_order_id=? AND r.inspection='pending'",
        po.id,
      )
    ) {
      this.review(actor, po, "SUPPLY_INCOMPLETE");
    }
    return Math.min(receipt.quantity, added);
  }
  supplierEvent(actor: Actor, purchaseId: string, raw: unknown) {
    requireRole(actor, "purchaser", "owner");
    const input = supplierEventInput.parse(raw);
    return this.business.effect(
      actor,
      "supplier.event",
      input.key,
      { purchaseId, ...input },
      () => {
        const po = this.purchase(purchaseId),
          store = this.business.store,
          now = this.business.clock.now();
        const remaining =
          po.quantity - po.received_quantity - po.cancelled_quantity;
        if (
          !["acknowledged", "partially_received"].includes(po.status) ||
          !remaining
        )
          throw new BusinessError("PURCHASE_NOT_RECEIVABLE");
        let released = 0;
        if (input.kind === "cancellation") {
          if (input.quantity > remaining)
            throw new BusinessError("SUPPLIER_CANCELLATION_EXCEEDED");
          const budget = store.one<{ amount: number; status: string }>(
            "SELECT amount,status FROM budget_allocations WHERE proposal_id=?",
            po.proposal_id,
          )!;
          if (budget.status !== "committed")
            throw new BusinessError("PURCHASE_ALLOCATION_INVALID");
          // Unit costs are refundable on partial cancellations. Declared fees remain;
          // a full cancellation before any receipt releases the entire remaining obligation.
          released =
            po.received_quantity === 0 && input.quantity === remaining
              ? budget.amount
              : Math.min(budget.amount, po.unit_price * input.quantity);
          store.run(
            "UPDATE budget_allocations SET amount=amount-?,status=? WHERE proposal_id=?",
            released,
            po.received_quantity === 0 && input.quantity === remaining
              ? "released"
              : "committed",
            po.proposal_id,
          );
          const complete = input.quantity === remaining;
          store.run(
            "UPDATE purchase_orders SET cancelled_quantity=cancelled_quantity+?,status=? WHERE id=?",
            input.quantity,
            complete
              ? po.received_quantity
                ? "received"
                : "cancelled"
              : po.status,
            po.id,
          );
        } else if (
          input.receiptAt <= now ||
          input.receiptAt <=
            (store.one<{ receipt_at: string }>(
              "SELECT receipt_at FROM supplier_events WHERE purchase_order_id=? AND kind='delay' ORDER BY created_at DESC,rowid DESC LIMIT 1",
              po.id,
            )?.receipt_at ?? po.receipt_at)
        ) {
          throw new BusinessError("SUPPLIER_DELAY_INVALID", 400);
        }
        const id = randomUUID();
        store.run(
          "INSERT INTO supplier_events VALUES (?,?,?,?,?,?,?,?)",
          id,
          po.id,
          input.kind,
          input.kind === "cancellation" ? input.quantity : 0,
          released,
          input.kind === "delay" ? input.receiptAt : null,
          input.evidence,
          now,
        );
        this.business.audit(
          actor,
          `supplier.${input.kind}`,
          po.id,
          { ...input, key: undefined, released, mode: "mock" },
          po.case_id,
        );
        this.review(
          actor,
          po,
          input.kind === "delay"
            ? "SUPPLIER_DELAY_REVIEW"
            : "SUPPLIER_CANCELLED_REVIEW",
          input.kind === "delay"
            ? addBusinessDays(input.receiptAt, 3)
            : undefined,
        );
        return {
          id,
          kind: input.kind,
          releasedAmount: released,
          remainingQuantity:
            remaining - (input.kind === "cancellation" ? input.quantity : 0),
          outcome: "review_required",
        };
      },
    );
  }
  replan(actor: Actor, caseId: string, raw: unknown) {
    requireRole(actor, "purchaser", "owner");
    const input = z
      .strictObject({ reason: z.string().trim().min(1).max(1000), key })
      .parse(raw);
    return this.business.effect(
      actor,
      "supply.replan",
      input.key,
      { caseId, ...input },
      () => {
        const procurement = new Procurement(this.business),
          evidence = procurement.evidence(actor, caseId);
        if (!evidence.comparison.selectedQuoteId) {
          this.business.audit(
            actor,
            "supply.replan_escalated",
            caseId,
            { reason: input.reason, blockers: evidence.requirements.blockers },
            caseId,
          );
          return {
            outcome: "escalated",
            blockers: evidence.requirements.blockers,
            proposalId: null,
          };
        }
        this.business.store.run(
          "UPDATE procurement_cases SET status='open' WHERE id=?",
          caseId,
        );
        const reopenedEvidence = procurement.evidence(actor, caseId);
        const proposal = procurement.prepare(actor, caseId, {
          expectedVersion: reopenedEvidence.latestVersion,
          evidenceFingerprint: reopenedEvidence.fingerprint,
          rationale:
            "Deterministic sandbox supply replan using current accepted requirements and quotations.",
          revisionReason: input.reason,
        });
        this.business.audit(
          actor,
          "supply.replanned",
          proposal.id,
          { reason: input.reason, humanDecisionRequired: true },
          caseId,
        );
        return {
          outcome: "new_decision_required",
          blockers: [],
          proposalId: proposal.id,
        };
      },
    );
  }
  private checkpoint(po: Purchase, state: string, step: string) {
    this.business.store.run(
      "UPDATE processes SET state=?,checkpoint=?,version=version+1,updated_at=? WHERE case_id=? AND state IN ('waiting_supply','escalated') AND json_extract(checkpoint,'$.purchaseOrderId')=?",
      state,
      JSON.stringify({ step, purchaseOrderId: po.id }),
      this.business.clock.now(),
      po.case_id,
      po.id,
    );
  }
  private review(
    actor: Actor,
    po: Purchase,
    reason: string,
    deliveryAt?: string,
  ) {
    const order = this.business.getOrder(actor, po.order_id);
    if (["cancelled", "shipped", "delivered"].includes(order.status)) return;
    if (
      order.status === "confirmed" &&
      order.lines.every(
        (line) =>
          (this.business.store.one<{ quantity: number }>(
            "SELECT quantity FROM reservations WHERE order_id=? AND product_id=? AND status='active' AND expires_at>?",
            order.id,
            line.product_id,
            this.business.clock.now(),
          )?.quantity ?? 0) >=
          line.quantity - line.delivered_quantity,
      )
    )
      return;
    this.business.store.run(
      "UPDATE procurement_cases SET status='escalated' WHERE id=?",
      po.case_id,
    );
    this.checkpoint(po, "escalated", reason);
    this.business.audit(
      actor,
      "supply.review_required",
      po.order_id,
      { reason, deliveryAt: deliveryAt ?? null },
      po.case_id,
    );
    notifyOrder(this.business, po.order_id, "nSupplyReview", {
      reason,
      ...(deliveryAt ? { deliveryAt } : {}),
    });
  }
  progress(actor: Actor, orderId: string): OrderProgress {
    const order = this.business.getOrder(actor, orderId),
      store = this.business.store;
    return {
      businessClock: this.business.clock.now(),
      reserved: store.one<{ n: number }>(
        "SELECT COALESCE(SUM(quantity),0) n FROM reservations WHERE order_id=? AND status='active' AND expires_at>?",
        orderId,
        this.business.clock.now(),
      )!.n,
      required: order.lines.reduce(
        (n, l) => n + l.quantity - l.delivered_quantity,
        0,
      ),
      batches: store.all(
        "SELECT b.* FROM fulfillment_batches b JOIN order_lines l ON l.id=b.order_line_id WHERE l.order_id=? ORDER BY b.promised_at,b.id",
        orderId,
      ),
      timeline: store.all(
        `SELECT id,action,created_at FROM audit_events WHERE (entity_id=? OR correlation_id=? OR correlation_id IN (SELECT id FROM procurement_cases WHERE order_id=?))
        AND action IN ('order.confirmed','goods.received','goods.inspected','stock.allocated','order.supply_ready','supply.review_required','order.status_changed','order.cancellation') ORDER BY created_at,rowid`,
        orderId,
        orderId,
        orderId,
      ),
      notifications: store
        .all<
          Omit<OrderProgress["notifications"][number], "parameters"> & {
            parameters: string;
          }
        >(
          "SELECT * FROM notifications WHERE account_id=? AND json_extract(parameters,'$.orderId')=? ORDER BY created_at,rowid",
          order.customer_id,
          orderId,
        )
        .map((n) => ({
          ...n,
          parameters: JSON.parse(
            n.parameters,
          ) as OrderProgress["notifications"][number]["parameters"],
        })),
    };
  }
}
