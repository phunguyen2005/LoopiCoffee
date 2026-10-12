import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { attendanceTime } from "@/modules/attendance/application/correct-attendance";
import { createShifts, changeShift } from "@/modules/operations/application/manage-shifts";

export const GET = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const url = new URL(request.url);
  const now = Date.now();
  const from = attendanceTime(url.searchParams.get("from") ?? new Date(now - 7 * 86400000).toISOString());
  const to = attendanceTime(url.searchParams.get("to") ?? new Date(now + 31 * 86400000).toISOString());
  if (to <= from || Date.parse(to) - Date.parse(from) > 93 * 86400000) return Response.json({ error: "Khoảng lịch phải từ 1 đến 93 ngày." }, { status: 400 });
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) return Response.json({ error: "Trang lịch không hợp lệ." }, { status: 400 });
  const db = await ensureDatabase();
  const ownOnly = auth.actor.role === "employee" ? "AND lower(s.employee_email) = lower(?)" : "";
  const result = await db.prepare(    `SELECT s.id, s.employee_email, s.starts_at, s.ends_at, s.role_label, s.revision,
            s.is_shift_lead, s.status, s.approved_leave_request_id,
            COALESCE(e.display_name, s.employee_email) AS employee_name
     FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
     WHERE s.store_id = ? AND s.starts_at < ? AND s.ends_at > ? ${ownOnly}
     ORDER BY s.starts_at ASC, s.id LIMIT 501 OFFSET ?`,
  ).bind(auth.actor.storeId, to, from, ...(auth.actor.role === "employee" ? [auth.actor.email] : []), offset).all();
  return Response.json({ shifts: result.results.slice(0, 500), nextOffset: result.results.length > 500 ? offset + 500 : null, from, to });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { employeeEmail: "string" });
  const input = body.batch === undefined ? [body] : body.batch;
  return Response.json(await createShifts(await ensureDatabase(), auth.actor, body.employeeEmail, input as Parameters<typeof createShifts>[3]));
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { id: "string", action: "string", expectedRevision: "number" });
  if (typeof body.id !== "string" || (body.action !== "edit" && body.action !== "cancel") || typeof body.expectedRevision !== "number") return Response.json({ error: "Thông tin thay đổi ca không hợp lệ." }, { status: 400 });
  return Response.json(await changeShift(await ensureDatabase(), auth.actor, body as Parameters<typeof changeShift>[2]));
});
