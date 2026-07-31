import { ensureDatabase } from "@/db/runtime";
import { loadPayrollReport } from "@/lib/payroll-report";
import { requireApiUser } from "@/server/auth";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;

  const url = new URL(request.url);
  const db = await ensureDatabase();
  const report = await loadPayrollReport(db, {
    storeId: auth.actor.storeId,
    actorEmail: auth.actor.email,
    actorRole: auth.actor.role,
    periodKey: url.searchParams.get("period"),
  });
  const canViewPayroll = ["owner", "manager", "system_admin"].includes(auth.actor.role);

  return Response.json({
    ...report,
    canViewPayroll,
    canManagePayroll: canViewPayroll,
    rows: canViewPayroll
      ? report.rows
      : report.rows.map((row) => ({
          ...row,
          hourlyRate: 0,
          monthlySalary: 0,
          allowanceAmount: 0,
          bonusAmount: 0,
          deductionAmount: 0,
          baseSalary: 0,
          overtimePay: 0,
          totalSalary: 0,
        })),
  });
}
