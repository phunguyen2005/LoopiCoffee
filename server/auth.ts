import { CONSENT_VERSION, ensureDatabase } from "@/db/runtime";
import { cookies } from "next/headers";

import type { ActorRole, EmployeeStatus } from "@/modules/people/domain/access";
import type { VerifiedIdentity } from "@/modules/people/application/complete-sign-in";
import { loadRolePermissions } from "@/modules/people/application/rbac";
import { defaultPermissionsForRole, type PermissionKey } from "@/modules/people/domain/permissions";
export type { ActorRole } from "@/modules/people/domain/access";
export { auditStatement } from "./audit";

export type ApiActor = {
  id: string;
  email: string;
  displayName: string;
  role: ActorRole;
  status: "active";
  storeId: string;
  hasAttendanceConsent: boolean;
  mustChangePassword: boolean;
  permissions: PermissionKey[];
  permissionRevision: number;
  authenticatedAt: string | null;
  roleId?: string | null;
};

type Identity = VerifiedIdentity;

export const AUTH_REVOCATION_WINDOW_SLA_MS = 10_000;
const AUTH_CACHE_LIMIT = 100;
export const validatedIdentityCache = new Map<string, { identity: Identity; expiresAt: number }>();

export function invalidateIdentityCache(tokenFingerprint?: string) {
  if (tokenFingerprint) {
    validatedIdentityCache.delete(tokenFingerprint);
  } else {
    validatedIdentityCache.clear();
  }
}

export type AuthOptions = {
  bypassCache?: boolean;
};

export async function getApiUser(options?: AuthOptions): Promise<ApiActor | null> {
  const identity = await getVerifiedIdentity(options);
  if (!identity) return null;

  const db = await ensureDatabase();
  const employee = await db.prepare(
    `SELECT e.id, e.email, e.display_name, e.role, e.role_id, e.status, e.store_id, e.must_change_password,
            EXISTS(
              SELECT 1 FROM employee_consents c
              WHERE lower(c.employee_email) = lower(e.email) AND c.notice_version = ?
            ) AS has_consent
     FROM employees e WHERE lower(e.email) = lower(?)
       AND (? IS NULL OR e.auth_user_id IS NULL OR e.auth_user_id = ?)`,
  ).bind(CONSENT_VERSION, identity.email, identity.authUserId ?? null, identity.authUserId ?? null).first<{
    id: string;
    email: string;
    display_name: string;
    role: ActorRole;
    role_id: string | null;
    status: EmployeeStatus;
    store_id: string;
    has_consent: number;
    must_change_password: number;
  }>();

  if (!employee) return null;

  if (employee.status !== "active") return null;

  let permissionSet: { permissions: PermissionKey[]; revision: number; configured: boolean };
  if (employee.role === "system_admin") {
    permissionSet = { permissions: [], revision: 0, configured: true };
  } else if (employee.role === "owner") {
    permissionSet = { permissions: [...defaultPermissionsForRole("owner")], revision: 0, configured: true };
  } else if (employee.role_id) {
    const customRole = await db.prepare(
      "SELECT id, status FROM custom_roles WHERE id = ? AND store_id = ?",
    ).bind(employee.role_id, employee.store_id).first<{ id: string; status: string }>();
    if (!customRole || customRole.status !== "active") {
      permissionSet = { permissions: [], revision: 0, configured: false };
    } else {
      permissionSet = await loadRolePermissions(db, employee.store_id, employee.role_id);
    }
  } else {
    permissionSet = await loadRolePermissions(db, employee.store_id, employee.role);
  }

  return {
    id: employee.id,
    email: employee.email,
    displayName: employee.display_name,
    role: employee.role,
    roleId: employee.role_id ?? null,
    status: "active",
    storeId: employee.store_id,
    hasAttendanceConsent: Boolean(employee.has_consent),
    mustChangePassword: Boolean(employee.must_change_password),
    permissions: permissionSet.permissions,
    permissionRevision: permissionSet.revision,
    authenticatedAt: identity.authenticatedAt ?? null,
  };
}

export async function requireApiPermission(permission: PermissionKey, options?: AuthOptions): Promise<
  { actor: ApiActor; response: null } | { actor: null; response: Response }
> {
  const auth = await requireApiUser(undefined, options);
  if (!auth.actor) return auth;
  if (auth.actor.role === "system_admin" || !hasPermission(auth.actor, permission)) {
    return {
      actor: null,
      response: Response.json(
        { error: "Bạn không có quyền thực hiện thao tác này.", code: "permission_denied", permission },
        { status: 403 },
      ),
    };
  }
  return auth;
}

export function hasPermission(
  actor: { permissions?: readonly string[]; role?: ActorRole },
  permission: PermissionKey,
) {
  if (actor.role === "owner") return true;
  if (actor.role === "system_admin") return false;
  return Boolean(actor.permissions?.includes(permission));
}

export function hasRecentAuthentication(actor: Pick<ApiActor, "authenticatedAt">, maxAgeMs = 5 * 60_000) {
  const value = actor.authenticatedAt ? Date.parse(actor.authenticatedAt) : NaN;
  return Number.isFinite(value) && Date.now() - value <= maxAgeMs;
}

export async function requireApiUser(roles?: ActorRole[], options?: AuthOptions): Promise<
  { actor: ApiActor; response: null } | { actor: null; response: Response }
> {
  const actor = await getApiUser(options);
  if (!actor) {
    return { actor: null, response: Response.json({ error: "Bạn cần đăng nhập hoặc được mời vào cửa hàng." }, { status: 401 }) };
  }
  if (actor.mustChangePassword) {
    return { actor: null, response: Response.json({ error: "Hãy đổi mật khẩu tạm trước khi tiếp tục.", code: "password_change_required" }, { status: 403 }) };
  }
  if (actor.role === "system_admin" && !roles?.includes("system_admin")) {
    return { actor: null, response: Response.json({ error: "Tài khoản quản trị kỹ thuật không có quyền truy cập nghiệp vụ cửa hàng.", code: "system_admin_blocked" }, { status: 403 }) };
  }
  if (roles && !roles.includes(actor.role)) {
    return { actor: null, response: Response.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 }) };
  }
  return { actor, response: null };
}

export async function getVerifiedIdentity(options?: AuthOptions) {
  const supabaseIdentity = await getValidatedSupabaseIdentity(options);
  if (supabaseIdentity) return supabaseIdentity;

  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true") {
    return { email: "linh.nguyen@loopicafe.local", displayName: "Nguyễn Minh Linh", authenticatedAt: new Date().toISOString() };
  }
  return null;
}

async function getValidatedSupabaseIdentity(options?: AuthOptions): Promise<Identity | null> {
  try {
    const cookieStore = await cookies();
    const hasSupabaseSession = cookieStore.getAll().some(({ name }) =>
      name.startsWith("sb-") && name.includes("-auth-token")
    );
    if (!hasSupabaseSession) return null;

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
      return null;
    }

    const fingerprint = await tokenFingerprint(session.access_token);
    if (!options?.bypassCache) {
      const cached = validatedIdentityCache.get(fingerprint);
      if (cached && cached.expiresAt > Date.now()) return cached.identity;
      if (cached) validatedIdentityCache.delete(fingerprint);
    }

    const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
    if (error) return null;

    if (user && user.email) {
      const identity = {
        email: user.email,
        authUserId: user.id,
        displayName: user.user_metadata?.full_name || user.user_metadata?.display_name || user.email.split("@")[0],
        authenticatedAt: user.last_sign_in_at ?? (typeof session.user?.last_sign_in_at === "string" ? session.user.last_sign_in_at : undefined),
      };
      if (validatedIdentityCache.size >= AUTH_CACHE_LIMIT) {
        const oldestKey = validatedIdentityCache.keys().next().value;
        if (oldestKey) validatedIdentityCache.delete(oldestKey);
      }
      const sessionExpiryMs = session.expires_at ? session.expires_at * 1000 : Infinity;
      const boundedExpiresAt = Math.min(Date.now() + AUTH_REVOCATION_WINDOW_SLA_MS, sessionExpiryMs);
      if (boundedExpiresAt > Date.now()) {
        validatedIdentityCache.set(fingerprint, {
          identity,
          expiresAt: boundedExpiresAt,
        });
      }
      return identity;
    }
  } catch {
    // Supabase auth fallback
  }
  return null;
}

async function tokenFingerprint(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
