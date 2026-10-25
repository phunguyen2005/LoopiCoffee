import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { calculateHourlyPay } from "../modules/payroll/domain/calculate-hourly-pay.ts";
import { sanitizeSpreadsheetText } from "../modules/payroll/domain/export-safety.ts";
import { loadPayrollReport } from "../modules/payroll/application/load-report.ts";
import { changePayrollPeriod } from "../modules/payroll/application/change-period.ts";
import { restoreHistoricalHourlyRate } from "../modules/payroll/application/restore-rate-history.ts";
import { createDatabase, seedAttendanceSession, seedEmployee, seedRateHistory, seedShift, seedStore } from "./helpers/database.mjs";

function setup(t, storeId = "store-pay") {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, storeId);
  const owner = seedEmployee(db, { id: `owner-${storeId}`, storeId, role: "owner", compensationType: "none", hourlyRate: 0, payrollEligible: false });
  const staff = seedEmployee(db, { id: `staff-${storeId}`, storeId, role: "employee", hourlyRate: 25000, compensationType: "hourly", rateHistory: false });
  return { db, owner, staff, storeId };
}

test("PAY-001/PAY-004 splits one approved session at an in-session rate boundary after the 15-minute floor", () => {
  const calculation = calculateHourlyPay([
    { sessionId: "session-a", startAt: "2026-07-15T00:00:00.000Z", endAt: "2026-07-15T01:00:00.000Z" },
  ], [
    { hourlyRate: 20000, effectiveFrom: "2026-07-01T00:00:00.000Z", effectiveTo: "2026-07-15T00:30:00.000Z" },
    { hourlyRate: 30000, effectiveFrom: "2026-07-15T00:30:00.000Z", effectiveTo: null },
  ]);

  assert.equal(calculation.payableMinutes, 60);
  assert.equal(calculation.missingRateMinutes, 0);
  assert.deepEqual(calculation.segments.map((segment) => [segment.minutes, segment.hourlyRate]), [[30, 20000], [30, 30000]]);
  assert.equal(calculation.baseSalaryExact, 25000);
});

test("PAY-001 floors the approved session once before allocating its rate segments", () => {
  const calculation = calculateHourlyPay([
    { sessionId: "session-floor", startAt: "2026-07-15T00:00:00.000Z", endAt: "2026-07-15T00:20:00.000Z" },
  ], [
    { hourlyRate: 12000, effectiveFrom: "2026-07-01T00:00:00.000Z", effectiveTo: "2026-07-15T00:10:00.000Z" },
    { hourlyRate: 24000, effectiveFrom: "2026-07-15T00:10:00.000Z", effectiveTo: null },
  ]);

  assert.equal(calculation.payableMinutes, 15);
  assert.deepEqual(calculation.segments.map((segment) => [segment.minutes, segment.hourlyRate]), [[10, 12000], [5, 24000]]);
  assert.equal(calculation.baseSalaryExact, 4000);
});

test("PAY-001 clips linked attendance to the shift before calculating payable minutes", async (t) => {
  const { db, owner, staff, storeId } = setup(t, "store-clip");
  seedRateHistory(db, { id: "rate-clip", storeId, employeeEmail: staff.email, hourlyRate: 25000, effectiveFrom: "2026-01-01T00:00:00.000Z" });
  const shift = seedShift(db, { id: "shift-clip-pay", storeId, employeeEmail: staff.email, startsAt: "2026-07-03T01:00:00.000Z", endsAt: "2026-07-03T05:00:00.000Z" });
  seedAttendanceSession(db, { id: "session-clip-pay", storeId, employeeEmail: staff.email, shiftId: shift.id, openedAt: "2026-07-03T00:50:00.000Z", closedAt: "2026-07-03T05:10:00.000Z", workedMinutes: 260 });

  const report = await loadPayrollReport(db, { storeId, actorEmail: owner.email, actorRole: owner.role, periodKey: "2026-07" });
  const row = report.rows.find((item) => item.email === staff.email);
  assert.ok(row);
  assert.equal(row.recordedMinutes, 260);
  assert.equal(row.approvedMinutes, 240);
  assert.equal(row.payableMinutes, 240);
  assert.equal(row.overtimeMinutes, 0);
  assert.equal(row.totalSalary, 100000);
});

test("PAY-005 rounds only the employee period total to 1.000 VND", async (t) => {
  const { db, owner, staff, storeId } = setup(t, "store-round");
  seedRateHistory(db, { id: "rate-round", storeId, employeeEmail: staff.email, hourlyRate: 1001, effectiveFrom: "2026-01-01T00:00:00.000Z" });
  seedAttendanceSession(db, { id: "round-a", storeId, employeeEmail: staff.email, openedAt: "2026-07-03T01:00:00.000Z", closedAt: "2026-07-03T01:15:00.000Z", workedMinutes: 15 });
  seedAttendanceSession(db, { id: "round-b", storeId, employeeEmail: staff.email, openedAt: "2026-07-04T01:00:00.000Z", closedAt: "2026-07-04T01:15:00.000Z", workedMinutes: 15 });

  const row = (await loadPayrollReport(db, { storeId, actorEmail: owner.email, actorRole: owner.role, periodKey: "2026-07" })).rows.find((item) => item.email === staff.email);
  assert.ok(row);
  assert.equal(row.baseSalary, 501);
  assert.equal(row.totalSalary, 1000);
});

test("PAY-006 blocks finalization when rate history has a gap inside payable work", async (t) => {
  const { db, owner, staff, storeId } = setup(t, "store-gap");
  seedRateHistory(db, { id: "rate-gap", storeId, employeeEmail: staff.email, hourlyRate: 20000, effectiveFrom: "2026-07-03T01:00:00.000Z", effectiveTo: "2026-07-03T01:30:00.000Z" });
  seedAttendanceSession(db, { id: "session-gap", storeId, employeeEmail: staff.email, openedAt: "2026-07-03T01:00:00.000Z", closedAt: "2026-07-03T02:00:00.000Z", workedMinutes: 60 });

  const row = (await loadPayrollReport(db, { storeId, actorEmail: owner.email, actorRole: owner.role, periodKey: "2026-07" })).rows.find((item) => item.email === staff.email);
  assert.ok(row);
  assert.equal(row.missingRateMinutes, 30);
  await assert.rejects(changePayrollPeriod(db, owner, "finalize", "2026-07"), { code: "pay_rate_required" });
});

test("PAY-006 lets only OWNER restore a justified historical rate and records audit", async (t) => {
  const { db, owner, staff, storeId } = setup(t, "store-restore");
  const manager = seedEmployee(db, { id: "manager-restore", storeId, role: "manager", compensationType: "none", hourlyRate: 0, payrollEligible: false });
  seedAttendanceSession(db, { id: "session-restore", storeId, employeeEmail: staff.email, openedAt: "2026-07-03T01:00:00.000Z", closedAt: "2026-07-03T02:00:00.000Z", workedMinutes: 60 });
  const input = {
    id: "restore-rate-key-0001",
    employeeEmail: staff.email,
    hourlyRate: 25000,
    effectiveFrom: "2026-07-03T01:00:00.000Z",
    effectiveTo: "2026-07-03T02:00:00.000Z",
    reason: "Đối chiếu hợp đồng lương đã ký",
  };
  const revisionBefore = db.sqlite.prepare("SELECT workforce_revision FROM stores WHERE id = ?").get(storeId).workforce_revision;

  await assert.rejects(restoreHistoricalHourlyRate(db, manager, input), { status: 403 });
  const restored = await restoreHistoricalHourlyRate(db, owner, input);
  assert.equal(restored.replayed, false);
  assert.equal((await restoreHistoricalHourlyRate(db, owner, input)).replayed, true);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'payroll.rate_history_restored'").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT workforce_revision FROM stores WHERE id = ?").get(storeId).workforce_revision, revisionBefore + 1);
  const finalized = await changePayrollPeriod(db, owner, "finalize", "2026-07");
  assert.equal(finalized.status, "finalized");
});

test("PAY-006 export text neutralizes spreadsheet formulas after leading whitespace", () => {
  for (const value of ["=1+1", " +SUM(A1:A2)", "\t@cmd", "-2+3"]) {
    assert.ok(sanitizeSpreadsheetText(value).startsWith("'"), value);
  }
  assert.equal(sanitizeSpreadsheetText("Nguyễn Văn A"), "Nguyễn Văn A");
});

test("payroll UI separates read, finalize, reopen and export capabilities", () => {
  const route = readFileSync(new URL("../app/api/reports/attendance/route.ts", import.meta.url), "utf8");
  const view = readFileSync(new URL("../components/payroll-reports-view.tsx", import.meta.url), "utf8");
  assert.match(route, /canFinalizePayroll,/);
  assert.match(route, /canReopenPayroll:\s*auth\.actor\.role === "owner"/);
  assert.match(route, /canExportReports/);
  assert.match(route, /canRestoreRateHistory/);
  assert.match(view, /report\?\.canFinalizePayroll/);
  assert.match(view, /report\?\.canReopenPayroll/);
  assert.match(view, /report\?\.canExportReports/);
});
