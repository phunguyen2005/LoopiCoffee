import { ensureDatabase } from "@/db/runtime";
import { loadPayrollReport } from "@/lib/payroll-report";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";
import { evaluatePayrollFinalizationEligibility } from "@/modules/payroll/application/change-period";

export const GET = apiHandler(async (request: Request) => {
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
  const canViewPayroll = ["owner", "manager"].includes(auth.actor.role);
  const finalizationEligibility = await evaluatePayrollFinalizationEligibility(db, auth.actor, report.period.key, { report, existingStatus: report.periodStatus });

  return Response.json(
    {
      ...report,
      canViewPayroll,
      canReviewAttendance: auth.actor.role !== "employee",
      canManagePayroll: canViewPayroll,
      finalizationEligibility,
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
            adjustments: [],
            exceptions: row.exceptions.map((exception) => ({ ...exception, canReview: auth.actor.role !== "employee" && exception.canReview })),
          })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
