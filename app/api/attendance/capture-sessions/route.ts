import { ensureDatabase } from "@/db/runtime";
import { getApiUser } from "@/server/auth";

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "check_in" && body.action !== "check_out") {
    return Response.json({ error: "Hành động không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const id = crypto.randomUUID();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 60_000);

  await db.prepare(
    `INSERT INTO attendance_capture_sessions
      (id, employee_email, store_id, action, issued_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    id,
    user.email,
    "store-loopi-nguyen-trai",
    body.action,
    issuedAt.toISOString(),
    expiresAt.toISOString(),
  ).run();

  return Response.json({
    id,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
}
