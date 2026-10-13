import assert from "node:assert/strict";
import test from "node:test";
import jpeg from "jpeg-js";
import {
  createServerStampedSvg,
  evidenceObjectKey,
  sha256Hex,
  validateJpegDataUrl,
} from "../lib/evidence.ts";
import { distanceInMeters, formatStoreTime, isCoordinate } from "../lib/attendance.ts";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { apiHandler } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";
import { evaluateShiftWindow } from "../modules/attendance/domain/policy.ts";

function structuredJpegDataUrl(width = 640, height = 480) {
  const bytes = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

function generate1280x960JpegDataUrl() {
  const width = 1280;
  const height = 960;
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 160;
    raw[i + 1] = 120;
    raw[i + 2] = 80;
    raw[i + 3] = 255;
  }
  const encoded = jpeg.encode({ data: raw, width, height }, 60);
  return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
}

test("rejects JPEG-shaped payloads that cannot be decoded", () => {
  assert.throws(
    () => validateJpegDataUrl(structuredJpegDataUrl()),
    /giải mã nội dung JPEG/i,
  );
  assert.throws(
    () => validateJpegDataUrl("data:image/jpeg;base64,SGVsbG8="),
    /không phải ảnh JPEG|không hợp lệ/i,
  );
});

test("PERF-001: JPEG dimension extraction takes <2ms CPU for 1280x960 image", () => {
  const dataUrl = generate1280x960JpegDataUrl();
  // Warm up
  for (let i = 0; i < 5; i++) {
    validateJpegDataUrl(dataUrl);
  }
  const iterations = 50;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const validated = validateJpegDataUrl(dataUrl);
    assert.equal(validated.width, 1280);
    assert.equal(validated.height, 960);
  }
  const elapsed = performance.now() - start;
  const avgMs = elapsed / iterations;
  assert.ok(
    avgMs < 2,
    `Expected average CPU time < 2ms for 1280x960 JPEG, got ${avgMs.toFixed(3)}ms (total ${elapsed.toFixed(2)}ms for ${iterations} iterations)`,
  );
});

test("rejects malformed, truncated, or zero-scan JPEGs with descriptive errors", () => {
  // Truncated mid-header (SOI followed by incomplete marker)
  const truncatedHeader = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00]);
  assert.throws(
    () => validateJpegDataUrl(`data:image/jpeg;base64,${Buffer.from(truncatedHeader).toString("base64")}`),
    /không phải ảnh JPEG|giải mã nội dung JPEG/i,
  );

  // Missing scan data between SOS and EOI
  const zeroScanBytes = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xff, 0xd9,
  ]);
  assert.throws(
    () => validateJpegDataUrl(`data:image/jpeg;base64,${Buffer.from(zeroScanBytes).toString("base64")}`),
    /giải mã nội dung JPEG/i,
  );

  // Missing SOS marker (SOF only)
  assert.throws(
    () => validateJpegDataUrl(structuredJpegDataUrl(400, 300)),
    /giải mã nội dung JPEG/i,
  );

  // Dimensions too small (< 240)
  assert.throws(
    () => validateJpegDataUrl(structuredJpegDataUrl(100, 100)),
    /giải mã nội dung JPEG|Ảnh quá nhỏ/i,
  );
});

test("rejects malformed and truncated JPEGs with HTTP 400 at attendance actions endpoint", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-test");
  const actor = seedEmployee(db, { id: "employee-test", storeId: "store-test", role: "staff" });

  db.sqlite.prepare(
    "UPDATE stores SET latitude = 10.754128, longitude = 106.667540, attendance_enabled = 1 WHERE id = 'store-test'",
  ).run();

  db.sqlite.prepare(`
    INSERT INTO attendance_rules (
      id, store_id, version, early_checkin_minutes, late_minutes, early_departure_minutes,
      absence_minutes, missing_checkout_minutes, evidence_retention_days, active, created_by, created_at
    ) VALUES (
      'rule-1', 'store-test', 1, 30, 15, 15, 60, 60, 30, 1, 'owner-test@example.test', '2026-07-01T00:00:00.000Z'
    )
  `).run();

  const captureToken = "test-capture-token-123";
  const nonceHash = await sha256Hex(new TextEncoder().encode(captureToken));
  db.sqlite.prepare(`
    INSERT INTO attendance_capture_sessions (
      id, employee_email, store_id, action, nonce_hash, issued_at, expires_at, used_at
    ) VALUES (
      'cap-sess-malformed', ?, 'store-test', 'check_in', ?, '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL
    )
  `).run(actor.email, nonceHash);

  const loaded = await loadModule("../../app/api/attendance/actions/route.ts", {
    "@/db/runtime": {
      ensureDatabase: async () => db,
      getBindings: () => ({ evidence: { put: async () => {}, delete: async () => {} } }),
    },
    "@/server/auth": {
      requireApiUser: async () => ({ actor }),
      auditStatement: () => {},
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

  const zeroScanBytes = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xff, 0xd9,
  ]);
  const zeroScanDataUrl = `data:image/jpeg;base64,${Buffer.from(zeroScanBytes).toString("base64")}`;

  const malformedPayloads = [
    structuredJpegDataUrl(),
    zeroScanDataUrl,
    "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    "data:image/jpeg;base64,SGVsbG8=",
    "data:image/jpeg;base64,/9j/2wCEAA==",
  ];

  let counter = 0;
  for (const badPhoto of malformedPayloads) {
    const sessionId = `cap-sess-${counter++}`;
    db.sqlite.prepare(`
      INSERT INTO attendance_capture_sessions (
        id, employee_email, store_id, action, nonce_hash, issued_at, expires_at, used_at
      ) VALUES (
        ?, ?, 'store-test', 'check_in', ?, '2026-07-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', NULL
      )
    `).run(sessionId, actor.email, nonceHash);

    const res = await route.POST(new Request("http://localhost/api/attendance/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        captureSessionId: sessionId,
        captureToken,
        idempotencyKey: crypto.randomUUID(),
        action: "check_in",
        photo: badPhoto,
      }),
    }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, "invalid_photo");
  }
});

test("creates a server-owned stamped image with authoritative evidence", () => {
  const photo = {
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    base64: "/9j/2Q==",
    width: 640,
    height: 480,
  };
  const stamped = createServerStampedSvg({
    photo,
    action: "check_in",
    localTime: "29/07/2026 08:05:21",
    latitude: 10.754128,
    longitude: 106.66754,
    accuracy: 18,
    distance: 24,
    eventId: "7f3a91c2-aaaa-bbbb-cccc-111111111111",
  });
  const svg = new TextDecoder().decode(stamped);
  assert.match(svg, /LoopiCafe · VÀO CA/);
  assert.match(svg, /Giờ máy chủ/);
  assert.match(svg, /10\.754128, 106\.667540/);
  assert.match(svg, /Mã sự kiện: 7F3A91C2/);
  assert.match(svg, /data:image\/jpeg;base64/);
});

test("keeps PII out of private evidence object keys", () => {
  const key = evidenceObjectKey(
    "store-loopi",
    "employee-uuid",
    "event-uuid",
    "2026-07-29T01:00:00.000Z",
  );
  assert.equal(key, "store-loopi/attendance/employee-uuid/2026/07/event-uuid.svg");
  assert.doesNotMatch(key, /@|latitude|longitude/i);
});

test("calculates evidence distance without geofence conclusions", () => {
  const distance = distanceInMeters(10.754128, 106.66754, 10.754228, 106.66754);
  assert.ok(distance > 10 && distance < 12);
});
