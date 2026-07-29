import { ensureDatabase, getBindings } from "@/db/runtime";
import { getApiUser } from "@/server/auth";

type EvidenceBody = {
  eventId?: string;
  captureSessionId?: string;
  photo?: string;
};

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as EvidenceBody;
  if (!body.eventId || !body.captureSessionId || !body.photo?.startsWith("data:image/jpeg;base64,")) {
    return Response.json({ error: "Ảnh chấm công không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const event = await db.prepare(
    `SELECT e.id, e.employee_email, e.recorded_at
     FROM attendance_events e
     JOIN attendance_capture_sessions c ON c.id = ?
     WHERE e.id = ? AND e.employee_email = c.employee_email`,
  ).bind(body.captureSessionId, body.eventId).first<{
    id: string;
    employee_email: string;
    recorded_at: string;
  }>();
  if (!event || event.employee_email !== user.email) {
    return Response.json({ error: "Bạn không có quyền lưu ảnh này." }, { status: 403 });
  }

  const base64 = body.photo.slice("data:image/jpeg;base64,".length);
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  if (bytes.byteLength > 2 * 1024 * 1024) {
    return Response.json({ error: "Ảnh vượt quá 2 MB." }, { status: 413 });
  }

  const { evidence } = getBindings();
  if (!evidence) return Response.json({ error: "Kho ảnh riêng tư chưa sẵn sàng." }, { status: 503 });
  const capturedAt = new Date(event.recorded_at);
  const key = `store-loopi-nguyen-trai/attendance/${encodeURIComponent(user.email)}/${capturedAt.getUTCFullYear()}/${String(capturedAt.getUTCMonth() + 1).padStart(2, "0")}/${event.id}.jpg`;
  await evidence.put(key, bytes, {
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: { eventId: event.id, overlayVersion: "server-authoritative-data-client-composite-v1" },
  });

  const expiresAt = new Date(capturedAt.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    `INSERT OR REPLACE INTO attendance_photos
      (event_id, object_key, mime_type, size_bytes, overlay_version, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(event.id, key, "image/jpeg", bytes.byteLength, "server-authoritative-data-client-composite-v1", expiresAt).run();

  return Response.json({ stored: true, eventId: event.id });
}
