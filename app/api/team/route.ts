import { updateEmployeeAccess } from "@/modules/people/application/update-access";
import type { EmployeeStatus } from "@/modules/people/domain/access";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import type { ActorRole } from "@/server/auth";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  if (auth.actor.role === "team_lead") {
    const result = await db.prepare(
      `SELECT id, email, display_name, role, status
       FROM employees
       WHERE store_id = ? AND status = 'active'
       ORDER BY display_name ASC`,
    ).bind(auth.actor.storeId).all();
    return Response.json({ employees: result.results }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const result = await db.prepare(
    `SELECT id, email, display_name, role, status, created_at
     FROM employees WHERE store_id = ? ORDER BY status, display_name`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ employees: result.results }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  void request;
  return Response.json({ error: "Hãy tạo tài khoản tại trang Quản trị tài khoản." }, { status: 410 });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { id: "string", role: "string", status: "string" });
  if (!body.id || (!body.role && !body.status)) return Response.json({ error: "Thay đổi nhân sự không hợp lệ." }, { status: 400 });
  await updateEmployeeAccess(await ensureDatabase(), auth.actor, body.id as string, {
    role: body.role as ActorRole | undefined,
    status: body.status as EmployeeStatus | undefined,
  });
  return Response.json({ updated: true });
});
