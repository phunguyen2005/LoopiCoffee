import { auditStatement } from "../../../server/audit.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import type { AccessActor } from "../../people/domain/access.ts";

export async function decideRequest(db: D1Database, actor: AccessActor, id: string, decision: "approved" | "rejected") {
  if (!["owner", "manager", "team_lead", "system_admin"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền duyệt yêu cầu.", 403, "forbidden");
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(      `UPDATE requests SET status = ?, reviewer_email = ?, reviewed_at = ?
       WHERE id = ? AND store_id = ? AND status = 'pending'
       AND (? = 'rejected' OR type <> 'leave' OR shift_id IS NULL OR EXISTS (
         SELECT 1 FROM shifts s WHERE s.id = requests.shift_id AND s.store_id = requests.store_id
           AND lower(s.employee_email) = lower(requests.employee_email) AND s.status = 'published'
           AND s.approved_leave_request_id IS NULL AND s.starts_at = requests.starts_at AND s.ends_at = requests.ends_at
           AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = s.store_id AND p.status IN ('finalized', 'paid') AND p.period_start < s.ends_at AND p.period_end > s.starts_at)))`,
    ).bind(decision, actor.email, now, id, actor.storeId, decision),
    auditStatement(db, actor.email, "request", id, `request.${decision}`, {}, now, true, commandId),
    db.prepare(      `UPDATE shifts SET approved_leave_request_id = ?, revision = revision + 1
       WHERE id = (SELECT shift_id FROM requests WHERE id = ? AND type = 'leave') AND ? = 'approved'
       AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(id, id, decision, commandId),
    db.prepare(      `INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
       SELECT ?, employee_email, 'request_decision', ? || title, '/app/requests', ?
       FROM requests WHERE id = ? AND store_id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(crypto.randomUUID(), decision === "approved" ? "Đã duyệt: " : "Đã từ chối: ", now, id, actor.storeId, commandId),
  ]);
  if (!results[0].meta.changes) throw new ApplicationError("Yêu cầu không còn chờ duyệt, ca đã thay đổi hoặc kỳ lương đã khóa.", 409, "request_conflict");
  return { updated: true, status: decision, coverageWarning: results[2].meta.changes > 0 ? "Ca đã đánh dấu nghỉ được duyệt. Quản lý cần bố trí người thay; hệ thống chưa tự xếp người." : null };
}
