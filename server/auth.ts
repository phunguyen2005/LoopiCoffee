import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CONSENT_VERSION, ensureDatabase, STORE_ID } from "@/db/runtime";
import { cookies } from "next/headers";

export type ActorRole = "system_admin" | "owner" | "manager" | "team_lead" | "employee";

export type ApiActor = {
  id: string;
  email: string;
  displayName: string;
  role: ActorRole;
  status: "active";
  storeId: string;
  hasAttendanceConsent: boolean;
};

type Identity = {
  email: string;
  displayName: string;
};

const AUTH_CACHE_TTL_MS = 10_000;
const AUTH_CACHE_LIMIT = 100;
const validatedIdentityCache = new Map<string, { identity: Identity; expiresAt: number }>();

export async function getApiUser(): Promise<ApiActor | null> {
  const identity = await getIdentity();
  if (!identity) return null;

  const systemAdminEmail = (process.env.SYSTEM_ADMIN_EMAIL ?? "admin@loopicafe.com").toLowerCase();

  const db = await ensureDatabase();
  let employee = await db.prepare(
    `SELECT e.id, e.email, e.display_name, e.role, e.status, e.store_id,
            EXISTS(
              SELECT 1 FROM employee_consents c
              WHERE lower(c.employee_email) = lower(e.email) AND c.notice_version = ?
            ) AS has_consent
     FROM employees e WHERE lower(e.email) = lower(?)`,
  ).bind(CONSENT_VERSION, identity.email).first<{
    id: string;
    email: string;
    display_name: string;
    role: ActorRole;
    status: "invited" | "active" | "inactive";
    store_id: string;
    has_consent: number;
  }>();

  if (!employee) {
    // Check if user is System Admin
    const isSysAdmin = identity.email.toLowerCase() === systemAdminEmail;
    const count = await db.prepare("SELECT COUNT(*) AS count FROM employees")
      .first<{ count: number }>();

    if ((count?.count ?? 0) !== 0 && !isSysAdmin) return null;

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const role: ActorRole = isSysAdmin ? "system_admin" : "owner";

    await db.batch([
      db.prepare(
        `INSERT INTO employees
          (id, store_id, email, display_name, role, status, invited_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 'system', ?, ?)`,
      ).bind(id, STORE_ID, identity.email, identity.displayName, role, now, now),
      db.prepare(
        `INSERT OR IGNORE INTO employee_consents
          (id, employee_email, notice_version, consented_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), identity.email, CONSENT_VERSION, now),
      auditStatement(db, identity.email, "employee", id, `employee.bootstrap_${role}`, { storeId: STORE_ID }, now),
    ]);
    employee = {
      id,
      email: identity.email,
      display_name: identity.displayName,
      role,
      status: "active",
      store_id: STORE_ID,
      has_consent: 1,
    };
  } else if (employee.status === "invited") {
    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE employees SET status = 'active', display_name = ?, updated_at = ? WHERE id = ?",
    ).bind(identity.displayName, now, employee.id).run();
    employee.status = "active";
    employee.display_name = identity.displayName;
  }

  if (employee.status !== "active") return null;

  return {
    id: employee.id,
    email: employee.email,
    displayName: employee.display_name,
    role: employee.role,
    status: "active",
    storeId: employee.store_id,
    hasAttendanceConsent: Boolean(employee.has_consent),
  };
}

export async function requireApiUser(roles?: ActorRole[]) {
  const actor = await getApiUser();
  if (!actor) {
    return { actor: null, response: Response.json({ error: "Bạn cần đăng nhập hoặc được mời vào cửa hàng." }, { status: 401 }) };
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

export function auditStatement(
  db: D1Database,
  actorEmail: string,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Record<string, unknown>,
  createdAt = new Date().toISOString(),
) {
  return db.prepare(
    `INSERT INTO audit_events
      (id, actor_email, entity_type, entity_id, action, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    actorEmail,
    entityType,
    entityId,
    action,
    JSON.stringify(metadata),
    createdAt,
  );
}

async function getIdentity() {
  const supabaseIdentity = await getValidatedSupabaseIdentity();
  if (supabaseIdentity) return supabaseIdentity;

  const user = await getChatGPTUser();
  if (user) return { email: user.email, displayName: user.fullName ?? user.displayName };
  if (process.env.NODE_ENV !== "production") {
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

export async function requiresSupabasePasswordChange() {
  try {
    const cookieStore = await cookies();
    const hasSupabaseSession = cookieStore.getAll().some(({ name }) =>
      name.startsWith("sb-") && name.includes("-auth-token")
    );
    if (!hasSupabaseSession) return false;

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.user_metadata?.must_change_password === true;
  } catch {
    return false;
  }
}

async function tokenFingerprint(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
