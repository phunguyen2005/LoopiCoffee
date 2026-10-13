import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT id, type, title, entity_href, read_at, created_at
     FROM notifications WHERE lower(recipient_email) = lower(?)
     ORDER BY created_at DESC LIMIT 100`,
  ).bind(auth.actor.email).all();
  return Response.json({ notifications: result.results });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, { id: "string" })) as { id?: string };
  if (!body.id) return Response.json({ error: "Thiếu thông báo." }, { status: 400 });
  const db = await ensureDatabase();
  await db.prepare(
    "UPDATE notifications SET read_at = ? WHERE id = ? AND lower(recipient_email) = lower(?)",
  ).bind(new Date().toISOString(), body.id, auth.actor.email).run();
  return Response.json({ updated: true });
});
