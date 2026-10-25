import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedEmployee, seedStore } from "./helpers/database.mjs";
import { loadAdminAudit, sanitizeAuditDetails } from "../modules/people/application/admin-audit.ts";

function insertEvent(db, id, action, entityType, entityId, metadata, storeId = "store-a", at = "2026-10-14T00:00:00.000Z") {
  db.sqlite.prepare(`INSERT INTO audit_events (id, store_id, actor_email, entity_type, entity_id, action, metadata, created_at)
    VALUES (?, ?, 'admin@example.test', ?, ?, ?, ?, ?)`).run(id, storeId, entityType, entityId, action, metadata, at);
}

test("admin audit covers custom-role events, filters by category and excludes business/other-store events", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  seedEmployee(db, { id: "emp-1", role: "employee", email: "target@example.test", hourlyRate: null, rateHistory: false });
  insertEvent(db, "e1", "account.created", "employee", "emp-1", JSON.stringify({ role: "employee", reason: "ok" }), "store-a", "2026-10-14T00:00:01.000Z");
  insertEvent(db, "e2", "rbac.custom_role_created", "custom_role", "cr-1", "{}", "store-a", "2026-10-14T00:00:02.000Z");
  insertEvent(db, "e3", "attendance.corrected", "attendance", "x", "{}");
  insertEvent(db, "e4", "account.created", "employee", "emp-1", "{}", "store-b");
  const all = await loadAdminAudit(db, "store-a");
  assert.deepEqual(all.map((event) => event.id), ["e2", "e1"]);
  assert.equal(all[1].target_label, "target@example.test");
  assert.deepEqual((await loadAdminAudit(db, "store-a", { category: "rbac" })).map((event) => event.id), ["e2"]);
  assert.deepEqual((await loadAdminAudit(db, "store-a", { q: "TARGET@" })).map((event) => event.id), ["e1"]);
  assert.equal((await loadAdminAudit(db, "store-a", { q: "%" })).length, 0);
});

test("audit details drop secret-like keys and nested objects", () => {
  const details = sanitizeAuditDetails(JSON.stringify({ role: "manager", temporaryPassword: "x", accessToken: "y", nested: { a: 1 }, permissions: ["a", "b"] }));
  assert.deepEqual(details, { role: "manager", permissions: "a, b" });
  assert.deepEqual(sanitizeAuditDetails("not json"), {});
  assert.deepEqual(sanitizeAuditDetails(null), {});
});
