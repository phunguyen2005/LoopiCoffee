import { ensureDatabase } from "@/db/runtime";
import { loadPayrollReport } from "@/lib/payroll-report";
import { apiHandler } from "@/platform/http/errors";
import { hasPermission, requireApiUser } from "@/server/auth";
import { evaluatePayrollFinalizationEligibility } from "@/modules/payroll/application/change-period";

export const GET = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;

  const url = new URL(request.url);
  const db = await ensureDatabase();
  const canViewPayroll = hasPermission(auth.actor, "payroll.read");
  const canReviewAttendance = hasPermission(auth.actor, "attendance.review");
  const canFinalizePayroll = hasPermission(auth.actor, "payroll.finalize");
  const canExportReports = hasPermission(auth.actor, "reports.export");
  const report = await loadPayrollReport(db, {
    storeId: auth.actor.storeId,
    actorEmail: auth.actor.email,
    actorRole: auth.actor.role,
    canViewAll: canViewPayroll || canReviewAttendance,
    periodKey: url.searchParams.get("period"),
  });
  const finalizationEligibility = await evaluatePayrollFinalizationEligibility(db, auth.actor, report.period.key, { report, existingStatus: report.periodStatus });

  return Response.json(
    {
      ...report,
      canViewPayroll,
      canReviewAttendance,
      canFinalizePayroll,
      canReopenPayroll: auth.actor.role === "owner",
      canAdjustPayroll: canFinalizePayroll,
      canRestoreRateHistory: auth.actor.role === "owner",
      canExportReports,
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
            missingRateMinutes: 0,
            rateSegments: [],
            adjustments: [],
            exceptions: row.exceptions.map((exception) => ({ ...exception, canReview: canReviewAttendance && exception.canReview })),
          })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
