import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, label, assignee, required, completed, completed_at
     FROM checklist_items WHERE store_id = ? ORDER BY id`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ items: result.results });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { id?: string; completed?: boolean };
  if (!body.id || typeof body.completed !== "boolean") {
    return Response.json({ error: "Cập nhật checklist không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const item = await db.prepare("SELECT id FROM checklist_items WHERE id = ? AND store_id = ?")
    .bind(body.id, auth.actor.storeId).first();
  if (!item) return Response.json({ error: "Không tìm thấy công việc." }, { status: 404 });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      "UPDATE checklist_items SET completed = ?, completed_at = ?, updated_at = ? WHERE id = ?",
    ).bind(body.completed ? 1 : 0, body.completed ? now : null, now, body.id),
    auditStatement(
      db,
      auth.actor.email,
      "checklist_item",
      body.id,
      body.completed ? "checklist.completed" : "checklist.reopened",
      {},
      now,
    ),
  ]);
  return Response.json({ updated: true, completed: body.completed, completedAt: body.completed ? now : null });
}
