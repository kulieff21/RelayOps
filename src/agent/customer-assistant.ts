import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  BusinessError,
  requireRole,
  toolContracts,
  type Actor,
  type Locale,
} from "../shared/contracts.js";
import {
  assistantRequest,
  guidedAction,
  type AssistantConversation,
  type AssistantSettings,
  type AssistantTurn,
  type ConfirmationView,
  type ConversationSummary,
  type GuidedAction,
  type HandoffView,
} from "../shared/assistant.js";
import { Auth } from "../domain/auth.js";
import { Business } from "../domain/business.js";
import { CustomerEvidence } from "../domain/customer-evidence.js";
import { addHours } from "../shared/time.js";
import { Conversations } from "./conversations.js";
import { ToolDispatcher, type ToolContext, type ToolResult } from "./tools.js";
import type { AgentModel, AgentResult, RunState } from "./loop.js";
import { CustomerMock } from "../model/customer-mock.js";

export type CustomerModels = {
  live?: { id: string; create: () => AgentModel };
  mock?: (action?: GuidedAction) => AgentModel;
};
type RequestRow = {
  actor_id: string;
  request_key: string;
  run_id: string;
  conversation_id: string;
  mode: "mock" | "live";
  guided_action: string | null;
  status: string;
  fingerprint: string;
};
type ExecutionRow = {
  state: string;
  result: string | null;
  lease_until: number | null;
};
type ConfirmationRow = {
  action: "confirmOrder" | "cancelOrder" | "requestReturn";
  input: string;
  snapshot: string;
  expires_at: string;
  state: "pending" | "confirmed" | "declined";
  result: string | null;
};

export class CustomerAssistant {
  private active = new Map<string, Promise<void>>();
  private evidence: CustomerEvidence;
  constructor(
    private business: Business,
    private auth: Auth,
    private models: CustomerModels = {},
  ) {
    this.evidence = new CustomerEvidence(business);
  }
  private get store() {
    return this.business.store;
  }
  settings(): AssistantSettings {
    return {
      defaultMode: "mock",
      liveAvailable: !!this.models.live,
      businessClock: this.business.clock.now(),
    };
  }
  private customer(context: ToolContext): Actor {
    if (context.agent !== "customer") throw new BusinessError("FORBIDDEN", 403);
    const actor = this.auth.authenticate(context.sessionToken);
    requireRole(actor, "customer");
    return {
      ...actor,
      roles: ["customer"],
      locale: context.locale ?? actor.locale,
    };
  }
  private owned(context: ToolContext, runId: string) {
    const actor = this.customer(context);
    const row = this.store.one<RequestRow>(
      "SELECT * FROM assistant_requests WHERE run_id=? AND actor_id=?",
      runId,
      actor.id,
    );
    if (!row) throw new BusinessError("CONVERSATION_NOT_FOUND", 404);
    return { actor, row };
  }
  private conversations(row: Pick<RequestRow, "mode" | "guided_action">) {
    const live = row.mode === "live" ? this.models.live : undefined;
    if (row.mode === "live" && !live)
      throw new BusinessError("ASSISTANT_LIVE_UNAVAILABLE", 409);
    const envelope = row.guided_action
      ? (JSON.parse(row.guided_action) as { action?: unknown })
      : null;
    const action = envelope?.action
      ? guidedAction.parse(envelope.action)
      : undefined;
    return new Conversations(
      this.store,
      new ToolDispatcher(this.business, this.auth),
      {
        mode: row.mode,
        id: live?.id ?? "relayops/customer-mock",
        adapter: live
          ? live.create()
          : (this.models.mock?.(action) ?? new CustomerMock(action)),
      },
    );
  }
  send(context: ToolContext, raw: unknown) {
    const actor = this.customer(context),
      input = assistantRequest.parse(raw);
    const bound: ToolContext = {
      agent: "customer",
      sessionToken: context.sessionToken,
      locale: input.locale,
    };
    if (input.mode === "live" && !this.models.live)
      throw new BusinessError("ASSISTANT_LIVE_UNAVAILABLE", 409);
    const { key: requestKey, ...body } = input;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const result = this.store.transaction(() => {
      const previous = this.store.one<RequestRow>(
        "SELECT * FROM assistant_requests WHERE actor_id=? AND request_key=?",
        actor.id,
        requestKey,
      );
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new BusinessError("IDEMPOTENCY_CONFLICT", 409);
        return previous;
      }
      if (
        input.mode === "live" &&
        (this.store.one(
          "SELECT run_id FROM assistant_requests WHERE mode='live' AND status!='done'",
        ) ||
          this.store.one(
            "SELECT run_id FROM procurement_requests WHERE json_extract(request,'$.mode')='live' AND status!='done'",
          ))
      )
        throw new BusinessError("ASSISTANT_LIVE_BUSY", 409);
      const since = new Date(
        Date.now() - (input.mode === "live" ? 3600000 : 60000),
      ).toISOString();
      const attempts = this.store.one<{ n: number }>(
        "SELECT COUNT(*) n FROM assistant_requests WHERE actor_id=? AND mode=? AND created_at>=?",
        actor.id,
        input.mode,
        since,
      )!.n;
      if (attempts >= (input.mode === "live" ? 6 : 20))
        throw new BusinessError("RATE_LIMITED", 429);
      const requestedAction = JSON.stringify({
        action: input.action ?? null,
        userText: input.userText,
      });
      const service = this.conversations({
        mode: input.mode,
        guided_action: requestedAction,
      });
      const text =
        input.action && input.mode === "live"
          ? `${input.userText}\nRequested action data: ${JSON.stringify(input.action)}`
          : input.userText;
      const prepared = service.prepare(
        bound,
        {
          userText: text,
          maxIterations: 4,
          maxTimeMs: 60000,
          maxTokens: 64000,
          maxOutputTokens: 512,
          maxRetries: 1,
        },
        input.conversationId,
      );
      this.store.run(
        "INSERT INTO assistant_requests VALUES(?,?,?,?,?,?,?,'queued',?)",
        actor.id,
        requestKey,
        fingerprint,
        prepared.runId,
        prepared.conversationId,
        input.mode,
        requestedAction,
        new Date().toISOString(),
      );
      return this.store.one<RequestRow>(
        "SELECT * FROM assistant_requests WHERE run_id=?",
        prepared.runId,
      )!;
    });
    // Only a newly queued request starts automatically. A repeated/lost HTTP request
    // returns the same ID; interrupted work requires an explicit authenticated resume.
    if (result.status === "queued" && !this.active.has(result.run_id))
      this.schedule(bound, result);
    return { conversationId: result.conversation_id, runId: result.run_id };
  }
  resume(context: ToolContext, runId: string) {
    const { row } = this.owned(context, runId);
    if (this.active.has(runId))
      return { conversationId: row.conversation_id, runId };
    const execution = this.store.one<ExecutionRow>(
      "SELECT * FROM agent_execution WHERE run_id=?",
      runId,
    )!;
    if (!execution.result && (execution.lease_until ?? 0) > Date.now())
      throw new BusinessError("AGENT_RUN_BUSY", 409);
    if (
      row.mode === "live" &&
      (this.store.one(
        "SELECT run_id FROM assistant_requests WHERE mode='live' AND status!='done' AND run_id!=?",
        runId,
      ) ||
        this.store.one(
          "SELECT run_id FROM procurement_requests WHERE json_extract(request,'$.mode')='live' AND status!='done'",
        ))
    )
      throw new BusinessError("ASSISTANT_LIVE_BUSY", 409);
    this.schedule(context, row);
    return { conversationId: row.conversation_id, runId };
  }
  private schedule(context: ToolContext, row: RequestRow) {
    const task = Promise.resolve()
      .then(async () => {
        this.store.run(
          "UPDATE assistant_requests SET status='running' WHERE run_id=?",
          row.run_id,
        );
        const completed = await this.conversations(row).resume(
          context,
          row.run_id,
        );
        this.finish(context, row, completed.result);
      })
      .catch(() => {
        // Checkpoint/usage remain durable. Polling exposes an interrupted state and
        // authenticated resume; no private exception or silent paid replay.
      })
      .finally(() => {
        this.active.delete(row.run_id);
      });
    this.active.set(row.run_id, task);
  }
  async idle() {
    await Promise.all([...this.active.values()]);
  }
  private finish(context: ToolContext, row: RequestRow, result: AgentResult) {
    if (result.status === "stopped") {
      this.store.run(
        "UPDATE assistant_requests SET status='done' WHERE run_id=?",
        row.run_id,
      );
      return;
    }
    const actor = this.customer(context);
    this.store.transaction(() => {
      if (
        result.status === "confirmation_required" &&
        !this.store.one(
          "SELECT run_id FROM assistant_confirmations WHERE run_id=?",
          row.run_id,
        )
      ) {
        const pending = result.pending;
        let snapshot: ConfirmationView["snapshot"];
        let expires = addHours(this.business.clock.now(), 0.25);
        if (pending.name === "confirmOrder") {
          const offer = this.store.one<{
            id: string;
            version: number;
            summary: string;
            expires_at: string;
          }>(
            "SELECT id,version,summary,expires_at FROM order_offers WHERE id=? AND customer_id=?",
            pending.input.offerId,
            actor.id,
          );
          if (!offer) throw new BusinessError("OFFER_NOT_FOUND", 404);
          const summary = JSON.parse(offer.summary) as ReturnType<
            Business["prepareOrder"]
          >["summary"];
          snapshot = {
            offer: {
              id: offer.id,
              version: offer.version,
              summary,
              expiresAt: offer.expires_at,
              supplyPromise: summary.supportedDelivery
                ? "supported"
                : "pending_supplier_confirmation",
            },
          };
          expires = offer.expires_at < expires ? offer.expires_at : expires;
        } else
          snapshot = {
            progress: this.evidence.order(actor, pending.input.orderId),
          };
        this.store.run(
          "INSERT INTO assistant_confirmations VALUES(?,?,?,?,?,'pending',NULL,NULL)",
          row.run_id,
          pending.name,
          JSON.stringify(pending),
          JSON.stringify(snapshot),
          expires,
        );
      }
      if (result.status === "escalation")
        this.handoff(
          actor,
          row.run_id,
          "customer_support",
          result.reason,
          null,
          {
            userText: this.userText(row),
            evidenceToolCallIds: result.evidenceToolCallIds,
          },
        );
      this.store.run(
        "UPDATE assistant_requests SET status='done' WHERE run_id=?",
        row.run_id,
      );
    });
  }
  private userText(row: RequestRow) {
    if (row.guided_action)
      return (JSON.parse(row.guided_action) as { userText: string }).userText;
    const state = JSON.parse(
      this.store.one<ExecutionRow>(
        "SELECT state FROM agent_execution WHERE run_id=?",
        row.run_id,
      )!.state,
    ) as RunState;
    // Live guided data is internal request context. Display its original human text.
    return state.request.userText;
  }
  private handoff(
    actor: Actor,
    runId: string,
    queue: HandoffView["queue"],
    reason: string,
    caseId: string | null,
    requirements: unknown,
  ) {
    this.store.run(
      "INSERT INTO assistant_handoffs VALUES(?,?,?,?,?,?,?,'open',?) ON CONFLICT(run_id,queue) DO NOTHING",
      randomUUID(),
      runId,
      actor.id,
      queue,
      reason,
      caseId,
      JSON.stringify(requirements),
      this.business.clock.now(),
    );
  }
  decide(context: ToolContext, runId: string, raw: unknown) {
    const { actor, row } = this.owned(context, runId);
    const decision = z
      .strictObject({
        decision: z.enum(["confirm", "decline"]),
        confirmed: z.literal(true),
      })
      .parse(raw);
    return this.store.transaction(() => {
      const pending = this.store.one<ConfirmationRow>(
        "SELECT * FROM assistant_confirmations WHERE run_id=?",
        runId,
      );
      if (!pending)
        throw new BusinessError("ASSISTANT_CONFIRMATION_NOT_FOUND", 404);
      const next = decision.decision === "confirm" ? "confirmed" : "declined";
      if (pending.state !== "pending") {
        if (pending.state !== next)
          throw new BusinessError("ASSISTANT_DECISION_CONFLICT", 409);
        return this.turn(context, runId);
      }
      if (pending.expires_at <= this.business.clock.now())
        throw new BusinessError("CONSENT_EXPIRED", 409);
      const original = JSON.parse(pending.input) as Extract<
        ToolResult,
        { status: "confirmation_required" }
      >;
      let result: ConfirmationView["result"];
      if (next === "confirmed") {
        const key = `assistant-confirm:${runId}`;
        if (original.name === "confirmOrder") {
          const order = this.business.confirmOrder(actor, {
            ...original.input,
            key,
            confirmed: true,
          });
          const progress = this.evidence.order(actor, order.id);
          result = { orderId: order.id, status: order.status, progress };
          const snapshot = JSON.parse(
            pending.snapshot,
          ) as ConfirmationView["snapshot"];
          for (const shortage of progress.cases.filter(
            (c) => c.status === "open",
          ))
            this.handoff(
              actor,
              runId,
              "procurement_review",
              "shortage",
              shortage.id,
              {
                orderId: order.id,
                offerId: original.input.offerId,
                version: original.input.version,
                acceptedRequirements: snapshot.offer?.summary,
                shortageQuantity: shortage.quantity,
              },
            );
        } else if (original.name === "cancelOrder") {
          toolContracts.cancelOrder.input.parse(original.input);
          const order = this.business.cancelOrder(
            actor,
            original.input.orderId,
            { reason: original.input.reason, key },
          );
          result = {
            orderId: order.id,
            status: order.status,
            progress: this.evidence.order(actor, order.id),
          };
        } else {
          const returned = this.business.requestReturn(actor, {
            ...original.input,
            key,
          });
          result = {
            returnId: returned.id,
            orderId: original.input.orderId,
            status: returned.status,
          };
        }
      }
      this.store.run(
        "UPDATE assistant_confirmations SET state=?,result=?,decided_at=? WHERE run_id=? AND state='pending'",
        next,
        result ? JSON.stringify(result) : null,
        this.business.clock.now(),
        runId,
      );
      // Human business observation is retained for later turns, never inferred from
      // model prose. It grants no future consent and starts no inference by itself.
      const conversation = this.store.one<{ messages: string }>(
        "SELECT messages FROM agent_conversations WHERE id=?",
        row.conversation_id,
      )!;
      const messages = JSON.parse(conversation.messages) as {
        role: string;
        content: string;
      }[];
      messages.push({
        role: "assistant",
        content: JSON.stringify({
          kind: "human_decision",
          runId,
          decision: next,
          result: result ?? null,
        }),
      });
      this.store.run(
        "UPDATE agent_conversations SET messages=?,updated_at=? WHERE id=?",
        JSON.stringify(messages),
        new Date().toISOString(),
        row.conversation_id,
      );
      this.business.audit(actor, `assistant.${next}`, runId, {
        action: original.name,
        result: result ?? null,
      });
      return this.turn(context, runId);
    });
  }
  list(context: ToolContext): ConversationSummary[] {
    const actor = this.customer(context);
    return this.store
      .all<{ id: string; locale: Locale; updated_at: string; run_id: string }>(
        "SELECT c.id,c.locale,c.updated_at,(SELECT r.run_id FROM assistant_requests r WHERE r.conversation_id=c.id ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1) run_id FROM agent_conversations c WHERE c.actor_id=? AND c.agent='customer' AND EXISTS(SELECT 1 FROM assistant_requests r WHERE r.conversation_id=c.id) ORDER BY c.updated_at DESC,c.id LIMIT 50",
        actor.id,
      )
      .map((c) => ({
        id: c.id,
        locale: c.locale,
        updatedAt: c.updated_at,
        lastText: this.userText(
          this.store.one<RequestRow>(
            "SELECT * FROM assistant_requests WHERE run_id=?",
            c.run_id,
          )!,
        ).slice(0, 100),
      }));
  }
  detail(context: ToolContext, conversationId: string): AssistantConversation {
    const actor = this.customer(context);
    if (
      !this.store.one(
        "SELECT id FROM agent_conversations WHERE id=? AND actor_id=? AND agent='customer'",
        conversationId,
        actor.id,
      )
    )
      throw new BusinessError("CONVERSATION_NOT_FOUND", 404);
    return {
      id: conversationId,
      turns: this.store
        .all<{ run_id: string }>(
          "SELECT run_id FROM assistant_requests WHERE conversation_id=? AND actor_id=? ORDER BY created_at,rowid",
          conversationId,
          actor.id,
        )
        .map((r) => this.turn(context, r.run_id)),
    };
  }
  turn(context: ToolContext, runId: string): AssistantTurn {
    const { row } = this.owned(context, runId);
    const execution = this.store.one<ExecutionRow>(
      "SELECT * FROM agent_execution WHERE run_id=?",
      runId,
    )!;
    const state = JSON.parse(execution.state) as RunState;
    const result = execution.result
      ? (JSON.parse(execution.result) as AgentResult)
      : null;
    const finished = row.status === "done" && !!result;
    const turn: AssistantTurn = {
      runId,
      userText: this.userText(row),
      mode: row.mode,
      status: finished
        ? result!.status
        : this.active.has(runId)
          ? "running"
          : "interrupted",
      phase: state.phase,
      canResume:
        !finished &&
        !this.active.has(runId) &&
        (execution.lease_until ?? 0) <= Date.now(),
      tools: state.steps.flatMap((s) =>
        s.toolResults.map((r) => ({
          id: r.toolCallId ?? "unknown",
          name:
            s.completion.toolCalls.find((c) => c.id === r.toolCallId)?.function
              .name ?? "unknown",
          status: r.status,
          ...(r.status === "rejected" ? { code: r.error.code } : {}),
        })),
      ),
      evidence: state.steps
        .flatMap((s) => s.toolResults)
        .filter(
          (r): r is Extract<ToolResult, { status: "completed" }> =>
            r.status === "completed",
        ),
      handoffs: this.store
        .all<{
          id: string;
          queue: HandoffView["queue"];
          reason: string;
          case_id: string | null;
          status: string;
          created_at: string;
        }>(
          "SELECT id,queue,reason,case_id,status,created_at FROM assistant_handoffs WHERE run_id=? AND actor_id=? ORDER BY created_at,id",
          runId,
          row.actor_id,
        )
        .map((r) => ({
          id: r.id,
          queue: r.queue,
          reason: r.reason,
          caseId: r.case_id,
          status: r.status,
          createdAt: r.created_at,
        })),
    };
    if (finished && result) {
      if (result.status === "stopped")
        turn.outcome = { code: result.error.code };
      else if (result.status === "clarification")
        turn.outcome = {
          question: result.question,
          missingFields: result.missingFields,
        };
      else if (result.status === "completion" || result.status === "escalation")
        turn.outcome = { message: result.message };
    }
    const pending = this.store.one<ConfirmationRow>(
      "SELECT * FROM assistant_confirmations WHERE run_id=?",
      runId,
    );
    if (pending)
      turn.confirmation = {
        ...JSON.parse(pending.input),
        state: pending.state,
        expiresAt: pending.expires_at,
        snapshot: JSON.parse(pending.snapshot),
        ...(pending.result ? { result: JSON.parse(pending.result) } : {}),
      } as ConfirmationView;
    return turn;
  }
  staffHandoffs(actor: Actor) {
    requireRole(actor, "operator", "owner");
    return this.store.all(
      "SELECT id,run_id,queue,reason,case_id,status,created_at FROM assistant_handoffs ORDER BY created_at DESC,id LIMIT 100",
    );
  }
  help(context: ToolContext, runId: string, raw: unknown) {
    z.strictObject({}).parse(raw);
    const { actor, row } = this.owned(context, runId);
    this.store.transaction(() => {
      this.handoff(actor, runId, "customer_support", "manual_help", null, {
        userText: this.userText(row),
      });
    });
    return this.turn(context, runId);
  }
}
