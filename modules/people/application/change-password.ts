import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

type PasswordIdentity = { email: string; authUserId: string };

export async function changePassword(
  db: D1Database,
  identity: PasswordIdentity,
  password: string,
  updateProvider: (password: string) => Promise<{ error: unknown }>,
) {
  if (password.length < 10 || password.length > 128) {
    throw new ApplicationError("Mật khẩu cần có từ 10 đến 128 ký tự.");
  }
  const account = await db.prepare(
    `SELECT id, password_version, password_reset_pending FROM employees
     WHERE lower(email) = lower(?) AND auth_user_id = ? AND status = 'active'`,
  ).bind(identity.email, identity.authUserId).first<{ id: string; password_version: number; password_reset_pending: number }>();
  if (!account) throw new ApplicationError("Tài khoản không có quyền truy cập.", 403, "membership_required");
  if (account.password_reset_pending) throw new ApplicationError("Quản lý đang cấp lại mật khẩu. Hãy thử lại sau.", 409, "password_reset_pending");
  const result = await updateProvider(password);
  if (result.error) throw new ApplicationError("Không thể đổi mật khẩu. Mật khẩu có thể không đáp ứng chính sách hoặc cần xác minh lại phiên đăng nhập.", 400, "password_update_failed");
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(`UPDATE employees SET must_change_password = 0, password_version = password_version + 1, updated_at = ?
      WHERE id = ? AND auth_user_id = ? AND status = 'active' AND password_version = ? AND password_reset_pending = 0`)
      .bind(now, account.id, identity.authUserId, account.password_version),
    auditStatement(db, identity.email, "employee", account.id, "account.password_changed", {}, now, true),
  ]);
  if (!results[0].meta.changes) throw new ApplicationError("Tài khoản vừa được cập nhật. Hãy đăng nhập lại và đổi mật khẩu.", 409, "password_change_conflict");
  return { updated: true };
}
