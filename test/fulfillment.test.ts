import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Procurement } from "../src/domain/procurement.js";
import { Approvals } from "../src/domain/approvals.js";
import { PurchaseExecution } from "../src/domain/purchase-execution.js";
import { Fulfillment } from "../src/domain/fulfillment.js";
import { createApp } from "../src/server/app.js";
import { frozenClock, FIXTURE_TIME } from "../src/shared/time.js";

const mapping = {
  botId: 123456,
  userId: 222333,
  chatId: 222333,
  accountId: "owner",
  locale: "en" as const,
};
function fixture(t: TestContext, path = ":memory:", caseId = "fixture-006") {
  const store = new Store(path);
  store.migrate();
  seed(store);
  let closed = false;
  const close = () => {
    if (!closed) {
      store.close();
      closed = true;
    }
  };
  t.after(close);
  const clock = {
    instant: FIXTURE_TIME,
    now() {
      return this.instant;
    },
  };
  const auth = new Auth(store),
    owner = auth.actor("owner"),
    operator = auth.actor("operator"),
    purchaser = auth.actor("purchaser");
  const business = new Business(store, clock),
    procurement = new Procurement(business);
  const approvals = new Approvals(business, auth, {
    mapping,
    liveEnabled: false,
  });
  const evidence = procurement.evidence(owner, caseId);
  const proposal = procurement.prepare(owner, caseId, {
    expectedVersion: 0,
    evidenceFingerprint: evidence.fingerprint,
    rationale: "Receipt test",
    revisionReason: null,
  });
  const request = approvals.submit(owner, caseId, proposal.id, {
    mode: "mock",
    expectedVersion: 1,
    key: randomUUID(),
  });
  approvals.decide(owner, caseId, request.id, {
    decision: "approved",
    reason: "Test human approval",
    key: randomUUID(),
  });
  const poId = new PurchaseExecution(approvals).purchase(
    request.id,
  ).purchaseOrderId!;
  const fulfillment = new Fulfillment(business),
    orderId = evidence.requirements.orderId;
  const receive = (quantity = 12, key = randomUUID(), serials: string[] = []) =>
    fulfillment.receive(operator, poId, {
      quantity,
      serials,
      evidence: "Sandbox delivery evidence",
      key,
    });
  const inspect = (id: string, outcome = "sellable", key = randomUUID()) =>
    fulfillment.inspect(operator, id, {
      outcome,
      notes: "Inspected test delivery",
      key,
    });
  return {
    store,
    close,
    clock,
    auth,
    owner,
    operator,
    purchaser,
    business,
    procurement,
    approvals,
    poId,
    fulfillment,
    orderId,
    receive,
    inspect,
  };
}
const count = (s: Store, table: string) =>
  s.one<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`)!.n;

test("full receipt stays outside sellable stock until inspection; replay cannot repeat effects", (t) => {
  const f = fixture(t),
    key = randomUUID(),
    r = f.receive(12, key);
  assert.equal(f.business.product("NET-SW-24G").stock, 8);
  assert.equal(f.business.search("NET-SW")[0]!.incoming, 0);
  assert.deepEqual(f.receive(12, key), r);
  const inspectKey = randomUUID(),
    result = f.inspect(r.id, "sellable", inspectKey);
  assert.equal(result.allocated, 12);
  assert.deepEqual(f.inspect(r.id, "sellable", inspectKey), result);
  assert.equal(f.business.product("NET-SW-24G").stock, 20);
  assert.equal(f.business.available("NET-SW-24G"), 0);
  assert.equal(f.business.getOrder(f.owner, f.orderId).status, "confirmed");
  assert.equal(count(f.store, "receipt_inspections"), 1);
  assert.equal(count(f.store, "receipt_allocations"), 1);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM inventory_movements WHERE source LIKE 'receipt:%'",
    )!.n,
    1,
  );
  assert.equal(
    f.store.one<{ amount: number }>("SELECT amount FROM budget_allocations")!
      .amount,
    192000,
  );
  assert.equal(
    f.store.one<{ status: string }>(
      "SELECT status FROM procurement_cases WHERE id='fixture-006'",
    )!.status,
    "closed",
  );
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).batches.length, 1);
  assert.throws(() => f.inspect(r.id), /INSPECTION_ALREADY_RECORDED/);
});
test("partial receipts allocate once without completing an incomplete order", (t) => {
  const f = fixture(t),
    r = f.receive(5);
  f.inspect(r.id);
  assert.equal(f.business.product("NET-SW-24G").stock, 13);
  assert.equal(
    f.business.getOrder(f.owner, f.orderId).status,
    "awaiting_supply",
  );
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).reserved, 13);
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).batches.length, 0);
  assert.equal(f.business.search("NET-SW")[0]!.incoming, 7);
  const next = f.receive(7);
  f.inspect(next.id);
  assert.equal(f.business.getOrder(f.owner, f.orderId).status, "confirmed");
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).reserved, 20);
  assert.equal(
    f.fulfillment.progress(f.owner, f.orderId).batches[0]!.quantity,
    20,
  );
  assert.equal(count(f.store, "receipt_allocations"), 2);
});
for (const outcome of ["damaged", "incomplete", "wrong_item"])
  test(`${outcome} inspection retains evidence and never creates sellable inventory`, (t) => {
    const f = fixture(t),
      r = f.receive();
    f.inspect(r.id, outcome);
    assert.equal(f.business.product("NET-SW-24G").stock, 8);
    assert.equal(count(f.store, "receipt_allocations"), 0);
    assert.equal(
      f.business.getOrder(f.owner, f.orderId).status,
      "awaiting_supply",
    );
    assert.equal(
      f.store.one<{ status: string }>(
        "SELECT status FROM procurement_cases WHERE id='fixture-006'",
      )!.status,
      "escalated",
    );
    assert.equal(
      f.store.one<{ outcome: string }>(
        "SELECT outcome FROM receipt_inspections",
      )!.outcome,
      outcome,
    );
  });
test("mixed sellable and damaged receipts leave precisely the missing demand", (t) => {
  const f = fixture(t),
    r = f.receive(5),
    bad = f.receive(7);
  f.inspect(r.id);
  f.inspect(bad.id, "damaged");
  assert.equal(f.business.product("NET-SW-24G").stock, 13);
  assert.equal(
    f.procurement.requirements(f.owner, "fixture-006").requiredQuantity,
    7,
  );
  assert.equal(
    f.fulfillment.replan(f.owner, "fixture-006", {
      reason: "Damaged units",
      key: randomUUID(),
    }).outcome,
    "escalated",
  );
});
test("overreceipt and invalid or duplicate serials are rejected without partial changes", (t) => {
  const f = fixture(t);
  assert.throws(() => f.receive(13), /RECEIPT_QUANTITY_EXCEEDED/);
  assert.throws(
    () => f.receive(2, randomUUID(), ["A"]),
    /RECEIPT_SERIALS_INVALID/,
  );
  assert.throws(
    () => f.receive(2, randomUUID(), ["A", "A"]),
    /RECEIPT_SERIALS_INVALID/,
  );
  const r = f.receive(1, randomUUID(), ["A"]);
  assert.throws(
    () => f.receive(1, randomUUID(), ["A"]),
    /RECEIPT_SERIAL_DUPLICATE/,
  );
  assert.equal(count(f.store, "goods_receipts"), 1);
  assert.equal(count(f.store, "receipt_serials"), 1);
  f.inspect(r.id);
  assert.equal(f.business.product("NET-SW-24G").stock, 9);
});
test("changed retry payload and cross-actor duplicate delivery key cannot duplicate a receipt", (t) => {
  const f = fixture(t),
    key = randomUUID();
  f.receive(5, key);
  assert.throws(() => f.receive(6, key), /IDEMPOTENCY_CONFLICT/);
  assert.throws(
    () =>
      f.fulfillment.receive(f.owner, f.poId, {
        quantity: 5,
        evidence: "Same delivery",
        key,
      }),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.equal(count(f.store, "goods_receipts"), 1);
});
test("receipt and inspection audit failures roll back quantities, inventory, allocations and retries", (t) => {
  const f = fixture(t);
  f.store.db.exec(
    "CREATE TRIGGER fail_receipt BEFORE INSERT ON audit_events WHEN NEW.action='goods.received' BEGIN SELECT RAISE(ABORT,'test rollback'); END;",
  );
  assert.throws(() => f.receive(), /test rollback/);
  assert.equal(count(f.store, "goods_receipts"), 0);
  f.store.db.exec("DROP TRIGGER fail_receipt;");
  const r = f.receive();
  const notifications = count(f.store, "notifications");
  f.store.db.exec(
    "CREATE TRIGGER fail_inspection BEFORE INSERT ON audit_events WHEN NEW.action='goods.inspected' BEGIN SELECT RAISE(ABORT,'test rollback'); END;",
  );
  assert.throws(() => f.inspect(r.id), /test rollback/);
  assert.equal(f.business.product("NET-SW-24G").stock, 8);
  assert.equal(count(f.store, "receipt_inspections"), 0);
  assert.equal(count(f.store, "notifications"), notifications);
  assert.equal(
    f.business.getOrder(f.owner, f.orderId).status,
    "awaiting_supply",
  );
});
test("cancelled customer demand leaves received supply unallocated and purchasing commitment intact", (t) => {
  const f = fixture(t);
  f.business.cancelOrder(f.owner, f.orderId, {
    reason: "Customer cancelled",
    key: randomUUID(),
  });
  const r = f.receive();
  assert.equal(f.inspect(r.id).allocated, 0);
  assert.equal(f.business.product("NET-SW-24G").stock, 20);
  assert.equal(f.business.available("NET-SW-24G"), 20);
  assert.equal(f.business.getOrder(f.owner, f.orderId).status, "cancelled");
  assert.equal(
    f.store.one<{ amount: number }>("SELECT amount FROM budget_allocations")!
      .amount,
    192000,
  );
});
test("expired holds are reacquired only from currently free physical stock", (t) => {
  const f = fixture(t);
  f.store.run(
    "UPDATE reservations SET expires_at='2026-10-12T07:00:00.000Z' WHERE order_id=?",
    f.orderId,
  );
  const competitor = f.business.prepareOrder(f.auth.actor("customer-b"), {
    productId: "NET-SW-24G",
    quantity: 8,
    deadline: "2026-10-30",
    destination: "baku",
    allowPartial: false,
    allowSubstitution: false,
  });
  f.business.confirmOrder(f.auth.actor("customer-b"), {
    offerId: competitor.id,
    version: 1,
    confirmed: true,
    key: randomUUID(),
  });
  const r = f.receive();
  f.inspect(r.id);
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).reserved, 12);
  assert.equal(f.business.available("NET-SW-24G"), 0);
  assert.equal(
    f.business.getOrder(f.owner, f.orderId).status,
    "awaiting_supply",
  );
});
test("late inspection adds actual stock but cannot change the accepted deadline or promise completion", (t) => {
  const f = fixture(t),
    r = f.receive();
  f.clock.instant = "2026-10-23T08:00:00.000Z";
  f.inspect(r.id);
  assert.equal(f.business.product("NET-SW-24G").stock, 20);
  assert.equal(
    f.business.getOrder(f.owner, f.orderId).status,
    "awaiting_supply",
  );
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).batches.length, 0);
  assert.ok(
    f.fulfillment
      .progress(f.owner, f.orderId)
      .notifications.some(
        (n) => n.parameters.reason === "FULFILLMENT_DEADLINE_REVIEW",
      ),
  );
});
test("changed accepted specification blocks allocation even when goods pass inspection", (t) => {
  const f = fixture(t),
    r = f.receive();
  f.store.run("UPDATE orders SET allow_substitution=1 WHERE id=?", f.orderId);
  f.inspect(r.id);
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).reserved, 8);
  assert.equal(
    f.business.getOrder(f.owner, f.orderId).status,
    "awaiting_supply",
  );
  assert.ok(
    f.fulfillment
      .progress(f.owner, f.orderId)
      .notifications.some(
        (n) => n.parameters.reason === "FULFILLMENT_CONSENT_STALE",
      ),
  );
});
test("supplier delay records a reviewed estimate, leaves stock and budget unchanged and blocks double purchasing", (t) => {
  const f = fixture(t),
    before = f.store.all("SELECT * FROM budget_allocations"),
    key = randomUUID();
  const input = {
    kind: "delay",
    receiptAt: "2026-10-20T08:00:00.000Z",
    evidence: "Sandbox supplier revised date",
    key,
  };
  const r = f.fulfillment.supplierEvent(f.purchaser, f.poId, input);
  assert.deepEqual(f.fulfillment.supplierEvent(f.purchaser, f.poId, input), r);
  assert.deepEqual(f.store.all("SELECT * FROM budget_allocations"), before);
  assert.equal(f.business.product("NET-SW-24G").stock, 8);
  assert.equal(f.fulfillment.progress(f.owner, f.orderId).batches.length, 0);
  assert.ok(
    f.fulfillment
      .progress(f.owner, f.orderId)
      .notifications.some(
        (n) => n.parameters.deliveryAt === "2026-10-23T08:00:00.000Z",
      ),
  );
  assert.equal(
    f.fulfillment.replan(f.owner, "fixture-006", {
      reason: "Delay",
      key: randomUUID(),
    }).outcome,
    "escalated",
  );
  assert.equal(count(f.store, "purchase_orders"), 1);
  assert.throws(
    () =>
      f.fulfillment.supplierEvent(f.owner, f.poId, {
        ...input,
        receiptAt: FIXTURE_TIME,
        key: randomUUID(),
      }),
    /SUPPLIER_DELAY_INVALID/,
  );
});
test("partial cancellation releases unit costs only, retains fees and refuses already received quantities", (t) => {
  const f = fixture(t),
    r = f.receive(5);
  f.inspect(r.id);
  const result = f.fulfillment.supplierEvent(f.purchaser, f.poId, {
    kind: "cancellation",
    quantity: 7,
    evidence: "Supplier accepted cancellation",
    key: randomUUID(),
  });
  assert.equal(result.releasedAmount, 108500);
  assert.equal(
    f.store.one<{ amount: number }>("SELECT amount FROM budget_allocations")!
      .amount,
    83500,
  );
  assert.equal(f.business.search("NET-SW")[0]!.incoming, 0);
  assert.throws(() => f.receive(1), /PURCHASE_NOT_RECEIVABLE/);
  assert.equal(
    f.business.getOrder(f.owner, f.orderId).status,
    "awaiting_supply",
  );
});
test("full acknowledged cancellation releases budget and replans a fresh draft without transferring human approval", (t) => {
  const f = fixture(t),
    key = randomUUID(),
    input = {
      kind: "cancellation",
      quantity: 12,
      evidence: "Supplier accepted full cancellation",
      key,
    };
  const result = f.fulfillment.supplierEvent(f.owner, f.poId, input);
  assert.equal(result.releasedAmount, 192000);
  assert.deepEqual(f.fulfillment.supplierEvent(f.owner, f.poId, input), result);
  assert.equal(
    f.store.one<{ status: string; amount: number }>(
      "SELECT status,amount FROM budget_allocations",
    )!.amount,
    0,
  );
  const replanned = f.fulfillment.replan(f.owner, "fixture-006", {
    reason: "Replacement after cancellation",
    key: randomUUID(),
  });
  assert.equal(replanned.outcome, "new_decision_required");
  const proposal = f.procurement.detail(f.owner, replanned.proposalId!);
  assert.equal(proposal.status, "draft");
  assert.equal(proposal.effectiveStatus, "draft");
  assert.equal(proposal.version, 2);
  assert.equal(count(f.store, "approval_decisions"), 1);
  assert.equal(count(f.store, "purchase_orders"), 1);
  const request = f.approvals.submit(f.owner, "fixture-006", proposal.id, {
    mode: "mock",
    expectedVersion: 2,
    key: randomUUID(),
  });
  f.approvals.decide(f.owner, "fixture-006", request.id, {
    decision: "approved",
    reason: "Fresh replacement approval",
    key: randomUUID(),
  });
  assert.equal(
    new PurchaseExecution(f.approvals).purchase(request.id).status,
    "waiting_supply",
  );
  assert.equal(count(f.store, "purchase_orders"), 2);
});
test("supplier event audit failure rolls back cancelled quantity and budget release", (t) => {
  const f = fixture(t);
  f.store.db.exec(
    "CREATE TRIGGER fail_cancel BEFORE INSERT ON audit_events WHEN NEW.action='supplier.cancellation' BEGIN SELECT RAISE(ABORT,'test rollback'); END;",
  );
  assert.throws(
    () =>
      f.fulfillment.supplierEvent(f.owner, f.poId, {
        kind: "cancellation",
        quantity: 12,
        evidence: "Cancellation",
        key: randomUUID(),
      }),
    /test rollback/,
  );
  assert.equal(count(f.store, "supplier_events"), 0);
  assert.equal(
    f.store.one<{ amount: number }>("SELECT amount FROM budget_allocations")!
      .amount,
    192000,
  );
  assert.equal(
    f.store.one<{ cancelled_quantity: number }>(
      "SELECT cancelled_quantity FROM purchase_orders",
    )!.cancelled_quantity,
    0,
  );
});
test("receipt, inspection, allocation and supplier evidence are immutable", (t) => {
  const f = fixture(t),
    r = f.receive();
  f.inspect(r.id);
  assert.throws(
    () => f.store.run("UPDATE goods_receipts SET quantity=1 WHERE id=?", r.id),
    /immutable/,
  );
  assert.throws(
    () => f.store.run("UPDATE receipt_inspections SET outcome='damaged'"),
    /immutable/,
  );
  assert.throws(
    () => f.store.run("UPDATE receipt_allocations SET quantity=1"),
    /immutable/,
  );
  assert.throws(() => f.store.run("DELETE FROM goods_receipts"), /append-only/);
});
test("HTTP permission, fresh role revocation and customer progress privacy boundaries hold", async (t) => {
  const f = fixture(t),
    app = createApp(f.store, f.clock);
  t.after(() => app.close());
  const tokens = Object.fromEntries(
    ["owner", "operator", "purchaser", "customer-a", "customer-b"].map((id) => [
      id,
      f.auth.login({ email: `${id}@relayops.example`, password: DEMO_PASSWORD })
        .token,
    ]),
  );
  const post = (who: string, url: string, payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${tokens[who]}` },
      payload,
    });
  for (const who of ["customer-a", "purchaser"])
    assert.equal(
      (
        await post(who, `/api/purchase-orders/${f.poId}/receipts`, {
          quantity: 1,
          evidence: "test",
          key: randomUUID(),
        })
      ).statusCode,
      403,
    );
  assert.equal(
    (
      await post("owner", `/api/purchase-orders/${f.poId}/receipts`, {
        quantity: 1,
        evidence: "test",
        key: randomUUID(),
        role: "owner",
      })
    ).statusCode,
    400,
  );
  f.store.run("DELETE FROM roles WHERE account_id='operator'");
  assert.equal(
    (
      await post("operator", `/api/purchase-orders/${f.poId}/receipts`, {
        quantity: 1,
        evidence: "test",
        key: randomUUID(),
      })
    ).statusCode,
    403,
  );
  const other = await app.inject({
    url: `/api/orders/${f.orderId}/progress`,
    headers: { authorization: `Bearer ${tokens["customer-a"]}` },
  });
  assert.equal(other.statusCode, 404);
  const own = await app.inject({
    url: `/api/orders/${f.orderId}/progress`,
    headers: { authorization: `Bearer ${tokens["customer-b"]}` },
  });
  assert.equal(own.statusCode, 200);
  assert.ok(!own.body.includes("192000"));
  assert.ok(!own.body.includes("chat_id"));
});
test("localized progress notifications follow account locale and cannot repeat on replay", (t) => {
  const f = fixture(t);
  f.store.run("UPDATE accounts SET locale='en' WHERE id='customer-b'");
  const key = randomUUID(),
    r = f.receive(12, key);
  f.receive(12, key);
  f.inspect(r.id);
  const progress = f.fulfillment.progress(
    f.auth.actor("customer-b"),
    f.orderId,
  );
  assert.equal(
    progress.notifications.filter((n) => n.message_key === "nGoodsReceived")
      .length,
    1,
  );
  assert.equal(
    progress.notifications.find((n) => n.message_key === "nOrderReady")!.locale,
    "en",
  );
  assert.ok(progress.timeline.some((n) => n.action === "goods.inspected"));
});
test("full customer HTTP request to purchase, receipt, stock and final dispatch/delivery chain", async (t) => {
  const store = new Store();
  store.migrate();
  seed(store);
  const auth = new Auth(store),
    owner = auth.actor("owner"),
    customer = auth.actor("customer-a"),
    business = new Business(store, frozenClock());
  const oldOrder = store.one<{ order_id: string }>(
    "SELECT order_id FROM procurement_cases WHERE id='fixture-006'",
  )!.order_id;
  business.cancelOrder(owner, oldOrder, {
    reason: "Isolated chain fixture",
    key: randomUUID(),
  });
  const options = { mapping, liveEnabled: false };
  const app = createApp(store, frozenClock(), {}, {}, options);
  t.after(async () => {
    await app.close();
    store.close();
  });
  const headers = {
    authorization: `Bearer ${auth.login({ email: "owner@relayops.example", password: DEMO_PASSWORD }).token}`,
  };
  const customerHeaders = {
    authorization: `Bearer ${auth.login({ email: "customer-a@relayops.example", password: DEMO_PASSWORD }).token}`,
  };
  const offerResponse = await app.inject({
    method: "POST",
    url: "/api/order-offers",
    headers: customerHeaders,
    payload: {
      productId: "NET-SW-24G",
      quantity: 20,
      deadline: "2026-10-19",
      destination: "baku",
      allowPartial: false,
      allowSubstitution: false,
    },
  });
  assert.equal(offerResponse.statusCode, 200, offerResponse.body);
  const offer = offerResponse.json().data;
  const confirmPayload = {
    offerId: offer.id,
    version: 1,
    confirmed: true,
    key: randomUUID(),
  };
  const accepted = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: customerHeaders,
    payload: confirmPayload,
  });
  assert.equal(accepted.statusCode, 200, accepted.body);
  const orderId: string = accepted.json().data.id;
  assert.equal(accepted.json().data.status, "awaiting_supply");
  const retry = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: customerHeaders,
    payload: confirmPayload,
  });
  assert.equal(retry.json().data.id, orderId);
  const caseId = store.one<{ id: string }>(
    "SELECT id FROM procurement_cases WHERE order_id=?",
    orderId,
  )!.id;
  const procurement = new Procurement(business),
    evidence = procurement.evidence(owner, caseId);
  assert.equal(evidence.requirements.requiredQuantity, 12);
  const proposal = procurement.prepare(owner, caseId, {
    expectedVersion: 0,
    evidenceFingerprint: evidence.fingerprint,
    rationale: "Deterministic end-to-end comparison",
    revisionReason: null,
  });
  const approvalResponse = await app.inject({
    method: "POST",
    url: `/api/procurement/${caseId}/proposals/${proposal.id}/approval`,
    headers,
    payload: { mode: "mock", expectedVersion: 1, key: randomUUID() },
  });
  assert.equal(approvalResponse.statusCode, 200, approvalResponse.body);
  const request = approvalResponse.json().data;
  const decision = await app.inject({
    method: "POST",
    url: `/api/procurement/${caseId}/approvals/${request.id}/decision`,
    headers,
    payload: {
      decision: "approved",
      reason: "Sandbox human authorization",
      key: randomUUID(),
    },
  });
  assert.equal(decision.statusCode, 200, decision.body);
  const poId = new PurchaseExecution(
    new Approvals(business, auth, options),
  ).purchase(request.id).purchaseOrderId!;
  const r = await app.inject({
    method: "POST",
    url: `/api/purchase-orders/${poId}/receipts`,
    headers,
    payload: {
      quantity: 12,
      evidence: "Full sandbox delivery",
      key: randomUUID(),
    },
  });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(business.product("NET-SW-24G").stock, 8);
  const inspected = await app.inject({
    method: "POST",
    url: `/api/goods-receipts/${r.json().data.id}/inspect`,
    headers,
    payload: {
      outcome: "sellable",
      notes: "All twelve passed",
      key: randomUUID(),
    },
  });
  assert.equal(inspected.statusCode, 200, inspected.body);
  for (const status of ["processing", "shipped", "delivered"]) {
    const payload = {
      status,
      evidence: `Sandbox ${status} evidence`,
      key: randomUUID(),
    };
    const response = await app.inject({
      method: "POST",
      url: `/api/orders/${orderId}/transition`,
      headers,
      payload,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/orders/${orderId}/transition`,
          headers,
          payload,
        })
      ).statusCode,
      200,
    );
  }
  const order = business.getOrder(owner, orderId);
  assert.equal(order.status, "delivered");
  assert.equal(order.lines[0]!.delivered_quantity, 20);
  assert.equal(business.product("NET-SW-24G").stock, 0);
  const progress = new Fulfillment(business).progress(customer, orderId);
  const actions = progress.timeline.map((row) => row.action);
  assert.ok(
    actions.indexOf("goods.received") < actions.indexOf("goods.inspected"),
  );
  assert.ok(
    actions.indexOf("goods.inspected") < actions.indexOf("stock.allocated"),
  );
  assert.ok(
    actions.indexOf("stock.allocated") < actions.indexOf("order.supply_ready"),
  );
  assert.equal(
    progress.notifications.filter((n) => n.message_key === "nOrderDelivered")
      .length,
    1,
  );
  assert.equal(progress.batches[0]!.status, "delivered");
  for (const event of [
    "nShortageAcknowledged",
    "nApprovalPending",
    "nApprovalApproved",
    "nPurchasingConfirmed",
    "nGoodsReceived",
    "nStockAllocated",
    "nOrderReady",
    "nOrderShipped",
    "nOrderDelivered",
  ])
    assert.ok(
      progress.notifications.some((n) => n.message_key === event),
      event,
    );
});
test("pending receipt survives SQLite reopen; post-commit process crash cannot repeat inventory or allocation", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "relayops-receipt-crash-")),
    path = join(dir, "demo.sqlite");
  const f = fixture(t, path),
    r = f.receive(),
    key = randomUUID();
  f.close();
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "test/fixtures/receipt-process.ts",
      path,
      r.id,
      key,
      "crash",
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(child.status, 32, child.stderr);
  const store = new Store(path);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const fulfillment = new Fulfillment(new Business(store, frozenClock()));
  assert.equal(
    fulfillment.inspect(new Auth(store).actor("operator"), r.id, {
      outcome: "sellable",
      notes: "Process inspection",
      key,
    }).allocated,
    12,
  );
  assert.equal(count(store, "receipt_inspections"), 1);
  assert.equal(count(store, "receipt_allocations"), 1);
  assert.equal(
    store.one<{ stock: number }>(
      "SELECT stock FROM products WHERE id='NET-SW-24G'",
    )!.stock,
    20,
  );
});
test("two independent OS inspectors commit one stock movement and allocation", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "relayops-receipt-race-")),
    path = join(dir, "demo.sqlite");
  const f = fixture(t, path),
    r = f.receive();
  const run = () =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "test/fixtures/receipt-process.ts",
          path,
          r.id,
          randomUUID(),
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let errors = "";
      child.stderr.on("data", (data) => (errors += String(data)));
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(errors)),
      );
    });
  await Promise.all([run(), run()]);
  assert.equal(count(f.store, "receipt_inspections"), 1);
  assert.equal(count(f.store, "receipt_allocations"), 1);
  assert.equal(f.business.product("NET-SW-24G").stock, 20);
  f.close();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
});
