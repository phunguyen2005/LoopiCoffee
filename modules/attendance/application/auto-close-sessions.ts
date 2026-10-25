import { auditStatement } from "../../../server/audit.ts";

export async function autoCloseForgottenSessions(
  db: D1Database,
  storeId: string,
  referenceTime?: string,
) {
  const now = referenceTime ? new Date(referenceTime) : new Date();
  const nowIso = now.toISOString();

  // DEC-004: Find open sessions linked to a shift that ended > 4 hours ago
  const openSessions = await db.prepare(
    `SELECT s.id, s.employee_email, s.opened_at, s.shift_id, sh.ends_at AS shift_ends_at
     FROM attendance_sessions s
     JOIN shifts sh ON sh.id = s.shift_id
     WHERE s.store_id = ? AND s.closed_at IS NULL AND datetime(sh.ends_at, '+4 hours') <= datetime(?)`
  ).bind(storeId, nowIso).all<{
    id: string;
    employee_email: string;
    opened_at: string;
    shift_id: string;
    shift_ends_at: string;
  }>();

  if (!openSessions.results.length) {
    return { closedCount: 0, sessions: [] };
  }

  const closedSessions = [];
  for (const session of openSessions.results) {
    const autoClosedAt = new Date(Date.parse(session.shift_ends_at) + 4 * 60 * 60 * 1000).toISOString();
    const commandId = crypto.randomUUID();
    const exceptionId = crypto.randomUUID();

    const results = await db.batch([
      // Close session with 0 worked_minutes and status 'review_required'
      db.prepare(
        `UPDATE attendance_sessions
         SET closed_at = ?, worked_minutes = 0, status = 'review_required', revision = revision + 1
         WHERE id = ? AND closed_at IS NULL`
      ).bind(autoClosedAt, session.id),

      // Create attendance exception MISSING_CHECKOUT
      db.prepare(
        `INSERT INTO attendance_exceptions (id, event_id, employee_reason, status, reviewer_note, created_at)
         SELECT ?, (SELECT id FROM attendance_events WHERE session_id = ? AND action = 'check_in' LIMIT 1),
                'MISSING_CHECKOUT: Hệ thống tự động đóng phiên sau 4 giờ kết thúc ca làm.',
                'pending', 'Tự động đóng phiên do quên checkout', ?
         WHERE changes() = 1
           AND NOT EXISTS (
             SELECT 1 FROM attendance_exceptions x JOIN attendance_events e ON e.id = x.event_id
             WHERE e.session_id = ? AND x.employee_reason LIKE 'MISSING_CHECKOUT:%'
           )`
      ).bind(exceptionId, session.id, autoClosedAt, session.id),

      auditStatement(db, "system", "attendance_session", session.id, "attendance.auto_closed", {
        reason: "MISSING_CHECKOUT",
        shiftEndsAt: session.shift_ends_at,
        autoClosedAt,
      }, autoClosedAt, true, commandId),
    ]);
    if (results[0].meta.changes) closedSessions.push({ id: session.id, autoClosedAt });
  }

  return { closedCount: closedSessions.length, sessions: closedSessions };
}
