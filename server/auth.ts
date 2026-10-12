import { CONSENT_VERSION, ensureDatabase } from "@/db/runtime";
import { cookies } from "next/headers";

import type { ActorRole, EmployeeStatus } from "@/modules/people/domain/access";
import type { VerifiedIdentity } from "@/modules/people/application/complete-sign-in";
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
};

type Identity = VerifiedIdentity;

const AUTH_CACHE_TTL_MS = 10_000;
const AUTH_CACHE_LIMIT = 100;
const validatedIdentityCache = new Map<string, { identity: Identity; expiresAt: number }>();

export async function getApiUser(): Promise<ApiActor | null> {
  const identity = await getVerifiedIdentity();
  if (!identity) return null;

  const db = await ensureDatabase();
  const employee = await db.prepare(
    `SELECT e.id, e.email, e.display_name, e.role, e.status, e.store_id, e.must_change_password,
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
    status: EmployeeStatus;
    store_id: string;
    has_consent: number;
    must_change_password: number;
  }>();

  if (!employee) return null;

  if (employee.status !== "active") return null;

  return {
    id: employee.id,
    email: employee.email,
    displayName: employee.display_name,
    role: employee.role,
    status: "active",
    storeId: employee.store_id,
    hasAttendanceConsent: Boolean(employee.has_consent),
    mustChangePassword: Boolean(employee.must_change_password),
  };
}

export async function requireApiUser(roles?: ActorRole[]): Promise<
  { actor: ApiActor; response: null } | { actor: null; response: Response }
> {
  const actor = await getApiUser();
  if (!actor) {
    return { actor: null, response: Response.json({ error: "Bạn cần đăng nhập hoặc được mời vào cửa hàng." }, { status: 401 }) };
  }
  if (actor.mustChangePassword) {
    return { actor: null, response: Response.json({ error: "Hãy đổi mật khẩu tạm trước khi tiếp tục.", code: "password_change_required" }, { status: 403 }) };
  }
  if (roles && !roles.includes(actor.role)) {
    // System admin has administrative access to owner/manager routes
    if (actor.role === "system_admin" && (roles.includes("owner") || roles.includes("manager"))) {
      return { actor, response: null };
    }
    return { actor: null, response: Response.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 }) };
  }
  return { actor, response: null };
}

export async function getVerifiedIdentity() {
  const supabaseIdentity = await getValidatedSupabaseIdentity();
  if (supabaseIdentity) return supabaseIdentity;

  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true") {
    return { email: "linh.nguyen@loopicafe.local", displayName: "Nguyễn Minh Linh" };
  }
  return null;
}

async function getValidatedSupabaseIdentity(): Promise<Identity | null> {
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

    const fingerprint = await tokenFingerprint(session.access_token);
    const cached = validatedIdentityCache.get(fingerprint);
    if (cached && cached.expiresAt > Date.now()) return cached.identity;
    if (cached) validatedIdentityCache.delete(fingerprint);

    const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
    if (error) return null;

    if (user && user.email) {
      const identity = {
        email: user.email,
        authUserId: user.id,
        displayName: user.user_metadata?.full_name || user.user_metadata?.display_name || user.email.split("@")[0],
      };
      if (validatedIdentityCache.size >= AUTH_CACHE_LIMIT) {
        const oldestKey = validatedIdentityCache.keys().next().value;
        if (oldestKey) validatedIdentityCache.delete(oldestKey);
      }
      validatedIdentityCache.set(fingerprint, {
        identity,
        expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
      });
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
