import { getChatGPTUser } from "@/app/chatgpt-auth";
import { CONSENT_VERSION, ensureDatabase, STORE_ID } from "@/db/runtime";

export type ActorRole = "owner" | "manager" | "employee";

export type ApiActor = {
  id: string;
  email: string;
  displayName: string;
  role: ActorRole;
  status: "active";
  storeId: string;
  hasAttendanceConsent: boolean;
};

export async function getApiUser(): Promise<ApiActor | null> {
  const identity = await getIdentity();
  if (!identity) return null;

  const db = await ensureDatabase();
  let employee = await db.prepare(
    `SELECT id, email, display_name, role, status, store_id
     FROM employees WHERE lower(email) = lower(?)`,
  ).bind(identity.email).first<{
    id: string;
    email: string;
    display_name: string;
    role: ActorRole;
    status: "invited" | "active" | "inactive";
    store_id: string;
  }>();

  if (!employee) {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM employees")
      .first<{ count: number }>();
    if ((count?.count ?? 0) !== 0) return null;

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare(
        `INSERT INTO employees
          (id, store_id, email, display_name, role, status, invited_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'owner', 'active', 'system', ?, ?)`,
      ).bind(id, STORE_ID, identity.email, identity.displayName, now, now),
      db.prepare(
        `INSERT OR IGNORE INTO employee_consents
          (id, employee_email, notice_version, consented_at)
         VALUES (?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), identity.email, CONSENT_VERSION, now),
      auditStatement(db, identity.email, "employee", id, "employee.bootstrap_owner", { storeId: STORE_ID }, now),
    ]);
    employee = {
      id,
      email: identity.email,
      display_name: identity.displayName,
      role: "owner",
      status: "active",
      store_id: STORE_ID,
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
  const consent = await db.prepare(
    "SELECT id FROM employee_consents WHERE lower(employee_email) = lower(?) AND notice_version = ?",
  ).bind(employee.email, CONSENT_VERSION).first<{ id: string }>();

  return {
    id: employee.id,
    email: employee.email,
    displayName: employee.display_name,
    role: employee.role,
    status: "active",
    storeId: employee.store_id,
    hasAttendanceConsent: Boolean(consent),
  };
}

export async function requireApiUser(roles?: ActorRole[]) {
  const actor = await getApiUser();
  if (!actor) {
    return { actor: null, response: Response.json({ error: "Bạn cần đăng nhập hoặc được mời vào cửa hàng." }, { status: 401 }) };
  }
  if (roles && !roles.includes(actor.role)) {
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
  const user = await getChatGPTUser();
  if (user) return { email: user.email, displayName: user.fullName ?? user.displayName };
  if (process.env.NODE_ENV !== "production") {
    return { email: "linh.nguyen@loopicafe.local", displayName: "Nguyễn Minh Linh" };
  }
  return null;
}
