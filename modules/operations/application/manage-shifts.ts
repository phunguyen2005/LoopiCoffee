import type { AccessActor } from "../../people/domain/access.ts";
import { attendanceTime } from "../../attendance/application/correct-attendance.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

type ShiftInput = { startsAt: unknown; endsAt: unknown; roleLabel?: unknown; isShiftLead?: unknown };
function authorize(actor: AccessActor) {
  if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền quản lý ca.", 403, "forbidden");
}
function parseShift(input: ShiftInput) {
  const startsAt = attendanceTime(input.startsAt), endsAt = attendanceTime(input.endsAt);
  if (endsAt <= startsAt || Date.parse(endsAt) - Date.parse(startsAt) > 24 * 60 * 60_000) throw new ApplicationError("Ca phải dài hơn 0 giờ và không quá 24 giờ.");
  if (input.roleLabel !== undefined && typeof input.roleLabel !== "string") throw new ApplicationError("Vị trí ca không hợp lệ.");
  if (input.isShiftLead !== undefined && typeof input.isShiftLead !== "boolean") throw new ApplicationError("Thông tin trưởng ca không hợp lệ.");
  return { startsAt, endsAt, roleLabel: (input.roleLabel as string | undefined)?.trim().slice(0, 60) || "Nhân viên", isShiftLead: input.isShiftLead ? 1 : 0 };
}
function shiftError(error: unknown): never {
  if (error instanceof Error && error.message.includes("shift_overlap")) throw new ApplicationError("Ca bị trùng giờ. Chưa có ca nào trong lần gửi này được lưu; hãy tải lại lịch.", 409, "shift_conflict");
  if (error instanceof Error && error.message.includes("shift_locked_period")) throw new ApplicationError("Ca thuộc kỳ lương đã khóa. Hãy mở lại kỳ trước khi thay đổi lịch.", 409, "shift_conflict");
  throw error;
}

export async function createShifts(db: D1Database, actor: AccessActor, employeeEmail: unknown, inputs: ShiftInput[]) {
  authorize(actor);
  if (typeof employeeEmail !== "string" || !employeeEmail.trim()) throw new ApplicationError("Chưa chọn nhân viên.");
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 31 || inputs.some((item) => !item || typeof item !== "object")) throw new ApplicationError("Mỗi lần tạo từ 1 đến 31 ca.");
  const email = employeeEmail.trim().toLowerCase();
  const employee = await db.prepare("SELECT id, role FROM employees WHERE lower(email) = ? AND store_id = ? AND status = 'active'").bind(email, actor.storeId).first<{ id: string; role: string }>();
  if (!employee) throw new ApplicationError("Nhân viên chưa hoạt động trong cửa hàng.", 404, "not_found");
  if (actor.role === "team_lead" && ["owner", "manager"].includes(employee.role)) {
    throw new ApplicationError("Trưởng ca không có quyền tạo ca cho quản lý hoặc chủ quán.", 403, "forbidden");
  }
  const shifts = inputs.map(parseShift).map((shift) => ({ ...shift, id: crypto.randomUUID() }));
  const now = new Date().toISOString();
  try {
    await db.batch(shifts.flatMap((shift) => [
      db.prepare(`INSERT INTO shifts (id, store_id, employee_email, starts_at, ends_at, timezone_snapshot, role_label, is_shift_lead, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'Asia/Ho_Chi_Minh', ?, ?, 'published', ?)`)
        .bind(shift.id, actor.storeId, email, shift.startsAt, shift.endsAt, shift.roleLabel, shift.isShiftLead, now),
      db.prepare("INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at) VALUES (?, ?, 'shift_published', 'Bạn có ca làm mới trong lịch.', '/app/schedule', ?)").bind(crypto.randomUUID(), email, now),
      auditStatement(db, actor.email, "shift", shift.id, "shift.published", { employeeEmail: email }, now),
    ]));
  } catch (error) { shiftError(error); }
  return { message: `Đã xuất bản ${shifts.length} ca làm việc.`, shifts: shifts.map((shift) => ({ id: shift.id, employee_email: email, starts_at: shift.startsAt, ends_at: shift.endsAt, role_label: shift.roleLabel, is_shift_lead: shift.isShiftLead, status: "published", revision: 0 })) };
}

export async function changeShift(db: D1Database, actor: AccessActor, input: { id: string; action: "edit" | "cancel"; expectedRevision: number; startsAt?: unknown; endsAt?: unknown; roleLabel?: unknown; isShiftLead?: unknown }) {
  authorize(actor);
  if (!input.id || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new ApplicationError("Thông tin phiên bản ca không hợp lệ.");
  const existingShift = await db.prepare("SELECT s.id, s.employee_email, e.role FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email) AND e.store_id = s.store_id WHERE s.id = ? AND s.store_id = ?").bind(input.id, actor.storeId).first<{ id: string; employee_email: string; role: string | null }>();
  if (!existingShift) throw new ApplicationError("Ca làm không tồn tại.", 404, "not_found");
  if (actor.role === "team_lead" && existingShift.role && ["owner", "manager"].includes(existingShift.role)) {
    throw new ApplicationError("Trưởng ca không có quyền sửa hoặc hủy ca của quản lý hoặc chủ quán.", 403, "forbidden");
  }
  const shift = input.action === "edit" ? parseShift(input as ShiftInput) : null;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  let result;
  try {
    result = await db.batch([
      db.prepare(`UPDATE shifts SET status = ?, starts_at = COALESCE(?, starts_at), ends_at = COALESCE(?, ends_at), role_label = COALESCE(?, role_label), is_shift_lead = COALESCE(?, is_shift_lead), revision = revision + 1
        WHERE id = ? AND store_id = ? AND revision = ? AND status IN ('draft', 'published') AND approved_leave_request_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = shifts.id)
        AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = shifts.store_id AND p.status IN ('finalized', 'paid') AND p.period_start < MAX(shifts.ends_at, COALESCE(?, shifts.ends_at)) AND p.period_end > MIN(shifts.starts_at, COALESCE(?, shifts.starts_at)))`)
        .bind(input.action === "cancel" ? "cancelled" : "published", shift?.startsAt ?? null, shift?.endsAt ?? null, shift?.roleLabel ?? null, shift?.isShiftLead ?? null, input.id, actor.storeId, input.expectedRevision, shift?.endsAt ?? null, shift?.startsAt ?? null),
      auditStatement(db, actor.email, "shift", input.id, `shift.${input.action === "cancel" ? "cancelled" : "updated"}`, {}, now, true, commandId),
      db.prepare(`INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
        SELECT ?, employee_email, 'shift_changed', ?, '/app/schedule', ? FROM shifts WHERE id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`)
        .bind(crypto.randomUUID(), input.action === "cancel" ? "Một ca làm đã được hủy. Hãy kiểm tra lịch." : "Một ca làm đã thay đổi. Hãy kiểm tra lịch.", now, input.id, commandId),
    ]);
  } catch (error) { shiftError(error); }
  if (!result![0].meta.changes) throw new ApplicationError("Ca vừa thay đổi, đã có chấm công/nghỉ được duyệt hoặc thuộc kỳ lương đã khóa.", 409, "shift_conflict");
  return { updated: true };
}
