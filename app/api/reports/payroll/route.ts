import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { changePayrollPeriod } from "@/modules/payroll/application/change-period";
import { addPayrollAdjustment } from "@/modules/payroll/application/add-adjustment";

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { action: "string", period: "string", id: "string", employeeEmail: "string", amount: "number", reason: "string" });
  if (body.action === "adjust") return Response.json(await addPayrollAdjustment(await ensureDatabase(), auth.actor, body));
  if ((body.action !== "finalize" && body.action !== "reopen") ||
      (body.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period as string))) {
    return Response.json({ error: "Thao tác hoặc kỳ lương không hợp lệ." }, { status: 400 });
  }
  return Response.json(await changePayrollPeriod(await ensureDatabase(), auth.actor, body.action, body.period as string | undefined));
});
