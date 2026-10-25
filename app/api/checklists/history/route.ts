import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { hasGrantedPermission } from "@/modules/people/domain/permissions";
import { apiHandler } from "@/platform/http/errors";

export type ChecklistHistoryRecord = {
  itemId: string;
  label: string;
  routineType: "daily_routine" | "shift_routine";
  assignee: string;
  required: number;
  businessDate: string;
  completed: number;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  updatedAt: string;
  shiftRoleLabel: string | null;
  shiftEmployeeName: string | null;
};

export const GET = apiHandler(async (request?: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;

  const canManage = hasGrantedPermission(auth.actor, "checklists.manage") ||
    auth.actor.role === "owner" ||
    auth.actor.role === "manager" ||
    auth.actor.role === "system_admin";

  const url = request?.url ? new URL(request.url) : null;
  const dateParam = url?.searchParams.get("date")?.trim() || null;
  const fromParam = url?.searchParams.get("from")?.trim() || null;
  const toParam = url?.searchParams.get("to")?.trim() || null;
  const statusParam = url?.searchParams.get("status")?.trim() || "all";
  const searchParam = url?.searchParams.get("search")?.trim() || null;

  const db = await ensureDatabase();

  // If a specific date is requested, query all checklist items for that store
  // combined with executions for that specific date (so incomplete items are also visible for that date).
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    const query = `
      SELECT 
        i.id AS itemId,
        i.label,
        i.routine_type AS routineType,
        i.assignee,
        i.required,
        COALESCE(x.business_date, CASE WHEN i.routine_type = 'shift_routine' AND s.starts_at IS NOT NULL THEN date(s.starts_at, '+7 hours') ELSE ? END) AS businessDate,
        COALESCE(x.completed, 0) AS completed,
        x.completed_at AS completedAt,
        x.completed_by AS completedBy,
        COALESCE(ce.display_name, x.completed_by) AS completedByName,
        COALESCE(x.updated_at, i.updated_at) AS updatedAt,
        s.role_label AS shiftRoleLabel,
        COALESCE(se.display_name, s.employee_email) AS shiftEmployeeName
      FROM checklist_items i
      LEFT JOIN shifts s ON s.id = i.shift_id
      LEFT JOIN employees se ON se.store_id = s.store_id AND lower(se.email) = lower(s.employee_email)
      LEFT JOIN checklist_executions x ON x.item_id = i.id AND (
        x.business_date = ?
        OR (i.routine_type = 'shift_routine' AND s.starts_at IS NOT NULL AND x.business_date = date(s.starts_at, '+7 hours'))
      )
      LEFT JOIN employees ce ON ce.store_id = i.store_id AND lower(ce.email) = lower(x.completed_by)
      WHERE i.store_id = ?
        ${statusParam === "completed" ? "AND x.completed = 1" : statusParam === "incomplete" ? "AND (x.completed IS NULL OR x.completed = 0)" : ""}
        ${searchParam ? "AND (lower(i.label) LIKE ? OR lower(COALESCE(ce.display_name, '')) LIKE ? OR lower(COALESCE(x.completed_by, '')) LIKE ?)" : ""}
      ORDER BY x.completed DESC, i.routine_type ASC, i.id ASC
      LIMIT 100
    `;

    const binds: unknown[] = [dateParam, dateParam, auth.actor.storeId];
    if (searchParam) {
      const pattern = `%${searchParam.toLowerCase()}%`;
      binds.push(pattern, pattern, pattern);
    }

    const result = await db.prepare(query).bind(...binds).all<ChecklistHistoryRecord>();

    return Response.json({
      history: result.results ?? [],
      date: dateParam,
      canManage,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  // Otherwise, query historical executions range
  let query = `
    SELECT 
      x.item_id AS itemId,
      i.label,
      i.routine_type AS routineType,
      i.assignee,
      i.required,
      x.business_date AS businessDate,
      x.completed,
      x.completed_at AS completedAt,
      x.completed_by AS completedBy,
      COALESCE(ce.display_name, x.completed_by) AS completedByName,
      x.updated_at AS updatedAt,
      s.role_label AS shiftRoleLabel,
      COALESCE(se.display_name, s.employee_email) AS shiftEmployeeName
    FROM checklist_executions x
    JOIN checklist_items i ON i.id = x.item_id
    LEFT JOIN employees ce ON ce.store_id = i.store_id AND lower(ce.email) = lower(x.completed_by)
    LEFT JOIN shifts s ON s.id = i.shift_id
    LEFT JOIN employees se ON se.store_id = s.store_id AND lower(se.email) = lower(s.employee_email)
    WHERE i.store_id = ?
  `;

  const binds: unknown[] = [auth.actor.storeId];

  if (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)) {
    query += " AND x.business_date >= ?";
    binds.push(fromParam);
  }
  if (toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
    query += " AND x.business_date <= ?";
    binds.push(toParam);
  }
  if (statusParam === "completed") {
    query += " AND x.completed = 1";
  } else if (statusParam === "incomplete") {
    query += " AND x.completed = 0";
  }
  if (searchParam) {
    query += " AND (lower(i.label) LIKE ? OR lower(COALESCE(ce.display_name, '')) LIKE ? OR lower(COALESCE(x.completed_by, '')) LIKE ?)";
    const pattern = `%${searchParam.toLowerCase()}%`;
    binds.push(pattern, pattern, pattern);
  }

  query += " ORDER BY x.business_date DESC, x.completed_at DESC, x.updated_at DESC LIMIT 150";

  const result = await db.prepare(query).bind(...binds).all<ChecklistHistoryRecord>();

  return Response.json({
    history: result.results ?? [],
    canManage,
  }, { headers: { "Cache-Control": "private, no-store" } });
});
