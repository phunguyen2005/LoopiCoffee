import { auditStatement } from "../../../server/audit.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import type { AccessActor } from "../../people/domain/access.ts";

export async function decideRequest(db: D1Database, actor: AccessActor, id: string, decision: "approved" | "rejected") {
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();

  const targetRequest = await db.prepare(
    `SELECT r.id, r.type, r.title, r.status, r.employee_email, emp.role AS employee_role
     FROM requests r
     LEFT JOIN employees emp ON lower(emp.email) = lower(r.employee_email) AND emp.store_id = r.store_id
     WHERE r.id = ? AND r.store_id = ?`,
  ).bind(id, actor.storeId).first<{
    id: string;
    type: string;
    title: string;
    status: string;
    employee_email: string;
    employee_role: string | null;
  }>();

  if (!targetRequest || targetRequest.status !== "pending") {
    throw new ApplicationError("Yêu cầu không còn chờ duyệt, ca đã thay đổi hoặc kỳ lương đã khóa.", 409, "request_conflict");
  }

  // DEC-001: Anti-self-approval - checked before role so any actor attempting self-approval gets self_approval_blocked
  if (actor.email.trim().toLowerCase() === targetRequest.employee_email.trim().toLowerCase()) {
    throw new ApplicationError("Bạn không thể tự phê duyệt yêu cầu của chính mình.", 403, "self_approval_blocked");
  }

  if (!["owner", "manager", "team_lead"].includes(actor.role)) {
    throw new ApplicationError("Bạn không có quyền duyệt yêu cầu.", 403, "forbidden");
  }

  // DEC-001: Team lead scoping - can only approve swaps between regular employees
  if (actor.role === "team_lead") {
    if (targetRequest.type !== "swap") {
      throw new ApplicationError("Trưởng ca chỉ có quyền duyệt yêu cầu đổi ca giữa các nhân viên.", 403, "forbidden");
    }
    if (targetRequest.employee_role && targetRequest.employee_role !== "employee") {
      throw new ApplicationError("Trưởng ca không có quyền duyệt yêu cầu của Quản lý hoặc Chủ quán.", 403, "forbidden");
    }
  }

  // DEC-001: Manager scoping - cannot approve requests of another manager or owner
  if (actor.role === "manager") {
    if (targetRequest.employee_role && ["owner", "manager", "system_admin"].includes(targetRequest.employee_role)) {
      throw new ApplicationError("Quản lý không có quyền duyệt yêu cầu của Quản lý hoặc Chủ quán.", 403, "forbidden");
    }
  }

  const results = await db.batch([
    db.prepare(
      `UPDATE requests SET status = ?, reviewer_email = ?, reviewed_at = ?
       WHERE id = ? AND store_id = ? AND status = 'pending'
       AND (? = 'rejected' OR type <> 'leave' OR shift_id IS NULL OR EXISTS (
         SELECT 1 FROM shifts s WHERE s.id = requests.shift_id AND s.store_id = requests.store_id
           AND lower(s.employee_email) = lower(requests.employee_email) AND s.status = 'published'
           AND s.approved_leave_request_id IS NULL AND s.starts_at = requests.starts_at AND s.ends_at = requests.ends_at
           AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = s.store_id AND p.status IN ('finalized', 'paid') AND p.period_start < s.ends_at AND p.period_end > s.starts_at)))`,
    ).bind(decision, actor.email, now, id, actor.storeId, decision),
    auditStatement(db, actor.email, "request", id, `request.${decision}`, {}, now, true, commandId),
    db.prepare(
      `UPDATE shifts SET approved_leave_request_id = ?, revision = revision + 1
       WHERE id = (SELECT shift_id FROM requests WHERE id = ? AND type = 'leave') AND ? = 'approved'
       AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(id, id, decision, commandId),
    db.prepare(
      `INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
       SELECT ?, employee_email, 'request_decision',
         CASE
           WHEN ? = 'rejected' THEN 'Đã từ chối: ' || title
           WHEN type = 'swap' THEN 'Đã duyệt nguyên tắc (chờ xếp lại lịch): ' || title
           WHEN type = 'correction' THEN 'Đã duyệt nguyên tắc (chờ điều chỉnh công): ' || title
           ELSE 'Đã duyệt: ' || title
         END,
         '/app/requests', ?
       FROM requests WHERE id = ? AND store_id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(crypto.randomUUID(), decision, now, id, actor.storeId, commandId),
  ]);
  if (!results[0].meta.changes) throw new ApplicationError("Yêu cầu không còn chờ duyệt, ca đã thay đổi hoặc kỳ lương đã khóa.", 409, "request_conflict");

  const coverageWarning = results[2].meta.changes > 0
    ? "Ca đã đánh dấu nghỉ được duyệt. Quản lý cần bố trí người thay; hệ thống chưa tự xếp người."
    : decision === "approved" && targetRequest.type === "swap"
      ? "Đề nghị đổi ca đã duyệt nguyên tắc. Quản lý cần chủ động cập nhật lại Lịch làm việc để áp dụng thay đổi."
      : decision === "approved" && targetRequest.type === "correction"
        ? "Đề nghị sửa chấm công đã duyệt nguyên tắc. Quản lý cần chủ động điều chỉnh giờ công trong mục Chấm công."
        : null;

  return {
    updated: true,
    status: decision,
    coverageWarning,
    guidance: coverageWarning,
    requiresManualAction: decision === "approved" && (targetRequest.type === "swap" || targetRequest.type === "correction"),
  };
}
