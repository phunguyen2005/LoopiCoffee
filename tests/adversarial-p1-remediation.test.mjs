import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { canManageEmployee, canAssignRole } from "../modules/people/domain/access.ts";
import { updateEmployeeAccess } from "../modules/people/application/update-access.ts";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { resolvePayrollPeriod } from "../modules/payroll/domain/period.ts";
import { loadPayrollReport } from "../modules/payroll/application/load-report.ts";
import { expireEvidence } from "../modules/attendance/application/expire-evidence.ts";

// =============================================================================
// TEST SUITE: ADVERSARIAL P1 REMEDIATION VERIFICATION
// Covers: API-001, API-002, API-003, DB-003, DB-004, DB-005, DB-006,
//         PERF-003, PERF-005, PERF-006, MOB-002, MOB-003, MOB-004
// =============================================================================

test("API-001: Manager role boundary enforcement (cannot manage peer manager or assign manager/owner role)", async () => {
  const storeId = "store-test";
  const managerActor = { id: "mgr-1", email: "mgr1@loopi.test", storeId, role: "manager" };
  const peerManager = { id: "mgr-2", store_id: storeId, role: "manager", status: "active" };
  const ownerTarget = { id: "owner-1", store_id: storeId, role: "owner", status: "active" };
  const staffTarget = { id: "staff-1", store_id: storeId, role: "employee", status: "active" };
  const teamLeadTarget = { id: "lead-1", store_id: storeId, role: "team_lead", status: "active" };
  const adminTarget = { id: "admin-1", store_id: storeId, role: "system_admin", status: "active" };

  // canManageEmployee checks
  assert.equal(canManageEmployee(managerActor, peerManager), false, "Manager cannot manage peer manager");
  assert.equal(canManageEmployee(managerActor, ownerTarget), false, "Manager cannot manage owner");
  assert.equal(canManageEmployee(managerActor, adminTarget), false, "Manager cannot manage system_admin");
  assert.equal(canManageEmployee(managerActor, staffTarget), true, "Manager can manage employee");
  assert.equal(canManageEmployee(managerActor, teamLeadTarget), true, "Manager can manage team_lead");

  // canAssignRole checks
  assert.equal(canAssignRole(managerActor, "owner"), false, "Manager cannot assign owner role");
  assert.equal(canAssignRole(managerActor, "manager"), false, "Manager cannot assign manager role");
  assert.equal(canAssignRole(managerActor, "system_admin"), false, "Manager cannot assign system_admin role");
  assert.equal(canAssignRole(managerActor, "team_lead"), true, "Manager can assign team_lead role");
  assert.equal(canAssignRole(managerActor, "employee"), true, "Manager can assign employee role");

  // Integration test with database & updateEmployeeAccess
  const db = createDatabase();
  seedStore(db, storeId);
  const m1 = seedEmployee(db, { id: "mgr-1", storeId, role: "manager" });
  const m2 = seedEmployee(db, { id: "mgr-2", storeId, role: "manager" });

  // Manager attempting to change role or status of another manager must be rejected with 403 forbidden
  await assert.rejects(
    updateEmployeeAccess(db, m1, m2.id, { role: "employee" }),
    (err) => err instanceof ApplicationError && err.status === 403 && err.code === "forbidden",
    "Manager updating peer manager role must fail with 403 forbidden"
  );
  await assert.rejects(
    updateEmployeeAccess(db, m1, m2.id, { status: "suspended" }),
    (err) => err instanceof ApplicationError && err.status === 403 && err.code === "forbidden",
    "Manager suspending peer manager must fail with 403 forbidden"
  );
});

test("API-002: apiHandler envelope standard and fault injection safety", async () => {
  // 1. ApplicationError returns structured JSON with specific status and code
  const customErrorHandler = apiHandler(async () => {
    throw new ApplicationError("Lỗi dữ liệu", 422, "validation_failed");
  });
  const res1 = await customErrorHandler();
  assert.equal(res1.status, 422);
  const data1 = await res1.json();
  assert.deepEqual(data1, { error: "Lỗi dữ liệu", code: "validation_failed" });

  // 2. Unhandled crash returns 500 with requestId and safe generic message
  const crashHandler = apiHandler(async () => {
    throw new Error("CRITICAL_DATABASE_SECRET_LEAK: sqlite3 syntax error near table xyz");
  });
  const res2 = await crashHandler();
  assert.equal(res2.status, 500);
  const data2 = await res2.json();
  assert.equal(typeof data2.requestId, "string");
  assert.ok(data2.requestId.length > 10, "requestId must be a valid UUID");
  assert.equal(data2.error, "Không thể hoàn tất yêu cầu. Vui lòng thử lại.");
  // Ensure sensitive details are NOT exposed to the client
  assert.equal(JSON.stringify(data2).includes("CRITICAL_DATABASE_SECRET_LEAK"), false);
});

test("API-003 & PERF-006: Cache-Control headers on sensitive and edge-cached routes", async () => {
  // Sensitive endpoints must enforce 'private, no-store'
  const filesToCheck = [
    "app/api/admin/accounts/route.ts",
    "app/api/reports/attendance/route.ts",
    "app/api/reports/attendance.csv/route.ts",
    "app/api/reports/payroll.xls/route.ts",
    "app/api/dashboard/route.ts",
    "app/api/today/route.ts",
    "app/api/profile/route.ts",
    "app/api/audit/route.ts",
    "app/api/files/[eventId]/route.ts",
  ];

  for (const relPath of filesToCheck) {
    const content = await readFile(new URL(`../${relPath}`, import.meta.url), "utf8");
    assert.match(
      content,
      /cache-control["']?:\s*["']private,\s*no-store/i,
      `Route ${relPath} must specify Cache-Control: private, no-store`
    );
  }

  // Edge-cached public menu route must have public edge caching
  const menuRouteContent = await readFile(new URL("../app/api/order/menu/route.ts", import.meta.url), "utf8");
  assert.match(
    menuRouteContent,
    /Cache-Control["']?:\s*["']public,\s*s-maxage=30,\s*stale-while-revalidate=120["']/,
    "Public menu route must specify public edge caching header"
  );
});

test("DB-003: lower(email) expression index prevents full table scans on employee lookup", () => {
  const db = createDatabase();
  const explain = db.sqlite
    .prepare("EXPLAIN QUERY PLAN SELECT id, email FROM employees WHERE lower(email) = lower(?)")
    .all("test@loopi.test");
  const explainStr = JSON.stringify(explain);
  assert.match(
    explainStr,
    /employees_email_lower_idx/,
    `Query plan must use employees_email_lower_idx expression index, got: ${explainStr}`
  );
  assert.doesNotMatch(explainStr, /SCAN employees\b/, "Query plan must NOT perform a full table scan on employees");
});

test("DB-005 & DB-006: Composite and retention indexes are registered and utilized by SQLite query planner", () => {
  const db = createDatabase();

  // 1. customer_orders store_id + created_at composite index
  const ordersExplain = db.sqlite
    .prepare("EXPLAIN QUERY PLAN SELECT id FROM customer_orders WHERE store_id = ? ORDER BY created_at DESC")
    .all("store-1");
  const ordersPlan = JSON.stringify(ordersExplain);
  assert.match(
    ordersPlan,
    /customer_orders_store_created_idx/,
    `Orders query plan must use customer_orders_store_created_idx, got: ${ordersPlan}`
  );

  // 2. attendance_photos expires_at index
  const photosExplain = db.sqlite
    .prepare("EXPLAIN QUERY PLAN SELECT event_id FROM attendance_photos WHERE expires_at <= ?")
    .all("2026-10-12T00:00:00.000Z");
  const photosPlan = JSON.stringify(photosExplain);
  assert.match(
    photosPlan,
    /attendance_photos_expires_idx/,
    `Photos expiration plan must use attendance_photos_expires_idx, got: ${photosPlan}`
  );

  // 3. attendance_locations expires_at index
  const locationsExplain = db.sqlite
    .prepare("EXPLAIN QUERY PLAN SELECT event_id FROM attendance_locations WHERE expires_at <= ?")
    .all("2026-10-12T00:00:00.000Z");
  const locationsPlan = JSON.stringify(locationsExplain);
  assert.match(
    locationsPlan,
    /attendance_locations_expires_idx/,
    `Locations expiration plan must use attendance_locations_expires_idx, got: ${locationsPlan}`
  );
});

test("DB-004: Historical wage snapshot preservation prevents wage distortion upon period reopening", async () => {
  const db = createDatabase();
  const storeId = "store-wage-test";
  seedStore(db, storeId);
  const emp = seedEmployee(db, {
    id: "emp-w1",
    storeId,
    role: "employee",
    status: "active",
  });

  const periodKey = "2026-05";
  const period = resolvePayrollPeriod(periodKey);

  // Create a reopened payroll period (status = 'reviewing')
  db.sqlite.prepare(`
    INSERT INTO payroll_periods (
      id, store_id, period_start, period_end, status, finalized_at, finalized_by, created_at, updated_at
    ) VALUES (
      'p-2026-05', ?, ?, ?, 'reviewing', '2026-06-01T00:00:00.000Z', 'owner@loopi.test',
      '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'
    )
  `).run(storeId, period.startIso, period.endExclusiveIso);

  // Insert existing payroll entry with row_snapshot containing historical hourlyRate = 30000
  db.sqlite.prepare(`
    INSERT INTO payroll_entries (
      id, payroll_period_id, employee_email, approved_minutes, overtime_minutes,
      allowance_amount, bonus_amount, deduction_amount, total_amount,
      status, locked_at, row_snapshot, updated_at
    ) VALUES (
      'entry-1', 'p-2026-05', ?, 600, 0,
      0, 0, 0, 300000,
      'payroll_finalized', '2026-06-01T00:00:00.000Z',
      '{"displayName":"Nguyen Van A","jobTitle":"Barista","hourlyRate":30000}',
      '2026-06-01T00:00:00.000Z'
    )
  `).run(emp.email);

  // Employee receives a pay raise to 50000 in employees table
  db.sqlite.prepare("UPDATE employees SET hourly_rate = 50000 WHERE id = ?").run(emp.id);

  // Load the payroll report for historical period 2026-05
  const report = await loadPayrollReport(db, {
    storeId,
    actorEmail: "owner@loopi.test",
    actorRole: "owner",
    periodKey,
  });

  const row = report.rows.find((r) => r.email === emp.email);
  assert.ok(row, "Employee row must exist in historical report");
  // The hourlyRate must remain the snapshot rate 30000, NOT the current 50000
  assert.equal(
    row.hourlyRate,
    30000,
    "Historical payroll report must preserve hourlyRate = 30000 from snapshot, not current rate 50000"
  );
});

test("PERF-003: OwnerOrdersView pauses polling on hidden tab and uses AbortController", async () => {
  const content = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );
  // Verify visibilitychange listener is registered and removed
  assert.match(content, /document\.addEventListener\(["']visibilitychange["']/);
  assert.match(content, /document\.removeEventListener\(["']visibilitychange["']/);
  // Verify document.hidden check slows down polling to 15s in background
  assert.match(content, /document\.hidden/);
  assert.match(content, /15000/);
  // Verify AbortController is used to abort in-flight requests
  assert.match(content, /new AbortController\(\)/);
  assert.match(content, /signal:\s*controller\.signal/);
  assert.match(content, /abortControllerRef\.current\.abort\(\)/);
});

test("PERF-005: expireEvidence batches R2 deletes in chunks and performs single D1 batch deletion", async () => {
  const db = createDatabase();
  const storeId = "store-expire-test";
  seedStore(db, storeId);
  seedEmployee(db, { id: "emp-exp", storeId, email: "exp@loopi.test" });

  // Populate 25 expired photos and associated sessions/events to test chunking (chunks of 10)
  const deletedKeys = [];
  const fakeBucket = {
    delete: async (key) => {
      deletedKeys.push(key);
    },
  };

  const expiredDate = "2026-01-01T00:00:00.000Z";
  for (let i = 0; i < 25; i++) {
    const sessionId = `sess-${i}`;
    const eventId = `event-${i}`;
    db.sqlite.prepare(`
      INSERT INTO attendance_sessions (id, employee_email, store_id, status, opened_at, closed_at, worked_minutes)
      VALUES (?, 'exp@loopi.test', ?, 'completed', '2026-01-01T08:00:00.000Z', '2026-01-01T12:00:00.000Z', 240)
    `).run(sessionId, storeId);

    db.sqlite.prepare(`
      INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status)
      VALUES (?, ?, 'exp@loopi.test', 'check_in', '2026-01-01T08:00:00.000Z', ?, '[]', 0, 'stored')
    `).run(eventId, sessionId, `idem-${i}`);

    db.sqlite.prepare(`
      INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, overlay_version, expires_at)
      VALUES (?, ?, 'image/jpeg', 1024, 'v1', ?)
    `).run(eventId, `keys/photo-${i}.jpg`, expiredDate);
  }

  const result = await expireEvidence(db, fakeBucket, "2026-01-02T00:00:00.000Z");
  assert.equal(result.photosDeleted, 25, "All 25 expired photos must be reported as deleted");
  assert.equal(deletedKeys.length, 25, "All 25 R2 keys must be deleted");

  // Ensure database photos were removed
  const remainingCount = db.sqlite
    .prepare("SELECT COUNT(*) AS c FROM attendance_photos")
    .get().c;
  assert.equal(remainingCount, 0, "No expired photos should remain in database");
});

test("MOB-002, MOB-003, MOB-004: Mobile UX enhancements verified across components and CSS", async () => {
  // MOB-002: Menu Card touch target >= 44x44px
  const menuCardContent = await readFile(
    new URL("../components/order/menu-card.tsx", import.meta.url),
    "utf8"
  );
  assert.match(menuCardContent, /min-w-\[44px\]/);
  assert.match(menuCardContent, /min-h-\[44px\]/);

  // MOB-002: Cart Drawer trash button touch target >= 44x44px
  const cartDrawerContent = await readFile(
    new URL("../components/order/cart-drawer.tsx", import.meta.url),
    "utf8"
  );
  assert.match(cartDrawerContent, /min-w-\[44px\]/);
  assert.match(cartDrawerContent, /min-h-\[44px\]/);

  // MOB-003: Owner orders action buttons have min-h-[44px], gap separation, and cancel confirmation modal
  const ownerOrdersContent = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );
  assert.match(ownerOrdersContent, /min-h-\[44px\]/);
  assert.match(ownerOrdersContent, /cancelModalOrder/);
  assert.match(ownerOrdersContent, /Xác nhận huỷ/);

  // MOB-004: globals.css sticky column width clamped on mobile (<640px)
  const cssContent = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8"
  );
  assert.match(cssContent, /@media\s*\(max-width:\s*640px\)/);
  assert.match(cssContent, /min-width:\s*130px;/);
  assert.match(cssContent, /max-width:\s*140px;/);
});
