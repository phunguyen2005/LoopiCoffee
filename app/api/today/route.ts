import { ensureDatabase } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";
import { businessDate } from "@/modules/operations/domain/business-day";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const now = new Date();
  const before = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
  const after = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(`${businessDate(now).slice(0,7)}-01T00:00:00+07:00`).toISOString();
  const [shiftResult, sessionResult, checklistResult, outgoingHandoverResult, incomingHandoverResult, monthStatsResult, upcomingResult] = await db.batch([
    db.prepare(
      `SELECT id, starts_at, ends_at, role_label, is_shift_lead
       FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?)
         AND status IN ('published', 'completed') AND starts_at BETWEEN ? AND ?
       ORDER BY ABS(julianday(starts_at) - julianday(?)) LIMIT 1`,
    ).bind(auth.actor.storeId, auth.actor.email, before, after, now.toISOString()),
    db.prepare(
      `SELECT s.id, s.opened_at, s.closed_at, s.worked_minutes, s.status,
              EXISTS(
                SELECT 1 FROM attendance_events ev
                JOIN attendance_exceptions ex ON ex.event_id = ev.id
                WHERE ev.session_id = s.id AND ex.employee_reason LIKE 'MISSING_CHECKOUT:%'
              ) AS missing_checkout
       FROM attendance_sessions s WHERE s.store_id = ? AND lower(s.employee_email) = lower(?)
         AND (
           s.shift_id = (
             SELECT id FROM shifts
             WHERE store_id = ? AND lower(employee_email) = lower(?)
               AND status IN ('published', 'completed') AND starts_at BETWEEN ? AND ?
             ORDER BY ABS(julianday(starts_at) - julianday(?)) LIMIT 1
           )
           OR (s.shift_id IS NULL AND COALESCE(s.opened_at, s.closed_at) BETWEEN ? AND ?)
         )
       ORDER BY COALESCE(s.opened_at, s.closed_at) DESC LIMIT 1`,
    ).bind(
      auth.actor.storeId,
      auth.actor.email,
      auth.actor.storeId,
      auth.actor.email,
      before,
      after,
      now.toISOString(),
      before,
      after,
    ),
    db.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN x.completed = 1 THEN 1 ELSE 0 END) AS done
       FROM checklist_items i LEFT JOIN checklist_executions x ON x.item_id=i.id AND x.business_date=? WHERE i.store_id = ?`,
    ).bind(businessDate(now),auth.actor.storeId),
    db.prepare(
      `SELECT id, created_at
       FROM handovers
       WHERE store_id = ? AND lower(author_email) = lower(?)
         AND created_at BETWEEN ? AND ?
       ORDER BY created_at DESC LIMIT 1`,
    ).bind(auth.actor.storeId, auth.actor.email, before, after),
    db.prepare(
      `SELECT h.id, h.summary, h.manager_attention, h.created_at,
              COALESCE(e.display_name, h.author_email) AS author_name
       FROM handovers h
       LEFT JOIN employees e ON lower(e.email) = lower(h.author_email)
       WHERE h.store_id = ? AND h.acknowledged_at IS NULL
       ORDER BY h.created_at DESC LIMIT 1`,
    ).bind(auth.actor.storeId),
    db.prepare(
      `SELECT COUNT(*) AS completed_session_count,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN worked_minutes ELSE 0 END), 0) AS approved_worked_minutes
       FROM attendance_sessions
       WHERE store_id = ? AND lower(employee_email) = lower(?)
         AND opened_at >= ? AND status = 'completed' AND closed_at IS NOT NULL`,
    ).bind(auth.actor.storeId, auth.actor.email, monthStart),
    db.prepare(
      `SELECT id, starts_at, ends_at, role_label, is_shift_lead
       FROM shifts
       WHERE store_id = ? AND lower(employee_email) = lower(?)
         AND status IN ('published', 'completed')
         AND starts_at > ?
       ORDER BY starts_at ASC
       LIMIT 3`,
    ).bind(auth.actor.storeId, auth.actor.email, now.toISOString()),
  ]);
  const shift = shiftResult.results[0];
  const session = sessionResult.results[0];
  const checklist = checklistResult.results[0];
  const outgoingHandover = outgoingHandoverResult.results[0];
  const incomingHandover = incomingHandoverResult.results[0];
  const monthStats = monthStatsResult.results[0] as { completed_session_count?: number; approved_worked_minutes?: number } | undefined;
  const upcomingShifts = upcomingResult.results as Array<{ id: string; starts_at: string; ends_at: string; role_label: string; is_shift_lead: number }>;

  return Response.json(
    {
      shift: shift ?? null,
      attendance: session ?? null,
      checklist,
      handover: outgoingHandover ?? null,
      incomingHandover: incomingHandover ?? null,
      monthStats: {
        completedSessionCount: Number(monthStats?.completed_session_count ?? 0),
        approvedWorkedMinutes: Number(monthStats?.approved_worked_minutes ?? 0),
      },
      upcomingShifts: upcomingShifts ?? [],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
