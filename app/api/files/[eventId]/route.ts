import { ensureDatabase, getBindings } from "@/db/runtime";
import { loadUnexpiredPhoto } from "@/modules/attendance/application/load-photo";
import { apiHandler } from "@/platform/http/errors";
import { auditStatement, requireApiPermission } from "@/server/auth";

export const GET = apiHandler(async (
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) => {
  const auth = await requireApiPermission("attendance.evidence.read");
  if (!auth.actor) return auth.response;
  const { eventId } = await context.params;
  const db = await ensureDatabase();
  const photo = await loadUnexpiredPhoto(db, eventId, auth.actor.storeId);
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
});
