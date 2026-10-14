import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { createShifts, changeShift } from "../modules/operations/application/manage-shifts.ts";
import { changeOrderStatus } from "../modules/ordering/application/change-status.ts";
import { rejectCrossOriginMutation } from "../platform/http/request-origin.ts";
import { ApplicationError } from "../platform/http/errors.ts";

// =============================================================================
// TEST SUITE: ADVERSARIAL P2 & P3 REMEDIATION VERIFICATION
// Covers: API-004, API-006, API-007, API-010, MOB-009
// =============================================================================

test("API-006: Team Lead cannot create, edit, or cancel shifts of Manager or Owner", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  const storeId = "store-shifts-test";
  seedStore(db, storeId);

  const owner = seedEmployee(db, { id: "owner-1", storeId, role: "owner" });
  const manager = seedEmployee(db, { id: "mgr-1", storeId, role: "manager" });
  const lead = seedEmployee(db, { id: "lead-1", storeId, role: "team_lead" });
  const staff = seedEmployee(db, { id: "staff-1", storeId, role: "employee" });

  const shiftInput = {
    startsAt: "2027-08-01T08:00:00+07:00",
    endsAt: "2027-08-01T16:00:00+07:00",
    roleLabel: "Pha chế",
  };

  // 1. Team Lead attempting to create a shift for Manager -> 403 forbidden
  await assert.rejects(
    createShifts(db, lead, manager.email, [shiftInput]),
    (err) => err instanceof ApplicationError && err.status === 403 && err.code === "forbidden",
    "Team lead cannot create shift for Manager",
  );

  // 2. Team Lead attempting to create a shift for Owner -> 403 forbidden
  await assert.rejects(
    createShifts(db, lead, owner.email, [shiftInput]),
    (err) => err instanceof ApplicationError && err.status === 403 && err.code === "forbidden",
    "Team lead cannot create shift for Owner",
  );

  // 3. Team Lead CAN create shift for staff
  const staffShifts = await createShifts(db, lead, staff.email, [shiftInput]);
  assert.equal(staffShifts.shifts.length, 1);
  const staffShiftId = staffShifts.shifts[0].id;

  // 4. Owner creates a shift for Manager
  const managerShifts = await createShifts(db, owner, manager.email, [shiftInput]);
  const managerShiftId = managerShifts.shifts[0].id;

  // 5. Team Lead attempting to edit Manager's shift -> 403 forbidden
  await assert.rejects(
    changeShift(db, lead, {
      id: managerShiftId,
      action: "edit",
      expectedRevision: 0,
      startsAt: "2027-08-01T08:00:00+07:00",
      endsAt: "2027-08-01T17:00:00+07:00",
    }),
    (err) => err instanceof ApplicationError && err.status === 403 && err.code === "forbidden",
    "Team lead cannot edit Manager's shift",
  );

  // 6. Team Lead attempting to cancel Manager's shift -> 403 forbidden
  await assert.rejects(
    changeShift(db, lead, {
      id: managerShiftId,
      action: "cancel",
      expectedRevision: 0,
    }),
    (err) => err instanceof ApplicationError && err.status === 403 && err.code === "forbidden",
    "Team lead cannot cancel Manager's shift",
  );

  // 7. Team Lead CAN edit Staff's shift
  const editResult = await changeShift(db, lead, {
    id: staffShiftId,
    action: "edit",
    expectedRevision: 0,
    startsAt: "2027-08-01T08:00:00+07:00",
    endsAt: "2027-08-01T17:00:00+07:00",
  });
  assert.equal(editResult.updated, true);
});

test("API-007: Order state machine permits cancelling a ready order with reason", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  const storeId = "store-order-test";
  seedStore(db, storeId);
  const owner = seedEmployee(db, { id: "owner-1", storeId, role: "owner" });

  const orderId = "order-ready-1";
  const now = new Date().toISOString();
  db.sqlite.prepare(`
    INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, receipt_token_hash, created_at, updated_at)
    VALUES (?, ?, 'ORD-999', 'Khách VIP', '0901234567', 50000, 1, 'ready', 'hash-123', ?, ?)
  `).run(orderId, storeId, now, now);

  // Cancelling ready order without reason must fail (validation requires reason length >= 3)
  await assert.rejects(
    changeOrderStatus(db, owner, orderId, {
      expectedStatus: "ready",
      newStatus: "cancelled",
      cancelReason: "",
    }),
    (err) => err instanceof ApplicationError && err.status === 400,
    "Cancelling without reason fails validation",
  );

  // Cancelling ready order with reason succeeds
  const cancelResult = await changeOrderStatus(db, owner, orderId, {
    expectedStatus: "ready",
    newStatus: "cancelled",
    cancelReason: "Khách bận không đến lấy đồ uống",
  });
  assert.equal(cancelResult.success, true);
  assert.equal(cancelResult.fromStatus, "ready");
  assert.equal(cancelResult.toStatus, "cancelled");

  // Verify status in DB
  const row = db.sqlite.prepare("SELECT status, cancel_reason FROM customer_orders WHERE id = ?").get(orderId);
  assert.equal(row.status, "cancelled");
  assert.equal(row.cancel_reason, "Khách bận không đến lấy đồ uống");
});

test("API-010: rejectCrossOriginMutation uses Referer origin fallback when Origin header is omitted", async () => {
  const request = (path, headers = {}, method = "POST") =>
    new Request(`http://127.0.0.1:4173${path}`, { method, headers });

  // 1. Missing Origin and missing Referer -> 403
  assert.equal(rejectCrossOriginMutation(request("/api/team"))?.status, 403);

  // 2. Missing Origin but same-origin Referer -> passes (returns null)
  assert.equal(
    rejectCrossOriginMutation(request("/api/team", { referer: "http://127.0.0.1:4173/app/team" })),
    null,
  );

  // 3. Missing Origin but cross-origin Referer -> 403
  assert.equal(
    rejectCrossOriginMutation(request("/api/team", { referer: "https://evil-attacker.com/exploit" }))?.status,
    403,
  );

  // 4. Missing Origin with malformed Referer -> 403
  assert.equal(
    rejectCrossOriginMutation(request("/api/team", { referer: "not-a-valid-url" }))?.status,
    403,
  );
});

test("API-004: Owner orders route handler supports pagination parameters", async () => {
  const routeSource = await readFile("app/api/owner/orders/route.ts", "utf-8");
  assert.match(routeSource, /pageParam/);
  assert.match(routeSource, /limitParam/);
  assert.match(routeSource, /LIMIT \? OFFSET \?/);
  assert.match(routeSource, /pagination:\s*\{/);
});

test("MOB-009: app/globals.css includes WCAG-compliant prefers-reduced-motion reset", async () => {
  const css = await readFile("app/globals.css", "utf-8");
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
});
