import type { PayrollPeriod, PayrollException, PayrollReportRow } from "../contracts/report.ts";
import { resolvePayrollPeriod } from "../domain/period.ts";
import { loadLockedRows } from "./locked-report.ts";

type LoadOptions = {
  storeId: string;
  actorEmail: string;
  actorRole: string;
  periodKey?: string | null;
};

type AggregateRow = {
  display_name: string;
  email: string;
  role: string;
  job_title: string;
  compensation_type: PayrollReportRow["compensationType"];
  payroll_eligible: number;
  hourly_rate: number;
  monthly_salary: number;
  scheduled_minutes: number;
  recorded_minutes: number;
  approved_minutes: number;
  shift_count: number;
  late_count: number;
  early_leave_count: number;
  exception_count: number;
  pending_exception_count: number;
};

type PayrollEntryRow = {
  employee_email: string;
  approved_minutes: number;
  overtime_minutes: number;
  allowance_amount: number;
  bonus_amount: number;
  deduction_amount: number;
  total_amount: number;
  status: PayrollReportRow["status"];
};

type EventExceptionRow = {
  id: string;
  employee_email: string;
  recorded_at: string;
  verification_results: string;
  exception_reason: string | null;
  review_required: number;
  status: "pending" | "approved" | "rejected" | null;
  employee_reason: string | null;
  reviewer_email: string | null;
  reviewer_note: string | null;
};

type SessionExceptionRow = {
  id: string;
  employee_email: string;
  opened_at: string;
  closed_at: string | null;
  worked_minutes: number | null;
  revision: number;
  shift_ends_at: string | null;
  missing_checkout_minutes: number | null;
};

export async function loadPayrollReport(db: D1Database, options: LoadOptions) {
  const period = resolvePayrollPeriod(options.periodKey);
  const ownOnly = options.actorRole === "employee" ? "AND lower(e.email) = lower(?)" : "";

  const store = await db.prepare("SELECT name, timezone, workforce_revision FROM stores WHERE id = ?")
    .bind(options.storeId)
    .first<{ name: string; timezone: string; workforce_revision: number }>();
  const payrollPeriod = await db.prepare(
    `SELECT id, status, finalized_at, finalized_by, updated_at
     FROM payroll_periods WHERE store_id = ? AND period_start = ? AND period_end = ? LIMIT 1`,
  ).bind(options.storeId, period.startIso, period.endExclusiveIso).first<{
    id: string;
    status: "reviewing" | "finalized" | "paid";
    finalized_at: string | null;
    finalized_by: string | null;
    updated_at: string;
  }>();

  if (payrollPeriod?.status === "finalized" || payrollPeriod?.status === "paid") {
    const rows = await loadLockedRows(db, payrollPeriod.id, options.actorRole === "employee" ? options.actorEmail : undefined);
    return {
      period, sourceRevision: store?.workforce_revision ?? 0, storeName: store?.name ?? "Cửa hàng", timezone: store?.timezone ?? "Asia/Ho_Chi_Minh",
      generatedAt: new Date().toISOString(), dataThrough: payrollPeriod.finalized_at ?? period.endExclusiveIso,
      periodStatus: payrollPeriod.status, finalizedAt: payrollPeriod.finalized_at, finalizedBy: payrollPeriod.finalized_by, rows,
    };
  }

  const aggregate = await db.prepare(
    `WITH period_window AS (SELECT ? AS start_at, ? AS end_at),
     session_data AS (
       SELECT s.*, CAST(MAX(0, (julianday(MIN(s.closed_at, p.end_at)) - julianday(MAX(s.opened_at, p.start_at))) * 1440 + 0.000001) AS INTEGER) AS clipped_minutes
       FROM attendance_sessions s CROSS JOIN period_window p
     ), event_flags AS (
       SELECT s.id AS session_id,
              COUNT(DISTINCT CASE WHEN ev.review_required = 1 OR ex.id IS NOT NULL THEN ev.id END) AS event_exception_count,
              COUNT(DISTINCT CASE WHEN ev.review_required = 1 AND COALESCE(ex.status, 'pending') = 'pending' THEN ev.id END) AS pending_exception_count,
              COUNT(DISTINCT CASE WHEN ex.status = 'rejected' THEN ev.id END) AS rejected_exception_count,
              COUNT(DISTINCT CASE WHEN ev.verification_results LIKE '%"late"%' THEN ev.id END) AS late_count,
              COUNT(DISTINCT CASE WHEN ev.verification_results LIKE '%"early_departure"%' THEN ev.id END) AS early_leave_count
       FROM attendance_sessions s
       LEFT JOIN attendance_events ev ON ev.session_id = s.id
       LEFT JOIN attendance_exceptions ex ON ex.event_id = ev.id
       WHERE s.store_id = ?
         AND COALESCE(s.opened_at, s.closed_at) < ?
         AND COALESCE(s.closed_at, '9999-12-31T23:59:59.999Z') >= ?
       GROUP BY s.id
     ), attendance_rollup AS (
       SELECT lower(s.employee_email) AS email,
              COUNT(DISTINCT s.id) AS shift_count,
              COALESCE(SUM(CASE
                WHEN s.closed_at IS NOT NULL AND s.worked_minutes BETWEEN 0 AND 1440 THEN s.clipped_minutes
                ELSE 0 END), 0) AS recorded_minutes,
              COALESCE(SUM(CASE
                WHEN s.closed_at IS NOT NULL
                  AND s.worked_minutes BETWEEN 0 AND 720
                  AND s.status = 'completed'
                  AND COALESCE(f.pending_exception_count, 0) = 0
                  AND COALESCE(f.rejected_exception_count, 0) = 0
                THEN s.clipped_minutes ELSE 0 END), 0) AS approved_minutes,
              COALESCE(SUM(COALESCE(f.event_exception_count, 0) + CASE
                WHEN s.opened_at IS NULL OR s.closed_at IS NULL OR s.worked_minutes IS NULL OR s.worked_minutes < 0 OR s.worked_minutes > 720 THEN 1
                ELSE 0 END), 0) AS exception_count,
              COALESCE(SUM(COALESCE(f.pending_exception_count, 0) + CASE
                WHEN s.opened_at IS NULL OR s.closed_at IS NULL OR s.worked_minutes IS NULL OR s.worked_minutes < 0 OR s.worked_minutes > 720 THEN 1
                ELSE 0 END), 0) AS pending_exception_count,
              COALESCE(SUM(f.late_count), 0) AS late_count,
              COALESCE(SUM(f.early_leave_count), 0) AS early_leave_count
       FROM session_data s
       LEFT JOIN event_flags f ON f.session_id = s.id
       WHERE s.store_id = ?
         AND COALESCE(s.opened_at, s.closed_at) < ?
         AND COALESCE(s.closed_at, '9999-12-31T23:59:59.999Z') >= ?
       GROUP BY lower(s.employee_email)
     ), schedule_rollup AS (
       SELECT lower(employee_email) AS email,
              COALESCE(SUM(CASE
                WHEN julianday(MIN(ends_at, ?)) > julianday(MAX(starts_at, ?))
                THEN CAST(ROUND((julianday(MIN(ends_at, ?)) - julianday(MAX(starts_at, ?))) * 1440) AS INTEGER)
                ELSE 0 END), 0) AS scheduled_minutes
       FROM shifts
       WHERE store_id = ? AND status != 'cancelled' AND approved_leave_request_id IS NULL AND starts_at < ? AND ends_at > ?
       GROUP BY lower(employee_email)
     )
     SELECT e.display_name, e.email, e.role, COALESCE(e.job_title, 'Nhân viên') AS job_title,
            COALESCE(e.compensation_type, CASE WHEN e.role IN ('owner', 'system_admin') THEN 'none' ELSE 'hourly' END) AS compensation_type,
            COALESCE(e.payroll_eligible, CASE WHEN e.role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) AS payroll_eligible,
            COALESCE(e.hourly_rate, 0) AS hourly_rate,
            COALESCE(e.monthly_salary, 0) AS monthly_salary,
            COALESCE(sc.scheduled_minutes, 0) AS scheduled_minutes,
            COALESCE(a.recorded_minutes, 0) AS recorded_minutes,
            COALESCE(a.approved_minutes, 0) AS approved_minutes,
            COALESCE(a.shift_count, 0) AS shift_count,
            COALESCE(a.late_count, 0) AS late_count,
            COALESCE(a.early_leave_count, 0) AS early_leave_count,
            COALESCE(a.exception_count, 0) AS exception_count,
            COALESCE(a.pending_exception_count, 0) AS pending_exception_count
     FROM employees e
     LEFT JOIN attendance_rollup a ON a.email = lower(e.email)
     LEFT JOIN schedule_rollup sc ON sc.email = lower(e.email)
     WHERE e.store_id = ? AND (
       (e.status = 'active' AND COALESCE(e.participates_attendance, CASE WHEN e.role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) = 1)
       OR a.shift_count > 0 OR sc.scheduled_minutes > 0
       OR EXISTS (SELECT 1 FROM payroll_adjustments pa WHERE pa.store_id = e.store_id AND lower(pa.employee_email) = lower(e.email) AND pa.period_key = ?)
     )
       ${ownOnly}
     ORDER BY e.display_name`,
  ).bind(
    period.startIso, period.endExclusiveIso,
    options.storeId, period.endExclusiveIso, period.startIso,
    options.storeId, period.endExclusiveIso, period.startIso,
    period.endExclusiveIso, period.startIso, period.endExclusiveIso, period.startIso,
    options.storeId, period.endExclusiveIso, period.startIso,
    options.storeId,
    period.key,
    ...(options.actorRole === "employee" ? [options.actorEmail] : []),
  ).all<AggregateRow>();

  const entryMap = new Map<string, PayrollEntryRow>();
  if (payrollPeriod) {
    const entries = await db.prepare(
      `SELECT employee_email, approved_minutes, overtime_minutes, allowance_amount,
              bonus_amount, deduction_amount, total_amount, status
       FROM payroll_entries WHERE payroll_period_id = ?`,
    ).bind(payrollPeriod.id).all<PayrollEntryRow>();
    entries.results.forEach((entry: PayrollEntryRow) => entryMap.set(entry.employee_email.toLowerCase(), entry));
  }

  const exceptions = await loadPeriodExceptions(db, options.storeId, period);
  const adjustments = await db.prepare(
    "SELECT id, employee_email, amount, reason, actor_email, created_at FROM payroll_adjustments WHERE store_id = ? AND period_key = ? ORDER BY created_at, id",
  ).bind(options.storeId, period.key).all<{ id: string; employee_email: string; amount: number; reason: string; actor_email: string; created_at: string }>();
  const exceptionMap = new Map<string, PayrollException[]>();
  for (const exception of exceptions) {
    const key = exception.employeeEmail.toLowerCase();
    exceptionMap.set(key, [...(exceptionMap.get(key) ?? []), exception]);
  }

  const rows: PayrollReportRow[] = aggregate.results.map((row: AggregateRow) => {
    const entry = entryMap.get(row.email.toLowerCase());
    const approvedMinutes = row.approved_minutes;
    const overtimeMinutes = Math.max(0, approvedMinutes - row.scheduled_minutes);
    const employeeAdjustments = adjustments.results.filter((adjustment) => adjustment.employee_email.toLowerCase() === row.email.toLowerCase());
    const allowanceAmount = 0;
    const bonusAmount = employeeAdjustments.reduce((total, item) => total + Math.max(0, item.amount), 0);
    const deductionAmount = employeeAdjustments.reduce((total, item) => total + Math.max(0, -item.amount), 0);
    const baseSalary = row.compensation_type === "hourly" ? Math.round((approvedMinutes / 60) * row.hourly_rate) : 0;
    // Basic hourly payroll only. Any additional payment needs an explicit reasoned adjustment.
    const overtimePay = 0;
    const calculatedTotal = Math.max(0, baseSalary + overtimePay + allowanceAmount + bonusAmount - deductionAmount);
    const status: PayrollReportRow["status"] = row.pending_exception_count > 0
      ? "exception" : approvedMinutes > 0 ? "attendance_approved" : "unchecked";
    return {
      displayName: row.display_name,
      email: row.email,
      role: row.role,
      jobTitle: row.job_title,
      compensationType: row.compensation_type,
      includeInPayroll: Boolean(row.payroll_eligible) && row.compensation_type !== "none",
      hasPayrollData: row.compensation_type === "monthly" || row.scheduled_minutes > 0 || row.recorded_minutes > 0 || row.pending_exception_count > 0 || employeeAdjustments.length > 0 || Boolean(entry),
      hourlyRate: row.hourly_rate,
      monthlySalary: row.monthly_salary,
      scheduledMinutes: row.scheduled_minutes,
      recordedMinutes: row.recorded_minutes,
      approvedMinutes,
      overtimeMinutes,
      shiftCount: row.shift_count,
      lateCount: row.late_count,
      earlyLeaveCount: row.early_leave_count,
      exceptionCount: row.exception_count + (exceptionMap.get(row.email.toLowerCase()) ?? []).filter((item) => item.kind === "absence").length,
      pendingExceptionCount: row.pending_exception_count,
      allowanceAmount,
      bonusAmount,
      deductionAmount,
      baseSalary,
      overtimePay,
      totalSalary: calculatedTotal,
      status,
      exceptions: exceptionMap.get(row.email.toLowerCase()) ?? [],
      adjustments: employeeAdjustments.map((item) => ({ id: item.id, amount: item.amount, reason: item.reason, actorEmail: item.actor_email, createdAt: item.created_at })),
    };
  });

  const now = new Date();
  const end = new Date(period.endExclusiveIso);
  const dataThrough = new Date(Math.min(now.getTime(), end.getTime() - 1));
  return {
    period,
    sourceRevision: store?.workforce_revision ?? 0,
    storeName: store?.name ?? "Cửa hàng",
    timezone: store?.timezone ?? "Asia/Ho_Chi_Minh",
    generatedAt: now.toISOString(),
    dataThrough: dataThrough.toISOString(),
    periodStatus: payrollPeriod?.status ?? "reviewing",
    finalizedAt: payrollPeriod?.finalized_at ?? null,
    finalizedBy: payrollPeriod?.finalized_by ?? null,
    rows,
  };
}

async function loadPeriodExceptions(db: D1Database, storeId: string, period: PayrollPeriod) {
  const eventResult = await db.prepare(
    `SELECT ev.id, s.employee_email, ev.recorded_at, ev.verification_results,
            ev.exception_reason, ev.review_required, ex.status, ex.employee_reason,
            ex.reviewer_email, ex.reviewer_note
     FROM attendance_events ev
     JOIN attendance_sessions s ON s.id = ev.session_id
     LEFT JOIN attendance_exceptions ex ON ex.event_id = ev.id
     WHERE s.store_id = ? AND COALESCE(s.opened_at, s.closed_at) < ? AND COALESCE(s.closed_at, '9999-12-31T23:59:59.999Z') >= ?
       AND (ev.review_required = 1 OR ex.id IS NOT NULL)
     ORDER BY ev.recorded_at DESC`,
  ).bind(storeId, period.endExclusiveIso, period.startIso).all<EventExceptionRow>();

  const sessionResult = await db.prepare(
    `SELECT s.id, s.employee_email, s.opened_at, s.closed_at, s.worked_minutes, s.revision,
            sh.ends_at AS shift_ends_at, r.missing_checkout_minutes
     FROM attendance_sessions s LEFT JOIN shifts sh ON sh.id = s.shift_id
     LEFT JOIN attendance_rules r ON r.id = s.rule_version_id
     WHERE s.store_id = ? AND COALESCE(s.opened_at, s.closed_at) < ? AND COALESCE(s.closed_at, '9999-12-31T23:59:59.999Z') >= ?
       AND (s.opened_at IS NULL OR s.closed_at IS NULL OR s.worked_minutes IS NULL OR s.worked_minutes < 0 OR s.worked_minutes > 720)
     ORDER BY s.opened_at DESC`,
  ).bind(storeId, period.endExclusiveIso, period.startIso).all<SessionExceptionRow>();

  const eventExceptions: PayrollException[] = eventResult.results.map((row: EventExceptionRow) => {
    const verification = safeJsonArray(row.verification_results);
    return {
      id: row.id,
      employeeEmail: row.employee_email,
      occurredAt: row.recorded_at,
      kind: "attendance",
      title: row.exception_reason || describeVerification(verification),
      status: row.status ?? (row.review_required ? "pending" : "approved"),
      reviewerEmail: row.reviewer_email,
      reviewerNote: row.reviewer_note,
      employeeReason: row.employee_reason,
      canReview: Boolean(row.review_required) && (row.status ?? "pending") === "pending",
    };
  });
  const sessionExceptions: PayrollException[] = sessionResult.results.map((row: SessionExceptionRow) => ({
    id: `session:${row.id}`,
    employeeEmail: row.employee_email,
    occurredAt: row.opened_at ?? row.closed_at!,
    kind: row.closed_at ? "duration" : "missing_checkout",
    title: !row.opened_at ? "Thiếu chấm vào ca." : row.closed_at
      ? `Ca làm kéo dài ${formatMinutesText(row.worked_minutes ?? 0)}, vượt ngưỡng 12 giờ.`
      : Date.now() > Date.parse(row.shift_ends_at ?? row.opened_at) + (row.shift_ends_at ? (row.missing_checkout_minutes ?? 180) : 720) * 60_000
        ? "Thiếu chấm ra sau hạn cho phép. Cần đối soát giờ ra."
        : "Ca đang mở, chưa thể đưa vào kỳ lương đã chốt.",
    status: "pending",
    reviewerEmail: null,
    reviewerNote: null,
    employeeReason: null,
    canReview: false,
    sessionId: row.id,
    revision: row.revision,
    correctionAction: !row.opened_at ? "check_in" : "check_out",
  }));
  const absentShifts = await db.prepare(
    `SELECT sh.id, sh.employee_email, sh.starts_at FROM shifts sh
     WHERE sh.store_id = ? AND sh.status = 'published' AND sh.approved_leave_request_id IS NULL
       AND sh.starts_at >= ? AND sh.starts_at < ?
       AND julianday(sh.starts_at) + COALESCE((SELECT absence_minutes FROM attendance_rules r WHERE r.store_id = sh.store_id AND r.active = 1 ORDER BY version DESC LIMIT 1), 60) / 1440.0 < julianday(?)
       AND NOT EXISTS (SELECT 1 FROM attendance_sessions s WHERE s.shift_id = sh.id AND s.opened_at IS NOT NULL)`,
  ).bind(storeId, period.startIso, period.endExclusiveIso, new Date().toISOString()).all<{ id: string; employee_email: string; starts_at: string }>();
  const absences: PayrollException[] = absentShifts.results.map((shift) => ({ id: `shift:${shift.id}`, employeeEmail: shift.employee_email, occurredAt: shift.starts_at, kind: "absence", title: "Chưa có chấm vào sau hạn vắng mặt; ca không có giờ công để tính lương.", status: "informational", reviewerEmail: null, reviewerNote: null, employeeReason: null, canReview: false }));
  return [...eventExceptions, ...sessionExceptions, ...absences];
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function describeVerification(verification: string[]) {
  if (verification.includes("late")) return "Đi muộn so với ngưỡng của ca làm.";
  if (verification.includes("early_departure")) return "Về sớm trước ngưỡng cho phép.";
  if (verification.includes("no_assigned_shift")) return "Không tìm thấy ca được phân công phù hợp.";
  if (verification.includes("outside_shift_window")) return "Chấm công ngoài khung giờ của ca.";
  if (verification.includes("location_unavailable")) return "Không có vị trí chấm công hợp lệ.";
  if (verification.includes("camera_unavailable")) return "Không có ảnh xác minh chấm công.";
  return "Phiên chấm công cần quản lý kiểm tra.";
}

function formatMinutesText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}
