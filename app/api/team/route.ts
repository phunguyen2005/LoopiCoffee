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
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  void request;
  return Response.json({ error: "Hãy tạo tài khoản tại trang Quản trị tài khoản." }, { status: 410 });
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
    (body.role && !["owner", "manager", "team_lead", "employee"].includes(body.role)) ||
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
