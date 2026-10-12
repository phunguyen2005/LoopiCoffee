import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { updateEmployeeAccess } from "../modules/people/application/update-access.ts";
import { completeSignIn } from "../modules/people/application/complete-sign-in.ts";
import { decideRequest } from "../modules/operations/application/decide-request.ts";
import { changePayrollPeriod } from "../modules/payroll/application/change-period.ts";
import { loadPayrollReport } from "../modules/payroll/application/load-report.ts";
import { expireEvidence } from "../modules/attendance/application/expire-evidence.ts";
import { loadUnexpiredPhoto } from "../modules/attendance/application/load-photo.ts";
import { evaluateShiftWindow } from "../modules/attendance/domain/policy.ts";
import { readJson, ApiError } from "../platform/http/client.ts";
import { readObject } from "../platform/http/input.ts";

function setup(t) {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const owner = seedEmployee(db);
  return { db, owner };
}
function count(db, table) { return db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; }
function attendance(db, email, id = "session-a") {
  db.sqlite.prepare("INSERT INTO attendance_sessions (id, employee_email, store_id, status, opened_at, closed_at, worked_minutes) VALUES (?, ?, 'store-a', 'completed', '2026-07-03T01:00:00.000Z', '2026-07-03T09:00:00.000Z', 480)").run(id, email);
}
function report(db, actor) { return loadPayrollReport(db, { storeId: actor.storeId, actorRole: actor.role, actorEmail: actor.email, periodKey: "2026-07" }); }

test("fresh migration chain contains application columns and preserves foreign keys", (t) => {
  const { db } = setup(t);
  for (const [table, columns] of Object.entries({ employees: ["job_title", "phone", "start_date", "last_login_at"], stores: ["geofence_radius_meters"], payroll_entries: ["row_snapshot", "snapshot_version"] })) {
    const actual = db.sqlite.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    for (const column of columns) assert.ok(actual.includes(column), `${table}.${column}`);
  }
  assert.equal(db.sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.deepEqual(db.sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.throws(() => seedEmployee(db, { id: "orphan", storeId: "missing" }), /FOREIGN KEY/);
});

test("the last active owner cannot be demoted through the shared access service", async (t) => {
  const { db, owner } = setup(t);
  await assert.rejects(updateEmployeeAccess(db, owner, owner.id, { role: "employee" }), { code: "access_conflict" });
  assert.equal(count(db, "audit_events"), 0);
  assert.equal(db.sqlite.prepare("SELECT role FROM employees WHERE id = ?").get(owner.id).role, "owner");
});

test("concurrent demotions leave an active owner and write one audit", async (t) => {
  const { db, owner } = setup(t);
  const other = seedEmployee(db, { id: "owner-b" });
  const result = await Promise.allSettled([
    updateEmployeeAccess(db, owner, owner.id, { role: "employee" }),
    updateEmployeeAccess(db, other, other.id, { role: "employee" }),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM employees WHERE role = 'owner' AND status = 'active'").get().n, 1);
  assert.equal(count(db, "audit_events"), 1);
});

test("access changes are store-scoped and cannot target a superior role", async (t) => {
  const { db, owner } = setup(t);
  seedStore(db, "store-b");
  const external = seedEmployee(db, { id: "external", storeId: "store-b", role: "employee" });
  const manager = seedEmployee(db, { id: "manager", role: "manager" });
  const admin = seedEmployee(db, { id: "admin", role: "system_admin" });
  await assert.rejects(updateEmployeeAccess(db, owner, external.id, { status: "suspended" }), { status: 404 });
  await assert.rejects(updateEmployeeAccess(db, manager, owner.id, { role: "employee" }), { status: 403 });
  await assert.rejects(updateEmployeeAccess(db, owner, admin.id, { status: "suspended" }), { status: 403 });
  await assert.rejects(updateEmployeeAccess(db, manager, manager.id, { status: "suspended" }), { code: "self_deactivation" });
});

test("a failed audit rolls back the employee change", async (t) => {
  const { db, owner } = setup(t);
  const employee = seedEmployee(db, { id: "employee", role: "employee" });
  db.failOn(/INSERT INTO audit_events/);
  await assert.rejects(updateEmployeeAccess(db, owner, employee.id, { status: "suspended" }));
  assert.equal(db.sqlite.prepare("SELECT status FROM employees WHERE id = ?").get(employee.id).status, "active");
});

test("sign-in activates only an invited member, without creating owners or consent", async (t) => {
  const { db } = setup(t);
  const invited = seedEmployee(db, { id: "invited", role: "employee", status: "invited" });
  const suspended = seedEmployee(db, { id: "suspended", role: "employee", status: "suspended" });
  await completeSignIn(db, { email: "stranger@example.test", displayName: "Stranger" });
  await completeSignIn(db, { email: invited.email, displayName: "Invited", authUserId: "auth-invited" });
  await completeSignIn(db, { email: invited.email, displayName: "Invited", authUserId: "auth-invited" });
  await completeSignIn(db, { email: suspended.email, displayName: "Suspended" });
  assert.equal(count(db, "employees"), 3);
  assert.equal(count(db, "employee_consents"), 0);
  assert.equal(count(db, "audit_events"), 1);
  assert.equal(db.sqlite.prepare("SELECT status FROM employees WHERE id = ?").get(invited.id).status, "active");
  assert.equal(db.sqlite.prepare("SELECT status FROM employees WHERE id = ?").get(suspended.id).status, "suspended");
});

test("request decisions, notifications and audit either commit together or roll back", async (t) => {
  const { db, owner } = setup(t);
  db.sqlite.prepare("INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, created_at) VALUES ('request-a', 'store-a', ?, 'leave', 'Leave', 'Personal', 'pending', '2026-07-01')").run(owner.email);
  db.failOn(/INSERT INTO audit_events/);
  await assert.rejects(decideRequest(db, owner, "request-a", "approved"));
  assert.equal(db.sqlite.prepare("SELECT status FROM requests").get().status, "pending");
  assert.equal(count(db, "notifications"), 0);
  db.failOn(undefined);
  await decideRequest(db, owner, "request-a", "approved");
  await assert.rejects(decideRequest(db, owner, "request-a", "rejected"), { code: "request_conflict" });
  assert.equal(count(db, "notifications"), 1);
  assert.equal(count(db, "audit_events"), 1);
});

test("locked payroll survives changed rates, names and offboarding", async (t) => {
  const { db, owner } = setup(t);
  const employee = seedEmployee(db, { id: "employee", role: "employee" });
  attendance(db, employee.email);
  const before = (await report(db, owner)).rows.find((row) => row.email === employee.email);
  assert.ok(before.totalSalary > 0);
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  db.sqlite.prepare("UPDATE employees SET status = 'offboarded', display_name = 'Changed', hourly_rate = 999999 WHERE id = ?").run(employee.id);
  const after = (await report(db, owner)).rows.find((row) => row.email === employee.email);
  assert.equal(after.totalSalary, before.totalSalary);
  assert.equal(after.baseSalary, before.baseSalary);
  assert.equal(after.hourlyRate, before.hourlyRate);
  assert.equal(after.displayName, before.displayName);
  assert.equal(after.snapshotComplete, true);
  assert.equal((await report(db, employee)).rows.length, 1);
});

test("legacy locked entries retain saved totals without inventing historical rates", async (t) => {
  const { db, owner } = setup(t);
  const employee = seedEmployee(db, { id: "employee", role: "employee" });
  attendance(db, employee.email);
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  db.sqlite.exec("UPDATE payroll_entries SET row_snapshot = NULL, snapshot_version = 0; UPDATE employees SET status = 'offboarded' WHERE role = 'employee'");
  const rows = (await report(db, owner)).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].snapshotComplete, false);
  assert.equal(rows[0].totalSalary, db.sqlite.prepare("SELECT total_amount FROM payroll_entries").get().total_amount);
});

test("concurrent payroll finalizations commit one snapshot set", async (t) => {
  const { db, owner } = setup(t);
  const employee = seedEmployee(db, { id: "employee", role: "employee" });
  attendance(db, employee.email);
  const results = await Promise.allSettled([changePayrollPeriod(db, owner, "finalize", "2026-07"), changePayrollPeriod(db, owner, "finalize", "2026-07")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(count(db, "payroll_entries"), 1);
  assert.equal(count(db, "audit_events"), 1);
});

test("payroll failure rolls back its lock, audit and entries; paid periods cannot reopen", async (t) => {
  const { db, owner } = setup(t);
  const employee = seedEmployee(db, { id: "employee", role: "employee" });
  attendance(db, employee.email);
  db.failOn(/INSERT INTO payroll_entries/);
  await assert.rejects(changePayrollPeriod(db, owner, "finalize", "2026-07"));
  assert.equal(count(db, "payroll_periods"), 0);
  assert.equal(count(db, "audit_events"), 0);
  db.failOn(undefined);
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  await assert.rejects(changePayrollPeriod(db, { ...owner, role: "manager" }, "reopen", "2026-07"), { status: 403 });
  db.sqlite.exec("UPDATE payroll_periods SET status = 'paid'");
  await assert.rejects(changePayrollPeriod(db, owner, "reopen", "2026-07"), { code: "payroll_conflict" });
});

test("retention erases coordinates but retains photos for retry when storage is unavailable", async (t) => {
  const { db, owner } = setup(t);
  attendance(db, owner.email);
  db.sqlite.prepare("INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required) VALUES ('event-a', 'session-a', ?, 'check_in', '2026-07-03', 'idem', '[]', 0)").run(owner.email);
  db.sqlite.exec("INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, overlay_version, expires_at) VALUES ('event-a', 'private/evidence-a', 'image/jpeg', 100, '1', '2026-07-04'); INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at) VALUES ('event-a', 10, 106, 10, '2026-07-03', 10, '2026-07-04')");
  const failed = await expireEvidence(db, undefined, "2026-07-05T00:00:00.000Z");
  assert.equal(failed.failures, 1);
  assert.equal(count(db, "attendance_photos"), 1);
  assert.equal(count(db, "attendance_locations"), 0);
  assert.equal(await loadUnexpiredPhoto(db, "event-a", "store-a", "2026-07-05T00:00:00.000Z"), null);
  assert.equal(await loadUnexpiredPhoto(db, "event-a", "store-b", "2026-07-03T00:00:00.000Z"), null);
  assert.ok(await loadUnexpiredPhoto(db, "event-a", "store-a", "2026-07-03T00:00:00.000Z"));
  const deletedKeys = [];
  const succeeded = await expireEvidence(db, { delete: async (key) => { deletedKeys.push(key); } }, "2026-07-05T00:00:00.000Z");
  assert.deepEqual(deletedKeys, ["private/evidence-a"]);
  assert.equal(succeeded.photosDeleted, 1);
  assert.equal(count(db, "attendance_photos"), 0);
  assert.equal(count(db, "attendance_events"), 1);
});

test("attendance thresholds are inclusive at the boundary", () => {
  const shift = { id: "shift", starts_at: "2026-07-01T01:00:00Z", ends_at: "2026-07-01T09:00:00Z" };
  const rule = { early_checkin_minutes: 30, late_minutes: 10, absence_minutes: 60, early_departure_minutes: 15, missing_checkout_minutes: 180 };
  assert.deepEqual(evaluateShiftWindow("check_in", shift, rule, "2026-07-01T01:10:00Z"), []);
  assert.deepEqual(evaluateShiftWindow("check_in", shift, rule, "2026-07-01T01:10:01Z"), ["late"]);
  assert.deepEqual(evaluateShiftWindow("check_out", shift, rule, "2026-07-01T08:45:00Z"), []);
  assert.deepEqual(evaluateShiftWindow("check_in", null, rule, shift.starts_at), ["no_assigned_shift"]);
});

test("JSON client rejects HTTP errors and malformed responses", async () => {
  await assert.rejects(readJson(Response.json({ error: "Denied", code: "forbidden" }, { status: 403 })), (error) => error instanceof ApiError && error.status === 403 && error.message === "Denied");
  await assert.rejects(readJson(new Response("not JSON")));
  assert.deepEqual(await readJson(Response.json({ ok: true })), { ok: true });
});

test("input validation rejects null, arrays, malformed JSON and wrongly typed fields", async () => {
  for (const body of ["null", "[]", "{", '{"role":42}']) {
    await assert.rejects(readObject(new Request("https://example.test", { method: "POST", body }), { role: "string" }), { status: 400 });
  }
});
