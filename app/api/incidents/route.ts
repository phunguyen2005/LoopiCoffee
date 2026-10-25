import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiPermission, requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, title, category, severity, status, created_at, updated_at
     FROM incidents WHERE store_id = ? ORDER BY created_at DESC LIMIT 100`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ incidents: result.results });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, {
    title: "string",
    category: "string",
    severity: "string",
    idempotencyKey: "string",
  })) as {
    title?: string;
    category?: string;
    severity?: "low" | "medium" | "high";
    idempotencyKey?: string;
  };
  const title = body.title?.trim();
  const category = body.category?.trim();
  if (
    !title ||
    title.length < 3 ||
    title.length > 180 ||
    (category && category.length > 60) ||
    !body.severity ||
    !["low", "medium", "high"].includes(body.severity)
  ) {
    return Response.json({ error: "Thông tin sự cố không hợp lệ." }, { status: 400 });
  }
  if (body.idempotencyKey && !UUID_PATTERN.test(body.idempotencyKey)) {
    return Response.json({ error: "Thiếu mã gửi báo cáo hợp lệ." }, { status: 400 });
  }
  const id = body.idempotencyKey || crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  const finalCategory = category || "Khác";
  const replay = await db.prepare(
    `SELECT id, title, category, severity, status, created_at
     FROM incidents WHERE id = ? AND store_id = ? AND lower(reporter_email) = lower(?)`,
  ).bind(id, auth.actor.storeId, auth.actor.email).first<{
    id: string; title: string; category: string; severity: string; status: string; created_at: string;
  }>();
  if (replay) {
    if (replay.title !== title || replay.category !== finalCategory || replay.severity !== body.severity) {
      return Response.json({ error: "Mã gửi báo cáo đã được dùng cho nội dung khác.", code: "idempotency_conflict" }, { status: 409 });
    }
    return Response.json({ incident: replay, replayed: true });
  }
  const statements = [
    db.prepare(
      `INSERT INTO incidents
        (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    ).bind(id, auth.actor.storeId, auth.actor.email, title, finalCategory, body.severity, now, now),
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
  try {
    await db.batch(statements);
  } catch (error) {
    const racedReplay = await db.prepare(
      "SELECT id, title, category, severity, status, created_at FROM incidents WHERE id = ? AND store_id = ? AND lower(reporter_email) = lower(?)",
    ).bind(id, auth.actor.storeId, auth.actor.email).first();
    if (racedReplay) return Response.json({ incident: racedReplay, replayed: true });
    throw error;
  }
  return Response.json({ incident: { id, title, category: finalCategory, severity: body.severity, status: "open", created_at: now }, replayed: false });
});

const ALLOWED_PREVIOUS_STATUS: Record<string, string[]> = {
  open: [],
  acknowledged: ["open"],
  resolved: ["acknowledged"],
  closed: ["resolved"],
};

const VALID_STATUSES = ["open", "acknowledged", "resolved", "closed"];

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("incidents.transition");
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, {
    id: "string",
    status: "string",
  })) as {
    id?: string;
    status?: string;
  };
  const id = body.id?.trim();
  const targetStatus = body.status?.trim();
  if (!id || !targetStatus || !VALID_STATUSES.includes(targetStatus)) {
    return Response.json({ error: "Trạng thái sự cố không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const existing = await db.prepare(
    "SELECT id, status FROM incidents WHERE id = ? AND store_id = ?",
  ).bind(id, auth.actor.storeId).first<{ id: string; status: string }>();

  if (!existing) {
    return Response.json({ error: "Không tìm thấy sự cố." }, { status: 404 });
  }

  const allowedPrevious = ALLOWED_PREVIOUS_STATUS[targetStatus];
  if (!allowedPrevious || !allowedPrevious.includes(existing.status)) {
    return Response.json(
      { error: "Chuyển trạng thái sự cố không hợp lệ hoặc sự cố đã thay đổi." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  const updateStmt = db.prepare(
    "UPDATE incidents SET status = ?, updated_at = ? WHERE id = ? AND store_id = ? AND status = ?",
  ).bind(targetStatus, now, id, auth.actor.storeId, existing.status);

  const auditStmt = auditStatement(
    db,
    auth.actor.email,
    "incident",
    id,
    `incident.${targetStatus}`,
    { fromStatus: existing.status, toStatus: targetStatus },
    now,
    true,
    commandId,
  );

  const results = await db.batch([updateStmt, auditStmt]);
  if (!results[0].meta.changes) {
    return Response.json(
      { error: "Chuyển trạng thái sự cố không hợp lệ hoặc sự cố đã thay đổi." },
      { status: 409 },
    );
  }

  return Response.json({ updated: true, status: targetStatus });
});
