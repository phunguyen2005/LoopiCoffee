import type { AccessActor } from "../../people/domain/access.ts";
import { attendanceTime } from "../../attendance/application/correct-attendance.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";
import { hasGrantedPermission, type PermissionKey } from "../../people/domain/permissions.ts";

type ShiftInput = { startsAt: unknown; endsAt: unknown; roleLabel?: unknown; isShiftLead?: unknown };
function authorize(actor: AccessActor, permission: PermissionKey) {
  if (!hasGrantedPermission(actor, permission)) throw new ApplicationError("Bạn không có quyền quản lý ca.", 403, "permission_denied");
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
  authorize(actor, "shifts.create");
  const targetStatus = options?.status === "draft" ? "draft" : "published";
  if (targetStatus === "published") authorize(actor, "shifts.publish");
  if (typeof employeeEmail !== "string" || !employeeEmail.trim()) throw new ApplicationError("Chưa chọn nhân viên.");
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 31 || inputs.some((item) => !item || typeof item !== "object")) throw new ApplicationError("Mỗi lần tạo từ 1 đến 31 ca.");
  const email = employeeEmail.trim().toLowerCase();
  const employee = await db.prepare("SELECT id, role FROM employees WHERE lower(email) = ? AND store_id = ? AND status = 'active'").bind(email, actor.storeId).first<{ id: string; role: string }>();
  if (!employee) throw new ApplicationError("Nhân viên chưa hoạt động trong cửa hàng.", 404, "not_found");
  if (actor.role !== "owner" && ["owner", "system_admin"].includes(employee.role)) {
    throw new ApplicationError("Bạn không có quyền tạo ca cho Chủ quán hoặc Quản trị viên hệ thống.", 403, "forbidden");
  }
  if (actor.role === "team_lead" && !actor.roleId && ["owner", "manager"].includes(employee.role)) {
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
  authorize(actor, "shifts.publish");
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
  authorize(actor, input.action === "cancel" ? "shifts.cancel" : "shifts.adjust");
  if (!input.id || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new ApplicationError("Thông tin phiên bản ca không hợp lệ.");
  const existingShift = await db.prepare(
    "SELECT s.id, s.store_id, s.employee_email, s.starts_at, s.ends_at, s.role_label, s.is_shift_lead, s.status, s.revision, e.role FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email) AND e.store_id = s.store_id WHERE s.id = ? AND s.store_id = ?"
  ).bind(input.id, actor.storeId).first<{
    id: string; store_id: string; employee_email: string; starts_at: string; ends_at: string; role_label: string; is_shift_lead: number; status: string; revision: number; role: string | null;
  }>();

  if (!existingShift) throw new ApplicationError("Ca làm không tồn tại.", 404, "not_found");
  if (actor.role !== "owner" && existingShift.role && ["owner", "system_admin"].includes(existingShift.role)) {
    throw new ApplicationError("Bạn không có quyền sửa hoặc hủy ca của Chủ quán hoặc Quản trị viên hệ thống.", 403, "forbidden");
  }
  if (actor.role === "team_lead" && !actor.roleId && existingShift.role && ["owner", "manager"].includes(existingShift.role)) {
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

  const updateResult = result![0];
  if (!updateResult.meta.changes) {
    const check = await db.prepare(
      `SELECT s.revision, s.status, s.approved_leave_request_id,
              EXISTS(SELECT 1 FROM attendance_sessions a WHERE a.shift_id = s.id) AS has_attendance,
              EXISTS(
                SELECT 1 FROM payroll_periods p
                WHERE p.store_id = s.store_id AND p.status IN ('finalized', 'paid')
                  AND p.period_start < MAX(s.ends_at, COALESCE(?, s.ends_at))
                  AND p.period_end > MIN(s.starts_at, COALESCE(?, s.starts_at))
              ) AS has_payroll_lock
       FROM shifts s WHERE s.id = ? AND s.store_id = ?`,
    ).bind(shift?.endsAt ?? null, shift?.startsAt ?? null, input.id, actor.storeId).first<{
      revision: number;
      status: string;
      approved_leave_request_id: string | null;
      has_attendance: number;
      has_payroll_lock: number;
    }>();

    if (!check) {
      throw new ApplicationError("Ca làm không tồn tại.", 404, "not_found");
    }
    if (check.revision !== input.expectedRevision) {
      throw new ApplicationError("Ca làm đã được cập nhật bởi thao tác khác. Hãy tải lại lịch.", 409, "shift_conflict");
    }
    if (!["draft", "published"].includes(check.status)) {
      throw new ApplicationError(`Ca làm đang ở trạng thái "${check.status}", không thể thay đổi.`, 409, "invalid_shift_status");
    }
    if (check.approved_leave_request_id) {
      throw new ApplicationError("Ca làm đã có đơn nghỉ phép được duyệt, không thể thay đổi.", 409, "shift_has_approved_leave");
    }
    if (check.has_attendance) {
      throw new ApplicationError("Ca làm đã có phiên chấm công ghi nhận, không thể sửa hoặc hủy.", 409, "shift_has_attendance");
    }
    if (check.has_payroll_lock) {
      throw new ApplicationError("Ca làm thuộc kỳ lương đã khóa hoặc đã thanh toán. Hãy mở lại kỳ lương trước khi thay đổi.", 409, "shift_locked_period");
    }
    throw new ApplicationError("Không thể thay đổi ca do xung đột dữ liệu. Hãy tải lại lịch.", 409, "shift_conflict");
  }

  return { updated: true, status: input.action === "cancel" ? "cancelled" : existingShift.status };
}

export async function assignCoverShift(
  db: D1Database,
  actor: AccessActor,
  input: {
    originalShiftId: string;
    replacementEmail: string;
    reason?: string;
  },
) {
  authorize(actor, "shifts.create");
  authorize(actor, "shifts.publish");
  if (!input.originalShiftId || typeof input.originalShiftId !== "string") {
    throw new ApplicationError("Chưa chọn ca nghỉ cần bố trí thay thế.");
  }
  if (!input.replacementEmail || typeof input.replacementEmail !== "string") {
    throw new ApplicationError("Chưa chọn nhân viên thay thế.");
  }
  const replacementEmail = input.replacementEmail.trim().toLowerCase();

  const originalShift = await db.prepare(
    `SELECT s.id, s.store_id, s.employee_email, s.starts_at, s.ends_at, s.role_label, s.is_shift_lead,
            s.status, s.approved_leave_request_id, s.revision
     FROM shifts s
     WHERE s.id = ? AND s.store_id = ?`,
  ).bind(input.originalShiftId, actor.storeId).first<{
    id: string;
    store_id: string;
    employee_email: string;
    starts_at: string;
    ends_at: string;
    role_label: string;
    is_shift_lead: number;
    status: string;
    approved_leave_request_id: string | null;
    revision: number;
  }>();

  if (!originalShift) throw new ApplicationError("Không tìm thấy ca làm việc gốc.", 404, "not_found");
  if (!originalShift.approved_leave_request_id) {
    throw new ApplicationError("Chỉ có thể bố trí người thay cho ca đã được duyệt nghỉ.", 400, "shift_not_on_leave");
  }
  if (originalShift.status === "cancelled") {
    throw new ApplicationError("Ca gốc đã bị hủy, không thể bố trí người thay.", 409, "shift_cancelled");
  }

  const nowMs = Date.now();
  const shiftEndMs = Date.parse(originalShift.ends_at);
  if (shiftEndMs <= nowMs) {
    throw new ApplicationError("Ca làm đã kết thúc, không thể phân công người thay.", 400, "shift_already_ended");
  }

  if (replacementEmail === originalShift.employee_email.toLowerCase()) {
    throw new ApplicationError("Nhân viên nghỉ không thể tự làm thay cho chính ca của mình.", 400, "invalid_replacement");
  }

  const replacementEmp = await db.prepare(
    `SELECT id, email, display_name, role,
            COALESCE(participates_attendance, CASE WHEN role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) AS participates_attendance
     FROM employees
     WHERE lower(email) = ? AND store_id = ? AND status = 'active'`,
  ).bind(replacementEmail, actor.storeId).first<{
    id: string;
    email: string;
    display_name: string;
    role: string;
    participates_attendance: number;
  }>();
  if (!replacementEmp) {
    throw new ApplicationError("Nhân viên thay thế không hoạt động trong cửa hàng.", 404, "employee_not_found");
  }
  if (!replacementEmp.participates_attendance) {
    throw new ApplicationError("Nhân viên được chọn không tham gia chấm công ca làm.", 400, "employee_not_eligible");
  }

  if (actor.role !== "owner" && ["owner", "system_admin"].includes(replacementEmp.role)) {
    throw new ApplicationError("Bạn không có quyền phân công cho Chủ quán hoặc Quản trị viên hệ thống.", 403, "forbidden");
  }
  if (actor.role === "team_lead" && !actor.roleId && ["owner", "manager"].includes(replacementEmp.role)) {
    throw new ApplicationError("Trưởng ca không có quyền phân công cho quản lý hoặc chủ quán.", 403, "forbidden");
  }

  const payrollLocked = await db.prepare(
    `SELECT id FROM payroll_periods
     WHERE store_id = ? AND status IN ('finalized', 'paid')
       AND period_start < ? AND period_end > ? LIMIT 1`,
  ).bind(actor.storeId, originalShift.ends_at, originalShift.starts_at).first();
  if (payrollLocked) {
    throw new ApplicationError("Thời gian ca thuộc kỳ lương đã khóa hoặc đã thanh toán.", 409, "shift_locked_period");
  }

  const overlap = await db.prepare(
    `SELECT id FROM shifts
     WHERE store_id = ? AND lower(employee_email) = ? AND status IN ('draft', 'published')
       AND approved_leave_request_id IS NULL
       AND starts_at < ? AND ends_at > ? LIMIT 1`,
  ).bind(actor.storeId, replacementEmail, originalShift.ends_at, originalShift.starts_at).first();
  if (overlap) {
    throw new ApplicationError(`Nhân viên ${replacementEmp.display_name} đã có ca làm trùng thời gian này.`, 409, "shift_overlap");
  }

  const existingCover = await db.prepare(
    `SELECT id, employee_email FROM shifts
     WHERE store_id = ? AND cover_for_shift_id = ? AND status IN ('draft', 'published') LIMIT 1`,
  ).bind(actor.storeId, originalShift.id).first<{ id: string; employee_email: string }>();
  if (existingCover) {
    throw new ApplicationError("Ca nghỉ này đã được bố trí người thay.", 409, "cover_already_assigned");
  }

  const coverShiftId = crypto.randomUUID();
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();

  const statements = [
    db.prepare(
      `INSERT INTO shifts
        (id, store_id, employee_email, starts_at, ends_at, timezone_snapshot, role_label, is_shift_lead, status, cover_for_shift_id, created_at)
       SELECT ?, ?, ?, ?, ?, 'Asia/Ho_Chi_Minh', ?, ?, 'published', ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM shifts existing
         WHERE existing.store_id = ? AND existing.cover_for_shift_id = ? AND existing.status IN ('draft', 'published')
       )`,
    ).bind(
      coverShiftId,
      actor.storeId,
      replacementEmail,
      originalShift.starts_at,
      originalShift.ends_at,
      originalShift.role_label,
      originalShift.is_shift_lead,
      originalShift.id,
      now,
      actor.storeId,
      originalShift.id,
    ),
    auditStatement(
      db,
      actor.email,
      "shift",
      coverShiftId,
      "shift.cover_assigned",
      {
        originalShiftId: originalShift.id,
        originalEmployeeEmail: originalShift.employee_email,
        replacementEmail,
        reason: input.reason?.trim() || undefined,
      },
      now,
      true,
      commandId,
    ),
    db.prepare(
      `INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
       VALUES (?, ?, 'shift_cover_assigned', 'Bạn được phân công làm thay cho ca nghỉ.', '/app/schedule', ?)`,
    ).bind(crypto.randomUUID(), replacementEmail, now),
    db.prepare(
      `INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
       VALUES (?, ?, 'shift_cover_assigned', 'Ca nghỉ của bạn đã được bố trí người thay.', '/app/schedule', ?)`,
    ).bind(crypto.randomUUID(), originalShift.employee_email, now),
  ];

  const results = await db.batch(statements);
  if (!results[0].meta.changes) {
    throw new ApplicationError("Ca nghỉ đã được bố trí người thay bởi thao tác khác.", 409, "cover_already_assigned");
  }

  return {
    success: true,
    coverShift: {
      id: coverShiftId,
      originalShiftId: originalShift.id,
      employeeEmail: replacementEmail,
      employeeName: replacementEmp.display_name,
      startsAt: originalShift.starts_at,
      endsAt: originalShift.ends_at,
      roleLabel: originalShift.role_label,
      status: "published",
    },
  };
}
