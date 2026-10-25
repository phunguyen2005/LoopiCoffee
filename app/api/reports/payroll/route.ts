import { ensureDatabase } from "@/db/runtime";
import { hasPermission, requireApiPermission } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { changePayrollPeriod } from "@/modules/payroll/application/change-period";
import { addPayrollAdjustment } from "@/modules/payroll/application/add-adjustment";
import { restoreHistoricalHourlyRate } from "@/modules/payroll/application/restore-rate-history";

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("payroll.read");
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { action: "string", period: "string", id: "string", employeeEmail: "string", amount: "number", hourlyRate: "money", effectiveFrom: "string", effectiveTo: "string", reason: "string" });
  if (body.action === "adjust") {
    if (!hasPermission(auth.actor, "payroll.finalize")) return Response.json({ error: "Bạn không có quyền điều chỉnh lương.", code: "permission_denied" }, { status: 403 });
    return Response.json(await addPayrollAdjustment(await ensureDatabase(), auth.actor, body));
  }
  if (body.action === "restore_rate") {
    return Response.json(await restoreHistoricalHourlyRate(await ensureDatabase(), auth.actor, body));
  }
  if ((body.action !== "finalize" && body.action !== "reopen") ||
      (body.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period as string))) {
    return Response.json({ error: "Thao tác hoặc kỳ lương không hợp lệ." }, { status: 400 });
  }
  if (!hasPermission(auth.actor, "payroll.finalize")) return Response.json({ error: "Bạn không có quyền chốt kỳ lương.", code: "permission_denied" }, { status: 403 });
  return Response.json(await changePayrollPeriod(await ensureDatabase(), auth.actor, body.action, body.period as string | undefined));
});
