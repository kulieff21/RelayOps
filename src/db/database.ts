import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function applicationTables() {
  const sql = readFileSync(
    new URL("../../migrations/001-initial.sql", import.meta.url),
    "utf8",
  );
  return new Set([
    "migrations",
    ...Array.from(
      sql.matchAll(/CREATE TABLE ([a-z_]+)\(/g),
      (match) => match[1]!,
    ),
  ]);
}

// Keep the experimental Node 22 SQLite API behind this synchronous adapter.
export class Store {
  readonly db: DatabaseSync;
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
  }
  run(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).run(...args);
  }
  one<T>(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }
  all<T>(sql: string, ...args: SQLInputValue[]) {
    return this.db.prepare(sql).all(...args) as T[];
  }
  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  migrate() {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL) STRICT",
    );
    const sql = readFileSync(
      new URL("../../migrations/001-initial.sql", import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = this.one<{ checksum: string }>(
      "SELECT checksum FROM migrations WHERE version=?",
      "001",
    );
    if (prior) {
      if (prior.checksum !== checksum)
        throw new Error("Migration checksum mismatch");
      return;
    }
    if (
      this.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name!='migrations' AND name NOT LIKE 'sqlite_%'",
      ).length
    )
      throw new Error("Unrecognized database; refusing fixture migration");
    this.transaction(() => {
      this.db.exec(sql);
      this.run("INSERT INTO migrations VALUES (?, ?)", "001", checksum);
    });
  }
  close() {
    this.db.close();
  }
}
