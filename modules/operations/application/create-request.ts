import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";
import { attendanceTime } from "../../attendance/application/correct-attendance.ts";

export async function createRequest(db: D1Database, actor: AccessActor, input: { type?: unknown; title?: unknown; reason?: unknown; shiftId?: unknown; correctionEventId?: unknown; correctionSessionId?: unknown; correctionAction?: unknown; adjustedTime?: unknown; expectedRevision?: unknown; idempotencyKey?: unknown }) {
  if (typeof input.type !== "string" || !["leave", "swap", "correction"].includes(input.type) || typeof input.title !== "string" || !input.title.trim() || input.title.length > 180 || typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.length > 1000 || typeof input.idempotencyKey !== "string" || !input.idempotencyKey || input.idempotencyKey.length > 128) throw new ApplicationError("Yêu cầu chưa đủ thông tin hợp lệ; lý do cần ít nhất 5 ký tự.");
  const key = input.idempotencyKey;
  const existing = await db.prepare(
    `SELECT id, type, title, reason, shift_id, correction_event_id, correction_session_id, correction_action, correction_effective_time, correction_expected_revision
     FROM requests WHERE employee_email = ? AND client_request_key = ?`,
  ).bind(actor.email, key).first<{ id: string; type: string; title: string; reason: string; shift_id: string | null; correction_event_id: string | null; correction_session_id: string | null; correction_action: string | null; correction_effective_time: string | null; correction_expected_revision: number | null }>();
  if (existing) {
    const replayEffectiveTime = input.type === "correction" ? attendanceTime(input.adjustedTime) : null;
    if (existing.type !== input.type || existing.title !== input.title.trim() || existing.reason !== input.reason.trim() || existing.shift_id !== (input.shiftId || null) || existing.correction_event_id !== (input.correctionEventId || null) || existing.correction_session_id !== (input.type === "correction" ? input.correctionSessionId : null) || existing.correction_action !== (input.type === "correction" ? input.correctionAction : null) || existing.correction_effective_time !== replayEffectiveTime || existing.correction_expected_revision !== (input.type === "correction" ? input.expectedRevision : null)) throw new ApplicationError("Nội dung yêu cầu đã thay đổi. Hãy tải lại biểu mẫu.", 409, "request_conflict");
    return { request: existing, replayed: true };
  }
  let shift: { id: string; starts_at: string; ends_at: string } | null = null;
  if ((input.type === "leave" || input.type === "swap") && !input.shiftId) {
    throw new ApplicationError(input.type === "leave" ? "Chọn ca cần xin nghỉ." : "Chọn ca muốn đổi.", 400, "shift_required");
  }
  if (input.shiftId) {
    if (typeof input.shiftId !== "string") throw new ApplicationError("Ca không hợp lệ.");
    shift = await db.prepare("SELECT id, starts_at, ends_at FROM shifts WHERE id = ? AND store_id = ? AND lower(employee_email) = lower(?) AND status = 'published' AND approved_leave_request_id IS NULL")
      .bind(input.shiftId, actor.storeId, actor.email).first();
    if (!shift) throw new ApplicationError("Không tìm thấy ca của bạn hoặc ca đã được duyệt nghỉ.", 404, "not_found");
  }
  let correction: { eventId: string | null; sessionId: string; action: "check_in" | "check_out"; effectiveTime: string; expectedRevision: number } | null = null;
  if (input.type === "correction") {
    if (typeof input.correctionSessionId !== "string" || !input.correctionSessionId || !["check_in", "check_out"].includes(String(input.correctionAction)) || typeof input.expectedRevision !== "number" || !Number.isInteger(input.expectedRevision)) {
      throw new ApplicationError("Chọn sự kiện chấm công và tải lại dữ liệu trước khi gửi yêu cầu.", 400, "correction_details_required");
    }
    const eventId = typeof input.correctionEventId === "string" && input.correctionEventId ? input.correctionEventId : null;
    const event = await db.prepare(
      `SELECT s.id AS session_id, s.revision, e.id AS event_id, e.action AS event_action
       FROM attendance_sessions s
       LEFT JOIN attendance_events e ON e.id = ? AND e.session_id = s.id
       WHERE s.id = ? AND s.store_id = ? AND lower(s.employee_email) = lower(?)
         AND (? IS NULL OR (e.id IS NOT NULL AND e.action = ?))`,
    ).bind(eventId, input.correctionSessionId, actor.storeId, actor.email, eventId, input.correctionAction).first<{ session_id: string; revision: number; event_id: string | null; event_action: "check_in" | "check_out" | null }>();
    if (!event) throw new ApplicationError("Không tìm thấy phiên chấm công của bạn.", 404, "not_found");
    if (!eventId && input.correctionAction !== "check_out") throw new ApplicationError("Chỉ có thể bổ sung giờ chấm ra còn thiếu.", 400, "correction_details_required");
    if (event.revision !== input.expectedRevision) throw new ApplicationError("Phiên chấm công vừa thay đổi. Hãy tải lại trước khi gửi.", 409, "attendance_conflict");
    const effectiveTime = attendanceTime(input.adjustedTime);
    if (Date.parse(effectiveTime) > Date.now() + 60_000) throw new ApplicationError("Không thể đề nghị giờ chấm công trong tương lai.");
    correction = { eventId: event.event_id, sessionId: event.session_id, action: input.correctionAction as "check_in" | "check_out", effectiveTime, expectedRevision: event.revision };
  }
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const permissionKey = input.type === "correction"
    ? "requests.correction.review"
    : input.type === "swap"
      ? "requests.swap.apply"
      : "requests.leave.review";

  const approverRows = await db.prepare(
    `SELECT DISTINCT e.email
     FROM employees e
     WHERE e.store_id = ? AND e.status = 'active' AND lower(e.email) != lower(?)
       AND (
         e.role = 'owner'
         OR (e.role = 'manager' AND ? != 'owner')
         OR (
           e.role_id IS NOT NULL
           AND ? != 'owner'
           AND EXISTS (
             SELECT 1 FROM role_permissions rp
             JOIN custom_roles cr ON cr.id = rp.role
             WHERE rp.store_id = e.store_id AND rp.role = e.role_id
               AND cr.status = 'active'
               AND rp.permission_key = ?
           )
         )
         OR (e.role = 'team_lead' AND ? = 'swap' AND ? = 'employee')
       )`,
  ).bind(actor.storeId, actor.email, actor.role, actor.role, permissionKey, input.type, actor.role).all<{ email: string }>();

  const notifType = input.type === "leave" ? "leave_requested" : input.type === "swap" ? "swap_requested" : "correction_requested";
  const notifTitle = input.type === "leave"
    ? `Có đơn xin nghỉ ca mới từ ${actor.email}.`
    : input.type === "swap"
      ? `Có yêu cầu đổi ca mới từ ${actor.email}.`
      : `Có yêu cầu sửa chấm công từ ${actor.email}.`;

  const notificationStatements = (approverRows.results ?? []).map((approver) =>
    db.prepare(
      `INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
       VALUES (?, ?, ?, ?, '/app/requests', ?)`,
    ).bind(crypto.randomUUID(), approver.email, notifType, notifTitle, now)
  );

  try {
    await db.batch([
      db.prepare(`INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, created_at, shift_id, starts_at, ends_at, client_request_key,
        correction_event_id, correction_session_id, correction_action, correction_effective_time, correction_expected_revision)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, actor.storeId, actor.email, input.type, input.title.trim(), input.reason.trim(), now, shift?.id ?? null, shift?.starts_at ?? null, shift?.ends_at ?? null, key,
          correction?.eventId ?? null, correction?.sessionId ?? null, correction?.action ?? null, correction?.effectiveTime ?? null, correction?.expectedRevision ?? null),
      auditStatement(db, actor.email, "request", id, "request.created", { type: input.type, shiftId: shift?.id ?? null }, now),
      ...notificationStatements,
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message)) return createRequest(db, actor, input);
    throw error;
  }
  return { request: { id }, replayed: false };
}
