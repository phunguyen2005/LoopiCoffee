import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const scope = auth.actor.role === "employee" ? "AND r.employee_email = ?" : "";
  const statement = db.prepare(
    `SELECT r.id, r.employee_email, r.type, r.title, r.reason, r.status,
            r.created_at, COALESCE(e.display_name, r.employee_email) AS employee_name
     FROM requests r LEFT JOIN employees e ON lower(e.email) = lower(r.employee_email)
     WHERE r.store_id = ? ${scope} ORDER BY r.created_at DESC LIMIT 100`,
  );
  const result = auth.actor.role === "employee"
    ? await statement.bind(auth.actor.storeId, auth.actor.email).all()
    : await statement.bind(auth.actor.storeId).all();
  return Response.json({ requests: result.results });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    type?: "leave" | "swap" | "correction";
    title?: string;
    reason?: string;
  };
  if (
    !body.type || !["leave", "swap", "correction"].includes(body.type) ||
    !body.title?.trim() || !body.reason?.trim()
  ) {
    return Response.json({ error: "Yêu cầu chưa đủ thông tin." }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  await db.batch([
    db.prepare(
      `INSERT INTO requests
        (id, store_id, employee_email, type, title, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    ).bind(id, auth.actor.storeId, auth.actor.email, body.type, body.title.trim().slice(0, 180), body.reason.trim().slice(0, 1000), now),
    auditStatement(db, auth.actor.email, "request", id, "request.created", { type: body.type }, now),
  ]);
  return Response.json({ request: { id, employee_email: auth.actor.email, employee_name: auth.actor.displayName, type: body.type, title: body.title, reason: body.reason, status: "pending", created_at: now } });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    decision?: "approved" | "rejected";
  };
  if (!body.id || !body.decision || !["approved", "rejected"].includes(body.decision)) {
    return Response.json({ error: "Quyết định không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const now = new Date().toISOString();
  const pendingRequest = await db.prepare(
    "SELECT employee_email, title FROM requests WHERE id = ? AND store_id = ? AND status = 'pending'",
  ).bind(body.id, auth.actor.storeId).first<{ employee_email: string; title: string }>();
  if (!pendingRequest) return Response.json({ error: "Yêu cầu không còn chờ duyệt." }, { status: 409 });
  const result = await db.prepare(
    `UPDATE requests SET status = ?, reviewer_email = ?, reviewed_at = ?
     WHERE id = ? AND store_id = ? AND status = 'pending'`,
  ).bind(body.decision, auth.actor.email, now, body.id, auth.actor.storeId).run();
  if (!result.meta.changes) return Response.json({ error: "Yêu cầu không còn chờ duyệt." }, { status: 409 });
  await db.batch([
    db.prepare(
      `INSERT INTO notifications
        (id, recipient_email, type, title, entity_href, created_at)
       VALUES (?, ?, 'request_decision', ?, '/app/requests', ?)`,
    ).bind(
      crypto.randomUUID(),
      pendingRequest.employee_email,
      `${body.decision === "approved" ? "Đã duyệt" : "Đã từ chối"}: ${pendingRequest.title}`,
      now,
    ),
    auditStatement(db, auth.actor.email, "request", body.id, `request.${body.decision}`, {}, now),
  ]);
  return Response.json({ updated: true, status: body.decision });
}
