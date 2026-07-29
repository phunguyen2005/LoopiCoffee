import { CONSENT_VERSION, ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  return Response.json({
    consented: auth.actor.hasAttendanceConsent,
    noticeVersion: CONSENT_VERSION,
  });
}

export async function POST() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO employee_consents
        (id, employee_email, notice_version, consented_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), auth.actor.email, CONSENT_VERSION, now),
    auditStatement(
      db,
      auth.actor.email,
      "employee_consent",
      auth.actor.id,
      "employee.camera_location_consent",
      { noticeVersion: CONSENT_VERSION },
      now,
    ),
  ]);
  return Response.json({ consented: true, noticeVersion: CONSENT_VERSION, consentedAt: now });
}
