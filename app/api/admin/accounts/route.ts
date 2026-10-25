import { assignableRoles, type ActorRole, type EmployeeStatus } from "@/modules/people/domain/access";
import { updateEmployeeAccess } from "@/modules/people/application/update-access";
import { resetPassword } from "@/modules/people/application/reset-password";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { ensureDatabase } from "@/db/runtime";
import { createAdmin } from "@/lib/supabase/server";
import { auditStatement, hasRecentAuthentication, requireApiUser } from "@/server/auth";

const accountActions = ["change_role", "update_status", "reset_password", "resend_invite"] as const;

export const GET = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const auditForId = new URL(request.url).searchParams.get("auditFor");
  if (auditForId) {
    const logs = await db.prepare(`SELECT id, actor_email, action, metadata, created_at FROM audit_events
      WHERE entity_type = 'employee' AND entity_id = ? AND store_id = ?
      ORDER BY created_at DESC LIMIT 20`).bind(auditForId, auth.actor.storeId).all();
    return Response.json({ auditLogs: logs.results }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const result = await db.prepare(`SELECT e.id, e.email, e.display_name, e.last_login_at, e.role, e.role_id,
      cr.name AS role_name, e.status, e.auth_user_id, e.invited_by, e.must_change_password,
      e.password_reset_pending, e.access_revision, e.created_at, e.updated_at
    FROM employees e
    LEFT JOIN custom_roles cr ON cr.id = e.role_id
    WHERE e.store_id = ? AND e.role <> 'system_admin'
    ORDER BY e.status, e.display_name`).bind(auth.actor.storeId).all();
  const customRoles = await db.prepare(
    "SELECT id, name, status, revision FROM custom_roles WHERE store_id = ? AND status = 'active' ORDER BY name",
  ).bind(auth.actor.storeId).all();
  const store = await db.prepare("SELECT name FROM stores WHERE id = ?").bind(auth.actor.storeId).first<{ name: string }>();
  return Response.json({
    accounts: result.results,
    customRoles: customRoles.results,
    storeName: store?.name ?? "LoopyCafe",
    currentUserEmail: auth.actor.email,
    currentUserId: auth.actor.id,
    currentUserRole: auth.actor.role,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { email: "string", displayName: "string", role: "string", roleId: "string?", activationMethod: "string",
    mustChangePassword: "boolean", reason: "string", idempotencyKey: "string" }) as {
    email?: string; displayName?: string; role?: ActorRole; roleId?: string | null; activationMethod?: "invite" | "temporary_password";
    mustChangePassword?: boolean; reason?: string; idempotencyKey?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const role = body.role ?? "employee";
  const roleId = body.roleId?.trim() || null;
  const activationMethod = body.activationMethod ?? "invite";
  validateAccountInput(email, displayName, role, activationMethod);
  requireOwnerSafeguards(auth.actor, role === "owner", body.reason);
  const db = await ensureDatabase();
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
  const key = validOperationKey(body.idempotencyKey);
  const requestHash = await hashPayload({ email, displayName, role, roleId, activationMethod });
  const replay = await reserveOperation(db, auth.actor, key, null, "create", requestHash);
  if (replay) return replay;
  const existing = await db.prepare("SELECT id FROM employees WHERE lower(email) = lower(?)").bind(email!).first();
  if (existing) throw new ApplicationError("Email này đã tồn tại trong hệ thống.", 409, "account_conflict");
  const supabase = createAdmin();
  const temporaryPassword = activationMethod === "temporary_password" ? generateTemporaryPassword() : undefined;
  let authUserId: string | null = null;
  try {
    if (activationMethod === "temporary_password") {
      const { data, error } = await supabase.auth.admin.createUser({ email: email!, password: temporaryPassword!, email_confirm: true,
        user_metadata: { display_name: displayName!.slice(0, 100) }, app_metadata: { role, role_id: roleId, store_id: auth.actor.storeId } });
      if (error || !data.user) throw classifyAuthError(error, "Không thể tạo tài khoản đăng nhập.");
      authUserId = data.user.id;
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) throw new ApplicationError("Chưa cấu hình địa chỉ ứng dụng để gửi lời mời.", 503, "app_url_missing");
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email!, { data: { display_name: displayName!.slice(0, 100) },
        redirectTo: `${appUrl.replace(/\/$/, "")}/auth/callback` });
      if (error || !data.user) throw classifyAuthError(error, "Không thể gửi lời mời kích hoạt.");
      authUserId = data.user.id;
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      const results = await db.batch([
        db.prepare(`INSERT INTO employees
          (id, store_id, email, display_name, auth_user_id, role, role_id, status, participates_attendance,
           payroll_eligible, compensation_type, invited_by, created_at, updated_at, must_change_password)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'none', ?, ?, ?, ?
          WHERE ? <> 'owner' OR NOT EXISTS (
            SELECT 1 FROM employees WHERE store_id = ? AND role = 'owner'
          )`)
          .bind(id, auth.actor.storeId, email!, displayName!.slice(0, 100), authUserId, role, roleId,
            activationMethod === "invite" ? "invited" : "active", auth.actor.email, now, now,
            activationMethod === "invite" || body.mustChangePassword !== false ? 1 : 0, role, auth.actor.storeId),
        auditStatement(db, auth.actor.email, "employee", id, "account.created", { role, roleId, activationMethod,
          reason: body.reason?.trim(), highPriority: role === "owner" }, now, true, crypto.randomUUID(), auth.actor.storeId),
        db.prepare(`UPDATE admin_account_operations SET target_employee_id = ?, status = 'completed', updated_at = ?
          WHERE id = ? AND status = 'pending' AND EXISTS (
            SELECT 1 FROM employees WHERE id = ? AND store_id = ?
          )`).bind(id, now, key, id, auth.actor.storeId),
        ...ownerNotifications(db, auth.actor.storeId, auth.actor.email, `Quản trị viên đã tạo tài khoản ${role}`, now, id),
      ]);
      if (!results[0].meta.changes) {
        throw new ApplicationError(
          "Cửa hàng đã có tài khoản Chủ quán. Hãy khôi phục tài khoản đó thay vì tạo thêm.",
          409,
          "owner_limit",
        );
      }
    } catch (dbError) {
      if (dbError instanceof ApplicationError) throw dbError;
      const msg = dbError instanceof Error ? dbError.message : String(dbError);
      if (/UNIQUE/i.test(msg)) {
        throw new ApplicationError("Email này đã tồn tại trong hồ sơ cửa hàng.", 409, "account_conflict");
      }
      throw new ApplicationError("Không thể lưu hồ sơ tài khoản vào cơ sở dữ liệu. Đã hoàn tác tài khoản đăng nhập.", 503, "account_persistence_failed");
    }
    return Response.json({ account: { id, email, display_name: displayName, role, role_id: roleId,
      status: activationMethod === "invite" ? "invited" : "active", access_revision: 0 }, temporaryPassword });
  } catch (error) {
    if (authUserId) await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
    await markOperationFailed(db, key, error);
    throw error;
  }
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { id: "string", action: "string", role: "string", roleId: "string?", status: "string",
    expectedRevision: "number", reason: "string", idempotencyKey: "string" }) as {
    id?: string; action?: typeof accountActions[number]; role?: ActorRole; roleId?: string | null; status?: EmployeeStatus;
    expectedRevision?: number; reason?: string; idempotencyKey?: string;
  };
  if (!body.id || !body.action || !accountActions.includes(body.action) || !Number.isInteger(body.expectedRevision)) {
    return Response.json({ error: "Thông tin thay đổi tài khoản không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const account = await db.prepare(`SELECT id, email, display_name, store_id, auth_user_id, role, role_id, status, access_revision
    FROM employees WHERE id = ? AND store_id = ?`).bind(body.id, auth.actor.storeId).first<{
      id: string; email: string; display_name: string; store_id: string; auth_user_id: string | null; role: ActorRole; role_id: string | null;
      status: EmployeeStatus; access_revision: number;
    }>();
  if (!account) throw new ApplicationError("Không tìm thấy tài khoản.", 404, "account_not_found");
  if (account.role === "system_admin" || account.id === auth.actor.id) throw new ApplicationError("Không thể thay đổi tài khoản quản trị bằng luồng này.", 403, "permission_denied");
  const nextRole = body.action === "change_role" ? body.role : account.role;
  requireOwnerSafeguards(auth.actor, account.role === "owner" || nextRole === "owner", body.reason);
  const key = validOperationKey(body.idempotencyKey);
  const requestHash = await hashPayload({ id: body.id, action: body.action, role: body.role, roleId: body.roleId, status: body.status,
    expectedRevision: body.expectedRevision, reason: body.reason });
  const replay = await reserveOperation(db, auth.actor, key, account.id, body.action, requestHash);
  if (replay) return replay;
  const supabase = createAdmin();
  const expectedRevision = body.expectedRevision as number;
  try {
    let result: Record<string, unknown> = { updated: true };
    if (body.action === "change_role") {
      if (!body.role || !assignableRoles.includes(body.role as typeof assignableRoles[number])) throw new ApplicationError("Vai trò không hợp lệ.", 400, "permission_not_assignable");
      const targetRoleId = body.roleId !== undefined ? (body.roleId?.trim() || null) : account.role_id;
      const alreadyApplied = account.role === body.role && account.role_id === targetRoleId && account.access_revision === expectedRevision + 1;
      const updated = alreadyApplied ? { access_revision: account.access_revision } : await updateEmployeeAccess(db, auth.actor, account.id, { role: body.role, roleId: targetRoleId, expectedRevision, reason: body.reason });
      result = { ...result, revision: updated.access_revision, recovered: alreadyApplied || undefined };
      if (account.auth_user_id) {
        const { error } = await supabase.auth.admin.updateUserById(account.auth_user_id, { app_metadata: { role: body.role, role_id: targetRoleId, store_id: account.store_id } });
        if (error) throw new ApplicationError("D1 đã cập nhật nhưng metadata đăng nhập chưa đồng bộ. Hãy retry thao tác.", 502, "auth_provider_failed");
      }
    } else if (body.action === "update_status") {
      if (!body.status || !["active", "invited", "suspended", "offboarded"].includes(body.status)) throw new ApplicationError("Trạng thái không hợp lệ.", 400, "account_conflict");
      const alreadyApplied = account.status === body.status && account.access_revision === expectedRevision + 1;
      const updated = alreadyApplied ? { access_revision: account.access_revision } : await updateEmployeeAccess(db, auth.actor, account.id, { status: body.status, expectedRevision, reason: body.reason });
      result = { ...result, revision: updated.access_revision, recovered: alreadyApplied || undefined };
      if (account.auth_user_id) {
        const { error } = await supabase.auth.admin.updateUserById(account.auth_user_id, { ban_duration: ["suspended", "offboarded"].includes(body.status) ? "876000h" : "none" });
        if (error) throw new ApplicationError("D1 đã cập nhật nhưng trạng thái Auth chưa đồng bộ. Hãy retry thao tác.", 502, "auth_provider_failed");
      }
    } else if (body.action === "reset_password") {
      if (!account.auth_user_id) throw new ApplicationError("Tài khoản chưa liên kết dịch vụ đăng nhập.", 409, "account_conflict");
      const password = generateTemporaryPassword();
      await resetPassword(db, auth.actor.email, account.id, async () => {
        const { error } = await supabase.auth.admin.updateUserById(account.auth_user_id!, { password });
        if (!error) return { error: null, authUserId: account.auth_user_id! };
        if (!isMissingAuthUser(error)) throw classifyAuthError(error, "Không thể cập nhật mật khẩu tạm.");

        const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listError) throw classifyAuthError(listError, "Không thể kiểm tra tài khoản đăng nhập.");
        const matchingUser = usersData.users.find((user) => user.email?.toLowerCase() === account.email.toLowerCase());
        if (matchingUser) {
          const { error: relinkError } = await supabase.auth.admin.updateUserById(matchingUser.id, { password });
          if (relinkError) throw classifyAuthError(relinkError, "Không thể cập nhật mật khẩu tạm.");
          return { error: null, authUserId: matchingUser.id };
        }

        const { data: createdData, error: createError } = await supabase.auth.admin.createUser({
          email: account.email,
          password,
          email_confirm: true,
          app_metadata: { role: account.role, role_id: account.role_id, store_id: account.store_id },
          user_metadata: { display_name: account.display_name },
        });
        if (createError || !createdData.user) throw classifyAuthError(createError, "Không thể khôi phục tài khoản đăng nhập.");
        return { error: null, authUserId: createdData.user.id };
      });
      result = { ...result, temporaryPassword: password };
    } else {
      if (account.status !== "invited") throw new ApplicationError("Chỉ gửi lại lời mời cho tài khoản đang chờ kích hoạt.", 409, "account_conflict");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) throw new ApplicationError("Chưa cấu hình địa chỉ ứng dụng.", 503, "app_url_missing");
      const { error } = await supabase.auth.admin.inviteUserByEmail(account.email, { redirectTo: `${appUrl.replace(/\/$/, "")}/auth/callback` });
      if (error) throw classifyAuthError(error, "Không gửi được lời mời.");
      await auditStatement(db, auth.actor.email, "employee", account.id, "account.invite_resent", {}, new Date().toISOString(), false, crypto.randomUUID(), auth.actor.storeId).run();
    }
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE admin_account_operations SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'pending'").bind(now, key),
      ...ownerNotifications(db, auth.actor.storeId, auth.actor.email, `Quản trị viên đã thực hiện ${body.action} trên tài khoản ${account.role}`, now),
    ]);
    return Response.json(result);
  } catch (error) {
    await markOperationFailed(db, key, error);
    throw error;
  }
});

function validateAccountInput(email: string | undefined, name: string | undefined, role: ActorRole, method: string) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length < 2 ||
      !assignableRoles.includes(role as typeof assignableRoles[number]) || !["invite", "temporary_password"].includes(method)) {
    throw new ApplicationError("Thông tin tài khoản không hợp lệ.", 400, "invalid_input");
  }
}

function requireOwnerSafeguards(actor: { authenticatedAt: string | null }, sensitive: boolean, reason?: string) {
  if (!sensitive) return;
  if (!hasRecentAuthentication(actor)) throw new ApplicationError("Hãy đăng nhập lại trước khi thay đổi tài khoản Chủ quán.", 403, "reauthentication_required");
  if (!reason || reason.trim().length < 5) throw new ApplicationError("Hãy nhập lý do thay đổi tài khoản Chủ quán.", 400, "reason_required");
}

function validOperationKey(value?: string) {
  if (!value || !/^[a-zA-Z0-9_-]{12,100}$/.test(value)) throw new ApplicationError("Thiếu mã thao tác hợp lệ.", 400, "invalid_idempotency_key");
  return value;
}

function isMissingAuthUser(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; code?: string; message?: string };
  const message = candidate.message?.toLowerCase() ?? "";
  return candidate.status === 404 || candidate.code === "user_not_found" || message.includes("user not found");
}

async function hashPayload(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function reserveOperation(db: D1Database, actor: { storeId: string; email: string }, id: string, targetId: string | null, action: string, requestHash: string) {
  const previous = await db.prepare("SELECT request_hash, status, error_code FROM admin_account_operations WHERE id = ? AND store_id = ? AND actor_email = ?")
    .bind(id, actor.storeId, actor.email).first<{ request_hash: string; status: string; error_code: string | null }>();
  if (previous) {
    if (previous.request_hash !== requestHash) throw new ApplicationError("Mã thao tác đã được dùng cho nội dung khác.", 409, "account_conflict");
    if (previous.status === "completed") return Response.json({ updated: true, replayed: true, passwordRetrievable: false });
    if (previous.status === "pending") throw new ApplicationError("Thao tác đang được xử lý.", 409, "operation_pending");
    await db.prepare("UPDATE admin_account_operations SET status = 'pending', error_code = NULL, updated_at = ? WHERE id = ? AND status = 'failed'")
      .bind(new Date().toISOString(), id).run();
    return null;
  }
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO admin_account_operations
    (id, store_id, actor_email, target_employee_id, action, request_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(id, actor.storeId, actor.email, targetId, action, requestHash, now, now).run();
  return null;
}

async function markOperationFailed(db: D1Database, id: string, error: unknown) {
  const code = error instanceof ApplicationError ? error.code : "operation_failed";
  await db.prepare("UPDATE admin_account_operations SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(code, new Date().toISOString(), id).run().catch(() => undefined);
}

function ownerNotifications(db: D1Database, storeId: string, actorEmail: string, title: string, now: string, guardEmployeeId?: string) {
  return [db.prepare(`INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
    SELECT lower(hex(randomblob(16))), email, 'admin_security', ?, '/app/admin/audit', ? FROM employees
    WHERE store_id = ? AND role = 'owner' AND status = 'active' AND lower(email) <> lower(?)
      AND (? IS NULL OR EXISTS (
        SELECT 1 FROM employees guard WHERE guard.id = ? AND guard.store_id = ?
      ))`)
    .bind(title, now, storeId, actorEmail, guardEmployeeId ?? null, guardEmployeeId ?? null, storeId)];
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
