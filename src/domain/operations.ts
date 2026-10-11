import { z } from "zod";
import { Business } from "./business.js";
import {
  BusinessError,
  id,
  requireRole,
  type Actor,
} from "../shared/contracts.js";
import type {
  AuditRecord,
  CaseDetail,
  CaseRecord,
  ProposalRecord,
  PurchaseRecord,
  PurchasingRecords,
  ReceiptRecord,
  RunRecord,
} from "../shared/operations.js";

const filter = z.strictObject({ case: id.optional() });
const consentSchema = z.object({
  productSpecs: z.string().optional(),
  quantity: z.number().int().optional(),
  total: z.number().int().optional(),
  availableAllocation: z.number().int().optional(),
  shortage: z.number().int().optional(),
  supportedDelivery: z.iso.datetime().nullable().optional(),
});
export class Operations {
  constructor(private business: Business) {}
  private case(actor: Actor, caseId: string): CaseRecord {
    requireRole(actor, "purchaser", "owner");
    const row = this.business.store.one<CaseRecord>(
      "SELECT id,order_id,product_id,quantity,budget,status,created_at FROM procurement_cases WHERE id=?",
      caseId,
    );
    if (!row) throw new BusinessError("CASE_NOT_FOUND", 404);
    return row;
  }
  detail(actor: Actor, caseId: string, excludeAllocation?: string): CaseDetail {
    const row = this.case(actor, caseId);
    const store = this.business.store,
      now = this.business.clock.now();
    const order = store.one<CaseDetail["order"]>(
      `SELECT o.id,o.status,o.deadline,o.destination,o.allow_partial,o.allow_substitution,
       o.consent_offer_id,o.consent_version,l.quantity,l.delivered_quantity
       FROM orders o JOIN order_lines l ON l.order_id=o.id WHERE o.id=? AND l.product_id=?`,
      row.order_id,
      row.product_id,
    )!;
    const summary = consentSchema.parse(
      JSON.parse(
        store.one<{ summary: string }>(
          "SELECT summary FROM order_offers WHERE id=?",
          order.consent_offer_id,
        )!.summary,
      ),
    );
    let rawSpecs: unknown = null;
    try {
      if (summary.productSpecs) rawSpecs = JSON.parse(summary.productSpecs);
    } catch {
      /* Preserve absent/invalid consent specifications as unknown. */
    }
    const spec = summary.productSpecs
      ? z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .safeParse(rawSpecs)
      : null;
    const reservations = store
      .all<Omit<CaseDetail["reservations"][number], "effectiveStatus">>(
        "SELECT id,quantity,status,expires_at FROM reservations WHERE order_id=? AND product_id=? ORDER BY expires_at,id",
        row.order_id,
        row.product_id,
      )
      .map((r) => ({
        ...r,
        effectiveStatus:
          r.status === "active" && Date.parse(r.expires_at) <= Date.parse(now)
            ? "expired"
            : r.status,
      }));
    const allocations = store.all<{ status: string; amount: number }>(
      "SELECT status,amount FROM budget_allocations WHERE case_id=? AND (? IS NULL OR proposal_id!=?)",
      caseId,
      excludeAllocation ?? null,
      excludeAllocation ?? null,
    );
    const sum = (status: string) =>
      allocations
        .filter((a) => a.status === status)
        .reduce((n, a) => n + a.amount, 0);
    return {
      businessClock: now,
      case: row,
      order,
      consent: {
        productSpecs: spec?.success ? spec.data : null,
        quantity: summary.quantity ?? null,
        total: summary.total ?? null,
        availableAllocation: summary.availableAllocation ?? null,
        shortage: summary.shortage ?? null,
        supportedDelivery: summary.supportedDelivery ?? null,
      },
      inventory: {
        physical: this.business.product(row.product_id).stock,
        available: this.business.available(row.product_id),
        reservedForOrder: reservations
          .filter((r) => r.effectiveStatus === "active")
          .reduce((n, r) => n + r.quantity, 0),
      },
      reservations,
      budget: {
        reserved: sum("reserved"),
        committed: sum("committed"),
        remaining: row.budget - sum("reserved") - sum("committed"),
      },
      processes: store.all(
        "SELECT id,state,version,updated_at FROM processes WHERE case_id=? ORDER BY updated_at,id",
        caseId,
      ),
      fulfillment: store.all(
        `SELECT b.id,b.quantity,b.promised_at,b.status,b.evidence FROM fulfillment_batches b
        JOIN order_lines l ON l.id=b.order_line_id WHERE l.order_id=? AND l.product_id=? ORDER BY b.promised_at,b.id`,
        row.order_id,
        row.product_id,
      ),
      audit: this.timeline(actor, caseId),
    };
  }
  timeline(actor: Actor, caseId: string): AuditRecord[] {
    const row = this.case(actor, caseId);
    // Follow explicit stored relationships, never a supplier/product-wide text search.
    return this.business.store.all<AuditRecord>(
      `
      WITH entities(id) AS (
        SELECT id FROM procurement_cases WHERE id=? UNION SELECT ? UNION SELECT o.consent_offer_id FROM orders o WHERE o.id=?
        UNION SELECT id FROM proposals WHERE case_id=?
        UNION SELECT quote_id FROM proposals WHERE case_id=?
        UNION SELECT a.id FROM approval_requests a JOIN proposals p ON p.id=a.proposal_id WHERE p.case_id=?
        UNION SELECT po.id FROM purchase_orders po JOIN proposals p ON p.id=po.proposal_id WHERE p.case_id=?
        UNION SELECT r.id FROM goods_receipts r JOIN purchase_orders po ON po.id=r.purchase_order_id JOIN proposals p ON p.id=po.proposal_id WHERE p.case_id=?
        UNION SELECT id FROM processes WHERE case_id=?
        UNION SELECT r.id FROM agent_runs r JOIN processes p ON p.id=r.process_id WHERE p.case_id=?
        UNION SELECT t.id FROM tool_calls t JOIN agent_runs r ON r.id=t.run_id JOIN processes p ON p.id=r.process_id WHERE p.case_id=?
        UNION SELECT r.id FROM returns r JOIN order_lines l ON l.id=r.order_line_id WHERE l.order_id=?
      )
      SELECT DISTINCT a.id,a.action,a.entity_id,a.created_at FROM audit_events a
      WHERE a.entity_id IN (SELECT id FROM entities) OR a.correlation_id IN (SELECT id FROM entities)
      ORDER BY a.created_at,a.id`,
      caseId,
      row.order_id,
      row.order_id,
      ...Array<string>(8).fill(caseId),
      row.order_id,
    );
  }
  purchasing(actor: Actor, raw: unknown = {}): PurchasingRecords {
    requireRole(actor, "operator", "purchaser", "owner");
    const query = filter.parse(raw);
    // Operators read goods handling, not proposal amounts, decisions or purchasing budgets.
    if (query.case) this.case(actor, query.case);
    const store = this.business.store,
      now = this.business.clock.now();
    const financial =
      actor.roles.includes("owner") || actor.roles.includes("purchaser");
    const proposals = financial
      ? store.all<Omit<ProposalRecord, "approval" | "elapsed">>(
          `
      SELECT p.id,p.case_id,p.version,p.quote_id,p.quote_version,p.quantity,p.total,p.status,p.expires_at,
        q.supplier_id,s.name supplier_name,c.product_id FROM proposals p JOIN quotes q ON q.id=p.quote_id
        JOIN suppliers s ON s.id=q.supplier_id JOIN procurement_cases c ON c.id=p.case_id
        ${query.case ? "WHERE p.case_id=?" : ""} ORDER BY c.created_at DESC,p.case_id,p.version DESC`,
          ...(query.case ? [query.case] : []),
        )
      : [];
    const purchaseOrders = store.all<Omit<PurchaseRecord, "receipts">>(
      `
      SELECT po.id,po.proposal_id,p.case_id,c.product_id,s.name supplier_name,po.quantity,po.received_quantity,
        po.cancelled_quantity,po.quantity-po.received_quantity-po.cancelled_quantity remaining_quantity,po.status,po.created_at
        FROM purchase_orders po JOIN proposals p ON p.id=po.proposal_id JOIN procurement_cases c ON c.id=p.case_id
        JOIN quotes q ON q.id=p.quote_id JOIN suppliers s ON s.id=q.supplier_id
        ${query.case ? "WHERE p.case_id=?" : ""} ORDER BY po.created_at DESC,po.id`,
      ...(query.case ? [query.case] : []),
    );
    return {
      businessClock: now,
      proposals: proposals.map((p) => {
        const approval = store.one<
          Omit<NonNullable<ProposalRecord["approval"]>, "decision" | "elapsed">
        >(
          "SELECT id,recipient_id,status,expires_at FROM approval_requests WHERE proposal_id=?",
          p.id,
        );
        return {
          ...p,
          elapsed: Date.parse(p.expires_at) <= Date.parse(now),
          approval: approval
            ? {
                ...approval,
                elapsed: Date.parse(approval.expires_at) <= Date.parse(now),
                decision:
                  store.one<
                    NonNullable<
                      NonNullable<ProposalRecord["approval"]>["decision"]
                    >
                  >(
                    "SELECT actor_id,decision,reason,created_at FROM approval_decisions WHERE request_id=?",
                    approval.id,
                  ) ?? null,
              }
            : null,
        };
      }),
      purchaseOrders: purchaseOrders.map((po) => ({
        ...po,
        supplierAcknowledgement:
          store.one<NonNullable<PurchaseRecord["supplierAcknowledgement"]>>(
            "SELECT mode,outcome,created_at FROM supplier_acknowledgements WHERE purchase_order_id=?",
            po.id,
          ) ?? null,
        receipts: store
          .all<Omit<ReceiptRecord, "serials"> & { serials: string }>(
            "SELECT id,purchase_order_id,quantity,inspection,serials,exception_reason,created_at FROM goods_receipts WHERE purchase_order_id=? ORDER BY created_at,id",
            po.id,
          )
          .map((r) => ({
            ...r,
            serials: z.array(z.string()).parse(JSON.parse(r.serials)),
          })),
      })),
    };
  }
  runs(actor: Actor, raw: unknown = {}): RunRecord[] {
    requireRole(actor, "purchaser", "owner");
    const query = filter.parse(raw);
    if (query.case) this.case(actor, query.case);
    const store = this.business.store;
    const rows = store.all<Omit<RunRecord, "toolCalls" | "usage">>(
      `
      SELECT r.id,p.case_id,r.agent,r.mode,r.model,r.status,r.started_at FROM agent_runs r
        LEFT JOIN processes p ON p.id=r.process_id
        WHERE ${actor.roles.includes("owner") ? "1=1" : "r.agent='procurement' AND p.case_id IS NOT NULL"}
        ${query.case ? "AND p.case_id=?" : ""} ORDER BY r.started_at DESC,r.id`,
      ...(query.case ? [query.case] : []),
    );
    return rows.map((row) => ({
      ...row,
      toolCalls: store.all(
        "SELECT id,name,status FROM tool_calls WHERE run_id=? ORDER BY id",
        row.id,
      ),
      usage: store.all(
        "SELECT id,input_tokens,output_tokens,cost_microusd FROM model_usage WHERE run_id=? ORDER BY id",
        row.id,
      ),
    }));
  }
}
