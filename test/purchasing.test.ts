import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { createApp } from "../src/server/app.js";

async function fixture(t: test.TestContext) {
  const store = new Store();
  store.migrate();
  seed(store);
  const app = createApp(store);
  t.after(async () => {
    await app.close();
    store.close();
  });
  const auth = async (id: string) => ({
    authorization: `Bearer ${(await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `${id}@relayops.example`, password: DEMO_PASSWORD } })).json().data.token}`,
  });
  const owner = await auth("owner"),
    purchaser = await auth("purchaser"),
    operator = await auth("operator"),
    customer = await auth("customer-a");
  const initial = store.one<Record<string, unknown>>(
    "SELECT * FROM quotes WHERE id='quote-northlink-v1'",
  )!;
  const { id: _id, version: _version, ...fields } = initial;
  void _id;
  void _version;
  const payload = {
    ...fields,
    specs: JSON.parse(String(fields.specs)),
    expectedVersion: 1,
    revisionReason: "Supplier confirmed revised price",
    key: "quotation-revision-test",
  };
  const post = (url: string, payload: object, headers = owner) =>
    app.inject({ method: "POST", url, payload, headers });
  return { store, app, owner, purchaser, operator, customer, payload, post };
}
test("supplier capabilities are real, editable with optimistic versions and protected by role", async (t) => {
  const f = await fixture(t);
  for (const url of ["/api/suppliers", "/api/quotes"]) {
    assert.equal((await f.app.inject(url)).statusCode, 401);
    assert.equal(
      (await f.app.inject({ url, headers: f.customer })).statusCode,
      403,
    );
  }
  const suppliers = (
    await f.app.inject({ url: "/api/suppliers", headers: f.operator })
  ).json().data;
  assert.equal(suppliers.length, 3);
  assert.deepEqual(
    suppliers.find((s: { id: string }) => s.id === "northlink").capabilities,
    { categories: ["networking"], zone: "baku" },
  );
  const input = {
    name: "Northlink Updated",
    capabilities: { categories: ["networking", "computers"], zone: "baku" },
    expectedVersion: 1,
    key: "supplier-update-test",
  };
  for (const headers of [f.customer, f.operator])
    assert.equal(
      (await f.post("/api/suppliers/northlink", input, headers)).statusCode,
      403,
    );
  const saved = await f.post("/api/suppliers/northlink", input, f.purchaser);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().data.version, 2);
  assert.deepEqual(
    (await f.post("/api/suppliers/northlink", input, f.purchaser)).json(),
    saved.json(),
  );
  assert.equal(
    (
      await f.post("/api/suppliers/northlink", {
        ...input,
        key: "stale-supplier-test",
      })
    ).json().error.code,
    "SUPPLIER_VERSION_CONFLICT",
  );
  assert.equal(
    (
      await f.post("/api/suppliers/northlink", {
        ...input,
        capabilities: {
          categories: ["networking", "networking"],
          zone: "baku",
        },
      })
    ).statusCode,
    400,
  );
  const created = await f.post("/api/suppliers", {
    ...input,
    expectedVersion: 0,
    key: "supplier-create-test",
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().data.version, 1);
  assert.deepEqual(
    (
      await f.post("/api/suppliers", {
        ...input,
        expectedVersion: 0,
        key: "supplier-create-test",
      })
    ).json(),
    created.json(),
  );
  const caseId = f.store.one<{ id: string }>(
    "SELECT id FROM procurement_cases",
  )!.id;
  assert.equal(
    (
      await f.post("/api/suppliers/northlink", {
        ...input,
        expectedVersion: 2,
        key: "supplier-remove-capability",
        capabilities: { categories: ["computers"], zone: "baku" },
      })
    ).statusCode,
    200,
  );
  const comparison = (
    await f.app.inject({
      url: `/api/procurement/${caseId}/comparison`,
      headers: f.owner,
    })
  ).json().data;
  assert.equal(comparison.selectedQuoteId, null);
  assert.ok(
    comparison.options
      .find((q: { supplier: string }) => q.supplier === "northlink")
      .reasons.includes("SUPPLIER_CAPABILITY_MISMATCH"),
  );
});
test("quote revisions retain immutable evidence, use latest version and never fall back to superseded offers", async (t) => {
  const f = await fixture(t);
  const before = f.store.one(
    "SELECT * FROM quotes WHERE id='quote-northlink-v1'",
  );
  const v2 = await f.post("/api/quotes", { ...f.payload, unit_price: 15000 });
  assert.equal(v2.statusCode, 200);
  assert.equal(v2.json().data.version, 2);
  assert.equal(v2.json().data.status, "current");
  assert.deepEqual(
    (await f.post("/api/quotes", { ...f.payload, unit_price: 15000 })).json(),
    v2.json(),
  );
  assert.equal(
    (await f.post("/api/quotes", { ...f.payload, unit_price: 14900 })).json()
      .error.code,
    "IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    (
      await f.post("/api/quotes", { ...f.payload, key: "quote-stale-version" })
    ).json().error.code,
    "QUOTE_VERSION_CONFLICT",
  );
  const caseId = f.store.one<{ id: string }>(
    "SELECT id FROM procurement_cases",
  )!.id;
  let comparison = (
    await f.app.inject({
      url: `/api/procurement/${caseId}/comparison`,
      headers: f.owner,
    })
  ).json().data;
  assert.equal(comparison.selectedQuoteId, v2.json().data.id);
  assert.equal(
    comparison.options.find(
      (q: { supplier: string }) => q.supplier === "northlink",
    ).total,
    186000,
  );
  const v3 = await f.post("/api/quotes", {
    ...f.payload,
    expectedVersion: 2,
    other_fees: null,
    key: "quote-incomplete-v3",
  });
  assert.equal(v3.statusCode, 200);
  assert.equal(v3.json().data.status, "incomplete");
  comparison = (
    await f.app.inject({
      url: `/api/procurement/${caseId}/comparison`,
      headers: f.owner,
    })
  ).json().data;
  assert.equal(comparison.selectedQuoteId, null);
  assert.deepEqual(
    comparison.options.find(
      (q: { supplier: string }) => q.supplier === "northlink",
    ).reasons,
    ["INCOMPLETE_OR_UNSUPPORTED_QUOTE"],
  );
  const history = (
    await f.app.inject({
      url: "/api/quotes?supplier=northlink&product=NET-SW-24G",
      headers: f.purchaser,
    })
  ).json().data;
  assert.deepEqual(
    history.map((q: { version: number }) => q.version),
    [3, 2, 1],
  );
  assert.equal(history[1].status, "superseded");
  assert.equal(history[2].evidence, (before as { evidence: string }).evidence);
  assert.deepEqual(
    f.store.one("SELECT * FROM quotes WHERE id='quote-northlink-v1'"),
    before,
  );
  assert.throws(
    () =>
      f.store.run(
        "UPDATE quotes SET unit_price=1 WHERE id='quote-northlink-v1'",
      ),
    /append-only/,
  );
  assert.throws(
    () => f.store.run("DELETE FROM quotes WHERE id='quote-northlink-v1'"),
    /history/,
  );
  assert.throws(
    () => f.store.run("UPDATE quote_records SET revision_reason='fake'"),
    /immutable/,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_events WHERE action='quote.version_recorded'",
    )!.n,
    2,
  );
});
test("quote entry validates exact fields, permissions, supplier capabilities and scoped operator reads", async (t) => {
  const f = await fixture(t);
  for (const headers of [f.customer, f.operator])
    assert.equal(
      (await f.post("/api/quotes", f.payload, headers)).statusCode,
      403,
    );
  for (const patch of [
    { unit_price: 1.25 },
    { available: -1 },
    { currency: "USD" },
    { owner: true },
    { valid_until: "yesterday" },
    { specs: [1, 2] },
    { evidence: " " },
  ])
    assert.equal(
      (await f.post("/api/quotes", { ...f.payload, ...patch })).statusCode,
      400,
    );
  assert.equal(
    (await f.post("/api/quotes", { ...f.payload, supplier_id: "unknown" }))
      .statusCode,
    404,
  );
  assert.equal(
    (
      await f.post("/api/quotes", {
        ...f.payload,
        product_id: "PC-MINI-16",
        expectedVersion: 0,
      })
    ).json().error.code,
    "SUPPLIER_CAPABILITY_MISMATCH",
  );
  await f.post("/api/suppliers/northlink", {
    name: "Northlink Demo",
    capabilities: { categories: ["networking", "computers"], zone: "baku" },
    expectedVersion: 1,
    key: "supplier-computers-test",
  });
  const pc = await f.post("/api/quotes", {
    ...f.payload,
    product_id: "PC-MINI-16",
    expectedVersion: 0,
    key: "computer-quote-test",
  });
  assert.equal(pc.statusCode, 200);
  const scoped = (
    await f.app.inject({ url: "/api/quotes", headers: f.operator })
  ).json().data;
  assert.equal(scoped.length, 3);
  assert.ok(
    scoped.every((q: { product_id: string }) => q.product_id === "NET-SW-24G"),
  );
  assert.equal(
    (
      await f.app.inject({
        url: "/api/quotes?product=PC-MINI-16",
        headers: f.operator,
      })
    ).json().data.length,
    0,
  );
  assert.equal(
    (await f.app.inject({ url: "/api/quotes?role=owner", headers: f.owner }))
      .statusCode,
    400,
  );
  const expired = await f.post("/api/quotes", {
    ...f.payload,
    valid_until: "2026-10-01T08:00:00.000Z",
    key: "expired-quote-test",
  });
  assert.equal(expired.json().data.status, "expired");
});
test("two submissions with the same expected quotation version commit only one revision", async (t) => {
  const f = await fixture(t);
  const results = await Promise.all([
    f.post("/api/quotes", { ...f.payload, key: "quote-race-owner" }),
    f.post(
      "/api/quotes",
      { ...f.payload, key: "quote-race-purchaser" },
      f.purchaser,
    ),
  ]);
  assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM quotes WHERE supplier_id='northlink'",
    )!.n,
    2,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM quote_records WHERE quote_id NOT LIKE 'quote-%'",
    )!.n,
    1,
  );
});
test("a failed quote audit rolls back version, evidence metadata and idempotency together", async (t) => {
  const f = await fixture(t);
  f.store.db.exec(
    "CREATE TRIGGER fail_quote_audit BEFORE INSERT ON audit_events WHEN NEW.action='quote.version_recorded' BEGIN SELECT RAISE(ABORT,'test failure'); END",
  );
  assert.equal((await f.post("/api/quotes", f.payload)).statusCode, 500);
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM quotes")!.n,
    3,
  );
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM quote_records")!.n,
    3,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM idempotency WHERE operation='quote.save'",
    )!.n,
    0,
  );
});
test("001 databases upgrade without losing records; migration tampering and foreign tables are refused", () => {
  const store = new Store();
  try {
    const sql = readFileSync(
      new URL("../migrations/001-initial.sql", import.meta.url),
      "utf8",
    );
    store.db.exec(
      "CREATE TABLE migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL) STRICT",
    );
    store.db.exec(sql);
    store.run(
      "INSERT INTO migrations VALUES (?,?)",
      "001",
      createHash("sha256").update(sql).digest("hex"),
    );
    store.run(
      "INSERT INTO suppliers VALUES (?,?,?)",
      "legacy",
      "Legacy Supplier",
      JSON.stringify({ categories: ["networking"], zone: "baku" }),
    );
    store.migrate();
    store.migrate();
    assert.equal(
      store.one<{ version: number }>(
        "SELECT version FROM suppliers WHERE id='legacy'",
      )!.version,
      1,
    );
    assert.equal(store.all("SELECT * FROM migrations").length, 2);
    store.run("UPDATE migrations SET checksum='bad' WHERE version='002'");
    assert.throws(() => store.migrate(), /checksum/);
    store.run(
      "UPDATE migrations SET checksum=? WHERE version='002'",
      createHash("sha256")
        .update(
          readFileSync(
            new URL(
              "../migrations/002-supplier-quotations.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        )
        .digest("hex"),
    );
    store.db.exec("CREATE TABLE unrelated_private_data(value TEXT)");
    assert.throws(() => store.migrate(), /Unrecognized/);
  } finally {
    store.close();
  }
});
