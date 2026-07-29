import { ensureDatabase, getBindings } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const { eventId } = await context.params;
  const db = await ensureDatabase();
  const photo = await db.prepare(
    `SELECT p.object_key, p.mime_type, p.sha256
     FROM attendance_photos p
     JOIN attendance_events e ON e.id = p.event_id
     JOIN attendance_sessions s ON s.id = e.session_id
     WHERE p.event_id = ? AND p.deleted_at IS NULL AND s.store_id = ?`,
  ).bind(eventId, auth.actor.storeId).first<{
    object_key: string;
    mime_type: string;
    sha256: string;
  }>();
  if (!photo) return Response.json({ error: "Không tìm thấy ảnh hoặc ảnh đã hết hạn." }, { status: 404 });

  const { evidence } = getBindings();
  const object = await evidence?.get(photo.object_key);
  if (!object) return Response.json({ error: "Ảnh riêng tư chưa sẵn sàng." }, { status: 404 });
  await db.batch([
    auditStatement(
      db,
      auth.actor.email,
      "attendance_photo",
      eventId,
      "attendance.evidence_viewed",
      { sha256: photo.sha256 },
    ),
  ]);

  return new Response(object.body, {
    headers: {
      "content-type": photo.mime_type,
      "cache-control": "private, no-store, max-age=0",
      "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
      "x-evidence-sha256": photo.sha256,
    },
  });
}
