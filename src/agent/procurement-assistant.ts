import { createHash } from "node:crypto";
import type { Business } from "../domain/business.js";
import type { Auth } from "../domain/auth.js";
import { Procurement } from "../domain/procurement.js";
import { BusinessError } from "../shared/contracts.js";
import {
  procurementRequest,
  type ProcurementRequest,
  type ProcurementTurn,
} from "../shared/procurement.js";
import { ToolDispatcher, type ToolContext } from "./tools.js";
import { Conversations } from "./conversations.js";
import type { AgentModel, AgentResult } from "./loop.js";
import { ProcurementMock } from "../model/procurement-mock.js";

export type ProcurementModels = {
  live?: { id: string; create: () => AgentModel };
  mock?: (caseId: string, request: ProcurementRequest) => AgentModel;
};
type RequestRow = {
  run_id: string;
  actor_id: string;
  case_id: string;
  request_key: string;
  fingerprint: string;
  request: string;
  status: string;
};
export class ProcurementAssistant {
  private active = new Map<string, Promise<void>>();
  private procurement: Procurement;
  constructor(
    private business: Business,
    private auth: Auth,
    private models: ProcurementModels = {},
  ) {
    this.procurement = new Procurement(business);
  }
  private get store() {
    return this.business.store;
  }
  private scope(context: ToolContext) {
    if (context.agent !== "procurement")
      throw new BusinessError("FORBIDDEN", 403);
    this.auth.authenticate(context.sessionToken || undefined);
    const bound = new ToolDispatcher(this.business, this.auth).bind(context);
    return {
      scope: bound.scope(),
      actor: {
        ...this.auth.authenticate(context.sessionToken),
        locale: bound.scope().locale,
      },
    };
  }
  state(context: ToolContext) {
    const { scope, actor } = this.scope(context);
    const caseId = scope.caseId!;
    const proposals = this.procurement.list(actor, caseId);
    const latest = this.store.one<RequestRow>(
      "SELECT * FROM procurement_requests WHERE case_id=? AND actor_id=? ORDER BY rowid DESC LIMIT 1",
      caseId,
      actor.id,
    );
    return {
      defaultMode: "mock" as const,
      liveAvailable: !!this.models.live,
      latestVersion: this.store.one<{ version: number }>(
        "SELECT COALESCE(MAX(version),0) version FROM proposals WHERE case_id=?",
        caseId,
      )!.version,
      proposals,
      latestTurn: latest ? this.turn(context, latest.run_id) : null,
    };
  }
  private conversations(row: RequestRow) {
    const request = procurementRequest.parse(JSON.parse(row.request));
    const live = request.mode === "live" ? this.models.live : undefined;
    if (request.mode === "live" && !live)
      throw new BusinessError("ASSISTANT_LIVE_UNAVAILABLE");
    return new Conversations(
      this.store,
      new ToolDispatcher(this.business, this.auth),
      {
        mode: request.mode,
        id: live?.id ?? "relayops/procurement-mock",
        adapter: live
          ? live.create()
          : (this.models.mock?.(row.case_id, request) ??
            new ProcurementMock(row.case_id, request)),
      },
    );
  }
  private bound(context: ToolContext, row: RequestRow): ToolContext {
    const input = procurementRequest.parse(JSON.parse(row.request));
    return {
      agent: "procurement",
      sessionToken: context.sessionToken,
      caseId: row.case_id,
      locale: input.locale,
      proposalVersion: input.expectedVersion,
      revisionReason: input.revisionReason,
    };
  }
  send(context: ToolContext, raw: unknown) {
    const { scope } = this.scope(context),
      input = procurementRequest.parse(raw);
    if (input.mode === "live" && !this.models.live)
      throw new BusinessError("ASSISTANT_LIVE_UNAVAILABLE");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ caseId: scope.caseId, ...input }))
      .digest("hex");
    const row = this.store.transaction(() => {
      // A crash can occur after the execution's terminal commit and before the
      // HTTP scheduler marks its request done. Reconcile, never replay that turn.
      this.store.run(
        "UPDATE procurement_requests SET status='done' WHERE status!='done' AND EXISTS(SELECT 1 FROM agent_execution e WHERE e.run_id=procurement_requests.run_id AND e.result IS NOT NULL)",
      );
      const prior = this.store.one<RequestRow>(
        "SELECT * FROM procurement_requests WHERE actor_id=? AND request_key=?",
        scope.actorId,
        input.key,
      );
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new BusinessError("IDEMPOTENCY_CONFLICT");
        return prior;
      }
      if (
        this.store.one(
          "SELECT run_id FROM procurement_requests WHERE case_id=? AND status!='done'",
          scope.caseId,
        )
      )
        throw new BusinessError("PROCUREMENT_RUN_BUSY");
      if (
        input.mode === "live" &&
        (this.store.one(
          "SELECT run_id FROM procurement_requests WHERE json_extract(request,'$.mode')='live' AND status!='done'",
        ) ||
          this.store.one(
            "SELECT run_id FROM assistant_requests WHERE mode='live' AND status!='done'",
          ))
      )
        throw new BusinessError("ASSISTANT_LIVE_BUSY");
      const since = new Date(
        Date.now() - (input.mode === "live" ? 3600000 : 60000),
      ).toISOString();
      if (
        this.store.one<{ n: number }>(
          "SELECT COUNT(*) n FROM procurement_requests WHERE actor_id=? AND json_extract(request,'$.mode')=? AND created_at>=?",
          scope.actorId,
          input.mode,
          since,
        )!.n >= (input.mode === "live" ? 6 : 20)
      )
        throw new BusinessError("RATE_LIMITED", 429);
      const latest = this.store.one<{ v: number }>(
        "SELECT COALESCE(MAX(version),0) v FROM proposals WHERE case_id=?",
        scope.caseId,
      )!.v;
      if (input.expectedVersion !== latest)
        throw new BusinessError("PROPOSAL_VERSION_CONFLICT");
      if (latest && !input.revisionReason)
        throw new BusinessError("PROPOSAL_REVISION_REASON_REQUIRED", 400);
      const pending: RequestRow = {
        run_id: "",
        actor_id: scope.actorId,
        case_id: scope.caseId!,
        request_key: input.key,
        fingerprint,
        request: JSON.stringify(input),
        status: "queued",
      };
      const prepared = this.conversations(pending).prepare(
        this.bound(context, pending),
        {
          userText:
            "Review the bound case requirements and quotations, compare current feasible offers, and prepare a new immutable purchasing draft. Explain alternatives. If no feasible option exists, escalate with comparison evidence. Never approve or execute a purchase.",
          maxIterations: 6,
          maxTimeMs: 90000,
          maxTokens: 128000,
          maxOutputTokens: 1024,
          maxRetries: 1,
        },
      );
      this.store.run(
        "INSERT INTO procurement_requests VALUES(?,?,?,?,?,?,'queued',?)",
        prepared.runId,
        scope.actorId,
        scope.caseId,
        input.key,
        fingerprint,
        JSON.stringify(input),
        new Date().toISOString(),
      );
      return { ...pending, run_id: prepared.runId };
    });
    if (row.status === "queued" && !this.active.has(row.run_id))
      this.schedule(context, row);
    return { runId: row.run_id };
  }
  private owned(context: ToolContext, runId: string) {
    const { scope, actor } = this.scope(context);
    const row = this.store.one<RequestRow>(
      "SELECT * FROM procurement_requests WHERE run_id=? AND actor_id=? AND case_id=?",
      runId,
      scope.actorId,
      scope.caseId,
    );
    if (!row) throw new BusinessError("CONVERSATION_NOT_FOUND", 404);
    return { row, actor };
  }
  resume(context: ToolContext, runId: string) {
    const { row } = this.owned(context, runId);
    const execution = this.store.one<{
      result: string | null;
      lease_until: number | null;
    }>("SELECT result,lease_until FROM agent_execution WHERE run_id=?", runId)!;
    if (execution.result)
      this.store.run(
        "UPDATE procurement_requests SET status='done' WHERE run_id=?",
        runId,
      );
    if (
      !execution.result &&
      !this.active.has(runId) &&
      (execution.lease_until ?? 0) > Date.now()
    )
      throw new BusinessError("AGENT_RUN_BUSY");
    if (!execution.result && !this.active.has(runId)) {
      const input = procurementRequest.parse(JSON.parse(row.request));
      if (
        input.mode === "live" &&
        (this.store.one(
          "SELECT run_id FROM assistant_requests WHERE mode='live' AND status!='done'",
        ) ||
          this.store.one(
            "SELECT run_id FROM procurement_requests WHERE run_id!=? AND json_extract(request,'$.mode')='live' AND status!='done'",
            runId,
          ))
      )
        throw new BusinessError("ASSISTANT_LIVE_BUSY");
      this.schedule(context, row);
    }
    return { runId };
  }
  private schedule(context: ToolContext, row: RequestRow) {
    const task = Promise.resolve()
      .then(async () => {
        this.store.run(
          "UPDATE procurement_requests SET status='running' WHERE run_id=?",
          row.run_id,
        );
        await this.conversations(row).resume(
          this.bound(context, row),
          row.run_id,
        );
        this.store.run(
          "UPDATE procurement_requests SET status='done' WHERE run_id=?",
          row.run_id,
        );
      })
      .catch(() => {
        /* Durable checkpoints expose explicit resume, never silent inference replay. */
      })
      .finally(() => this.active.delete(row.run_id));
    this.active.set(row.run_id, task);
  }
  async idle() {
    await Promise.all([...this.active.values()]);
  }
  turn(context: ToolContext, runId: string): ProcurementTurn {
    const { row, actor } = this.owned(context, runId);
    const execution = this.store.one<{
      result: string | null;
      lease_until: number | null;
    }>("SELECT result,lease_until FROM agent_execution WHERE run_id=?", runId)!;
    const result = execution.result
      ? (JSON.parse(execution.result) as AgentResult)
      : null;
    // Proposal evidence survives even when the later explanatory model response fails.
    const saved = this.store.all<{ result: string }>(
      "SELECT result FROM tool_calls WHERE run_id=? AND name='preparePurchaseProposal' AND status='completed' ORDER BY rowid DESC",
      runId,
    )[0];
    const proposalId = saved
      ? (JSON.parse(saved.result) as { data: { id: string } }).data.id
      : null;
    const request = procurementRequest.parse(JSON.parse(row.request));
    let outcome: ProcurementTurn["outcome"] = null;
    if (result) {
      const message =
        result.status === "completion" || result.status === "escalation"
          ? result.message
          : result.status === "clarification"
            ? result.question
            : "";
      outcome = {
        status: result.status,
        message,
        ...(result.status === "stopped"
          ? { errorCode: result.error.code }
          : {}),
      };
    }
    return {
      runId,
      mode: request.mode,
      status: result ? "done" : row.status,
      outcome,
      proposal: proposalId ? this.procurement.detail(actor, proposalId) : null,
      needsResume:
        !result &&
        !this.active.has(runId) &&
        (execution.lease_until ?? 0) <= Date.now(),
    };
  }
}
