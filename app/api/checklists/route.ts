import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";
import { businessDate } from "@/modules/operations/domain/business-day";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const currentBusinessDate = businessDate();
  const result = await db.prepare(
    `SELECT i.id, i.label, i.assignee, i.required, COALESCE(x.completed,0) AS completed, x.completed_at
     FROM checklist_items i LEFT JOIN checklist_executions x ON x.item_id=i.id AND x.business_date=?
     WHERE i.store_id = ? ORDER BY i.id`,
  ).bind(currentBusinessDate, auth.actor.storeId).all();
  return Response.json(
    { items: result.results, businessDate: currentBusinessDate },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, { label: "string", assignee: "string", required: "boolean" })) as {
    label?: string;
    assignee?: string;
    required?: boolean;
  };
  if (!body.label?.trim() || body.label.length > 200 || (body.assignee?.length ?? 0) > 100) {
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
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = await readObject(request, {id:"string",completed:"boolean"}) as { id?: string; completed?: boolean };
  if (!body.id || typeof body.completed !== "boolean") {
    return Response.json({ error: "Cập nhật checklist không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const item = await db.prepare("SELECT id FROM checklist_items WHERE id = ? AND store_id = ?")
    .bind(body.id, auth.actor.storeId).first();
  if (!item) return Response.json({ error: "Không tìm thấy công việc." }, { status: 404 });
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const currentBusinessDate = businessDate(nowDate);
  await db.batch([
    db.prepare(
      `INSERT INTO checklist_executions(item_id,business_date,completed,completed_at,completed_by,updated_at)
       VALUES(?,?,?,?,?,?) ON CONFLICT(item_id,business_date) DO UPDATE SET
       completed=excluded.completed,completed_at=excluded.completed_at,completed_by=excluded.completed_by,updated_at=excluded.updated_at`,
    ).bind(body.id, currentBusinessDate, body.completed ? 1 : 0, body.completed ? now : null, auth.actor.email, now),
    auditStatement(
      db,
      auth.actor.email,
      "checklist_item",
      body.id,
      body.completed ? "checklist.completed" : "checklist.reopened",
      { businessDate: currentBusinessDate },
      now,
    ),
  ]);
  return Response.json({
    updated: true,
    completed: body.completed,
    completedAt: body.completed ? now : null,
    businessDate: currentBusinessDate,
  });
});
