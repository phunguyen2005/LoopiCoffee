import { auditStatement } from "../../../server/audit.ts";

export type AttendanceReplay = {
  id: string;
  session_id: string;
  recorded_at: string;
  verification_results: string;
  review_required: number;
  photo_status: string;
};

export async function recoverAttendanceWrite(
  db: D1Database,
  evidence: Pick<R2Bucket, "delete"> | undefined,
  input: {
    idempotencyKey: string;
    employeeEmail: string;
    objectKey: string | null;
    eventId: string;
    storeId: string;
    recordedAt: string;
  },
) {
  const replay = await db.prepare(
    `SELECT id, session_id, recorded_at, verification_results, review_required, photo_status
     FROM attendance_events WHERE idempotency_key = ? AND employee_email = ?`,
  ).bind(input.idempotencyKey, input.employeeEmail).first<AttendanceReplay>();
  if (replay || !input.objectKey) return replay;

  try {
    if (!evidence) throw new Error("Evidence storage is unavailable.");
    await evidence.delete(input.objectKey);
  } catch {
    await scheduleEvidenceCleanup(db, {
      objectKey: input.objectKey,
      eventId: input.eventId,
      storeId: input.storeId,
      actorEmail: input.employeeEmail,
      createdAt: input.recordedAt,
    });
  }
  return null;
}

export async function scheduleEvidenceCleanup(
  db: D1Database,
  input: { objectKey: string; eventId: string; storeId: string; actorEmail: string; createdAt?: string },
) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const pendingAuditId = crypto.randomUUID();
  await auditStatement(
    db,
    input.actorEmail,
    "attendance_event",
    input.eventId,
    "attendance.evidence_cleanup_pending",
    { objectKey: input.objectKey },
    createdAt,
    false,
    pendingAuditId,
    input.storeId,
  ).run();
  return pendingAuditId;
}

export async function processPendingEvidenceCleanup(
  db: D1Database,
  evidence: Pick<R2Bucket, "delete"> | undefined,
  now = new Date().toISOString(),
) {
  const pending = await db.prepare(
    `SELECT p.id, p.store_id, p.entity_id, p.metadata
     FROM audit_events p
     WHERE p.action = 'attendance.evidence_cleanup_pending'
       AND NOT EXISTS (
         SELECT 1 FROM audit_events r
         WHERE r.action = 'attendance.evidence_cleanup_resolved'
           AND json_extract(r.metadata, '$.pendingAuditId') = p.id
       )
     ORDER BY p.created_at
     LIMIT 100`,
  ).all<{ id: string; store_id: string | null; entity_id: string; metadata: string | null }>();

  let deleted = 0;
  let failures = 0;
  for (const task of pending.results) {
    let objectKey: string | null = null;
    try {
      const metadata = JSON.parse(task.metadata ?? "{}");
      if (typeof metadata.objectKey === "string" && metadata.objectKey.includes("/attendance/")) {
        objectKey = metadata.objectKey;
      }
    } catch {
      objectKey = null;
    }
    if (!objectKey || !evidence) {
      failures += 1;
      continue;
    }
    try {
      await evidence.delete(objectKey);
      await auditStatement(
        db,
        "system",
        "attendance_event",
        task.entity_id,
        "attendance.evidence_cleanup_resolved",
        { pendingAuditId: task.id },
        now,
        false,
        crypto.randomUUID(),
        task.store_id,
      ).run();
      deleted += 1;
    } catch {
      failures += 1;
    }
  }
  return { deleted, failures };
}
