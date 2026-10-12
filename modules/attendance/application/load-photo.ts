export async function loadUnexpiredPhoto(db: D1Database, eventId: string, storeId: string, now = new Date().toISOString()) {
  return db.prepare(
    `SELECT p.object_key, p.mime_type, p.sha256
     FROM attendance_photos p
     JOIN attendance_events e ON e.id = p.event_id
     JOIN attendance_sessions s ON s.id = e.session_id
     WHERE p.event_id = ? AND s.store_id = ? AND p.deleted_at IS NULL
       AND datetime(p.expires_at) > datetime(?)`,
  ).bind(eventId, storeId, now).first<{ object_key: string; mime_type: string; sha256: string }>();
}
