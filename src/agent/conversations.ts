import { randomUUID } from "node:crypto";
import { Store } from "../db/database.js";
import { BusinessError, id } from "../shared/contracts.js";
import type { CompletionInput, UsageObservation } from "../model/openrouter.js";
import {
  AgentLoop,
  runRequest,
  type AgentModel,
  type AgentResult,
  type RunPersistence,
  type RunRequest,
  type RunState,
} from "./loop.js";
import { ToolDispatcher, type ToolContext } from "./tools.js";

type Scope = ReturnType<ReturnType<ToolDispatcher["bind"]>["scope"]>;
type Conversation = {
  id: string;
  actor_id: string;
  agent: Scope["agent"];
  case_id: string | null;
  locale: Scope["locale"];
  messages: string;
  active_run_id: string | null;
};
type Execution = {
  run_id: string;
  conversation_id: string;
  state: string;
  result: string | null;
  lease_token: string | null;
  lease_until: number | null;
};
export type ConversationRun = {
  conversationId: string;
  runId: string;
  result: AgentResult;
};

// Internal authenticated service. It deliberately exposes no HTTP endpoint or automatic live fallback.
export class Conversations {
  constructor(
    private store: Store,
    private dispatcher: ToolDispatcher,
    private model: { mode: "mock" | "live"; id: string; adapter: AgentModel },
    private wallTime = () => Date.now(),
  ) {}
  private scope(context: ToolContext) {
    return this.dispatcher.bind(context).scope();
  }
  private conversation(scope: Scope, conversationId: string) {
    id.parse(conversationId);
    const row = this.store.one<Conversation>(
      "SELECT * FROM agent_conversations WHERE id=?",
      conversationId,
    );
    if (
      !row ||
      row.actor_id !== scope.actorId ||
      row.agent !== scope.agent ||
      row.case_id !== scope.caseId
    )
      throw new BusinessError("CONVERSATION_NOT_FOUND", 404);
    return row;
  }
  // Only selected safe summary fields. Private transcripts remain server-side.
  list(context: ToolContext) {
    const scope = this.scope(context);
    return this.store.all<{
      id: string;
      locale: string;
      active_run_id: string | null;
      updated_at: string;
    }>(
      "SELECT id,locale,active_run_id,updated_at FROM agent_conversations WHERE actor_id=? AND agent=? AND case_id IS ? ORDER BY updated_at DESC,id",
      scope.actorId,
      scope.agent,
      scope.caseId,
    );
  }
  async start(
    context: ToolContext,
    raw: RunRequest,
    conversationId?: string,
  ): Promise<ConversationRun> {
    const prepared = this.prepare(context, raw, conversationId);
    return this.resume(context, prepared.runId);
  }
  // Queue a turn synchronously; HTTP can persist its request key in this same
  // transaction, then execute/poll outside the SQLite transaction.
  prepare(context: ToolContext, raw: RunRequest, conversationId?: string) {
    const request = runRequest.safeParse(raw);
    if (!request.success) throw new BusinessError("AGENT_INPUT_INVALID", 400);
    const scope = this.scope(context),
      runId = randomUUID();
    const selectedId = conversationId ?? randomUUID();
    this.store.transaction(() => {
      const timestamp = new Date(this.wallTime()).toISOString();
      if (!conversationId)
        this.store.run(
          "INSERT INTO agent_conversations VALUES(?,?,?,?,?,?,NULL,?,?)",
          selectedId,
          scope.actorId,
          scope.agent,
          scope.caseId,
          scope.locale,
          "[]",
          timestamp,
          timestamp,
        );
      const row = this.conversation(scope, selectedId);
      if (row.active_run_id) throw new BusinessError("CONVERSATION_BUSY", 409);
      const history = JSON.parse(row.messages) as CompletionInput["messages"];
      const state: RunState = {
        version: 1,
        request: request.data,
        messages: [
          { role: "system", content: "" },
          ...history,
          { role: "user", content: request.data.userText },
        ],
        steps: [],
        iterations: 0,
        retries: 0,
        seenIds: [],
        elapsedMs: 0,
        tokenAllowanceSpent: 0,
        toolIndex: 0,
        phase: "ready",
      };
      // This links procurement diagnostics to the case without advancing its business process.
      let processId: string | null = null;
      if (scope.caseId) {
        processId = randomUUID();
        this.store.run(
          "INSERT INTO processes VALUES(?,?,'ready',?,1,?)",
          processId,
          scope.caseId,
          JSON.stringify({
            kind: "agent_turn",
            businessProcessCompleted: false,
          }),
          timestamp,
        );
      }
      this.store.run(
        "INSERT INTO agent_runs VALUES(?,?,?,?,?,?,'running',?,?)",
        runId,
        processId,
        scope.actorId,
        scope.agent,
        this.model.mode,
        this.model.id,
        JSON.stringify({ kind: "agent_turn", phase: "ready" }),
        timestamp,
      );
      this.store.run(
        "INSERT INTO agent_execution VALUES(?,?,?,NULL,?,?,?)",
        runId,
        selectedId,
        JSON.stringify(state),
        null,
        null,
        timestamp,
      );
      this.store.run(
        "UPDATE agent_conversations SET active_run_id=?,locale=?,updated_at=? WHERE id=?",
        runId,
        scope.locale,
        timestamp,
        selectedId,
      );
    });
    return { conversationId: selectedId, runId };
  }
  async resume(context: ToolContext, runId: string): Promise<ConversationRun> {
    id.parse(runId);
    const scope = this.scope(context),
      token = randomUUID();
    const execution = this.store.transaction(() => {
      const row = this.store.one<Execution>(
        "SELECT * FROM agent_execution WHERE run_id=?",
        runId,
      );
      if (!row) throw new BusinessError("CONVERSATION_NOT_FOUND", 404);
      this.conversation(scope, row.conversation_id);
      const run = this.store.one<{ mode: string; model: string }>(
        "SELECT mode,model FROM agent_runs WHERE id=?",
        runId,
      )!;
      if (run.mode !== this.model.mode || run.model !== this.model.id)
        throw new BusinessError("AGENT_MODEL_MISMATCH", 409);
      if (row.result) return row;
      if (row.lease_token && (row.lease_until ?? 0) > this.wallTime())
        throw new BusinessError("AGENT_RUN_BUSY", 409);
      this.store.run(
        "UPDATE agent_execution SET lease_token=?,lease_until=? WHERE run_id=?",
        token,
        this.wallTime() + 150000,
        runId,
      );
      return row;
    });
    if (execution.result)
      return {
        conversationId: execution.conversation_id,
        runId,
        result: JSON.parse(execution.result) as AgentResult,
      };
    return this.execute(
      context,
      execution.conversation_id,
      runId,
      token,
      JSON.parse(execution.state) as RunState,
    );
  }
  private async execute(
    context: ToolContext,
    conversationId: string,
    runId: string,
    token: string,
    state: RunState,
  ): Promise<ConversationRun> {
    const scope = this.scope(context);
    // Preserve locale from the authenticated current request, including on restart.
    const boundContext: ToolContext = { ...context, locale: scope.locale };
    const guard = () => {
      if (
        !this.store.one(
          "SELECT run_id FROM agent_execution WHERE run_id=? AND lease_token=?",
          runId,
          token,
        )
      )
        throw new BusinessError("AGENT_LEASE_LOST", 409);
    };
    const save = (state: RunState) => {
      guard();
      if (state.steps.some((s) => s.completion.mode !== this.model.mode))
        throw new Error("AGENT_MODEL_MISMATCH");
      this.store.run(
        "UPDATE agent_execution SET state=?,lease_until=?,updated_at=? WHERE run_id=? AND lease_token=?",
        JSON.stringify(state),
        this.wallTime() + 150000,
        new Date(this.wallTime()).toISOString(),
        runId,
        token,
      );
      this.store.run(
        "UPDATE agent_runs SET checkpoint=? WHERE id=?",
        JSON.stringify({
          kind: "agent_turn",
          phase: state.phase,
          iterations: state.iterations,
          retries: state.retries,
          elapsedMs: state.elapsedMs,
          tokenAllowanceSpent: state.tokenAllowanceSpent,
        }),
        runId,
      );
    };
    const usage = (r: UsageObservation) =>
      this.store.run(
        `INSERT INTO model_usage VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
       input_tokens=COALESCE(excluded.input_tokens,model_usage.input_tokens),output_tokens=COALESCE(excluded.output_tokens,model_usage.output_tokens),
       cost_microusd=COALESCE(excluded.cost_microusd,model_usage.cost_microusd),provider_request_id=COALESCE(excluded.provider_request_id,model_usage.provider_request_id)
       WHERE model_usage.run_id=excluded.run_id`,
        r.attemptId,
        runId,
        r.inputTokens,
        r.outputTokens,
        r.costMicroUsd,
        r.providerRequestId,
      );
    const persistence: RunPersistence = {
      save: (s) => this.store.transaction(() => save(s)),
      atomic: (action) =>
        this.store.transaction(() => {
          guard();
          return action();
        }),
      usage,
      tool: (call, result) => {
        // Provider IDs are unique within a run, not across unrelated conversations.
        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments) as unknown;
        } catch {
          args = { invalidJson: call.function.arguments };
        }
        this.store.run(
          "INSERT INTO tool_calls VALUES(?,?,?,?,?,?,?)",
          `${runId}:${call.id}`,
          runId,
          call.function.name,
          JSON.stringify(args),
          JSON.stringify(result),
          result.status,
          call.id,
        );
      },
      finish: (result, s) =>
        this.store.transaction(() => {
          save(s);
          this.store.run(
            "UPDATE agent_execution SET result=? WHERE run_id=?",
            JSON.stringify(result),
            runId,
          );
          this.store.run(
            "UPDATE agent_runs SET status=? WHERE id=?",
            result.status,
            runId,
          );
          const row = this.conversation(scope, conversationId);
          const messages = JSON.parse(
            row.messages,
          ) as CompletionInput["messages"];
          const outcome = Object.fromEntries(
            Object.entries(result).filter(
              ([key]) => key !== "steps" && key !== "iterations",
            ),
          );
          messages.push(
            { role: "user", content: s.request.userText },
            { role: "assistant", content: JSON.stringify(outcome) },
          );
          this.store.run(
            "UPDATE agent_conversations SET messages=?,active_run_id=NULL,locale=?,updated_at=? WHERE id=? AND active_run_id=?",
            JSON.stringify(messages),
            scope.locale,
            new Date(this.wallTime()).toISOString(),
            conversationId,
            runId,
          );
        }),
    };
    try {
      const result = await new AgentLoop(
        this.model.adapter,
        this.dispatcher,
      ).run(boundContext, state.request, persistence, state);
      return { conversationId, runId, result };
    } finally {
      this.store.run(
        "UPDATE agent_execution SET lease_token=NULL,lease_until=NULL WHERE run_id=? AND lease_token=?",
        runId,
        token,
      );
    }
  }
}
