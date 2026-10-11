import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Store } from "../src/db/database.js";
import { seed, DEMO_PASSWORD } from "../src/db/seed.js";
import { Auth } from "../src/domain/auth.js";
import { Business } from "../src/domain/business.js";
import { Procurement } from "../src/domain/procurement.js";
import { Purchasing } from "../src/domain/purchasing.js";
import { Approvals, type ApprovalOptions } from "../src/domain/approvals.js";
import {
  TelegramApprovalApi,
  TelegramApprovalWorker,
} from "../src/telegram/approvals.js";
import { telegramTokenConfig } from "../src/telegram/setup.js";
import { FIXTURE_TIME } from "../src/shared/time.js";
import { BusinessError } from "../src/shared/contracts.js";
import { createApp } from "../src/server/app.js";

const mapping = {
  botId: 123456,
  userId: 222333,
  chatId: 222333,
  accountId: "owner",
  locale: "en" as const,
};
const settings = telegramTokenConfig({
  TELEGRAM_BOT_TOKEN: "123456:synthetic_private_token_value",
});
function fixture(t: TestContext, path = ":memory:") {
  const store = new Store(path);
  store.migrate();
  seed(store);
  const auth = new Auth(store),
    clock = {
      instant: FIXTURE_TIME,
      now() {
        return this.instant;
      },
    };
  let wall = 1_800_000_000_000;
  const business = new Business(store, clock),
    procurement = new Procurement(business);
  const owner = auth.actor("owner"),
    purchaser = auth.actor("purchaser");
  const options: ApprovalOptions = {
    mapping: { ...mapping },
    liveEnabled: true,
  };
  const approvals = new Approvals(business, auth, options, () => wall);
  const evidence = procurement.evidence(purchaser, "fixture-006");
  const proposal = procurement.prepare(purchaser, "fixture-006", {
    expectedVersion: evidence.latestVersion,
    evidenceFingerprint: evidence.fingerprint,
    rationale: "Actual fixture comparison",
    revisionReason: null,
  });
  const cleanups: (() => void)[] = [];
  let closed = false;
  const close = () => {
    if (!closed) {
      store.close();
      closed = true;
    }
  };
  t.after(() => {
    for (const cleanup of cleanups) cleanup();
    close();
  });
  const submit = (mode: "mock" | "live" = "mock", key = randomUUID()) =>
    approvals.submit(purchaser, proposal.caseId, proposal.id, {
      mode,
      expectedVersion: proposal.version,
      key,
    });
  const decide = (
    id: string,
    decision: "approved" | "rejected" = "approved",
    key = randomUUID(),
  ) =>
    approvals.decide(owner, proposal.caseId, id, {
      decision,
      reason: "Human fixture decision",
      key,
    });
  return {
    close,
    store,
    auth,
    business,
    clock,
    options,
    approvals,
    proposal,
    procurement,
    owner,
    purchaser,
    submit,
    decide,
    advanceWall: (n: number) => {
      wall += n;
    },
    cleanup: (fn: () => void) => cleanups.push(fn),
  };
}
const code = (name: string) => (error: unknown) =>
  error instanceof BusinessError && error.code === name;
function callback(requestId: string, patch: Record<string, unknown> = {}) {
  return {
    update_id: 7,
    callback_query: {
      id: "cb7",
      from: { id: mapping.userId, is_bot: false },
      message: {
        message_id: 88,
        from: { id: mapping.botId, is_bot: true },
        chat: { id: mapping.chatId, type: "private" },
      },
      data: `r:${requestId}:a`,
    },
    ...patch,
  };
}
function network(answers: unknown[] = []) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let failSend = false;
  const api = new TelegramApprovalApi(settings, async (url, init) => {
    const method = String(url).split("/").at(-1)!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ method, body });
    if (method === "sendMessage" && failSend)
      throw new Error("Private transport failure");
    const result =
      method === "sendMessage"
        ? { message_id: 88, chat: { id: mapping.chatId } }
        : method === "getUpdates"
          ? answers.splice(0)
          : true;
    return Response.json({ ok: true, result });
  });
  return {
    api,
    calls,
    failSend: () => {
      failSend = true;
    },
  };
}
test("approval submission binds immutable version, owner and EN summary without stock/budget effects", (t) => {
  const f = fixture(t),
    request = f.submit();
  const row = f.approvals.row(request.id);
  assert.equal(row.locale, "en");
  assert.match(row.summary, /1920\.00 AZN/);
  assert.match(row.summary, /Quantity: 12/);
  assert.match(row.summary, /Customer deadline:/);
  assert.match(row.summary, /Approval is not receipt/);
  assert.equal(row.version, 1);
  assert.equal(row.status, "pending");
  assert.equal(row.mode, "mock");
  assert.equal(row.message_id, null);
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM budget_allocations")!.n,
    0,
  );
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM purchase_orders")!.n,
    0,
  );
  assert.equal(f.business.product("NET-SW-24G").stock, 8);
  assert.throws(
    () =>
      f.store.run(
        "UPDATE approval_requests SET proposal_id='other' WHERE id=?",
        request.id,
      ),
    /immutable/,
  );
  assert.throws(
    () =>
      f.store.run(
        "UPDATE approval_delivery SET locale='az' WHERE request_id=?",
        request.id,
      ),
    /immutable/,
  );
  assert.throws(() => f.submit(), code("APPROVAL_ALREADY_SUBMITTED"));
});
test("submission retries return one request while changed content and stale versions conflict", (t) => {
  const f = fixture(t),
    key = randomUUID(),
    first = f.submit("mock", key);
  assert.deepEqual(f.submit("mock", key), first);
  assert.throws(() => f.submit("live", key), code("IDEMPOTENCY_CONFLICT"));
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM approval_requests")!.n,
    1,
  );
  assert.throws(
    () =>
      f.approvals.submit(f.purchaser, f.proposal.caseId, f.proposal.id, {
        mode: "mock",
        expectedVersion: 2,
        key: randomUUID(),
      }),
    code("PROPOSAL_VERSION_CONFLICT"),
  );
});
test("approval reserves budget exactly once, stays valid against its own allocation and queues one continuation", (t) => {
  const f = fixture(t),
    request = f.submit(),
    key = randomUUID();
  assert.equal(
    f.decide(request.id, "approved", key).effectiveStatus,
    "approved",
  );
  assert.equal(f.decide(request.id, "rejected").status, "approved");
  assert.equal(f.decide(request.id, "approved", key).status, "approved");
  assert.equal(
    f.store.one<{ amount: number }>("SELECT amount FROM budget_allocations")!
      .amount,
    192000,
  );
  assert.equal(
    f.procurement.detail(f.owner, f.proposal.id).effectiveStatus,
    "approved",
  );
  f.approvals.sweep();
  assert.equal(f.approvals.row(request.id).status, "approved");
  assert.equal(
    f.store.one<{ n: number }>(
      "SELECT COUNT(*) n FROM jobs WHERE kind='purchase.after_approval'",
    )!.n,
    1,
  );
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM approval_decisions")!.n,
    1,
  );
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM purchase_orders")!.n,
    0,
  );
  assert.throws(
    () => f.store.run("UPDATE approval_decisions SET decision='rejected'"),
    /immutable/,
  );
  assert.throws(
    () => f.store.run("DELETE FROM approval_decisions"),
    /append-only/,
  );
});
test("rejection retains its decision and revisions require a new immutable request", (t) => {
  const f = fixture(t),
    first = f.submit();
  f.decide(first.id, "rejected");
  const e = f.procurement.evidence(f.purchaser, f.proposal.caseId);
  const next = f.procurement.prepare(f.purchaser, f.proposal.caseId, {
    expectedVersion: 1,
    evidenceFingerprint: e.fingerprint,
    rationale: "Revised explanation",
    revisionReason: "Owner rejected",
  });
  const second = f.approvals.submit(f.purchaser, next.caseId, next.id, {
    mode: "mock",
    expectedVersion: 2,
    key: randomUUID(),
  });
  assert.notEqual(second.id, first.id);
  assert.equal(second.status, "pending");
  assert.equal(f.approvals.row(first.id).status, "rejected");
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM budget_allocations")!.n,
    0,
  );
  assert.equal(
    f.store.one<{ kind: string }>("SELECT kind FROM jobs")!.kind,
    "procurement.after_rejection",
  );
});
test("business and wall expiry stop decisions and release only this reserved budget", (t) => {
  const f = fixture(t),
    request = f.submit();
  f.decide(request.id);
  f.advanceWall(24 * 3600000);
  f.approvals.sweep();
  assert.equal(f.approvals.row(request.id).status, "expired");
  assert.equal(
    f.store.one<{ status: string }>("SELECT status FROM budget_allocations")!
      .status,
    "released",
  );
  assert.equal(
    f.store.one<{ decision: string }>(
      "SELECT decision FROM approval_decisions",
    )!.decision,
    "approved",
  );
  const g = fixture(t),
    pending = g.submit();
  g.clock.instant = "2026-10-13T08:00:00.000Z";
  assert.equal(g.decide(pending.id).status, "expired");
  assert.equal(
    g.store.one<{ n: number }>("SELECT COUNT(*) n FROM approval_decisions")!.n,
    0,
  );
});
test("changed stock and supplier evidence invalidates pending and approved requests", (t) => {
  for (const approved of [false, true]) {
    const f = fixture(t),
      request = f.submit();
    if (approved) f.decide(request.id);
    f.store.run("UPDATE products SET stock=stock+1 WHERE id='NET-SW-24G'");
    f.approvals.sweep();
    assert.equal(f.approvals.row(request.id).status, "invalidated");
    assert.equal(
      f.procurement.detail(f.owner, f.proposal.id).status,
      "invalidated",
    );
    if (approved)
      assert.equal(
        f.store.one<{ status: string }>(
          "SELECT status FROM budget_allocations",
        )!.status,
        "released",
      );
  }
  const f = fixture(t),
    request = f.submit();
  const purchasing = new Purchasing(f.business);
  const q = purchasing
    .quotes(f.purchaser)
    .find((q) => q.supplier_id === "northlink")!;
  purchasing.saveSupplier(
    f.purchaser,
    {
      name: "Revised supplier",
      expectedVersion: 1,
      capabilities: { categories: ["networking"], zone: "baku" },
      key: randomUUID(),
    },
    q.supplier_id,
  );
  assert.equal(f.decide(request.id).status, "invalidated");
});
test("owner revocation and recipient changes cannot confer an approval", (t) => {
  const f = fixture(t),
    request = f.submit();
  f.store.run("DELETE FROM roles WHERE account_id='owner'");
  assert.throws(() => f.decide(request.id), code("FORBIDDEN"));
  f.approvals.sweep();
  assert.equal(f.approvals.row(request.id).status, "invalidated");
  const g = fixture(t),
    other = g.submit();
  g.options.mapping.userId++;
  g.approvals.sweep();
  assert.equal(g.approvals.row(other.id).status, "invalidated");
  assert.equal(
    g.store.one<{ n: number }>("SELECT COUNT(*) n FROM approval_decisions")!.n,
    0,
  );
});
test("audit failure rolls back request and decision/budget/continuation atomically", (t) => {
  const f = fixture(t);
  f.store.db.exec(
    "CREATE TRIGGER approval_audit_fail BEFORE INSERT ON audit_events WHEN NEW.action LIKE 'approval.%' BEGIN SELECT RAISE(ABORT,'audit failed'); END",
  );
  assert.throws(() => f.submit(), /audit failed/);
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM approval_requests")!.n,
    0,
  );
  assert.equal(f.procurement.detail(f.owner, f.proposal.id).status, "draft");
  f.store.db.exec("DROP TRIGGER approval_audit_fail");
  const request = f.submit();
  f.store.db.exec(
    "CREATE TRIGGER decision_audit_fail BEFORE INSERT ON audit_events WHEN NEW.action='approval.decided' BEGIN SELECT RAISE(ABORT,'audit failed'); END",
  );
  assert.throws(() => f.decide(request.id), /audit failed/);
  assert.equal(f.approvals.row(request.id).status, "pending");
  for (const table of ["approval_decisions", "budget_allocations", "jobs"])
    assert.equal(
      f.store.one<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`)!.n,
      0,
    );
});
test("real API uses sessions, scopes case/role, hides Telegram identity and strictly validates arguments", async (t) => {
  const f = fixture(t),
    app = createApp(f.store, f.clock, {}, {}, f.options);
  t.after(() => app.close());
  const login = (account: string) => ({
    authorization: `Bearer ${f.auth.login({ email: `${account}@relayops.example`, password: DEMO_PASSWORD }).token}`,
  });
  const purchaser = login("purchaser"),
    customer = login("customer-a"),
    owner = login("owner");
  const path = `/api/procurement/${f.proposal.caseId}/proposals/${f.proposal.id}/approval`;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: path,
        headers: customer,
        payload: { mode: "mock", expectedVersion: 1, key: randomUUID() },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: path,
        headers: purchaser,
        payload: {
          mode: "mock",
          expectedVersion: 1,
          key: randomUUID(),
          actorId: "owner",
        },
      })
    ).statusCode,
    400,
  );
  const submitted = await app.inject({
    method: "POST",
    url: path,
    headers: purchaser,
    payload: { mode: "mock", expectedVersion: 1, key: randomUUID() },
  });
  assert.equal(submitted.statusCode, 200);
  const id = submitted.json().data.id;
  const state = await app.inject({
    url: `/api/procurement/${f.proposal.caseId}/approvals`,
    headers: purchaser,
  });
  assert.equal(state.statusCode, 200);
  assert.ok(!state.body.includes(String(mapping.userId)));
  const decisionPath = `/api/procurement/${f.proposal.caseId}/approvals/${id}/decision`;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: decisionPath,
        headers: purchaser,
        payload: { decision: "approved", reason: "approve", key: randomUUID() },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: decisionPath,
        headers: owner,
        payload: { decision: "approved", reason: "approve", key: randomUUID() },
      })
    ).statusCode,
    200,
  );
});
test("synthetic Telegram HTTP send/callback/edit validates private message identity and persists offsets", async (t) => {
  const f = fixture(t),
    request = f.submit("live"),
    n = network([callback(request.id)]);
  const worker = new TelegramApprovalWorker(f.approvals, n.api);
  f.cleanup(() => worker.release());
  await worker.tick();
  assert.equal(f.approvals.row(request.id).status, "approved");
  assert.equal(f.approvals.row(request.id).edit_pending, 0);
  assert.deepEqual(
    n.calls.map((c) => c.method),
    ["sendMessage", "getUpdates", "answerCallbackQuery", "editMessageText"],
  );
  const send = n.calls[0]!.body;
  assert.ok(!("parse_mode" in send));
  assert.match(JSON.stringify(send.reply_markup), /Approve/);
  assert.ok(Buffer.byteLength(`r:${request.id}:a`) < 64);
  assert.equal(
    f.store.one<{ next_offset: number }>(
      "SELECT next_offset FROM telegram_receiver",
    )!.next_offset,
    8,
  );
  await worker.tick();
  assert.equal(n.calls.filter((c) => c.method === "sendMessage").length, 1);
});
test("wrong account/chat/message/bot callbacks and malformed callback updates cannot approve", (t) => {
  const f = fixture(t),
    request = f.submit("live");
  f.store.run(
    "UPDATE approval_delivery SET status='sent',message_id=88 WHERE request_id=?",
    request.id,
  );
  const originals = callback(request.id);
  let id = 100;
  for (const patch of [
    { from: { id: 999, is_bot: false } },
    {
      message: {
        ...originals.callback_query.message,
        chat: { id: 999, type: "private" },
      },
    },
    { message: { ...originals.callback_query.message, message_id: 999 } },
    {
      message: {
        ...originals.callback_query.message,
        from: { id: 999, is_bot: true },
      },
    },
  ])
    assert.equal(
      f.approvals.callback(
        {
          update_id: id++,
          callback_query: { ...originals.callback_query, ...patch },
        },
        mapping.botId,
      ).status,
      "denied",
    );
  assert.equal(
    f.approvals.callback(
      { update_id: id++, callback_query: { id: "no message" } },
      mapping.botId,
    ).status,
    "ignored",
  );
  assert.equal(
    f.approvals.callback(callback(request.id), 999).status,
    "denied",
  );
  assert.equal(f.approvals.row(request.id).status, "pending");
});
test("same update and cross-channel conflicting decisions produce one decision and one budget allocation", (t) => {
  const f = fixture(t),
    request = f.submit("live");
  f.store.run(
    "UPDATE approval_delivery SET status='sent',message_id=88 WHERE request_id=?",
    request.id,
  );
  assert.equal(
    f.approvals.callback(callback(request.id), mapping.botId).status,
    "approved",
  );
  assert.equal(
    f.approvals.callback(callback(request.id), mapping.botId).status,
    "approved",
  );
  assert.equal(f.decide(request.id, "rejected").status, "approved");
  assert.equal(
    f.store.one<{ n: number }>("SELECT COUNT(*) n FROM budget_allocations")!.n,
    1,
  );
  assert.equal(f.store.one<{ n: number }>("SELECT COUNT(*) n FROM jobs")!.n, 1);
});
test("unknown send is not retried; an authenticated bot-message callback can recover it", async (t) => {
  const f = fixture(t),
    request = f.submit("live"),
    n = network();
  n.failSend();
  const worker = new TelegramApprovalWorker(f.approvals, n.api);
  f.cleanup(() => worker.release());
  await worker.tick();
  await worker.tick();
  assert.equal(f.approvals.row(request.id).delivery_status, "unknown");
  assert.equal(n.calls.filter((c) => c.method === "sendMessage").length, 1);
  const result = f.approvals.callback(callback(request.id), mapping.botId);
  assert.equal(result.status, "approved");
  assert.equal(f.approvals.row(request.id).message_id, 88);
  assert.equal(f.approvals.row(request.id).delivery_status, "sent");
});
test("receiver leases prevent overlapping senders and recover abandoned sending without replay", async (t) => {
  const f = fixture(t),
    request = f.submit("live"),
    n = network();
  const worker = new TelegramApprovalWorker(f.approvals, n.api);
  await worker.tick();
  const other = new TelegramApprovalWorker(f.approvals, n.api);
  await assert.rejects(other.tick(), code("TELEGRAM_RECEIVER_LEASED"));
  f.store.run(
    "UPDATE approval_delivery SET status='sending',message_id=NULL WHERE request_id=?",
    request.id,
  );
  f.advanceWall(121000);
  await other.tick();
  assert.equal(f.approvals.row(request.id).delivery_status, "unknown");
  assert.equal(n.calls.filter((c) => c.method === "sendMessage").length, 1);
  other.release();
  worker.release();
});
test("AZ summary and controls stay separate from immutable original-language agent notes", async (t) => {
  const f = fixture(t);
  f.options.mapping.locale = "az";
  const request = f.submit("live"),
    row = f.approvals.row(request.id),
    n = network();
  assert.match(row.summary, /SATINALMA TƏSDİQİ/);
  assert.match(row.summary, /Seçildi/);
  assert.ok(!row.summary.includes("Actual fixture comparison"));
  await n.api.send(row);
  assert.match(JSON.stringify(n.calls[0]!.body.reply_markup), /Təsdiq et/);
  const request2 = fixture(t);
  request2.options.liveEnabled = false;
  assert.throws(() => request2.submit("live"), code("TELEGRAM_LIVE_DISABLED"));
});
test("a web decision during an in-flight Telegram send removes controls after delivery", async (t) => {
  const f = fixture(t),
    request = f.submit("live");
  let edited = false;
  const api = new TelegramApprovalApi(settings, async (url) => {
    const method = String(url).split("/").at(-1)!;
    if (method === "sendMessage") f.decide(request.id);
    if (method === "editMessageText") edited = true;
    return Response.json({
      ok: true,
      result:
        method === "sendMessage"
          ? { message_id: 88, chat: { id: mapping.chatId } }
          : method === "getUpdates"
            ? []
            : true,
    });
  });
  const worker = new TelegramApprovalWorker(f.approvals, api);
  f.cleanup(() => worker.release());
  await worker.tick();
  assert.equal(f.approvals.row(request.id).status, "approved");
  assert.equal(edited, true);
  assert.equal(f.approvals.row(request.id).edit_pending, 0);
  assert.equal(f.store.all("SELECT * FROM approval_decisions").length, 1);
});

test("failed message edits stop after three attempts without repeating the decision", async (t) => {
  const f = fixture(t),
    request = f.submit("live");
  let attempts = 0;
  const api = new TelegramApprovalApi(settings, async (url) => {
    const method = String(url).split("/").at(-1)!;
    if (method === "editMessageText") {
      attempts++;
      throw new Error("synthetic failure");
    }
    return Response.json({
      ok: true,
      result: method === "getUpdates" ? [] : true,
    });
  });
  f.store.run(
    "UPDATE approval_delivery SET status='sent',message_id=88 WHERE request_id=?",
    request.id,
  );
  f.decide(request.id);
  const worker = new TelegramApprovalWorker(f.approvals, api);
  f.cleanup(() => worker.release());
  for (let i = 0; i < 5; i++) await worker.tick();
  assert.equal(attempts, 3);
  assert.equal(f.approvals.row(request.id).edit_attempts, 3);
  assert.equal(f.store.all("SELECT * FROM approval_decisions").length, 1);
  assert.equal(f.store.all("SELECT * FROM jobs").length, 1);
});

test("pending approval survives SQLite close/reopen and resumes without a second request", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-pending-approval-"));
  const path = join(directory, "demo.sqlite"),
    f = fixture(t, path),
    request = f.submit();
  f.close();
  const reopened = new Store(path);
  t.after(() => reopened.close());
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const auth = new Auth(reopened);
  const approvals = new Approvals(
    new Business(reopened, f.clock),
    auth,
    f.options,
    () => 1_800_000_000_000,
  );
  assert.equal(approvals.row(request.id).status, "pending");
  assert.equal(reopened.all("SELECT * FROM approval_requests").length, 1);
  approvals.decide(auth.actor("owner"), f.proposal.caseId, request.id, {
    decision: "approved",
    reason: "Recovered human decision",
    key: randomUUID(),
  });
  assert.equal(approvals.row(request.id).status, "approved");
  assert.equal(reopened.all("SELECT * FROM budget_allocations").length, 1);
});

test("a real process exit after decision commit reopens with one decision/budget/job and cached callback", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "relayops-approval-"));
  const path = join(directory, "demo.sqlite"),
    f = fixture(t, path),
    request = f.submit("live");
  f.store.run(
    "UPDATE approval_delivery SET status='sent',message_id=88 WHERE request_id=?",
    request.id,
  );
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "test/fixtures/approval-crash.ts", path, request.id],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(child.status, 29, child.stderr);
  const reopened = new Store(path);
  t.after(() => reopened.close());
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const approvals = new Approvals(
    new Business(reopened, f.clock),
    new Auth(reopened),
    f.options,
    () => 1_800_000_000_000,
  );
  assert.equal(
    approvals.callback(callback(request.id), mapping.botId).status,
    "approved",
  );
  for (const table of ["approval_decisions", "budget_allocations", "jobs"])
    assert.equal(
      reopened.one<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`)!.n,
      1,
    );
});
