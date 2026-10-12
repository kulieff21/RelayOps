import test from "node:test";
import assert from "node:assert/strict";
import { CASES, caseFixture, PROTOCOL_HASH } from "../src/evaluation/cases.js";
import {
  fixedTrial,
  agentTrial,
  TrialSession,
  evaluate,
  snapshot,
} from "../src/evaluation/trial.js";
import { ProcurementMock } from "../src/model/procurement-mock.js";
import { ModelBudget } from "../src/model/budget.js";
import { manualApp } from "../src/evaluation/manual.js";
import { summarize } from "../src/evaluation/report.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const spec of CASES) {
  test(`evaluation ${spec.id}: competent fixed workflow and unpaid agent pilot reach the frozen final state`, async () => {
    const fixed = fixedTrial(spec);
    const mock = await agentTrial(
      spec,
      1,
      new ProcurementMock("fixture-006", {
        mode: "mock",
        locale: spec.locale,
        key: "evaluation-pilot",
        expectedVersion: 0,
        revisionReason: null,
      }),
      false,
    );
    assert.equal(fixed.taskSuccess, true, JSON.stringify(fixed.checks));
    assert.equal(mock.taskSuccess, true, JSON.stringify(mock.checks));
    assert.deepEqual(mock.violations, []);
    assert.equal(fixed.inputHash, mock.inputHash);
    assert.deepEqual(mock.final, fixed.final);
    assert.ok(mock.modelCalls >= 4);
  });
}
test("final-state evaluator rejects fabricated success and does not count a no-effect timeout as escalation", () => {
  const f = caseFixture(CASES[0]);
  try {
    const state = snapshot(f);
    const judged = evaluate(
      CASES[0],
      state,
      state,
      state.roleState,
      "completion",
    );
    assert.equal(judged.taskSuccess, false);
    assert.deepEqual(judged.violations, []);
  } finally {
    f.store.close();
  }
  const s = new TrialSession(CASES[3], "agent-live", 1);
  try {
    const result = s.finish("stopped", undefined, 0, "AGENT_TIME_LIMIT");
    assert.equal(result.businessStatePass, true);
    assert.equal(result.taskSuccess, false);
  } finally {
    s.close();
  }
});
test("oracle flags premature stock, unauthorized approval, changed roles, wrong price and duplicate effects", () => {
  const good = fixedTrial(CASES[0]);
  const final = structuredClone(good.final),
    before = structuredClone(good.beforeContinuation);
  before.requests = 1;
  before.stock = 20;
  final.proposals[0]!.total = 1;
  final.roleState = [];
  final.dispatches = 2;
  const result = evaluate(
    CASES[0],
    before,
    final,
    good.beforeContinuation.roleState,
    "completion",
  );
  for (const kind of [
    "noAgentApproval",
    "noPrematureStock",
    "roleAuthorityPreserved",
    "incorrectProposal",
    "duplicateEffect",
  ])
    assert.ok(result.violations.includes(kind));
  assert.equal(result.taskSuccess, false);
});
test("evaluation spending allocation survives reopening, shares global funds and refuses renewal", () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "relayops-evaluation-budget-")),
    "ledger.sqlite",
  );
  let ledger = new ModelBudget(path, 1000000);
  const pool = ledger.pool("test-evaluation", 500000, PROTOCOL_HASH);
  const first = pool.reserve("fixture", 300000);
  pool.settle(first, 200000);
  const unknown = pool.reserve("fixture", 100000);
  assert.equal(pool.summary().remainingMicroUsd, 200000);
  ledger.close();
  ledger = new ModelBudget(path, 1000000);
  try {
    const restored = ledger.pool("test-evaluation", 500000, PROTOCOL_HASH);
    assert.equal(restored.summary().remainingMicroUsd, 200000);
    assert.equal(ledger.summary().remainingMicroUsd, 700000);
    assert.throws(
      () => restored.reserve("fixture", 200001),
      /MODEL_BUDGET_EXHAUSTED/,
    );
    assert.throws(
      () => ledger.pool("test-evaluation", 600000, PROTOCOL_HASH),
      /CONFIGURATION_CONFLICT/,
    );
    assert.throws(
      () => ledger.pool("test-evaluation", 500000, "0".repeat(64)),
      /CONFIGURATION_CONFLICT/,
    );
    const global = ledger.reserve("development", 100000);
    assert.throws(() => restored.settle(global, 1), /ATTEMPT_NOT_FOUND/);
    restored.settle(unknown, 100);
    assert.equal(restored.summary().remainingMicroUsd, 299900);
  } finally {
    ledger.close();
  }
});
test("manual instrument requires session, persists exact human actions and finalizes once without revealing oracle answers", async (t) => {
  const records: unknown[] = [],
    app = manualApp((r) => records.push(r));
  t.after(() => app.close());
  assert.equal(
    (await app.inject({ method: "POST", url: "/begin", payload: {} }))
      .statusCode,
    403,
  );
  const page = (await app.inject("/")).body;
  const token = /const sessionToken="([a-f0-9-]+)"/.exec(page)![1]!;
  const headers = { "x-evaluation-session": token };
  const call = (url: string, payload: unknown) =>
    app.inject({
      method: "POST",
      url,
      headers,
      payload: payload as Record<string, unknown>,
    });
  assert.equal((await call("/begin", {})).statusCode, 200);
  assert.equal(
    (await call("/action", { name: "approvePurchase", rationale: "spoof" }))
      .statusCode,
    400,
  );
  for (const name of [
    "getProcurementRequirements",
    "getSupplierQuotes",
    "compareQuotes",
    "preparePurchaseProposal",
  ])
    assert.equal(
      (await call("/action", { name, rationale: "Actual fixture review" }))
        .statusCode,
      200,
    );
  assert.equal((await call("/visibility", { active: false })).statusCode, 200);
  assert.equal(
    (
      await call("/finish", {
        status: "completion",
        rationale: "Reviewed quote and policy",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await call("/finish", { status: "completion", rationale: "Duplicate" }))
      .statusCode,
    400,
  );
  assert.equal(records.length, 1);
  assert.equal((records[0] as { taskSuccess: boolean }).taskSuccess, true);
  assert.doesNotMatch(
    page,
    /expectedSupplier|expectedTotal|192000|PROTOCOL.*cases/,
  );
});

test("known billing from a failed provider attempt remains in evaluation usage and the results denominator", async () => {
  const failed = await agentTrial(
    CASES[0],
    1,
    {
      async complete(_input, options) {
        options?.observeUsage?.({
          attemptId: "synthetic-billed-failure",
          providerRequestId: null,
          inputTokens: 80,
          outputTokens: null,
          costMicroUsd: 12,
        });
        throw new Error("MODEL_RESPONSE_INVALID");
      },
    },
    true,
  );
  assert.equal(failed.taskSuccess, false);
  assert.equal(failed.modelCalls, 1);
  assert.equal(failed.usage[0]!.costMicroUsd, 12);
  assert.equal(failed.usage[0]!.outputTokens, null);
  const result = summarize([failed, fixedTrial(CASES[0])]);
  const group = result.groups.find((g) => g.approach === "agent-live")!;
  assert.equal(group.attempted, 1);
  assert.equal(group.failed, 1);
  assert.equal(group.knownCostMicroUsd, 12);
  assert.equal(group.tokens.unknownOutputCalls, 1);
});

test("no-feasible manual completion without reading the actual comparison is not a successful trial", () => {
  const session = new TrialSession(CASES[3], "manual", 1);
  try {
    const record = session.finish("escalation");
    assert.equal(record.businessStatePass, true);
    assert.equal(record.checks.requiredEvidence, false);
    assert.equal(record.taskSuccess, false);
  } finally {
    session.close();
  }
});

test("pool binding failure rolls back a global reservation and a provider overcharge stops new spending", () => {
  const budget = new ModelBudget(":memory:", 1000000);
  try {
    const pool = budget.pool("test-atomic-pool", 500000, PROTOCOL_HASH);
    budget.store.db.exec(
      "CREATE TRIGGER synthetic_binding_failure BEFORE INSERT ON model_pool_spend BEGIN SELECT RAISE(ABORT,'Synthetic binding failure'); END;",
    );
    assert.throws(() => pool.reserve("synthetic", 300000), /Synthetic/);
    assert.equal(budget.summary().heldMicroUsd, 0);
    assert.equal(pool.summary().requests, 0);
    budget.store.db.exec("DROP TRIGGER synthetic_binding_failure");
    const attempt = pool.reserve("synthetic", 300000);
    pool.settle(attempt, 300001);
    assert.equal(budget.summary().stopped, true);
    assert.equal(pool.summary().heldMicroUsd, 300001);
    assert.throws(() => pool.reserve("synthetic", 1), /MODEL_BUDGET_EXHAUSTED/);
  } finally {
    budget.close();
  }
});
