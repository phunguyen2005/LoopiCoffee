import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

export function createDatabase({ migrations = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  if (migrations) {
    const directory = new URL("../../drizzle/", import.meta.url);
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  }
  let failPattern;
  function prepare(sql, values = []) {
    const execute = () => {
      if (failPattern?.test(sql)) throw new Error("Injected database failure");
      const statement = sqlite.prepare(sql);
      const returnsRows = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
      const results = returnsRows ? statement.all(...values) : [];
      const changes = returnsRows ? 0 : Number(statement.run(...values).changes);
      return { success: true, results, meta: { changes } };
    };
    return {
      bind: (...args) => prepare(sql, args),
      first: async () => execute().results[0] ?? null,
      all: async () => execute(),
      run: async () => execute(),
      execute,
    };
  }
  return {
    sqlite, prepare,
    failOn: (pattern) => { failPattern = pattern; },
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    close: () => sqlite.close(),
  };
}

export function seedStore(db, id = "store-a") {
  db.sqlite.prepare("INSERT INTO stores (id, name, address, latitude, longitude, created_at, updated_at) VALUES (?, 'Test', 'Test', 10, 106, ?, ?)")
    .run(id, "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z");
}

export function seedEmployee(db, { id = "owner-a", storeId = "store-a", role = "owner", status = "active" } = {}) {
  db.sqlite.prepare("INSERT INTO employees (id, store_id, email, display_name, role, status, hourly_rate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, storeId, `${id}@example.test`, id, role, status, 25000, "2026-07-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z");
  return { id, storeId, role, email: `${id}@example.test` };
}
