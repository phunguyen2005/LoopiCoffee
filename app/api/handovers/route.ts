import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function payloadHash(summary: string, managerAttention: boolean) {
  const bytes = new TextEncoder().encode(JSON.stringify({ summary, managerAttention }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT h.id, h.summary, h.manager_attention, h.acknowledged_at, h.created_at,
            COALESCE(e.display_name, h.author_email) AS author_name
     FROM handovers h LEFT JOIN employees e ON lower(e.email) = lower(h.author_email)
     WHERE h.store_id = ? ORDER BY h.created_at DESC LIMIT 30`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ handovers: result.results });
});
export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, {
    summary: "string",
    managerAttention: "boolean",
    idempotencyKey: "string",
  })) as {
    summary?: string;
    managerAttention?: boolean;
    idempotencyKey?: string;
  };
  const summary = body.summary?.trim();
  if (!summary || summary.length < 10) {
    return Response.json({ error: "Nội dung bàn giao cần ít nhất 10 ký tự." }, { status: 400 });
  }
  if (summary.length > 2000) {
    return Response.json({ error: "Nội dung bàn giao tối đa 2.000 ký tự." }, { status: 400 });
  }
  if (!body.idempotencyKey || !UUID_PATTERN.test(body.idempotencyKey)) {
    throw new ApplicationError("Thiếu mã gửi bàn giao hợp lệ.", 400, "invalid_idempotency_key");
  }
  const managerAttention = Boolean(body.managerAttention);
  const hash = await payloadHash(summary, managerAttention);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  const findReplay = () => db.prepare(
    `SELECT id, summary, manager_attention, created_at, payload_hash
     FROM handovers WHERE store_id = ? AND lower(author_email) = lower(?) AND client_request_key = ?`,
  ).bind(auth.actor.storeId, auth.actor.email, body.idempotencyKey).first<{
    id: string; summary: string; manager_attention: number; created_at: string; payload_hash: string | null;
  }>();
  const replay = await findReplay();
  if (replay) {
    if (replay.payload_hash !== hash) throw new ApplicationError("Mã gửi bàn giao đã được dùng cho nội dung khác.", 409, "idempotency_conflict");
    return Response.json({ handover: { ...replay, author_name: auth.actor.displayName }, replayed: true });
  }
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO handovers
          (id, store_id, author_email, summary, manager_attention, client_request_key, payload_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, auth.actor.storeId, auth.actor.email, summary, managerAttention ? 1 : 0, body.idempotencyKey, hash, now),
      auditStatement(db, auth.actor.email, "handover", id, "handover.created", { managerAttention }, now),
    ]);
  } catch (error) {
    const racedReplay = await findReplay();
    if (racedReplay) {
      if (racedReplay.payload_hash !== hash) throw new ApplicationError("Mã gửi bàn giao đã được dùng cho nội dung khác.", 409, "idempotency_conflict");
      return Response.json({ handover: { ...racedReplay, author_name: auth.actor.displayName }, replayed: true });
    }
    throw error;
  }
  return Response.json({ handover: { id, summary, manager_attention: managerAttention ? 1 : 0, created_at: now, author_name: auth.actor.displayName }, replayed: false });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, {
    id: "string",
    action: "string",
  })) as { id?: string; action?: string };
  if (!body.id || body.action !== "acknowledge") {
    return Response.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
  }
  const db = await ensureDatabase();
  const { acknowledgeHandover } = await import("@/modules/operations/application/manage-handovers");
  const result = await acknowledgeHandover(db, auth.actor, body.id);
  return Response.json(result);
});
