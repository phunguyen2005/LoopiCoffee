import { ensureDatabase, getBindings } from "@/db/runtime";
import { auditStatement } from "@/server/auth";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Retention cleanup is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await ensureDatabase();
  const { evidence } = getBindings();
  const now = new Date().toISOString();
  const expiredPhotos = await db.prepare(
    `SELECT event_id, object_key FROM attendance_photos
     WHERE expires_at < ? AND deleted_at IS NULL LIMIT 100`,
  ).bind(now).all<{ event_id: string; object_key: string }>();
  const expiredLocations = await db.prepare(
    `SELECT event_id FROM attendance_locations
     WHERE expires_at < ? AND deleted_at IS NULL LIMIT 200`,
  ).bind(now).all<{ event_id: string }>();

  let photosDeleted = 0;
  let failures = 0;
  for (const photo of expiredPhotos.results) {
    try {
      if (evidence) await evidence.delete(photo.object_key);
      await db.prepare("UPDATE attendance_photos SET deleted_at = ? WHERE event_id = ?")
        .bind(now, photo.event_id).run();
      photosDeleted += 1;
    } catch {
      failures += 1;
    }
  }
  if (expiredLocations.results.length) {
    await db.batch(expiredLocations.results.map((location) =>
      db.prepare("UPDATE attendance_locations SET deleted_at = ? WHERE event_id = ?")
        .bind(now, location.event_id)));
  }
  await db.batch([
    db.prepare("DELETE FROM attendance_action_limits WHERE created_at < ?")
      .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    auditStatement(
      db,
      "system",
      "retention",
      crypto.randomUUID(),
      "retention.cleanup",
      {
        photosDeleted,
        locationsDeleted: expiredLocations.results.length,
        failures,
      },
      now,
    ),
  ]);

  return Response.json({
    photosDeleted,
    locationsDeleted: expiredLocations.results.length,
    failures,
  });
}
