import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { correctAttendance } from "@/modules/attendance/application/correct-attendance";
import { reviewAttendance } from "@/modules/attendance/application/review-attendance";
import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";

export async function GET(request: Request) {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const url = new URL(request.url);
  const historyFor = url.searchParams.get("historyFor");

  if (historyFor) {
    const historyLogs = await db.prepare(
      `SELECT id, actor_email, action, metadata, created_at
       FROM audit_events
       WHERE entity_type = 'attendance_event' AND entity_id IN (?, (SELECT session_id FROM attendance_events WHERE id = ?))
         AND EXISTS (SELECT 1 FROM attendance_events e JOIN attendance_sessions s ON s.id = e.session_id WHERE e.id = ? AND s.store_id = ?)
       ORDER BY created_at DESC LIMIT 20`,
    ).bind(historyFor, historyFor, historyFor, auth.actor.storeId).all<{
      id: string;
      actor_email: string;
      action: string;
      metadata: string | null;
      created_at: string;
    }>();
    return Response.json({
      history: historyLogs.results.map((log) => ({
        id: log.id,
        actorEmail: log.actor_email,
        action: log.action,
        metadata: safeJsonObject(log.metadata),
        createdAt: log.created_at,
      })),
    });
  }

  const result = await db.prepare(
    `SELECT e.id, e.employee_email, e.action, e.recorded_at, e.verification_results, e.photo_status,
            e.review_required, s.id AS session_id, s.revision,
             CASE WHEN e.action = 'check_in' THEN s.opened_at ELSE s.closed_at END AS effective_at, x.status AS exception_status, x.employee_reason,
            x.reviewer_note, emp.display_name,
            l.latitude, l.longitude, l.accuracy_meters, l.distance_from_store_meters,
            CASE WHEN p.event_id IS NULL THEN 0 ELSE 1 END AS photo_present
     FROM attendance_events e
     JOIN attendance_sessions s ON s.id = e.session_id
     LEFT JOIN employees emp ON lower(emp.email) = lower(e.employee_email)
     LEFT JOIN attendance_exceptions x ON x.event_id = e.id
     LEFT JOIN attendance_locations l ON l.event_id = e.id AND l.deleted_at IS NULL AND datetime(l.expires_at) > datetime('now')
     LEFT JOIN attendance_photos p ON p.event_id = e.id AND p.deleted_at IS NULL AND datetime(p.expires_at) > datetime('now')
     WHERE s.store_id = ?
     ORDER BY e.recorded_at DESC LIMIT 60`,
  ).bind(auth.actor.storeId).all<{
    id: string;
    employee_email: string;
    action: "check_in" | "check_out";
    recorded_at: string;
    effective_at: string;
    session_id: string;
    revision: number;
    verification_results: string;
    photo_status: string;
    review_required: number;
    exception_status: string | null;
    employee_reason: string | null;
    reviewer_note: string | null;
    display_name: string | null;
    latitude: number | null;
    longitude: number | null;
    accuracy_meters: number | null;
    distance_from_store_meters: number | null;
    photo_present: number;
  }>();

  return Response.json({
    events: result.results.map((row) => ({
      id: row.id,
      employeeEmail: row.employee_email,
      employeeName: row.display_name ?? "Nhân viên",
      action: row.action,
      recordedAt: row.effective_at,
      originalRecordedAt: row.recorded_at,
      sessionId: row.session_id,
      revision: row.revision,
      verification: safeJsonArray(row.verification_results),
      photoStatus: row.photo_status,
      photoPresent: Boolean(row.photo_present) && auth.actor.role !== "team_lead",
      reviewRequired: Boolean(row.review_required),
      exceptionStatus: row.exception_status,
      employeeReason: row.employee_reason,
      reviewerNote: row.reviewer_note,
      location: row.latitude === null ? null : {
        latitude: row.latitude,
        longitude: row.longitude,
        accuracy: row.accuracy_meters,
        distance: row.distance_from_store_meters,
      },
    })),
    actorEmail: auth.actor.email,
  });
}

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { eventId: "string", sessionId: "string", action: "string", attendanceAction: "string", adjustedTime: "string", reason: "string", decision: "string", reviewerNote: "string", expectedRevision: "number" });
  const db = await ensureDatabase();
  if (body.action === "adjust_time") {
    return Response.json(await correctAttendance(db, auth.actor, {
      eventId: body.eventId as string | undefined,
      sessionId: body.sessionId as string | undefined,
      action: body.attendanceAction as "check_in" | "check_out" | undefined,
      adjustedTime: body.adjustedTime,
      reason: body.reason,
      expectedRevision: body.expectedRevision as number | undefined,
    }));
  }
  if (typeof body.eventId !== "string" || !body.eventId || (body.decision !== "approved" && body.decision !== "rejected")) {
    return Response.json({ error: "Sự kiện hoặc quyết định duyệt không hợp lệ." }, { status: 400 });
  }
  return Response.json(await reviewAttendance(db, auth.actor, body.eventId, body.decision, body.reviewerNote as string | undefined));
});

function safeJsonObject(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
