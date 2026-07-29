import { ensureDatabase, getBindings } from "@/db/runtime";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await ensureDatabase();
  const { evidence } = getBindings();
  const expired = await db.prepare(
    `SELECT event_id, object_key FROM attendance_photos
     WHERE expires_at < ? AND deleted_at IS NULL LIMIT 100`,
  ).bind(new Date().toISOString()).all<{ event_id: string; object_key: string }>();

  let deleted = 0;
  for (const photo of expired.results) {
    if (evidence) await evidence.delete(photo.object_key);
    await db.batch([
      db.prepare("UPDATE attendance_photos SET deleted_at = ? WHERE event_id = ?")
        .bind(new Date().toISOString(), photo.event_id),
      db.prepare("UPDATE attendance_locations SET deleted_at = ? WHERE event_id = ?")
        .bind(new Date().toISOString(), photo.event_id),
    ]);
    deleted += 1;
  }
  return Response.json({ deleted });
}
