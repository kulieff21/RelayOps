import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../src/db/database.js";
import { DEMO_PASSWORD, seed } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { CustomerEvidence } from "../src/domain/customer-evidence.js";
import {
  CustomerAssistant,
  type CustomerModels,
} from "../src/agent/customer-assistant.js";
import { CustomerMock } from "../src/model/customer-mock.js";
import { MockModel } from "../src/model/mock.js";
import { FIXTURE_TIME } from "../src/shared/time.js";
import { BusinessError } from "../src/shared/contracts.js";
import type {
  AssistantRequest,
  GuidedAction,
} from "../src/shared/assistant.js";
import type { ToolContext } from "../src/agent/tools.js";
import { createApp } from "../src/server/app.js";

const prepare = {
  productId: "PC-MINI-16",
  quantity: 1,
  deadline: "2026-10-20",
  destination: "baku",
  allowPartial: false,
  allowSubstitution: false,
} as const;
const confirms = { decision: "confirm", confirmed: true };
const rejects = (code: string) => (e: unknown) =>
  e instanceof BusinessError && e.code === code;
function fixture(
  t: TestContext,
  models: CustomerModels = {},
  path = ":memory:",
) {
  const store = new Store(path);
  store.migrate();
  seed(store);
  const clock = {
    instant: FIXTURE_TIME,
    now() {
      return this.instant;
    },
  };
  const auth = new Auth(store),
    business = new Business(store, clock);
  const assistant = new CustomerAssistant(business, auth, models);
  t.after(async () => {
    await assistant.idle();
    store.close();
  });
  const tokens = new Map<string, string>();
  const context = (
    account = "customer-a",
    locale: "en" | "az" = "en",
  ): ToolContext => {
    if (!tokens.has(account))
      tokens.set(
        account,
        auth.login({
          email: `${account}@relayops.example`,
          password: DEMO_PASSWORD,
        }).token,
      );
    return { agent: "customer", sessionToken: tokens.get(account)!, locale };
  };
  const send = async (
    action?: GuidedAction,
    input: Partial<AssistantRequest> = {},
    ctx = context(),
  ) => {
    const ids = assistant.send(ctx, {
      key: randomUUID(),
      userText: "Customer request",
      locale: ctx.locale ?? "en",
      ...(action ? { action } : {}),
      ...input,
    });
    await assistant.idle();
    return { ...ids, turn: assistant.turn(ctx, ids.runId) };
  };
  const count = (table: string) =>
    store.one<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`)!.n;
  return { store, clock, auth, business, assistant, context, send, count };
}
test("customer demo uses real product/spec/stock evidence in EN and AZ without provider setup", async (t) => {
  const f = fixture(t);
  assert.equal(f.assistant.settings().defaultMode, "mock");
  assert.equal(f.assistant.settings().liveAvailable, false);
  for (const locale of ["en", "az"] as const) {
    const r = await f.send(
      {
        name: "searchProducts",
        input: { query: "NET-SW-24G", locale: locale === "en" ? "az" : "en" },
      },
      { locale },
      f.context("customer-a", locale),
    );
    assert.equal(r.turn.status, "completion");
    const evidence = r.turn.evidence[0]!;
    assert.equal(evidence.name, "searchProducts");
    if (evidence.name !== "searchProducts")
      throw new Error("Missing product evidence");
    assert.equal(evidence.data[0]!.available, 0);
    assert.equal(evidence.data[0]!.specs.poe, false);
    assert.equal(evidence.data[0]!.price, 22900);
    assert.match(
      evidence.data[0]!.name,
      locale === "az" ? /şəbəkə/ : /^RelaySwitch 24G$/,
    );
    assert.match(
      r.turn.outcome!.message!,
      locale === "az" ? /Qeydə/ : /stored/,
    );
  }
});
test("delivery reads use current physical availability and leave shortage arrival unknown", async (t) => {
  const f = fixture(t),
    evidence = new CustomerEvidence(f.business);
  const local = evidence.delivery("PC-MINI-16", 2, "2026-10-20");
  assert.equal(local.shortage, 0);
  assert.ok(local.supportedDelivery);
  assert.equal(local.reservationCreated, false);
  const missing = evidence.delivery("NET-SW-24G", 20, "2026-10-20");
  assert.equal(missing.shortage, 20);
  assert.equal(missing.supportedDelivery, null);
  assert.equal(missing.meetsDeadline, null);
  assert.equal(
    evidence.delivery("PC-MINI-16", 1, "2026-10-12").supportedDelivery,
    null,
  );
  const reservationCount = f.count("reservations");
  await f.send({
    name: "getDeliveryOptions",
    input: { productId: "PC-MINI-16", quantity: 2 },
  });
  assert.equal(f.count("reservations"), reservationCount);
});
test("mock clarifies missing product quantity specification and deadline rather than inventing them", async (t) => {
  const f = fixture(t);
  const r = await f.send(undefined, { userText: "I want to buy a switch" });
  assert.equal(r.turn.status, "clarification");
  assert.deepEqual(r.turn.outcome!.missingFields, ["quantity", "deadline"]);
  const az = await f.send(
    undefined,
    { userText: "RAM uyğunluq", locale: "az" },
    f.context("customer-a", "az"),
  );
  assert.deepEqual(az.turn.outcome!.missingFields, ["specification"]);
  assert.match(az.turn.outcome!.question!, /spesifikasiya/);
});
test("model-selected confirmed=true creates only pending consent; one human decision creates one order", async (t) => {
  const f = fixture(t),
    before = f.count("orders"),
    reservations = f.count("reservations");
  const r = await f.send({ name: "prepareOrder", input: prepare });
  assert.equal(r.turn.status, "confirmation_required");
  assert.equal(r.turn.confirmation!.state, "pending");
  assert.equal(f.count("orders"), before);
  assert.equal(f.count("reservations"), reservations);
  assert.equal(r.turn.confirmation!.snapshot.offer!.summary.total, 85000);
  const accepted = f.assistant.decide(f.context(), r.runId, confirms);
  assert.equal(accepted.confirmation!.state, "confirmed");
  assert.equal(accepted.confirmation!.result!.status, "confirmed");
  const duplicate = f.assistant.decide(f.context(), r.runId, confirms);
  assert.deepEqual(duplicate, accepted);
  assert.equal(f.count("orders"), before + 1);
  assert.equal(f.count("reservations"), reservations + 1);
  assert.throws(
    () =>
      f.assistant.decide(f.context(), r.runId, {
        decision: "decline",
        confirmed: true,
      }),
    rejects("ASSISTANT_DECISION_CONFLICT"),
  );
});
test("human decline has no order/reservation/case side effect and rejects later consent", async (t) => {
  const f = fixture(t),
    counts = [
      f.count("orders"),
      f.count("reservations"),
      f.count("procurement_cases"),
    ];
  const r = await f.send({ name: "prepareOrder", input: prepare });
  const declined = f.assistant.decide(f.context(), r.runId, {
    decision: "decline",
    confirmed: true,
  });
  assert.equal(declined.confirmation!.state, "declined");
  assert.deepEqual(
    [f.count("orders"), f.count("reservations"), f.count("procurement_cases")],
    counts,
  );
  assert.throws(
    () => f.assistant.decide(f.context(), r.runId, confirms),
    rejects("ASSISTANT_DECISION_CONFLICT"),
  );
});
test("confirmed shortages create persistent cases with exact accepted requirements and one linked handoff", async (t) => {
  const f = fixture(t),
    cases = f.count("procurement_cases");
  const requirements = {
    ...prepare,
    quantity: 10,
    allowPartial: true,
    allowSubstitution: false,
  };
  const r = await f.send({ name: "prepareOrder", input: requirements });
  assert.equal(f.count("procurement_cases"), cases);
  assert.equal(r.turn.handoffs.length, 0);
  const done = f.assistant.decide(f.context(), r.runId, confirms);
  assert.equal(done.confirmation!.result!.status, "awaiting_supply");
  assert.equal(f.count("procurement_cases"), cases + 1);
  assert.equal(done.handoffs.length, 1);
  assert.equal(done.handoffs[0]!.queue, "procurement_review");
  const recorded = f.store.one<{ requirements: string }>(
    "SELECT requirements FROM assistant_handoffs WHERE run_id=?",
    r.runId,
  )!;
  const details = JSON.parse(recorded.requirements);
  assert.equal(details.acceptedRequirements.allowPartial, true);
  assert.equal(details.acceptedRequirements.allowSubstitution, false);
  assert.equal(details.shortageQuantity, 5);
  const actor = f.auth.authenticate(f.context().sessionToken);
  const order = new CustomerEvidence(f.business).order(
    actor,
    done.confirmation!.result!.orderId!,
  );
  assert.equal(order.cases[0]!.quantity, 5);
  assert.equal(order.fulfillment.length, 0);
  assert.doesNotMatch(
    JSON.stringify(done),
    /"budget"|"requestId"|systemPrompt|sessionToken/,
  );
  f.assistant.decide(f.context(), r.runId, confirms);
  assert.equal(f.count("assistant_handoffs"), 1);
});
test("waiting consent revalidates price stock specs version and expiry through business services", async (t) => {
  for (const changed of [
    "price",
    "stock",
    "specs",
    "version",
    "expiry",
  ] as const) {
    const f = fixture(t);
    const r = await f.send({ name: "prepareOrder", input: prepare });
    const n = f.count("orders");
    if (changed === "price")
      f.store.run("UPDATE products SET price=price+100 WHERE id='PC-MINI-16'");
    if (changed === "stock")
      f.store.run("UPDATE products SET stock=0 WHERE id='PC-MINI-16'");
    if (changed === "specs")
      f.store.run("UPDATE products SET specs='{}' WHERE id='PC-MINI-16'");
    if (changed === "version")
      f.store.run(
        "UPDATE order_offers SET version=2 WHERE id=?",
        r.turn.confirmation!.snapshot.offer!.id,
      );
    if (changed === "expiry") f.clock.instant = "2026-10-13T08:00:00.000Z";
    assert.throws(
      () => f.assistant.decide(f.context(), r.runId, confirms),
      (e: unknown) =>
        e instanceof BusinessError &&
        [
          "NEW_CONSENT_REQUIRED",
          "CONSENT_VERSION_MISMATCH",
          "CONSENT_EXPIRED",
        ].includes(e.code),
      changed,
    );
    assert.equal(f.count("orders"), n);
    assert.equal(
      f.assistant.turn(f.context(), r.runId).confirmation!.state,
      "pending",
    );
  }
});
test("cancellation is confirmed once and releases actual reservations", async (t) => {
  const f = fixture(t);
  const prepared = await f.send({ name: "prepareOrder", input: prepare });
  const orderId = f.assistant.decide(f.context(), prepared.runId, confirms)
    .confirmation!.result!.orderId!;
  assert.equal(f.business.available("PC-MINI-16"), 4);
  const cancel = await f.send({
    name: "cancelOrder",
    input: { orderId, reason: "No longer required", key: randomUUID() },
  });
  assert.equal(
    f.business.getOrder(f.auth.authenticate(f.context().sessionToken), orderId)
      .status,
    "confirmed",
  );
  f.assistant.decide(f.context(), cancel.runId, confirms);
  f.assistant.decide(f.context(), cancel.runId, confirms);
  assert.equal(f.business.available("PC-MINI-16"), 5);
  assert.equal(
    f.business.getOrder(f.auth.authenticate(f.context().sessionToken), orderId)
      .status,
    "cancelled",
  );
});
test("return/exchange follows delivered quantity/date policy and does not resolve funds or stock", async (t) => {
  for (const resolution of ["refund", "exchange"] as const) {
    const f = fixture(t),
      before = f.count("returns"),
      stock = f.business.available("MON-QHD-27");
    const r = await f.send({
      name: "requestReturn",
      input: {
        orderId: "demo-delivered-order",
        quantity: 1,
        reason: "Display inspection needed",
        resolution,
        key: randomUUID(),
      },
    });
    assert.equal(r.turn.status, "confirmation_required");
    assert.equal(f.count("returns"), before);
    f.assistant.decide(f.context(), r.runId, confirms);
    f.assistant.decide(f.context(), r.runId, confirms);
    assert.equal(f.count("returns"), before + 1);
    assert.equal(f.business.available("MON-QHD-27"), stock);
    assert.equal(f.count("refund_ledger"), 0);
    const again = await f.send({
      name: "requestReturn",
      input: {
        orderId: "demo-delivered-order",
        quantity: 2,
        reason: "Too many",
        resolution,
        key: randomUUID(),
      },
    });
    assert.throws(
      () => f.assistant.decide(f.context(), again.runId, confirms),
      (e: unknown) => e instanceof BusinessError,
    );
    f.clock.instant = "2026-11-01T08:00:00.000Z";
    const late = await f.send({
      name: "requestReturn",
      input: {
        orderId: "demo-delivered-order",
        quantity: 1,
        reason: "Late",
        resolution,
        key: randomUUID(),
      },
    });
    assert.throws(
      () => f.assistant.decide(f.context(), late.runId, confirms),
      rejects("OWNER_EXCEPTION_REQUIRED"),
    );
  }
});
test("same HTTP request key recovers the same run and rejects changed content without new inference", async (t) => {
  let calls = 0;
  const f = fixture(t, {
    mock: (action) => ({
      async complete(input, options) {
        calls++;
        return new CustomerMock(action).complete(input, options);
      },
    }),
  });
  const payload = { key: randomUUID(), locale: "en", userText: "switch specs" };
  const a = f.assistant.send(f.context(), payload),
    b = f.assistant.send(f.context(), payload);
  assert.deepEqual(a, b);
  await f.assistant.idle();
  assert.equal(calls, 2);
  assert.deepEqual(f.assistant.send(f.context(), payload), a);
  f.assistant.detail(f.context(), a.conversationId);
  f.assistant.list(f.context());
  f.assistant.resume(f.context(), a.runId);
  await f.assistant.idle();
  assert.equal(calls, 2);
  assert.equal(f.count("assistant_requests"), 1);
  assert.throws(
    () =>
      f.assistant.send(f.context(), {
        ...payload,
        userText: "another question",
      }),
    rejects("IDEMPOTENCY_CONFLICT"),
  );
});
test("locale switch reuses durable history and keeps the pending offer and original request", async (t) => {
  const f = fixture(t);
  const first = await f.send({ name: "prepareOrder", input: prepare });
  const second = await f.send(
    {
      name: "getDeliveryOptions",
      input: { productId: "NET-SW-24G", quantity: 2 },
    },
    { locale: "az", conversationId: first.conversationId },
    f.context("customer-a", "az"),
  );
  assert.equal(second.conversationId, first.conversationId);
  assert.match(second.turn.outcome!.message!, /Qeydə/);
  const history = f.assistant.detail(f.context(), first.conversationId);
  assert.equal(history.turns.length, 2);
  assert.deepEqual(history.turns[0]!.confirmation, first.turn.confirmation);
  assert.equal(f.count("orders"), 2);
});
test("account and role boundaries conceal other conversations/decisions/order evidence and reject input spoofing", async (t) => {
  const f = fixture(t);
  const r = await f.send({ name: "prepareOrder", input: prepare });
  const stranger = f.context("customer-b");
  for (const action of [
    () => f.assistant.turn(stranger, r.runId),
    () => f.assistant.detail(stranger, r.conversationId),
    () => f.assistant.decide(stranger, r.runId, confirms),
    () => f.assistant.help(stranger, r.runId, {}),
  ])
    assert.throws(action, rejects("CONVERSATION_NOT_FOUND"));
  assert.deepEqual(f.assistant.list(stranger), []);
  assert.throws(
    () =>
      f.assistant.send(f.context("owner"), {
        key: randomUUID(),
        locale: "en",
        userText: "stock",
      }),
    rejects("FORBIDDEN"),
  );
  assert.throws(() =>
    f.assistant.send(f.context(), {
      key: randomUUID(),
      locale: "en",
      userText: "stock",
      role: "owner",
    }),
  );
  assert.throws(() =>
    f.assistant.decide(f.context(), r.runId, {
      ...confirms,
      action: "cancelOrder",
    }),
  );
  f.store.run("INSERT INTO roles VALUES('customer-b','owner')");
  assert.throws(
    () =>
      new CustomerEvidence(f.business).order(
        f.auth.authenticate(stranger.sessionToken),
        "demo-delivered-order",
      ),
    rejects("ORDER_NOT_FOUND"),
  );
  f.auth.logout(f.context().sessionToken);
  assert.throws(
    () => f.assistant.decide(f.context(), r.runId, confirms),
    rejects("UNAUTHORIZED"),
  );
});
test("failed confirmation audit rolls back order reservation case handoff decision and history atomically", async (t) => {
  const f = fixture(t);
  const r = await f.send({
    name: "prepareOrder",
    input: { ...prepare, quantity: 10 },
  });
  const original = f.assistant.detail(f.context(), r.conversationId),
    n = f.count("orders"),
    cases = f.count("procurement_cases");
  f.store.db.exec(
    "CREATE TRIGGER reject_assistant_audit BEFORE INSERT ON audit_events WHEN NEW.action='assistant.confirmed' BEGIN SELECT RAISE(ABORT,'test failure'); END",
  );
  assert.throws(() => f.assistant.decide(f.context(), r.runId, confirms));
  assert.equal(f.count("orders"), n);
  assert.equal(f.count("procurement_cases"), cases);
  assert.equal(f.count("assistant_handoffs"), 0);
  assert.equal(f.business.available("PC-MINI-16"), 5);
  assert.deepEqual(f.assistant.detail(f.context(), r.conversationId), original);
});
test("unresolved requests persist a visible staff handoff and explicit help is idempotent", async (t) => {
  const f = fixture(t);
  const r = await f.send({
    name: "getOrderProgress",
    input: { orderId: "missing-order" },
  });
  assert.equal(r.turn.status, "escalation");
  assert.equal(r.turn.handoffs.length, 1);
  assert.equal(r.turn.handoffs[0]!.queue, "customer_support");
  f.assistant.help(f.context(), r.runId, {});
  assert.equal(f.count("assistant_handoffs"), 1);
  const question = await f.send(undefined, { userText: "need help" });
  const help = f.assistant.help(f.context(), question.runId, {});
  assert.equal(help.handoffs[0]!.reason, "manual_help");
  const owner = f.auth.authenticate(f.context("owner").sessionToken);
  assert.equal(f.assistant.staffHandoffs(owner).length, 2);
  assert.throws(
    () =>
      f.assistant.staffHandoffs(f.auth.authenticate(f.context().sessionToken)),
    rejects("FORBIDDEN"),
  );
});
test("cached confirmation/decision/history survive reopening SQLite with no replay", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-customer-"));
  t.after(() => {
    assert.equal(
      directory.startsWith(join(tmpdir(), "relayops-customer-")),
      true,
    );
    rmSync(directory, { recursive: true, force: true });
  });
  const path = join(directory, "demo.sqlite"),
    store = new Store(path);
  store.migrate();
  seed(store);
  const auth = new Auth(store),
    business = new Business(store, { now: () => FIXTURE_TIME });
  const service = new CustomerAssistant(business, auth),
    ctx: ToolContext = {
      agent: "customer",
      sessionToken: auth.login({
        email: "customer-a@relayops.example",
        password: DEMO_PASSWORD,
      }).token,
      locale: "en",
    };
  const payload = {
    key: randomUUID(),
    locale: "en",
    userText: "Prepare mini PC",
    action: { name: "prepareOrder", input: prepare },
  };
  const run = service.send(ctx, payload);
  await service.idle();
  const pending = service.turn(ctx, run.runId);
  store.close();
  const nextStore = new Store(path);
  nextStore.migrate();
  const next = new CustomerAssistant(
    new Business(nextStore, { now: () => FIXTURE_TIME }),
    new Auth(nextStore),
  );
  try {
    assert.deepEqual(next.turn(ctx, run.runId), pending);
    assert.deepEqual(next.send(ctx, payload), run);
    const done = next.decide(ctx, run.runId, confirms);
    next.resume(ctx, run.runId);
    await next.idle();
    assert.deepEqual(next.decide(ctx, run.runId, confirms), done);
    assert.equal(
      nextStore.one<{ n: number }>("SELECT COUNT(*) n FROM orders")!.n,
      3,
    );
  } finally {
    await next.idle();
    nextStore.close();
  }
});
test("live selection has no startup call, global concurrency and hourly per-account admission limits", async (t) => {
  let created = 0,
    release: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture(t, {
    live: {
      id: "relayops/deterministic-mock",
      create: () => {
        created++;
        return {
          async complete(input, options) {
            await wait;
            return {
              ...(await new MockModel([
                {
                  content: JSON.stringify({
                    status: "clarification",
                    question: "Which product?",
                    missingFields: ["product"],
                    evidenceToolCallIds: [],
                  }),
                  toolCalls: [],
                  finishReason: "stop",
                },
              ]).complete(input, options)),
              mode: "live",
            };
          },
        };
      },
    },
  });
  assert.equal(f.assistant.settings().liveAvailable, true);
  assert.equal(created, 0);
  const payload = {
    key: randomUUID(),
    locale: "en",
    mode: "live",
    userText: "Help",
  };
  const first = f.assistant.send(f.context(), payload);
  await Promise.resolve();
  assert.throws(
    () =>
      f.assistant.send(f.context("customer-b"), {
        ...payload,
        key: randomUUID(),
      }),
    rejects("ASSISTANT_LIVE_BUSY"),
  );
  f.assistant.resume(f.context(), first.runId);
  assert.equal(f.count("assistant_requests"), 1);
  release!();
  await f.assistant.idle();
  for (let i = 0; i < 5; i++) {
    f.assistant.send(f.context(), { ...payload, key: randomUUID() });
    await f.assistant.idle();
  }
  assert.throws(
    () => f.assistant.send(f.context(), { ...payload, key: randomUUID() }),
    rejects("RATE_LIMITED"),
  );
});
test("customer HTTP endpoints queue/poll, conceal provider/session data, enforce fresh identity and confirmed-only decisions", async (t) => {
  const store = new Store();
  store.migrate();
  seed(store);
  const app = createApp(store);
  t.after(async () => {
    await app.close();
    store.close();
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "customer-a@relayops.example", password: DEMO_PASSWORD },
  });
  const token = login.json().data.token,
    headers = { authorization: `Bearer ${token}` };
  assert.equal(
    (await app.inject("/api/assistant/conversations")).statusCode,
    401,
  );
  const body = {
    key: randomUUID(),
    locale: "az",
    userText: "Mini kompüter sifarişi",
    action: { name: "prepareOrder", input: prepare },
  };
  const send = await app.inject({
    method: "POST",
    url: "/api/assistant/turns",
    headers,
    payload: body,
  });
  assert.equal(send.statusCode, 202);
  const { runId, conversationId } = send.json().data;
  let wire;
  for (let i = 0; i < 50; i++) {
    wire = await app.inject({ url: `/api/assistant/turns/${runId}`, headers });
    if (wire.json().data.status !== "running") break;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(wire!.json().data.status, "confirmation_required");
  assert.doesNotMatch(wire!.body, /prompt|provider|requestId|token|stack/);
  assert.equal(wire!.body.includes(token), false);
  const duplicate = await app.inject({
    method: "POST",
    url: "/api/assistant/turns",
    headers,
    payload: body,
  });
  assert.deepEqual(duplicate.json().data, send.json().data);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/assistant/turns/${runId}/decision`,
        headers,
        payload: { decision: "confirm", confirmed: false },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/assistant/turns/${runId}/decision`,
        headers,
        payload: confirms,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: `/api/assistant/conversations/${conversationId}`,
        headers,
      })
    ).json().data.turns.length,
    1,
  );
  assert.equal(
    (await app.inject({ url: "/api/assistant/handoffs", headers })).statusCode,
    403,
  );
});
