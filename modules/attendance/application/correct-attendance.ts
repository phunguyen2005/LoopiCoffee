import type { AccessActor, ActorRole } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export function attendanceTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ApplicationError("Giờ chấm công phải có ngày, giờ và múi giờ hợp lệ.");
  }
  if (new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new ApplicationError("Ngày chấm công không tồn tại.");
  return new Date(value).toISOString();
}

export async function correctAttendance(db: D1Database, actor: AccessActor, input: { eventId?: string; sessionId?: string; action?: "check_in" | "check_out"; adjustedTime: unknown; reason: unknown; expectedRevision?: number }) {
  if (!["owner", "manager"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền điều chỉnh chấm công.", 403, "forbidden");
  const effectiveTime = attendanceTime(input.adjustedTime);
  if (Date.parse(effectiveTime) > Date.now() + 60_000) throw new ApplicationError("Không thể điều chỉnh công tới thời điểm tương lai.");
  if (typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.length > 1000) throw new ApplicationError("Cần lý do điều chỉnh từ 5 đến 1000 ký tự.");
  const session = await db.prepare(
    `SELECT s.id, s.employee_email, s.opened_at, s.closed_at, s.revision, e.id AS event_id, e.action, emp.role AS employee_role
     FROM attendance_sessions s
     LEFT JOIN attendance_events e ON e.session_id = s.id AND e.id = ?
     LEFT JOIN employees emp ON lower(emp.email) = lower(s.employee_email) AND emp.store_id = s.store_id
     WHERE s.store_id = ? AND ${input.eventId ? "e.id = ?" : "s.id = ?"}`
  ).bind(input.eventId ?? null, actor.storeId, input.eventId ?? input.sessionId ?? "").first<{
    id: string; employee_email: string; opened_at: string | null; closed_at: string | null; revision: number; event_id: string | null; action: "check_in" | "check_out" | null; employee_role: ActorRole | null;
  }>();
  if (!session) throw new ApplicationError("Không tìm thấy phiên chấm công.", 404, "not_found");

  const isSelfCorrection = actor.email.trim().toLowerCase() === session.employee_email.trim().toLowerCase();

  if (isSelfCorrection) {
    if (actor.role !== "owner") {
      throw new ApplicationError("Bạn không thể tự điều chỉnh công của chính mình.", 403, "self_approval_blocked");
    }
    const activeOwners = await db.prepare(
      "SELECT COUNT(*) AS count FROM employees WHERE store_id = ? AND role = 'owner' AND status = 'active'"
    ).bind(actor.storeId).first<{ count: number }>();
    if ((activeOwners?.count ?? 0) !== 1) {
      throw new ApplicationError("Tự điều chỉnh công chỉ áp dụng khi cửa hàng chỉ có duy nhất 1 chủ quán đang hoạt động.", 403, "sole_owner_required");
    }
  } else {
    if (actor.role === "manager" && ["owner", "manager"].includes(session.employee_role || "")) {
      throw new ApplicationError("Quản lý không có quyền điều chỉnh công của Quản lý hoặc Chủ quán.", 403, "forbidden");
    }
  }

  const action = session.action ?? input.action;
  if (action !== "check_in" && action !== "check_out") throw new ApplicationError("Chọn giờ vào hoặc giờ ra cần bổ sung.");
  if (input.expectedRevision !== undefined && input.expectedRevision !== session.revision) throw new ApplicationError("Phiên chấm công vừa thay đổi. Hãy tải lại.", 409, "attendance_conflict");
  const openedAt = action === "check_in" ? effectiveTime : session.opened_at;
  const closedAt = action === "check_out" ? effectiveTime : session.closed_at;
  if (openedAt && closedAt && (Date.parse(closedAt) <= Date.parse(openedAt) || Date.parse(closedAt) - Date.parse(openedAt) > 24 * 60 * 60_000)) throw new ApplicationError("Giờ ra phải sau giờ vào và ca không được dài quá 24 giờ.");
  const workedMinutes = openedAt && closedAt ? Math.floor((Date.parse(closedAt) - Date.parse(openedAt)) / 60_000) : null;
  const now = new Date().toISOString();
  const correctionId = crypto.randomUUID();
  const previousTime = action === "check_in" ? session.opened_at : session.closed_at;
  const affectedStart = [session.opened_at, session.closed_at, openedAt, closedAt].filter((value): value is string => Boolean(value)).sort()[0];
  const affectedEnd = [session.opened_at, session.closed_at, openedAt, closedAt].filter((value): value is string => Boolean(value)).sort().at(-1)!;
  const result = await db.batch([
    db.prepare(
      `UPDATE attendance_sessions SET opened_at = ?, closed_at = ?, worked_minutes = ?, revision = revision + 1,
       status = CASE WHEN EXISTS (SELECT 1 FROM attendance_events e LEFT JOIN attendance_exceptions x ON x.event_id = e.id
         WHERE e.session_id = attendance_sessions.id AND (e.review_required = 1 OR x.status = 'rejected')) THEN 'review_required'
         WHEN ? IS NOT NULL AND ? IS NOT NULL THEN 'completed' ELSE 'open' END
       WHERE id = ? AND store_id = ? AND revision = ?
       AND NOT EXISTS (SELECT 1 FROM attendance_sessions other
         WHERE other.id <> attendance_sessions.id AND other.store_id = attendance_sessions.store_id
           AND lower(other.employee_email) = lower(attendance_sessions.employee_email)
           AND COALESCE(other.opened_at, other.closed_at) < COALESCE(?, '9999-12-31T23:59:59.999Z')
           AND COALESCE(other.closed_at, '9999-12-31T23:59:59.999Z') > COALESCE(?, ?))
       AND NOT EXISTS (SELECT 1 FROM payroll_periods WHERE store_id = ? AND status IN ('finalized', 'paid') AND period_start <= ? AND period_end > ?)`,
    ).bind(openedAt, closedAt, workedMinutes, openedAt, closedAt, session.id, actor.storeId, session.revision, closedAt, openedAt, closedAt, actor.storeId, affectedEnd, affectedStart),
    db.prepare(
      `INSERT INTO attendance_corrections (id, session_id, event_id, action, previous_time, effective_time, reason, actor_email, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(correctionId, session.id, session.event_id, action, previousTime, effectiveTime, input.reason.trim(), actor.email, now),
    auditStatement(
      db,
      actor.email,
      "attendance_event",
      input.eventId ?? session.id,
      "attendance.time_adjusted",
      {
        correctionId,
        sessionId: session.id,
        action,
        previousTime,
        newTime: effectiveTime,
        reason: input.reason.trim(),
        ...(isSelfCorrection ? { soleOwnerCorrection: true, highAudit: true } : {}),
      },
      now,
      true
    ),
  ]);
  if (!result[0].meta.changes) throw new ApplicationError("Giờ công trùng phiên khác, kỳ lương đã khóa hoặc phiên công vừa thay đổi. Hãy tải lại để đối soát.", 409, "attendance_conflict");
  return {
    updated: true,
    sessionId: session.id,
    eventId: session.event_id,
    previousTime,
    newTime: effectiveTime,
    revision: session.revision + 1,
    soleOwnerCorrection: isSelfCorrection,
  };
}
