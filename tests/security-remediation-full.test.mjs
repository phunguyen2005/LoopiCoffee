import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/load-module.mjs";
import { readObject, ATTENDANCE_ACTION_MAX_BYTES } from "../platform/http/input.ts";
import { ApplicationError } from "../platform/http/errors.ts";
import { canManageEmployee, canAssignRole } from "../modules/people/domain/access.ts";
import { expireEvidence } from "../modules/attendance/application/expire-evidence.ts";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";

// -------------------------------------------------------------
// SEC-003: Server RBAC & system_admin rejection
// -------------------------------------------------------------
test("SEC-003: canManageEmployee and canAssignRole disallow system_admin privilege escalation", () => {
  const adminActor = { id: "u-admin", email: "admin@test.com", storeId: "store-a", role: "system_admin" };
  const ownerActor = { id: "u-owner", email: "owner@test.com", storeId: "store-a", role: "owner" };
  const managerActor = { id: "u-mgr", email: "mgr@test.com", storeId: "store-a", role: "manager" };

  const employee = { id: "u-emp", store_id: "store-a", role: "employee", status: "active" };
  const targetOwner = { id: "u-owner2", store_id: "store-a", role: "owner", status: "active" };

  // system_admin actor cannot manage employees in store operations
  assert.equal(canManageEmployee(adminActor, employee), false, "system_admin should not manage store employees");
  assert.equal(canManageEmployee(adminActor, targetOwner), false, "system_admin should not manage store owner");

  // owner can manage employee
  assert.equal(canManageEmployee(ownerActor, employee), true, "owner should manage store employee");

  // manager can manage employee, but not owner
  assert.equal(canManageEmployee(managerActor, employee), true, "manager can manage store employee");
  assert.equal(canManageEmployee(managerActor, targetOwner), false, "manager cannot manage store owner");

  // system_admin cannot assign roles
  assert.equal(canAssignRole(adminActor, "manager"), false, "system_admin cannot assign roles");
  assert.equal(canAssignRole(adminActor, "employee"), false, "system_admin cannot assign roles");

  // owner can assign manager and employee
  assert.equal(canAssignRole(ownerActor, "manager"), true, "owner can assign manager");
  assert.equal(canAssignRole(ownerActor, "employee"), true, "owner can assign employee");
});

// -------------------------------------------------------------
// SEC-004: Neutralize CSV formula injection
// -------------------------------------------------------------
test("SEC-004: sanitizeCsvCell neutralizes dangerous formula prefix characters", async (t) => {
  const loaded = await loadModule("../../app/api/reports/attendance.csv/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => ({}) },
    "@/lib/payroll-report": { loadPayrollReport: async () => ({ rows: [], period: { label: "", key: "" } }) },
    "@/server/auth": { requireApiUser: async () => ({ actor: null, response: null }) },
  });
  t.after(loaded.dispose);
  const { sanitizeCsvCell, escapeCsv } = loaded.module;

  // Dangerous prefixes must be neutralized with leading single quote '
  assert.equal(sanitizeCsvCell("=1+1"), "'=1+1");
  assert.equal(sanitizeCsvCell("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(sanitizeCsvCell("+84901234567"), "'+84901234567");
  assert.equal(sanitizeCsvCell("-50000"), "'-50000");
  assert.equal(sanitizeCsvCell("@SUM(A1:A10)"), "'@SUM(A1:A10)");
  assert.equal(sanitizeCsvCell("\t=formula"), "'\t=formula");
  assert.equal(sanitizeCsvCell("  =SUM(B1:B2)"), "'  =SUM(B1:B2)");

  // Benign text should not be modified
  assert.equal(sanitizeCsvCell("Nguyễn Minh Linh"), "Nguyễn Minh Linh");
  assert.equal(sanitizeCsvCell("Barista Chuyên Nghiệp"), "Barista Chuyên Nghiệp");
  assert.equal(sanitizeCsvCell("linh@loopicafe.test"), "linh@loopicafe.test");
  assert.equal(sanitizeCsvCell("08:30"), "08:30");
  assert.equal(sanitizeCsvCell(""), "");

  // escapeCsv quotes and escapes quotes RFC-4180
  assert.equal(escapeCsv("=1+1"), `"\'=1+1"`);
  assert.equal(escapeCsv(`He said "hello"`), `"He said ""hello"""`);
  assert.equal(escapeCsv(`=cmd|"calc"`), `"\'=cmd|""calc"""`);
});

// -------------------------------------------------------------
// SEC-005: Store-scoped retention cleanup audit
// -------------------------------------------------------------
test("SEC-005: expireEvidence records store_id in audit events and isolates by store", async (t) => {
  const db = createDatabase({ migrations: true });
  t.after(() => db.close());

  seedStore(db, "store-a");
  seedStore(db, "store-b");
  seedEmployee(db, { id: "emp-a", storeId: "store-a" });
  seedEmployee(db, { id: "emp-b", storeId: "store-b" });

  const now = new Date().toISOString();
  const past = new Date(Date.now() - 100 * 86_400_000).toISOString();
  const future = new Date(Date.now() + 100 * 86_400_000).toISOString();

  // Populate relational data: attendance_sessions -> attendance_events -> attendance_photos & attendance_locations
  db.sqlite.prepare(`
    INSERT INTO attendance_sessions (id, employee_email, store_id, status, opened_at)
    VALUES ('ses-a', 'emp-a@example.test', 'store-a', 'open', ?)
  `).run(past);
  db.sqlite.prepare(`
    INSERT INTO attendance_sessions (id, employee_email, store_id, status, opened_at)
    VALUES ('ses-b', 'emp-b@example.test', 'store-b', 'open', ?)
  `).run(past);

  db.sqlite.prepare(`
    INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status)
    VALUES ('evt-1', 'ses-a', 'emp-a@example.test', 'check_in', ?, 'idemp-1', '[]', 0, 'stored')
  `).run(past);
  db.sqlite.prepare(`
    INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status)
    VALUES ('evt-2', 'ses-b', 'emp-b@example.test', 'check_in', ?, 'idemp-2', '[]', 0, 'stored')
  `).run(past);
  db.sqlite.prepare(`
    INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status)
    VALUES ('evt-3', 'ses-a', 'emp-a@example.test', 'check_out', ?, 'idemp-3', '[]', 0, 'stored')
  `).run(past);

  // Expired photos for store-a and store-b
  db.sqlite.prepare(`
    INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
    VALUES ('evt-1', 'key-1', 'image/jpeg', 1000, 'hash1', '1.0', ?)
  `).run(past);
  db.sqlite.prepare(`
    INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
    VALUES ('evt-2', 'key-2', 'image/jpeg', 1000, 'hash2', '1.0', ?)
  `).run(past);
  // Unexpired photo for store-a (should be preserved)
  db.sqlite.prepare(`
    INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
    VALUES ('evt-3', 'key-3', 'image/jpeg', 1000, 'hash3', '1.0', ?)
  `).run(future);

  // Expired location for store-a
  db.sqlite.prepare(`
    INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
    VALUES ('evt-1', 10.75, 106.66, 5, ?, 10, ?)
  `).run(past, past);

  const deletedKeys = [];
  const mockEvidence = {
    async delete(key) {
      deletedKeys.push(key);
    },
  };

  const result = await expireEvidence(db, mockEvidence, now);
  assert.equal(result.photosDeleted, 2);
  assert.equal(result.locationsDeleted, 1);
  assert.equal(result.failures, 0);
  assert.deepEqual(deletedKeys.sort(), ["key-1", "key-2"]);

  // Verify that separate audit events were created in the real database for store-a and store-b
  const storeAEvents = (await db.prepare("SELECT * FROM audit_events WHERE store_id = ?").bind("store-a").all()).results;
  const storeBEvents = (await db.prepare("SELECT * FROM audit_events WHERE store_id = ?").bind("store-b").all()).results;
  const nullStoreEvents = (await db.prepare("SELECT * FROM audit_events WHERE store_id IS NULL").all()).results;

  assert.equal(storeAEvents.length, 1, "store-a must have exactly 1 retention audit event");
  assert.equal(storeAEvents[0].action, "retention.cleanup");
  const metaA = JSON.parse(storeAEvents[0].metadata);
  assert.equal(metaA.photosDeleted, 1);
  assert.equal(metaA.locationsDeleted, 1);
  assert.equal(metaA.failures, 0);

  assert.equal(storeBEvents.length, 1, "store-b must have exactly 1 retention audit event");
  assert.equal(storeBEvents[0].action, "retention.cleanup");
  const metaB = JSON.parse(storeBEvents[0].metadata);
  assert.equal(metaB.photosDeleted, 1);
  assert.equal(metaB.locationsDeleted, 0);
  assert.equal(metaB.failures, 0);

  assert.equal(nullStoreEvents.length, 0, "No audit events should have store_id = NULL");

  // Verify that expired rows were purged while unexpired rows remain in SQLite tables
  const remainingPhotos = (await db.prepare("SELECT * FROM attendance_photos").all()).results;
  const remainingLocations = (await db.prepare("SELECT * FROM attendance_locations").all()).results;
  assert.equal(remainingPhotos.length, 1);
  assert.equal(remainingPhotos[0].event_id, "evt-3");
  assert.equal(remainingLocations.length, 0);
  assert.equal(result.remaining.photos, 0);
  assert.equal(result.remaining.locations, 0);
});

// -------------------------------------------------------------
// SEC-006: Identity cache & revocation window SLA
// -------------------------------------------------------------
test("SEC-006: Identity cache adheres to 10s SLA and invalidateIdentityCache functions correctly", async (t) => {
  const loaded = await loadModule("../../server/auth.ts", {
    "@/db/runtime": { ensureDatabase: async () => ({}) },
    "@/lib/supabase/server": { createClient: async () => ({}) },
    "next/headers": { cookies: async () => ({ getAll: () => [] }) },
  });
  t.after(loaded.dispose);
  const { AUTH_REVOCATION_WINDOW_SLA_MS, invalidateIdentityCache, validatedIdentityCache } = loaded.module;

  assert.equal(AUTH_REVOCATION_WINDOW_SLA_MS, 10_000, "SLA revocation window must be 10,000ms");

  // Test invalidateIdentityCache
  validatedIdentityCache.set("fp-1", { identity: { email: "u1@test.com" }, expiresAt: Date.now() + 5000 });
  validatedIdentityCache.set("fp-2", { identity: { email: "u2@test.com" }, expiresAt: Date.now() + 5000 });

  assert.equal(validatedIdentityCache.has("fp-1"), true);
  invalidateIdentityCache("fp-1");
  assert.equal(validatedIdentityCache.has("fp-1"), false);
  assert.equal(validatedIdentityCache.has("fp-2"), true);

  // Clear all
  invalidateIdentityCache();
  assert.equal(validatedIdentityCache.size, 0);
});

// -------------------------------------------------------------
// SEC-008: Bounded JSON reader
// -------------------------------------------------------------
test("SEC-008: readObject enforces bounded limits and safe type validation", async () => {
  // 1. Content-Length header exceeding limit throws 413
  {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-length": "100000" },
      body: JSON.stringify({ test: "data" }),
    });
    await assert.rejects(
      readObject(req, {}, { maxBytes: 65_536 }),
      (err) => err instanceof ApplicationError && err.status === 413 && err.code === "body_too_large"
    );
  }

  // 2. Stream payload exceeding limit throws 413
  {
    const bigString = "A".repeat(70_000);
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ payload: bigString }),
    });
    await assert.rejects(
      readObject(req, { payload: "string" }, { maxBytes: 65_536 }),
      (err) => err instanceof ApplicationError && err.status === 413 && err.code === "body_too_large"
    );
  }

  // 3. Attendance action payload allows 1.5 MiB image
  {
    const mediumImageBase64 = "data:image/jpeg;base64," + "A".repeat(1_500_000);
    const req = new Request("http://localhost/api/attendance/actions", {
      method: "POST",
      body: JSON.stringify({ photo: mediumImageBase64 }),
    });
    const parsed = await readObject(req, { photo: "string" }, { maxBytes: ATTENDANCE_ACTION_MAX_BYTES });
    assert.equal(typeof parsed.photo, "string");
    assert.ok(parsed.photo.length > 1_000_000);
  }

  // 4. Non-object, null, array, or malformed JSON returns 400
  {
    const nullReq = new Request("http://localhost/api/test", {
      method: "POST",
      body: "null",
    });
    await assert.rejects(
      readObject(nullReq),
      (err) => err instanceof ApplicationError && err.status === 400 && err.code === "invalid_body"
    );

    const arrayReq = new Request("http://localhost/api/test", {
      method: "POST",
      body: "[]",
    });
    await assert.rejects(
      readObject(arrayReq),
      (err) => err instanceof ApplicationError && err.status === 400 && err.code === "invalid_body"
    );

    const invalidJsonReq = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{ not valid json",
    });
    await assert.rejects(
      readObject(invalidJsonReq),
      (err) => err instanceof ApplicationError && err.status === 400 && err.code === "invalid_json"
    );

    const invalidFieldReq = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ count: "not-a-number" }),
    });
    await assert.rejects(
      readObject(invalidFieldReq, { count: "number" }),
      (err) => err instanceof ApplicationError && err.status === 400 && err.code === "invalid_field"
    );
  }
});
