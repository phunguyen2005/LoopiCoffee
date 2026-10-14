import { auditStatement } from "../../../server/audit.ts";
import { processPendingEvidenceCleanup } from "./evidence-cleanup.ts";

export async function expireEvidence(db: D1Database, evidence: Pick<R2Bucket, "delete"> | undefined, now = new Date().toISOString()) {
  const pendingCleanup = await processPendingEvidenceCleanup(db, evidence, now);
  // Include legacy tombstones: earlier versions marked rows without erasing them.
  const photos = await db.prepare(
    `SELECT p.event_id, p.object_key, s.store_id
     FROM attendance_photos p
     LEFT JOIN attendance_events e ON e.id = p.event_id
     LEFT JOIN attendance_sessions s ON s.id = e.session_id
     WHERE p.expires_at <= ? OR p.deleted_at IS NOT NULL
     ORDER BY p.expires_at LIMIT 100`,
  ).bind(now).all<{ event_id: string; object_key: string; store_id: string | null }>();

  const storeStats = new Map<string, { photosDeleted: number; locationsDeleted: number; failures: number }>();
  function getStat(storeId: string) {
    let stat = storeStats.get(storeId);
    if (!stat) {
      stat = { photosDeleted: 0, locationsDeleted: 0, failures: 0 };
      storeStats.set(storeId, stat);
    }
    return stat;
  }

  let photosDeleted = 0;
  let failures = pendingCleanup.failures;
  const successfulPhotoIds: string[] = [];
  const chunkSize = 10;

  for (let i = 0; i < photos.results.length; i += chunkSize) {
    const chunk = photos.results.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (photo) => {
        const storeId = photo.store_id;
        if (!evidence) {
          failures++;
          if (storeId) getStat(storeId).failures++;
          return;
        }
        try {
          await evidence.delete(photo.object_key);
          successfulPhotoIds.push(photo.event_id);
          photosDeleted++;
          if (storeId) getStat(storeId).photosDeleted++;
        } catch {
          failures++;
          if (storeId) getStat(storeId).failures++;
        }
      }),
    );
  }

  if (successfulPhotoIds.length > 0) {
    await db.batch(
      successfulPhotoIds.map((id) =>
        db.prepare("DELETE FROM attendance_photos WHERE event_id = ?").bind(id),
      ),
    );
  }

  const expiringLocations = await db.prepare(
    `SELECT l.event_id, s.store_id
     FROM attendance_locations l
     LEFT JOIN attendance_events e ON e.id = l.event_id
     LEFT JOIN attendance_sessions s ON s.id = e.session_id
     WHERE l.expires_at <= ? OR l.deleted_at IS NOT NULL
     ORDER BY l.expires_at LIMIT 200`,
  ).bind(now).all<{ event_id: string; store_id: string | null }>();

  for (const loc of expiringLocations.results) {
    if (loc.store_id) getStat(loc.store_id).locationsDeleted++;
  }

  const locations = await db.prepare(
    `DELETE FROM attendance_locations WHERE event_id IN (
       SELECT event_id FROM attendance_locations
       WHERE expires_at <= ? OR deleted_at IS NOT NULL ORDER BY expires_at LIMIT 200
     )`,
  ).bind(now).run();

  const yesterday = new Date(Date.parse(now) - 86_400_000).toISOString();

  // Determine which store(s) to emit audit events for
  const storesResult = await db.prepare("SELECT id FROM stores").all<{ id: string }>().catch(() => ({ results: [] }));
  const allStoreIds = storesResult.results.map((r) => r.id);
  const targetStoreIds = storeStats.size > 0
    ? Array.from(storeStats.keys())
    : allStoreIds;

  const auditStatements: ReturnType<typeof db.prepare>[] = [];
  if (targetStoreIds.length > 0) {
    for (const storeId of targetStoreIds) {
      const stats = storeStats.get(storeId) ?? { photosDeleted: 0, locationsDeleted: 0, failures: 0 };
      auditStatements.push(
        auditStatement(
          db,
          "system",
          "retention",
          crypto.randomUUID(),
          "retention.cleanup",
          stats,
          now,
          false,
          crypto.randomUUID(),
          storeId,
        ),
      );
    }
  } else {
    auditStatements.push(
      auditStatement(
        db,
        "system",
        "retention",
        crypto.randomUUID(),
        "retention.cleanup",
        { photosDeleted, locationsDeleted: locations.meta.changes, failures },
        now,
      ),
    );
  }

  await db.batch([
    db.prepare("DELETE FROM attendance_action_limits WHERE created_at < ?").bind(yesterday),
    db.prepare("DELETE FROM attendance_capture_sessions WHERE expires_at < ?").bind(yesterday),
    ...auditStatements,
  ]);

  const remaining = await db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM attendance_photos WHERE expires_at <= ? OR deleted_at IS NOT NULL) AS photos,
      (SELECT COUNT(*) FROM attendance_locations WHERE expires_at <= ? OR deleted_at IS NOT NULL) AS locations`,
  ).bind(now, now).first<{ photos: number; locations: number }>();

  return {
    photosDeleted,
    orphanObjectsDeleted: pendingCleanup.deleted,
    locationsDeleted: locations.meta.changes,
    failures,
    remaining,
  };
}
