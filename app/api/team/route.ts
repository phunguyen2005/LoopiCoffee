import {
  assignableRoles,
  canAssignRole,
  canManageEmployee,
  type ActorRole,
  type EmployeeStatus,
} from "@/modules/people/domain/access";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { ensureDatabase } from "@/db/runtime";
import { auditStatement, invalidateIdentityCache, requireApiPermission, requireApiUser } from "@/server/auth";
import { createAdmin } from "@/lib/supabase/server";
import { resetPassword } from "@/modules/people/application/reset-password";
import { updateEmployeeAccess } from "@/modules/people/application/update-access";

export const GET = apiHandler(async (request?: Request) => {
  const auth = await requireApiPermission("people.read");
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const schedulableOnly = request ? new URL(request.url).searchParams.get("schedulable") === "1" : false;
  const result = await db.prepare(`SELECT e.id, e.email, e.display_name, e.role, e.role_id, cr.name AS role_name,
    e.status, e.job_title, e.phone, e.start_date, e.participates_attendance, e.payroll_eligible,
    e.compensation_type, e.hourly_rate, e.monthly_salary, e.access_revision, e.created_at, e.updated_at
    FROM employees e
    LEFT JOIN custom_roles cr ON cr.id = e.role_id
    WHERE e.store_id = ? AND e.role <> 'system_admin'
      AND (? = 0 OR (e.status = 'active' AND COALESCE(e.participates_attendance,
        CASE WHEN e.role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) = 1))
    ORDER BY e.status, e.display_name`)
    .bind(auth.actor.storeId, schedulableOnly ? 1 : 0).all();

  const customRoles = await db.prepare(
    "SELECT id, name, status, revision FROM custom_roles WHERE store_id = ? AND status = 'active' ORDER BY name",
  ).bind(auth.actor.storeId).all();

  return Response.json({
    employees: result.results,
    customRoles: customRoles.results,
    currentUserRole: auth.actor.role,
    currentUserId: auth.actor.id,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "system_admin"]);
  if (!auth.actor) return auth.response;

  const body = await readObject(request, {
    email: "string",
    displayName: "string",
    role: "string",
    roleId: "string?",
    jobTitle: "string?",
    phone: "string?",
    startDate: "string?",
    participatesAttendance: "boolean",
    payrollEligible: "boolean",
    compensationType: "string",
    hourlyRate: "money",
    monthlySalary: "money",
    activationMethod: "string",
    mustChangePassword: "boolean",
    reason: "string?",
    idempotencyKey: "string?",
  }) as {
    email?: string;
    displayName?: string;
    role?: ActorRole;
    roleId?: string | null;
    jobTitle?: string;
    phone?: string;
    startDate?: string;
    participatesAttendance?: boolean;
    payrollEligible?: boolean;
    compensationType?: "hourly" | "monthly" | "none";
    hourlyRate?: number;
    monthlySalary?: number;
    activationMethod?: "invite" | "temporary_password";
    mustChangePassword?: boolean;
    reason?: string;
    idempotencyKey?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const role: ActorRole = body.role && assignableRoles.includes(body.role as typeof assignableRoles[number]) ? body.role : "employee";
  const roleId = body.roleId?.trim() || null;
  const activationMethod = body.activationMethod === "invite" ? "invite" : "temporary_password";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApplicationError("Email không hợp lệ.", 400, "invalid_email");
  }
  if (!displayName || displayName.length < 2) {
    throw new ApplicationError("Họ tên phải có ít nhất 2 ký tự.", 400, "invalid_display_name");
  }
  if (!canAssignRole(auth.actor, role)) {
    throw new ApplicationError("Bạn không có quyền phân vai trò này.", 403, "forbidden");
  }

  const db = await ensureDatabase();

  if (role === "owner") {
    const existingOwner = await db.prepare(
      "SELECT id FROM employees WHERE store_id = ? AND role = 'owner' LIMIT 1",
    ).bind(auth.actor.storeId).first<{ id: string }>();
    if (existingOwner) {
      throw new ApplicationError(
        "Cửa hàng đã có tài khoản Chủ quán. Hãy khôi phục tài khoản đó thay vì tạo thêm.",
        409,
        "owner_limit",
      );
    }
  }

  if (roleId) {
    if (role === "owner" || role === "system_admin") {
      throw new ApplicationError("Không thể gán vai trò tùy chỉnh cho Chủ quán hoặc Quản trị hệ thống.", 400, "invalid_role_assignment");
    }
    const customRole = await db.prepare(
      "SELECT id, status FROM custom_roles WHERE id = ? AND store_id = ?",
    ).bind(roleId, auth.actor.storeId).first<{ id: string; status: string }>();
    if (!customRole || customRole.status !== "active") {
      throw new ApplicationError("Vai trò tùy chỉnh không tồn tại hoặc đã lưu trữ.", 400, "invalid_role_id");
    }
  }

  const existing = await db.prepare("SELECT id FROM employees WHERE lower(email) = lower(?)").bind(email).first();
  if (existing) {
    throw new ApplicationError("Email này đã tồn tại trong hệ thống.", 409, "account_conflict");
  }

  const jobTitle = clean(body.jobTitle, "Barista", 100);
  const phone = clean(body.phone, "", 30, true);
  const startDate = dateValue(body.startDate, new Date().toISOString().slice(0, 10));
  const compensationType = ["hourly", "monthly", "none"].includes(String(body.compensationType))
    ? String(body.compensationType)
    : "hourly";
  const participates = body.participatesAttendance === undefined ? true : Boolean(body.participatesAttendance);
  const payrollEligible = compensationType !== "none" && (body.payrollEligible === undefined ? true : Boolean(body.payrollEligible));
  const hourlyRate = money(body.hourlyRate, 0);
  const monthlySalary = money(body.monthlySalary, 0);
  const temporaryPassword = activationMethod === "temporary_password" ? generateTemporaryPassword() : undefined;

  let authUserId: string | null = null;
  let supabase: ReturnType<typeof createAdmin> | null = null;
  try {
    supabase = createAdmin();
  } catch {
    // In local environments or tests without supabase configured
  }

  if (supabase) {
    try {
      if (activationMethod === "temporary_password") {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password: temporaryPassword!,
          email_confirm: true,
          user_metadata: { display_name: displayName.slice(0, 100) },
          app_metadata: { role, role_id: roleId, store_id: auth.actor.storeId },
        });
        if (error || !data.user) {
          throw classifyAuthError(error, "Không thể tạo tài khoản đăng nhập.");
        }
        authUserId = data.user.id;
      } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { display_name: displayName.slice(0, 100) },
          redirectTo: `${appUrl.replace(/\/$/, "")}/auth/callback`,
        });
        if (error || !data.user) {
          throw classifyAuthError(error, "Không thể gửi thư mời kích hoạt tài khoản.");
        }
        authUserId = data.user.id;
      }
    } catch (authError) {
      if (authError instanceof ApplicationError) throw authError;
      throw classifyAuthError(authError, "Lỗi kết nối dịch vụ xác thực.");
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const initialStatus: EmployeeStatus = activationMethod === "invite" ? "invited" : "active";
  const mustChange = activationMethod === "invite" || body.mustChangePassword !== false ? 1 : 0;

  const statements = [
    db.prepare(`INSERT INTO employees
      (id, store_id, email, display_name, auth_user_id, role, role_id, status, job_title, phone, start_date,
       participates_attendance, payroll_eligible, compensation_type, hourly_rate, monthly_salary,
       invited_by, created_at, updated_at, must_change_password)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? <> 'owner' OR NOT EXISTS (
        SELECT 1 FROM employees WHERE store_id = ? AND role = 'owner'
      )`
    ).bind(
      id, auth.actor.storeId, email, displayName.slice(0, 100), authUserId, role, roleId, initialStatus,
      jobTitle, phone, startDate, participates ? 1 : 0, payrollEligible ? 1 : 0, compensationType,
      hourlyRate, monthlySalary, auth.actor.email, now, now, mustChange,
      role, auth.actor.storeId,
    ),
    auditStatement(
      db, auth.actor.email, "employee", id, "account.created",
      {
        role,
        roleId,
        activationMethod,
        reason: body.reason?.trim() || "Tạo tài khoản nhân sự mới từ quản lý nhân sự",
        highPriority: role === "owner",
      },
      now, true, crypto.randomUUID(), auth.actor.storeId,
    ),
  ];

  if (compensationType !== "none" && (hourlyRate > 0 || monthlySalary > 0)) {
    statements.push(
      db.prepare(`INSERT INTO employee_rate_history
        (id, store_id, employee_email, compensation_type, hourly_rate, monthly_salary, effective_from, effective_to, created_by, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?
        WHERE EXISTS (SELECT 1 FROM employees WHERE id = ? AND store_id = ?)`
      ).bind(
        crypto.randomUUID(), auth.actor.storeId, email, compensationType,
        compensationType === "hourly" ? hourlyRate : null,
        compensationType === "monthly" ? monthlySalary : null,
        now, auth.actor.email, now, id, auth.actor.storeId,
      ),
    );
  }

  try {
    const results = await db.batch(statements);
    if (!results[0].meta.changes) {
      throw new ApplicationError(
        "Cửa hàng đã có tài khoản Chủ quán. Hãy khôi phục tài khoản đó thay vì tạo thêm.",
        409,
        "owner_limit",
      );
    }
  } catch (dbErr) {
    if (authUserId && supabase) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    if (dbErr instanceof ApplicationError) throw dbErr;
    const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
    if (/UNIQUE/i.test(msg)) {
      throw new ApplicationError("Email này đã tồn tại trong cửa hàng.", 409, "account_conflict");
    }
    throw new ApplicationError("Không thể lưu nhân sự mới vào cơ sở dữ liệu.", 500, "database_error");
  }

  return Response.json({
    account: {
      id,
      email,
      display_name: displayName,
      role,
      role_id: roleId,
      status: initialStatus,
      job_title: jobTitle,
      phone,
      start_date: startDate,
      participates_attendance: participates ? 1 : 0,
      payroll_eligible: payrollEligible ? 1 : 0,
      compensation_type: compensationType,
      hourly_rate: hourlyRate,
      monthly_salary: monthlySalary,
      access_revision: 0,
      created_at: now,
      updated_at: now,
    },
    temporaryPassword,
  }, { status: 201 });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("people.update");
  if (!auth.actor) return auth.response;
  const body = await readObject(request, {
    id: "string",
    displayName: "string",
    jobTitle: "string?",
    phone: "string?",
    startDate: "string?",
    participatesAttendance: "boolean",
    payrollEligible: "boolean",
    compensationType: "string",
    hourlyRate: "money",
    monthlySalary: "money",
    expectedUpdatedAt: "string",
    reason: "string",
    role: "string?",
    roleId: "string?",
    status: "string",
    expectedRevision: "number",
    action: "string?",
  }) as {
    id?: string;
    displayName?: string;
    jobTitle?: string;
    phone?: string;
    startDate?: string;
    participatesAttendance?: boolean;
    payrollEligible?: boolean;
    compensationType?: string;
    hourlyRate?: number;
    monthlySalary?: number;
    expectedUpdatedAt?: string;
    reason?: string;
    role?: string;
    roleId?: string | null;
    status?: EmployeeStatus;
    expectedRevision?: number;
    action?: "reset_password" | "update_status";
  };

  if (typeof body.id !== "string") {
    return Response.json({ error: "Thiếu tài khoản cần cập nhật." }, { status: 400 });
  }
  if (!body.action && (typeof body.expectedUpdatedAt !== "string" || typeof body.reason !== "string" || body.reason.trim().length < 5)) {
    return Response.json({ error: "Thiếu tài khoản, phiên bản hoặc lý do cập nhật." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const employee = await db.prepare(`SELECT id, email, store_id, role, role_id, status, auth_user_id, display_name, job_title, phone, start_date,
    participates_attendance, payroll_eligible, compensation_type, hourly_rate, monthly_salary, access_revision, updated_at
    FROM employees WHERE id = ? AND store_id = ?`).bind(body.id, auth.actor.storeId).first<{
      id: string; email: string; store_id: string; role: ActorRole; role_id: string | null; status: EmployeeStatus;
      auth_user_id: string | null; display_name: string; job_title: string | null; phone: string | null;
      start_date: string | null; participates_attendance: number | null; payroll_eligible: number | null;
      compensation_type: string | null; hourly_rate: number | null; monthly_salary: number | null;
      access_revision: number; updated_at: string;
    }>();
  if (!employee) throw new ApplicationError("Không tìm thấy nhân sự.", 404, "employee_not_found");
  if (!canManageEmployee(auth.actor, employee)) throw new ApplicationError("Bạn không có quyền cập nhật hồ sơ này.", 403, "permission_denied");

  if (body.action === "update_status") {
    if (auth.actor.role !== "owner" || employee.id === auth.actor.id || employee.role === "owner" || employee.role === "system_admin") {
      throw new ApplicationError("Chỉ Chủ quán được cập nhật trạng thái tài khoản nhân viên khác.", 403, "permission_denied");
    }
    if (!body.status || !["active", "suspended", "offboarded"].includes(body.status)) {
      throw new ApplicationError("Trạng thái nhân viên không hợp lệ.", 400, "invalid_status");
    }
    if (!Number.isInteger(body.expectedRevision) || typeof body.reason !== "string" || body.reason.trim().length < 5) {
      throw new ApplicationError("Hãy nhập lý do và tải lại hồ sơ trước khi cập nhật trạng thái.", 400, "reason_required");
    }
    const updated = await updateEmployeeAccess(db, auth.actor, employee.id, {
      status: body.status,
      expectedRevision: body.expectedRevision,
      reason: body.reason,
    });
    if (employee.auth_user_id) {
      const supabase = createAdmin();
      const { error } = await supabase.auth.admin.updateUserById(employee.auth_user_id, {
        ban_duration: body.status === "active" ? "none" : "876000h",
      });
      if (error) {
        throw classifyAuthError(error, "Trạng thái trong hệ thống đã cập nhật nhưng dịch vụ đăng nhập chưa đồng bộ. Hãy thử lại.");
      }
    }
    invalidateIdentityCache();
    return Response.json({ updated: true, status: body.status, revision: updated.access_revision });
  }

  if (body.action === "reset_password") {
    if (auth.actor.role !== "owner" || employee.id === auth.actor.id || employee.role === "owner" || employee.role === "system_admin") {
      throw new ApplicationError("Chỉ Chủ quán được cấp lại mật khẩu tạm cho tài khoản nhân viên khác.", 403, "permission_denied");
    }
    if (typeof body.reason !== "string" || body.reason.trim().length < 5) {
      throw new ApplicationError("Hãy nhập lý do cấp lại mật khẩu, tối thiểu 5 ký tự.", 400, "reason_required");
    }
    if (!employee.auth_user_id) {
      throw new ApplicationError("Tài khoản chưa liên kết dịch vụ đăng nhập. Hãy dùng luồng gửi lại lời mời.", 409, "account_conflict");
    }
    if (employee.status === "offboarded" || employee.status === "inactive") {
      throw new ApplicationError("Không thể cấp mật khẩu cho tài khoản đã nghỉ việc hoặc ngừng hoạt động.", 409, "account_conflict");
    }
    const temporaryPassword = generateTemporaryPassword();
    const supabase = createAdmin();
    await resetPassword(db, auth.actor.email, employee.id, async () => {
      const { error } = await supabase.auth.admin.updateUserById(employee.auth_user_id!, { password: temporaryPassword });
      if (!error) return { error: null, authUserId: employee.auth_user_id! };
      if (!isMissingAuthUser(error)) throw classifyAuthError(error, "Không thể cập nhật mật khẩu tạm.");

      const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw classifyAuthError(listError, "Không thể kiểm tra tài khoản đăng nhập.");
      const matchingUser = usersData.users.find((user) => user.email?.toLowerCase() === employee.email.toLowerCase());
      if (matchingUser) {
        const { error: relinkError } = await supabase.auth.admin.updateUserById(matchingUser.id, { password: temporaryPassword });
        if (relinkError) throw classifyAuthError(relinkError, "Không thể cập nhật mật khẩu tạm.");
        return { error: null, authUserId: matchingUser.id };
      }

      const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
        email: employee.email,
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: { role: employee.role, role_id: employee.role_id, store_id: employee.store_id },
        user_metadata: { display_name: employee.display_name },
      });
      if (createError || !createdData.user) throw classifyAuthError(createError, "Không thể khôi phục tài khoản đăng nhập.");
      return { error: null, authUserId: createdData.user.id };
    }, {
      reason: body.reason.trim().slice(0, 300),
      initiatedByRole: auth.actor.role,
      forceChangeOnNextLogin: true,
    });
    invalidateIdentityCache();
    return Response.json({ updated: true, temporaryPassword, mustChangePassword: true });
  }
  const updateReason = body.reason!;

  // Role and Permission Assignment check:
  let nextRole: ActorRole = employee.role;
  let nextRoleId: string | null = employee.role_id;
  let roleChanged = false;

  if (body.role !== undefined || body.roleId !== undefined) {
    const candidateRole = (body.role || employee.role) as ActorRole;
    const candidateRoleId = body.roleId !== undefined ? (body.roleId?.trim() || null) : employee.role_id;

    if (candidateRole !== employee.role || candidateRoleId !== employee.role_id) {
      if (!canAssignRole(auth.actor, candidateRole)) {
        throw new ApplicationError("Bạn không có quyền phân quyền vai trò này.", 403, "permission_denied");
      }
      if (candidateRole === "owner" || candidateRole === "system_admin") {
        nextRoleId = null;
      } else if (candidateRoleId) {
        const custom = await db.prepare(
          "SELECT id, status FROM custom_roles WHERE id = ? AND store_id = ?",
        ).bind(candidateRoleId, auth.actor.storeId).first<{ id: string; status: string }>();
        if (!custom || custom.status !== "active") {
          throw new ApplicationError("Vai trò tùy chỉnh không tồn tại hoặc đã lưu trữ.", 400, "invalid_role_id");
        }
        nextRoleId = candidateRoleId;
      } else {
        nextRoleId = null;
      }
      nextRole = candidateRole;
      roleChanged = true;
    }
  }

  const displayName = clean(body.displayName, employee.display_name, 100);
  const jobTitle = clean(body.jobTitle, employee.job_title ?? "Nhân viên", 100);
  const phone = clean(body.phone, employee.phone ?? "", 30, true);
  const startDate = dateValue(body.startDate, employee.start_date);
  const compensationType = ["hourly", "monthly", "none"].includes(String(body.compensationType)) ? String(body.compensationType) : employee.compensation_type ?? "none";
  const participates = body.participatesAttendance === undefined ? Boolean(employee.participates_attendance) : Boolean(body.participatesAttendance);
  const payrollEligible = compensationType !== "none" && (body.payrollEligible === undefined ? Boolean(employee.payroll_eligible) : Boolean(body.payrollEligible));
  const hourlyRate = money(body.hourlyRate, employee.hourly_rate ?? 0);
  const monthlySalary = money(body.monthlySalary, employee.monthly_salary ?? 0);
  const rateChanged = compensationType !== employee.compensation_type || hourlyRate !== (employee.hourly_rate ?? 0) || monthlySalary !== (employee.monthly_salary ?? 0);
  const now = new Date().toISOString();

  const statements = [
    db.prepare(`UPDATE employees SET display_name = ?, job_title = ?, phone = ?, start_date = ?, participates_attendance = ?,
      payroll_eligible = ?, compensation_type = ?, hourly_rate = ?, monthly_salary = ?, role = ?, role_id = ?,
      access_revision = access_revision + ?, updated_at = ?
      WHERE id = ? AND store_id = ? AND updated_at = ?
        AND (role != 'owner' OR (? = 'owner')
          OR EXISTS (SELECT 1 FROM employees other
            WHERE other.store_id = employees.store_id AND other.role = 'owner'
              AND other.status = 'active' AND other.id != employees.id))`)
      .bind(
        displayName, jobTitle, phone, startDate, participates ? 1 : 0, payrollEligible ? 1 : 0,
        compensationType, hourlyRate, monthlySalary, nextRole, nextRoleId,
        roleChanged ? 1 : 0, now, employee.id, auth.actor.storeId, body.expectedUpdatedAt,
        nextRole,
      ),
    auditStatement(db, auth.actor.email, "employee", employee.id, "employee.profile_updated", {
      reason: updateReason.trim().slice(0, 300),
      rateChanged,
      roleChanged,
      previousRole: roleChanged ? employee.role : undefined,
      previousRoleId: roleChanged ? employee.role_id : undefined,
      nextRole: roleChanged ? nextRole : undefined,
      nextRoleId: roleChanged ? nextRoleId : undefined,
      fields: ["displayName", "jobTitle", "phone", "startDate", "participatesAttendance", "payrollEligible", "compensationType", ...(roleChanged ? ["role", "roleId"] : [])],
    }, now, true),
  ];

  if (rateChanged) {
    statements.push(
      db.prepare(`UPDATE employee_rate_history SET effective_to = ?
        WHERE store_id = ? AND lower(employee_email) = lower(?) AND effective_to IS NULL
        AND EXISTS (SELECT 1 FROM employees WHERE id = ? AND store_id = ? AND updated_at = ?)`)
        .bind(now, auth.actor.storeId, employee.email, employee.id, auth.actor.storeId, now),
      db.prepare(`INSERT INTO employee_rate_history
        (id, store_id, employee_email, compensation_type, hourly_rate, monthly_salary, effective_from, effective_to, created_by, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?
        WHERE EXISTS (SELECT 1 FROM employees WHERE id = ? AND store_id = ? AND updated_at = ?)`)
        .bind(crypto.randomUUID(), auth.actor.storeId, employee.email, compensationType, compensationType === "hourly" ? hourlyRate : null,
          compensationType === "monthly" ? monthlySalary : null, now, auth.actor.email, now, employee.id, auth.actor.storeId, now),
    );
  }

  const results = await db.batch(statements);
  if (!results[0].meta.changes) {
    throw new ApplicationError("Hồ sơ vừa được cập nhật hoặc không thể hạ quyền Chủ quán cuối cùng. Hãy tải lại.", 409, "account_conflict");
  }

  if (roleChanged && employee.auth_user_id) {
    try {
      const supabase = createAdmin();
      await supabase.auth.admin.updateUserById(employee.auth_user_id, {
        app_metadata: { role: nextRole, role_id: nextRoleId, store_id: employee.store_id },
      });
    } catch {
      // Local dev or non-fatal auth sync
    }
  }

  return Response.json({ updated: true, updatedAt: now, role: nextRole, roleId: nextRoleId });
});

function clean(value: unknown, fallback: string, max: number, allowEmpty = false) {
  if (typeof value !== "string") return fallback;
  const result = value.trim().slice(0, max);
  return result || (allowEmpty ? "" : fallback);
}

function dateValue(value: unknown, fallback: string | null) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function money(value: unknown, fallback: number) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) throw new ApplicationError("Mức lương không hợp lệ.");
  return Math.round(amount);
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function isMissingAuthUser(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; code?: string; message?: string };
  const message = candidate.message?.toLowerCase() ?? "";
  return candidate.status === 404 || candidate.code === "user_not_found" || message.includes("user not found");
}

function classifyAuthError(error: unknown, defaultMessage: string): ApplicationError {
  if (error instanceof ApplicationError) return error;
  const msg = (error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error)).toLowerCase();
  const status = typeof error === "object" && error !== null && "status" in error ? (error as { status: number }).status : 0;
  if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("unique") || status === 422) {
    return new ApplicationError("Email này đã tồn tại trong dịch vụ đăng nhập.", 409, "account_conflict");
  }
  if (msg.includes("rate limit") || msg.includes("over_email_send_rate_limit") || status === 429) {
    return new ApplicationError("Vượt quá giới hạn tần suất gửi email / thao tác. Vui lòng chờ ít phút trước khi thử lại.", 429, "rate_limit_exceeded");
  }
  if (msg.includes("smtp") || msg.includes("mail") || msg.includes(" error sending ") || msg.includes("550 ") || msg.includes("554 ") || msg.includes("rejected")) {
    return new ApplicationError("Nhà cung cấp email từ chối gửi thư hoặc cấu hình SMTP chưa hợp lệ.", 502, "email_provider_rejected");
  }
  if (msg.includes("app_url") || msg.includes("redirect") || msg.includes("site_url")) {
    return new ApplicationError("Chưa cấu hình địa chỉ ứng dụng hợp lệ.", 503, "app_url_missing");
  }
  if (msg.includes("apikey") || msg.includes("service_role") || msg.includes("jwt") || status === 401 || status === 403) {
    return new ApplicationError("Thiếu hoặc sai cấu hình kết nối dịch vụ xác thực (Auth).", 503, "auth_config_missing");
  }
  return new ApplicationError(error instanceof Error && error.message ? error.message : defaultMessage, 502, "auth_provider_failed");
}
