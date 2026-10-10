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
          tables.some((t) => !["model_budget", "model_spend"].includes(t.name))
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
}
