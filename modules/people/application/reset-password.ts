import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export async function resetPassword(
  db: D1Database,
  actorEmail: string,
  accountId: string,
  resetProvider: () => Promise<{ error: unknown }>,
) {
  const now = new Date().toISOString();
  // Reserve before the provider call: parallel changes must not clear a reset requirement.
  const reservation = await db.prepare(`UPDATE employees
    SET must_change_password = 1, password_reset_pending = 1, password_version = password_version + 1, updated_at = ?
    WHERE id = ? AND password_reset_pending = 0 RETURNING password_version`)
    .bind(now, accountId).first<{ password_version: number }>();
  if (!reservation) throw new ApplicationError("Một yêu cầu cấp mật khẩu đang được xử lý. Hãy thử lại sau.", 409, "password_reset_pending");
  try {
    const result = await resetProvider();
    if (result.error) throw new ApplicationError("Không thể cấp lại mật khẩu lúc này. Hãy thử lại.", 502, "password_reset_failed");
    await db.batch([
      db.prepare(`UPDATE employees SET password_reset_pending = 0 WHERE id = ? AND password_version = ?`)
        .bind(accountId, reservation.password_version),
      auditStatement(db, actorEmail, "employee", accountId, "account.password_reset", {}, now, true),
    ]);
  } catch (error) {
    // Keep must_change_password set even on ambiguous provider/network failure.
    await db.prepare("UPDATE employees SET password_reset_pending = 0 WHERE id = ? AND password_version = ?")
      .bind(accountId, reservation.password_version).run();
    throw error;
  }
}
