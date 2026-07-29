import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const ownOnly = auth.actor.role === "employee" ? "AND s.employee_email = ?" : "";
  const statement = db.prepare(
    `SELECT COALESCE(e.display_name, s.employee_email) AS display_name,
            COUNT(DISTINCT s.id) AS shift_count,
            COALESCE(SUM(s.worked_minutes), 0) AS worked_minutes,
            COALESCE(SUM(CASE WHEN a.review_required = 1 THEN 1 ELSE 0 END), 0) AS exception_count
     FROM attendance_sessions s
     LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
     LEFT JOIN attendance_events a ON a.session_id = s.id
     WHERE s.store_id = ? ${ownOnly}
     GROUP BY s.employee_email, e.display_name ORDER BY display_name`,
  );
  const result = auth.actor.role === "employee"
    ? await statement.bind(auth.actor.storeId, auth.actor.email).all<{
        display_name: string; shift_count: number; worked_minutes: number; exception_count: number;
      }>()
    : await statement.bind(auth.actor.storeId).all<{
        display_name: string; shift_count: number; worked_minutes: number; exception_count: number;
      }>();
  return Response.json({
    rows: result.results.map((row) => ({
      displayName: row.display_name,
      shiftCount: row.shift_count,
      workedMinutes: row.worked_minutes,
      exceptionCount: row.exception_count,
    })),
  });
}
