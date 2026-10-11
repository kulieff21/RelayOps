import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

function migrations() {
  const directory = new URL("../../migrations/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => /^\d{3}-.+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const sql = readFileSync(new URL(name, directory), "utf8");
      return {
        version: name.slice(0, 3),
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}
export function applicationTables() {
  const sql = migrations()
    .map((migration) => migration.sql)
    .join("\n");
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
  private transactionDepth = 0;
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
    const nested = this.transactionDepth > 0;
    const savepoint = `store_${this.transactionDepth}`;
    this.db.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    this.transactionDepth++;
    try {
      const result = action();
      if (result instanceof Promise)
        throw new Error("Async SQLite transaction refused");
      this.db.exec(nested ? `RELEASE ${savepoint}` : "COMMIT");
      return result;
    } catch (error) {
      this.db.exec(nested ? `ROLLBACK TO ${savepoint}` : "ROLLBACK");
      if (nested) this.db.exec(`RELEASE ${savepoint}`);
      throw error;
    } finally {
      this.transactionDepth--;
    }
  }
  migrate() {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS migrations(version TEXT PRIMARY KEY, checksum TEXT NOT NULL) STRICT",
    );
    const files = migrations();
    const applied = this.all<{ version: string; checksum: string }>(
      "SELECT version,checksum FROM migrations ORDER BY version",
    );
    for (const prior of applied) {
      const file = files.find(
        (migration) => migration.version === prior.version,
      );
      if (!file || file.checksum !== prior.checksum)
        throw new Error("Migration checksum mismatch or unknown version");
    }
    const tables = this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name!='migrations' AND name NOT LIKE 'sqlite_%'",
    );
    const expected = applicationTables();
    if (
      (!applied.length && tables.length) ||
      tables.some((row) => !expected.has(row.name))
    )
      throw new Error("Unrecognized database; refusing fixture migration");
    this.transaction(() => {
      for (const file of files) {
        if (applied.some((prior) => prior.version === file.version)) continue;
        this.db.exec(file.sql);
        this.run(
          "INSERT INTO migrations VALUES (?, ?)",
          file.version,
          file.checksum,
        );
      }
    });
  }
  close() {
    this.db.close();
  }
}
