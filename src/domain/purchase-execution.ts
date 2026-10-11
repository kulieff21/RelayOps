import { randomUUID } from "node:crypto";
import { Approvals } from "./approvals.js";
import { Procurement } from "./procurement.js";
import { BusinessError, requireRole } from "../shared/contracts.js";

export type ContinuationResult = {
  status: "waiting_supply" | "revision_ready" | "escalated";
  purchaseOrderId?: string;
  proposalId?: string;
  reason?: string;
};

// This executor has no supplier network, payment or receipt capability.
export class PurchaseExecution {
  constructor(readonly approvals: Approvals) {}
  purchase(
    requestId: string,
    supplierOutcome: "acknowledged" | "failed" = "acknowledged",
  ): ContinuationResult {
    const { store, business, auth } = this.approvals;
    return store.transaction(() => {
      let row = this.approvals.row(requestId);
      const actor = auth.actor(row.recipient_id);
      requireRole(actor, "owner");
      const prior = store.one<{ id: string; status: string }>(
        "SELECT id,status FROM purchase_orders WHERE proposal_id=?",
        row.proposal_id,
      );
      if (prior)
        return {
          status: prior.status === "failed" ? "escalated" : "waiting_supply",
          purchaseOrderId: prior.id,
        };
      row = this.approvals.expireOrInvalidate(row);
      if (row.status !== "approved")
        return { status: "escalated", reason: row.status };
      const decision = store.one<{ actor_id: string; decision: string }>(
        "SELECT actor_id,decision FROM approval_decisions WHERE request_id=?",
        row.id,
      );
      if (decision?.decision !== "approved" || decision.actor_id !== actor.id)
        throw new BusinessError("PURCHASE_APPROVAL_REQUIRED");
      const allocation = store.one<{ amount: number; status: string }>(
        "SELECT amount,status FROM budget_allocations WHERE proposal_id=?",
        row.proposal_id,
      );
      if (allocation?.status !== "reserved" || allocation.amount !== row.total)
        throw new BusinessError("PURCHASE_ALLOCATION_INVALID");
      const procurement = new Procurement(business),
        proposal = procurement.detail(actor, row.proposal_id);
      if (proposal.effectiveStatus !== "approved")
        throw new BusinessError("PURCHASE_APPROVAL_REQUIRED");
      const requirements = proposal.snapshot.evidence.requirements;
      const now = business.clock.now(),
        poId = randomUUID();
      store.run(
        "INSERT INTO purchase_orders VALUES (?,?,?,0,0,'created',?)",
        poId,
        row.proposal_id,
        row.quantity,
        now,
      );
      store.run(
        "UPDATE budget_allocations SET status='committed' WHERE proposal_id=? AND status='reserved'",
        row.proposal_id,
      );
      store.run(
        "UPDATE proposals SET status='executed' WHERE id=? AND status='approved'",
        row.proposal_id,
      );
      business.audit(
        actor,
        "purchase.created",
        poId,
        {
          proposalId: row.proposal_id,
          quantity: row.quantity,
          total: row.total,
          mode: "mock",
        },
        row.case_id,
      );
      const reason =
        supplierOutcome === "acknowledged"
          ? "Sandbox supplier acknowledged the approved quotation; no physical receipt."
          : "Simulated supplier could not fulfil the approved quotation; no supplier obligation.";
      store.run(
        "INSERT INTO supplier_acknowledgements VALUES (?,'mock',?,?,?)",
        poId,
        supplierOutcome,
        reason,
        now,
      );
      store.run(
        "UPDATE purchase_orders SET status=? WHERE id=?",
        supplierOutcome,
        poId,
      );
      business.audit(
        actor,
        `supplier.${supplierOutcome}`,
        poId,
        { mode: "mock", reason },
        row.case_id,
      );
      if (supplierOutcome === "failed") {
        store.run(
          "UPDATE budget_allocations SET status='released' WHERE proposal_id=?",
          row.proposal_id,
        );
        store.run(
          "UPDATE procurement_cases SET status='escalated' WHERE id=?",
          row.case_id,
        );
      } else {
        store.run(
          "UPDATE procurement_cases SET status='committed' WHERE id=?",
          row.case_id,
        );
        const extended = store.run(
          "UPDATE reservations SET expires_at=? WHERE order_id=? AND product_id=? AND status='active' AND expires_at>? AND expires_at<?",
          requirements.deadline,
          requirements.orderId,
          requirements.productId,
          now,
          requirements.deadline,
        );
        if (extended.changes)
          business.audit(
            actor,
            "reservation.extended",
            requirements.orderId,
            {
              deadline: requirements.deadline,
              reason: "Acknowledged sandbox purchase within accepted deadline",
            },
            row.case_id,
          );
      }
      const status =
        supplierOutcome === "failed" ? "escalated" : "waiting_supply";
      store.run(
        "UPDATE processes SET state=?,checkpoint=?,version=version+1,updated_at=? WHERE id=?",
        status,
        JSON.stringify({
          step:
            supplierOutcome === "failed"
              ? "supplier_failure_review"
              : "goods_receipt_required",
          requestId,
          proposalId: row.proposal_id,
          purchaseOrderId: poId,
          mode: "mock",
        }),
        now,
        row.process_id,
      );
      return { status, purchaseOrderId: poId };
    });
  }
  revise(requestId: string): ContinuationResult {
    const { store, business, auth } = this.approvals;
    return store.transaction(() => {
      const row = this.approvals.row(requestId),
        actor = auth.actor(row.recipient_id);
      requireRole(actor, "owner");
      if (row.status !== "rejected")
        return { status: "escalated", reason: "REJECTED_DECISION_REQUIRED" };
      const decision = store.one<{ reason: string }>(
        "SELECT reason FROM approval_decisions WHERE request_id=? AND decision='rejected'",
        requestId,
      );
      if (!decision) throw new BusinessError("REJECTED_DECISION_REQUIRED");
      const procurement = new Procurement(business),
        evidence = procurement.evidence(actor, row.case_id);
      // A human or another completed worker may already have created a revision.
      if (evidence.latestVersion > row.version) {
        const latest = procurement.list(actor, row.case_id)[0]!;
        store.run(
          "UPDATE processes SET state='completed',checkpoint=?,version=version+1,updated_at=? WHERE id=?",
          JSON.stringify({
            step: "revision_already_present",
            proposalId: latest.id,
          }),
          business.clock.now(),
          row.process_id,
        );
        return { status: "revision_ready", proposalId: latest.id };
      }
      try {
        const proposal = procurement.prepare(actor, row.case_id, {
          expectedVersion: row.version,
          evidenceFingerprint: evidence.fingerprint,
          rationale:
            "Deterministic sandbox revision after a recorded human rejection; no model inference.",
          revisionReason: decision.reason,
        });
        store.run(
          "UPDATE processes SET state='waiting_approval',checkpoint=?,version=version+1,updated_at=? WHERE id=?",
          JSON.stringify({
            step: "revised_draft_requires_new_submission",
            requestId,
            proposalId: proposal.id,
          }),
          business.clock.now(),
          row.process_id,
        );
        business.audit(
          actor,
          "procurement.revision_ready",
          proposal.id,
          {
            rejectedRequestId: requestId,
            version: proposal.version,
            humanDecisionRequired: true,
          },
          row.case_id,
        );
        return { status: "revision_ready", proposalId: proposal.id };
      } catch (error) {
        if (!(error instanceof BusinessError)) throw error;
        return { status: "escalated", reason: error.code };
      }
    });
  }
}
