import { ensureDatabase } from "@/db/runtime";
import { createAdmin } from "@/lib/supabase/server";
import { auditStatement, requireApiUser, type ActorRole } from "@/server/auth";

const creatableRoles: ActorRole[] = ["manager", "team_lead", "employee"];

export async function GET() {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;

  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, email, display_name, role, status, auth_user_id, created_at
     FROM employees WHERE store_id = ? ORDER BY status, display_name`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ accounts: result.results });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    displayName?: string;
    role?: ActorRole;
  };
  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const role = body.role;
  if (
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !displayName || displayName.length < 2 ||
    !role || !creatableRoles.includes(role)
  ) {
    return Response.json({ error: "Thông tin tài khoản không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const existing = await db.prepare("SELECT id FROM employees WHERE lower(email) = lower(?)")
    .bind(email).first();
  if (existing) return Response.json({ error: "Email này đã thuộc đội ngũ." }, { status: 409 });

  const temporaryPassword = generateTemporaryPassword();
  const supabase = createAdmin();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName.slice(0, 100),
      must_change_password: true,
    },
    app_metadata: {
      role,
      store_id: auth.actor.storeId,
    },
  });
  if (error || !data.user) {
    return Response.json(
      { error: error?.message ?? "Không thể tạo tài khoản đăng nhập." },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO employees
          (id, store_id, email, display_name, auth_user_id, role, status, invited_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      ).bind(
        id,
        auth.actor.storeId,
        email,
        displayName.slice(0, 100),
        data.user.id,
        role,
        auth.actor.email,
        now,
        now,
      ),
      auditStatement(db, auth.actor.email, "employee", id, "account.created", { role }, now),
    ]);
  } catch (dbError) {
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw dbError;
  }

  return Response.json({
    account: { id, email, display_name: displayName, role, status: "active" },
    temporaryPassword,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    role?: ActorRole;
    status?: "active" | "inactive";
    resetPassword?: boolean;
  };
  if (
    !body.id ||
    (body.role && !creatableRoles.includes(body.role)) ||
    (body.status && !["active", "inactive"].includes(body.status))
  ) {
    return Response.json({ error: "Thay đổi tài khoản không hợp lệ." }, { status: 400 });
  }
  if (body.id === auth.actor.id) {
    return Response.json({ error: "Không thể thay đổi tài khoản admin đang sử dụng tại đây." }, { status: 409 });
  }

  const db = await ensureDatabase();
  const account = await db.prepare(
    "SELECT id, auth_user_id, role, status FROM employees WHERE id = ? AND store_id = ?",
  ).bind(body.id, auth.actor.storeId).first<{
    id: string; auth_user_id: string | null; role: ActorRole; status: string;
  }>();
  if (!account) return Response.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
  if (!account.auth_user_id) {
    return Response.json({ error: "Tài khoản cũ chưa được liên kết với Supabase." }, { status: 409 });
  }

  const supabase = createAdmin();
  const temporaryPassword = body.resetPassword ? generateTemporaryPassword() : undefined;
  const nextRole = body.role ?? account.role;
  const nextStatus = body.status ?? account.status;
  const { error } = await supabase.auth.admin.updateUserById(account.auth_user_id, {
    ...(temporaryPassword ? { password: temporaryPassword, user_metadata: { must_change_password: true } } : {}),
    app_metadata: { role: nextRole, store_id: auth.actor.storeId },
    ban_duration: nextStatus === "inactive" ? "876000h" : "none",
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE employees SET role = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).bind(nextRole, nextStatus, now, body.id),
    auditStatement(
      db,
      auth.actor.email,
      "employee",
      body.id,
      temporaryPassword ? "account.password_reset" : "account.access_updated",
      { role: nextRole, status: nextStatus },
      now,
    ),
  ]);
  return Response.json({ updated: true, temporaryPassword });
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}
