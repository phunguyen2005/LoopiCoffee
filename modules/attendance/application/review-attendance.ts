import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export async function reviewAttendance(db: D1Database, actor: AccessActor, eventId: string, decision: "approved" | "rejected", note = "") {
  if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền duyệt công.", 403, "forbidden");
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(
      `UPDATE attendance_exceptions SET status = ?, reviewer_email = ?, reviewer_note = ?, reviewed_at = ?
       WHERE event_id = ? AND status = 'pending' AND EXISTS (
         SELECT 1 FROM attendance_events e JOIN attendance_sessions s ON s.id = e.session_id
         WHERE e.id = attendance_exceptions.event_id AND s.store_id = ?
         AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = s.store_id AND p.status IN ('finalized', 'paid')
           AND p.period_start <= COALESCE(s.closed_at, s.opened_at) AND p.period_end > COALESCE(s.opened_at, s.closed_at)))`,
    ).bind(decision, actor.email, note.trim().slice(0, 500), now, eventId, actor.storeId),
    auditStatement(db, actor.email, "attendance_event", eventId, `attendance.review_${decision}`, { hasReviewerNote: Boolean(note.trim()) }, now, true, commandId),
    db.prepare("UPDATE attendance_events SET review_required = ? WHERE id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)").bind(decision === "approved" ? 0 : 1, eventId, commandId),
    db.prepare(
      `UPDATE attendance_sessions SET revision = revision + 1, status = CASE
       WHEN EXISTS (SELECT 1 FROM attendance_events e LEFT JOIN attendance_exceptions x ON x.event_id = e.id WHERE e.session_id = attendance_sessions.id AND (e.review_required = 1 OR x.status = 'rejected')) THEN 'review_required'
       WHEN opened_at IS NOT NULL AND closed_at IS NOT NULL THEN 'completed' ELSE 'open' END
       WHERE id = (SELECT session_id FROM attendance_events WHERE id = ?) AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(eventId, commandId),
  ]);
  if (!result[0].meta.changes) throw new ApplicationError("Ngoại lệ không còn chờ duyệt hoặc kỳ lương đã khóa.", 409, "attendance_conflict");
  return { updated: true, eventId, status: decision };
}
