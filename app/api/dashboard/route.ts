import { ensureDatabase } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";
import { businessDate } from "@/modules/operations/domain/business-day";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const [
    activeResult,
    exceptionsResult,
    checklistResult,
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
      `SELECT COUNT(*) AS total, SUM(CASE WHEN x.completed = 1 THEN 1 ELSE 0 END) AS done
       FROM checklist_items i LEFT JOIN checklist_executions x ON x.item_id=i.id AND x.business_date=? WHERE i.store_id = ?`,
    ).bind(businessDate(),auth.actor.storeId),
    db.prepare(
      "SELECT COUNT(*) AS count FROM incidents WHERE store_id = ? AND status IN ('open', 'acknowledged')",
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT s.id, s.starts_at, s.ends_at, s.role_label,
              COALESCE(e.display_name, s.employee_email) AS employee_name
       FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
       WHERE s.store_id = ? AND s.status IN ('published', 'completed') AND s.ends_at >= ?
       ORDER BY s.starts_at LIMIT 5`,
    ).bind(auth.actor.storeId, new Date().toISOString()),
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
         AND date(s.starts_at,'+7 hours') = date('now','+7 hours')
       ORDER BY s.starts_at ASC LIMIT 250`,
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT COALESCE(SUM(worked_minutes), 0) AS total_minutes
       FROM attendance_sessions
       WHERE store_id = ? AND strftime('%Y-%m', opened_at,'+7 hours') = strftime('%Y-%m', 'now','+7 hours')`,
    ).bind(auth.actor.storeId),
  ]);

  const active = activeResult.results[0] as { count: number } | undefined;
  const exceptions = exceptionsResult.results[0] as { count: number } | undefined;
  const checklist = checklistResult.results[0] as { total: number; done: number } | undefined;
  const incidents = incidentsResult.results[0] as { count: number } | undefined;
  const handover = handoverResult.results[0];
  const pendingRequests = pendingRequestsResult.results[0] as { count: number } | undefined;
  const payrollEstimate = payrollEstimateResult.results[0] as { total_minutes: number } | undefined;

  return Response.json(
    {
      metrics: {
        activeStaff: active?.count ?? 0,
        pendingExceptions: exceptions?.count ?? 0,
        checklistDone: checklist?.done ?? 0,
        checklistTotal: checklist?.total ?? 0,
        openIncidents: incidents?.count ?? 0,
        pendingRequests: pendingRequests?.count ?? 0,
        monthWorkedMinutes: payrollEstimate?.total_minutes ?? 0,
      },
      activeStaffList: activeStaffListResult.results,
      todayShifts: todayShiftsResult.results,
      nextShifts: nextShifts.results,
      latestHandover: handover ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
