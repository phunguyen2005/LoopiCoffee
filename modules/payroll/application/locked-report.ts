import type { PayrollReportRow } from "../contracts/report.ts";

type LockedEntry = {
  employee_email: string; approved_minutes: number; overtime_minutes: number;
  allowance_amount: number; bonus_amount: number; deduction_amount: number; total_amount: number;
  status: "payroll_finalized" | "paid"; row_snapshot: string | null; snapshot_version: number;
  display_name: string | null;
};

export async function loadLockedRows(db: D1Database, periodId: string, ownEmail?: string): Promise<PayrollReportRow[]> {
  const entries = await db.prepare(
    `SELECT p.*, e.display_name FROM payroll_entries p
     LEFT JOIN employees e ON lower(e.email) = lower(p.employee_email)
     WHERE p.payroll_period_id = ? ${ownEmail ? "AND lower(p.employee_email) = lower(?)" : ""}
     ORDER BY p.employee_email`,
  ).bind(periodId, ...(ownEmail ? [ownEmail] : [])).all<LockedEntry>();
  return entries.results.map((entry) => {
    if (entry.snapshot_version === 1 && entry.row_snapshot) {
      const snapshot = JSON.parse(entry.row_snapshot) as PayrollReportRow;
      if (snapshot.email.toLowerCase() !== entry.employee_email.toLowerCase() || !Number.isFinite(snapshot.totalSalary)) {
        throw new Error("Invalid payroll snapshot");
      }
      return { ...snapshot, status: entry.status, snapshotComplete: true };
    }
    // Legacy entries retain their saved totals, even after employee offboarding.
    // Missing historical calculation inputs are not invented from current rates.
    return {
      displayName: entry.display_name ?? entry.employee_email, email: entry.employee_email,
      role: "", jobTitle: "", compensationType: "none", includeInPayroll: true, hasPayrollData: true,
      hourlyRate: 0, monthlySalary: 0, scheduledMinutes: 0, recordedMinutes: 0,
      approvedMinutes: entry.approved_minutes, overtimeMinutes: entry.overtime_minutes,
      shiftCount: 0, lateCount: 0, earlyLeaveCount: 0, exceptionCount: 0, pendingExceptionCount: 0,
      allowanceAmount: entry.allowance_amount, bonusAmount: entry.bonus_amount, deductionAmount: entry.deduction_amount,
      baseSalary: 0, overtimePay: 0, totalSalary: entry.total_amount, status: entry.status,
      exceptions: [], snapshotComplete: false,
    };
  });
}
