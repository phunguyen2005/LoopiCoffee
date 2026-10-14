import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadPayrollReport } from "../modules/payroll/application/load-report.ts";
import { changePayrollPeriod } from "../modules/payroll/application/change-period.ts";
import { addPayrollAdjustment } from "../modules/payroll/application/add-adjustment.ts";
import { attendanceTime, correctAttendance } from "../modules/attendance/application/correct-attendance.ts";
import { reviewAttendance } from "../modules/attendance/application/review-attendance.ts";
import { createShifts, changeShift } from "../modules/operations/application/manage-shifts.ts";
import { createRequest } from "../modules/operations/application/create-request.ts";
import { decideRequest } from "../modules/operations/application/decide-request.ts";

function setup(t) {
  const db = createDatabase(); t.after(() => db.close()); seedStore(db);
  return { db, owner: seedEmployee(db), staff: seedEmployee(db, { id: "staff", role: "employee" }) };
}
function session(db, staff, { id = "session", opened = "2026-07-03T01:00:00.000Z", closed = "2026-07-03T09:00:00.000Z", minutes = 480, status = "completed" } = {}) {
  db.sqlite.prepare("INSERT INTO attendance_sessions (id, employee_email, store_id, status, opened_at, closed_at, worked_minutes) VALUES (?, ?, 'store-a', ?, ?, ?, ?)").run(id, staff.email, status, opened, closed, minutes);
  return id;
}
function event(db, staff, { id = "event", sessionId = "session", action = "check_in", time = "2026-07-03T01:00:00.000Z", review = false } = {}) {
  db.sqlite.prepare("INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required) VALUES (?, ?, ?, ?, ?, ?, '[]', ?)").run(id, sessionId, staff.email, action, time, id, review ? 1 : 0);
  if (review) db.sqlite.prepare("INSERT INTO attendance_exceptions (id, event_id, employee_reason, status, created_at) VALUES (?, ?, 'Please review', 'pending', '2026-07-03')").run(`x-${id}`, id);
}
function report(db, owner, periodKey = "2026-07") { return loadPayrollReport(db, { storeId: owner.storeId, actorEmail: owner.email, actorRole: owner.role, periodKey }); }
const shiftInput = { startsAt: "2026-07-03T01:00:00Z", endsAt: "2026-07-03T09:00:00Z", roleLabel: "Barista" };

test("month-crossing work is clipped once per month, with basic hourly pay only", async (t) => {
  const { db, owner, staff } = setup(t);
  session(db, staff, { opened: "2026-07-31T16:00:00.000Z", closed: "2026-07-31T18:00:00.000Z", minutes: 120 });
  const july = (await report(db, owner)).rows[0], august = (await report(db, owner, "2026-08")).rows[0];
  assert.equal(july.approvedMinutes, 60); assert.equal(august.approvedMinutes, 60);
  assert.equal(july.totalSalary + august.totalSalary, 50000); assert.equal(july.overtimePay, 0);
});

test("offboarding before finalization keeps earned work and frozen history", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff);
  db.sqlite.prepare("UPDATE employees SET status = 'offboarded' WHERE id = ?").run(staff.id);
  assert.equal((await report(db, owner)).rows[0].approvedMinutes, 480);
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  assert.equal((await report(db, owner)).rows[0].totalSalary, 200000);
});

test("unsupported/missing pay rates cannot silently finalize", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff);
  db.sqlite.prepare("UPDATE employees SET hourly_rate = NULL WHERE id = ?").run(staff.id);
  await assert.rejects(changePayrollPeriod(db, owner, "finalize", "2026-07"), { code: "pay_rate_required" });
});

test("corrections keep capture time immutable, retain reason, and reject stale/invalid intervals", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff); event(db, staff);
  await correctAttendance(db, owner, { eventId: "event", adjustedTime: "2026-07-03T01:30:00Z", reason: "Đối soát camera", expectedRevision: 0 });
  assert.equal(db.sqlite.prepare("SELECT recorded_at FROM attendance_events").get().recorded_at, "2026-07-03T01:00:00.000Z");
  assert.equal(db.sqlite.prepare("SELECT worked_minutes FROM attendance_sessions").get().worked_minutes, 450);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM attendance_corrections").get().n, 1);
  assert.throws(() => db.sqlite.exec("DELETE FROM attendance_corrections"), /immutable/);
  await assert.rejects(correctAttendance(db, owner, { eventId: "event", adjustedTime: "not-a-date", reason: "Invalid date" }), { status: 400 });
  await assert.rejects(correctAttendance(db, owner, { eventId: "event", adjustedTime: "2026-07-03T12:00:00Z", reason: "Reversed times" }), { status: 400 });
  await assert.rejects(correctAttendance(db, owner, { eventId: "event", adjustedTime: "2026-07-03T02:00:00Z", reason: "Stale change", expectedRevision: 0 }), { code: "attendance_conflict" });
  await assert.rejects(correctAttendance(db, staff, { eventId: "event", adjustedTime: "2026-07-03T02:00:00Z", reason: "Unauthorized" }), { status: 403 });
});

test("missing checkout can be corrected without fabricating a raw capture", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff, { closed: null, minutes: null, status: "open" }); event(db, staff);
  assert.equal((await report(db, owner)).rows[0].pendingExceptionCount, 1);
  await correctAttendance(db, owner, { sessionId: "session", action: "check_out", adjustedTime: "2026-07-03T09:00:00Z", reason: "Quản lý đối soát cuối ca" });
  assert.equal((await report(db, owner)).rows[0].approvedMinutes, 480);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM attendance_events").get().n, 1);
});

test("checkout-only sessions appear as pending and can receive a reasoned missing check-in", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff, { opened: null, minutes: null, status: "review_required" });
  event(db, staff, { action: "check_out", time: "2026-07-03T09:00:00.000Z", review: true });
  let row = (await report(db, owner)).rows[0]; assert.equal(row.pendingExceptionCount, 2); assert.ok(row.hasPayrollData);
  await correctAttendance(db, owner, { sessionId: "session", action: "check_in", adjustedTime: "2026-07-03T01:00:00Z", reason: "Verified missing check-in" });
  await reviewAttendance(db, owner, "event", "approved");
  row = (await report(db, owner)).rows[0]; assert.equal(row.approvedMinutes, 480); assert.equal(row.pendingExceptionCount, 0);
});

test("review decisions are pending-only and both endpoints must be approved", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff, { status: "review_required" }); event(db, staff, { review: true });
  event(db, staff, { id: "out", action: "check_out", time: "2026-07-03T09:00:00Z", review: true });
  await reviewAttendance(db, owner, "event", "approved");
  assert.equal(db.sqlite.prepare("SELECT status FROM attendance_sessions").get().status, "review_required");
  await assert.rejects(reviewAttendance(db, owner, "event", "rejected"), { code: "attendance_conflict" });
  await reviewAttendance(db, owner, "out", "approved");
  assert.equal(db.sqlite.prepare("SELECT status FROM attendance_sessions").get().status, "completed");
});

test("locked payroll blocks corrections; changed source revision blocks stale finalization", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff); event(db, staff);
  const originalBatch = db.batch;
  db.batch = async (statements) => { db.sqlite.exec("UPDATE stores SET workforce_revision = workforce_revision + 1"); return originalBatch(statements); };
  await assert.rejects(changePayrollPeriod(db, owner, "finalize", "2026-07"), { code: "payroll_conflict" });
  db.batch = originalBatch;
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  await assert.rejects(correctAttendance(db, owner, { eventId: "event", adjustedTime: "2026-07-03T02:00:00Z", reason: "Locked correction" }), { code: "attendance_conflict" });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM attendance_corrections").get().n, 0);
});

test("weekly shifts are all-or-nothing, adjacent shifts valid, overlapping concurrent writes rejected", async (t) => {
  const { db, owner, staff } = setup(t);
  await assert.rejects(createShifts(db, owner, staff.email, [shiftInput, shiftInput]), { code: "shift_conflict" });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM shifts").get().n, 0);
  const result = await Promise.allSettled([createShifts(db, owner, staff.email, [shiftInput]), createShifts(db, owner, staff.email, [shiftInput])]);
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
  await createShifts(db, owner, staff.email, [{ ...shiftInput, startsAt: shiftInput.endsAt, endsAt: "2026-07-03T10:00:00Z" }]);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM shifts").get().n, 2);
});

test("shift edits and cancellations enforce revision, role and attendance guard", async (t) => {
  const { db, owner, staff } = setup(t);
  const futureShift = { ...shiftInput, startsAt: "2027-07-03T01:00:00Z", endsAt: "2027-07-03T09:00:00Z" };
  const created = await createShifts(db, owner, staff.email, [futureShift]); const id = created.shifts[0].id;
  await changeShift(db, owner, { id, action: "edit", expectedRevision: 0, ...futureShift, endsAt: "2027-07-03T08:00:00Z" });
  await assert.rejects(changeShift(db, owner, { id, action: "cancel", expectedRevision: 0 }), { code: "shift_conflict" });
  await assert.rejects(changeShift(db, staff, { id, action: "cancel", expectedRevision: 1 }), { status: 403 });
  await changeShift(db, owner, { id, action: "cancel", expectedRevision: 1 });
  assert.equal(db.sqlite.prepare("SELECT status FROM shifts WHERE id = ?").get(id).status, "cancelled");
});

test("structured leave links only the employee's shift, approval updates schedule once", async (t) => {
  const { db, owner, staff } = setup(t);
  const created = await createShifts(db, owner, staff.email, [shiftInput]); const shiftId = created.shifts[0].id;
  const input = { type: "leave", title: "Nghỉ ca", reason: "Có việc gia đình", shiftId, idempotencyKey: "request-key-0001" };
  await assert.rejects(createRequest(db, owner, input), { status: 404 });
  const request = await createRequest(db, staff, input);
  assert.equal((await createRequest(db, staff, input)).request.id, request.request.id);
  const approved = await decideRequest(db, owner, request.request.id, "approved"); assert.ok(approved.coverageWarning);
  assert.equal(db.sqlite.prepare("SELECT approved_leave_request_id FROM shifts").get().approved_leave_request_id, request.request.id);
  assert.equal((await report(db, owner)).rows[0].scheduledMinutes, 0);
  await assert.rejects(decideRequest(db, owner, request.request.id, "rejected"), { code: "request_conflict" });
});

test("payroll adjustments are reasoned/idempotent, survive snapshots and are not doubled after reopen", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff);
  const adjustment = { id: "adjustment-key-0001", period: "2026-07", employeeEmail: staff.email, amount: 50000, reason: "Thưởng hỗ trợ ca" };
  await addPayrollAdjustment(db, owner, adjustment); await addPayrollAdjustment(db, owner, adjustment);
  assert.equal((await report(db, owner)).rows[0].totalSalary, 250000);
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  assert.equal((await report(db, owner)).rows[0].adjustments.length, 1);
  await assert.rejects(addPayrollAdjustment(db, owner, { ...adjustment, id: "adjustment-key-0002" }), { code: "payroll_conflict" });
  await changePayrollPeriod(db, owner, "reopen", "2026-07");
  assert.equal((await report(db, owner)).rows[0].totalSalary, 250000);
  assert.throws(() => db.sqlite.exec("DELETE FROM payroll_adjustments"), /immutable/);
});

test("one capture cannot create multiple events and expired capture deletion preserves event", (t) => {
  const { db, staff } = setup(t); session(db, staff); event(db, staff);
  db.sqlite.prepare("INSERT INTO attendance_capture_sessions (id, employee_email, store_id, action, issued_at, expires_at, nonce_hash) VALUES ('capture', ?, 'store-a', 'check_in', '2026-07-03', '2026-07-04', 'hash')").run(staff.email);
  db.sqlite.exec("UPDATE attendance_events SET capture_session_id = 'capture'");
  assert.throws(() => db.sqlite.prepare("INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, capture_session_id) VALUES ('out', 'session', ?, 'check_out', '2026-07-03', 'other', '[]', 0, 'capture')").run(staff.email), /UNIQUE/);
  db.sqlite.exec("DELETE FROM attendance_capture_sessions");
  assert.equal(db.sqlite.prepare("SELECT capture_session_id FROM attendance_events").get().capture_session_id, null);
});

test("attendance timestamps require explicit timezone", () => {
  assert.throws(() => attendanceTime("2026-07-03T08:00"), { status: 400 });
  assert.equal(attendanceTime("2026-07-03T08:00:00+07:00"), "2026-07-03T01:00:00.000Z");
  assert.throws(() => attendanceTime("2026-02-30T01:00:00Z"), { status: 400 });
});

test("corrections cannot overlap another session and double-count working minutes", async (t) => {
  const { db, owner, staff } = setup(t);
  session(db, staff, { id: "a", opened: "2026-07-03T01:00:00.000Z", closed: "2026-07-03T02:00:00.000Z", minutes: 60 });
  session(db, staff, { id: "b", opened: "2026-07-03T03:00:00.000Z", closed: "2026-07-03T04:00:00.000Z", minutes: 60 });
  await assert.rejects(correctAttendance(db, owner, { sessionId: "a", action: "check_out", adjustedTime: "2026-07-03T03:30:00Z", reason: "Overlapping correction" }), { code: "attendance_conflict" });
  assert.equal((await report(db, owner)).rows[0].approvedMinutes, 120);
  await correctAttendance(db, owner, { sessionId: "a", action: "check_out", adjustedTime: "2026-07-03T03:00:00Z", reason: "Adjacent correction" });
  assert.equal((await report(db, owner)).rows[0].approvedMinutes, 180);
});

test("a locked payroll period rejects new shifts atomically", async (t) => {
  const { db, owner, staff } = setup(t); session(db, staff);
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  await assert.rejects(createShifts(db, owner, staff.email, [shiftInput]), { code: "shift_conflict" });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM shifts").get().n, 0);
});

test("an unresolved session crossing a month blocks finalization in the later month", async (t) => {
  const { db, owner, staff } = setup(t);
  const other = seedEmployee(db, { id: "staff-b", role: "employee" });
  session(db, staff, { id: "open-july", opened: "2026-07-31T16:00:00.000Z", closed: null, minutes: null, status: "open" });
  session(db, other, { id: "august", opened: "2026-08-03T01:00:00.000Z", closed: "2026-08-03T02:00:00.000Z", minutes: 60 });
  const row = (await report(db, owner, "2026-08")).rows.find((item) => item.email === staff.email);
  assert.equal(row.pendingExceptionCount, 1); assert.ok(row.hasPayrollData);
  await assert.rejects(changePayrollPeriod(db, owner, "finalize", "2026-08"), { code: "pending_exceptions" });
});

test("approved leave is excluded from derived absence and planned working minutes", async (t) => {
  const { db, owner, staff } = setup(t);
  const created = await createShifts(db, owner, staff.email, [shiftInput]);
  assert.equal((await report(db, owner)).rows[0].exceptions.filter((item) => item.kind === "absence").length, 1);
  const request = await createRequest(db, staff, { type: "leave", title: "Nghỉ ca", reason: "Việc gia đình", shiftId: created.shifts[0].id, idempotencyKey: "absence-request-key" });
  await decideRequest(db, owner, request.request.id, "approved");
  const row = (await report(db, owner)).rows[0]; assert.equal(row.scheduledMinutes, 0); assert.equal(row.exceptions.filter((item) => item.kind === "absence").length, 0);
});
