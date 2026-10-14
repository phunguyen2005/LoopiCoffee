import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export async function applySwap(
  db: D1Database,
  actor: AccessActor,
  input: {
    requestId: string;
    shift1Id: string;
    shift2Id: string;
  }
) {
  if (!input.requestId || !input.shift1Id || !input.shift2Id) {
    throw new ApplicationError("Thiếu thông tin yêu cầu đổi ca hoặc mã ca làm.");
  }

  if (!["owner", "manager", "team_lead"].includes(actor.role)) {
    throw new ApplicationError("Bạn không có quyền áp dụng đổi ca.", 403, "forbidden");
  }

  // 1. Fetch request
  const request = await db.prepare(
    `SELECT r.id, r.store_id, r.employee_email, r.type, r.status, r.shift_id
     FROM requests r WHERE r.id = ? AND r.store_id = ?`
  ).bind(input.requestId, actor.storeId).first<{
    id: string; store_id: string; employee_email: string; type: string; status: string; shift_id: string | null;
  }>();

  if (!request) {
    throw new ApplicationError("Yêu cầu không tồn tại.", 404, "not_found");
  }

  if (request.type !== "swap") {
    throw new ApplicationError("Yêu cầu không phải loại đổi ca.", 400);
  }

  if (request.status !== "pending" && request.status !== "approved_pending_apply" && request.status !== "approved") {
    throw new ApplicationError("Yêu cầu không ở trạng thái hợp lệ để áp dụng đổi ca.", 409, "request_conflict");
  }

  // 2. Fetch shifts
  const shift1 = await db.prepare(
    `SELECT s.id, s.store_id, s.employee_email, s.starts_at, s.ends_at, s.status, s.revision, e.role, e.status AS emp_status
     FROM shifts s
     LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email) AND e.store_id = s.store_id
     WHERE s.id = ? AND s.store_id = ?`
  ).bind(input.shift1Id, actor.storeId).first<{
    id: string; store_id: string; employee_email: string; starts_at: string; ends_at: string; status: string; revision: number; role: string | null; emp_status: string | null;
  }>();

  const shift2 = await db.prepare(
    `SELECT s.id, s.store_id, s.employee_email, s.starts_at, s.ends_at, s.status, s.revision, e.role, e.status AS emp_status
     FROM shifts s
     LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email) AND e.store_id = s.store_id
     WHERE s.id = ? AND s.store_id = ?`
  ).bind(input.shift2Id, actor.storeId).first<{
    id: string; store_id: string; employee_email: string; starts_at: string; ends_at: string; status: string; revision: number; role: string | null; emp_status: string | null;
  }>();

  if (!shift1 || !shift2) {
    throw new ApplicationError("Một trong hai ca không tồn tại trong cửa hàng.", 404, "not_found");
  }

  if (shift1.status !== "published" || shift2.status !== "published") {
    throw new ApplicationError("Chỉ có thể đổi hai ca đã xuất bản (published).", 409, "shift_conflict");
  }

  if (shift1.emp_status !== "active" || shift2.emp_status !== "active") {
    throw new ApplicationError("Cả hai nhân viên trong ca phải đang hoạt động.", 409, "employee_not_active");
  }

  // Anti-self-approval (DEC-001)
  if (
    actor.email.trim().toLowerCase() === shift1.employee_email.trim().toLowerCase() ||
    actor.email.trim().toLowerCase() === shift2.employee_email.trim().toLowerCase() ||
    actor.email.trim().toLowerCase() === request.employee_email.trim().toLowerCase()
  ) {
    throw new ApplicationError("Bạn không thể tự duyệt hoặc áp dụng đổi ca của chính mình.", 403, "self_approval_blocked");
  }

  // Team lead scoping (DEC-001)
  if (actor.role === "team_lead") {
    if ((shift1.role && shift1.role !== "employee") || (shift2.role && shift2.role !== "employee")) {
      throw new ApplicationError("Trưởng ca chỉ có quyền đổi ca giữa các nhân viên.", 403, "forbidden");
    }
  }

  // Manager scoping (DEC-001)
  if (actor.role === "manager") {
    if (
      (shift1.role && ["owner", "manager"].includes(shift1.role)) ||
      (shift2.role && ["owner", "manager"].includes(shift2.role))
    ) {
      throw new ApplicationError("Quản lý không có quyền đổi ca của Quản lý hoặc Chủ quán.", 403, "forbidden");
    }
  }

  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();

  try {
    await db.batch([
      // Update shift 1 to employee 2
      db.prepare(
        `UPDATE shifts SET employee_email = ?, revision = revision + 1
         WHERE id = ? AND store_id = ? AND revision = ? AND status = 'published'
         AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = shifts.id)
         AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = shifts.store_id AND p.status IN ('finalized', 'paid') AND p.period_start < shifts.ends_at AND p.period_end > shifts.starts_at)`
      ).bind(shift2.employee_email, shift1.id, actor.storeId, shift1.revision),

      // Update shift 2 to employee 1
      db.prepare(
        `UPDATE shifts SET employee_email = ?, revision = revision + 1
         WHERE id = ? AND store_id = ? AND revision = ? AND status = 'published'
         AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = shifts.id)
         AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = shifts.store_id AND p.status IN ('finalized', 'paid') AND p.period_start < shifts.ends_at AND p.period_end > shifts.starts_at)`
      ).bind(shift1.employee_email, shift2.id, actor.storeId, shift2.revision),

      // Update request status to 'applied'
      db.prepare(
        `UPDATE requests SET status = 'applied', reviewer_email = ?, reviewed_at = ?
         WHERE id = ? AND store_id = ? AND status IN ('pending', 'approved_pending_apply', 'approved')`
      ).bind(actor.email, now, input.requestId, actor.storeId),

      // Audit and notifications
      auditStatement(db, actor.email, "request", input.requestId, "request.applied", { shift1Id: shift1.id, shift2Id: shift2.id, employee1: shift1.employee_email, employee2: shift2.employee_email }, now, true, commandId),
      db.prepare(
        "INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at) VALUES (?, ?, 'shift_swapped', 'Ca làm việc của bạn đã được đổi thành công.', '/app/schedule', ?)"
      ).bind(crypto.randomUUID(), shift1.employee_email, now),
      db.prepare(
        "INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at) VALUES (?, ?, 'shift_swapped', 'Ca làm việc của bạn đã được đổi thành công.', '/app/schedule', ?)"
      ).bind(crypto.randomUUID(), shift2.employee_email, now),
    ]);
  } catch {
    throw new ApplicationError("Không thể áp dụng đổi ca do xung đột lịch hoặc ca đã thay đổi.", 409, "swap_conflict");
  }

  return { applied: true, requestId: input.requestId, shift1Id: shift1.id, shift2Id: shift2.id, status: "applied" };
}
