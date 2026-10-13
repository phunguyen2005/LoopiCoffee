import { ensureDatabase } from "@/db/runtime";
import { createAdmin } from "@/lib/supabase/server";
import { auditStatement, requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;

  return Response.json(
    {
      user: {
        id: auth.actor.id,
        email: auth.actor.email,
        displayName: auth.actor.displayName,
        role: auth.actor.role,
        storeId: auth.actor.storeId,
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;

  const body = await readObject(request, { displayName: "string" }) as { displayName?: string };

  const newDisplayName = body.displayName?.trim();

  if (!newDisplayName || newDisplayName.length < 2 || newDisplayName.length > 100) {
    return Response.json(
      { error: "Tên hiển thị phải có từ 2 đến 100 ký tự." },
      { status: 400 }
    );
  }

  const db = await ensureDatabase();
  const now = new Date().toISOString();

  // 1. Update D1/SQLite employees table
  await db.batch([
    db.prepare(
      "UPDATE employees SET display_name = ?, updated_at = ? WHERE id = ?"
    ).bind(newDisplayName, now, auth.actor.id),
    auditStatement(
      db,
      auth.actor.email,
      "employee",
      auth.actor.id,
      "profile.name_updated",
      { oldName: auth.actor.displayName, newName: newDisplayName },
      now
    ),
  ]);

  // 2. Best effort update in Supabase user metadata if available
  try {
    const supabase = createAdmin();
    const account = await db.prepare("SELECT auth_user_id FROM employees WHERE id = ?")
      .bind(auth.actor.id).first<{ auth_user_id: string | null }>();
    if (account?.auth_user_id) {
      await supabase.auth.admin.updateUserById(account.auth_user_id, {
        user_metadata: {
          full_name: newDisplayName,
          display_name: newDisplayName,
        },
      });
    }
  } catch {
    // Non-blocking fallback if Supabase admin is unconfigured
  }

  return Response.json({
    success: true,
    user: {
      id: auth.actor.id,
      email: auth.actor.email,
      displayName: newDisplayName,
      role: auth.actor.role,
    },
  });
});
