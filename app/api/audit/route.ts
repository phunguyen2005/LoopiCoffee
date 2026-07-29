import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, actor_email, entity_type, entity_id, action, metadata, created_at
     FROM audit_events ORDER BY created_at DESC LIMIT 200`,
  ).all();
  return Response.json({ events: result.results });
}
