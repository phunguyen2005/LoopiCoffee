import { auditStatement } from "../../../server/audit.ts";

export type VerifiedIdentity = { email: string; displayName: string; authUserId?: string };

export async function completeSignIn(db: D1Database, identity: VerifiedIdentity) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE employees SET status = 'active', auth_user_id = COALESCE(auth_user_id, ?), last_login_at = ?, updated_at = ?
       WHERE lower(email) = lower(?) AND status = 'invited'
         AND (? IS NULL OR auth_user_id IS NULL OR auth_user_id = ?)`,
    ).bind(identity.authUserId ?? null, now, now, identity.email, identity.authUserId ?? null, identity.authUserId ?? null),
    auditStatement(db, identity.email, "employee", identity.email, "employee.invitation_accepted", {}, now, true),
    db.prepare(`UPDATE employees SET last_login_at = ?, auth_user_id = COALESCE(auth_user_id, ?)
      WHERE lower(email) = lower(?) AND status = 'active'
        AND (? IS NULL OR auth_user_id IS NULL OR auth_user_id = ?)`)
      .bind(now, identity.authUserId ?? null, identity.email, identity.authUserId ?? null, identity.authUserId ?? null),
  ]);
  // Authentication never creates membership, assigns an owner, or records consent.
  return db.prepare(`SELECT id FROM employees WHERE lower(email) = lower(?) AND status = 'active'
    AND (? IS NULL OR auth_user_id IS NULL OR auth_user_id = ?)`)
    .bind(identity.email, identity.authUserId ?? null, identity.authUserId ?? null).first<{ id: string }>();
}
