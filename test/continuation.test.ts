import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Store } from "../src/db/database.js";
import { seed } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Approvals } from "../src/domain/approvals.js";
import { Procurement } from "../src/domain/procurement.js";
import { PurchaseExecution } from "../src/domain/purchase-execution.js";
import { ContinuationWorker } from "../src/worker/continuation.js";
import { frozenClock } from "../src/shared/time.js";

const mapping = {
  botId: 123456,
  userId: 222333,
  chatId: 222333,
  accountId: "owner",
  locale: "en" as const,
};
function fixture(t: TestContext, path = ":memory:") {
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
  const clock = frozenClock(),
    auth = new Auth(store),
    business = new Business(store, clock);
  let wall = Date.now();
  const approvals = new Approvals(
    business,
    auth,
    {
      mapping,
      liveEnabled: true,
    },
    () => wall,
  );
  const procurement = new Procurement(business),
    actor = auth.actor("owner"),
    evidence = procurement.evidence(actor, "fixture-006");
  const proposal = procurement.prepare(actor, "fixture-006", {
    expectedVersion: 0,
    evidenceFingerprint: evidence.fingerprint,
    rationale: "Continuation fixture",
    revisionReason: null,
  });
  const request = approvals.submit(actor, "fixture-006", proposal.id, {
    mode: "mock",
    expectedVersion: 1,
    key: randomUUID(),
  });
  const execution = new PurchaseExecution(approvals),
    worker = new ContinuationWorker(execution);
  const decide = (decision: "approved" | "rejected" = "approved") =>
    approvals.decide(actor, "fixture-006", request.id, {
      decision,
      reason: "Human fixture decision",
      key: randomUUID(),
    });
  return {
    advanceWall: () => {
      wall += 25 * 3600000;
    },
    store,
    close,
    clock,
    auth,
    business,
    approvals,
    procurement,
    proposal,
    request,
    execution,
    worker,
    decide,
    actor,
  };
}
function count(store: Store, table: string) {
  return store.one<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`)!.n;
}
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test("approved continuation creates one acknowledged sandbox PO and commits budget without physical stock", (t) => {
  const f = fixture(t);
  f.decide();
  const beforeStock = f.store.all("SELECT id,stock FROM products ORDER BY id"),
    orders = f.store.all("SELECT * FROM orders ORDER BY id");
  const movements = f.store.all(
    "SELECT * FROM inventory_movements ORDER BY id",
  );
  assert.equal(f.worker.runOne()!.status, "waiting_supply");
  assert.equal(f.worker.runOne(), null);
  assert.equal(f.execution.purchase(f.request.id).status, "waiting_supply");
  assert.equal(count(f.store, "purchase_orders"), 1);
  assert.deepEqual(
    plain(
      f.store.all(
        "SELECT quantity,received_quantity,status FROM purchase_orders",
      ),
    ),
    [{ quantity: 12, received_quantity: 0, status: "acknowledged" }],
  );
  assert.deepEqual(
    plain(f.store.all("SELECT amount,status FROM budget_allocations")),
    [{ amount: 192000, status: "committed" }],
  );
  assert.deepEqual(
    plain(f.store.all("SELECT mode,outcome FROM supplier_acknowledgements")),
    [{ mode: "mock", outcome: "acknowledged" }],
  );
  assert.equal(f.procurement.detail(f.actor, f.proposal.id).status, "executed");
  assert.equal(
    f.store.one<{ state: string }>(
      "SELECT state FROM processes WHERE id=?",
      f.approvals.row(f.request.id).process_id,
    )!.state,
    "waiting_supply",
  );
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM jobs")!.status,
    "done",
  );
  assert.deepEqual(
    f.store.all("SELECT id,stock FROM products ORDER BY id"),
    beforeStock,
  );
  assert.deepEqual(f.store.all("SELECT * FROM orders ORDER BY id"), orders);
  assert.equal(count(f.store, "goods_receipts"), 0);
  assert.deepEqual(
    f.store.all("SELECT * FROM inventory_movements ORDER BY id"),
    movements,
  );
  assert.equal(f.business.search("NET-SW-24G", "en")[0]!.incoming, 12);
  assert.throws(
    () => f.store.run("UPDATE purchase_orders SET quantity=13"),
    /immutable/,
  );
  assert.throws(
    () => f.store.run("UPDATE supplier_acknowledgements SET reason='changed'"),
    /immutable/,
  );
});

test("supplier acknowledgement extends only active unexpired reservations within accepted deadline", (t) => {
  const f = fixture(t);
  f.decide();
  f.worker.runOne();
  const r = f.store.one<{ expires_at: string }>(
    "SELECT expires_at FROM reservations WHERE order_id='fixture-003'",
  )!;
  assert.equal(
    r.expires_at,
    f.proposal.snapshot.evidence.requirements.deadline,
  );
  assert.equal(count(f.store, "reservations"), 1);
});

test("historical executed approval does not expire or release committed obligations on later evidence changes", (t) => {
  const f = fixture(t);
  f.decide();
  f.worker.runOne();
  f.advanceWall();
  f.store.run("UPDATE products SET stock=stock+1 WHERE id='NET-SW-24G'");
  f.store.run("DELETE FROM roles WHERE account_id='owner' AND role='owner'");
  f.approvals.sweep();
  assert.equal(f.approvals.row(f.request.id).status, "approved");
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM budget_allocations")!
      .status,
    "committed",
  );
  assert.equal(
    f.procurement.detail({ ...f.actor, roles: ["purchaser"] }, f.proposal.id)
      .status,
    "executed",
  );
});

test("pending, rejected, expired and stale approved requests cannot execute a purchase", (t) => {
  for (const kind of [
    "pending",
    "rejected",
    "expired",
    "stock",
    "budget",
    "consent",
  ] as const) {
    const f = fixture(t);
    if (kind === "rejected") f.decide("rejected");
    else if (kind !== "pending") f.decide();
    if (kind === "expired") f.advanceWall();
    if (kind === "stock")
      f.store.run("UPDATE products SET stock=stock+1 WHERE id='NET-SW-24G'");
    if (kind === "budget")
      f.store.run(
        "UPDATE procurement_cases SET budget=100 WHERE id='fixture-006'",
      );
    if (kind === "consent")
      f.store.run(
        "UPDATE orders SET status='cancelled' WHERE id='fixture-003'",
      );
    assert.equal(f.execution.purchase(f.request.id).status, "escalated", kind);
    assert.equal(count(f.store, "purchase_orders"), 0, kind);
    if (!["pending", "rejected"].includes(kind))
      assert.equal(
        f.store.one<{ status: string }>(
          "SELECT status FROM budget_allocations",
        )!.status,
        "released",
        kind,
      );
  }
});

test("revoked owner causes a persisted failed job and escalation without purchasing", (t) => {
  const f = fixture(t);
  f.decide();
  f.store.run("DELETE FROM roles WHERE account_id='owner' AND role='owner'");
  assert.equal(f.worker.runOne()!.status, "escalated");
  assert.equal(count(f.store, "purchase_orders"), 0);
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM jobs")!.status,
    "failed",
  );
  assert.equal(f.worker.runOne(), null);
});

test("a mismatched job cannot bind a decision from another request or process", (t) => {
  const f = fixture(t);
  f.decide();
  f.store.run(
    "UPDATE jobs SET payload=?",
    JSON.stringify({ requestId: f.request.id, proposalId: randomUUID() }),
  );
  assert.equal(f.worker.runOne()!.status, "escalated");
  assert.equal(count(f.store, "purchase_orders"), 0);
});

test("audit failure rolls back PO, allocation, acknowledgement, reservation extension and job claim", (t) => {
  const f = fixture(t);
  f.decide();
  const reservations = f.store.all("SELECT * FROM reservations");
  f.store.db.exec(
    "CREATE TRIGGER fail_purchase_audit BEFORE INSERT ON audit_events WHEN NEW.action='purchase.created' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
  );
  assert.throws(() => f.worker.runOne(), /synthetic audit failure/);
  for (const table of ["purchase_orders", "supplier_acknowledgements"])
    assert.equal(count(f.store, table), 0);
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM budget_allocations")!
      .status,
    "reserved",
  );
  assert.deepEqual(f.store.all("SELECT * FROM reservations"), reservations);
  assert.deepEqual(plain(f.store.all("SELECT status,attempts FROM jobs")), [
    { status: "ready", attempts: 0 },
  ]);
  f.store.db.exec("DROP TRIGGER fail_purchase_audit");
  assert.equal(f.worker.runOne()!.status, "waiting_supply");
});

test("simulated supplier failure preserves failed PO evidence, releases budget and excludes incoming stock", (t) => {
  const f = fixture(t);
  f.decide();
  assert.equal(f.worker.runOne("failed")!.status, "escalated");
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM purchase_orders")!
      .status,
    "failed",
  );
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM budget_allocations")!
      .status,
    "released",
  );
  assert.equal(f.business.search("NET-SW-24G", "en")[0]!.incoming, 0);
  assert.equal(count(f.store, "supplier_acknowledgements"), 1);
  assert.equal(f.execution.purchase(f.request.id).status, "escalated");
  assert.equal(count(f.store, "purchase_orders"), 1);
});

test("rejection continuation recomputes an immutable draft without carrying over a decision or sending it", (t) => {
  const f = fixture(t);
  f.decide("rejected");
  assert.equal(f.worker.runOne()!.status, "revision_ready");
  assert.equal(f.worker.runOne(), null);
  const latest = f.procurement.list(f.actor, "fixture-006")[0]!;
  assert.equal(latest.version, 2);
  assert.equal(latest.status, "draft");
  assert.equal(latest.snapshot.previousProposalId, f.proposal.id);
  assert.equal(latest.snapshot.revisionReason, "Human fixture decision");
  assert.equal(count(f.store, "approval_requests"), 1);
  assert.equal(count(f.store, "approval_decisions"), 1);
  assert.equal(count(f.store, "purchase_orders"), 0);
  assert.equal(count(f.store, "budget_allocations"), 0);
  assert.equal(f.execution.revise(f.request.id).proposalId, latest.id);
  assert.equal(count(f.store, "proposals"), 2);
});

test("rejection without a feasible quote escalates instead of inventing a revised offer", (t) => {
  const f = fixture(t);
  f.decide("rejected");
  f.store.run("UPDATE procurement_cases SET budget=100 WHERE id='fixture-006'");
  assert.equal(f.worker.runOne()!.status, "escalated");
  assert.equal(count(f.store, "proposals"), 1);
  assert.equal(count(f.store, "purchase_orders"), 0);
});

test("abandoned leases resume while active leases and exhausted jobs cannot repeat effects", (t) => {
  const f = fixture(t);
  f.decide();
  f.store.run(
    "UPDATE jobs SET status='leased',lease_until=?",
    new Date(Date.now() + 60_000).toISOString(),
  );
  assert.equal(f.worker.runOne(), null);
  f.store.run("UPDATE jobs SET lease_until='2000-01-01T00:00:00.000Z'");
  assert.equal(f.worker.runOne()!.status, "waiting_supply");
  const g = fixture(t);
  g.decide();
  g.store.run("UPDATE jobs SET attempts=max_attempts");
  assert.equal(g.worker.runOne()!.status, "escalated");
  assert.equal(count(g.store, "purchase_orders"), 0);
});

test("actual process exit after continuation commit reopens with one PO and a completed job", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-continuation-")),
    path = join(directory, "demo.sqlite");
  const f = fixture(t, path);
  f.decide();
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "test/fixtures/continuation-process.ts", path, "crash"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(child.status, 31, child.stderr);
  f.close();
  const reopened = new Store(path);
  t.after(() => reopened.close());
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const approvals = new Approvals(
    new Business(reopened, frozenClock()),
    new Auth(reopened),
    { mapping, liveEnabled: true },
  );
  assert.equal(
    new ContinuationWorker(new PurchaseExecution(approvals)).runOne(),
    null,
  );
  for (const table of [
    "purchase_orders",
    "supplier_acknowledgements",
    "approval_decisions",
    "budget_allocations",
  ])
    assert.equal(count(reopened, table), 1);
  assert.equal(
    reopened.one<{ status: string }>("SELECT status FROM jobs")!.status,
    "done",
  );
});

test("two independent OS processes competing for one continuation commit exactly one purchase", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-continuation-race-")),
    path = join(directory, "demo.sqlite");
  const f = fixture(t, path);
  f.decide();
  const run = () =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "test/fixtures/continuation-process.ts",
          path,
          "once",
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let errors = "";
      child.stderr.on("data", (value) => {
        errors += String(value);
      });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(errors)),
      );
    });
  await Promise.all([run(), run()]);
  assert.equal(count(f.store, "purchase_orders"), 1);
  assert.equal(count(f.store, "supplier_acknowledgements"), 1);
  assert.equal(count(f.store, "audit_events") > 0, true);
  f.close();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
});
