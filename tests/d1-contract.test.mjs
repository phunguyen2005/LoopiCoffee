import assert from "node:assert/strict";
import test from "node:test";
import { Miniflare } from "miniflare";
import { updateEmployeeAccess } from "../modules/people/application/update-access.ts";

test("D1 batch preserves changes() guards and transaction rollback", async (t) => {
  const runtime = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("test"); } }',
    compatibilityDate: "2026-05-22",
    d1Databases: ["DB"],
  });
  t.after(() => runtime.dispose());
  const db = await runtime.getD1Database("DB");
  await db.prepare("CREATE TABLE employees (id TEXT PRIMARY KEY, email TEXT, store_id TEXT, role TEXT, status TEXT, auth_user_id TEXT, updated_at TEXT)").run();
  await db.prepare("CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor_email TEXT, entity_type TEXT, entity_id TEXT, action TEXT, metadata TEXT, created_at TEXT, store_id TEXT)").run();
  await db.prepare("INSERT INTO employees (id, email, store_id, role, status) VALUES ('owner', 'owner@example.test', 'store', 'owner', 'active'), ('employee', 'employee@example.test', 'store', 'employee', 'active')").run();
  const actor = { id: "owner", storeId: "store", role: "owner", email: "owner@example.test" };
  await assert.rejects(updateEmployeeAccess(db, actor, "owner", { role: "employee" }), { code: "access_conflict" });
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM audit_events").first()).n, 0);
  await updateEmployeeAccess(db, actor, "employee", { status: "suspended" });
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM audit_events").first()).n, 1);
  await assert.rejects(db.batch([
    db.prepare("UPDATE employees SET status = 'active' WHERE id = 'employee'"),
    db.prepare("INSERT INTO missing_table VALUES (1)"),
  ]));
  assert.equal((await db.prepare("SELECT status FROM employees WHERE id = 'employee'").first()).status, "suspended");
});
