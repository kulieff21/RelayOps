import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Procurement } from "../src/domain/procurement.js";
import { Purchasing } from "../src/domain/purchasing.js";
import {
  ProcurementAssistant,
  type ProcurementModels,
} from "../src/agent/procurement-assistant.js";
import { ProcurementMock } from "../src/model/procurement-mock.js";
import { ToolDispatcher, type ToolContext } from "../src/agent/tools.js";
import { FIXTURE_TIME } from "../src/shared/time.js";
import { BusinessError } from "../src/shared/contracts.js";
import { createApp } from "../src/server/app.js";
import { CustomerAssistant } from "../src/agent/customer-assistant.js";
import { OpenRouter, type CompletionInput } from "../src/model/openrouter.js";
import { ModelBudget } from "../src/model/budget.js";
import { modelConfig } from "../src/model/config.js";

const failure = (code: string) => (e: unknown) =>
  e instanceof BusinessError && e.code === code;
function fixture(t: TestContext, models: ProcurementModels = {}) {
  const store = new Store();
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
  const procurement = new Procurement(business),
    purchasing = new Purchasing(business);
  const assistant = new ProcurementAssistant(business, auth, models);
  t.after(async () => {
    await assistant.idle();
    store.close();
  });
  const token = (account = "purchaser") =>
    auth.login({
      email: `${account}@relayops.example`,
      password: DEMO_PASSWORD,
    }).token;
  const context = (
    account = "purchaser",
    locale: "en" | "az" = "en",
  ): Extract<ToolContext, { agent: "procurement" }> => ({
    agent: "procurement",
    caseId: "fixture-006",
    sessionToken: token(account),
    locale,
  });
  const purchaser = auth.actor("purchaser");
  const input = (actor = purchaser) => {
    const e = procurement.evidence(actor, "fixture-006");
    return {
      expectedVersion: e.latestVersion,
      evidenceFingerprint: e.fingerprint,
      rationale: "Recorded comparison",
      revisionReason: e.latestVersion ? "Quotation revised" : null,
    };
  };
  const reviseQuote = (
    patch: Record<string, unknown>,
    supplier = "northlink",
  ) => {
    const q = purchasing
      .quotes(purchaser, { supplier, product: "NET-SW-24G" })
      .find((q) => q.isCurrent)!;
    return purchasing.saveQuote(purchaser, {
      supplier_id: q.supplier_id,
      product_id: q.product_id,
      expectedVersion: q.version,
      available: q.available,
      moq: q.moq,
      unit_price: q.unit_price,
      currency: q.currency,
      delivery_fee: q.delivery_fee,
      other_fees: q.other_fees,
      valid_until: q.valid_until,
      receipt_at: q.receipt_at,
      destination: q.destination,
      availability_at: q.availability_at,
      specs: q.specs,
      terms: q.terms,
      evidence: q.evidence,
      revisionReason: "Synthetic revision fixture",
      key: randomUUID(),
      ...patch,
    });
  };
  const request = (patch: Record<string, unknown> = {}) => ({
    mode: "mock",
    locale: "en",
    key: randomUUID(),
    expectedVersion: 0,
    revisionReason: null,
    ...patch,
  });
  return {
    store,
    clock,
    auth,
    business,
    procurement,
    purchasing,
    assistant,
    token,
    context,
    purchaser,
    input,
    reviseQuote,
    request,
  };
}
function unchangedBusiness(store: Store) {
  return JSON.stringify(
    [
      "orders",
      "reservations",
      "products",
      "procurement_cases",
      "budget_allocations",
      "purchase_orders",
      "goods_receipts",
      "approval_requests",
    ].map((name) => [name, store.all(`SELECT * FROM ${name} ORDER BY rowid`)]),
  );
}
test("reference proposal uses actual consent, exact quotation arithmetic, immutable evidence and no purchasing effects", (t) => {
  const f = fixture(t),
    before = unchangedBusiness(f.store);
  const e = f.procurement.evidence(f.purchaser, "fixture-006");
  assert.equal(e.requirements.acceptedQuantity, 20);
  assert.equal(e.requirements.inventory.reservedForOrder, 8);
  assert.equal(e.requirements.requiredQuantity, 12);
  assert.equal(e.comparison.selectedQuoteId, "quote-northlink-v1");
  const p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  assert.equal(p.total, 192000);
  assert.equal(p.quantity, 12);
  assert.equal(p.version, 1);
  assert.equal(p.effectiveStatus, "draft");
  assert.equal(p.snapshot.humanDecisionRequired, true);
  assert.equal(p.snapshot.purchasingExecuted, false);
  assert.ok(
    p.snapshot.explanation.en.includes("quote-byteharbor-v1 v1: misses"),
  );
  assert.ok(
    p.snapshot.explanation.az.includes("qalan satınalma büdcəsini aşır"),
  );
  assert.equal(unchangedBusiness(f.store), before);
  assert.throws(
    () => f.store.run("UPDATE proposals SET total=1 WHERE id=?", p.id),
    /immutable/,
  );
  assert.throws(
    () => f.store.run("UPDATE proposals SET snapshot='{}' WHERE id=?", p.id),
    /immutable/,
  );
});
test("proposal preparation is idempotent, conflicts on changed content and serializes versions across staff", (t) => {
  const f = fixture(t),
    input = f.input(),
    p = f.procurement.prepare(f.purchaser, "fixture-006", input);
  assert.deepEqual(f.procurement.prepare(f.purchaser, "fixture-006", input), p);
  assert.throws(
    () =>
      f.procurement.prepare(f.purchaser, "fixture-006", {
        ...input,
        rationale: "Different",
      }),
    failure("IDEMPOTENCY_CONFLICT"),
  );
  assert.throws(
    () => f.procurement.prepare(f.auth.actor("owner"), "fixture-006", input),
    failure("PROPOSAL_VERSION_CONFLICT"),
  );
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM proposals")!.n,
    1,
  );
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_events WHERE action='proposal.prepared'",
    )!.n,
    1,
  );
});
test("changed quote creates a new proposal version, preserves snapshots and supersedes only the old draft", (t) => {
  const f = fixture(t),
    p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  const snapshot = f.store.one<{ snapshot: string }>(
    "SELECT snapshot FROM proposals WHERE id=?",
    p.id,
  )!.snapshot;
  const quote = f.reviseQuote({ unit_price: 15000 });
  assert.equal(
    f.procurement.detail(f.purchaser, p.id).effectiveStatus,
    "invalidated",
  );
  const e = f.input();
  assert.throws(
    () =>
      f.procurement.prepare(f.purchaser, "fixture-006", {
        ...e,
        revisionReason: null,
      }),
    failure("PROPOSAL_REVISION_REASON_REQUIRED"),
  );
  const next = f.procurement.prepare(f.purchaser, "fixture-006", e);
  assert.equal(next.version, 2);
  assert.equal(next.total, 186000);
  assert.equal(next.snapshot.selectedQuoteId, quote.id);
  assert.equal(next.snapshot.previousProposalId, p.id);
  assert.equal(f.procurement.detail(f.purchaser, p.id).status, "superseded");
  assert.equal(
    f.store.one<{ snapshot: string }>(
      "SELECT snapshot FROM proposals WHERE id=?",
      p.id,
    )!.snapshot,
    snapshot,
  );
});
test("rejected proposal revision retains original human rejection and never transfers an approval", (t) => {
  const f = fixture(t),
    p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  // Phase 12 is not implemented: these are explicit fixture records of a prior decision.
  f.store.run("UPDATE proposals SET status='rejected' WHERE id=?", p.id);
  f.store.run(
    "INSERT INTO approval_requests VALUES('rejected-request',?,'owner',?,'rejected')",
    p.id,
    p.expiresAt,
  );
  f.store.run(
    "INSERT INTO approval_decisions VALUES('rejected-request','owner','rejected','Review supplier terms',?)",
    FIXTURE_TIME,
  );
  const revised = f.procurement.prepare(f.purchaser, "fixture-006", {
    ...f.input(),
    revisionReason: "Reviewed supplier terms after rejection",
  });
  assert.equal(revised.version, 2);
  assert.equal(revised.status, "draft");
  assert.equal(f.procurement.detail(f.purchaser, p.id).status, "rejected");
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM approval_requests WHERE proposal_id=?",
      revised.id,
    )!.n,
    0,
  );
  assert.equal(
    f.store.one<{ reason: string }>("SELECT reason FROM approval_decisions")!
      .reason,
    "Review supplier terms",
  );
});
test("fresh evidence fingerprint blocks stale quotation, capability, budget, stock and demand changes", (t) => {
  const f = fixture(t);
  const mutations = [
    () => f.reviseQuote({ unit_price: 15000 }),
    () =>
      f.purchasing.saveSupplier(
        f.purchaser,
        {
          name: "Northlink revised",
          expectedVersion: 1,
          capabilities: { categories: ["networking"], zone: "baku" },
          key: randomUUID(),
        },
        "northlink",
      ),
    () =>
      f.store.run(
        "UPDATE procurement_cases SET budget=190000 WHERE id='fixture-006'",
      ),
    () =>
      f.store.run("UPDATE products SET stock=stock+1 WHERE id='NET-SW-24G'"),
    () =>
      f.store.run(
        "UPDATE reservations SET quantity=7 WHERE order_id=(SELECT order_id FROM procurement_cases WHERE id='fixture-006')",
      ),
  ];
  for (const change of mutations) {
    const input = f.input();
    change();
    assert.throws(
      () => f.procurement.prepare(f.purchaser, "fixture-006", input),
      failure("PROCUREMENT_EVIDENCE_STALE"),
    );
  }
  assert.equal(f.procurement.list(f.purchaser, "fixture-006").length, 0);
});
test("accepted specifications stay authoritative when the catalogue changes and never authorize substitution", (t) => {
  const f = fixture(t),
    original = f.procurement.requirements(f.purchaser, "fixture-006").specs;
  f.store.run(
    "UPDATE products SET specs=? WHERE id='NET-SW-24G'",
    JSON.stringify({ ports: 48, poe: true }),
  );
  assert.deepEqual(
    f.procurement.requirements(f.purchaser, "fixture-006").specs,
    original,
  );
  const p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  assert.equal(p.total, 192000);
  assert.deepEqual(p.snapshot.evidence.requirements.specs, original);
  assert.equal(p.snapshot.evidence.requirements.allowSubstitution, false);
});
test("expired reservations no longer cover demand and invalidate the original proposal", (t) => {
  const f = fixture(t),
    p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  f.store.run(
    "UPDATE reservations SET expires_at=? WHERE order_id=(SELECT order_id FROM procurement_cases WHERE id='fixture-006')",
    FIXTURE_TIME,
  );
  const e = f.procurement.evidence(f.purchaser, "fixture-006");
  assert.equal(e.requirements.requiredQuantity, 20);
  assert.equal(e.requirements.inventory.reservedForOrder, 0);
  assert.equal(e.requirements.reservationRevalidationRequired, true);
  assert.equal(e.comparison.selectedQuoteId, null);
  assert.equal(
    f.procurement.detail(f.purchaser, p.id).effectiveStatus,
    "invalidated",
  );
  assert.throws(
    () => f.procurement.prepare(f.purchaser, "fixture-006", f.input()),
    failure("NO_FEASIBLE_QUOTE"),
  );
});
test("MOQ purchase retains excess separately and adds every declared charge", (t) => {
  const f = fixture(t);
  f.store.run(
    "UPDATE procurement_cases SET budget=300000 WHERE id='fixture-006'",
  );
  f.reviseQuote({ other_fees: 120000 });
  const e = f.procurement.evidence(f.purchaser, "fixture-006");
  assert.equal(e.comparison.selectedQuoteId, "quote-circuitdepot-v1");
  const p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  assert.equal(p.quantity, 20);
  assert.equal(p.total, 255000);
  assert.equal(
    p.snapshot.evidence.comparison.options.find(
      (q) => q.id === p.snapshot.selectedQuoteId,
    )!.excess,
    8,
  );
  assert.equal(p.snapshot.evidence.requirements.acceptedQuantity, 20);
});
test("incomplete latest quote does not fall back; inconsistent promises, specification and supplier stock stay ineligible", (t) => {
  const f = fixture(t);
  for (const [patch, reason] of [
    [{ other_fees: null }, "INCOMPLETE_OR_UNSUPPORTED_QUOTE"],
    [{ other_fees: 0, receipt_at: FIXTURE_TIME }, "INVALID_PROMISE"],
    [
      { receipt_at: "2026-10-13T08:00:00.000Z", available: 11 },
      "INSUFFICIENT_SUPPLIER_STOCK",
    ],
    [{ available: 30, specs: { ports: 48 } }, "SPEC_MISMATCH"],
  ] as const) {
    const q = f.reviseQuote(patch),
      e = f.procurement.evidence(f.purchaser, "fixture-006");
    assert.equal(e.comparison.selectedQuoteId, null);
    assert.ok(
      e.comparison.options.find((o) => o.id === q.id)!.reasons.includes(reason),
    );
    assert.ok(!e.comparison.options.some((o) => o.id === "quote-northlink-v1"));
    assert.throws(
      () => f.procurement.prepare(f.purchaser, "fixture-006", f.input()),
      failure("NO_FEASIBLE_QUOTE"),
    );
  }
});
test("no-feasible agent outcome cites real comparison, persists no draft and changes no business records", async (t) => {
  const f = fixture(t);
  f.reviseQuote({ delivery_fee: null });
  const before = unchangedBusiness(f.store),
    context = f.context("purchaser", "az");
  const run = f.assistant.send(context, f.request({ locale: "az" }));
  await f.assistant.idle();
  const turn = f.assistant.turn(context, run.runId);
  assert.equal(turn.outcome?.status, "escalation");
  assert.equal(turn.proposal, null);
  assert.ok(turn.outcome!.message.includes("Uyğun təchizatçı"));
  const result = JSON.parse(
    f.store.one<{ result: string }>(
      "SELECT result FROM agent_execution WHERE run_id=?",
      run.runId,
    )!.result,
  );
  assert.equal(result.reason, "no_feasible_quote");
  assert.equal(result.handoff.state, "not_created");
  assert.equal(unchangedBusiness(f.store), before);
});
test("connected free agent prepares localized drafts within context bounds and resumes cached requests without inference", async (t) => {
  let calls = 0;
  const f = fixture(t, {
    mock: (caseId, request) => {
      const model = new ProcurementMock(caseId, request);
      return {
        async complete(input, options) {
          calls++;
          assert.ok(Buffer.byteLength(JSON.stringify(input)) <= 16000);
          return model.complete(input, options);
        },
      };
    },
  });
  const context = f.context("purchaser", "az"),
    input = f.request({ locale: "az" });
  const run = f.assistant.send(context, input);
  await f.assistant.idle();
  const turn = f.assistant.turn(context, run.runId);
  assert.equal(turn.outcome?.status, "completion", JSON.stringify(turn));
  assert.equal(turn.proposal!.total, 192000);
  assert.equal(calls, 5);
  assert.ok(
    turn.proposal!.snapshot.modelNote.text.startsWith("Yönləndirilmiş"),
  );
  assert.deepEqual(f.assistant.send(context, input), run);
  f.assistant.resume(context, run.runId);
  await f.assistant.idle();
  assert.equal(calls, 5);
  assert.throws(
    () => f.assistant.send(context, { ...input, locale: "en" }),
    failure("IDEMPOTENCY_CONFLICT"),
  );
  const usage = f.store.all<{
    input_tokens: number | null;
    cost_microusd: number;
  }>("SELECT * FROM model_usage WHERE run_id=?", run.runId);
  assert.equal(usage.length, 5);
  assert.ok(
    usage.every((u) => u.input_tokens === null && u.cost_microusd === 0),
  );
});
test("bound procurement tools deny customers, operator, wrong case, model identity and stale human version", (t) => {
  const f = fixture(t),
    dispatcher = new ToolDispatcher(f.business, f.auth);
  for (const account of ["customer-a", "operator"])
    assert.throws(
      () => dispatcher.bind(f.context(account)),
      failure("FORBIDDEN"),
    );
  const tools = dispatcher.bind({
    ...f.context(),
    proposalVersion: 0,
    revisionReason: null,
  });
  const call = (name: string, args: unknown) =>
    tools.dispatch({
      id: randomUUID(),
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    });
  for (const name of [
    "getProcurementRequirements",
    "getSupplierQuotes",
    "compareQuotes",
  ]) {
    const r = call(name, { caseId: "other-case" });
    assert.equal(r.status, "rejected");
    if (r.status === "rejected")
      assert.equal(r.error.code, "TOOL_CASE_MISMATCH");
  }
  const spoof = call("preparePurchaseProposal", {
    caseId: "fixture-006",
    ...f.input(),
    actor: "owner",
  });
  assert.equal(spoof.status, "rejected");
  if (spoof.status === "rejected")
    assert.equal(spoof.error.code, "INVALID_TOOL_ARGUMENTS");
  const version = call("preparePurchaseProposal", {
    caseId: "fixture-006",
    ...f.input(),
    expectedVersion: 1,
  });
  assert.equal(version.status, "rejected");
  if (version.status === "rejected")
    assert.equal(version.error.code, "PROPOSAL_VERSION_CONFLICT");
  f.store.run("DELETE FROM roles WHERE account_id='purchaser'");
  const revoked = call("getProcurementRequirements", { caseId: "fixture-006" });
  assert.equal(revoked.status, "rejected");
  if (revoked.status === "rejected")
    assert.equal(revoked.error.code, "FORBIDDEN");
});
test("proposal audit failure rolls back both new row and supersession", (t) => {
  const f = fixture(t),
    p = f.procurement.prepare(f.purchaser, "fixture-006", f.input()),
    input = f.input();
  f.store.db.exec(
    "CREATE TRIGGER fail_proposal_audit BEFORE INSERT ON audit_events WHEN NEW.action='proposal.prepared' BEGIN SELECT RAISE(ABORT,'audit failure'); END;",
  );
  assert.throws(
    () => f.procurement.prepare(f.purchaser, "fixture-006", input),
    /audit failure/,
  );
  assert.equal(f.procurement.list(f.purchaser, "fixture-006").length, 1);
  assert.equal(f.procurement.detail(f.purchaser, p.id).status, "draft");
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_events WHERE action='proposal.superseded'",
    )!.n,
    0,
  );
});
test("tool evidence insertion failure atomically rolls back the proposal and preserves checkpoint", async (t) => {
  const f = fixture(t);
  f.store.db.exec(
    "CREATE TRIGGER fail_proposal_tool BEFORE INSERT ON tool_calls WHEN NEW.name='preparePurchaseProposal' BEGIN SELECT RAISE(ABORT,'tool failure'); END;",
  );
  const context = f.context(),
    run = f.assistant.send(context, f.request());
  await f.assistant.idle();
  const turn = f.assistant.turn(context, run.runId);
  assert.equal(turn.outcome?.status, "stopped");
  assert.equal(turn.proposal, null);
  assert.equal(f.procurement.list(f.purchaser, "fixture-006").length, 0);
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_events WHERE action='proposal.prepared'",
    )!.n,
    0,
  );
});
test("HTTP queue/poll follows actual draft, privacy, role and cross-case boundaries", async (t) => {
  const f = fixture(t),
    app = createApp(f.store, f.clock);
  t.after(() => app.close());
  const headers = { authorization: `Bearer ${f.token()}` },
    path = "/api/procurement/fixture-006/agent";
  assert.equal((await app.inject(path)).statusCode, 401);
  for (const user of ["operator", "customer-a"])
    assert.equal(
      (
        await app.inject({
          url: path,
          headers: { authorization: `Bearer ${f.token(user)}` },
        })
      ).statusCode,
      403,
    );
  const response = await app.inject({
    method: "POST",
    url: path,
    headers,
    payload: f.request(),
  });
  assert.equal(response.statusCode, 202);
  const runId = response.json().data.runId;
  let result;
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    result = await app.inject({ url: `${path}/${runId}`, headers });
    if (result.json().data.status === "done") break;
  }
  assert.equal(result!.json().data.proposal.total, 192000);
  assert.ok(!result!.body.includes(headers.authorization));
  assert.ok(!result!.body.includes("password_hash"));
  assert.equal(
    (
      await app.inject({
        url: `${path}/${runId}`,
        headers: { authorization: `Bearer ${f.token("owner")}` },
      })
    ).statusCode,
    404,
  );
  const resume = await app.inject({
    method: "POST",
    url: `${path}/${runId}/resume`,
    headers,
    payload: {},
  });
  assert.equal(resume.statusCode, 202);
  assert.equal(
    (await app.inject({ url: path, headers })).json().data.proposals.length,
    1,
  );
  await app.close();
});
test("SQLite reopen preserves saved version, cached run and bilingual explanation without a second model call", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-procurement-")),
    path = join(directory, "demo.sqlite");
  const resources: { store?: Store } = {};
  t.after(() => {
    resources.store?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const store = new Store(path);
  store.migrate();
  seed(store);
  const auth = new Auth(store),
    business = new Business(store, { now: () => FIXTURE_TIME });
  const context: ToolContext = {
    agent: "procurement",
    caseId: "fixture-006",
    sessionToken: auth.login({
      email: "purchaser@relayops.example",
      password: DEMO_PASSWORD,
    }).token,
    locale: "en",
  };
  const assistant = new ProcurementAssistant(business, auth);
  const run = assistant.send(context, {
    mode: "mock",
    locale: "en",
    key: randomUUID(),
    expectedVersion: 0,
    revisionReason: null,
  });
  await assistant.idle();
  assert.equal(assistant.turn(context, run.runId).proposal!.version, 1);
  store.close();
  const reopened = new Store(path);
  resources.store = reopened;
  reopened.migrate();
  const nextAuth = new Auth(reopened),
    nextBusiness = new Business(reopened, { now: () => FIXTURE_TIME });
  const next = new ProcurementAssistant(nextBusiness, nextAuth, {
    mock: () => ({
      async complete() {
        throw new Error("Unexpected replay");
      },
    }),
  });
  next.resume(context, run.runId);
  await next.idle();
  const p = next.turn({ ...context, locale: "az" }, run.runId).proposal!;
  assert.equal(p.version, 1);
  assert.ok(p.snapshot.explanation.az.includes("Seçildi"));
  assert.equal(
    reopened.one<{ n: number }>("SELECT COUNT(*) n FROM model_usage")!.n,
    5,
  );
});

test("two independent SQLite writers cannot save the same case version twice", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-proposal-race-")),
    path = join(directory, "demo.sqlite");
  const store = new Store(path);
  store.migrate();
  seed(store);
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const auth = new Auth(store),
    procurement = new Procurement(
      new Business(store, { now: () => FIXTURE_TIME }),
    );
  const evidence = procurement.evidence(auth.actor("purchaser"), "fixture-006");
  const input = JSON.stringify({
    expectedVersion: 0,
    evidenceFingerprint: evidence.fingerprint,
    rationale: "Concurrent draft",
    revisionReason: null,
  });
  const child = (account: string) =>
    new Promise<{ id?: string; error?: string }>((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          "test/fixtures/procurement-process.ts",
          path,
          "save",
          account,
          input,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "",
        error = "";
      p.stdout.on("data", (data) => {
        output += String(data);
      });
      p.stderr.on("data", (data) => {
        error += String(data);
      });
      p.on("error", reject);
      p.on("exit", (code) => {
        if (code) reject(new Error(error));
        else resolve(JSON.parse(output));
      });
    });
  const results = await Promise.all([child("purchaser"), child("owner")]);
  assert.equal(results.filter((r) => r.id).length, 1);
  assert.equal(
    results.filter((r) => r.error === "PROPOSAL_VERSION_CONFLICT").length,
    1,
  );
  assert.equal(
    store.one<{ n: number }>("SELECT COUNT(*) n FROM proposals")!.n,
    1,
  );
});

test("real process exit after proposal commit resumes without repeating draft, audit or business effects", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-proposal-crash-")),
    path = join(directory, "demo.sqlite");
  const resources: { store?: Store } = {};
  t.after(() => {
    resources.store?.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "test/fixtures/procurement-process.ts", path, "crash"],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(child.status, 0, child.stderr);
  const store = new Store(path);
  resources.store = store;
  store.migrate();
  const auth = new Auth(store),
    business = new Business(store, { now: () => FIXTURE_TIME });
  const assistant = new ProcurementAssistant(business, auth);
  const context: ToolContext = {
    agent: "procurement",
    caseId: "fixture-006",
    sessionToken: auth.login({
      email: "purchaser@relayops.example",
      password: DEMO_PASSWORD,
    }).token,
  };
  const row = store.one<{ run_id: string }>(
    "SELECT run_id FROM procurement_requests",
  )!;
  const before = unchangedBusiness(store);
  assert.equal(
    store.one<{ n: number }>("SELECT COUNT(*) n FROM proposals")!.n,
    1,
  );
  assert.equal(
    store.one<{ n: number }>("SELECT COUNT(*) n FROM model_usage")!.n,
    4,
  );
  store.run(
    "UPDATE agent_execution SET lease_until=0 WHERE run_id=?",
    row.run_id,
  );
  assert.equal(assistant.turn(context, row.run_id).needsResume, true);
  assistant.resume(context, row.run_id);
  await assistant.idle();
  const result = assistant.turn(context, row.run_id);
  assert.equal(result.outcome?.status, "completion");
  assert.equal(result.proposal!.version, 1);
  assert.equal(
    store.one<{ n: number }>("SELECT COUNT(*) n FROM proposals")!.n,
    1,
  );
  assert.equal(
    store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM audit_events WHERE action='proposal.prepared'",
    )!.n,
    1,
  );
  assert.equal(
    store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM tool_calls WHERE name='preparePurchaseProposal'",
    )!.n,
    1,
  );
  assert.equal(
    store.one<{ n: number }>("SELECT COUNT(*) n FROM model_usage")!.n,
    5,
  );
  assert.equal(unchangedBusiness(store), before);
});

test("effective expiry and active purchasing decisions prevent reuse or revision", (t) => {
  const f = fixture(t),
    p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  f.clock.instant = p.expiresAt;
  assert.equal(
    f.procurement.detail(f.purchaser, p.id).effectiveStatus,
    "expired",
  );
  f.clock.instant = FIXTURE_TIME;
  f.store.run(
    "UPDATE proposals SET status='pending_approval' WHERE id=?",
    p.id,
  );
  assert.throws(
    () => f.procurement.prepare(f.purchaser, "fixture-006", f.input()),
    failure("PROPOSAL_AWAITING_DECISION"),
  );
  f.store.run("UPDATE proposals SET status='approved' WHERE id=?", p.id);
  assert.throws(
    () => f.procurement.prepare(f.purchaser, "fixture-006", f.input()),
    failure("PROPOSAL_AWAITING_DECISION"),
  );
  f.business.cancelOrder(
    f.auth.actor("customer-b"),
    p.snapshot.evidence.requirements.orderId,
    { reason: "Demand cancelled", key: randomUUID() },
  );
  assert.equal(
    f.procurement.detail(f.purchaser, p.id).effectiveStatus,
    "invalidated",
  );
  assert.throws(
    () => f.procurement.prepare(f.purchaser, "fixture-006", f.input()),
    failure("CASE_CLOSED"),
  );
});

test("malformed or inconsistent accepted requirements are explicit blockers rather than fabricated data", (t) => {
  const f = fixture(t),
    req = f.procurement.requirements(f.purchaser, "fixture-006");
  const summary = JSON.parse(
    f.store.one<{ summary: string }>(
      "SELECT summary FROM order_offers WHERE id=?",
      req.consentOfferId,
    )!.summary,
  );
  f.store.run(
    "UPDATE order_offers SET summary=? WHERE id=?",
    JSON.stringify({ ...summary, productSpecs: "broken-json" }),
    req.consentOfferId,
  );
  let e = f.procurement.evidence(f.purchaser, "fixture-006");
  assert.equal(e.requirements.specs, null);
  assert.ok(
    e.requirements.blockers.includes("ACCEPTED_REQUIREMENTS_INCOMPLETE"),
  );
  assert.equal(e.comparison.selectedQuoteId, null);
  f.store.run(
    "UPDATE order_offers SET summary=? WHERE id=?",
    JSON.stringify(summary),
    req.consentOfferId,
  );
  f.store.run("UPDATE orders SET allow_substitution=1 WHERE id=?", req.orderId);
  e = f.procurement.evidence(f.purchaser, "fixture-006");
  assert.ok(
    e.requirements.blockers.includes("ACCEPTED_REQUIREMENTS_INCOMPLETE"),
  );
});

test("actual OpenRouter adapter completes procurement using unpaid provider HTTP fixtures and the same spend guard", async (t) => {
  const settings = modelConfig({
    OPENROUTER_API_KEY: "synthetic-procurement-key",
  });
  const budget = new ModelBudget(":memory:", 1000000);
  t.after(() => budget.close());
  const demo = new ProcurementMock("fixture-006", {
    mode: "live",
    locale: "en",
    key: randomUUID(),
    expectedVersion: 0,
    revisionReason: null,
  });
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
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
    const body = JSON.parse(String(init!.body)) as CompletionInput & {
      tool_choice: CompletionInput["toolChoice"];
    };
    const normalized = {
      messages: body.messages,
      tools: body.tools,
      toolChoice: body.tool_choice,
    };
    assert.ok(Buffer.byteLength(JSON.stringify(normalized)) <= 16000);
    assert.ok(!String(init!.body).includes(context.sessionToken));
    const result = await demo.complete(normalized);
    return Response.json({
      id: `synthetic-procurement-${++calls}`,
      model: settings.model,
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.00002 },
      choices: [
        {
          finish_reason: result.finishReason,
          message: {
            role: "assistant",
            content: result.content,
            ...(result.toolCalls.length
              ? { tool_calls: result.toolCalls }
              : {}),
          },
        },
      ],
    });
  };
  const f = fixture(t, {
    live: {
      id: settings.model,
      create: () => new OpenRouter(settings, budget, transport),
    },
  });
  const context = f.context(),
    run = f.assistant.send(context, f.request({ mode: "live" }));
  await f.assistant.idle();
  const turn = f.assistant.turn(context, run.runId);
  assert.equal(turn.outcome?.status, "completion", JSON.stringify(turn));
  assert.equal(turn.mode, "live");
  assert.equal(turn.proposal!.total, 192000);
  assert.equal(calls, 5);
  assert.equal(budget.summary().knownCostMicroUsd, 100);
  assert.equal(budget.summary().heldMicroUsd, 0);
  f.assistant.resume(context, run.runId);
  await f.assistant.idle();
  assert.equal(calls, 5);
});

test("customer and procurement live admission share concurrency and never replace failures with mock", async (t) => {
  let resolveFirst: () => void = () => {},
    calls = 0,
    mockCalls = 0;
  const gate = new Promise<void>((resolve) => {
    resolveFirst = resolve;
  });
  const settings = {
    id: "synthetic/live",
    create: () => ({
      async complete() {
        calls++;
        await gate;
        throw new Error("MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN");
      },
    }),
  };
  const f = fixture(t, {
    live: settings,
    mock: () => {
      mockCalls++;
      throw new Error("Silent fallback");
    },
  });
  const customer = new CustomerAssistant(f.business, f.auth, {
    live: settings,
  });
  const context = f.context(),
    run = f.assistant.send(context, f.request({ mode: "live" }));
  assert.equal(calls, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.throws(
    () =>
      customer.send(
        { agent: "customer", sessionToken: f.token("customer-a") },
        {
          mode: "live",
          locale: "en",
          key: randomUUID(),
          userText: "Check catalog",
        },
      ),
    failure("ASSISTANT_LIVE_BUSY"),
  );
  resolveFirst();
  await f.assistant.idle();
  const turn = f.assistant.turn(context, run.runId);
  assert.equal(
    turn.outcome?.errorCode,
    "MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN",
  );
  assert.equal(turn.proposal, null);
  assert.equal(mockCalls, 0);
  f.assistant.resume(context, run.runId);
  await f.assistant.idle();
  assert.equal(calls, 1);
});

test("draft evidence survives explanatory model failure and terminal/request crash reconciliation", async (t) => {
  const f = fixture(t, {
    mock: (caseId, request) => {
      const demo = new ProcurementMock(caseId, request);
      let calls = 0;
      return {
        async complete(input, options) {
          if (++calls === 5)
            throw new Error("MODEL_TRANSPORT_FAILED_CHARGE_UNKNOWN");
          return demo.complete(input, options);
        },
      };
    },
  });
  const context = f.context(),
    run = f.assistant.send(context, f.request());
  await f.assistant.idle();
  const result = f.assistant.turn(context, run.runId);
  assert.equal(result.outcome?.status, "stopped");
  assert.equal(result.proposal!.version, 1);
  f.store.run(
    "UPDATE procurement_requests SET status='running' WHERE run_id=?",
    run.runId,
  );
  f.assistant.resume(context, run.runId);
  await f.assistant.idle();
  assert.equal(
    f.store.one<{ status: string }>(
      "SELECT status FROM procurement_requests WHERE run_id=?",
      run.runId,
    )!.status,
    "done",
  );
  assert.equal(f.procurement.list(f.purchaser, "fixture-006").length, 1);
});

test("feasible ties use delivery then stable supplier identity, without invented quality scores", (t) => {
  const f = fixture(t);
  // Same total, earlier receipt: ByteHarbor becomes selected by the explicit date tie.
  const early = f.reviseQuote(
    {
      unit_price: 15500,
      delivery_fee: 6000,
      receipt_at: "2026-10-13T07:00:00.000Z",
    },
    "byteharbor",
  );
  assert.equal(
    f.procurement.evidence(f.purchaser, "fixture-006").comparison
      .selectedQuoteId,
    early.id,
  );
  // Same total and same receipt: byteharbor sorts before northlink.
  const tie = f.reviseQuote(
    { receipt_at: "2026-10-13T08:00:00.000Z" },
    "byteharbor",
  );
  const e = f.procurement.evidence(f.purchaser, "fixture-006");
  assert.equal(e.comparison.selectedQuoteId, tie.id);
  const p = f.procurement.prepare(f.purchaser, "fixture-006", f.input());
  assert.equal(p.snapshot.selectedQuoteId, tie.id);
  assert.ok(
    p.snapshot.explanation.en.includes("stable") ||
      p.snapshot.explanation.en.includes("supplier ID"),
  );
});
