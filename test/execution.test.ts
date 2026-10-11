import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Store } from "../src/db/database.js";
import { DEMO_PASSWORD, seed, resetDemo } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Operations } from "../src/domain/operations.js";
import { FIXTURE_TIME } from "../src/shared/time.js";
import { BusinessError } from "../src/shared/contracts.js";
import { ToolDispatcher } from "../src/agent/tools.js";
import {
  AgentLoop,
  type AgentModel,
  type AgentResult,
  type RunState,
} from "../src/agent/loop.js";
import { Conversations } from "../src/agent/conversations.js";
import { MockModel, type MockResponse } from "../src/model/mock.js";
import { OpenRouter } from "../src/model/openrouter.js";
import { ModelBudget } from "../src/model/budget.js";
import { modelConfig } from "../src/model/config.js";

const modelId = "relayops/deterministic-mock";
const call = (id: string, name: string, args: unknown) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});
const observation = (
  ...toolCalls: MockResponse["toolCalls"]
): MockResponse => ({ content: null, toolCalls, finishReason: "tool_calls" });
const terminal = (content: unknown): MockResponse => ({
  content: JSON.stringify(content),
  toolCalls: [],
  finishReason: "stop",
});
const completion = (...ids: string[]) =>
  terminal({
    status: "completion",
    message: "Stored evidence.",
    evidenceToolCallIds: ids,
  });
const clarification = terminal({
  status: "clarification",
  question: "Which quantity?",
  missingFields: ["quantity"],
  evidenceToolCallIds: [],
});
const prepare = {
  productId: "PC-MINI-16",
  quantity: 1,
  deadline: "2026-10-20",
  destination: "baku",
  allowPartial: false,
  allowSubstitution: false,
};
function fixture(t: TestContext, path = ":memory:") {
  const store = new Store(path);
  store.migrate();
  seed(store);
  t.after(() => store.close());
  const auth = new Auth(store),
    business = new Business(store, { now: () => FIXTURE_TIME });
  const dispatcher = new ToolDispatcher(business, auth);
  const context = (account = "customer-a", locale: "en" | "az" = "en") => {
    const sessionToken = auth.login({
      email: `${account}@relayops.example`,
      password: DEMO_PASSWORD,
    }).token;
    return account.startsWith("customer")
      ? { agent: "customer" as const, sessionToken, locale }
      : {
          agent: "procurement" as const,
          sessionToken,
          locale,
          caseId: "fixture-006",
        };
  };
  const service = (
    adapter: AgentModel,
    wallTime?: () => number,
    mode: "live" | "mock" = "mock",
    model = modelId,
  ) =>
    new Conversations(
      store,
      dispatcher,
      { mode, id: model, adapter },
      wallTime,
    );
  return { store, auth, business, dispatcher, context, service };
}
function stopped(result: AgentResult, code: string) {
  assert.equal(result.status, "stopped");
  if (result.status !== "stopped") throw new Error("Expected stop");
  assert.equal(result.error.code, code);
}
function temporary() {
  const directory = mkdtempSync(join(tmpdir(), "relayops-agent-"));
  return join(directory, "execution.sqlite");
}
function cleanup(t: TestContext, path: string) {
  const directory = dirname(path);
  assert.equal(dirname(directory), tmpdir());
  assert.ok(basename(directory).startsWith("relayops-agent-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
}

test("unknown token counts consume conservative admission allowances without becoming actual usage", async (t) => {
  const f = fixture(t),
    context = f.context();
  const run = await f
    .service(
      new MockModel([
        observation(call("prepare", "prepareOrder", prepare)),
        completion("prepare"),
      ]),
    )
    .start(context, { userText: "Test", maxTokens: 16000 });
  stopped(run.result, "AGENT_TOKEN_LIMIT");
  assert.equal(run.result.iterations, 1);
  assert.equal(run.result.steps[0]?.toolResults[0]?.status, "completed");
  const usage = f.store.one<{
    input_tokens: number | null;
    output_tokens: number | null;
  }>(
    "SELECT input_tokens,output_tokens FROM model_usage WHERE run_id=?",
    run.runId,
  )!;
  assert.equal(usage.input_tokens, null);
  assert.equal(usage.output_tokens, null);
});

test("retry backoff is covered by the aggregate deadline", async (t) => {
  const f = fixture(t),
    context = f.context();
  const result = await new AgentLoop(
    new MockModel([new Error("MODEL_CATALOGUE_UNAVAILABLE"), clarification]),
    f.dispatcher,
  ).run(context, { userText: "Test", maxTimeMs: 10, maxRetries: 2 });
  stopped(result, "AGENT_TIME_LIMIT");
  assert.equal(result.iterations, 1);
});

test("a transient lock before the outer tool transaction is retried without replaying a committed effect", async (t) => {
  const f = fixture(t),
    context = f.context();
  const transaction = f.store.transaction.bind(f.store);
  let failed = false;
  f.store.transaction = <T>(action: () => T): T => {
    const row = f.store.one<{ state: string }>(
      "SELECT state FROM agent_execution LIMIT 1",
    );
    const state = row ? (JSON.parse(row.state) as RunState) : undefined;
    if (!failed && state?.phase === "tools" && state.toolIndex === 0) {
      failed = true;
      throw Object.assign(new Error("locked before BEGIN"), { errcode: 5 });
    }
    return transaction(action);
  };
  const run = await f
    .service(
      new MockModel([
        observation(call("prepare", "prepareOrder", prepare)),
        completion("prepare"),
      ]),
    )
    .start(context, { userText: "Test", maxRetries: 1 });
  assert.ok(failed);
  assert.equal(run.result.status, "completion");
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM order_offers WHERE customer_id='customer-a' AND consumed_order_id IS NULL",
    )!.n,
    1,
  );
});

test("conversation history never turns a previous run's tool ID into current completion evidence", async (t) => {
  const f = fixture(t),
    context = f.context();
  const first = await f
    .service(
      new MockModel([
        observation(
          call("old-evidence", "searchProducts", {
            query: "RelaySwitch",
            locale: "en",
          }),
        ),
        completion("old-evidence"),
      ]),
    )
    .start(context, { userText: "Catalog" });
  assert.equal(first.result.status, "completion");
  const second = await f
    .service(new MockModel([completion("old-evidence")]))
    .start(context, { userText: "New turn" }, first.conversationId);
  stopped(second.result, "AGENT_EVIDENCE_INVALID");
});

test("run token admission refuses paid work; reported token/output overruns stop before tools", async (t) => {
  const f = fixture(t),
    context = f.context();
  let calls = 0;
  const mock = new MockModel([
    observation(call("prepare", "prepareOrder", prepare)),
  ]);
  const model: AgentModel = {
    async complete(input, options) {
      calls++;
      assert.equal(options?.maxOutputTokens, 100);
      const r = await mock.complete(input, options);
      return {
        ...r,
        usage: { inputTokens: 64000, outputTokens: 101, costMicroUsd: 0 },
      };
    },
  };
  const loop = new AgentLoop(model, f.dispatcher);
  stopped(
    await loop.run(context, { userText: "Test", maxTokens: 64 }),
    "AGENT_TOKEN_LIMIT",
  );
  assert.equal(calls, 0);
  stopped(
    await loop.run(context, { userText: "Test", maxOutputTokens: 100 }),
    "AGENT_TOKEN_LIMIT",
  );
  assert.equal(calls, 1);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM order_offers WHERE customer_id='customer-a' AND consumed_order_id IS NULL",
    )!.n,
    0,
  );
});

test("aggregate time prevents late tool effects even when a model ignores abort", async (t) => {
  const f = fixture(t),
    context = f.context();
  const mock = new MockModel([
    observation(call("prepare", "prepareOrder", prepare)),
  ]);
  let aborted = false;
  const model: AgentModel = {
    async complete(input, options) {
      options?.signal?.addEventListener("abort", () => {
        aborted = true;
      });
      await new Promise((r) => setTimeout(r, 80));
      return mock.complete(input);
    },
  };
  stopped(
    await new AgentLoop(model, f.dispatcher).run(context, {
      userText: "Test",
      maxTimeMs: 10,
    }),
    "AGENT_TIME_LIMIT",
  );
  assert.equal(aborted, true);
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM order_offers WHERE customer_id='customer-a' AND consumed_order_id IS NULL",
    )!.n,
    0,
  );
});

test("pre-billing catalogue failures retry within shared iteration/retry/deadline limits", async (t) => {
  const f = fixture(t),
    context = f.context();
  const result = await f
    .service(
      new MockModel([new Error("MODEL_CATALOGUE_UNAVAILABLE"), clarification]),
    )
    .start(context, { userText: "Test", maxRetries: 1 });
  assert.equal(result.result.status, "clarification");
  assert.equal(result.result.iterations, 2);
  const state = JSON.parse(
    f.store.one<{ state: string }>(
      "SELECT state FROM agent_execution WHERE run_id=?",
      result.runId,
    )!.state,
  ) as RunState;
  assert.equal(state.retries, 1);
  const exhausted = await f
    .service(
      new MockModel([
        new Error("MODEL_CATALOGUE_UNAVAILABLE"),
        new Error("MODEL_CATALOGUE_UNAVAILABLE"),
        clarification,
      ]),
    )
    .start(context, { userText: "Test", maxRetries: 1 });
  stopped(exhausted.result, "MODEL_CATALOGUE_UNAVAILABLE");
  assert.equal(exhausted.result.iterations, 2);
});

test("ambiguous billable/auth/response failures never retry or silently fall back to mock", async (t) => {
  const f = fixture(t),
    context = f.context();
  for (const code of [
    "MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN",
    "MODEL_PROVIDER_FAILED_CHARGE_UNKNOWN",
    "MODEL_RESPONSE_INVALID",
    "MODEL_AUTHENTICATION_FAILED",
  ]) {
    const run = await f
      .service(new MockModel([new Error(code), clarification]))
      .start(context, { userText: "Test", maxRetries: 2 });
    stopped(run.result, code);
    assert.equal(run.result.iterations, 1);
  }
});

test("transient SQLite tool failures retry after rollback, once, without duplicate offers", async (t) => {
  const f = fixture(t),
    context = f.context();
  let attempts = 0;
  const audit = f.business.audit.bind(f.business);
  f.business.audit = (...args) => {
    audit(...args);
    if (++attempts === 1)
      throw Object.assign(new Error("locked"), { errcode: 5 });
  };
  const run = await f
    .service(
      new MockModel([
        observation(call("prepare", "prepareOrder", prepare)),
        completion("prepare"),
      ]),
    )
    .start(context, { userText: "Test", maxRetries: 1 });
  assert.equal(run.result.status, "completion");
  assert.equal(attempts, 2);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM order_offers WHERE customer_id='customer-a' AND consumed_order_id IS NULL",
    )!.n,
    1,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM tool_calls WHERE run_id=?",
      run.runId,
    )!.n,
    1,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_events WHERE actor_id='customer-a' AND action='order.offer_prepared'",
    )!.n,
    1,
  );
});

test("exhausted transient tool failures stop and rollback every attempted effect", async (t) => {
  const f = fixture(t),
    context = f.context();
  let attempts = 0;
  f.business.audit = () => {
    attempts++;
    throw Object.assign(new Error("locked"), { errcode: 5 });
  };
  const run = await f
    .service(
      new MockModel([
        observation(
          call("prepare", "prepareOrder", prepare),
          call("later", "searchProducts", { query: "" }),
        ),
      ]),
    )
    .start(context, { userText: "Test", maxRetries: 1 });
  stopped(run.result, "TOOL_TEMPORARILY_UNAVAILABLE");
  assert.equal(attempts, 2);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM order_offers WHERE customer_id='customer-a' AND consumed_order_id IS NULL",
    )!.n,
    0,
  );
  assert.deepEqual(run.result.steps[0]?.skippedToolCallIds, ["later"]);
});

test("evidence persistence failure rolls back the business write and audit in the same transaction", async (t) => {
  const f = fixture(t),
    context = f.context();
  f.store.db.exec(
    "CREATE TEMP TRIGGER reject_tool_record BEFORE INSERT ON tool_calls BEGIN SELECT RAISE(ABORT,'fixture'); END;",
  );
  const run = await f
    .service(
      new MockModel([observation(call("prepare", "prepareOrder", prepare))]),
    )
    .start(context, { userText: "Test" });
  stopped(run.result, "AGENT_INTERNAL_ERROR");
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM order_offers WHERE customer_id='customer-a' AND consumed_order_id IS NULL",
    )!.n,
    0,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM tool_calls WHERE run_id=?",
      run.runId,
    )!.n,
    0,
  );
  assert.deepEqual(run.result.steps[0]?.toolResults, []);
});

test("a process crash after preparation resumes the remaining batch after reopening SQLite without replay", async (t) => {
  const path = temporary();
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "test/fixtures/agent-crash.ts", path, "tools"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(child.status, 0, child.stderr);
  const f = fixture(t, path),
    context = f.context();
  cleanup(t, path);
  const runId = f.store.one<{ run_id: string }>(
    "SELECT run_id FROM agent_execution",
  )!.run_id;
  const early = f.service(new MockModel([completion("prepare", "catalog")]));
  await assert.rejects(
    early.resume(context, runId),
    (e) => e instanceof BusinessError && e.code === "AGENT_RUN_BUSY",
  );
  const run = await f
    .service(
      new MockModel([completion("prepare", "catalog")]),
      () => Date.now() + 150001,
    )
    .resume(context, runId);
  assert.equal(run.result.status, "completion");
  assert.equal(run.result.iterations, 2);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM order_offers WHERE customer_id='customer-a' AND consumed_order_id IS NULL",
    )!.n,
    1,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM tool_calls WHERE run_id=?",
      runId,
    )!.n,
    2,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_events WHERE actor_id='customer-a' AND action='order.offer_prepared'",
    )!.n,
    1,
  );
  assert.equal(
    (await early.resume(context, runId)).result.status,
    "completion",
  );
});

test("restart after a committed confirmation result never executes skipped calls or grants consent", async (t) => {
  const path = temporary();
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "test/fixtures/agent-crash.ts", path, "confirmation"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(child.status, 0, child.stderr);
  const f = fixture(t, path),
    context = f.context();
  cleanup(t, path);
  const runId = f.store.one<{ run_id: string }>(
    "SELECT run_id FROM agent_execution",
  )!.run_id;
  const run = await f
    .service(new MockModel([]), () => Date.now() + 150001)
    .resume(context, runId);
  assert.equal(run.result.status, "confirmation_required");
  assert.deepEqual(run.result.steps[0]?.skippedToolCallIds, ["catalog"]);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM tool_calls WHERE run_id=?",
      runId,
    )!.n,
    1,
  );
  assert.equal(
    f.business.getOrder(f.auth.actor("customer-a"), "demo-delivered-order")
      .status,
    "delivered",
  );
});

test("an interrupted in-flight model request stops after restart without another provider attempt", async (t) => {
  const path = temporary();
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "test/fixtures/agent-crash.ts", path, "model"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(child.status, 0, child.stderr);
  const f = fixture(t, path),
    context = f.context();
  cleanup(t, path);
  const runId = f.store.one<{ run_id: string }>(
    "SELECT run_id FROM agent_execution",
  )!.run_id;
  const run = await f
    .service(new MockModel([]), () => Date.now() + 150001)
    .resume(context, runId);
  stopped(run.result, "AGENT_INTERRUPTED_MODEL_CALL");
  assert.equal(run.result.iterations, 1);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM tool_calls WHERE run_id=?",
      runId,
    )!.n,
    0,
  );
});

test("conversation history survives later turns, locale changes and cached resume with fresh ownership checks", async (t) => {
  const f = fixture(t),
    context = f.context();
  const first = await f
    .service(new MockModel({ scenario: "clarification" }))
    .start(context, { userText: "Initial requirement" });
  let checked = false;
  const model = new MockModel([
    (input) => {
      checked = true;
      assert.ok(
        input.messages[0]?.content?.includes("Respond in Azerbaijani."),
      );
      assert.ok(
        input.messages.some((m) => m.content === "Initial requirement"),
      );
      assert.ok(!JSON.stringify(input).includes(context.sessionToken));
      return clarification;
    },
  ]);
  const second = await f
    .service(model)
    .start(
      { ...context, locale: "az" },
      { userText: "Follow-up requirement" },
      first.conversationId,
    );
  assert.ok(checked);
  assert.equal(second.conversationId, first.conversationId);
  const cached = await f
    .service(new MockModel([]))
    .resume(context, first.runId);
  assert.deepEqual(cached.result, first.result);
  const foreign = f.context("customer-b");
  for (const action of [
    () => f.service(new MockModel([])).resume(foreign, first.runId),
    () =>
      f
        .service(new MockModel([]))
        .start(foreign, { userText: "Test" }, first.conversationId),
  ])
    await assert.rejects(
      action(),
      (e) => e instanceof BusinessError && e.code === "CONVERSATION_NOT_FOUND",
    );
  f.auth.logout(context.sessionToken);
  await assert.rejects(
    f.service(new MockModel([])).resume(context, first.runId),
    (e) => e instanceof BusinessError && e.code === "UNAUTHORIZED",
  );
  assert.ok(
    !f.store
      .one<{ state: string }>(
        "SELECT state FROM agent_execution WHERE run_id=?",
        first.runId,
      )!
      .state.includes(context.sessionToken),
  );
});

test("one active run per conversation prevents concurrent follow-ups/resume and model changes", async (t) => {
  const f = fixture(t),
    context = f.context();
  const initial = await f
    .service(new MockModel([clarification]))
    .start(context, { userText: "Test" });
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  const adapter: AgentModel = {
    async complete(input) {
      await waiting;
      return new MockModel([clarification]).complete(input);
    },
  };
  const running = f
    .service(adapter)
    .start(context, { userText: "Second" }, initial.conversationId);
  const active = f.store.one<{ active_run_id: string }>(
    "SELECT active_run_id FROM agent_conversations WHERE id=?",
    initial.conversationId,
  )!.active_run_id;
  await assert.rejects(
    f
      .service(adapter)
      .start(context, { userText: "Third" }, initial.conversationId),
    (e) => e instanceof BusinessError && e.code === "CONVERSATION_BUSY",
  );
  await assert.rejects(
    f.service(adapter).resume(context, active),
    (e) => e instanceof BusinessError && e.code === "AGENT_RUN_BUSY",
  );
  await assert.rejects(
    f
      .service(adapter, undefined, "live", "another/model")
      .resume(context, active),
    (e) => e instanceof BusinessError && e.code === "AGENT_MODEL_MISMATCH",
  );
  release!();
  assert.equal((await running).result.status, "clarification");
});

test("real tool evidence is separate from model prose; procurement runs are visible only through case scope", async (t) => {
  const f = fixture(t),
    context = f.context("purchaser");
  const run = await f
    .service(new MockModel({ scenario: "quotes", caseId: "fixture-006" }))
    .start(context, { userText: "Compare" });
  assert.equal(run.result.status, "completion");
  const row = f.store.one<{ result: string; correlation_id: string }>(
    "SELECT result,correlation_id FROM tool_calls WHERE run_id=?",
    run.runId,
  )!;
  assert.equal(JSON.parse(row.result).data.outcome, "feasible");
  assert.equal(JSON.parse(row.result).toolCallId, row.correlation_id);
  const views = new Operations(f.business).runs(f.auth.actor("purchaser"), {
    case: "fixture-006",
  });
  assert.ok(views.some((view) => view.id === run.runId));
  assert.ok(!JSON.stringify(views).includes("Mock mode"));
  const otherCase = { ...context, caseId: randomUUID() };
  await assert.rejects(
    f.service(new MockModel([])).resume(otherCase, run.runId),
    (e) => e instanceof BusinessError && e.code === "CASE_NOT_FOUND",
  );
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM proposals")!.n,
    0,
  );
});

test("deterministic mock output uses real localized records, known zero cost and no fabricated tokens", async (t) => {
  const f = fixture(t),
    context = f.context("customer-a", "az");
  const first = await f
    .service(new MockModel({ scenario: "catalog", query: "RelaySwitch" }))
    .start(context, { userText: "Catalog" });
  const second = await f
    .service(new MockModel({ scenario: "catalog", query: "RelaySwitch" }))
    .start(context, { userText: "Catalog" });
  assert.equal(first.result.status, "completion");
  assert.equal(second.result.status, "completion");
  if (
    first.result.status !== "completion" ||
    second.result.status !== "completion"
  )
    throw new Error("Expected completion");
  assert.equal(first.result.message, second.result.message);
  assert.ok(first.result.message.includes("şəbəkə kommutatoru"));
  const usage = f.store.all<{
    input_tokens: number | null;
    output_tokens: number | null;
    cost_microusd: number | null;
  }>(
    "SELECT input_tokens,output_tokens,cost_microusd FROM model_usage WHERE run_id=?",
    first.runId,
  );
  assert.equal(usage.length, 2);
  assert.ok(
    usage.every(
      (u) =>
        u.input_tokens === null &&
        u.output_tokens === null &&
        u.cost_microusd === 0,
    ),
  );
  assert.equal(
    f.store.one<{ mode: string }>(
      "SELECT mode FROM agent_runs WHERE id=?",
      first.runId,
    )!.mode,
    "mock",
  );
});

test("actual adapter persists unknown then known usage even when terminal response is invalid", async (t) => {
  const f = fixture(t),
    context = f.context();
  const budget = new ModelBudget(":memory:", 1000000);
  t.after(() => budget.close());
  const settings = modelConfig({ OPENROUTER_API_KEY: "synthetic-test-key" });
  let post = 0;
  const router = new OpenRouter(settings, budget, async (url) => {
    if (String(url).endsWith("/endpoints"))
      return Response.json({
        data: {
          id: settings.model,
          endpoints: [
            {
              tag: "openai",
              context_length: 1050000,
              supported_parameters: ["tools", "tool_choice", "max_tokens"],
              pricing: { prompt: "0.0000001", completion: "0.0000005" },
            },
          ],
        },
      });
    post++;
    return Response.json({
      id: "invalid-terminal",
      model: settings.model,
      usage: { prompt_tokens: 123, completion_tokens: 4, cost: 0.00002 },
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "Plain prose" },
        },
      ],
    });
  });
  const run = await f
    .service(router, undefined, "live", settings.model)
    .start(context, { userText: "Test" });
  stopped(run.result, "AGENT_OUTCOME_INVALID");
  assert.equal(post, 1);
  assert.deepEqual(
    f.store
      .all(
        "SELECT input_tokens,output_tokens,cost_microusd FROM model_usage WHERE run_id=?",
        run.runId,
      )
      .map((row) => ({ ...(row as object) })),
    [{ input_tokens: 123, output_tokens: 4, cost_microusd: 20 }],
  );
  assert.equal(budget.summary().knownCostMicroUsd, 20);
  assert.equal(budget.summary().heldMicroUsd, 0);
});

test("an ambiguous adapter failure keeps unknown usage and held spending durable after business reset", async (t) => {
  const path = temporary(),
    budget = new ModelBudget(path + ".budget", 1000000);
  t.after(() => budget.close());
  const f = fixture(t),
    context = f.context();
  cleanup(t, path);
  const settings = modelConfig({ OPENROUTER_API_KEY: "synthetic-test-key" });
  let post = 0;
  const router = new OpenRouter(settings, budget, async (url) => {
    if (String(url).endsWith("/endpoints"))
      return Response.json({
        data: {
          id: settings.model,
          endpoints: [
            {
              tag: "openai",
              context_length: 1050000,
              supported_parameters: ["tools", "tool_choice", "max_tokens"],
              pricing: { prompt: "0.0000001", completion: "0.0000005" },
            },
          ],
        },
      });
    post++;
    throw new Error("synthetic transport outage");
  });
  const run = await f
    .service(router, undefined, "live", settings.model)
    .start(context, { userText: "Test", maxRetries: 2 });
  stopped(run.result, "MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN");
  assert.equal(post, 1);
  assert.deepEqual(
    f.store
      .all(
        "SELECT input_tokens,output_tokens,cost_microusd FROM model_usage WHERE run_id=?",
        run.runId,
      )
      .map((row) => ({ ...(row as object) })),
    [{ input_tokens: null, output_tokens: null, cost_microusd: null }],
  );
  const summary = budget.summary();
  assert.ok(summary.heldMicroUsd > 0);
  resetDemo(f.store, "--demo-only");
  assert.deepEqual(budget.summary(), summary);
  const reopened = new ModelBudget(path + ".budget", 1000000);
  assert.deepEqual(reopened.summary(), summary);
  reopened.close();
});
