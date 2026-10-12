import { canManageEmployee, assignableRoles, type EmployeeStatus } from "@/modules/people/domain/access";
import { updateEmployeeAccess } from "@/modules/people/application/update-access";
import { resetPassword } from "@/modules/people/application/reset-password";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { ensureDatabase } from "@/db/runtime";
import { createAdmin } from "@/lib/supabase/server";
import { auditStatement, requireApiUser, type ActorRole } from "@/server/auth";

const creatableRoles: readonly ActorRole[] = assignableRoles;

export const GET = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;

  const url = new URL(request.url);
  const auditForId = url.searchParams.get("auditFor");

  const db = await ensureDatabase();

  if (auditForId) {
    const logs = await db.prepare(
      `SELECT id, actor_email, action, metadata, created_at
       FROM audit_events
       WHERE entity_type = 'employee' AND entity_id = ? AND store_id = ?
          AND EXISTS (SELECT 1 FROM employees e WHERE e.id = audit_events.entity_id AND e.store_id = ?)
       ORDER BY created_at DESC LIMIT 20`
    ).bind(auditForId, auth.actor.storeId, auth.actor.storeId).all();
    return Response.json({ auditLogs: logs.results });
  }

  const result = await db.prepare(
    `SELECT id, email, display_name, COALESCE(job_title, 'Barista') AS job_title, phone, start_date, last_login_at,
            role, status, auth_user_id, invited_by, created_at, updated_at,
            COALESCE(participates_attendance, CASE WHEN role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) AS participates_attendance,
            COALESCE(payroll_eligible, CASE WHEN role IN ('owner', 'system_admin') THEN 0 ELSE 1 END) AS payroll_eligible,
            COALESCE(compensation_type, CASE WHEN role IN ('owner', 'system_admin') THEN 'none' ELSE 'hourly' END) AS compensation_type,
            COALESCE(hourly_rate, CASE WHEN role = 'manager' THEN 35000 ELSE 25000 END) AS hourly_rate,
            COALESCE(monthly_salary, 0) AS monthly_salary
     FROM employees WHERE store_id = ? ORDER BY status, display_name`,
  ).bind(auth.actor.storeId).all();

  // Also include store info
  const store = await db.prepare("SELECT name FROM stores WHERE id = ?").bind(auth.actor.storeId).first<{ name: string }>();

  return Response.json({
    accounts: result.results,
    storeName: store?.name ?? "LoopiCafe Nguyễn Trãi",
    currentUserEmail: auth.actor.email,
    currentUserId: auth.actor.id,
    currentUserRole: auth.actor.role,
  });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;

  const body = (await readObject(request, {
    email: "string", displayName: "string", jobTitle: "string", phone: "string", startDate: "string", role: "string",
    activationMethod: "string", mustChangePassword: "boolean", participatesAttendance: "boolean", payrollEligible: "boolean",
    compensationType: "string", hourlyRate: "money", monthlySalary: "money",
  })) as {
    email?: string;
    displayName?: string;
    jobTitle?: string;
    phone?: string;
    startDate?: string;
    role?: ActorRole;
    activationMethod?: "invite" | "temporary_password";
    mustChangePassword?: boolean;
    participatesAttendance?: boolean;
    payrollEligible?: boolean;
    compensationType?: "hourly" | "monthly" | "shift" | "none";
    hourlyRate?: number | string;
    monthlySalary?: number | string;
  };

  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const jobTitle = body.jobTitle?.trim() || "Barista";
  const phone = body.phone?.trim() || "";
  const startDate = body.startDate || new Date().toISOString().split("T")[0];
  const role = body.role || "employee";
  const activationMethod = body.activationMethod || "temporary_password";
  const mustChangePassword = body.mustChangePassword !== false;
  const participatesAttendance = body.participatesAttendance ?? (role !== "owner" && role !== "system_admin");
  const compensationType = ["hourly", "monthly", "shift", "none"].includes(body.compensationType ?? "")
    ? body.compensationType!
    : role === "owner" || role === "system_admin" ? "none" : "hourly";
  const payrollEligible = compensationType !== "none" && (body.payrollEligible ?? (role !== "owner" && role !== "system_admin"));
  const hourlyRate = safeMoney(body.hourlyRate, role === "manager" ? 35000 : 25000);
  const monthlySalary = safeMoney(body.monthlySalary, 0);

  // Manager cannot assign Owner role
  if (auth.actor.role === "manager" && role === "owner") {
    return Response.json({ error: "Quản lý không có quyền cấp vai trò Admin / Chủ quán." }, { status: 403 });
  }

  if (
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !displayName || displayName.length < 2 ||
    !role || !creatableRoles.includes(role) || !["invite", "temporary_password"].includes(activationMethod)
  ) {
    return Response.json({ error: "Thông tin tài khoản không hợp lệ. Vui lòng kiểm tra lại." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const existing = await db.prepare("SELECT id FROM employees WHERE lower(email) = lower(?)")
    .bind(email).first();
  if (existing) return Response.json({ error: "Email này đã tồn tại trong đội ngũ nhân sự." }, { status: 409 });

  const temporaryPassword = activationMethod === "temporary_password" ? generateTemporaryPassword() : undefined;
  const status = activationMethod === "invite" ? "invited" : "active";

  const supabase = createAdmin();
  let authUserId: string | null = null;

  if (activationMethod === "temporary_password") {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName.slice(0, 100),
        job_title: jobTitle,
      },
      app_metadata: {
        role,
        store_id: auth.actor.storeId,
      },
    });

    if (error || !data.user) {
      return Response.json(
        { error: "Không thể tạo tài khoản đăng nhập. Hãy kiểm tra email hoặc thử lại sau." },
        { status: 400 },
      );
    }
    authUserId = data.user.id;
  } else {
    // Send invitation email via Supabase
    if (!process.env.NEXT_PUBLIC_APP_URL) return Response.json({ error: "Chưa cấu hình địa chỉ ứng dụng để gửi lời mời." }, { status: 503 });
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        display_name: displayName.slice(0, 100),
        job_title: jobTitle,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/auth/callback`,
    });
    if (error || !data.user) return Response.json({ error: "Không thể gửi lời mời kích hoạt." }, { status: 502 });
    authUserId = data.user.id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO employees
          (id, store_id, email, display_name, job_title, phone, start_date, auth_user_id, role, status,
           participates_attendance, payroll_eligible, compensation_type, hourly_rate, monthly_salary,
           invited_by, created_at, updated_at, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        auth.actor.storeId,
        email,
        displayName.slice(0, 100),
        jobTitle,
        phone,
        startDate,
        authUserId,
        role,
        status,
        participatesAttendance ? 1 : 0,
        payrollEligible ? 1 : 0,
        compensationType,
        hourlyRate,
        monthlySalary,
        auth.actor.email,
        now,
        now,
        activationMethod === "invite" || mustChangePassword ? 1 : 0,
      ),
      auditStatement(db, auth.actor.email, "employee", id, "account.created", { role, jobTitle, activationMethod }, now),
    ]);
  } catch (dbError) {
    if (authUserId) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    }
    throw dbError;
  }

  return Response.json({
    account: {
      id,
      email,
      display_name: displayName,
      job_title: jobTitle,
      phone,
      start_date: startDate,
      role,
      status,
      participates_attendance: participatesAttendance,
      payroll_eligible: payrollEligible,
      compensation_type: compensationType,
      hourly_rate: hourlyRate,
      monthly_salary: monthlySalary,
      created_at: now,
    },
    temporaryPassword,
  });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;

  const body = (await readObject(request, {
    id: "string", action: "string", displayName: "string", jobTitle: "string", phone: "string", startDate: "string", role: "string", status: "string",
    participatesAttendance: "boolean", payrollEligible: "boolean", compensationType: "string", hourlyRate: "money", monthlySalary: "money",
  })) as {
    id?: string;
    action?: "update_info" | "change_role" | "update_status" | "reset_password" | "resend_invite";
    displayName?: string;
    jobTitle?: string;
    phone?: string;
    startDate?: string;
    role?: ActorRole;
    status?: EmployeeStatus;
    participatesAttendance?: boolean;
    payrollEligible?: boolean;
    compensationType?: "hourly" | "monthly" | "shift" | "none";
    hourlyRate?: number | string;
    monthlySalary?: number | string;
  };

  if (!body.id) {
    return Response.json({ error: "Thiếu ID tài khoản cần cập nhật." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const account = await db.prepare(
    "SELECT id, email, display_name, store_id, auth_user_id, role, status, job_title, phone, start_date, participates_attendance, payroll_eligible, compensation_type, hourly_rate, monthly_salary FROM employees WHERE id = ? AND store_id = ?",
  ).bind(body.id, auth.actor.storeId).first<{
    id: string; email: string; display_name: string; store_id: string; auth_user_id: string | null; role: ActorRole; status: EmployeeStatus; job_title: string;
    phone: string | null; start_date: string | null; participates_attendance: number; payroll_eligible: number;
    compensation_type: "hourly" | "monthly" | "shift" | "none"; hourly_rate: number; monthly_salary: number;
  }>();

  if (!account) return Response.json({ error: "Không tìm thấy tài khoản nhân sự." }, { status: 404 });

  // Manager cannot modify Owner account
  if (!canManageEmployee(auth.actor, account)) {
    return Response.json({ error: "Quản lý không có quyền chỉnh sửa tài khoản Chủ quán." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const supabase = createAdmin();

  // Action 1: Update Basic Info (Họ tên, Chức danh, SĐT, Ngày làm)
  if (body.action === "update_info") {
    const nextName = body.displayName?.trim() || account.display_name;
    const nextJobTitle = body.jobTitle?.trim() || account.job_title;
    const nextPhone = body.phone === undefined ? account.phone : body.phone.trim();
    const nextStartDate = body.startDate ?? account.start_date;
    const nextParticipatesAttendance = body.participatesAttendance === undefined ? account.participates_attendance : Number(body.participatesAttendance);
    const nextCompensationType = ["hourly", "monthly", "shift", "none"].includes(body.compensationType ?? "")
      ? body.compensationType!
      : account.compensation_type;
    const nextPayrollEligible = nextCompensationType === "none" ? 0 : body.payrollEligible === undefined ? account.payroll_eligible : Number(body.payrollEligible);
    const nextHourlyRate = safeMoney(body.hourlyRate, account.hourly_rate);
    const nextMonthlySalary = safeMoney(body.monthlySalary, account.monthly_salary);

    await db.batch([
      db.prepare(
        `UPDATE employees SET display_name = ?, job_title = ?, phone = ?, start_date = ?,
          participates_attendance = ?, payroll_eligible = ?, compensation_type = ?,
          hourly_rate = ?, monthly_salary = ?, updated_at = ? WHERE id = ?`
      ).bind(
        nextName, nextJobTitle, nextPhone, nextStartDate, nextParticipatesAttendance,
        nextPayrollEligible, nextCompensationType, nextHourlyRate, nextMonthlySalary, now, body.id,
      ),
      auditStatement(db, auth.actor.email, "employee", body.id, "account.info_updated", {
        fields: Object.keys(body).filter((key) => key !== "id" && key !== "action"),
        participatesAttendance: Boolean(nextParticipatesAttendance),
        payrollEligible: Boolean(nextPayrollEligible),
        compensationType: nextCompensationType,
      }, now),
    ]);

    if (account.auth_user_id) {
      await supabase.auth.admin.updateUserById(account.auth_user_id, {
        user_metadata: { display_name: nextName, job_title: nextJobTitle },
      }).catch(() => undefined);
    }

    return Response.json({ updated: true, message: "Đã cập nhật thông tin nhân viên thành công." });
  }

  // Action 2: Change Role (Đổi vai trò hệ thống)
  if (body.action === "change_role") {
    const newRole = body.role;
    if (!newRole || !creatableRoles.includes(newRole)) {
      return Response.json({ error: "Vai trò phân quyền không hợp lệ." }, { status: 400 });
    }

    // Manager cannot assign Owner
    if (auth.actor.role === "manager" && newRole === "owner") {
      return Response.json({ error: "Quản lý không có quyền thăng cấp thành Chủ quán." }, { status: 403 });
    }

    await updateEmployeeAccess(db, auth.actor, body.id, { role: newRole });

    if (account.auth_user_id) {
      await supabase.auth.admin.updateUserById(account.auth_user_id, {
        app_metadata: { role: newRole, store_id: account.store_id },
      }).catch(() => undefined);
    }

    return Response.json({ updated: true, message: `Đã đổi vai trò hệ thống thành ${newRole === "owner" ? "Chủ quán" : newRole === "manager" ? "Quản lý" : "Nhân viên"}.` });
  }

  // Action 3: Update Status (Tạm khóa / Mở khóa / Chấm dứt làm việc / Đã nghỉ)
  if (body.action === "update_status") {
    const newStatus = body.status;
    if (!newStatus || !["active", "suspended", "offboarded", "invited"].includes(newStatus)) {
      return Response.json({ error: "Trạng thái tài khoản không hợp lệ." }, { status: 400 });
    }

    await updateEmployeeAccess(db, auth.actor, body.id, { status: newStatus });

    if (account.auth_user_id) {
      await supabase.auth.admin.updateUserById(account.auth_user_id, {
        ban_duration: newStatus === "suspended" || newStatus === "offboarded" ? "876000h" : "none",
      }).catch(() => undefined);
    }

    const statusLabelMap: Record<string, string> = {
      active: "Đang hoạt động",
      suspended: "Tạm khóa",
      offboarded: "Đã nghỉ việc",
      invited: "Chờ kích hoạt",
    };

    return Response.json({ updated: true, message: `Đã chuyển trạng thái tài khoản sang ${statusLabelMap[newStatus]}.` });
  }

  // Action 4: Reset Password (Cấp lại mật khẩu tạm)
  if (body.action === "reset_password") {
    if (!account.auth_user_id) return Response.json({ error: "Tài khoản chưa được liên kết với dịch vụ đăng nhập." }, { status: 409 });
    const temporaryPassword = generateTemporaryPassword();

    await resetPassword(db, auth.actor.email, account.id, () =>
      supabase.auth.admin.updateUserById(account.auth_user_id!, { password: temporaryPassword }));

    return Response.json({ updated: true, temporaryPassword, message: "Đã tạo mật khẩu tạm thời mới." });
  }

  // Action 5: Resend Invitation (Gửi lại lời mời)
  if (body.action === "resend_invite") {
    if (account.status !== "invited") return Response.json({ error: "Chỉ gửi lại lời mời cho tài khoản đang chờ kích hoạt." }, { status: 409 });
    if (!process.env.NEXT_PUBLIC_APP_URL) return Response.json({ error: "Chưa cấu hình địa chỉ ứng dụng để gửi lời mời." }, { status: 503 });
    const { error } = await supabase.auth.admin.inviteUserByEmail(account.email, {
      redirectTo: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` : undefined,
    });
    if (error) return Response.json({ error: "Không gửi được lời mời. Vui lòng kiểm tra dịch vụ email." }, { status: 502 });

    await auditStatement(db, auth.actor.email, "employee", body.id, "account.invite_resent", {}, now).run();

    return Response.json({ updated: true, message: `Đã gửi lại email lời mời kích hoạt tới ${account.email}.` });
  }

  return Response.json({ error: "Hành động không hợp lệ." }, { status: 400 });
});

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function safeMoney(value: unknown, fallback: number) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000 ? Math.round(amount) : fallback;
}
