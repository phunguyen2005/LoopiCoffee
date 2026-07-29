import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const result = await db.prepare(
    `SELECT e.id, e.action, e.recorded_at, e.verification_results, e.photo_status,
            e.review_required, x.status AS exception_status, x.employee_reason,
            x.reviewer_note, emp.display_name,
            l.latitude, l.longitude, l.accuracy_meters, l.distance_from_store_meters,
            CASE WHEN p.event_id IS NULL THEN 0 ELSE 1 END AS photo_present
     FROM attendance_events e
     JOIN attendance_sessions s ON s.id = e.session_id
     LEFT JOIN employees emp ON lower(emp.email) = lower(e.employee_email)
     LEFT JOIN attendance_exceptions x ON x.event_id = e.id
     LEFT JOIN attendance_locations l ON l.event_id = e.id AND l.deleted_at IS NULL
     LEFT JOIN attendance_photos p ON p.event_id = e.id AND p.deleted_at IS NULL
     WHERE s.store_id = ?
     ORDER BY e.recorded_at DESC LIMIT 60`,
  ).bind(auth.actor.storeId).all<{
    id: string;
    action: "check_in" | "check_out";
    recorded_at: string;
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
      employeeName: row.display_name ?? "Nhân viên",
      action: row.action,
      recordedAt: row.recorded_at,
      verification: safeJsonArray(row.verification_results),
      photoStatus: row.photo_status,
      photoPresent: Boolean(row.photo_present),
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
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    eventId?: string;
    decision?: "approved" | "rejected";
    reviewerNote?: string;
  };
  if (!body.eventId || (body.decision !== "approved" && body.decision !== "rejected")) {
    return Response.json({ error: "Quyết định duyệt không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const event = await db.prepare(
    `SELECT e.id, e.session_id, s.closed_at
     FROM attendance_events e
     JOIN attendance_sessions s ON s.id = e.session_id
     WHERE e.id = ? AND s.store_id = ?`,
  ).bind(body.eventId, auth.actor.storeId).first<{
    id: string;
    session_id: string;
    closed_at: string | null;
  }>();
  if (!event) return Response.json({ error: "Không tìm thấy sự kiện chấm công." }, { status: 404 });

  const now = new Date().toISOString();
  const statements = [
    db.prepare(
      `UPDATE attendance_exceptions
       SET status = ?, reviewer_email = ?, reviewer_note = ?, reviewed_at = ?
       WHERE event_id = ?`,
    ).bind(body.decision, auth.actor.email, body.reviewerNote?.trim().slice(0, 500) ?? null, now, event.id),
    auditStatement(
      db,
      auth.actor.email,
      "attendance_event",
      event.id,
      `attendance.review_${body.decision}`,
      { hasReviewerNote: Boolean(body.reviewerNote?.trim()) },
      now,
    ),
  ];
  if (body.decision === "approved") {
    statements.push(
      db.prepare("UPDATE attendance_events SET review_required = 0 WHERE id = ?").bind(event.id),
      db.prepare("UPDATE attendance_sessions SET status = ? WHERE id = ?")
        .bind(event.closed_at ? "completed" : "open", event.session_id),
    );
  }
  await db.batch(statements);
  return Response.json({ updated: true, eventId: event.id, status: body.decision });
}

function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
