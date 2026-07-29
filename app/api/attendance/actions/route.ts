import { distanceInMeters, formatStoreTime, isCoordinate } from "@/lib/attendance";
import { ensureDatabase } from "@/db/runtime";
import { getApiUser } from "@/server/auth";

type AttendanceBody = {
  captureSessionId?: string;
  idempotencyKey?: string;
  action?: "check_in" | "check_out";
  hasPhoto?: boolean;
  cameraError?: string;
  locationError?: string | null;
  exceptionReason?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    timestamp?: number;
  };
};

export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as AttendanceBody;
  if (!body.captureSessionId || !body.idempotencyKey || (body.action !== "check_in" && body.action !== "check_out")) {
    return Response.json({ error: "Thiếu thông tin phiên chấm công." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const existing = await db.prepare(
    "SELECT id, recorded_at FROM attendance_events WHERE idempotency_key = ?",
  ).bind(body.idempotencyKey).first<{ id: string; recorded_at: string }>();
  if (existing) {
    return Response.json({
      eventId: existing.id,
      recordedAt: existing.recorded_at,
      localTime: formatStoreTime(existing.recorded_at),
      verification: ["manual_review_required"],
      reviewRequired: true,
      distance: null,
    });
  }

  const capture = await db.prepare(
    `SELECT id, employee_email, action, expires_at, used_at
     FROM attendance_capture_sessions WHERE id = ?`,
  ).bind(body.captureSessionId).first<{
    id: string;
    employee_email: string;
    action: string;
    expires_at: string;
    used_at: string | null;
  }>();

  if (!capture || capture.employee_email !== user.email || capture.action !== body.action || capture.used_at) {
    return Response.json({ error: "Phiên chấm công không còn hợp lệ." }, { status: 409 });
  }
  if (new Date(capture.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "Phiên chụp đã hết 60 giây. Vui lòng bắt đầu lại.", code: "capture_expired" }, { status: 409 });
  }

  const recordedAt = new Date().toISOString();
  const verification: string[] = [];
  if (!body.hasPhoto) verification.push("camera_unavailable");

  const latitude = body.location?.latitude;
  const longitude = body.location?.longitude;
  const accuracy = body.location?.accuracy;
  const hasLocation =
    isCoordinate(latitude, -90, 90) &&
    isCoordinate(longitude, -180, 180) &&
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy >= 0;
  if (!hasLocation) verification.push("location_unavailable");

  const store = await db.prepare("SELECT latitude, longitude FROM stores WHERE id = ?")
    .bind("store-loopi-nguyen-trai")
    .first<{ latitude: number; longitude: number }>();
  if (!store) return Response.json({ error: "Cửa hàng chưa được thiết lập." }, { status: 503 });

  const distance = hasLocation
    ? distanceInMeters(latitude, longitude, store.latitude, store.longitude)
    : null;

  const activeSession = await db.prepare(
    `SELECT id, opened_at
     FROM attendance_sessions
     WHERE employee_email = ? AND closed_at IS NULL
       AND status IN ('open', 'review_required')
     ORDER BY opened_at DESC
     LIMIT 1`,
  ).bind(user.email).first<{ id: string; opened_at: string | null }>();

  if (body.action === "check_in" && activeSession) {
    return Response.json(
      { error: "Bạn đã có một ca đang mở. Hãy chấm ra ca trước khi bắt đầu ca mới.", code: "duplicate_action" },
      { status: 409 },
    );
  }
  if (body.action === "check_out" && !activeSession) {
    verification.push("no_assigned_shift");
  }

  const reviewRequired = verification.length > 0;
  if (reviewRequired) verification.push("manual_review_required");
  else verification.push("verified");

  const sessionId = activeSession?.id ?? crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const auditId = crypto.randomUUID();

  const statements: D1PreparedStatement[] = [];

  if (body.action === "check_in") {
    statements.push(
      db.prepare(
        `INSERT INTO attendance_sessions
          (id, employee_email, store_id, status, opened_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        sessionId,
        user.email,
        "store-loopi-nguyen-trai",
        reviewRequired ? "review_required" : "open",
        recordedAt,
      ),
    );
  } else if (activeSession) {
    const workedMinutes = activeSession.opened_at
      ? Math.max(0, Math.floor((Date.parse(recordedAt) - Date.parse(activeSession.opened_at)) / 60000))
      : null;
    statements.push(
      db.prepare(
        `UPDATE attendance_sessions
         SET status = ?, closed_at = ?, worked_minutes = ?
         WHERE id = ?`,
      ).bind(reviewRequired ? "review_required" : "completed", recordedAt, workedMinutes, sessionId),
    );
  } else {
    statements.push(
      db.prepare(
        `INSERT INTO attendance_sessions
          (id, employee_email, store_id, status, opened_at, closed_at, worked_minutes)
         VALUES (?, ?, ?, 'review_required', NULL, ?, NULL)`,
      ).bind(sessionId, user.email, "store-loopi-nguyen-trai", recordedAt),
    );
  }

  statements.push(
    db.prepare(
      `INSERT INTO attendance_events
        (id, session_id, employee_email, action, recorded_at, idempotency_key,
         verification_results, review_required, exception_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      eventId,
      sessionId,
      user.email,
      body.action,
      recordedAt,
      body.idempotencyKey,
      JSON.stringify(verification),
      reviewRequired ? 1 : 0,
      body.exceptionReason?.slice(0, 500) ?? null,
    ),
    db.prepare("UPDATE attendance_capture_sessions SET used_at = ? WHERE id = ?")
      .bind(recordedAt, capture.id),
    db.prepare(
      `INSERT INTO audit_events
        (id, actor_email, entity_type, entity_id, action, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      auditId,
      user.email,
      "attendance_event",
      eventId,
      `attendance.${body.action}`,
      JSON.stringify({ verification, hasPhoto: Boolean(body.hasPhoto), hasLocation }),
      recordedAt,
    ),
  );

  if (hasLocation && distance !== null) {
    statements.push(
      db.prepare(
        `INSERT INTO attendance_locations
          (event_id, latitude, longitude, accuracy_meters, browser_position_at,
           server_received_at, distance_from_store_meters, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        eventId,
        latitude,
        longitude,
        accuracy,
        body.location?.timestamp ? new Date(body.location.timestamp).toISOString() : null,
        recordedAt,
        distance,
        expiresAt,
      ),
    );
  }

  await db.batch(statements);
  return Response.json({
    eventId,
    sessionId,
    recordedAt,
    localTime: `${formatStoreTime(recordedAt)} GMT+7`,
    verification,
    reviewRequired,
    distance,
  });
}
