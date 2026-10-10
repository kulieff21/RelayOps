import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Operations } from "../src/domain/operations.js";
import { frozenClock, FIXTURE_TIME } from "../src/shared/time.js";
import { createApp } from "../src/server/app.js";
import { usageSummary } from "../src/shared/usage.js";

function fixture() {
  const store = new Store();
  store.migrate();
  seed(store);
  const auth = new Auth(store),
    business = new Business(store, frozenClock());
  const operations = new Operations(business);
  const row = store.one<{ id: string; order_id: string }>(
    "SELECT id,order_id FROM procurement_cases",
  )!;
  return {
    store,
    auth,
    business,
    operations,
    row,
    owner: auth.actor("owner"),
    purchaser: auth.actor("purchaser"),
    operator: auth.actor("operator"),
  };
}
// Isolated read-model fixtures, not an implemented approval or fulfillment executor.
function records(store: Store, caseId: string) {
  const quote = store.one<{ id: string }>(
    "SELECT id FROM quotes WHERE supplier_id='northlink'",
  )!;
  store.run(
    "INSERT INTO proposals VALUES (?,?,1,?,1,12,192000,?,'executed',?)",
    "proposal-1",
    caseId,
    quote.id,
    JSON.stringify({ privatePayload: "PRIVATE_SENTINEL" }),
    "2026-10-13T08:00:00.000Z",
  );
  store.run(
    "INSERT INTO proposals VALUES (?,?,2,?,1,1,1000,?,'pending_approval',?)",
    "proposal-2",
    caseId,
    quote.id,
    "{}",
    "2026-10-11T08:00:00.000Z",
  );
  store.run(
    "INSERT INTO approval_requests VALUES (?,?,'owner',?,'approved')",
    "approval-1",
    "proposal-1",
    "2026-10-13T08:00:00.000Z",
  );
  store.run(
    "INSERT INTO approval_requests VALUES (?,?,'purchaser',?,'pending')",
    "approval-2",
    "proposal-2",
    "2026-10-11T08:00:00.000Z",
  );
  store.run(
    "INSERT INTO approval_decisions VALUES (?,'owner','approved','Synthetic owner decision',?)",
    "approval-1",
    FIXTURE_TIME,
  );
  store.run(
    "INSERT INTO budget_allocations VALUES (?,?,192000,'committed')",
    "proposal-1",
    caseId,
  );
  store.run(
    "INSERT INTO budget_allocations VALUES (?,?,1000,'reserved')",
    "proposal-2",
    caseId,
  );
  store.run(
    "INSERT INTO purchase_orders VALUES ('po-1','proposal-1',12,3,1,'partially_received',?)",
    FIXTURE_TIME,
  );
  store.run(
    "INSERT INTO goods_receipts VALUES ('receipt-1','po-1',2,'pending','[]',NULL,'test-receipt-1',?)",
    FIXTURE_TIME,
  );
  store.run(
    "INSERT INTO goods_receipts VALUES ('receipt-2','po-1',1,'sellable','[\"DEMO-001\"]',NULL,'test-receipt-2',?)",
    FIXTURE_TIME,
  );
  const process = store.one<{ id: string }>(
    "SELECT id FROM processes WHERE case_id=?",
    caseId,
  )!.id;
  store.run(
    "INSERT INTO agent_runs VALUES ('run-1',?,'purchaser','procurement','mock','test-model','completed',?,?)",
    process,
    JSON.stringify({ secret: "PRIVATE_SENTINEL" }),
    FIXTURE_TIME,
  );
  store.run(
    "INSERT INTO agent_runs VALUES ('customer-run',NULL,'customer-a','customer','live',NULL,'failed','{}',?)",
    FIXTURE_TIME,
  );
  store.run(
    "INSERT INTO tool_calls VALUES ('tool-1','run-1','compareQuotes',?,?,'done','private-correlation')",
    JSON.stringify({ secret: "PRIVATE_SENTINEL" }),
    JSON.stringify({ privateResult: "PRIVATE_SENTINEL" }),
  );
  store.run(
    "INSERT INTO model_usage VALUES ('usage-1','run-1',100,20,1250,'PRIVATE_SENTINEL')",
  );
  store.run(
    "INSERT INTO model_usage VALUES ('usage-2','run-1',NULL,0,NULL,NULL)",
  );
  store.run(
    "INSERT INTO model_usage VALUES ('usage-3','customer-run',NULL,NULL,NULL,NULL)",
  );
}

test("case detail preserves accepted requirements, exposes effective expiry and does not mutate reads", (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const detail = f.operations.detail(f.purchaser, f.row.id);
  assert.equal(detail.order.quantity, 20);
  assert.equal(detail.case.quantity, 12);
  assert.equal(detail.consent.quantity, 20);
  assert.equal(detail.consent.total, 458000);
  assert.equal(detail.consent.availableAllocation, 8);
  assert.equal(detail.consent.shortage, 12);
  assert.equal(detail.consent.supportedDelivery, null);
  assert.equal(detail.inventory.physical, 8);
  assert.equal(detail.inventory.reservedForOrder, 8);
  assert.equal(detail.inventory.available, 0);
  assert.equal(detail.order.allow_partial, 0);
  assert.equal(detail.order.allow_substitution, 0);
  assert.equal(detail.budget.remaining, 200000);
  assert.equal(detail.fulfillment.length, 0);
  const afterExpiry = new Operations(
    new Business(f.store, frozenClock("2026-10-14T08:00:00.000Z")),
  );
  const expired = afterExpiry.detail(f.owner, f.row.id);
  assert.equal(expired.reservations[0]!.status, "active");
  assert.equal(expired.reservations[0]!.effectiveStatus, "expired");
  assert.equal(expired.inventory.reservedForOrder, 0);
  assert.equal(expired.inventory.available, 8);
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM reservations")!.status,
    "active",
  );
  f.business.cancelOrder(f.auth.actor("customer-b"), f.row.order_id, {
    reason: "Test closure",
    key: "close-case-view",
  });
  assert.equal(f.operations.detail(f.owner, f.row.id).case.status, "closed");
  assert.throws(
    () => f.business.compareQuotes(f.owner, f.row.id),
    /CASE_CLOSED/,
  );
  assert.throws(() => f.operations.detail(f.operator, f.row.id), /FORBIDDEN/);
  assert.throws(
    () => f.operations.detail(f.owner, "missing"),
    /CASE_NOT_FOUND/,
  );
});

test("proposal, approval and receipt reads preserve exact versions, decisions, pending inspection and remaining quantities", (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  records(f.store, f.row.id);
  const data = f.operations.purchasing(f.purchaser, { case: f.row.id });
  assert.equal(data.proposals.length, 2);
  const first = data.proposals.find((p) => p.id === "proposal-1")!;
  const second = data.proposals.find((p) => p.id === "proposal-2")!;
  assert.equal(first.quote_version, 1);
  assert.equal(first.total, 192000);
  assert.equal(first.approval!.decision!.actor_id, "owner");
  assert.equal(first.approval!.status, "approved");
  assert.equal(second.status, "pending_approval");
  assert.equal(second.elapsed, true);
  assert.equal(second.approval!.elapsed, true);
  assert.equal(second.approval!.decision, null);
  const po = data.purchaseOrders[0]!;
  assert.equal(po.remaining_quantity, 8);
  assert.equal(po.receipts.length, 2);
  assert.equal(po.receipts[0]!.inspection, "pending");
  assert.deepEqual(po.receipts[1]!.serials, ["DEMO-001"]);
  assert.deepEqual(f.operations.detail(f.owner, f.row.id).budget, {
    reserved: 1000,
    committed: 192000,
    remaining: 7000,
  });
  assert.equal(f.operations.detail(f.owner, f.row.id).inventory.physical, 8);
  assert.equal(f.operations.purchasing(f.operator).proposals.length, 0);
  assert.equal(f.operations.purchasing(f.operator).purchaseOrders.length, 1);
  assert.doesNotMatch(
    JSON.stringify(data),
    /PRIVATE_SENTINEL|snapshot|idempotency_key/,
  );
});

test("integrated case audit follows linked entities and excludes unrelated order/supplier activity and private payloads", (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  records(f.store, f.row.id);
  for (const [entity, action] of [
    ["proposal-1", "proposal.submitted"],
    ["approval-1", "approval.decided"],
    ["po-1", "purchase.created"],
    ["receipt-1", "goods.received"],
    ["run-1", "agent.completed"],
    ["tool-1", "tool.completed"],
  ]) {
    f.business.audit(f.owner, action!, entity!, {
      privatePayload: "PRIVATE_SENTINEL",
    });
  }
  f.business.audit(f.owner, "unrelated.supplier", "northlink", {});
  f.business.audit(f.owner, "unrelated.order", "demo-delivered-order", {});
  const data = f.operations.timeline(f.purchaser, f.row.id);
  for (const entity of [
    f.row.id,
    f.row.order_id,
    "proposal-1",
    "approval-1",
    "po-1",
    "receipt-1",
    "run-1",
    "tool-1",
  ])
    assert.ok(
      data.some((a) => a.entity_id === entity),
      entity,
    );
  assert.ok(data.every((a) => !a.action.startsWith("unrelated")));
  assert.doesNotMatch(
    JSON.stringify(data),
    /PRIVATE_SENTINEL|actor_id|correlation_id|"data"/,
  );
  assert.deepEqual(
    data,
    [...data].sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    ),
  );
});

test("model reads are scope-limited, omit tool/provider payloads and preserve unknown versus zero usage", (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  records(f.store, f.row.id);
  const purchasing = f.operations.runs(f.purchaser);
  assert.equal(purchasing.length, 1);
  assert.equal(purchasing[0]!.mode, "mock");
  assert.equal(f.operations.runs(f.owner).length, 2);
  assert.equal(f.operations.runs(f.owner, { case: f.row.id }).length, 1);
  const usage = purchasing[0]!.usage;
  assert.deepEqual(usageSummary(usage, "input_tokens"), {
    known: 100,
    knownEntries: 1,
    entries: 2,
  });
  assert.deepEqual(usageSummary(usage, "output_tokens"), {
    known: 20,
    knownEntries: 2,
    entries: 2,
  });
  assert.deepEqual(usageSummary(usage, "cost_microusd"), {
    known: 1250,
    knownEntries: 1,
    entries: 2,
  });
  assert.equal(usageSummary([], "cost_microusd").known, null);
  assert.equal(
    usageSummary(
      [
        {
          id: "unknown",
          input_tokens: null,
          output_tokens: null,
          cost_microusd: null,
        },
      ],
      "cost_microusd",
    ).known,
    null,
  );
  assert.equal(
    usageSummary(
      [{ id: "zero", input_tokens: 0, output_tokens: 0, cost_microusd: 0 }],
      "cost_microusd",
    ).known,
    0,
  );
  assert.doesNotMatch(
    JSON.stringify(purchasing),
    /PRIVATE_SENTINEL|checkpoint|provider_request_id|arguments|result|actor_id|correlation_id/,
  );
  assert.throws(() => f.operations.runs(f.operator), /FORBIDDEN/);
});

test("new HTTP read routes authenticate, reject spoofed filters and enforce financial/operational scopes", async (t) => {
  const f = fixture();
  records(f.store, f.row.id);
  const app = createApp(f.store);
  t.after(async () => {
    await app.close();
    f.store.close();
  });
  const login = async (name: string) => ({
    authorization: `Bearer ${(await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${name}@relayops.example`, password: DEMO_PASSWORD } })).json().data.token}`,
  });
  const owner = await login("owner"),
    purchaser = await login("purchaser"),
    operator = await login("operator"),
    customer = await login("customer-b");
  for (const url of [
    `/api/procurement/${f.row.id}`,
    `/api/procurement/${f.row.id}/audit`,
    "/api/purchasing-records",
    "/api/model-runs",
  ]) {
    assert.equal((await app.inject(url)).statusCode, 401);
    assert.equal(
      (await app.inject({ url, headers: customer })).statusCode,
      403,
    );
    assert.equal(
      (await app.inject({ url, headers: purchaser })).statusCode,
      200,
    );
    assert.equal((await app.inject({ url, headers: owner })).statusCode, 200);
  }
  assert.equal(
    (
      await app.inject({
        url: `/api/procurement/${f.row.id}`,
        headers: operator,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: "/api/model-runs", headers: operator }))
      .statusCode,
    403,
  );
  const operational = (
    await app.inject({ url: "/api/purchasing-records", headers: operator })
  ).json().data;
  assert.equal(operational.proposals.length, 0);
  assert.equal(operational.purchaseOrders.length, 1);
  assert.doesNotMatch(
    JSON.stringify(operational),
    /recipient_id|"total"|"budget"|decision/,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/purchasing-records?case=missing",
        headers: purchaser,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/model-runs?role=owner",
        headers: purchaser,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/purchasing-records?case=one&case=two",
        headers: owner,
      })
    ).statusCode,
    400,
  );
});
