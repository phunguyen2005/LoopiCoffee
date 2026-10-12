import { auditStatement } from "../../../server/audit.ts";

export async function expireEvidence(db: D1Database, evidence: Pick<R2Bucket, "delete"> | undefined, now = new Date().toISOString()) {
  // Include legacy tombstones: earlier versions marked rows without erasing them.
  const photos = await db.prepare(
    "SELECT event_id, object_key FROM attendance_photos WHERE expires_at <= ? OR deleted_at IS NOT NULL ORDER BY expires_at LIMIT 100",
  ).bind(now).all<{ event_id: string; object_key: string }>();
  let photosDeleted = 0;
  let failures = 0;
  for (const photo of photos.results) {
    if (!evidence) { failures++; continue; }
    try {
      // Keep metadata after failure so deletion can be retried idempotently.
      await evidence.delete(photo.object_key);
      const result = await db.prepare("DELETE FROM attendance_photos WHERE event_id = ?").bind(photo.event_id).run();
      photosDeleted += result.meta.changes;
    } catch { failures++; }
  }
  const locations = await db.prepare(
    `DELETE FROM attendance_locations WHERE event_id IN (
       SELECT event_id FROM attendance_locations
       WHERE expires_at <= ? OR deleted_at IS NOT NULL ORDER BY expires_at LIMIT 200
     )`,
  ).bind(now).run();
  const yesterday = new Date(Date.parse(now) - 86_400_000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM attendance_action_limits WHERE created_at < ?").bind(yesterday),
    db.prepare("DELETE FROM attendance_capture_sessions WHERE expires_at < ?").bind(yesterday),
    auditStatement(db, "system", "retention", crypto.randomUUID(), "retention.cleanup", {
      photosDeleted, locationsDeleted: locations.meta.changes, failures,
    }, now),
  ]);
  const remaining = await db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM attendance_photos WHERE expires_at <= ? OR deleted_at IS NOT NULL) AS photos,
      (SELECT COUNT(*) FROM attendance_locations WHERE expires_at <= ? OR deleted_at IS NOT NULL) AS locations`,
  ).bind(now, now).first<{ photos: number; locations: number }>();
  return { photosDeleted, locationsDeleted: locations.meta.changes, failures, remaining };
}
