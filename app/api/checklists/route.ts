import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiPermission, requireApiUser } from "@/server/auth";
import { businessDate } from "@/modules/operations/domain/business-day";
import { hasGrantedPermission } from "@/modules/people/domain/permissions";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

type ShiftRow = { id: string; employee_email: string; starts_at: string; ends_at: string; role_label: string };

function shiftWindow(now: Date) {
  return {
    after: new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString(),
  };
}

async function findCurrentShift(db: D1Database, storeId: string, employeeEmail: string, now: Date) {
  const { after } = shiftWindow(now);
  return db.prepare(
    `SELECT id, employee_email, starts_at, ends_at, role_label
     FROM shifts
     WHERE store_id = ? AND lower(employee_email) = lower(?)
       AND status IN ('published', 'completed') AND approved_leave_request_id IS NULL
       AND ends_at > ? AND starts_at <= ?
     ORDER BY CASE WHEN starts_at <= ? THEN 0 ELSE 1 END, starts_at ASC
     LIMIT 1`,
  ).bind(storeId, employeeEmail, now.toISOString(), after, now.toISOString()).first<ShiftRow>();
}

export const GET = apiHandler(async (request?: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const now = new Date();
  const url = request?.url ? new URL(request.url) : null;
  const requestedDate = url?.searchParams.get("date");
  const currentBusinessDate = (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate))
    ? requestedDate
    : businessDate(now);
  const currentShift = await findCurrentShift(db, auth.actor.storeId, auth.actor.email, now);
  const shiftBusinessDate = (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate))
    ? requestedDate
    : (currentShift ? businessDate(new Date(currentShift.starts_at)) : currentBusinessDate);
  const { after } = shiftWindow(now);
  const canManage = hasGrantedPermission(auth.actor, "checklists.manage") || auth.actor.role === "owner" || auth.actor.role === "manager";

  const requestedShiftId = url?.searchParams.get("shiftId");

  const [itemsResult, shiftsResult] = await db.batch([
    db.prepare(
      `SELECT i.id, i.label, i.assignee, i.required, i.routine_type, i.shift_id, i.responsible_role,
              COALESCE(x.completed, 0) AS completed, x.completed_at, x.completed_by,
              COALESCE(ce.display_name, x.completed_by) AS completed_by_name,
              s.employee_email AS shift_employee_email,
              COALESCE(se.display_name, s.employee_email) AS shift_employee_name,
              s.role_label AS shift_role_label,
              s.starts_at AS shift_starts_at,
              s.ends_at AS shift_ends_at
       FROM checklist_items i
       LEFT JOIN shifts s ON s.id = i.shift_id
       LEFT JOIN employees se ON se.store_id = s.store_id AND lower(se.email) = lower(s.employee_email)
       LEFT JOIN checklist_executions x ON x.item_id = i.id AND (
         (i.routine_type = 'daily_routine' AND x.business_date = ?)
         OR (i.routine_type = 'shift_routine' AND x.business_date = COALESCE(date(s.starts_at, '+7 hours'), ?))
       )
       LEFT JOIN employees ce ON ce.store_id = i.store_id AND lower(ce.email) = lower(x.completed_by)
       WHERE i.store_id = ?
         AND (
           i.routine_type = 'daily_routine'
           OR (
             i.routine_type = 'shift_routine' AND (
               (? = 1 AND (
                 (? IS NOT NULL AND i.shift_id = ? AND (
                   (s.ends_at > ? AND s.starts_at <= ?)
                   OR COALESCE(x.completed, 0) = 0
                 ))
                 OR (? IS NULL AND (
                   i.shift_id IN (
                     SELECT sh.id FROM shifts sh
                     WHERE sh.store_id = ? AND sh.status IN ('published', 'completed')
                       AND sh.approved_leave_request_id IS NULL
                       AND sh.ends_at > ? AND sh.starts_at <= ?
                   )
                   OR COALESCE(x.completed, 0) = 0
                 ))
               ))
               OR (? = 0 AND i.shift_id = ?)
             )
           )
         )
       ORDER BY CASE COALESCE(x.completed, 0) WHEN 0 THEN 0 ELSE 1 END,
                CASE i.routine_type WHEN 'shift_routine' THEN 0 ELSE 1 END,
                i.id`,
    ).bind(
      currentBusinessDate,
      currentBusinessDate,
      auth.actor.storeId,
      canManage ? 1 : 0,
      requestedShiftId ?? null, requestedShiftId ?? "",
      now.toISOString(), after,
      requestedShiftId ?? null,
      auth.actor.storeId, now.toISOString(), after,
      canManage ? 1 : 0, currentShift?.id ?? "",
    ),
    db.prepare(
      `SELECT s.id, s.employee_email, s.starts_at, s.ends_at, s.role_label,
              COALESCE(e.display_name, s.employee_email) AS employee_name
       FROM shifts s
       LEFT JOIN employees e ON e.store_id = s.store_id AND lower(e.email) = lower(s.employee_email)
       WHERE s.store_id = ? AND s.status IN ('published', 'completed')
         AND s.approved_leave_request_id IS NULL
         AND s.ends_at > ? AND s.starts_at <= ?
       ORDER BY s.starts_at ASC LIMIT 40`,
    ).bind(auth.actor.storeId, now.toISOString(), after),
  ]);
  return Response.json({
    items: itemsResult.results ?? [],
    businessDate: currentBusinessDate,
    shiftBusinessDate,
    currentShift: currentShift ?? null,
    shifts: shiftsResult.results ?? [],
    canManage,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("checklists.manage");
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, {
    label: "string", assignee: "string", required: "boolean", routineType: "string", shiftId: "string", responsibleRole: "string",
  })) as { label?: string; assignee?: string; required?: boolean; routineType?: string; shiftId?: string; responsibleRole?: string };
  const label = body.label?.trim();
  const routineType = body.routineType ?? "daily_routine";
  const shiftId = body.shiftId?.trim() || null;
  const responsibleRole = body.responsibleRole?.trim() || null;
  if (!label || label.length > 200 || (body.assignee?.length ?? 0) > 100) {
    return Response.json({ error: "Vui lòng nhập tên công việc checklist." }, { status: 400 });
  }
  if (!["daily_routine", "shift_routine"].includes(routineType) || (routineType === "shift_routine") !== Boolean(shiftId)) {
    return Response.json({ error: "Checklist theo ca phải được gắn với một ca hợp lệ." }, { status: 400 });
  }
  if ((responsibleRole?.length ?? 0) > 80) {
    return Response.json({ error: "Vai trò chịu trách nhiệm không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  let shift: ShiftRow | null = null;
  if (shiftId) {
    shift = await db.prepare(
      `SELECT id, employee_email, starts_at, ends_at, role_label FROM shifts
       WHERE id = ? AND store_id = ? AND status IN ('published', 'completed')`,
    ).bind(shiftId, auth.actor.storeId).first<ShiftRow>() ?? null;
    if (!shift) return Response.json({ error: "Không tìm thấy ca để gắn checklist." }, { status: 404 });
    if (new Date(shift.ends_at).getTime() <= Date.now()) {
      return Response.json({
        error: "Ca này đã kết thúc nên không thể thêm checklist mới.",
        code: "shift_ended",
      }, { status: 409 });
    }
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const assignee = routineType === "shift_routine"
    ? (body.assignee?.trim() || shift?.role_label || "Theo ca cụ thể")
    : (body.assignee?.trim() || "Toàn bộ ca làm");
  const required = body.required !== false ? 1 : 0;
  await db.batch([
    db.prepare(
      `INSERT INTO checklist_items
        (id, store_id, label, assignee, routine_type, shift_id, responsible_role, required, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).bind(id, auth.actor.storeId, label, assignee, routineType, shiftId, responsibleRole, required, now),
    auditStatement(db, auth.actor.email, "checklist_item", id, "checklist.created", { label, routineType, shiftId, responsibleRole }, now),
  ]);
  return Response.json({ item: { id, label, assignee, routine_type: routineType, shift_id: shiftId, responsible_role: responsibleRole, required, completed: 0 } });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = await readObject(request, {
    id: "string",
    completed: "boolean",
    action: "string",
    targetRoutineType: "string",
    targetShiftId: "string",
    assignee: "string",
  }) as {
    id?: string;
    completed?: boolean;
    action?: "complete_late" | "carry_over" | "dismiss";
    targetRoutineType?: "daily_routine" | "shift_routine";
    targetShiftId?: string;
    assignee?: string;
  };
  if (!body.id || (!body.action && typeof body.completed !== "boolean")) {
    return Response.json({ error: "Cập nhật checklist không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const item = await db.prepare(
    `SELECT i.id, i.label, i.assignee, i.routine_type, i.shift_id, s.starts_at, s.ends_at, s.employee_email
     FROM checklist_items i LEFT JOIN shifts s ON s.id = i.shift_id
     WHERE i.id = ? AND i.store_id = ?`,
  ).bind(body.id, auth.actor.storeId).first<{
    id: string;
    label: string;
    assignee: string;
    routine_type: string;
    shift_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    employee_email: string | null;
  }>();
  if (!item) return Response.json({ error: "Không tìm thấy công việc." }, { status: 404 });

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const canManage = hasGrantedPermission(auth.actor, "checklists.manage");

  // Overdue resolution actions (Owner / Manager with checklists.manage)
  if (body.action) {
    if (!canManage) {
      return Response.json({ error: "Bạn không có quyền xử lý checklist quá hạn." }, { status: 403 });
    }
    if (body.action === "complete_late") {
      const executionBusinessDate =
        item.routine_type === "shift_routine" && item.starts_at
          ? businessDate(new Date(item.starts_at))
          : businessDate(nowDate);
      await db.batch([
        db.prepare(
          `INSERT INTO checklist_executions(item_id,business_date,completed,completed_at,completed_by,updated_at)
           VALUES(?,?,?,?,?,?) ON CONFLICT(item_id,business_date) DO UPDATE SET
           completed=excluded.completed,completed_at=excluded.completed_at,completed_by=excluded.completed_by,updated_at=excluded.updated_at`,
        ).bind(body.id, executionBusinessDate, 1, now, auth.actor.email, now),
        auditStatement(
          db,
          auth.actor.email,
          "checklist_item",
          body.id,
          "checklist.completed_late",
          {
            businessDate: executionBusinessDate,
            routineType: item.routine_type,
            shiftId: item.shift_id,
            lateResolution: true,
          },
          now,
        ),
      ]);
      return Response.json({
        updated: true,
        action: "complete_late",
        completed: true,
        completedAt: now,
        completedBy: auth.actor.email,
        completedByName: auth.actor.displayName || auth.actor.email,
        businessDate: executionBusinessDate,
      });
    }

    if (body.action === "carry_over") {
      const targetRoutineType = body.targetRoutineType === "shift_routine" ? "shift_routine" : "daily_routine";
      let nextShiftId: string | null = null;
      let nextAssignee = body.assignee?.trim() || "Toàn bộ ca làm";
      if (targetRoutineType === "shift_routine") {
        if (!body.targetShiftId?.trim()) {
          return Response.json({ error: "Vui lòng chọn ca mới để chuyển tiếp công việc." }, { status: 400 });
        }
        const targetShift = await db
          .prepare(
            `SELECT id, employee_email, starts_at, ends_at, role_label FROM shifts
             WHERE id = ? AND store_id = ? AND status IN ('published', 'completed')`,
          )
          .bind(body.targetShiftId.trim(), auth.actor.storeId)
          .first<ShiftRow>();
        if (!targetShift) {
          return Response.json({ error: "Không tìm thấy ca đích để chuyển tiếp." }, { status: 404 });
        }
        if (new Date(targetShift.ends_at).getTime() <= nowDate.getTime()) {
          return Response.json(
            { error: "Ca đích đã kết thúc, vui lòng chọn ca đang diễn ra hoặc sắp tới.", code: "shift_ended" },
            { status: 409 },
          );
        }
        nextShiftId = targetShift.id;
        nextAssignee = body.assignee?.trim() || targetShift.role_label || "Theo ca cụ thể";
      }
      await db.batch([
        db.prepare(
          `UPDATE checklist_items
           SET routine_type = ?, shift_id = ?, assignee = ?, completed = 0, completed_at = NULL, updated_at = ?
           WHERE id = ? AND store_id = ?`,
        ).bind(targetRoutineType, nextShiftId, nextAssignee, now, body.id, auth.actor.storeId),
        auditStatement(
          db,
          auth.actor.email,
          "checklist_item",
          body.id,
          "checklist.carried_over",
          {
            previousShiftId: item.shift_id,
            targetRoutineType,
            targetShiftId: nextShiftId,
            assignee: nextAssignee,
          },
          now,
        ),
      ]);
      return Response.json({
        updated: true,
        action: "carry_over",
        routineType: targetRoutineType,
        shiftId: nextShiftId,
        assignee: nextAssignee,
      });
    }

    if (body.action === "dismiss") {
      await db.batch([
        db.prepare(`DELETE FROM checklist_executions WHERE item_id = ?`).bind(body.id),
        db.prepare(`DELETE FROM checklist_items WHERE id = ? AND store_id = ?`).bind(body.id, auth.actor.storeId),
        auditStatement(
          db,
          auth.actor.email,
          "checklist_item",
          body.id,
          "checklist.dismissed",
          {
            label: item.label,
            previousShiftId: item.shift_id,
            routineType: item.routine_type,
            assignee: item.assignee,
          },
          now,
        ),
      ]);
      return Response.json({
        updated: true,
        action: "dismiss",
        deletedId: body.id,
      });
    }

    return Response.json({ error: "Hành động xử lý checklist không hợp lệ." }, { status: 400 });
  }

  if (item.routine_type === "shift_routine") {
    const isAssigned = item.employee_email?.toLowerCase() === auth.actor.email.toLowerCase();
    if (!isAssigned && !canManage) {
      return Response.json({ error: "Bạn không thuộc ca của checklist này." }, { status: 403 });
    }
  }
  if (item.routine_type === "shift_routine" && (!item.ends_at || new Date(item.ends_at).getTime() <= nowDate.getTime())) {
    return Response.json({
      error: "Ca làm đã kết thúc. Checklist chỉ được xem lại và không thể thay đổi.",
      code: "shift_ended",
    }, { status: 409 });
  }
  const executionBusinessDate = item.routine_type === "shift_routine" && item.starts_at
    ? businessDate(new Date(item.starts_at))
    : businessDate(nowDate);
  await db.batch([
    db.prepare(
      `INSERT INTO checklist_executions(item_id,business_date,completed,completed_at,completed_by,updated_at)
       VALUES(?,?,?,?,?,?) ON CONFLICT(item_id,business_date) DO UPDATE SET
       completed=excluded.completed,completed_at=excluded.completed_at,completed_by=excluded.completed_by,updated_at=excluded.updated_at`,
    ).bind(body.id, executionBusinessDate, body.completed ? 1 : 0, body.completed ? now : null, auth.actor.email, now),
    auditStatement(db, auth.actor.email, "checklist_item", body.id, body.completed ? "checklist.completed" : "checklist.reopened", {
      businessDate: executionBusinessDate, routineType: item.routine_type, shiftId: item.shift_id,
    }, now),
  ]);
  return Response.json({
    updated: true,
    completed: body.completed,
    completedAt: body.completed ? now : null,
    completedBy: body.completed ? auth.actor.email : null,
    completedByName: body.completed ? (auth.actor.displayName || auth.actor.email) : null,
    businessDate: executionBusinessDate,
  });
});
