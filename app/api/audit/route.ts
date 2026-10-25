import { ensureDatabase } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT a.id, a.actor_email, a.entity_type, a.entity_id, a.action, a.metadata, a.created_at,
            e.display_name AS actor_name, e.role AS actor_role
     FROM audit_events a
     LEFT JOIN employees e ON lower(a.actor_email) = lower(e.email) AND (e.store_id = a.store_id OR e.store_id IS NULL)
     WHERE a.store_id = ?
     ORDER BY a.created_at DESC LIMIT 200`,
  ).bind(auth.actor.storeId).all();
  return Response.json({ events: result.results }, { headers: { "Cache-Control": "private, no-store" } });
});
