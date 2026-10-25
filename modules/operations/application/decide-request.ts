import { auditStatement } from "../../../server/audit.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import type { AccessActor } from "../../people/domain/access.ts";
import { hasGrantedPermission } from "../../people/domain/permissions.ts";
import { attendanceTime } from "../../attendance/application/correct-attendance.ts";

export async function decideRequest(db: D1Database, actor: AccessActor, id: string, decision: "approved" | "rejected") {
  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();

  const targetRequest = await db.prepare(
    `SELECT r.id, r.type, r.title, r.reason, r.status, r.employee_email, emp.role AS employee_role,
            r.correction_event_id, r.correction_session_id, r.correction_action,
            r.correction_effective_time, r.correction_expected_revision
     FROM requests r
     LEFT JOIN employees emp ON lower(emp.email) = lower(r.employee_email) AND emp.store_id = r.store_id
     WHERE r.id = ? AND r.store_id = ?`,
  ).bind(id, actor.storeId).first<{
    id: string;
    type: string;
    title: string;
    status: string;
    employee_email: string;
    employee_role: string | null;
    reason: string;
    correction_event_id: string | null;
    correction_session_id: string | null;
    correction_action: "check_in" | "check_out" | null;
    correction_effective_time: string | null;
    correction_expected_revision: number | null;
  }>();

  if (!targetRequest || targetRequest.status !== "pending") {
    throw new ApplicationError("Yêu cầu không còn chờ duyệt, ca đã thay đổi hoặc kỳ lương đã khóa.", 409, "request_conflict");
  }

  // DEC-001: Anti-self-approval - checked before role so any actor attempting self-approval gets self_approval_blocked
  if (actor.email.trim().toLowerCase() === targetRequest.employee_email.trim().toLowerCase()) {
    throw new ApplicationError("Bạn không thể tự phê duyệt yêu cầu của chính mình.", 403, "self_approval_blocked");
  }

  const permission = targetRequest.type === "correction"
    ? "requests.correction.review"
    : targetRequest.type === "swap"
      ? "requests.swap.apply"
      : "requests.leave.review";
  if (!hasGrantedPermission(actor, permission)) throw new ApplicationError("Bạn không có quyền duyệt yêu cầu.", 403, "permission_denied");

  // DEC-001 & DEC-011: Scoping checks
  if (actor.role !== "owner") {
    if (targetRequest.employee_role && ["owner", "system_admin"].includes(targetRequest.employee_role)) {
      throw new ApplicationError("Bạn không có quyền duyệt yêu cầu của Chủ quán hoặc Quản trị hệ thống.", 403, "forbidden");
    }
  }

  // DEC-001: Team lead scoping - can only approve swaps between regular employees
  if (actor.role === "team_lead") {
    if (targetRequest.type !== "swap") {
      throw new ApplicationError("Trưởng ca chỉ có quyền duyệt yêu cầu đổi ca giữa các nhân viên.", 403, "forbidden");
    }
    if (targetRequest.employee_role && targetRequest.employee_role !== "employee") {
      throw new ApplicationError("Trưởng ca không có quyền duyệt yêu cầu của Quản lý hoặc Chủ quán.", 403, "forbidden");
    }
  }

  // DEC-001: Manager scoping - cannot approve requests of another manager or owner
  if (actor.role === "manager") {
    if (targetRequest.employee_role && targetRequest.employee_role === "manager") {
      throw new ApplicationError("Quản lý không có quyền duyệt yêu cầu của Quản lý khác.", 403, "forbidden");
    }
  }

  if (decision === "approved" && targetRequest.type === "correction") {
    return applyCorrectionRequest(db, actor, targetRequest, now);
  }
  const persistedStatus = decision === "approved" && targetRequest.type === "swap"
    ? "approved_pending_apply"
    : decision;

  const results = await db.batch([
    db.prepare(
      `UPDATE requests SET status = ?, reviewer_email = ?, reviewed_at = ?
       WHERE id = ? AND store_id = ? AND status = 'pending'
       AND (? = 'rejected' OR type <> 'leave' OR shift_id IS NULL OR EXISTS (
         SELECT 1 FROM shifts s WHERE s.id = requests.shift_id AND s.store_id = requests.store_id
           AND lower(s.employee_email) = lower(requests.employee_email) AND s.status = 'published'
           AND s.approved_leave_request_id IS NULL AND s.starts_at = requests.starts_at AND s.ends_at = requests.ends_at
           AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = s.id)
           AND NOT EXISTS (SELECT 1 FROM payroll_periods p WHERE p.store_id = s.store_id AND p.status IN ('finalized', 'paid') AND p.period_start < s.ends_at AND p.period_end > s.starts_at)))`,
    ).bind(persistedStatus, actor.email, now, id, actor.storeId, decision),
    auditStatement(db, actor.email, "request", id, `request.${decision}`, {}, now, true, commandId),
    db.prepare(
      `UPDATE shifts SET approved_leave_request_id = ?, revision = revision + 1
       WHERE id = (SELECT shift_id FROM requests WHERE id = ? AND type = 'leave') AND ? = 'approved'
       AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(id, id, decision, commandId),
    db.prepare(
      `INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
       SELECT ?, employee_email, 'request_decision',
         CASE
           WHEN ? = 'rejected' THEN 'Đã từ chối: ' || title
           WHEN type = 'swap' THEN 'Đã duyệt (chờ áp dụng đổi ca): ' || title
           WHEN type = 'correction' THEN 'Đã duyệt nguyên tắc (chờ điều chỉnh công): ' || title
           ELSE 'Đã duyệt: ' || title
         END,
         '/app/requests', ?
       FROM requests WHERE id = ? AND store_id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(crypto.randomUUID(), decision, now, id, actor.storeId, commandId),
  ]);
  if (!results[0].meta.changes) throw new ApplicationError("Yêu cầu không còn chờ duyệt, ca đã thay đổi hoặc kỳ lương đã khóa.", 409, "request_conflict");

  const coverageWarning = results[2].meta.changes > 0
    ? "Ca đã đánh dấu nghỉ được duyệt. Quản lý cần bố trí người thay; hệ thống chưa tự xếp người."
    : decision === "approved" && targetRequest.type === "swap"
      ? "Đề nghị đổi ca đã được duyệt. Quản lý cần chọn ca đối ứng và bấm Áp dụng đổi ca trước khi chốt lương."
      : decision === "approved" && targetRequest.type === "correction"
        ? "Đề nghị sửa chấm công đã duyệt nguyên tắc. Quản lý cần chủ động điều chỉnh giờ công trong mục Chấm công."
        : null;

  return {
    updated: true,
    status: persistedStatus,
    coverageWarning,
    guidance: coverageWarning,
    requiresManualAction: decision === "approved" && (targetRequest.type === "swap" || targetRequest.type === "correction"),
  };
}

async function applyCorrectionRequest(
  db: D1Database,
  actor: AccessActor,
  request: {
    id: string;
    employee_email: string;
    reason: string;
    correction_event_id: string | null;
    correction_session_id: string | null;
    correction_action: "check_in" | "check_out" | null;
    correction_effective_time: string | null;
    correction_expected_revision: number | null;
  },
  now: string,
) {
  if (!request.correction_session_id || !request.correction_action || !request.correction_effective_time || request.correction_expected_revision === null) {
    throw new ApplicationError("Yêu cầu sửa công cũ chưa có giờ đề nghị và revision. Nhân viên cần rút yêu cầu và gửi lại bằng biểu mẫu mới.", 409, "correction_details_required");
  }
  const effectiveTime = attendanceTime(request.correction_effective_time);
  const session = await db.prepare(
    `SELECT s.id, s.opened_at, s.closed_at, s.revision
     FROM attendance_sessions s
     LEFT JOIN attendance_events e ON e.id = ? AND e.session_id = s.id
     WHERE s.id = ? AND s.store_id = ? AND lower(s.employee_email) = lower(?)
       AND (? IS NULL OR (e.id IS NOT NULL AND e.action = ?))`,
  ).bind(request.correction_event_id, request.correction_session_id, actor.storeId, request.employee_email, request.correction_event_id, request.correction_action).first<{
    id: string;
    opened_at: string | null;
    closed_at: string | null;
    revision: number;
  }>();
  if (!session) throw new ApplicationError("Không tìm thấy sự kiện chấm công thuộc yêu cầu.", 404, "not_found");
  if (session.revision !== request.correction_expected_revision) throw new ApplicationError("Phiên chấm công đã thay đổi sau khi gửi yêu cầu. Cần đối soát và gửi lại.", 409, "attendance_conflict");

  const openedAt = request.correction_action === "check_in" ? effectiveTime : session.opened_at;
  const closedAt = request.correction_action === "check_out" ? effectiveTime : session.closed_at;
  if (openedAt && closedAt && (Date.parse(closedAt) <= Date.parse(openedAt) || Date.parse(closedAt) - Date.parse(openedAt) > 24 * 60 * 60_000)) {
    throw new ApplicationError("Giờ ra phải sau giờ vào và ca không được dài quá 24 giờ.");
  }
  const workedMinutes = openedAt && closedAt ? Math.floor((Date.parse(closedAt) - Date.parse(openedAt)) / 60_000) : null;
  const previousTime = request.correction_action === "check_in" ? session.opened_at : session.closed_at;
  const affectedTimes = [session.opened_at, session.closed_at, openedAt, closedAt].filter((value): value is string => Boolean(value)).sort();
  const affectedStart = affectedTimes[0];
  const affectedEnd = affectedTimes.at(-1)!;
  const correctionId = crypto.randomUUID();
  const commandId = crypto.randomUUID();

  const results = await db.batch([
    db.prepare(
      `UPDATE attendance_sessions SET opened_at = ?, closed_at = ?, worked_minutes = ?, revision = revision + 1,
       status = CASE WHEN EXISTS (
         SELECT 1 FROM attendance_events ev LEFT JOIN attendance_exceptions x ON x.event_id = ev.id
         WHERE ev.session_id = attendance_sessions.id AND (
           ev.review_required = 1 OR x.status = 'rejected' OR
           (x.status = 'pending' AND x.employee_reason NOT LIKE 'MISSING_CHECKOUT:%')
         )
       ) THEN 'review_required' WHEN ? IS NOT NULL AND ? IS NOT NULL THEN 'completed' ELSE 'open' END
       WHERE id = ? AND store_id = ? AND revision = ?
       AND NOT EXISTS (SELECT 1 FROM attendance_sessions other
         WHERE other.id <> attendance_sessions.id AND other.store_id = attendance_sessions.store_id
           AND lower(other.employee_email) = lower(attendance_sessions.employee_email)
           AND COALESCE(other.opened_at, other.closed_at) < COALESCE(?, '9999-12-31T23:59:59.999Z')
           AND COALESCE(other.closed_at, '9999-12-31T23:59:59.999Z') > COALESCE(?, ?))
       AND NOT EXISTS (SELECT 1 FROM payroll_periods WHERE store_id = ? AND status IN ('finalized', 'paid') AND period_start <= ? AND period_end > ?)`,
    ).bind(openedAt, closedAt, workedMinutes, openedAt, closedAt, session.id, actor.storeId, session.revision, closedAt, openedAt, closedAt, actor.storeId, affectedEnd, affectedStart),
    db.prepare(
      `INSERT INTO attendance_corrections
       (id, session_id, event_id, action, previous_time, effective_time, reason, actor_email, source_request_id, revision, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(correctionId, session.id, request.correction_event_id, request.correction_action, previousTime, effectiveTime, request.reason, actor.email, request.id, session.revision + 1, now),
    db.prepare(
      `UPDATE attendance_exceptions SET status = 'approved', reviewer_email = ?,
       reviewer_note = 'Đã xử lý bằng yêu cầu sửa công có cấu trúc.', reviewed_at = ?
       WHERE status = 'pending' AND employee_reason LIKE 'MISSING_CHECKOUT:%'
         AND event_id IN (SELECT id FROM attendance_events WHERE session_id = ?)
         AND EXISTS (SELECT 1 FROM attendance_corrections WHERE source_request_id = ?)`,
    ).bind(actor.email, now, session.id, request.id),
    db.prepare(
      `UPDATE requests SET status = 'applied', reviewer_email = ?, reviewed_at = ?
       WHERE id = ? AND store_id = ? AND status = 'pending'
         AND EXISTS (SELECT 1 FROM attendance_corrections WHERE source_request_id = ?)`,
    ).bind(actor.email, now, request.id, actor.storeId, request.id),
    auditStatement(db, actor.email, "request", request.id, "request.correction_applied", {
      correctionId,
      sessionId: session.id,
      eventId: request.correction_event_id,
      action: request.correction_action,
      previousTime,
      effectiveTime,
      revision: session.revision + 1,
    }, now, true, commandId),
    db.prepare(
      `INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at)
       SELECT ?, ?, 'request_decision', 'Yêu cầu sửa công đã được duyệt và áp dụng', '/app/requests', ?
       WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(crypto.randomUUID(), request.employee_email, now, commandId),
  ]);
  if (!results[0].meta.changes || !results[1].meta.changes || !results[3].meta.changes) {
    throw new ApplicationError("Phiên công trùng phiên khác, kỳ lương đã khóa hoặc dữ liệu vừa thay đổi. Hãy tải lại để đối soát.", 409, "attendance_conflict");
  }
  return {
    updated: true,
    status: "applied",
    requiresManualAction: false,
    guidance: "Đã duyệt và áp dụng giờ công. Sự kiện gốc vẫn được giữ nguyên; correction mới đã được ghi append-only.",
    correctionId,
    revision: session.revision + 1,
  };
}
