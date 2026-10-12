import { evaluateShiftWindow, type AttendanceRule as Rule, type AssignedShift as Shift } from "@/modules/attendance/domain/policy";
import { distanceInMeters, formatStoreTime, isCoordinate } from "@/lib/attendance";
import {
  createServerStampedSvg,
  evidenceObjectKey,
  sha256Hex,
  validateJpegDataUrl,
} from "@/lib/evidence";
import { ensureDatabase, getBindings } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

type AttendanceBody = {
  captureSessionId?: string;
  captureToken?: string;
  idempotencyKey?: string;
  action?: "check_in" | "check_out";
  photo?: string;
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


export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const actor = auth.actor;
  const body = (await readObject(request, { captureSessionId: "string", captureToken: "string", idempotencyKey: "string", action: "string", photo: "string", exceptionReason: "string" })) as AttendanceBody;
  if (
    !body.captureSessionId ||
    !body.captureToken ||
    !body.idempotencyKey || body.idempotencyKey.length > 128 || body.captureToken.length > 256 ||
    (body.action !== "check_in" && body.action !== "check_out")
  ) {
    return Response.json({ error: "Thiếu thông tin phiên chấm công." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const existing = await db.prepare(
    `SELECT e.id, e.session_id, e.recorded_at, e.verification_results, e.action, e.photo_status,
            e.review_required, l.distance_from_store_meters
     FROM attendance_events e
     LEFT JOIN attendance_locations l ON l.event_id = e.id AND l.deleted_at IS NULL AND datetime(l.expires_at) > datetime('now')
     WHERE e.idempotency_key = ? AND e.employee_email = ?`,
  ).bind(body.idempotencyKey, actor.email).first<{
    id: string;
    session_id: string;
    recorded_at: string;
    verification_results: string;
    review_required: number;
    action: string;
    photo_status: string;
    distance_from_store_meters: number | null;
  }>();
  if (existing) {
    if (existing.action !== body.action) return Response.json({ error: "Mã gửi đã được dùng cho thao tác khác.", code: "attendance_conflict" }, { status: 409 });
    return Response.json({
      eventId: existing.id,
      sessionId: existing.session_id,
      recordedAt: existing.recorded_at,
      localTime: `${formatStoreTime(existing.recorded_at)} GMT+7`,
      verification: safeJsonArray(existing.verification_results),
      reviewRequired: Boolean(existing.review_required),
      distance: existing.distance_from_store_meters,
      photoStatus: existing.photo_status,
      evidenceStored: existing.photo_status === "stored",
    });
  }

  const capture = await db.prepare(
    `SELECT id, employee_email, store_id, action, nonce_hash, expires_at, used_at
     FROM attendance_capture_sessions WHERE id = ?`,
  ).bind(body.captureSessionId).first<{
    id: string;
    employee_email: string;
    store_id: string;
    action: string;
    nonce_hash: string | null;
    expires_at: string;
    used_at: string | null;
  }>();
  const suppliedNonceHash = await sha256Hex(new TextEncoder().encode(body.captureToken));
  if (
    !capture ||
    capture.employee_email.toLowerCase() !== actor.email.toLowerCase() ||
    capture.store_id !== actor.storeId ||
    capture.action !== body.action ||
    capture.used_at ||
    !capture.nonce_hash ||
    capture.nonce_hash !== suppliedNonceHash
  ) {
    return Response.json({ error: "Phiên chấm công không còn hợp lệ." }, { status: 409 });
  }
  if (new Date(capture.expires_at).getTime() < Date.now()) {
    return Response.json(
      { error: "Phiên chụp đã hết 60 giây. Vui lòng bắt đầu lại.", code: "capture_expired" },
      { status: 409 },
    );
  }

  const recordedAt = new Date().toISOString();
  const verification: string[] = [];
  const store = await db.prepare(
    "SELECT latitude, longitude, attendance_enabled FROM stores WHERE id = ?",
  ).bind(actor.storeId).first<{
    latitude: number;
    longitude: number;
    attendance_enabled: number;
  }>();
  const rule = await db.prepare(
    `SELECT id, early_checkin_minutes, late_minutes, early_departure_minutes,
            absence_minutes, missing_checkout_minutes, evidence_retention_days
     FROM attendance_rules WHERE store_id = ? AND active = 1
     ORDER BY version DESC LIMIT 1`,
  ).bind(actor.storeId).first<Rule>();
  if (!store || !store.attendance_enabled || !rule) {
    return Response.json({ error: "Cửa hàng chưa hoàn tất quy tắc chấm công." }, { status: 503 });
  }

  const latitude = body.location?.latitude;
  const longitude = body.location?.longitude;
  const accuracy = body.location?.accuracy;
  const positionTimestamp = body.location?.timestamp;
  const positionAge = typeof positionTimestamp === "number"
    ? Date.now() - positionTimestamp
    : Number.POSITIVE_INFINITY;
  const hasLocation =
    isCoordinate(latitude, -90, 90) &&
    isCoordinate(longitude, -180, 180) &&
    typeof accuracy === "number" &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    positionAge >= -30_000 &&
    positionAge <= 120_000;
  if (!hasLocation) verification.push("location_unavailable");
  const distance = hasLocation
    ? distanceInMeters(latitude, longitude, store.latitude, store.longitude)
    : null;

  const activeSession = await db.prepare(
    `SELECT id, opened_at, shift_id, rule_version_id, revision
     FROM attendance_sessions
     WHERE employee_email = ? AND store_id = ? AND closed_at IS NULL
       AND status IN ('open', 'review_required')
     ORDER BY opened_at DESC LIMIT 1`,
  ).bind(actor.email, actor.storeId).first<{
    id: string;
    opened_at: string | null;
    shift_id: string | null;
    rule_version_id: string | null;
    revision: number;
  }>();
  if (body.action === "check_in" && activeSession) {
    return Response.json(
      { error: "Bạn đã có một ca đang mở. Hãy chấm ra ca trước khi bắt đầu ca mới.", code: "duplicate_action" },
      { status: 409 },
    );
  }

  const shift = body.action === "check_in"
    ? await findNearestShift(db, actor.email, actor.storeId, recordedAt)
    : activeSession?.shift_id
      ? await db.prepare("SELECT id, starts_at, ends_at FROM shifts WHERE id = ?")
          .bind(activeSession.shift_id).first<Shift>()
      : null;
  verification.push(...evaluateShiftWindow(body.action, shift, rule, recordedAt));
  if (body.action === "check_out" && !activeSession) verification.push("no_active_session");

  const eventId = crypto.randomUUID();
  const sessionId = activeSession?.id ?? crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + rule.evidence_retention_days * 24 * 60 * 60 * 1000,
  ).toISOString();
  let objectKey: string | null = null;
  let stampedBytes: Uint8Array | null = null;
  let stampedHash: string | null = null;
  let photoStatus: "stored" | "unavailable" | "failed" = "unavailable";

  if (body.photo) {
    let photo;
    try {
      photo = validateJpegDataUrl(body.photo);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Ảnh chấm công không hợp lệ.", code: "invalid_photo" },
        { status: 400 },
      );
    }
    if (!hasLocation || distance === null) {
      verification.push("photo_stamp_failed");
      photoStatus = "failed";
    } else {
      stampedBytes = createServerStampedSvg({
        photo,
        action: body.action,
        localTime: formatStoreTime(recordedAt),
        latitude,
        longitude,
        accuracy,
        distance,
        eventId,
      });
      stampedHash = await sha256Hex(stampedBytes);
      objectKey = evidenceObjectKey(actor.storeId, actor.id, eventId, recordedAt);
      try {
        const { evidence } = getBindings();
        if (!evidence) throw new Error("Evidence storage unavailable");
        await evidence.put(objectKey, stampedBytes, {
          httpMetadata: { contentType: "image/svg+xml; charset=utf-8" },
          customMetadata: {
            eventId,
            sha256: stampedHash,
            overlayVersion: "server-svg-v1",
          },
        });
        photoStatus = "stored";
      } catch {
        objectKey = null;
        stampedBytes = null;
        stampedHash = null;
        photoStatus = "failed";
        verification.push("photo_stamp_failed");
      }
    }
  } else {
    verification.push("camera_unavailable");
  }

  const reviewRequired = verification.length > 0;
  if (reviewRequired) verification.push("manual_review_required");
  else verification.push("verified");
  const employeeReason = body.exceptionReason?.trim().slice(0, 500);
  if (
    (verification.includes("camera_unavailable") || verification.includes("location_unavailable")) &&
    (!employeeReason || employeeReason.length < 5)
  ) {
    if (objectKey) {
      const { evidence } = getBindings();
      await evidence?.delete(objectKey);
    }
    return Response.json(
      { error: "Vui lòng giải thích ngắn gọn vì sao ảnh hoặc vị trí không khả dụng.", code: "explanation_required" },
      { status: 422 },
    );
  }

  const statements: D1PreparedStatement[] = [];
  if (body.action === "check_in") {
    statements.push(
      db.prepare(
        `INSERT INTO attendance_sessions
          (id, employee_email, store_id, shift_id, rule_version_id, status, opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        sessionId,
        actor.email,
        actor.storeId,
        shift?.id ?? null,
        rule.id,
        reviewRequired ? "review_required" : "open",
        recordedAt,
      ),
    );
  } else if (activeSession) {
    const workedMinutes = activeSession.opened_at
      ? Math.max(0, Math.floor((Date.parse(recordedAt) - Date.parse(activeSession.opened_at)) / 60_000))
      : null;
    statements.push(
      db.prepare(
        `UPDATE attendance_sessions
         SET status = ?, closed_at = ?, worked_minutes = ?, revision = ? WHERE id = ?`,
      ).bind(reviewRequired ? "review_required" : "completed", recordedAt, workedMinutes, activeSession.revision + 1, sessionId),
    );
  } else {
    statements.push(
      db.prepare(
        `INSERT INTO attendance_sessions
          (id, employee_email, store_id, shift_id, rule_version_id, status, opened_at, closed_at)
         VALUES (?, ?, ?, ?, ?, 'review_required', NULL, ?)`,
      ).bind(sessionId, actor.email, actor.storeId, shift?.id ?? null, rule.id, recordedAt),
    );
  }

  statements.push(
    db.prepare(
      `INSERT INTO attendance_events
        (id, session_id, employee_email, action, recorded_at, idempotency_key,
         verification_results, review_required, photo_status, exception_reason, capture_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      eventId,
      sessionId,
      actor.email,
      body.action,
      recordedAt,
      body.idempotencyKey,
      JSON.stringify(verification),
      reviewRequired ? 1 : 0,
      photoStatus,
      employeeReason ?? defaultExceptionReason(verification),
      capture.id,
    ),
    db.prepare(
      "UPDATE attendance_capture_sessions SET used_at = ? WHERE id = ? AND used_at IS NULL",
    ).bind(recordedAt, capture.id),
    db.prepare(
      `INSERT INTO attendance_action_limits (id, employee_email, action, created_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), actor.email, body.action, recordedAt),
    auditStatement(
      db,
      actor.email,
      "attendance_event",
      eventId,
      `attendance.${body.action}`,
      { verification, photoStatus, hasLocation, shiftId: shift?.id ?? null },
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
        positionTimestamp ? new Date(positionTimestamp).toISOString() : null,
        recordedAt,
        distance,
        expiresAt,
      ),
    );
  }
  if (objectKey && stampedBytes && stampedHash) {
    statements.push(
      db.prepare(
        `INSERT INTO attendance_photos
          (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
         VALUES (?, ?, 'image/svg+xml', ?, ?, 'server-svg-v1', ?)`,
      ).bind(eventId, objectKey, stampedBytes.byteLength, stampedHash, expiresAt),
    );
  }
  if (reviewRequired) {
    statements.push(
      db.prepare(
        `INSERT INTO attendance_exceptions
          (id, event_id, employee_reason, status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`,
      ).bind(
        crypto.randomUUID(),
        eventId,
        employeeReason ?? defaultExceptionReason(verification),
        recordedAt,
      ),
    );
    const reviewers = await db.prepare(
      `SELECT email FROM employees
       WHERE store_id = ? AND role IN ('owner', 'manager') AND status = 'active'`,
    ).bind(actor.storeId).all<{ email: string }>();
    statements.push(...reviewers.results.map((reviewer) =>
      db.prepare(
        `INSERT INTO notifications
          (id, recipient_email, type, title, entity_href, created_at)
         VALUES (?, ?, 'attendance_exception', ?, '/app/attendance/review', ?)`,
      ).bind(
        crypto.randomUUID(),
        reviewer.email,
        `${actor.displayName} có chấm công cần xem xét`,
        recordedAt,
      )));
  }

  try {
    await db.batch(statements);
  } catch (error) {
    if (objectKey) {
      const { evidence } = getBindings();
      await evidence?.delete(objectKey).catch(() => {});
    }
    const replay = await db.prepare("SELECT id, session_id, recorded_at, verification_results, review_required, photo_status FROM attendance_events WHERE idempotency_key = ? AND employee_email = ?")
      .bind(body.idempotencyKey, actor.email).first<{ id: string; session_id: string; recorded_at: string; verification_results: string; review_required: number; photo_status: string }>();
    if (replay) return Response.json({ eventId: replay.id, sessionId: replay.session_id, recordedAt: replay.recorded_at, localTime: `${formatStoreTime(replay.recorded_at)} GMT+7`, verification: safeJsonArray(replay.verification_results), reviewRequired: Boolean(replay.review_required), photoStatus: replay.photo_status, evidenceStored: replay.photo_status === "stored", distance: null });
    if (error instanceof Error && /UNIQUE|constraint|attendance_conflict/i.test(error.message)) return Response.json({ error: "Phiên công vừa được ghi nhận hoặc đã thay đổi. Hãy tải lại trước khi thử tiếp.", code: "attendance_conflict" }, { status: 409 });
    throw error;
  }

  return Response.json({
    eventId,
    sessionId,
    recordedAt,
    localTime: `${formatStoreTime(recordedAt)} GMT+7`,
    verification,
    reviewRequired,
    distance,
    photoStatus,
    evidenceStored: photoStatus === "stored",
  });
});

async function findNearestShift(
  db: D1Database,
  employeeEmail: string,
  storeId: string,
  recordedAt: string,
) {
  const dayBefore = new Date(Date.parse(recordedAt) - 24 * 60 * 60 * 1000).toISOString();
  const dayAfter = new Date(Date.parse(recordedAt) + 24 * 60 * 60 * 1000).toISOString();
  return db.prepare(
    `SELECT id, starts_at, ends_at FROM shifts
     WHERE employee_email = ? AND store_id = ? AND status = 'published' AND approved_leave_request_id IS NULL
       AND starts_at BETWEEN ? AND ?
     ORDER BY ABS(julianday(starts_at) - julianday(?)) LIMIT 1`,
  ).bind(employeeEmail, storeId, dayBefore, dayAfter, recordedAt).first<Shift>();
}

function defaultExceptionReason(verification: string[]) {
  if (verification.includes("no_assigned_shift")) return "Không tìm thấy ca được phân công phù hợp.";
  if (verification.includes("outside_shift_window")) return "Hành động nằm ngoài khung giờ chấm công.";
  if (verification.includes("late")) return "Chấm công sau ngưỡng đi trễ.";
  if (verification.includes("early_departure")) return "Ra ca trước ngưỡng cho phép.";
  if (verification.includes("photo_stamp_failed")) return "Máy chủ chưa lưu được ảnh đã đóng dấu.";
  return "Cần quản lý xem xét bằng chứng chấm công.";
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
