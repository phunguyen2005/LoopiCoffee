import type { AccessActor, ActorRole, EmployeeStatus } from "../domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

const ADMIN_PIN_ROLE_KEY = "__admin_pin__";

async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`loopi-admin-pin-v1:${salt}:${pin}`),
  );
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function validatePinFormat(pin: unknown, fieldLabel = "Mã PIN"): string {
  if (typeof pin !== "string") {
    throw new ApplicationError(`${fieldLabel} phải từ 4 đến 6 ký tự.`, 400, "invalid_pin_format");
  }
  const trimmed = pin.trim();
  if (trimmed.length < 4 || trimmed.length > 6) {
    throw new ApplicationError(`${fieldLabel} phải có độ dài từ 4 đến 6 ký tự.`, 400, "invalid_pin_format");
  }
  return trimmed;
}

export async function hasAdminSecurityPin(db: D1Database, storeId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT permission_key FROM role_permissions WHERE store_id = ? AND role = ? LIMIT 1")
    .bind(storeId, ADMIN_PIN_ROLE_KEY)
    .first<{ permission_key: string }>();
  return Boolean(row?.permission_key);
}

export async function setAdminSecurityPin(
  db: D1Database,
  actor: AccessActor,
  input: { currentPin?: string; newPin?: string; reason?: string },
): Promise<{ configured: true; updated: boolean }> {
  if (actor.role !== "system_admin") {
    throw new ApplicationError("Chỉ Quản trị hệ thống được thiết lập mã PIN bảo mật.", 403, "permission_denied");
  }
  const newPin = validatePinFormat(input.newPin, "Mã PIN mới");

  const existing = await db
    .prepare("SELECT permission_key FROM role_permissions WHERE store_id = ? AND role = ? LIMIT 1")
    .bind(actor.storeId, ADMIN_PIN_ROLE_KEY)
    .first<{ permission_key: string }>();

  if (existing?.permission_key) {
    if (!input.currentPin || typeof input.currentPin !== "string") {
      throw new ApplicationError("Vui lòng nhập mã PIN hiện tại để đổi mã PIN mới.", 403, "invalid_pin");
    }
    const [salt, expectedHash] = existing.permission_key.split(":");
    const actualHash = await hashPinWithSalt(input.currentPin.trim(), salt ?? "");
    if (!salt || !expectedHash || actualHash !== expectedHash) {
      throw new ApplicationError("Mã PIN hiện tại không chính xác.", 403, "invalid_pin");
    }
  }

  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(saltBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const hash = await hashPinWithSalt(newPin, salt);
  const encoded = `${salt}:${hash}`;
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare("DELETE FROM role_permissions WHERE store_id = ? AND role = ?")
      .bind(actor.storeId, ADMIN_PIN_ROLE_KEY),
    db
      .prepare("INSERT INTO role_permissions (store_id, role, permission_key, created_at) VALUES (?, ?, ?, ?)")
      .bind(actor.storeId, ADMIN_PIN_ROLE_KEY, encoded, now),
    auditStatement(
      db,
      actor.email,
      "admin_security",
      actor.id,
      "admin.pin_configured",
      {
        mode: existing?.permission_key ? "updated" : "created",
        reason: input.reason?.trim().slice(0, 300) || (existing?.permission_key ? "Đổi mã PIN bảo mật Quản trị viên" : "Khởi tạo mã PIN bảo mật Quản trị viên"),
        highPriority: true,
      },
      now,
      false,
      crypto.randomUUID(),
      actor.storeId,
    ),
  ]);

  return { configured: true, updated: Boolean(existing?.permission_key) };
}

export async function verifyAdminSecurityPin(
  db: D1Database,
  storeId: string,
  pin: unknown,
): Promise<void> {
  const existing = await db
    .prepare("SELECT permission_key FROM role_permissions WHERE store_id = ? AND role = ? LIMIT 1")
    .bind(storeId, ADMIN_PIN_ROLE_KEY)
    .first<{ permission_key: string }>();

  if (!existing?.permission_key) {
    throw new ApplicationError(
      "Chưa thiết lập mã PIN bảo mật. Vui lòng tạo mã PIN (4–6 ký tự) trước khi xóa tài khoản.",
      403,
      "pin_not_configured",
    );
  }

  const candidate = validatePinFormat(pin, "Mã PIN xác nhận");
  const [salt, expectedHash] = existing.permission_key.split(":");
  const actualHash = await hashPinWithSalt(candidate, salt ?? "");
  if (!salt || !expectedHash || actualHash !== expectedHash) {
    throw new ApplicationError("Mã PIN xác thực không chính xác.", 403, "invalid_pin");
  }
}

export async function changeAccountEmail(
  db: D1Database,
  actor: AccessActor,
  employeeId: string,
  input: { newEmail?: string; expectedRevision?: number; reason?: string },
) {
  if (actor.role !== "system_admin") {
    throw new ApplicationError("Chỉ Quản trị hệ thống được quyền đổi email tài khoản.", 403, "permission_denied");
  }
  const newEmail = input.newEmail?.trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new ApplicationError("Email mới không hợp lệ.", 400, "invalid_email");
  }

  const employee = await db
    .prepare(
      "SELECT id, email, display_name, store_id, role, role_id, status, auth_user_id, access_revision FROM employees WHERE id = ? AND store_id = ?",
    )
    .bind(employeeId, actor.storeId)
    .first<{
      id: string;
      email: string;
      display_name: string;
      store_id: string;
      role: ActorRole;
      role_id: string | null;
      status: EmployeeStatus;
      auth_user_id: string | null;
      access_revision: number;
    }>();

  if (!employee) {
    throw new ApplicationError("Không tìm thấy tài khoản.", 404, "account_not_found");
  }
  if (employee.role === "system_admin" || employee.id === actor.id) {
    throw new ApplicationError("Không thể thay đổi tài khoản quản trị bằng luồng này.", 403, "permission_denied");
  }
  if (input.expectedRevision !== undefined && input.expectedRevision !== employee.access_revision) {
    throw new ApplicationError("Tài khoản vừa được cập nhật. Hãy tải lại.", 409, "account_conflict");
  }
  if (employee.email.toLowerCase() === newEmail) {
    return {
      ...employee,
      email: newEmail,
      access_revision: employee.access_revision,
      unchanged: true,
    };
  }

  const conflict = await db
    .prepare("SELECT id FROM employees WHERE lower(email) = lower(?) AND id <> ? LIMIT 1")
    .bind(newEmail, employee.id)
    .first<{ id: string }>();
  if (conflict) {
    throw new ApplicationError("Email mới đã được sử dụng bởi một tài khoản khác.", 409, "account_conflict");
  }

  const oldEmail = employee.email;
  const now = new Date().toISOString();
  const nextRevision = employee.access_revision + 1;

  const statements = [
    db.prepare("DROP TRIGGER IF EXISTS attendance_corrections_immutable_update"),
    db.prepare("DROP TRIGGER IF EXISTS payroll_adjustments_immutable_update"),
    db.prepare("DROP TRIGGER IF EXISTS shifts_no_overlap_update"),
    db
      .prepare(
        `UPDATE employees
         SET email = ?, access_revision = access_revision + 1, updated_at = ?
         WHERE id = ? AND store_id = ? AND access_revision = ?`,
      )
      .bind(newEmail, now, employee.id, actor.storeId, employee.access_revision),
    db
      .prepare("UPDATE employee_consents SET employee_email = ? WHERE lower(employee_email) = lower(?)")
      .bind(newEmail, oldEmail),
    db
      .prepare("UPDATE shifts SET employee_email = ? WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE attendance_capture_sessions SET employee_email = ? WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE attendance_sessions SET employee_email = ? WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare(
        `UPDATE attendance_events SET employee_email = ?
         WHERE lower(employee_email) = lower(?)
           AND session_id IN (SELECT id FROM attendance_sessions WHERE store_id = ?)`,
      )
      .bind(newEmail, oldEmail, actor.storeId),
    db
      .prepare("UPDATE attendance_exceptions SET reviewer_email = ? WHERE lower(reviewer_email) = lower(?)")
      .bind(newEmail, oldEmail),
    db
      .prepare("UPDATE attendance_corrections SET actor_email = ? WHERE lower(actor_email) = lower(?)")
      .bind(newEmail, oldEmail),
    db
      .prepare("UPDATE attendance_action_limits SET employee_email = ? WHERE lower(employee_email) = lower(?)")
      .bind(newEmail, oldEmail),
    db
      .prepare(
        `UPDATE payroll_entries SET employee_email = ?
         WHERE lower(employee_email) = lower(?)
           AND payroll_period_id IN (SELECT id FROM payroll_periods WHERE store_id = ?)`,
      )
      .bind(newEmail, oldEmail, actor.storeId),
    db
      .prepare("UPDATE payroll_adjustments SET employee_email = ? WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE payroll_adjustments SET actor_email = ? WHERE store_id = ? AND lower(actor_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE employee_rate_history SET employee_email = ? WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE incidents SET reporter_email = ? WHERE store_id = ? AND lower(reporter_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE handovers SET author_email = ? WHERE store_id = ? AND lower(author_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE handovers SET acknowledged_by = ? WHERE store_id = ? AND lower(acknowledged_by) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE requests SET employee_email = ? WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE requests SET reviewer_email = ? WHERE store_id = ? AND lower(reviewer_email) = lower(?)")
      .bind(newEmail, actor.storeId, oldEmail),
    db
      .prepare("UPDATE notifications SET recipient_email = ? WHERE lower(recipient_email) = lower(?)")
      .bind(newEmail, oldEmail),
    db.prepare(
      "CREATE TRIGGER attendance_corrections_immutable_update BEFORE UPDATE ON attendance_corrections BEGIN SELECT RAISE(ABORT, 'immutable_attendance_correction'); END",
    ),
    db.prepare(
      "CREATE TRIGGER payroll_adjustments_immutable_update BEFORE UPDATE ON payroll_adjustments BEGIN SELECT RAISE(ABORT, 'immutable_payroll_adjustment'); END",
    ),
    db.prepare(
      `CREATE TRIGGER shifts_no_overlap_update BEFORE UPDATE OF starts_at, ends_at, employee_email, status, approved_leave_request_id ON shifts
       WHEN NEW.status IN ('draft', 'published') AND NEW.approved_leave_request_id IS NULL
       BEGIN
         SELECT RAISE(ABORT, 'shift_overlap') WHERE EXISTS (
           SELECT 1 FROM shifts s WHERE s.id <> NEW.id AND lower(s.employee_email) = lower(NEW.employee_email)
             AND s.store_id = NEW.store_id AND s.status IN ('draft', 'published') AND s.approved_leave_request_id IS NULL
             AND s.starts_at < NEW.ends_at AND s.ends_at > NEW.starts_at
         );
       END`,
    ),
    auditStatement(
      db,
      actor.email,
      "employee",
      employee.id,
      "account.email_changed",
      {
        previousEmail: oldEmail,
        newEmail,
        role: employee.role,
        reason: input.reason?.trim().slice(0, 300) || "Đổi email đăng nhập bởi Quản trị hệ thống",
        highPriority: true,
      },
      now,
      true,
      crypto.randomUUID(),
      actor.storeId,
    ),
  ];

  const results = await db.batch(statements);
  // Index 3 is the UPDATE employees statement (after 3 DROP TRIGGER statements)
  if (!results[3]?.meta.changes) {
    throw new ApplicationError("Tài khoản vừa được cập nhật. Hãy tải lại.", 409, "account_conflict");
  }

  return {
    ...employee,
    previousEmail: oldEmail,
    email: newEmail,
    access_revision: nextRevision,
    unchanged: false,
  };
}

export async function deleteAccountAndData(
  db: D1Database,
  actor: AccessActor,
  employeeId: string,
  input: { pin?: string; reason?: string },
) {
  if (actor.role !== "system_admin") {
    throw new ApplicationError("Chỉ Quản trị hệ thống được quyền xóa tài khoản.", 403, "permission_denied");
  }

  await verifyAdminSecurityPin(db, actor.storeId, input.pin);

  const employee = await db
    .prepare(
      "SELECT id, email, display_name, store_id, role, role_id, status, auth_user_id, access_revision FROM employees WHERE id = ? AND store_id = ?",
    )
    .bind(employeeId, actor.storeId)
    .first<{
      id: string;
      email: string;
      display_name: string;
      store_id: string;
      role: ActorRole;
      role_id: string | null;
      status: EmployeeStatus;
      auth_user_id: string | null;
      access_revision: number;
    }>();

  if (!employee) {
    throw new ApplicationError("Không tìm thấy tài khoản cần xóa.", 404, "account_not_found");
  }
  if (employee.role === "system_admin" || employee.id === actor.id) {
    throw new ApplicationError("Không thể xóa tài khoản Quản trị hệ thống.", 403, "permission_denied");
  }

  const targetEmail = employee.email;
  const now = new Date().toISOString();

  const statements = [
    db.prepare("DROP TRIGGER IF EXISTS attendance_corrections_immutable_delete"),
    db.prepare("DROP TRIGGER IF EXISTS payroll_adjustments_immutable_delete"),
    // 1. Break foreign-key references to target employee's shifts, requests, and employee record
    db
      .prepare(
        `UPDATE shifts SET approved_leave_request_id = NULL
         WHERE store_id = ? AND (
           lower(employee_email) = lower(?)
           OR approved_leave_request_id IN (SELECT id FROM requests WHERE store_id = ? AND lower(employee_email) = lower(?))
         )`,
      )
      .bind(actor.storeId, targetEmail, actor.storeId, targetEmail),
    db
      .prepare(
        `UPDATE shifts SET cover_for_shift_id = NULL
         WHERE store_id = ? AND cover_for_shift_id IN (
           SELECT id FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?)
         )`,
      )
      .bind(actor.storeId, actor.storeId, targetEmail),
    db
      .prepare(
        `UPDATE requests
         SET shift_id = NULL, correction_event_id = NULL, correction_session_id = NULL
         WHERE store_id = ? AND (
           lower(employee_email) = lower(?)
           OR shift_id IN (SELECT id FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?))
           OR correction_session_id IN (SELECT id FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?))
         )`,
      )
      .bind(actor.storeId, targetEmail, actor.storeId, targetEmail, actor.storeId, targetEmail),
    db
      .prepare("UPDATE handovers SET receiver_employee_id = NULL WHERE store_id = ? AND receiver_employee_id = ?")
      .bind(actor.storeId, employee.id),
    db
      .prepare(
        `UPDATE handovers SET shift_id = NULL
         WHERE store_id = ? AND shift_id IN (SELECT id FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?))`,
      )
      .bind(actor.storeId, actor.storeId, targetEmail),
    db
      .prepare(
        `UPDATE handovers SET next_shift_id = NULL
         WHERE store_id = ? AND next_shift_id IN (SELECT id FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?))`,
      )
      .bind(actor.storeId, actor.storeId, targetEmail),
    db
      .prepare(
        `DELETE FROM checklist_executions
         WHERE item_id IN (
           SELECT id FROM checklist_items
           WHERE store_id = ? AND shift_id IN (SELECT id FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?))
         )`,
      )
      .bind(actor.storeId, actor.storeId, targetEmail),
    db
      .prepare(
        `DELETE FROM checklist_items
         WHERE store_id = ? AND shift_id IN (SELECT id FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?))`,
      )
      .bind(actor.storeId, actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM admin_account_operations WHERE store_id = ? AND target_employee_id = ?")
      .bind(actor.storeId, employee.id),
    // 2. Delete attendance corrections, exceptions, locations, photos, events, sessions, capture sessions
    db
      .prepare(
        `DELETE FROM attendance_corrections
         WHERE session_id IN (SELECT id FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?))
            OR source_request_id IN (SELECT id FROM requests WHERE store_id = ? AND lower(employee_email) = lower(?))`,
      )
      .bind(actor.storeId, targetEmail, actor.storeId, targetEmail),
    db
      .prepare(
        `DELETE FROM attendance_exceptions
         WHERE event_id IN (
           SELECT id FROM attendance_events
           WHERE lower(employee_email) = lower(?)
              OR session_id IN (SELECT id FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?))
         )`,
      )
      .bind(targetEmail, actor.storeId, targetEmail),
    db
      .prepare(
        `DELETE FROM attendance_locations
         WHERE event_id IN (
           SELECT id FROM attendance_events
           WHERE lower(employee_email) = lower(?)
              OR session_id IN (SELECT id FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?))
         )`,
      )
      .bind(targetEmail, actor.storeId, targetEmail),
    db
      .prepare(
        `DELETE FROM attendance_photos
         WHERE event_id IN (
           SELECT id FROM attendance_events
           WHERE lower(employee_email) = lower(?)
              OR session_id IN (SELECT id FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?))
         )`,
      )
      .bind(targetEmail, actor.storeId, targetEmail),
    db
      .prepare(
        `DELETE FROM attendance_events
         WHERE lower(employee_email) = lower(?)
            OR session_id IN (SELECT id FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?))`,
      )
      .bind(targetEmail, actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM attendance_sessions WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM attendance_capture_sessions WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM attendance_action_limits WHERE lower(employee_email) = lower(?)")
      .bind(targetEmail),
    // 3. Delete requests, shifts, handovers, incidents, notifications, consents, payroll data
    db
      .prepare("DELETE FROM requests WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM shifts WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM handovers WHERE store_id = ? AND lower(author_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM incidents WHERE store_id = ? AND lower(reporter_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM notifications WHERE lower(recipient_email) = lower(?)")
      .bind(targetEmail),
    db
      .prepare("DELETE FROM employee_consents WHERE lower(employee_email) = lower(?)")
      .bind(targetEmail),
    db
      .prepare(
        `DELETE FROM payroll_entries
         WHERE lower(employee_email) = lower(?)
           AND payroll_period_id IN (SELECT id FROM payroll_periods WHERE store_id = ?)`,
      )
      .bind(targetEmail, actor.storeId),
    db
      .prepare("DELETE FROM payroll_adjustments WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    db
      .prepare("DELETE FROM employee_rate_history WHERE store_id = ? AND lower(employee_email) = lower(?)")
      .bind(actor.storeId, targetEmail),
    // 4. Delete the employee account
    db
      .prepare("DELETE FROM employees WHERE id = ? AND store_id = ?")
      .bind(employee.id, actor.storeId),
    // 5. Restore immutability triggers
    db.prepare(
      "CREATE TRIGGER attendance_corrections_immutable_delete BEFORE DELETE ON attendance_corrections BEGIN SELECT RAISE(ABORT, 'immutable_attendance_correction'); END",
    ),
    db.prepare(
      "CREATE TRIGGER payroll_adjustments_immutable_delete BEFORE DELETE ON payroll_adjustments BEGIN SELECT RAISE(ABORT, 'immutable_payroll_adjustment'); END",
    ),
    // 6. Audit log
    auditStatement(
      db,
      actor.email,
      "employee",
      employee.id,
      "account.deleted",
      {
        email: employee.email,
        displayName: employee.display_name,
        role: employee.role,
        roleId: employee.role_id,
        previousStatus: employee.status,
        pinVerified: true,
        reason: input.reason?.trim().slice(0, 300) || "Xóa vĩnh viễn tài khoản và dữ liệu liên quan bởi Quản trị hệ thống",
        highPriority: true,
      },
      now,
      false,
      crypto.randomUUID(),
      actor.storeId,
    ),
  ];

  await db.batch(statements);

  return {
    deleted: true,
    account: employee,
  };
}
