import { ensureDatabase } from "@/db/runtime";
import { isCoordinate } from "@/lib/attendance";
import { auditStatement, requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const store = await db.prepare(
    `SELECT id, name, address, timezone, latitude, longitude,
            COALESCE(geofence_radius_meters, 100) AS geofence_radius_meters, attendance_enabled
     FROM stores WHERE id = ?`,
  ).bind(auth.actor.storeId).first();
  const rules = await db.prepare(
    `SELECT version, early_checkin_minutes, late_minutes, early_departure_minutes,
            absence_minutes, missing_checkout_minutes, evidence_retention_days
     FROM attendance_rules WHERE store_id = ? AND active = 1
     ORDER BY version DESC LIMIT 1`,
  ).bind(auth.actor.storeId).first();
  return Response.json({ store, rules });
}

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request);
  const name = cleanString(body.name, 80);
  const address = cleanString(body.address, 180);
  const latitude = numberValue(body.latitude);
  const longitude = numberValue(body.longitude);
  const geofenceRadius = integerValue(body.geofenceRadiusMeters, 10, 1000) ?? 100;
  const timezone = body.timezone === "Asia/Ho_Chi_Minh" ? body.timezone : "Asia/Ho_Chi_Minh";
  const earlyCheckin = integerValue(body.earlyCheckinMinutes, 0, 180);
  const late = integerValue(body.lateMinutes, 0, 180);
  const earlyDeparture = integerValue(body.earlyDepartureMinutes, 0, 240);
  const absence = integerValue(body.absenceMinutes, 1, 720);
  const missingCheckout = integerValue(body.missingCheckoutMinutes, 1, 720);
  if (
    !name || !address || !timezone ||
    !isCoordinate(latitude, -90, 90) ||
    !isCoordinate(longitude, -180, 180) ||
    earlyCheckin === null || late === null || earlyDeparture === null ||
    absence === null || missingCheckout === null
  ) {
    return Response.json({ error: "Thông tin cửa hàng hoặc ngưỡng chấm công không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const current = await db.prepare(
    "SELECT COALESCE(MAX(version), 0) AS version FROM attendance_rules WHERE store_id = ?",
  ).bind(auth.actor.storeId).first<{ version: number }>();
  const version = (current?.version ?? 0) + 1;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE stores SET name = ?, address = ?, timezone = ?, latitude = ?,
        longitude = ?, geofence_radius_meters = ?, attendance_enabled = 1, updated_at = ? WHERE id = ?`,
    ).bind(name, address, timezone, latitude, longitude, geofenceRadius, now, auth.actor.storeId),
    db.prepare("UPDATE attendance_rules SET active = 0 WHERE store_id = ?")
      .bind(auth.actor.storeId),
    db.prepare(
      `INSERT INTO attendance_rules
        (id, store_id, version, early_checkin_minutes, late_minutes,
         early_departure_minutes, absence_minutes, missing_checkout_minutes,
         evidence_retention_days, active, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 90, 1, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      auth.actor.storeId,
      version,
      earlyCheckin,
      late,
      earlyDeparture,
      absence,
      missingCheckout,
      auth.actor.email,
      now,
    ),
    auditStatement(
      db,
      auth.actor.email,
      "store",
      auth.actor.storeId,
      "store.settings_updated",
      { ruleVersion: version, attendanceEnabled: true },
      now,
    ),
  ]);
  return Response.json({ updated: true, ruleVersion: version });
});

function cleanString(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length >= 2 ? value.trim().slice(0, max) : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: unknown, min: number, max: number) {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
