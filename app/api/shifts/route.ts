import { ensureDatabase } from "@/db/runtime";
import { hasPermission, requireApiPermission, requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { attendanceTime } from "@/modules/attendance/application/correct-attendance";
import {
  assignCoverShift,
  changeShift,
  createShifts,
  publishShifts,
} from "@/modules/operations/application/manage-shifts";

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
  const canReadTeam = hasPermission(auth.actor, "shifts.read_team");
  const ownOnly = canReadTeam ? "" : "AND lower(s.employee_email) = lower(?)";
  const hideDrafts = canReadTeam ? "" : "AND s.status <> 'draft'";
  const result = await db.prepare(
    `SELECT s.id, s.employee_email, s.starts_at, s.ends_at, s.role_label, s.revision,
            s.is_shift_lead, s.status, s.approved_leave_request_id, s.cover_for_shift_id,
            COALESCE(e.display_name, s.employee_email) AS employee_name,
            EXISTS(SELECT 1 FROM attendance_sessions a WHERE a.shift_id = s.id) AS has_attendance,
            EXISTS(
              SELECT 1 FROM payroll_periods p
              WHERE p.store_id = s.store_id AND p.status IN ('finalized', 'paid')
                AND p.period_start < s.ends_at AND p.period_end > s.starts_at
            ) AS has_payroll_lock,
            (
              SELECT COALESCE(cover_emp.display_name, cover_shift.employee_email)
              FROM shifts cover_shift
              LEFT JOIN employees cover_emp ON lower(cover_emp.email) = lower(cover_shift.employee_email)
              WHERE cover_shift.cover_for_shift_id = s.id
                AND cover_shift.status IN ('draft', 'published')
              LIMIT 1
            ) AS cover_employee_name,
            (
              SELECT cover_shift.employee_email
              FROM shifts cover_shift
              WHERE cover_shift.cover_for_shift_id = s.id
                AND cover_shift.status IN ('draft', 'published')
              LIMIT 1
            ) AS cover_employee_email
     FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
     WHERE s.store_id = ? AND s.starts_at < ? AND s.ends_at > ? ${ownOnly} ${hideDrafts}
     ORDER BY s.starts_at ASC, s.id LIMIT 501 OFFSET ?`,
  ).bind(auth.actor.storeId, to, from, ...(!canReadTeam ? [auth.actor.email] : []), offset).all();
  return Response.json({ shifts: result.results.slice(0, 500), nextOffset: result.results.length > 500 ? offset + 500 : null, from, to });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("shifts.create");
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { employeeEmail: "string" });
  const input = body.batch === undefined ? [body] : body.batch;
  const targetStatus = body.status === "draft" ? "draft" : "published";
  if (targetStatus === "published" && !hasPermission(auth.actor, "shifts.publish")) return Response.json({ error: "Bạn không có quyền xuất bản ca.", code: "permission_denied" }, { status: 403 });
  return Response.json(await createShifts(await ensureDatabase(), auth.actor, body.employeeEmail, input as Parameters<typeof createShifts>[3], { status: targetStatus }));
});

export const PATCH = apiHandler(async (request: Request) => {
  const body = await readObject(request, { action: "string" });
  if (body.action === "assign_cover") {
    const auth = await requireApiPermission("shifts.create");
    if (!auth.actor) return auth.response;
    if (!hasPermission(auth.actor, "shifts.publish")) {
      return Response.json({ error: "Bạn cần quyền tạo và xuất bản ca để bố trí người thay.", code: "permission_denied" }, { status: 403 });
    }
    const replacementEmail = (body.replacementEmail ?? body.replacementEmployeeEmail) as string;
    return Response.json(await assignCoverShift(await ensureDatabase(), auth.actor, {
      originalShiftId: body.id as string,
      replacementEmail,
      reason: body.reason as string | undefined,
    }));
  }

  const requiredPermission = body.action === "publish" ? "shifts.publish" : body.action === "cancel" ? "shifts.cancel" : "shifts.adjust";
  const auth = await requireApiPermission(requiredPermission);
  if (!auth.actor) return auth.response;
  if (body.action === "publish") {
    const shiftIds = Array.isArray(body.shiftIds) ? body.shiftIds : (typeof body.id === "string" ? [body.id] : []);
    return Response.json(await publishShifts(await ensureDatabase(), auth.actor, shiftIds as string[]));
  }
  if (typeof body.id !== "string" || (body.action !== "edit" && body.action !== "cancel" && body.action !== "adjust") || typeof body.expectedRevision !== "number") {
    return Response.json({ error: "Thông tin thay đổi ca không hợp lệ." }, { status: 400 });
  }
  return Response.json(await changeShift(await ensureDatabase(), auth.actor, body as Parameters<typeof changeShift>[2]));
});
