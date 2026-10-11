import { createHash, randomUUID } from "node:crypto";
import type { Business } from "./business.js";
import { Purchasing } from "./purchasing.js";
import { procurementRequirements } from "./procurement-requirements.js";
import { BusinessError, requireRole, type Actor } from "../shared/contracts.js";
import {
  proposalInput,
  type ProcurementEvidence,
  type ProposalDetail,
  type ProposalSnapshot,
} from "../shared/procurement.js";
import { addHours } from "../shared/time.js";

const fingerprint = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
export class Procurement {
  constructor(private business: Business) {}
  requirements(actor: Actor, caseId: string) {
    return procurementRequirements(this.business, actor, caseId);
  }
  quotations(actor: Actor, caseId: string) {
    const requirements = this.requirements(actor, caseId);
    const purchasing = new Purchasing(this.business);
    const quotations = purchasing
      .quotes(actor, { product: requirements.productId })
      .filter((q) => q.isCurrent);
    const suppliers = purchasing
      .suppliers(actor)
      .filter((s) => quotations.some((q) => q.supplier_id === s.id));
    return { quotations, suppliers };
  }
  evidence(
    actor: Actor,
    caseId: string,
    excludeAllocation?: string,
  ): ProcurementEvidence {
    // One coherent SQLite read transaction also when called without durable execution.
    return this.business.store.transaction(() => {
      const comparison = this.business.compareQuotes(
        actor,
        caseId,
        excludeAllocation,
      );
      const { quotations, suppliers } = this.quotations(actor, caseId);
      const source = {
        requirements: comparison.requirements,
        quotations,
        suppliers,
        comparison,
      };
      return {
        ...source,
        fingerprint: fingerprint(source),
        latestVersion: this.business.store.one<{ version: number }>(
          "SELECT COALESCE(MAX(version),0) version FROM proposals WHERE case_id=?",
          caseId,
        )!.version,
      };
    });
  }
  prepare(actor: Actor, caseId: string, raw: unknown): ProposalDetail {
    requireRole(actor, "purchaser", "owner");
    const input = proposalInput.parse(raw);
    const key = fingerprint({
      caseId,
      version: input.expectedVersion,
      evidence: input.evidenceFingerprint,
    });
    return this.business.effect(
      actor,
      "procurement.proposal",
      key,
      { caseId, ...input },
      () => {
        const evidence = this.evidence(actor, caseId);
        if (evidence.latestVersion !== input.expectedVersion)
          throw new BusinessError("PROPOSAL_VERSION_CONFLICT");
        if (evidence.fingerprint !== input.evidenceFingerprint)
          throw new BusinessError("PROCUREMENT_EVIDENCE_STALE");
        const previous = this.business.store.one<{
          id: string;
          status: string;
        }>(
          "SELECT id,status FROM proposals WHERE case_id=? ORDER BY version DESC LIMIT 1",
          caseId,
        );
        if (previous && !input.revisionReason)
          throw new BusinessError("PROPOSAL_REVISION_REASON_REQUIRED", 400);
        if (
          previous &&
          ![
            "draft",
            "rejected",
            "expired",
            "superseded",
            "invalidated",
          ].includes(previous.status)
        )
          throw new BusinessError("PROPOSAL_AWAITING_DECISION");
        const selected = evidence.comparison.options.find(
          (q) => q.id === evidence.comparison.selectedQuoteId && q.feasible,
        );
        if (
          !selected ||
          selected.total === null ||
          selected.quantity === null ||
          selected.version === null
        )
          throw new BusinessError("NO_FEASIBLE_QUOTE");
        const quote = evidence.quotations.find((q) => q.id === selected.id)!;
        const now = this.business.clock.now();
        const expiresAt = new Date(
          Math.min(
            Date.parse(addHours(now, 24)),
            Date.parse(quote.valid_until!),
          ),
        ).toISOString();
        const id = randomUUID(),
          version = input.expectedVersion + 1;
        const snapshot: ProposalSnapshot = {
          schemaVersion: 1,
          evidence,
          selectedQuoteId: selected.id,
          explanation: {
            en: this.explain(evidence, "en"),
            az: this.explain(evidence, "az"),
          },
          modelNote: { locale: actor.locale, text: input.rationale },
          revisionReason: input.revisionReason,
          previousProposalId: previous?.id ?? null,
          humanDecisionRequired: true,
          purchasingExecuted: false,
        };
        if (previous?.status === "draft") {
          this.business.store.run(
            "UPDATE proposals SET status='superseded' WHERE id=?",
            previous.id,
          );
          this.business.audit(
            actor,
            "proposal.superseded",
            previous.id,
            { replacementId: id },
            caseId,
          );
        }
        this.business.store.run(
          "INSERT INTO proposals VALUES (?,?,?,?,?,?,?,?, 'draft',?)",
          id,
          caseId,
          version,
          quote.id,
          quote.version,
          selected.quantity,
          selected.total,
          JSON.stringify(snapshot),
          expiresAt,
        );
        this.business.audit(
          actor,
          "proposal.prepared",
          id,
          {
            caseId,
            version,
            quoteId: quote.id,
            quoteVersion: quote.version,
            quantity: selected.quantity,
            total: selected.total,
            fingerprint: evidence.fingerprint,
            revisionReason: input.revisionReason,
          },
          caseId,
        );
        return this.detail(actor, id);
      },
    );
  }
  list(actor: Actor, caseId: string): ProposalDetail[] {
    requireRole(actor, "purchaser", "owner");
    if (
      !this.business.store.one(
        "SELECT id FROM procurement_cases WHERE id=?",
        caseId,
      )
    )
      throw new BusinessError("CASE_NOT_FOUND", 404);
    return this.business.store
      .all<{ id: string }>(
        "SELECT id FROM proposals WHERE case_id=? ORDER BY version DESC",
        caseId,
      )
      .filter((row) => {
        const value = this.business.store.one<{ snapshot: string }>(
          "SELECT snapshot FROM proposals WHERE id=?",
          row.id,
        )!;
        return (
          (JSON.parse(value.snapshot) as { schemaVersion?: number })
            .schemaVersion === 1
        );
      })
      .map((row) => this.detail(actor, row.id));
  }
  detail(actor: Actor, proposalId: string): ProposalDetail {
    requireRole(actor, "purchaser", "owner");
    const row = this.business.store.one<{
      id: string;
      case_id: string;
      version: number;
      status: string;
      quantity: number;
      total: number;
      snapshot: string;
      expires_at: string;
    }>("SELECT * FROM proposals WHERE id=?", proposalId);
    if (!row) throw new BusinessError("PROPOSAL_NOT_FOUND", 404);
    const snapshot = JSON.parse(row.snapshot) as ProposalSnapshot;
    const invalidationReasons: string[] = [];
    let effectiveStatus = row.status;
    if (["draft", "pending_approval", "approved"].includes(row.status)) {
      if (Date.parse(row.expires_at) <= Date.parse(this.business.clock.now())) {
        invalidationReasons.push("PROPOSAL_EXPIRED");
        effectiveStatus = "expired";
      } else {
        try {
          if (
            this.evidence(
              actor,
              row.case_id,
              row.status === "approved" ? row.id : undefined,
            ).fingerprint !== snapshot.evidence.fingerprint
          )
            invalidationReasons.push("PROCUREMENT_EVIDENCE_STALE");
        } catch (error) {
          if (!(error instanceof BusinessError)) throw error;
          invalidationReasons.push(error.code);
        }
        if (invalidationReasons.length) effectiveStatus = "invalidated";
      }
    }
    return {
      id: row.id,
      caseId: row.case_id,
      version: row.version,
      status: row.status,
      effectiveStatus,
      invalidationReasons,
      expiresAt: row.expires_at,
      quantity: row.quantity,
      total: row.total,
      snapshot,
    };
  }
  private explain(evidence: ProcurementEvidence, locale: "en" | "az") {
    const selected = evidence.comparison.options.find(
      (q) => q.id === evidence.comparison.selectedQuoteId,
    )!;
    const az = locale === "az";
    const digits = new Intl.NumberFormat("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(selected.total! / 100);
    const amount = az
      ? `${digits.replace(/[,.]/g, (mark) => (mark === "," ? "." : ","))} ₼`
      : `${digits} AZN`;
    const delivery = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Baku",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(selected.customerDelivery!));
    const reasons: Record<string, [string, string]> = {
      MISSES_DEADLINE: [
        "misses the accepted delivery deadline",
        "qəbul edilmiş çatdırılma müddətini keçir",
      ],
      OVER_BUDGET: [
        "exceeds the remaining purchasing budget",
        "qalan satınalma büdcəsini aşır",
      ],
      SPEC_MISMATCH: [
        "does not match accepted specifications",
        "qəbul edilmiş spesifikasiyaya uyğun deyil",
      ],
      INCOMPLETE_OR_UNSUPPORTED_QUOTE: [
        "required fields are missing or unsupported",
        "tələb olunan məlumatlar çatışmır və ya dəstəklənmir",
      ],
      QUOTE_EXPIRED: ["quotation expired", "təklifin müddəti bitib"],
      INVALID_PROMISE: [
        "availability or receipt promise is inconsistent",
        "mövcudluq və ya qəbul tarixi ziddiyyətlidir",
      ],
      INSUFFICIENT_SUPPLIER_STOCK: [
        "insufficient supplier quantity",
        "təchizatçıda kifayət qədər məhsul yoxdur",
      ],
      SUPPLIER_CAPABILITY_MISMATCH: [
        "supplier capability does not match",
        "təchizatçının imkanları uyğun deyil",
      ],
      DESTINATION_MISMATCH: [
        "delivery destination does not match",
        "çatdırılma ünvanı uyğun deyil",
      ],
    };
    const alternatives = evidence.comparison.options
      .filter((q) => q.id !== selected.id)
      .map(
        (q) =>
          `${q.id} v${q.version ?? "?"}: ${q.feasible ? (az ? "uyğundur; xərc, tarix və təchizatçı sıralamasında sonra gəlir" : "feasible; ranked later by cost, delivery and supplier ID") : q.reasons.map((r) => reasons[r]?.[az ? 1 : 0] ?? r).join("; ")}.`,
      )
      .join(" ");
    return `${az ? "Seçildi" : "Selected"}: ${selected.id} v${selected.version}; ${selected.quantity} ${az ? "ədəd" : "units"}, ${amount}. ${az ? "Artıq miqdar" : "Excess quantity"}: ${selected.excess}. ${az ? "Dəstəklənən müştəri çatdırılması" : "Supported customer delivery"}: ${delivery} (${az ? "Bakı" : "Baku"}). ${az ? "Uyğun variantlar arasında ən aşağı ümumi xərc; bərabərlikdə ən erkən çatdırılma, sonra təchizatçı ID-si. İnsan qərarı tələb olunur; satınalma və mal qəbulu icra edilməyib." : "Lowest all-in cost among feasible offers; ties use earliest delivery, then supplier ID. A human decision is required; no purchase or receipt has occurred."} ${alternatives}`;
  }
}
