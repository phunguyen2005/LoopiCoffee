import { ensureDatabase } from "@/db/runtime";
import { sha256Hex } from "@/lib/evidence";
import { auditStatement, requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const actor = auth.actor;
  if (!actor.hasAttendanceConsent) {
    return Response.json(
      { error: "Bạn cần đồng ý thông báo camera và vị trí trước khi chấm công.", code: "consent_required" },
      { status: 412 },
    );
  }

  const body = (await readObject(request, { action: "string" })) as { action?: string };
  if (body.action !== "check_in" && body.action !== "check_out") {
    return Response.json({ error: "Hành động không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const store = await db.prepare(
    "SELECT latitude, longitude, attendance_enabled FROM stores WHERE id = ?",
  ).bind(actor.storeId).first<{
    latitude: number;
    longitude: number;
    attendance_enabled: number;
  }>();
  if (!store || !store.attendance_enabled) {
    return Response.json(
      { error: "Chấm công chưa được bật. Chủ quán cần hoàn tất vị trí và quy tắc chấm công.", code: "attendance_disabled" },
      { status: 503 },
    );
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const recent = await db.prepare(
    "SELECT COUNT(*) AS count FROM attendance_action_limits WHERE employee_email = ? AND created_at >= ?",
  ).bind(actor.email, oneMinuteAgo).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 8) {
    return Response.json(
      { error: "Bạn đã thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.", code: "rate_limited" },
      { status: 429 },
    );
  }

  const id = crypto.randomUUID();
  const captureToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const nonceHash = await sha256Hex(new TextEncoder().encode(captureToken));
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 60_000);

  await db.batch([
    db.prepare(
      `INSERT INTO attendance_capture_sessions
        (id, employee_email, store_id, action, nonce_hash, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      actor.email,
      actor.storeId,
      body.action,
      nonceHash,
      issuedAt.toISOString(),
      expiresAt.toISOString(),
    ),
    db.prepare(
      `INSERT INTO attendance_action_limits (id, employee_email, action, created_at)
       VALUES (?, ?, 'capture_session', ?)`,
    ).bind(crypto.randomUUID(), actor.email, issuedAt.toISOString()),
    auditStatement(
      db,
      actor.email,
      "attendance_capture_session",
      id,
      "attendance.capture_session_created",
      { action: body.action, expiresInSeconds: 60 },
      issuedAt.toISOString(),
    ),
  ]);

  return Response.json({
    id,
    captureToken,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    storeLocation: {
      latitude: store.latitude,
      longitude: store.longitude,
    },
  });
});
