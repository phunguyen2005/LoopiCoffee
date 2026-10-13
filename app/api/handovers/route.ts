import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

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
  })) as {
    summary?: string;
    managerAttention?: boolean;
  };
  const summary = body.summary?.trim();
  if (!summary || summary.length < 10) {
    return Response.json({ error: "Nội dung bàn giao cần ít nhất 10 ký tự." }, { status: 400 });
  }
  if (summary.length > 2000) {
    return Response.json({ error: "Nội dung bàn giao tối đa 2.000 ký tự." }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  await db.batch([
    db.prepare(
      `INSERT INTO handovers
        (id, store_id, author_email, summary, manager_attention, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(id, auth.actor.storeId, auth.actor.email, summary, body.managerAttention ? 1 : 0, now),
    auditStatement(db, auth.actor.email, "handover", id, "handover.created", { managerAttention: Boolean(body.managerAttention) }, now),
  ]);
  return Response.json({ handover: { id, summary, manager_attention: body.managerAttention ? 1 : 0, created_at: now, author_name: auth.actor.displayName } });
});
