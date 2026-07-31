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

export async function POST(request: Request) {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    assignee?: string;
    required?: boolean;
  };
  if (!body.label?.trim()) {
    return Response.json({ error: "Vui lòng nhập tên công việc checklist." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const label = body.label.trim();
  const assignee = body.assignee?.trim() || "Ca làm";
  const required = body.required !== false ? 1 : 0;

  await db.batch([
    db.prepare(
      `INSERT INTO checklist_items (id, store_id, label, assignee, required, completed, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    ).bind(id, auth.actor.storeId, label, assignee, required, now),
    auditStatement(db, auth.actor.email, "checklist_item", id, "checklist.created", { label }, now),
  ]);

  return Response.json({ item: { id, label, assignee, required, completed: 0 } });
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
