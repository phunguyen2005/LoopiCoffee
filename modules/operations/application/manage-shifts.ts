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

export async function createShifts(
  db: D1Database,
  actor: AccessActor,
  employeeEmail: unknown,
  inputs: ShiftInput[],
  options?: { status?: "draft" | "published" }
) {
  authorize(actor);
  const targetStatus = options?.status === "draft" ? "draft" : "published";
  if (targetStatus === "draft" && actor.role === "team_lead") {
    throw new ApplicationError("Trưởng ca không có quyền tạo ca nháp.", 403, "forbidden");
  }
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
    await db.batch(shifts.flatMap((shift) => {
      const stmts = [
        db.prepare(`INSERT INTO shifts (id, store_id, employee_email, starts_at, ends_at, timezone_snapshot, role_label, is_shift_lead, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'Asia/Ho_Chi_Minh', ?, ?, ?, ?)`)
          .bind(shift.id, actor.storeId, email, shift.startsAt, shift.endsAt, shift.roleLabel, shift.isShiftLead, targetStatus, now),
        auditStatement(db, actor.email, "shift", shift.id, targetStatus === "draft" ? "shift.draft_created" : "shift.published", { employeeEmail: email }, now),
      ];
      if (targetStatus === "published") {
        stmts.push(
          db.prepare("INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at) VALUES (?, ?, 'shift_published', 'Bạn có ca làm mới trong lịch.', '/app/schedule', ?)").bind(crypto.randomUUID(), email, now)
        );
      }
      return stmts;
    }));
  } catch (error) { shiftError(error); }
  return {
    message: targetStatus === "draft" ? `Đã lưu ${shifts.length} ca nháp.` : `Đã xuất bản ${shifts.length} ca làm việc.`,
    shifts: shifts.map((shift) => ({ id: shift.id, employee_email: email, starts_at: shift.startsAt, ends_at: shift.endsAt, role_label: shift.roleLabel, is_shift_lead: shift.isShiftLead, status: targetStatus, revision: 0 }))
  };
}

export async function publishShifts(db: D1Database, actor: AccessActor, shiftIds: string[]) {
  authorize(actor);
  if (actor.role === "team_lead") throw new ApplicationError("Trưởng ca không có quyền xuất bản lịch làm việc.", 403, "forbidden");
  if (!Array.isArray(shiftIds) || !shiftIds.length) throw new ApplicationError("Chưa chọn ca cần xuất bản.");
  const now = new Date().toISOString();

  const targetShifts = await db.prepare(
    `SELECT s.id, s.employee_email, s.status, emp.status AS emp_status
     FROM shifts s
     LEFT JOIN employees emp ON lower(emp.email) = lower(s.employee_email) AND emp.store_id = s.store_id
     WHERE s.id IN (${shiftIds.map(() => "?").join(",")}) AND s.store_id = ?`
  ).bind(...shiftIds, actor.storeId).all<{
    id: string; employee_email: string; status: string; emp_status: string | null;
  }>();

  if (targetShifts.results.length !== shiftIds.length) {
    throw new ApplicationError("Một số ca không tồn tại trong cửa hàng.", 404, "not_found");
  }
  for (const s of targetShifts.results) {
    if (s.status !== "draft") throw new ApplicationError("Chỉ có thể xuất bản ca ở trạng thái nháp.", 409, "shift_conflict");
    if (s.emp_status !== "active") throw new ApplicationError(`Nhân viên ${s.employee_email} không còn hoạt động. Không thể xuất bản ca.`, 409, "employee_not_active");
  }

  try {
    await db.batch(targetShifts.results.flatMap((s) => [
      db.prepare("UPDATE shifts SET status = 'published', revision = revision + 1 WHERE id = ? AND status = 'draft' AND store_id = ?").bind(s.id, actor.storeId),
      db.prepare("INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at) VALUES (?, ?, 'shift_published', 'Bạn có ca làm mới trong lịch.', '/app/schedule', ?)").bind(crypto.randomUUID(), s.employee_email, now),
      auditStatement(db, actor.email, "shift", s.id, "shift.published", { employeeEmail: s.employee_email }, now),
    ]));
  } catch (error) { shiftError(error); }

  return { published: true, count: targetShifts.results.length };
}

export async function changeShift(
  db: D1Database,
  actor: AccessActor,
  input: {
    id: string;
    action: "edit" | "cancel" | "adjust";
    expectedRevision: number;
    startsAt?: unknown;
    endsAt?: unknown;
    roleLabel?: unknown;
    isShiftLead?: unknown;
    reason?: unknown;
  }
) {
  authorize(actor);
  if (!input.id || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new ApplicationError("Thông tin phiên bản ca không hợp lệ.");
  const existingShift = await db.prepare(
    "SELECT s.id, s.store_id, s.employee_email, s.starts_at, s.ends_at, s.role_label, s.is_shift_lead, s.status, s.revision, e.role FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email) AND e.store_id = s.store_id WHERE s.id = ? AND s.store_id = ?"
  ).bind(input.id, actor.storeId).first<{
    id: string; store_id: string; employee_email: string; starts_at: string; ends_at: string; role_label: string; is_shift_lead: number; status: string; revision: number; role: string | null;
  }>();

  if (!existingShift) throw new ApplicationError("Ca làm không tồn tại.", 404, "not_found");
  if (actor.role === "team_lead" && existingShift.role && ["owner", "manager"].includes(existingShift.role)) {
    throw new ApplicationError("Trưởng ca không có quyền sửa hoặc hủy ca của quản lý hoặc chủ quán.", 403, "forbidden");
  }

  // DEC-002: 12-hour Cut-off logic
  const nowMs = Date.now();
  const shiftStartMs = Date.parse(existingShift.starts_at);
  const isWithin12Hours = existingShift.status === "published" && (shiftStartMs - nowMs < 12 * 60 * 60 * 1000);

  if (isWithin12Hours && (input.action === "edit" || input.action === "cancel")) {
    throw new ApplicationError(
      "Ca bắt đầu trong vòng 12 giờ. Không thể sửa hoặc hủy trực tiếp; hãy dùng luồng điều chỉnh ca có lý do.",
      409,
      "cutoff_lock_active"
    );
  }

  if (input.action === "adjust") {
    if (typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.length > 1000) {
      throw new ApplicationError("Cần lý do điều chỉnh ca từ 5 đến 1000 ký tự.");
    }
  }

  const shift = (input.action === "edit" || input.action === "adjust") ? parseShift(input as ShiftInput) : null;
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  let result;
  try {
    const isCancel = input.action === "cancel";
    const isAdjust = input.action === "adjust";
    const auditAction = isCancel ? "shift.cancelled" : isAdjust ? "shift.adjusted" : "shift.updated";
    const notifMsg = isCancel
      ? "Một ca làm đã được hủy. Hãy kiểm tra lịch."
      : isAdjust
        ? `Ca làm của bạn đã được điều chỉnh: ${input.reason}`
        : "Một ca làm đã thay đổi. Hãy kiểm tra lịch.";

    result = await db.batch([
      db.prepare(`UPDATE shifts SET status = ?, starts_at = COALESCE(?, starts_at), ends_at = COALESCE(?, ends_at), role_label = COALESCE(?, role_label), is_shift_lead = COALESCE(?, is_shift_lead), revision = revision + 1
        WHERE id = ? AND store_id = ? AND revision = ? AND status IN ('draft', 'published') AND approved_leave_request_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = shifts.id)
        AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = shifts.store_id AND p.status IN ('finalized', 'paid') AND p.period_start < MAX(shifts.ends_at, COALESCE(?, shifts.ends_at)) AND p.period_end > MIN(shifts.starts_at, COALESCE(?, shifts.starts_at)))`)
        .bind(isCancel ? "cancelled" : existingShift.status, shift?.startsAt ?? null, shift?.endsAt ?? null, shift?.roleLabel ?? null, shift?.isShiftLead ?? null, input.id, actor.storeId, input.expectedRevision, shift?.endsAt ?? null, shift?.startsAt ?? null),
      auditStatement(
        db,
        actor.email,
        "shift",
        input.id,
        auditAction,
        isAdjust ? { reason: input.reason, before: { startsAt: existingShift.starts_at, endsAt: existingShift.ends_at }, after: { startsAt: shift?.startsAt, endsAt: shift?.endsAt } } : {},
        now,
        true,
        commandId
      ),
      ...(existingShift.status === "published" ? [
        db.prepare(`INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
          SELECT ?, employee_email, 'shift_changed', ?, '/app/schedule', ? FROM shifts WHERE id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`)
          .bind(crypto.randomUUID(), notifMsg, now, input.id, commandId),
      ] : []),
    ]);
  } catch (error) { shiftError(error); }
  if (!result![0].meta.changes) throw new ApplicationError("Ca vừa thay đổi, đã có chấm công/nghỉ được duyệt hoặc thuộc kỳ lương đã khóa.", 409, "shift_conflict");
  return { updated: true, status: input.action === "cancel" ? "cancelled" : existingShift.status };
}
