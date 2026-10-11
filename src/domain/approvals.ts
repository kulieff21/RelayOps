import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Business } from "./business.js";
import { Auth } from "./auth.js";
import { Procurement } from "./procurement.js";
import { checkApprovalPolicy } from "./quotes.js";
import { BusinessError, requireRole, type Actor } from "../shared/contracts.js";
import {
  approvalSubmit,
  approvalDecision,
  type ApprovalState,
  type ApprovalView,
} from "../shared/approvals.js";
import {
  validateTelegramApprover,
  type TelegramMapping,
} from "../telegram/setup.js";

export type ApprovalOptions = {
  mapping: TelegramMapping;
  liveEnabled: boolean;
};
export type ApprovalRow = {
  id: string;
  proposal_id: string;
  recipient_id: string;
  expires_at: string;
  status: string;
  case_id: string;
  version: number;
  total: number;
  quantity: number;
  process_id: string;
  mode: "mock" | "live";
  bot_id: string;
  user_id: string;
  chat_id: string;
  locale: "en" | "az";
  summary: string;
  expires_wall: number;
  delivery_status: string;
  message_id: number | null;
  edit_pending: number;
  edit_attempts: number;
};
export class Approvals {
  constructor(
    readonly business: Business,
    readonly auth: Auth,
    readonly options?: ApprovalOptions,
    readonly wallTime = () => Date.now(),
  ) {}
  get store() {
    return this.business.store;
  }
  private currentOwner() {
    if (!this.options) throw new BusinessError("APPROVAL_NOT_CONFIGURED");
    const m = this.options.mapping;
    try {
      const actor = this.auth.actor(m.accountId);
      validateTelegramApprover(
        m,
        { id: m.botId, is_bot: true, username: "unused_bot" },
        actor,
      );
      return actor;
    } catch {
      throw new BusinessError("APPROVER_UNAVAILABLE", 403);
    }
  }
  row(requestId: string): ApprovalRow {
    const row = this.store.one<ApprovalRow>(
      `SELECT a.*,p.case_id,p.version,p.total,p.quantity,d.process_id,d.mode,d.bot_id,d.user_id,d.chat_id,
       d.locale,d.summary,d.expires_wall,d.status delivery_status,d.message_id,d.edit_pending,d.edit_attempts
       FROM approval_requests a JOIN proposals p ON p.id=a.proposal_id
       JOIN approval_delivery d ON d.request_id=a.id WHERE a.id=?`,
      requestId,
    );
    if (!row) throw new BusinessError("APPROVAL_NOT_FOUND", 404);
    return row;
  }
  private ownerFor(row: ApprovalRow) {
    const actor = this.currentOwner(),
      m = this.options!.mapping;
    if (
      row.recipient_id !== actor.id ||
      row.bot_id !== String(m.botId) ||
      row.user_id !== String(m.userId) ||
      row.chat_id !== String(m.chatId)
    )
      throw new BusinessError("APPROVAL_MAPPING_CHANGED");
    return actor;
  }
  effective(row: ApprovalRow) {
    if (!["pending", "approved"].includes(row.status)) return row.status;
    if (
      this.wallTime() >= row.expires_wall ||
      Date.parse(this.business.clock.now()) >= Date.parse(row.expires_at)
    )
      return "expired";
    try {
      const actor = this.ownerFor(row);
      const proposal = new Procurement(this.business).detail(
        actor,
        row.proposal_id,
      );
      if (
        proposal.effectiveStatus !==
        (row.status === "pending" ? "pending_approval" : "approved")
      )
        return "invalidated";
    } catch (error) {
      if (!(error instanceof BusinessError)) throw error;
      return "invalidated";
    }
    return row.status;
  }
  private view(actor: Actor, row: ApprovalRow): ApprovalView {
    const effectiveStatus = this.effective(row);
    return {
      id: row.id,
      proposalId: row.proposal_id,
      version: row.version,
      status: row.status,
      effectiveStatus,
      mode: row.mode,
      delivery: row.delivery_status,
      expiresAt: row.expires_at,
      locale: row.locale,
      canDecide:
        actor.id === row.recipient_id &&
        actor.roles.includes("owner") &&
        effectiveStatus === "pending",
      decision:
        this.store.one<ApprovalView["decision"]>(
          "SELECT decision,reason,created_at FROM approval_decisions WHERE request_id=?",
          row.id,
        ) ?? null,
    };
  }
  state(actor: Actor, caseId: string): ApprovalState {
    requireRole(actor, "purchaser", "owner");
    new Procurement(this.business).list(actor, caseId);
    const requests = this.store
      .all<{ id: string }>(
        "SELECT a.id FROM approval_requests a JOIN proposals p ON p.id=a.proposal_id JOIN approval_delivery d ON d.request_id=a.id WHERE p.case_id=? ORDER BY p.version DESC",
        caseId,
      )
      .map((r) => this.view(actor, this.row(r.id)));
    return {
      configured: !!this.options,
      liveAvailable: !!this.options?.liveEnabled,
      recipientAccount: this.options?.mapping.accountId ?? null,
      recipientLocale: this.options?.mapping.locale ?? null,
      requests,
    };
  }
  submit(actor: Actor, caseId: string, proposalId: string, raw: unknown) {
    requireRole(actor, "purchaser", "owner");
    actor = this.auth.actor(actor.id);
    requireRole(actor, "purchaser", "owner");
    const input = approvalSubmit.parse(raw),
      owner = this.currentOwner();
    if (input.mode === "live" && !this.options!.liveEnabled)
      throw new BusinessError("TELEGRAM_LIVE_DISABLED");
    return this.business.effect(
      actor,
      "approval.submit",
      input.key,
      { caseId, proposalId, ...input },
      () => {
        const procurement = new Procurement(this.business),
          proposal = procurement.detail(actor, proposalId);
        if (proposal.caseId !== caseId)
          throw new BusinessError("PROPOSAL_NOT_FOUND", 404);
        if (proposal.version !== input.expectedVersion)
          throw new BusinessError("PROPOSAL_VERSION_CONFLICT");
        const existing = this.store.one<{ id: string }>(
          "SELECT id FROM approval_requests WHERE proposal_id=?",
          proposalId,
        );
        if (existing) throw new BusinessError("APPROVAL_ALREADY_SUBMITTED");
        if (proposal.effectiveStatus !== "draft")
          throw new BusinessError("PROPOSAL_NOT_APPROVABLE");
        const evidence = procurement.evidence(actor, caseId);
        if (evidence.latestVersion !== proposal.version)
          throw new BusinessError("PROPOSAL_VERSION_CONFLICT");
        checkApprovalPolicy(
          owner,
          proposal.total,
          evidence.requirements.budget.limit,
          evidence.requirements.budget.reserved +
            evidence.requirements.budget.committed,
        );
        const m = this.options!.mapping,
          requestId = randomUUID(),
          processId = randomUUID();
        const deadline = evidence.requirements.deadline;
        const az = m.locale === "az";
        const amount = (proposal.total / 100).toFixed(2);
        const summary =
          `RelayOps · ${az ? "SATINALMA TƏSDİQİ" : "PURCHASING APPROVAL"}\n` +
          `${az ? "İş" : "Case"}: ${caseId}\n${az ? "Versiya" : "Version"}: ${proposal.version}\n` +
          `${az ? "Miqdar" : "Quantity"}: ${proposal.quantity}\n${az ? "Ümumi xərc" : "All-in total"}: ${amount} AZN\n` +
          `${az ? "Müştəri müddəti" : "Customer deadline"}: ${deadline}\n` +
          `${az ? "Təsdiqin bitməsi" : "Approval expiry"}: ${proposal.expiresAt}\n\n` +
          proposal.snapshot.explanation[m.locale] +
          `\n\n${az ? "Təsdiq mal qəbulu və ya müştəriyə çatdırılma deyil. Sandbox satınalma ayrıca icra olunur." : "Approval is not receipt or customer delivery. Sandbox purchasing executes separately."}`;
        if (summary.length > 4000)
          throw new BusinessError("APPROVAL_SUMMARY_TOO_LARGE");
        const wallExpiry =
          this.wallTime() +
          Math.min(
            24 * 3600000,
            Date.parse(proposal.expiresAt) -
              Date.parse(this.business.clock.now()),
          );
        this.store.run(
          "INSERT INTO processes VALUES (?,?, 'waiting_approval',?,1,?)",
          processId,
          caseId,
          JSON.stringify({ step: "approval_pending", requestId, proposalId }),
          this.business.clock.now(),
        );
        this.store.run(
          "INSERT INTO approval_requests VALUES (?,?,?,?,'pending')",
          requestId,
          proposalId,
          owner.id,
          proposal.expiresAt,
        );
        this.store.run(
          `INSERT INTO approval_delivery(request_id,process_id,mode,bot_id,user_id,chat_id,locale,summary,expires_wall,status)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
          requestId,
          processId,
          input.mode,
          String(m.botId),
          String(m.userId),
          String(m.chatId),
          m.locale,
          summary,
          wallExpiry,
          input.mode === "mock" ? "sent" : "queued",
        );
        this.store.run(
          "UPDATE proposals SET status='pending_approval' WHERE id=?",
          proposalId,
        );
        this.business.audit(
          actor,
          "approval.requested",
          requestId,
          {
            proposalId,
            version: proposal.version,
            mode: input.mode,
            recipient: owner.id,
          },
          caseId,
        );
        return this.view(actor, this.row(requestId));
      },
    );
  }
  expireOrInvalidate(row: ApprovalRow) {
    const status = this.effective(row);
    if (status === row.status) return row;
    const actor = this.auth.actor(row.recipient_id);
    this.store.run(
      "UPDATE approval_requests SET status=? WHERE id=?",
      status,
      row.id,
    );
    this.store.run(
      "UPDATE proposals SET status=? WHERE id=? AND status IN ('pending_approval','approved')",
      status,
      row.proposal_id,
    );
    this.store.run(
      "UPDATE budget_allocations SET status='released' WHERE proposal_id=? AND status='reserved'",
      row.proposal_id,
    );
    this.store.run(
      "UPDATE approval_delivery SET edit_pending=1,edit_attempts=0 WHERE request_id=? AND message_id IS NOT NULL",
      row.id,
    );
    this.store.run(
      "UPDATE processes SET state='escalated',checkpoint=?,version=version+1,updated_at=? WHERE id=?",
      JSON.stringify({
        step: "new_proposal_required",
        requestId: row.id,
        proposalId: row.proposal_id,
        reason: status,
      }),
      this.business.clock.now(),
      row.process_id,
    );
    this.business.audit(
      actor,
      `approval.${status}`,
      row.id,
      { proposalId: row.proposal_id },
      row.case_id,
    );
    return this.row(row.id);
  }
  sweep() {
    this.store.transaction(() => {
      const rows = this.store.all<{ id: string }>(
        "SELECT a.id FROM approval_requests a JOIN approval_delivery d ON d.request_id=a.id WHERE a.status IN ('pending','approved')",
      );
      for (const r of rows) this.expireOrInvalidate(this.row(r.id));
    });
  }
  private recordDecision(
    actor: Actor,
    row: ApprovalRow,
    decision: "approved" | "rejected",
    reason: string,
  ) {
    actor = this.auth.actor(actor.id);
    requireRole(actor, "owner");
    if (actor.id !== row.recipient_id)
      throw new BusinessError("FORBIDDEN", 403);
    this.ownerFor(row);
    row = this.expireOrInvalidate(row);
    if (row.status !== "pending") return this.view(actor, row);
    if (decision === "approved") {
      const req = new Procurement(this.business).requirements(
        actor,
        row.case_id,
      );
      checkApprovalPolicy(
        actor,
        row.total,
        req.budget.limit,
        req.budget.reserved + req.budget.committed,
      );
      this.store.run(
        "INSERT INTO budget_allocations VALUES (?,?,?,'reserved')",
        row.proposal_id,
        row.case_id,
        row.total,
      );
    }
    this.store.run(
      "INSERT INTO approval_decisions VALUES (?,?,?,?,?)",
      row.id,
      actor.id,
      decision,
      reason,
      this.business.clock.now(),
    );
    this.store.run(
      "UPDATE approval_requests SET status=? WHERE id=?",
      decision,
      row.id,
    );
    this.store.run(
      "UPDATE proposals SET status=? WHERE id=?",
      decision,
      row.proposal_id,
    );
    this.store.run(
      "UPDATE approval_delivery SET edit_pending=1,edit_attempts=0 WHERE request_id=? AND message_id IS NOT NULL",
      row.id,
    );
    const step =
      decision === "approved"
        ? "purchasing_ready"
        : "proposal_revision_required";
    this.store.run(
      "UPDATE processes SET state='ready',checkpoint=?,version=version+1,updated_at=? WHERE id=?",
      JSON.stringify({ step, requestId: row.id, proposalId: row.proposal_id }),
      this.business.clock.now(),
      row.process_id,
    );
    this.store.run(
      "INSERT INTO jobs VALUES (?,?,?,?,?,NULL,0,3,'ready',?)",
      randomUUID(),
      row.process_id,
      decision === "approved"
        ? "purchase.after_approval"
        : "procurement.after_rejection",
      JSON.stringify({ requestId: row.id, proposalId: row.proposal_id }),
      this.business.clock.now(),
      `approval:${row.id}:continuation`,
    );
    this.business.audit(
      actor,
      "approval.decided",
      row.id,
      { proposalId: row.proposal_id, decision, reason },
      row.case_id,
    );
    return this.view(actor, this.row(row.id));
  }
  decide(actor: Actor, caseId: string, requestId: string, raw: unknown) {
    actor = this.auth.actor(actor.id);
    requireRole(actor, "owner");
    const row = this.row(requestId);
    if (row.case_id !== caseId || row.recipient_id !== actor.id)
      throw new BusinessError("APPROVAL_NOT_FOUND", 404);
    const input = approvalDecision.parse(raw);
    return this.business.effect(
      actor,
      "approval.decide",
      input.key,
      { requestId, ...input },
      () =>
        this.recordDecision(
          actor,
          this.row(requestId),
          input.decision,
          input.reason,
        ),
    );
  }
  callback(raw: unknown, botId: number) {
    const envelope = callbackSchema.parse(raw),
      key = `${botId}:${envelope.update_id}`;
    return this.store.transaction(() => {
      const cached = this.store.one<{ result: string }>(
        "SELECT result FROM telegram_updates WHERE update_id=?",
        key,
      );
      if (cached)
        return JSON.parse(cached.result) as {
          status: string;
          requestId?: string;
        };
      const query = envelope.callback_query;
      let result: { status: string; requestId?: string } = {
        status: "ignored",
      };
      if (query) {
        const match = /^r:([a-f0-9-]{36}):(a|r)$/.exec(query.data);
        if (match) {
          let row: ApprovalRow | null = null;
          try {
            row = this.row(match[1]!);
          } catch (error) {
            if (!(error instanceof BusinessError)) throw error;
          }
          if (
            row &&
            row.mode === "live" &&
            row.bot_id === String(botId) &&
            row.user_id === String(query.from.id) &&
            !query.from.is_bot &&
            row.chat_id === String(query.message.chat.id) &&
            query.message.chat.type === "private" &&
            query.message.from?.id === botId &&
            query.message.from.is_bot &&
            (row.message_id === query.message.message_id ||
              (row.message_id === null &&
                row.delivery_status === "unknown" &&
                query.message.from?.id === botId &&
                query.message.from.is_bot)) &&
            ["sent", "unknown"].includes(row.delivery_status)
          ) {
            try {
              const actor = this.ownerFor(row);
              if (row.delivery_status === "unknown") {
                this.store.run(
                  "UPDATE approval_delivery SET status='sent',message_id=?,error_code=NULL WHERE request_id=?",
                  query.message.message_id,
                  row.id,
                );
                this.business.audit(
                  actor,
                  "approval.delivery_recovered",
                  row.id,
                  { messageId: query.message.message_id },
                  row.case_id,
                );
                row = this.row(row.id);
              }
              result = {
                status: this.recordDecision(
                  actor,
                  row,
                  match[2] === "a" ? "approved" : "rejected",
                  "Telegram button decision",
                ).effectiveStatus,
                requestId: row.id,
              };
            } catch (error) {
              if (!(error instanceof BusinessError)) throw error;
              result = { status: "denied" };
            }
          } else result = { status: "denied" };
        }
      }
      this.store.run(
        "INSERT INTO telegram_updates VALUES (?,?,?)",
        key,
        new Date(this.wallTime()).toISOString(),
        JSON.stringify(result),
      );
      return result;
    });
  }
}
export const callbackSchema = z.object({
  update_id: z.number().int().nonnegative(),
  callback_query: z
    .object({
      id: z.string().min(1).max(200),
      from: z.object({ id: z.number().int().positive(), is_bot: z.boolean() }),
      data: z.string().max(64),
      message: z.object({
        from: z
          .object({ id: z.number().int().positive(), is_bot: z.boolean() })
          .optional(),
        message_id: z.number().int().positive(),
        chat: z.object({ id: z.number().int(), type: z.string() }),
      }),
    })
    .optional()
    .catch(undefined),
});
