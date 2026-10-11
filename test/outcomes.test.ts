import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { ToolDispatcher, type ToolContext } from "../src/agent/tools.js";
import {
  AgentLoop,
  type AgentModel,
  type AgentResult,
  type ModelCompletion,
} from "../src/agent/loop.js";
import { FIXTURE_TIME } from "../src/shared/time.js";
import { OpenRouter } from "../src/model/openrouter.js";
import { modelConfig } from "../src/model/config.js";
import { ModelBudget } from "../src/model/budget.js";

function fixture(t: TestContext) {
  const store = new Store();
  store.migrate();
  seed(store);
  t.after(() => store.close());
  const auth = new Auth(store),
    business = new Business(store, { now: () => FIXTURE_TIME });
  const dispatcher = new ToolDispatcher(business, auth);
  const context = (
    agent: "customer" | "procurement" = "customer",
    locale: "en" | "az" = "en",
  ): ToolContext => {
    const sessionToken = auth.login({
      email: `${agent === "customer" ? "customer-a" : "purchaser"}@relayops.example`,
      password: DEMO_PASSWORD,
    }).token;
    return agent === "customer"
      ? { agent, sessionToken, locale }
      : { agent, sessionToken, locale, caseId: "fixture-006" };
  };
  return { store, auth, business, dispatcher, context };
}
const call = (id: string, name: string, args: unknown) => ({
  id,
  type: "function" as const,
  function: { name, arguments: JSON.stringify(args) },
});
function completion(
  content: string | null,
  toolCalls: ModelCompletion["toolCalls"] = [],
): ModelCompletion {
  return {
    mode: "live",
    attemptId: "00000000-0000-4000-8000-000000000000",
    providerRequestId: "synthetic-outcome",
    model: "synthetic/model",
    content,
    toolCalls,
    finishReason: toolCalls.length ? "tool_calls" : "stop",
    usage: { inputTokens: null, outputTokens: null, costMicroUsd: null },
  };
}
const terminal = (raw: unknown) => completion(JSON.stringify(raw));
function script(...replies: (ModelCompletion | (() => ModelCompletion))[]) {
  let calls = 0;
  const model: AgentModel = {
    async complete() {
      const next = replies[calls++];
      assert.ok(next, "No automatic outcome repair or extra inference");
      return typeof next === "function" ? next() : next;
    },
  };
  return { model, calls: () => calls };
}
function stopped(result: AgentResult, code: string) {
  assert.equal(result.status, "stopped");
  if (result.status !== "stopped") throw new Error();
  assert.equal(result.error.code, code);
}
function effects(store: Store) {
  return JSON.stringify(
    [
      "orders",
      "order_offers",
      "reservations",
      "procurement_cases",
      "proposals",
      "approval_requests",
      "returns",
      "audit_events",
    ].map((name) => store.all(`SELECT * FROM ${name} ORDER BY rowid`)),
  );
}
const clarify = {
  status: "clarification",
  question: "How many units and by which date?",
  missingFields: ["quantity", "deadline"],
  evidenceToolCallIds: [],
};
const escalate = {
  status: "escalation",
  message: "Human review is required.",
  reason: "manual_review",
  evidenceToolCallIds: [],
};
const completed = {
  status: "completion",
  message: "Stored switch availability is zero.",
  evidenceToolCallIds: ["stock"],
};
const stock = call("stock", "searchProducts", {
  query: "NET-SW",
  locale: "en",
});

test("completion cites real successful service evidence and does not imply an order or reservation effect", async (t) => {
  const f = fixture(t),
    before = effects(f.store),
    s = script(completion(null, [stock]), terminal(completed));
  const result = await new AgentLoop(s.model, f.dispatcher).run(f.context(), {
    userText: "Check switches.",
  });
  assert.equal(result.status, "completion");
  if (result.status !== "completion") throw new Error();
  assert.deepEqual(result.evidenceToolCallIds, ["stock"]);
  const record = result.steps[0]!.toolResults[0]!;
  if (record.status !== "completed" || record.name !== "searchProducts")
    throw new Error();
  assert.equal(record.data[0]!.available, 0);
  assert.equal(effects(f.store), before);
  assert.equal(s.calls(), 2);
});

test("clarification ends the invocation before tools with explicit missing requirements in EN/AZ", async (t) => {
  const f = fixture(t),
    before = effects(f.store);
  for (const [locale, question] of [
    ["en", clarify.question],
    ["az", "Neçə ədəd və hansı tarixədək lazımdır?"],
  ] as const) {
    const s = script(terminal({ ...clarify, question }));
    const result = await new AgentLoop(s.model, f.dispatcher).run(
      f.context("customer", locale),
      { userText: "I need switches." },
    );
    assert.equal(result.status, "clarification");
    if (result.status !== "clarification") throw new Error();
    assert.equal(result.question, question);
    assert.deepEqual(result.missingFields, ["quantity", "deadline"]);
    assert.deepEqual(result.steps[0]!.toolResults, []);
    assert.equal(effects(f.store), before);
    assert.equal(s.calls(), 1);
  }
});

test("clarification can cite a rejected tool without claiming it completed", async (t) => {
  const f = fixture(t),
    before = effects(f.store),
    s = script(
      completion(null, [
        call("bad-quantity", "prepareOrder", { quantity: -1 }),
      ]),
      terminal({ ...clarify, evidenceToolCallIds: ["bad-quantity"] }),
    );
  const result = await new AgentLoop(s.model, f.dispatcher).run(f.context(), {
    userText: "Prepare an order.",
  });
  assert.equal(result.status, "clarification");
  assert.equal(result.steps[0]!.toolResults[0]!.status, "rejected");
  assert.equal(effects(f.store), before);
});

test("escalation derives the customer/procurement queue from trusted scope and creates no handoff or business effect", async (t) => {
  const f = fixture(t),
    before = effects(f.store);
  for (const [agent, queue] of [
    ["customer", "customer_support"],
    ["procurement", "procurement_review"],
  ] as const) {
    const context = f.context(agent),
      s = script(() => {
        context.agent = agent === "customer" ? "procurement" : "customer";
        return terminal(escalate);
      });
    // Changing the caller's object after binding cannot change the server queue.
    const result = await new AgentLoop(s.model, f.dispatcher).run(context, {
      userText: "Ask for human help.",
    });
    assert.equal(result.status, "escalation");
    if (result.status !== "escalation") throw new Error();
    assert.deepEqual(result.handoff, { queue, state: "not_created" });
    assert.ok(!JSON.stringify(result).includes(context.sessionToken));
    assert.equal(effects(f.store), before);
    assert.equal(s.calls(), 1);
  }
});

test("plain prose, fenced JSON, malformed or overprivileged terminal outcomes cannot silently become completion", async (t) => {
  const f = fixture(t),
    context = f.context(),
    before = effects(f.store);
  for (const raw of [
    "Order completed!",
    "```json\n" + JSON.stringify(clarify) + "\n```",
    "{",
    "null",
    "[]",
    JSON.stringify({ ...clarify, missingFields: [] }),
    JSON.stringify({ ...clarify, missingFields: ["quantity", "quantity"] }),
    JSON.stringify({ ...clarify, question: " " }),
    JSON.stringify({ ...clarify, question: "x".repeat(2001) }),
    JSON.stringify({ ...clarify, missingFields: ["owner_permission"] }),
    JSON.stringify({ ...escalate, reason: "auto_approve" }),
    JSON.stringify({
      ...escalate,
      handoff: { queue: "owner", state: "created" },
    }),
    JSON.stringify({ ...escalate, role: "owner" }),
    JSON.stringify({ ...completed, evidenceToolCallIds: [] }),
    JSON.stringify({ ...completed, evidenceToolCallIds: ["stock", "stock"] }),
    JSON.stringify({ ...completed, businessProcessCompleted: true }),
  ]) {
    const s = script(completion(raw));
    const result = await new AgentLoop(s.model, f.dispatcher).run(context, {
      userText: "Finish.",
    });
    stopped(result, "AGENT_OUTCOME_INVALID");
    assert.equal(s.calls(), 1);
    assert.equal(effects(f.store), before);
  }
});

test("invented, rejected and previous-invocation evidence cannot support completion", async (t) => {
  const f = fixture(t),
    context = f.context();
  const first = script(completion(null, [stock]), terminal(completed));
  assert.equal(
    (
      await new AgentLoop(first.model, f.dispatcher).run(context, {
        userText: "Check stock.",
      })
    ).status,
    "completion",
  );
  for (const replies of [
    [terminal(completed)],
    [
      completion(null, [stock]),
      terminal({ ...completed, evidenceToolCallIds: ["invented"] }),
    ],
    [
      completion(null, [
        call("foreign", "getOrder", { orderId: "fixture-003" }),
      ]),
      terminal({ ...completed, evidenceToolCallIds: ["foreign"] }),
    ],
    [terminal({ ...clarify, evidenceToolCallIds: ["invented"] })],
    [terminal({ ...escalate, evidenceToolCallIds: ["invented"] })],
  ]) {
    const s = script(...replies);
    const result = await new AgentLoop(s.model, f.dispatcher).run(context, {
      userText: "Finish.",
    });
    stopped(result, "AGENT_EVIDENCE_INVALID");
    assert.equal(s.calls(), replies.length);
  }
});

test("no-feasible-quote escalation requires cited real deterministic evidence and rejects a feasible comparison", async (t) => {
  const f = fixture(t),
    context = f.context("procurement");
  const compare = completion(null, [
    call("comparison", "compareQuotes", { caseId: "fixture-006" }),
  ]);
  const final = terminal({
    ...escalate,
    reason: "no_feasible_quote",
    evidenceToolCallIds: ["comparison"],
  });
  const feasible = script(compare, final);
  stopped(
    await new AgentLoop(feasible.model, f.dispatcher).run(context, {
      userText: "Compare.",
    }),
    "AGENT_EVIDENCE_INVALID",
  );
  f.store.run("UPDATE procurement_cases SET budget=0 WHERE id='fixture-006'");
  const before = effects(f.store),
    noSupply = script(compare, final);
  const result = await new AgentLoop(noSupply.model, f.dispatcher).run(
    context,
    { userText: "Compare." },
  );
  assert.equal(result.status, "escalation");
  if (result.status !== "escalation") throw new Error();
  assert.equal(result.reason, "no_feasible_quote");
  assert.deepEqual(result.handoff, {
    queue: "procurement_review",
    state: "not_created",
  });
  assert.equal(effects(f.store), before);
  const stale = script(
    compare,
    () => {
      f.store.run(
        "UPDATE procurement_cases SET budget=200000 WHERE id='fixture-006'",
      );
      return completion(null, [
        call("new-comparison", "compareQuotes", { caseId: "fixture-006" }),
      ]);
    },
    final,
  );
  stopped(
    await new AgentLoop(stale.model, f.dispatcher).run(context, {
      userText: "Compare again.",
    }),
    "AGENT_EVIDENCE_INVALID",
  );
});

test("confirmation dominates model-proposed terminal prose and never grants customer consent", async (t) => {
  const f = fixture(t),
    before = effects(f.store),
    s = script(
      completion(JSON.stringify(completed), [
        call("cancel", "cancelOrder", {
          orderId: "demo-delivered-order",
          reason: "Cancel",
          key: "outcome-cancel-key",
        }),
      ]),
    );
  const result = await new AgentLoop(s.model, f.dispatcher).run(f.context(), {
    userText: "Cancel my order.",
  });
  assert.equal(result.status, "confirmation_required");
  assert.ok(!("message" in result));
  assert.equal(effects(f.store), before);
  assert.equal(s.calls(), 1);
});

test("authority loss during terminal inference blocks every outcome type before it is delivered", async (t) => {
  const f = fixture(t);
  for (const outcome of [completed, clarify, escalate]) {
    const context = f.context(),
      s = script(() => {
        f.auth.logout(context.sessionToken);
        return terminal(outcome);
      });
    const result = await new AgentLoop(s.model, f.dispatcher).run(context, {
      userText: "Finish.",
    });
    stopped(result, "UNAUTHORIZED");
    assert.ok(
      !("message" in result) &&
        !("question" in result) &&
        !("handoff" in result),
    );
    assert.equal(s.calls(), 1);
  }
});

test("invalid terminal JSON from the actual adapter retains known billing and is not automatically repaired", async (t) => {
  const f = fixture(t),
    budget = new ModelBudget(":memory:", 1000000),
    settings = modelConfig({ OPENROUTER_API_KEY: "synthetic-key" });
  t.after(() => budget.close());
  let requests = 0;
  const transport: typeof fetch = async (url) => {
    if (String(url).includes("/endpoints"))
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
    requests++;
    return Response.json({
      id: "synthetic-invalid-outcome",
      model: settings.model,
      usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.000001 },
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "I completed your order." },
        },
      ],
    });
  };
  const result = await new AgentLoop(
    new OpenRouter(settings, budget, transport),
    f.dispatcher,
  ).run(f.context(), { userText: "Finish." });
  stopped(result, "AGENT_OUTCOME_INVALID");
  assert.equal(requests, 1);
  assert.equal(result.steps[0]!.completion.usage.costMicroUsd, 1);
  assert.equal(budget.summary().knownCostMicroUsd, 1);
  assert.equal(budget.summary().heldMicroUsd, 0);
});
