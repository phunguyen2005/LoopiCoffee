import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const [activeResult, exceptionsResult, checklistResult, incidentsResult, nextShifts, handoverResult] = await db.batch([
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
      `SELECT COUNT(*) AS total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS done
       FROM checklist_items WHERE store_id = ?`,
    ).bind(auth.actor.storeId),
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
  ]);
  const active = activeResult.results[0] as { count: number } | undefined;
  const exceptions = exceptionsResult.results[0] as { count: number } | undefined;
  const checklist = checklistResult.results[0] as { total: number; done: number } | undefined;
  const incidents = incidentsResult.results[0] as { count: number } | undefined;
  const handover = handoverResult.results[0];
  return Response.json({
    metrics: {
      activeStaff: active?.count ?? 0,
      pendingExceptions: exceptions?.count ?? 0,
      checklistDone: checklist?.done ?? 0,
      checklistTotal: checklist?.total ?? 0,
      openIncidents: incidents?.count ?? 0,
    },
    nextShifts: nextShifts.results,
    latestHandover: handover ?? null,
  });
}
