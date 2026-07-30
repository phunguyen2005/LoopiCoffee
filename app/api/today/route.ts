import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const now = new Date();
  const before = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
  const after = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();
  const [shiftResult, sessionResult, checklistResult] = await db.batch([
    db.prepare(
      `SELECT id, starts_at, ends_at, role_label, is_shift_lead
       FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?)
         AND status = 'published' AND starts_at BETWEEN ? AND ?
       ORDER BY ABS(julianday(starts_at) - julianday(?)) LIMIT 1`,
    ).bind(auth.actor.storeId, auth.actor.email, before, after, now.toISOString()),
    db.prepare(
      `SELECT id, opened_at, closed_at, worked_minutes, status
       FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?)
       ORDER BY COALESCE(opened_at, closed_at) DESC LIMIT 1`,
    ).bind(auth.actor.storeId, auth.actor.email),
    db.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS done
       FROM checklist_items WHERE store_id = ?`,
    ).bind(auth.actor.storeId),
  ]);
  const shift = shiftResult.results[0];
  const session = sessionResult.results[0];
  const checklist = checklistResult.results[0];
  return Response.json({ shift: shift ?? null, attendance: session ?? null, checklist });
}
