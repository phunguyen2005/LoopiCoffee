import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, title, category, severity, status, created_at, updated_at
     FROM incidents WHERE store_id = ? ORDER BY created_at DESC LIMIT 100`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ incidents: result.results });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    category?: string;
    severity?: "low" | "medium" | "high";
  };
  const title = body.title?.trim();
  if (!title || title.length < 3 || !body.severity || !["low", "medium", "high"].includes(body.severity)) {
    return Response.json({ error: "Thông tin sự cố không hợp lệ." }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  const statements = [
    db.prepare(
      `INSERT INTO incidents
        (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    ).bind(id, auth.actor.storeId, auth.actor.email, title.slice(0, 180), body.category?.trim().slice(0, 60) || "Khác", body.severity, now, now),
    auditStatement(db, auth.actor.email, "incident", id, "incident.created", { severity: body.severity }, now),
  ];
  if (body.severity === "high") {
    const reviewers = await db.prepare(
      `SELECT email FROM employees
       WHERE store_id = ? AND role IN ('owner', 'manager') AND status = 'active'`,
    ).bind(auth.actor.storeId).all<{ email: string }>();
    statements.push(...reviewers.results.map((reviewer) =>
      db.prepare(
        `INSERT INTO notifications
          (id, recipient_email, type, title, entity_href, created_at)
         VALUES (?, ?, 'high_incident', ?, '/app/issues', ?)`,
      ).bind(crypto.randomUUID(), reviewer.email, `Sự cố mức cao: ${title.slice(0, 120)}`, now)));
  }
  await db.batch(statements);
  return Response.json({ incident: { id, title, category: body.category || "Khác", severity: body.severity, status: "open", created_at: now } });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    status?: "acknowledged" | "resolved" | "closed";
  };
  if (!body.id || !body.status || !["acknowledged", "resolved", "closed"].includes(body.status)) {
    return Response.json({ error: "Trạng thái sự cố không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const now = new Date().toISOString();
  const result = await db.prepare(
    "UPDATE incidents SET status = ?, updated_at = ? WHERE id = ? AND store_id = ?",
  ).bind(body.status, now, body.id, auth.actor.storeId).run();
  if (!result.meta.changes) return Response.json({ error: "Không tìm thấy sự cố." }, { status: 404 });
  await db.batch([
    auditStatement(db, auth.actor.email, "incident", body.id, `incident.${body.status}`, {}, now),
  ]);
  return Response.json({ updated: true, status: body.status });
}
