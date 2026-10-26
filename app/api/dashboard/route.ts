import { ensureDatabase } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";
import { requireApiPermission } from "@/server/auth";
import { businessDate } from "@/modules/operations/domain/business-day";

export const GET = apiHandler(async () => {
  const auth = await requireApiPermission("dashboard.read");
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const afterIso = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();
  const currentBusinessDate = businessDate(now);
  const [
    activeResult,
    exceptionsResult,
    checklistResult,
    incompleteChecklistResult,
    incidentsResult,
    nextShifts,
    handoverResult,
    activeStaffListResult,
    pendingRequestsResult,
    todayShiftsResult,
    payrollEstimateResult,
  ] = await db.batch([
    db.prepare(
      "SELECT COUNT(*) AS count FROM attendance_sessions WHERE store_id = ? AND closed_at IS NULL",
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT COUNT(*) AS count FROM attendance_exceptions x
       JOIN attendance_events e ON e.id = x.event_id
       JOIN attendance_sessions s ON s.id = e.session_id
       WHERE s.store_id = ? AND x.status = 'pending'`,
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN COALESCE(x.completed, 0) = 1 THEN 1 ELSE 0 END), 0) AS done
       FROM checklist_items i
       LEFT JOIN shifts s ON s.id = i.shift_id
       LEFT JOIN checklist_executions x ON x.item_id = i.id AND (
         (i.routine_type = 'daily_routine' AND x.business_date = ?)
         OR (i.routine_type = 'shift_routine' AND x.business_date = COALESCE(date(s.starts_at, '+7 hours'), ?))
       )
       WHERE i.store_id = ?
         AND (
           i.routine_type = 'daily_routine'
           OR (
             i.routine_type = 'shift_routine'
             AND s.status IN ('published', 'completed')
             AND s.approved_leave_request_id IS NULL
             AND s.ends_at > ?
             AND s.starts_at <= ?
           )
         )`,
    ).bind(currentBusinessDate, currentBusinessDate, auth.actor.storeId, nowIso, afterIso),
    db.prepare(
      `SELECT i.id, i.label, i.assignee, i.required, i.routine_type, i.shift_id,
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
       WHERE i.store_id = ?
         AND COALESCE(x.completed, 0) = 0
         AND (
           i.routine_type = 'daily_routine'
           OR (
             i.routine_type = 'shift_routine'
             AND s.status IN ('published', 'completed')
             AND s.approved_leave_request_id IS NULL
             AND s.ends_at > ?
             AND s.starts_at <= ?
           )
         )
       ORDER BY i.required DESC, CASE i.routine_type WHEN 'shift_routine' THEN 0 ELSE 1 END, i.id
       LIMIT 10`,
    ).bind(currentBusinessDate, currentBusinessDate, auth.actor.storeId, nowIso, afterIso),
    db.prepare(
      "SELECT COUNT(*) AS count FROM incidents WHERE store_id = ? AND status IN ('open', 'acknowledged')",
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT s.id, s.starts_at, s.ends_at, s.role_label,
              COALESCE(e.display_name, s.employee_email) AS employee_name
       FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
       WHERE s.store_id = ? AND s.status IN ('published', 'completed')
         AND s.approved_leave_request_id IS NULL
         AND s.ends_at >= ?
       ORDER BY s.starts_at LIMIT 5`,
    ).bind(auth.actor.storeId, nowIso),
    db.prepare(
      `SELECT h.summary, h.created_at, COALESCE(e.display_name, h.author_email) AS author_name
       FROM handovers h LEFT JOIN employees e ON lower(e.email) = lower(h.author_email)
       WHERE h.store_id = ? ORDER BY h.created_at DESC LIMIT 1`,
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT s.id, s.opened_at, s.employee_email,
              COALESCE(e.display_name, s.employee_email) AS employee_name,
              COALESCE(e.job_title, 'Nhân viên') AS job_title
       FROM attendance_sessions s
       LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
       WHERE s.store_id = ? AND s.closed_at IS NULL
       ORDER BY s.opened_at DESC LIMIT 250`,
    ).bind(auth.actor.storeId),
    db.prepare(
      "SELECT COUNT(*) AS count FROM requests WHERE store_id = ? AND status = 'pending'",
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT s.id, s.starts_at, s.ends_at, s.role_label, s.employee_email,
              COALESCE(e.display_name, s.employee_email) AS employee_name,
              COALESCE(e.job_title, 'Nhân viên') AS job_title
       FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
       WHERE s.store_id = ? AND s.status IN ('published', 'completed')
         AND s.approved_leave_request_id IS NULL
         AND date(s.starts_at,'+7 hours') = date('now','+7 hours')
       ORDER BY s.starts_at ASC LIMIT 250`,
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT COALESCE(SUM(worked_minutes), 0) AS total_minutes
       FROM attendance_sessions
       WHERE store_id = ? AND strftime('%Y-%m', opened_at,'+7 hours') = strftime('%Y-%m', 'now','+7 hours')`,
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT id, shift_id, employee_email, opened_at, closed_at
       FROM attendance_sessions
       WHERE store_id = ? AND date(opened_at, '+7 hours') = date('now', '+7 hours')
       ORDER BY opened_at ASC LIMIT 250`,
    ).bind(auth.actor.storeId),
  ]);

  const active = activeResult.results[0] as { count: number } | undefined;
  const exceptions = exceptionsResult.results[0] as { count: number } | undefined;
  const checklist = checklistResult.results[0] as { total: number; done: number } | undefined;
  const checklistTotal = Number(checklist?.total ?? 0);
  const checklistDone = Number(checklist?.done ?? 0);
  const checklistIncomplete = Math.max(0, checklistTotal - checklistDone);
  const incompleteChecklistItems = (incompleteChecklistResult.results ?? []) as Array<{
    id: string;
    label: string;
    assignee: string;
    required: number;
    routine_type: "daily_routine" | "shift_routine";
    shift_id: string | null;
    shift_employee_name: string | null;
    shift_role_label: string | null;
    shift_starts_at: string | null;
    shift_ends_at: string | null;
  }>;
  const incidents = incidentsResult.results[0] as { count: number } | undefined;
  const handover = handoverResult.results[0];
  const pendingRequests = pendingRequestsResult.results[0] as { count: number } | undefined;
  const payrollEstimate = payrollEstimateResult.results[0] as { total_minutes: number } | undefined;
  const todaySessionsResult = (await db.prepare(
    `SELECT id, shift_id, employee_email, opened_at, closed_at
     FROM attendance_sessions
     WHERE store_id = ? AND date(opened_at, '+7 hours') = date('now', '+7 hours')
     ORDER BY opened_at ASC LIMIT 250`,
  ).bind(auth.actor.storeId).all()) as { results: Array<{ id: string; shift_id: string | null; employee_email: string; opened_at: string; closed_at: string | null }> };

  return Response.json(
    {
      metrics: {
        activeStaff: active?.count ?? 0,
        pendingExceptions: exceptions?.count ?? 0,
        checklistDone,
        checklistTotal,
        checklistIncomplete,
        incompleteChecklistItems,
        openIncidents: incidents?.count ?? 0,
        pendingRequests: pendingRequests?.count ?? 0,
        monthWorkedMinutes: payrollEstimate?.total_minutes ?? 0,
      },
      activeStaffList: activeStaffListResult.results,
      todayShifts: todayShiftsResult.results,
      todaySessions: todaySessionsResult.results ?? [],
      nextShifts: nextShifts.results,
      latestHandover: handover ?? null,
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
