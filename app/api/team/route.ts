import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser, type ActorRole } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, email, display_name, role, status, created_at
     FROM employees WHERE store_id = ? ORDER BY status, display_name`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ employees: result.results });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    displayName?: string;
    role?: ActorRole;
  };
  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const requestedRole = body.role;
  if (
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !displayName || displayName.length < 2 ||
    !requestedRole || !["owner", "manager", "employee"].includes(requestedRole)
  ) {
    return Response.json({ error: "Thông tin lời mời không hợp lệ." }, { status: 400 });
  }
  const role: ActorRole = auth.actor.role === "manager" ? "employee" : requestedRole;
  const db = await ensureDatabase();
  const existing = await db.prepare("SELECT id FROM employees WHERE lower(email) = lower(?)")
    .bind(email).first();
  if (existing) return Response.json({ error: "Email này đã thuộc đội ngũ." }, { status: 409 });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO employees
        (id, store_id, email, display_name, role, status, invited_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'invited', ?, ?, ?)`,
    ).bind(id, auth.actor.storeId, email, displayName.slice(0, 100), role, auth.actor.email, now, now),
    auditStatement(
      db,
      auth.actor.email,
      "employee",
      id,
      "employee.invited",
      { role },
      now,
    ),
  ]);
  return Response.json({ employee: { id, email, display_name: displayName, role, status: "invited" } });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    role?: ActorRole;
    status?: "active" | "inactive";
  };
  if (
    !body.id ||
    (body.role && !["owner", "manager", "employee"].includes(body.role)) ||
    (body.status && !["active", "inactive"].includes(body.status))
  ) {
    return Response.json({ error: "Thay đổi nhân sự không hợp lệ." }, { status: 400 });
  }
  if (body.id === auth.actor.id && body.status === "inactive") {
    return Response.json({ error: "Bạn không thể tự vô hiệu hóa tài khoản đang sử dụng." }, { status: 409 });
  }
  const db = await ensureDatabase();
  const employee = await db.prepare("SELECT id FROM employees WHERE id = ? AND store_id = ?")
    .bind(body.id, auth.actor.storeId).first();
  if (!employee) return Response.json({ error: "Không tìm thấy nhân viên." }, { status: 404 });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE employees SET role = COALESCE(?, role), status = COALESCE(?, status),
       updated_at = ? WHERE id = ?`,
    ).bind(body.role ?? null, body.status ?? null, now, body.id),
    auditStatement(
      db,
      auth.actor.email,
      "employee",
      body.id,
      "employee.access_updated",
      { role: body.role ?? null, status: body.status ?? null },
      now,
    ),
  ]);
  return Response.json({ updated: true });
}
