import test from "node:test";
import assert from "node:assert/strict";
import jpeg from "jpeg-js";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { readObject } from "../platform/http/input.ts";
import { apiHandler } from "../platform/http/errors.ts";
import {
  createServerStampedSvg,
  evidenceObjectKey,
  sha256Hex,
  validateJpegDataUrl,
} from "../lib/evidence.ts";
import { distanceInMeters, formatStoreTime, isCoordinate } from "../lib/attendance.ts";
import { evaluateShiftWindow } from "../modules/attendance/domain/policy.ts";
import { auditStatement } from "../server/audit.ts";

function generateValidJpegDataUrl(width = 300, height = 300, quality = 90) {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = (i * 37) % 256;
  }
  const encoded = jpeg.encode({ data: raw, width, height }, quality);
  const base64 = Buffer.from(encoded.data).toString("base64");
  return {
    rawBytes: encoded.data.length,
    dataUrl: `data:image/jpeg;base64,${base64}`,
  };
}

test("R1: readObject defaults to 64 KiB limit and rejects >64 KiB for non-attendance endpoints", async () => {
  // Payload <= 64 KiB succeeds with default options
  const normalBody = JSON.stringify({ message: "hello", value: 123 });
  const normalReq = new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: normalBody,
  });
  const normalParsed = await readObject(normalReq);
  assert.equal(normalParsed.message, "hello");

  // Payload > 64 KiB (70 KiB) fails on default readObject
  const oversized70k = JSON.stringify({ data: "x".repeat(70_000) });
  assert.ok(oversized70k.length > 65_536);
  const oversizedReq = new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: oversized70k,
  });
  await assert.rejects(readObject(oversizedReq), {
    status: 413,
    code: "body_too_large",
  });

  // Exactly 65_537 bytes fails on default readObject
  const req65537 = new Request("http://localhost/api/team", {
    method: "POST",
    body: "x".repeat(65_537),
  });
  await assert.rejects(readObject(req65537), {
    status: 413,
    code: "body_too_large",
  });
});

test("R1: valid JPEG image capture (>64 KiB up to 2 MiB) passes JSON parsing and route processing at /api/attendance/actions", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const actor = seedEmployee(db, { id: "employee-a", storeId: "store-a", role: "staff" });

  // Update store coordinates and attendance_enabled
  db.sqlite.prepare(
    "UPDATE stores SET latitude = 10.754128, longitude = 106.667540, attendance_enabled = 1 WHERE id = 'store-a'",
  ).run();

  // Seed active attendance rule
  db.sqlite.prepare(`
    INSERT INTO attendance_rules (
      id, store_id, version, early_checkin_minutes, late_minutes, early_departure_minutes,
      absence_minutes, missing_checkout_minutes, evidence_retention_days, active, created_by, created_at
    ) VALUES (
      'rule-1', 'store-a', 1, 30, 15, 15, 60, 60, 30, 1, 'owner-a@example.test', '2026-07-01T00:00:00.000Z'
    )
  `).run();

  // Create capture session with matching token
  const captureToken = "test-capture-token-secret-123";
  const nonceHash = await sha256Hex(new TextEncoder().encode(captureToken));
  db.sqlite.prepare(`
    INSERT INTO attendance_capture_sessions (
      id, employee_email, store_id, action, nonce_hash, issued_at, expires_at, used_at
    ) VALUES (
      'cap-sess-1', ?, 'store-a', 'check_in', ?, '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL
    )
  `).run(actor.email, nonceHash);

  // Stored evidence mock
  const storedObjects = new Map();
  const loaded = await loadModule("../../app/api/attendance/actions/route.ts", {
    "@/db/runtime": {
      ensureDatabase: async () => db,
      getBindings: () => ({
        evidence: {
          put: async (key, bytes, meta) => {
            storedObjects.set(key, { bytes, meta });
          },
          delete: async (key) => {
            storedObjects.delete(key);
          },
        },
      }),
    },
    "@/server/auth": {
      requireApiUser: async () => ({ actor }),
      auditStatement,
    },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
    "@/lib/evidence": {
      createServerStampedSvg,
      evidenceObjectKey,
      sha256Hex,
      validateJpegDataUrl,
    },
    "@/lib/attendance": { distanceInMeters, formatStoreTime, isCoordinate },
    "@/modules/attendance/domain/policy": { evaluateShiftWindow },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // Generate valid JPEG > 64 KiB
  const { rawBytes, dataUrl } = generateValidJpegDataUrl(300, 300, 90);
  assert.ok(rawBytes > 65_536, `Raw bytes (${rawBytes}) must be > 64 KiB`);
  assert.ok(dataUrl.length > 80_000, `Data URL length (${dataUrl.length}) must be > 80 KiB`);

  const requestBody = {
    captureSessionId: "cap-sess-1",
    captureToken,
    idempotencyKey: "idempotency-key-001",
    action: "check_in",
    photo: dataUrl,
    exceptionReason: "Chấm công đúng giờ",
    location: {
      latitude: 10.754128,
      longitude: 106.667540,
      accuracy: 10,
      timestamp: Date.now(),
    },
  };

  const payloadString = JSON.stringify(requestBody);
  assert.ok(payloadString.length > 65_536, `Payload size (${payloadString.length}) must be > 64 KiB`);

  const req = new Request("http://localhost/api/attendance/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payloadString,
  });

  const response = await route.POST(req);
  assert.equal(response.status, 200, `Expected 200 OK, got ${response.status}`);
  const result = await response.json();
  assert.ok(result.eventId, "Must return eventId");
  assert.equal(result.photoStatus, "stored", "Photo should be successfully stored");
  assert.equal(result.evidenceStored, true);
  assert.ok(storedObjects.size > 0, "Evidence bucket must contain stored object");
});

test("R1: payloads exceeding 3 MiB at /api/attendance/actions are rejected with HTTP 413 body_too_large", async (t) => {
  const actor = { id: "employee-a", storeId: "store-a", role: "staff", email: "employee-a@example.test" };
  const loaded = await loadModule("../../app/api/attendance/actions/route.ts", {
    "@/db/runtime": {
      ensureDatabase: async () => ({}),
      getBindings: () => ({}),
    },
    "@/server/auth": {
      requireApiUser: async () => ({ actor }),
      auditStatement,
    },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
    "@/lib/evidence": {
      createServerStampedSvg,
      evidenceObjectKey,
      sha256Hex,
      validateJpegDataUrl,
    },
    "@/lib/attendance": { distanceInMeters, formatStoreTime, isCoordinate },
    "@/modules/attendance/domain/policy": { evaluateShiftWindow },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // 3.2 MiB payload (> 3 MiB)
  const oversizedPhoto = "data:image/jpeg;base64," + "A".repeat(3.2 * 1024 * 1024);
  const oversizedBody = JSON.stringify({
    captureSessionId: "cap-sess-1",
    captureToken: "token-123",
    idempotencyKey: "idempotency-key-oversized",
    action: "check_in",
    photo: oversizedPhoto,
  });
  assert.ok(oversizedBody.length > 3 * 1024 * 1024, "Payload must exceed 3 MiB");

  const req = new Request("http://localhost/api/attendance/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: oversizedBody,
  });

  const res = await route.POST(req);
  assert.equal(res.status, 413);
  const json = await res.json();
  assert.equal(json.code, "body_too_large");
  assert.match(json.error, /quá lớn/i);
});

test("R1: non-JPEG photo payload at /api/attendance/actions is rejected downstream with HTTP 400 invalid_photo", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const actor = seedEmployee(db, { id: "employee-a", storeId: "store-a", role: "staff" });

  db.sqlite.prepare(
    "UPDATE stores SET latitude = 10.754128, longitude = 106.667540, attendance_enabled = 1 WHERE id = 'store-a'",
  ).run();

  db.sqlite.prepare(`
    INSERT INTO attendance_rules (
      id, store_id, version, early_checkin_minutes, late_minutes, early_departure_minutes,
      absence_minutes, missing_checkout_minutes, evidence_retention_days, active, created_by, created_at
    ) VALUES (
      'rule-1', 'store-a', 1, 30, 15, 15, 60, 60, 30, 1, 'owner-a@example.test', '2026-07-01T00:00:00.000Z'
    )
  `).run();

  const captureToken = "test-capture-token-123";
  const nonceHash = await sha256Hex(new TextEncoder().encode(captureToken));
  db.sqlite.prepare(`
    INSERT INTO attendance_capture_sessions (
      id, employee_email, store_id, action, nonce_hash, issued_at, expires_at, used_at
    ) VALUES (
      'cap-sess-png', ?, 'store-a', 'check_in', ?, '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL
    )
  `).run(actor.email, nonceHash);

  const loaded = await loadModule("../../app/api/attendance/actions/route.ts", {
    "@/db/runtime": {
      ensureDatabase: async () => db,
      getBindings: () => ({ evidence: { put: async () => {}, delete: async () => {} } }),
    },
    "@/server/auth": {
      requireApiUser: async () => ({ actor }),
      auditStatement,
    },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
    "@/lib/evidence": {
      createServerStampedSvg,
      evidenceObjectKey,
      sha256Hex,
      validateJpegDataUrl,
    },
    "@/lib/attendance": { distanceInMeters, formatStoreTime, isCoordinate },
    "@/modules/attendance/domain/policy": { evaluateShiftWindow },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // Case 1: PNG format instead of JPEG
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const reqPng = new Request("http://localhost/api/attendance/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      captureSessionId: "cap-sess-png",
      captureToken,
      idempotencyKey: "idempotency-key-png",
      action: "check_in",
      photo: pngDataUrl,
    }),
  });

  const resPng = await route.POST(reqPng);
  assert.equal(resPng.status, 400);
  const jsonPng = await resPng.json();
  assert.equal(jsonPng.code, "invalid_photo");
  assert.match(jsonPng.error, /JPEG hợp lệ/i);

  // Case 2: Corrupted base64 or invalid JPEG content
  const corruptDataUrl = "data:image/jpeg;base64,SGVsbG8gV29ybGQ=";
  const reqCorrupt = new Request("http://localhost/api/attendance/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      captureSessionId: "cap-sess-png",
      captureToken,
      idempotencyKey: "idempotency-key-corrupt",
      action: "check_in",
      photo: corruptDataUrl,
    }),
  });

  const resCorrupt = await route.POST(reqCorrupt);
  assert.equal(resCorrupt.status, 400);
  const jsonCorrupt = await resCorrupt.json();
  assert.equal(jsonCorrupt.code, "invalid_photo");
});
