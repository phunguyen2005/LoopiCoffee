import { auditStatement } from "../../../server/audit.ts";

export type VerifiedIdentity = { email: string; displayName: string; authUserId?: string; authenticatedAt?: string };

export async function completeSignIn(
  db: D1Database,
  identity: VerifiedIdentity,
  options: { allowAuthRelink?: boolean } = {},
) {
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

  const allowAuthRelink = options.allowAuthRelink ?? process.env.LOOPI_LOCAL_ONLY === "true";
  if (allowAuthRelink && identity.authUserId) {
    await db.batch([
      db.prepare(
        `UPDATE employees
         SET status = 'active', auth_user_id = ?, last_login_at = ?, updated_at = ?
         WHERE lower(email) = lower(?) AND status IN ('active', 'invited')
           AND auth_user_id IS NOT NULL AND auth_user_id <> ?`,
      ).bind(identity.authUserId, now, now, identity.email, identity.authUserId),
      auditStatement(db, identity.email, "employee", identity.email, "employee.local_auth_relinked", {
        reason: "Local Auth was recreated; restored the verified email-to-membership link.",
        localOnly: true,
      }, now, true),
    ]);
  }

  // Authentication never creates membership, assigns an owner, or records consent.
  return db.prepare(`SELECT id FROM employees WHERE lower(email) = lower(?) AND status = 'active'
    AND (? IS NULL OR auth_user_id IS NULL OR auth_user_id = ?)`)
    .bind(identity.email, identity.authUserId ?? null, identity.authUserId ?? null).first<{ id: string }>();
}
