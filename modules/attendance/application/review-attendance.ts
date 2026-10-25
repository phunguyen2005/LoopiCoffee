import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";
import { hasGrantedPermission } from "../../people/domain/permissions.ts";

export async function reviewAttendance(db: D1Database, actor: AccessActor, eventId: string, decision: "approved" | "rejected", note = "") {
  if (!hasGrantedPermission(actor, "attendance.review")) throw new ApplicationError("Bạn không có quyền duyệt công.", 403, "permission_denied");
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();

  const targetEvent = await db.prepare(
    `SELECT e.id, e.employee_email, s.store_id, emp.role AS employee_role
     FROM attendance_events e
     JOIN attendance_sessions s ON s.id = e.session_id
     LEFT JOIN employees emp ON lower(emp.email) = lower(e.employee_email) AND emp.store_id = s.store_id
     WHERE e.id = ? AND s.store_id = ?`,
  ).bind(eventId, actor.storeId).first<{
    id: string;
    employee_email: string;
    store_id: string;
    employee_role: string | null;
  }>();

  if (!targetEvent) throw new ApplicationError("Không tìm thấy sự kiện chấm công.", 404, "not_found");

  // DEC-001: Anti-self-approval
  if (actor.email.trim().toLowerCase() === targetEvent.employee_email.trim().toLowerCase()) {
    throw new ApplicationError("Bạn không thể tự phê duyệt ngoại lệ công của chính mình.", 403, "self_approval_blocked");
  }

  // DEC-014 / DEC-001: Non-owner cannot review owner or system_admin; manager cannot review manager
  if (actor.role !== "owner" && ["owner", "system_admin"].includes(targetEvent.employee_role || "")) {
    throw new ApplicationError("Bạn không có quyền duyệt công của Chủ quán hoặc Quản trị viên hệ thống.", 403, "forbidden");
  }
  if (actor.role === "manager" && ["owner", "manager"].includes(targetEvent.employee_role || "")) {
    throw new ApplicationError("Quản lý không có quyền duyệt công của Quản lý hoặc Chủ quán.", 403, "forbidden");
  }
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
