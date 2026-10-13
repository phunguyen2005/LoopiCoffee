import { ensureDatabase } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, actor_email, entity_type, entity_id, action, metadata, created_at
     FROM audit_events WHERE store_id = ? ORDER BY created_at DESC LIMIT 200`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ events: result.results }, { headers: { "Cache-Control": "private, no-store" } });
});
