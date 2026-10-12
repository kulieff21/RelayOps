import { randomUUID } from "node:crypto";
import { Store } from "../db/database.js";

// Separate from the resettable business demo: a reset must never renew spending.
export class ModelBudget {
  readonly store: Store;
  constructor(path: string, ceilingMicroUsd: number) {
    if (
      !Number.isSafeInteger(ceilingMicroUsd) ||
      ceilingMicroUsd < 0 ||
      ceilingMicroUsd > 1_000_000
    )
      throw new Error("MODEL_BUDGET_INVALID");
    this.store = new Store(path);
    try {
      this.store.transaction(() => {
        const tables = this.store.all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        );
        if (
          tables.some(
            (t) =>
              ![
                "model_budget",
                "model_spend",
                "model_pools",
                "model_pool_spend",
              ].includes(t.name),
          )
        )
          throw new Error("MODEL_BUDGET_DATABASE_UNRECOGNIZED");
        this.store.db.exec(`
          CREATE TABLE IF NOT EXISTS model_budget(id INTEGER PRIMARY KEY CHECK(id=1),
            ceiling INTEGER NOT NULL CHECK(ceiling BETWEEN 0 AND 1000000), stopped INTEGER NOT NULL CHECK(stopped IN (0,1))) STRICT;
          CREATE TABLE IF NOT EXISTS model_spend(id TEXT PRIMARY KEY, model TEXT NOT NULL,
            reserved INTEGER NOT NULL CHECK(reserved>0), cost INTEGER CHECK(cost>=0),
            state TEXT NOT NULL CHECK(state IN ('held','settled')), created_at TEXT NOT NULL) STRICT;
        `);
        this.store.run(
          "INSERT OR IGNORE INTO model_budget VALUES(1,?,0)",
          ceilingMicroUsd,
        );
        const saved = this.store.one<{ ceiling: number }>(
          "SELECT ceiling FROM model_budget WHERE id=1",
        )!;
        if (ceilingMicroUsd > saved.ceiling)
          throw new Error("MODEL_BUDGET_INCREASE_REQUIRES_REVIEW");
        this.store.run(
          "UPDATE model_budget SET ceiling=? WHERE id=1",
          ceilingMicroUsd,
        );
      });
    } catch (error) {
      this.store.close();
      throw error;
    }
  }
  summary() {
    const row = this.store.one<{ ceiling: number; stopped: number }>(
      "SELECT ceiling,stopped FROM model_budget WHERE id=1",
    )!;
    const totals = this.store.one<{ spent: number; held: number }>(
      "SELECT COALESCE(SUM(COALESCE(cost,0)),0) spent, COALESCE(SUM(CASE WHEN state='held' THEN MAX(reserved,COALESCE(cost,0)) ELSE 0 END),0) held FROM model_spend",
    )!;
    const settled = this.store.one<{ total: number }>(
      "SELECT COALESCE(SUM(cost),0) total FROM model_spend WHERE state='settled'",
    )!.total;
    return {
      ceilingMicroUsd: row.ceiling,
      knownCostMicroUsd: totals.spent,
      heldMicroUsd: totals.held,
      remainingMicroUsd: Math.max(0, row.ceiling - settled - totals.held),
      stopped: !!row.stopped,
    };
  }
  reserve(model: string, amount: number) {
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 300_000)
      throw new Error("MODEL_RESERVATION_INVALID");
    return this.store.transaction(() => {
      const s = this.summary();
      if (s.stopped || amount > s.remainingMicroUsd)
        throw new Error("MODEL_BUDGET_EXHAUSTED");
      const id = randomUUID();
      this.store.run(
        "INSERT INTO model_spend VALUES(?,?,?,NULL,'held',?)",
        id,
        model,
        amount,
        new Date().toISOString(),
      );
      return id;
    });
  }
  settle(id: string, cost: number) {
    if (!Number.isSafeInteger(cost) || cost < 0)
      throw new Error("MODEL_COST_INVALID");
    this.store.transaction(() => {
      const row = this.store.one<{
        reserved: number;
        state: string;
        cost: number | null;
      }>("SELECT reserved,state,cost FROM model_spend WHERE id=?", id);
      if (!row) throw new Error("MODEL_RESERVATION_NOT_FOUND");
      if (row.cost !== null) {
        if (row.cost !== cost) throw new Error("MODEL_COST_CONFLICT");
        return;
      }
      // A provider price/billing violation is recorded and permanently blocks new calls.
      const exceeded = cost > row.reserved;
      this.store.run(
        "UPDATE model_spend SET cost=?,state=? WHERE id=?",
        cost,
        exceeded ? "held" : "settled",
        id,
      );
      if (exceeded)
        this.store.run("UPDATE model_budget SET stopped=1 WHERE id=1");
    });
  }
  close() {
    this.store.close();
  }
  // Optional allocations share the ORIGINAL ledger; resetting an experiment or
  // its business database can never replenish either the pool or global funds.
  pool(id: string, ceiling: number, fingerprint: string) {
    if (
      !/^[a-z0-9-]{1,80}$/.test(id) ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      !Number.isSafeInteger(ceiling) ||
      ceiling < 1 ||
      ceiling > 1_000_000
    )
      throw new Error("MODEL_POOL_INVALID");
    this.store.transaction(() => {
      this.store.db.exec(`
        CREATE TABLE IF NOT EXISTS model_pools(id TEXT PRIMARY KEY, ceiling INTEGER NOT NULL CHECK(ceiling>0), fingerprint TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS model_pool_spend(pool_id TEXT NOT NULL REFERENCES model_pools(id), attempt_id TEXT PRIMARY KEY REFERENCES model_spend(id)) STRICT;
        CREATE TRIGGER IF NOT EXISTS model_pool_immutable BEFORE UPDATE ON model_pools BEGIN SELECT RAISE(ABORT,'Pool is immutable'); END;
        CREATE TRIGGER IF NOT EXISTS model_pool_no_delete BEFORE DELETE ON model_pools BEGIN SELECT RAISE(ABORT,'Pool is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS model_pool_spend_immutable BEFORE UPDATE ON model_pool_spend BEGIN SELECT RAISE(ABORT,'Pool binding is immutable'); END;
        CREATE TRIGGER IF NOT EXISTS model_pool_spend_no_delete BEFORE DELETE ON model_pool_spend BEGIN SELECT RAISE(ABORT,'Pool binding is append-only'); END;
      `);
      const prior = this.store.one<{ ceiling: number; fingerprint: string }>(
        "SELECT * FROM model_pools WHERE id=?",
        id,
      );
      if (
        prior &&
        (prior.ceiling !== ceiling || prior.fingerprint !== fingerprint)
      )
        throw new Error("MODEL_POOL_CONFIGURATION_CONFLICT");
      if (!prior) {
        if (ceiling > this.summary().remainingMicroUsd)
          throw new Error("MODEL_POOL_UNFUNDED");
        this.store.run(
          "INSERT INTO model_pools VALUES(?,?,?)",
          id,
          ceiling,
          fingerprint,
        );
      }
    });
    const summary = () => {
      const s = this.store.one<{
        spent: number;
        held: number;
        requests: number;
      }>(
        "SELECT COALESCE(SUM(CASE WHEN s.state='settled' THEN s.cost ELSE 0 END),0) spent, COALESCE(SUM(CASE WHEN s.state='held' THEN MAX(s.reserved,COALESCE(s.cost,0)) ELSE 0 END),0) held, COUNT(s.id) requests FROM model_pool_spend p JOIN model_spend s ON s.id=p.attempt_id WHERE p.pool_id=?",
        id,
      )!;
      return {
        ceilingMicroUsd: ceiling,
        knownSettledMicroUsd: s.spent,
        heldMicroUsd: s.held,
        requests: s.requests,
        remainingMicroUsd: Math.max(0, ceiling - s.spent - s.held),
      };
    };
    return {
      summary,
      reserve: (model: string, amount: number) =>
        this.store.transaction(() => {
          if (amount > summary().remainingMicroUsd)
            throw new Error("MODEL_BUDGET_EXHAUSTED");
          const attempt = this.reserve(model, amount);
          this.store.run(
            "INSERT INTO model_pool_spend VALUES(?,?)",
            id,
            attempt,
          );
          return attempt;
        }),
      settle: (attempt: string, cost: number) => {
        if (
          !this.store.one(
            "SELECT attempt_id FROM model_pool_spend WHERE pool_id=? AND attempt_id=?",
            id,
            attempt,
          )
        )
          throw new Error("MODEL_POOL_ATTEMPT_NOT_FOUND");
        this.settle(attempt, cost);
      },
    };
  }
}
