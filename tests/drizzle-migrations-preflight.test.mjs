import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import * as schema from "../db/schema.ts";

test("drizzle migrations preflight parses all 29 statements in 0011 and recognizes breakpoints", () => {
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  assert.equal(migrations.length, 15, "Expected 15 migration files registered in _journal.json");

  const m11 = migrations.find((m) => m.folderMillis === 1789640575611);
  assert.ok(m11, "Migration 0011_workforce_integrity must be present");
  assert.equal(m11.sql.length, 29, "Migration 0011 must parse into exactly 29 separate statements");

  const m13 = migrations.find((m) => m.folderMillis === 1789640575630);
  assert.ok(m13, "Migration 0013_workforce_guardrails must be present");
  assert.equal(m13.sql.length, 1, "Migration 0013 must parse into exactly 1 statement");

  const m14 = migrations.find((m) => m.folderMillis === 1789640575640);
  assert.ok(m14, "Migration 0014_indexes_and_perf must be present");
  assert.equal(m14.sql.length, 4, "Migration 0014 must parse into exactly 4 statements");
});

test("drizzle migrations execute statement-by-statement creating 31 tables and 15 triggers", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON;");

  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });

  for (const migration of migrations) {
    for (const stmt of migration.sql) {
      const cleanStmt = stmt.trim();
      if (!cleanStmt) continue;
      db.prepare(cleanStmt).run();
    }
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);
  assert.equal(tables.length, 31, "All 31 physical tables must be created");
  assert.ok(tables.includes("attendance_corrections"), "attendance_corrections table must exist");
  assert.ok(tables.includes("payroll_adjustments"), "payroll_adjustments table must exist");

  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
    .all()
    .map((r) => r.name);
  assert.equal(triggers.length, 15, "All 15 triggers must be created");

  const expectedTriggers = [
    "attendance_session_revision_guard",
    "attendance_corrections_immutable_update",
    "attendance_corrections_immutable_delete",
    "payroll_adjustments_immutable_update",
    "payroll_adjustments_immutable_delete",
    "shifts_no_overlap_insert",
    "shifts_no_overlap_update",
    "attendance_revision_insert",
    "attendance_revision_update",
    "attendance_revision_delete",
    "employee_payroll_revision",
    "shifts_revision_insert",
    "shifts_revision_update",
    "payroll_adjustments_revision",
    "shifts_locked_period_insert",
  ];

  for (const expected of expectedTriggers) {
    assert.ok(triggers.includes(expected), `Trigger ${expected} must be created in SQLite`);
  }

  const fkCheck = db.prepare("PRAGMA foreign_key_check").all();
  assert.equal(fkCheck.length, 0, "No foreign key violations should exist after migrations");
});

test("schema parity: db/schema.ts matches SQLite catalog with zero drift", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON;");

  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  for (const migration of migrations) {
    for (const stmt of migration.sql) {
      const cleanStmt = stmt.trim();
      if (!cleanStmt) continue;
      db.prepare(cleanStmt).run();
    }
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);

  const mismatches = [];

  for (const tableName of tables) {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const drizzleTable = Object.values(schema).find(
      (obj) => obj && typeof obj === "object" && obj[Symbol.for("drizzle:Name")] === tableName
    );
    assert.ok(drizzleTable, `Table ${tableName} must be exported from db/schema.ts`);

    const drizzleColumns = drizzleTable[Symbol.for("drizzle:Columns")] || {};

    for (const col of tableInfo) {
      const dCol = Object.values(drizzleColumns).find((c) => c.name === col.name);
      assert.ok(dCol, `Column ${tableName}.${col.name} must exist in db/schema.ts`);

      const dbNotNull = col.notnull === 1;
      const schemaNotNull = dCol.notNull === true;
      if (dbNotNull !== schemaNotNull) {
        mismatches.push(
          `NOTNULL mismatch on ${tableName}.${col.name}: db=${dbNotNull}, schema=${schemaNotNull}`
        );
      }

      const dbHasDefault = col.dflt_value !== null;
      const schemaHasDefault = dCol.hasDefault === true;
      if (dbHasDefault !== schemaHasDefault) {
        mismatches.push(
          `DEFAULT mismatch on ${tableName}.${col.name}: db=${col.dflt_value}, schema=${schemaHasDefault}`
        );
      }
    }
  }

  assert.deepEqual(mismatches, [], "Expected 0 schema drift mismatches");
});

test("triggers enforce immutability and workforce integrity constraints", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON;");

  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  for (const migration of migrations) {
    for (const stmt of migration.sql) {
      const cleanStmt = stmt.trim();
      if (!cleanStmt) continue;
      db.prepare(cleanStmt).run();
    }
  }

  // Seed store & session
  db.prepare(`INSERT INTO stores (id, name, address, latitude, longitude, created_at) VALUES ('s1', 'Test Store', '123 St', 10.0, 106.0, '2026-07-01T00:00:00Z')`).run();
  db.prepare(`INSERT INTO employees (id, store_id, email, display_name, role, created_at, updated_at) VALUES ('e1', 's1', 'emp@test.com', 'Emp', 'employee', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z')`).run();
  db.prepare(`INSERT INTO attendance_sessions (id, store_id, employee_email, status, revision) VALUES ('ses1', 's1', 'emp@test.com', 'open', 0)`).run();

  // Test attendance_corrections immutability triggers
  db.prepare(`INSERT INTO attendance_corrections (id, session_id, action, effective_time, reason, actor_email, created_at) VALUES ('c1', 'ses1', 'check_in', '2026-07-01T08:00:00Z', 'Correction note', 'admin@test.com', '2026-07-01T08:05:00Z')`).run();

  assert.throws(() => {
    db.prepare(`UPDATE attendance_corrections SET reason = 'tampered' WHERE id = 'c1'`).run();
  }, /immutable_attendance_correction/);

  assert.throws(() => {
    db.prepare(`DELETE FROM attendance_corrections WHERE id = 'c1'`).run();
  }, /immutable_attendance_correction/);

  // Test payroll_adjustments immutability triggers
  db.prepare(`INSERT INTO payroll_adjustments (id, store_id, period_key, employee_email, amount, reason, actor_email, created_at) VALUES ('p1', 's1', '2026-07', 'emp@test.com', 50000, 'Bonus incentive', 'admin@test.com', '2026-07-01T00:00:00Z')`).run();

  assert.throws(() => {
    db.prepare(`UPDATE payroll_adjustments SET amount = 100000 WHERE id = 'p1'`).run();
  }, /immutable_payroll_adjustment/);

  assert.throws(() => {
    db.prepare(`DELETE FROM payroll_adjustments WHERE id = 'p1'`).run();
  }, /immutable_payroll_adjustment/);
});
