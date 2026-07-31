export type PayrollPeriod = {
  key: string;
  startIso: string;
  endExclusiveIso: string;
  startDate: string;
  endDate: string;
  label: string;
};

export type PayrollException = {
  id: string;
  employeeEmail: string;
  occurredAt: string;
  kind: "attendance" | "duration" | "missing_checkout";
  title: string;
  status: "pending" | "approved" | "rejected";
  reviewerEmail: string | null;
  reviewerNote: string | null;
  employeeReason: string | null;
  canReview: boolean;
};

export type PayrollReportRow = {
  displayName: string;
  email: string;
  role: string;
  jobTitle: string;
  compensationType: "hourly" | "monthly" | "shift" | "none";
  includeInPayroll: boolean;
  hourlyRate: number;
  monthlySalary: number;
  scheduledMinutes: number;
  recordedMinutes: number;
  approvedMinutes: number;
  overtimeMinutes: number;
  shiftCount: number;
  lateCount: number;
  earlyLeaveCount: number;
  exceptionCount: number;
  pendingExceptionCount: number;
  allowanceAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  baseSalary: number;
  overtimePay: number;
  totalSalary: number;
  status: "unchecked" | "exception" | "attendance_approved" | "payroll_finalized" | "paid";
  exceptions: PayrollException[];
};

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

export async function loadPayrollReport(db: D1Database, options: LoadOptions) {
  const period = resolvePayrollPeriod(options.periodKey);
  const ownOnly = options.actorRole === "employee" ? "AND lower(e.email) = lower(?)" : "";
  const bindings = [
    options.storeId,
    period.startIso,
    period.endExclusiveIso,
    options.storeId,
    period.startIso,
    period.endExclusiveIso,
    options.storeId,
    ...(options.actorRole === "employee" ? [options.actorEmail] : []),
  ];

  const aggregate = await db.prepare(
    `WITH event_flags AS (
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
         AND s.opened_at < ?
         AND COALESCE(s.closed_at, s.opened_at) >= ?
       GROUP BY s.id
     ), attendance_rollup AS (
       SELECT lower(s.employee_email) AS email,
              COUNT(DISTINCT s.id) AS shift_count,
              COALESCE(SUM(CASE
                WHEN s.closed_at IS NOT NULL AND s.worked_minutes BETWEEN 0 AND 1440 THEN s.worked_minutes
                ELSE 0 END), 0) AS recorded_minutes,
              COALESCE(SUM(CASE
                WHEN s.closed_at IS NOT NULL
                  AND s.worked_minutes BETWEEN 0 AND 720
                  AND s.status = 'completed'
                  AND COALESCE(f.pending_exception_count, 0) = 0
                  AND COALESCE(f.rejected_exception_count, 0) = 0
                THEN s.worked_minutes ELSE 0 END), 0) AS approved_minutes,
              COALESCE(SUM(COALESCE(f.event_exception_count, 0) + CASE
                WHEN s.closed_at IS NULL OR s.worked_minutes IS NULL OR s.worked_minutes < 0 OR s.worked_minutes > 720 THEN 1
                ELSE 0 END), 0) AS exception_count,
              COALESCE(SUM(COALESCE(f.pending_exception_count, 0) + CASE
                WHEN s.closed_at IS NULL OR s.worked_minutes IS NULL OR s.worked_minutes < 0 OR s.worked_minutes > 720 THEN 1
                ELSE 0 END), 0) AS pending_exception_count,
              COALESCE(SUM(f.late_count), 0) AS late_count,
              COALESCE(SUM(f.early_leave_count), 0) AS early_leave_count
       FROM attendance_sessions s
       LEFT JOIN event_flags f ON f.session_id = s.id
       WHERE s.store_id = ?
         AND s.opened_at < ?
         AND COALESCE(s.closed_at, s.opened_at) >= ?
       GROUP BY lower(s.employee_email)
     ), schedule_rollup AS (
       SELECT lower(employee_email) AS email,
              COALESCE(SUM(CASE
                WHEN julianday(MIN(ends_at, ?)) > julianday(MAX(starts_at, ?))
                THEN CAST(ROUND((julianday(MIN(ends_at, ?)) - julianday(MAX(starts_at, ?))) * 1440) AS INTEGER)
                ELSE 0 END), 0) AS scheduled_minutes
       FROM shifts
       WHERE store_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at >= ?
       GROUP BY lower(employee_email)
     )
     SELECT e.display_name, e.email, e.role, COALESCE(e.job_title, 'Nhân viên') AS job_title,
            COALESCE(e.compensation_type, CASE WHEN e.role IN ('owner', 'system_admin') THEN 'none' ELSE 'hourly' END) AS compensation_type,
            COALESCE(e.payroll_eligible, CASE WHEN e.role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) AS payroll_eligible,
            COALESCE(e.hourly_rate, CASE
              WHEN e.role = 'manager' THEN 35000
              WHEN e.role = 'team_lead' THEN 30000
              WHEN lower(COALESCE(e.job_title, '')) LIKE '%trưởng%' THEN 28000
              WHEN lower(COALESCE(e.job_title, '')) LIKE '%thu ngân%' THEN 23000
              ELSE 25000 END) AS hourly_rate,
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
     WHERE e.store_id = ? AND e.status = 'active'
       AND COALESCE(e.participates_attendance, CASE WHEN e.role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) = 1
       ${ownOnly}
     ORDER BY e.display_name`,
  ).bind(
    bindings[0], bindings[2], bindings[1],
    bindings[3], bindings[5], bindings[4],
    period.endExclusiveIso, period.startIso, period.endExclusiveIso, period.startIso,
    bindings[6], period.endExclusiveIso, period.startIso,
    bindings[7],
    ...bindings.slice(8),
  ).all<AggregateRow>();

  const store = await db.prepare("SELECT name, timezone FROM stores WHERE id = ?")
    .bind(options.storeId)
    .first<{ name: string; timezone: string }>();
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

  const entryMap = new Map<string, PayrollEntryRow>();
  if (payrollPeriod) {
    const entries = await db.prepare(
      `SELECT employee_email, approved_minutes, overtime_minutes, allowance_amount,
              bonus_amount, deduction_amount, total_amount, status
       FROM payroll_entries WHERE payroll_period_id = ?`,
    ).bind(payrollPeriod.id).all<PayrollEntryRow>();
    entries.results.forEach((entry) => entryMap.set(entry.employee_email.toLowerCase(), entry));
  }

  const exceptions = await loadPeriodExceptions(db, options.storeId, period);
  const exceptionMap = new Map<string, PayrollException[]>();
  for (const exception of exceptions) {
    const key = exception.employeeEmail.toLowerCase();
    exceptionMap.set(key, [...(exceptionMap.get(key) ?? []), exception]);
  }

  const rows: PayrollReportRow[] = aggregate.results.map((row) => {
    const entry = entryMap.get(row.email.toLowerCase());
    const periodIsLocked = payrollPeriod?.status === "finalized" || payrollPeriod?.status === "paid";
    const approvedMinutes = periodIsLocked ? (entry?.approved_minutes ?? row.approved_minutes) : row.approved_minutes;
    const overtimeMinutes = periodIsLocked
      ? (entry?.overtime_minutes ?? Math.max(0, approvedMinutes - row.scheduled_minutes))
      : Math.max(0, approvedMinutes - row.scheduled_minutes);
    const allowanceAmount = entry?.allowance_amount ?? 0;
    const bonusAmount = entry?.bonus_amount ?? 0;
    const deductionAmount = entry?.deduction_amount ?? 0;
    const baseSalary = row.compensation_type === "monthly" && approvedMinutes > 0
      ? row.monthly_salary
      : row.compensation_type === "none"
        ? 0
        : Math.round((approvedMinutes / 60) * row.hourly_rate);
    const overtimePay = row.compensation_type === "none"
      ? 0
      : Math.round((overtimeMinutes / 60) * row.hourly_rate * 0.5);
    const calculatedTotal = Math.max(0, baseSalary + overtimePay + allowanceAmount + bonusAmount - deductionAmount);
    const lockedEntryStatus = payrollPeriod?.status === "finalized" || payrollPeriod?.status === "paid"
      ? entry?.status
      : undefined;
    const status: PayrollReportRow["status"] = lockedEntryStatus
      ?? (payrollPeriod?.status === "paid"
        ? "paid"
        : payrollPeriod?.status === "finalized"
          ? "payroll_finalized"
          : row.pending_exception_count > 0
            ? "exception"
            : approvedMinutes > 0
              ? "attendance_approved"
              : "unchecked");
    return {
      displayName: row.display_name,
      email: row.email,
      role: row.role,
      jobTitle: row.job_title,
      compensationType: row.compensation_type,
      includeInPayroll: Boolean(row.payroll_eligible) && row.compensation_type !== "none",
      hourlyRate: row.hourly_rate,
      monthlySalary: row.monthly_salary,
      scheduledMinutes: row.scheduled_minutes,
      recordedMinutes: row.recorded_minutes,
      approvedMinutes,
      overtimeMinutes,
      shiftCount: row.shift_count,
      lateCount: row.late_count,
      earlyLeaveCount: row.early_leave_count,
      exceptionCount: row.exception_count,
      pendingExceptionCount: row.pending_exception_count,
      allowanceAmount,
      bonusAmount,
      deductionAmount,
      baseSalary,
      overtimePay,
      totalSalary: periodIsLocked ? (entry?.total_amount ?? calculatedTotal) : calculatedTotal,
      status,
      exceptions: exceptionMap.get(row.email.toLowerCase()) ?? [],
    };
  });

  const now = new Date();
  const end = new Date(period.endExclusiveIso);
  const dataThrough = new Date(Math.min(now.getTime(), end.getTime() - 1));
  return {
    period,
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
     WHERE s.store_id = ? AND s.opened_at < ? AND COALESCE(s.closed_at, s.opened_at) >= ?
       AND (ev.review_required = 1 OR ex.id IS NOT NULL)
     ORDER BY ev.recorded_at DESC`,
  ).bind(storeId, period.endExclusiveIso, period.startIso).all<{
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
  }>();

  const sessionResult = await db.prepare(
    `SELECT id, employee_email, opened_at, closed_at, worked_minutes
     FROM attendance_sessions
     WHERE store_id = ? AND opened_at < ? AND COALESCE(closed_at, opened_at) >= ?
       AND (closed_at IS NULL OR worked_minutes IS NULL OR worked_minutes < 0 OR worked_minutes > 720)
     ORDER BY opened_at DESC`,
  ).bind(storeId, period.endExclusiveIso, period.startIso).all<{
    id: string;
    employee_email: string;
    opened_at: string;
    closed_at: string | null;
    worked_minutes: number | null;
  }>();

  const eventExceptions: PayrollException[] = eventResult.results.map((row) => {
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
  const sessionExceptions: PayrollException[] = sessionResult.results.map((row) => ({
    id: `session:${row.id}`,
    employeeEmail: row.employee_email,
    occurredAt: row.opened_at,
    kind: row.closed_at ? "duration" : "missing_checkout",
    title: row.closed_at
      ? `Ca làm kéo dài ${formatMinutesText(row.worked_minutes ?? 0)}, vượt ngưỡng 12 giờ.`
      : "Thiếu chấm ra hoặc ca làm chưa được đóng.",
    status: "pending",
    reviewerEmail: null,
    reviewerNote: null,
    employeeReason: null,
    canReview: false,
  }));
  return [...eventExceptions, ...sessionExceptions];
}

export function resolvePayrollPeriod(value?: string | null, now = new Date()): PayrollPeriod {
  const current = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? String(value) : current;
  const [year, month] = key.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  const start = new Date(`${key}-01T00:00:00+07:00`);
  const end = new Date(`${nextKey}-01T00:00:00+07:00`);
  const endDate = formatLocalDateKey(new Date(end.getTime() - 1));
  return {
    key,
    startIso: start.toISOString(),
    endExclusiveIso: end.toISOString(),
    startDate: `${key}-01`,
    endDate,
    label: `01/${String(month).padStart(2, "0")}/${year} – ${endDate.slice(8, 10)}/${String(month).padStart(2, "0")}/${year}`,
  };
}

function formatLocalDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
