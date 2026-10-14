import crypto from "node:crypto";
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

export function seedStore(db, options = "store-a") {
  const opts = typeof options === "string" ? { id: options } : (options ?? {});
  const {
    id = "store-a",
    name = "Test",
    address = "Test",
    latitude = 10,
    longitude = 106,
    timezone = "Asia/Ho_Chi_Minh",
    geofenceRadiusMeters = 100,
    attendanceEnabled = false,
    workforceRevision = 0,
    createdAt = "2026-07-01T00:00:00.000Z",
    updatedAt = "2026-07-01T00:00:00.000Z",
  } = opts;

  db.sqlite.prepare(`
    INSERT INTO stores (id, name, address, timezone, latitude, longitude, geofence_radius_meters, attendance_enabled, workforce_revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, address, timezone, latitude, longitude,
    geofenceRadiusMeters, attendanceEnabled ? 1 : 0, workforceRevision, createdAt, updatedAt
  );
  return { id, name, address, timezone, latitude, longitude };
}

export function seedEmployee(db, {
  id = "owner-a",
  storeId = "store-a",
  role = "owner",
  status = "active",
  email = `${id}@example.test`,
  displayName = id,
  jobTitle = "Barista",
  phone = null,
  startDate = null,
  hourlyRate = 25000,
  monthlySalary = null,
  compensationType = null,
  participatesAttendance = undefined,
  payrollEligible = undefined,
  authUserId = `auth-${id}`,
  mustChangePassword = 0,
  passwordVersion = 0,
  passwordResetPending = 0,
  createdAt = "2026-07-01T00:00:00.000Z",
  updatedAt = "2026-07-01T00:00:00.000Z",
  rateHistory = true,
} = {}) {
  const participates = participatesAttendance !== undefined ? (participatesAttendance ? 1 : 0) : null;
  const eligible = payrollEligible !== undefined ? (payrollEligible ? 1 : 0) : null;
  db.sqlite.prepare(`
    INSERT INTO employees (
      id, store_id, email, display_name, job_title, phone, start_date, auth_user_id,
      must_change_password, password_version, password_reset_pending, role, status,
      participates_attendance, payroll_eligible, compensation_type, hourly_rate, monthly_salary,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, storeId, email, displayName, jobTitle, phone, startDate, authUserId,
    mustChangePassword ? 1 : 0, passwordVersion, passwordResetPending ? 1 : 0,
    role, status, participates, eligible,
    compensationType, hourlyRate, monthlySalary, createdAt, updatedAt
  );
  if (rateHistory !== false && (hourlyRate !== null || monthlySalary !== null)) {
    try {
      db.sqlite.prepare(`
        INSERT INTO employee_rate_history (id, store_id, employee_email, compensation_type, hourly_rate, monthly_salary, effective_from, effective_to, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z', NULL, 'system', ?)
      `).run(`rate-${id}`, storeId, email, compensationType || "hourly", hourlyRate, monthlySalary, createdAt);
    } catch {
      // Ignore if table not yet initialized or already exists
    }
  }
  return { id, storeId, role, status, email, displayName, hourlyRate, authUserId };
}

export function seedRateHistory(db, {
  id = `rate-${crypto.randomUUID()}`,
  storeId = "store-a",
  employeeEmail = "staff@example.test",
  compensationType = "hourly",
  hourlyRate = 25000,
  monthlySalary = null,
  effectiveFrom = "2026-01-01T00:00:00.000Z",
  effectiveTo = null,
  createdBy = "system",
  createdAt = new Date().toISOString(),
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO employee_rate_history (id, store_id, employee_email, compensation_type, hourly_rate, monthly_salary, effective_from, effective_to, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, employeeEmail, compensationType, hourlyRate, monthlySalary, effectiveFrom, effectiveTo, createdBy, createdAt);
  return { id, storeId, employeeEmail, compensationType, hourlyRate, monthlySalary, effectiveFrom, effectiveTo };
}

export function seedAttendanceRules(db, storeId = "store-a", options = {}) {
  const {
    version = 1,
    id = `rules-${storeId}-v${version}`,
    earlyCheckinMinutes = 15,
    lateMinutes = 5,
    earlyDepartureMinutes = 5,
    absenceMinutes = 60,
    missingCheckoutMinutes = 240,
    evidenceRetentionDays = 90,
    active = 1,
    createdBy = "system",
    createdAt = "2026-07-01T00:00:00.000Z",
  } = options;

  db.sqlite.prepare(`
    INSERT INTO attendance_rules (
      id, store_id, version, early_checkin_minutes, late_minutes, early_departure_minutes,
      absence_minutes, missing_checkout_minutes, evidence_retention_days, active, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, storeId, version, earlyCheckinMinutes, lateMinutes, earlyDepartureMinutes,
    absenceMinutes, missingCheckoutMinutes, evidenceRetentionDays, active ? 1 : 0, createdBy, createdAt
  );
  return { id, storeId, version };
}

export function seedShift(db, {
  storeId = "store-a",
  id = `shift-${crypto.randomUUID()}`,
  employeeEmail,
  startsAt = "2026-07-03T01:00:00.000Z",
  endsAt = "2026-07-03T09:00:00.000Z",
  roleLabel = "Barista",
  timezoneSnapshot = "Asia/Ho_Chi_Minh",
  isShiftLead = 0,
  status = "published",
  revision = 0,
  approvedLeaveRequestId = null,
  createdAt = "2026-07-01T00:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO shifts (id, store_id, employee_email, starts_at, ends_at, role_label, timezone_snapshot, is_shift_lead, status, revision, approved_leave_request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, storeId, employeeEmail, startsAt, endsAt, roleLabel, timezoneSnapshot,
    isShiftLead ? 1 : 0, status, revision, approvedLeaveRequestId, createdAt
  );
  return { id, storeId, employeeEmail, startsAt, endsAt, roleLabel, status, revision, approvedLeaveRequestId };
}

export function seedAttendanceSession(db, {
  storeId = "store-a",
  id = `session-${crypto.randomUUID()}`,
  employeeEmail,
  shiftId = null,
  ruleVersionId = null,
  status = "completed",
  openedAt = "2026-07-03T01:00:00.000Z",
  closedAt = "2026-07-03T09:00:00.000Z",
  workedMinutes = 480,
  revision = 0,
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO attendance_sessions (id, store_id, employee_email, shift_id, rule_version_id, status, opened_at, closed_at, worked_minutes, revision)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, employeeEmail, shiftId, ruleVersionId, status, openedAt, closedAt, workedMinutes, revision);
  return { id, storeId, employeeEmail, shiftId, ruleVersionId, status, openedAt, closedAt, workedMinutes, revision };
}

export function seedAttendanceEvent(db, {
  id = `event-${crypto.randomUUID()}`,
  sessionId,
  employeeEmail,
  action = "check_in",
  recordedAt = "2026-07-03T01:00:00.000Z",
  idempotencyKey = id,
  verificationResults = "[]",
  reviewRequired = 0,
  photoStatus = "stored",
  captureSessionId = null,
  exceptionReason = null,
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status, capture_session_id, exception_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, employeeEmail, action, recordedAt, idempotencyKey, verificationResults, reviewRequired ? 1 : 0, photoStatus, captureSessionId, exceptionReason);
  return { id, sessionId, employeeEmail, action, recordedAt, idempotencyKey, reviewRequired, photoStatus };
}

export function seedPayrollPeriod(db, {
  storeId = "store-a",
  periodKey = "2026-07",
  id = `period-${storeId}-${periodKey}`,
  periodStart = "2026-06-30T17:00:00.000Z",
  periodEnd = "2026-07-31T17:00:00.000Z",
  status = "reviewing",
  finalizedBy = null,
  finalizedAt = null,
  reopenedBy = null,
  reopenedAt = null,
  createdAt = "2026-07-01T00:00:00.000Z",
  updatedAt = "2026-07-01T00:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO payroll_periods (id, store_id, period_start, period_end, status, finalized_by, finalized_at, reopened_by, reopened_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, periodStart, periodEnd, status, finalizedBy, finalizedAt, reopenedBy, reopenedAt, createdAt, updatedAt);
  return { id, storeId, periodKey, periodStart, periodEnd, status };
}

export function seedRequest(db, {
  storeId = "store-a",
  id = `req-${crypto.randomUUID()}`,
  employeeEmail,
  type = "leave",
  title = "Đơn yêu cầu kiểm thử",
  reason = "Lý do kiểm thử",
  status = "pending",
  reviewerEmail = null,
  reviewedAt = null,
  shiftId = null,
  startsAt = null,
  endsAt = null,
  clientRequestKey = null,
  createdAt = "2026-07-01T00:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, reviewer_email, reviewed_at, shift_id, starts_at, ends_at, client_request_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, employeeEmail, type, title, reason, status, reviewerEmail, reviewedAt, shiftId, startsAt, endsAt, clientRequestKey, createdAt);
  return { id, storeId, employeeEmail, type, status, title, reason, shiftId };
}

export function seedHandover(db, {
  storeId = "store-a",
  id = `ho-${crypto.randomUUID()}`,
  authorEmail,
  summary = "Biên bản bàn giao ca kiểm thử",
  managerAttention = 0,
  acknowledgedAt = null,
  createdAt = "2026-07-01T14:00:00.000Z",
} = {}) {
  db.sqlite.prepare(`
    INSERT INTO handovers (id, store_id, author_email, summary, manager_attention, acknowledged_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, storeId, authorEmail, summary, managerAttention ? 1 : 0, acknowledgedAt, createdAt);
  return { id, storeId, authorEmail, summary, managerAttention, acknowledgedAt };
}
