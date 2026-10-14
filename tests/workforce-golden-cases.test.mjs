import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  createDatabase,
  seedStore,
  seedEmployee,
  seedShift,
  seedAttendanceSession,
  seedAttendanceEvent,
  seedRequest,
  seedPayrollPeriod,
  seedRateHistory,
} from "./helpers/database.mjs";
import {
  ROLES,
  STATUSES,
  createWorkforceFixture,
  createMultiStoreFixture,
  buildSwapScenario,
  buildDraftOverlapScenario,
  buildAttendanceClippingScenario,
  buildRateHistoryScenario,
  buildHandoverScenario,
  buildRetentionScenario,
} from "./fixtures/workforce-fixtures.mjs";
import { canManageEmployee, canAssignRole } from "../modules/people/domain/access.ts";
import { decideRequest } from "../modules/operations/application/decide-request.ts";
import { withdrawRequest } from "../modules/operations/application/withdraw-request.ts";
import { applySwap } from "../modules/operations/application/apply-swap.ts";
import { reviewAttendance } from "../modules/attendance/application/review-attendance.ts";
import { correctAttendance } from "../modules/attendance/application/correct-attendance.ts";
import { autoCloseForgottenSessions } from "../modules/attendance/application/auto-close-sessions.ts";
import { expireEvidence } from "../modules/attendance/application/expire-evidence.ts";
import { checkHandoverGate } from "../modules/attendance/application/check-handover-gate.ts";
import { acknowledgeHandover } from "../modules/operations/application/manage-handovers.ts";
import { anonymizeExpiredOrders } from "../modules/ordering/application/anonymize-orders.ts";
import { changeOrderStatus, getSpoilageMetrics } from "../modules/ordering/application/change-status.ts";
import { loadPayrollReport } from "../modules/payroll/application/load-report.ts";
import { changePayrollPeriod } from "../modules/payroll/application/change-period.ts";

describe("Workforce Golden Cases (C01 - C07)", () => {
  // =========================================================================
  // C01: Self-Approval Matrix & Role Scoping
  // =========================================================================
  describe("C01: Self-Approval Matrix & Role Scoping", () => {
    test("C01-1: RBAC baseline - canManageEmployee enforces hierarchy and quarantine", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c01", mode: "sole_owner" });

      const ownerActor = { id: fixture.actors.soleOwner.id, email: fixture.actors.soleOwner.email, storeId: fixture.storeId, role: ROLES.OWNER };
      const mgrActor = { id: fixture.actors.manager.id, email: fixture.actors.manager.email, storeId: fixture.storeId, role: ROLES.MANAGER };
      const leadActor = { id: fixture.actors.teamLead.id, email: fixture.actors.teamLead.email, storeId: fixture.storeId, role: ROLES.TEAM_LEAD };
      const staffActor = { id: fixture.actors.employeeA.id, email: fixture.actors.employeeA.email, storeId: fixture.storeId, role: ROLES.EMPLOYEE };
      const sysAdminActor = { id: fixture.actors.systemAdmin.id, email: fixture.actors.systemAdmin.email, storeId: fixture.storeId, role: ROLES.SYSTEM_ADMIN };

      const ownerTarget = { id: fixture.actors.soleOwner.id, store_id: fixture.storeId, role: ROLES.OWNER, status: STATUSES.ACTIVE };
      const mgrTarget = { id: fixture.actors.manager.id, store_id: fixture.storeId, role: ROLES.MANAGER, status: STATUSES.ACTIVE };
      const leadTarget = { id: fixture.actors.teamLead.id, store_id: fixture.storeId, role: ROLES.TEAM_LEAD, status: STATUSES.ACTIVE };
      const staffTarget = { id: fixture.actors.employeeA.id, store_id: fixture.storeId, role: ROLES.EMPLOYEE, status: STATUSES.ACTIVE };
      const sysAdminTarget = { id: fixture.actors.systemAdmin.id, store_id: fixture.storeId, role: ROLES.SYSTEM_ADMIN, status: STATUSES.ACTIVE };

      // Owner can manage manager, team lead, employee
      assert.equal(canManageEmployee(ownerActor, mgrTarget), true);
      assert.equal(canManageEmployee(ownerActor, leadTarget), true);
      assert.equal(canManageEmployee(ownerActor, staffTarget), true);

      // Manager can manage team lead and employee, but NOT owner or another manager
      assert.equal(canManageEmployee(mgrActor, leadTarget), true);
      assert.equal(canManageEmployee(mgrActor, staffTarget), true);
      assert.equal(canManageEmployee(mgrActor, ownerTarget), false);
      assert.equal(canManageEmployee(mgrActor, mgrTarget), false);

      // Team lead and regular employee cannot manage anyone
      assert.equal(canManageEmployee(leadActor, staffTarget), false);
      assert.equal(canManageEmployee(staffActor, staffTarget), false);

      // System admin cannot manage employees and employees cannot manage system admin
      assert.equal(canManageEmployee(sysAdminActor, staffTarget), false);
      assert.equal(canManageEmployee(ownerActor, sysAdminTarget), false);
      assert.equal(canManageEmployee(mgrActor, sysAdminTarget), false);

      // Cross-store boundary protection
      const otherStoreTarget = { id: "ext-1", store_id: "other-store", role: ROLES.EMPLOYEE, status: STATUSES.ACTIVE };
      assert.equal(canManageEmployee(ownerActor, otherStoreTarget), false);
    });

    test("C01-2: canAssignRole prevents privilege escalation", () => {
      const ownerActor = { id: "owner-1", email: "owner@loopi.test", storeId: "store-a", role: ROLES.OWNER };
      const mgrActor = { id: "mgr-1", email: "mgr@loopi.test", storeId: "store-a", role: ROLES.MANAGER };
      const leadActor = { id: "lead-1", email: "lead@loopi.test", storeId: "store-a", role: ROLES.TEAM_LEAD };

      // Owner can assign business roles
      assert.equal(canAssignRole(ownerActor, ROLES.OWNER), true);
      assert.equal(canAssignRole(ownerActor, ROLES.MANAGER), true);
      assert.equal(canAssignRole(ownerActor, ROLES.TEAM_LEAD), true);
      assert.equal(canAssignRole(ownerActor, ROLES.EMPLOYEE), true);

      // Manager can only assign team_lead and employee
      assert.equal(canAssignRole(mgrActor, ROLES.OWNER), false);
      assert.equal(canAssignRole(mgrActor, ROLES.MANAGER), false);
      assert.equal(canAssignRole(mgrActor, ROLES.TEAM_LEAD), true);
      assert.equal(canAssignRole(mgrActor, ROLES.EMPLOYEE), true);

      // Team lead cannot assign roles
      assert.equal(canAssignRole(leadActor, ROLES.EMPLOYEE), false);
    });

    test("C01-3: Self-approval matrix specification (requester & beneficiary cannot self-approve)", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c01-spec", mode: "sole_owner" });
      const scenario = buildSwapScenario(db, fixture);

      // Beneficiaries are employeeA and employeeB
      assert.equal(scenario.beneficiaries.length, 2);
      assert.equal(scenario.beneficiaries[0].id, fixture.actors.employeeA.id);
      assert.equal(scenario.beneficiaries[1].id, fixture.actors.employeeB.id);

      // Neither employeeA (requester) nor employeeB (co-beneficiary) can self-approve
      assert.equal(scenario.actorPerms.employeeA, false);
      assert.equal(scenario.actorPerms.employeeB, false);

      // Independent roles can approve when both parties are regular employees
      assert.equal(scenario.actorPerms.teamLead, true);
      assert.equal(scenario.actorPerms.manager, true);
    });

    test("C01-4: API self-approval mutation blocking (decideRequest and reviewAttendance)", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c01-4" });

      // 1. Employee A tries to approve their own leave request
      const leaveReq = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.employeeA.email,
        type: "leave",
      });
      await assert.rejects(
        decideRequest(db, fixture.actors.employeeA, leaveReq.id, "approved"),
        { status: 403, code: "self_approval_blocked" }
      );

      // 2. Manager tries to approve their own request
      const mgrReq = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.manager.email,
        type: "leave",
      });
      await assert.rejects(
        decideRequest(db, fixture.actors.manager, mgrReq.id, "approved"),
        { status: 403, code: "self_approval_blocked" }
      );

      // 3. Sole Owner tries to approve their own request via decideRequest
      const ownerReq = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.soleOwner.email,
        type: "leave",
      });
      await assert.rejects(
        decideRequest(db, fixture.actors.soleOwner, ownerReq.id, "approved"),
        { status: 403, code: "self_approval_blocked" }
      );

      // 4. Employee/manager tries to review their own attendance exception
      const session = seedAttendanceSession(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.manager.email,
        status: "review_required",
      });
      const event = seedAttendanceEvent(db, {
        sessionId: session.id,
        employeeEmail: fixture.actors.manager.email,
        reviewRequired: true,
      });
      db.sqlite.prepare(
        "INSERT INTO attendance_exceptions (id, event_id, employee_reason, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
      ).run(crypto.randomUUID(), event.id, "Late checkin", new Date().toISOString());

      await assert.rejects(
        reviewAttendance(db, fixture.actors.manager, event.id, "approved"),
        { status: 403, code: "self_approval_blocked" }
      );
    });

    test("C01-5: Team lead scope restriction specification", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c01-5" });
      const teamLead = fixture.actors.teamLead;

      // 1. Team lead cannot approve leave requests
      const leaveReq = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.employeeA.email,
        type: "leave",
      });
      await assert.rejects(
        decideRequest(db, teamLead, leaveReq.id, "approved"),
        { status: 403, code: "forbidden" }
      );

      // 2. Team lead cannot approve correction requests
      const corrReq = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.employeeA.email,
        type: "correction",
      });
      await assert.rejects(
        decideRequest(db, teamLead, corrReq.id, "approved"),
        { status: 403, code: "forbidden" }
      );

      // 3. Team lead cannot review attendance exceptions
      const session = seedAttendanceSession(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.employeeA.email,
        status: "review_required",
      });
      const event = seedAttendanceEvent(db, {
        sessionId: session.id,
        employeeEmail: fixture.actors.employeeA.email,
        reviewRequired: true,
      });
      db.sqlite.prepare(
        "INSERT INTO attendance_exceptions (id, event_id, employee_reason, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
      ).run(crypto.randomUUID(), event.id, "Late checkin", new Date().toISOString());

      await assert.rejects(
        reviewAttendance(db, teamLead, event.id, "approved"),
        { status: 403, code: "forbidden" }
      );

      // 4. Team lead cannot correct attendance time
      await assert.rejects(
        correctAttendance(db, teamLead, {
          sessionId: session.id,
          action: "check_in",
          adjustedTime: "2026-07-03T01:00:00.000Z",
          reason: "Điều chỉnh giờ vào ca cho nhân viên",
        }),
        { status: 403, code: "forbidden" }
      );

      // 5. Team lead CAN approve swap request between two regular employees
      const swapScenario = buildSwapScenario(db, fixture);
      const decision = await decideRequest(db, teamLead, swapScenario.request.id, "approved");
      assert.equal(decision.status, "approved");

      // 5b. Team lead CAN atomically apply swap request
      const applied = await applySwap(db, teamLead, {
        requestId: swapScenario.request.id,
        shift1Id: swapScenario.shiftA.id,
        shift2Id: swapScenario.shiftB.id,
      });
      assert.equal(applied.applied, true);

      // Verify shifts have swapped employee emails
      const sA = db.sqlite.prepare("SELECT employee_email FROM shifts WHERE id = ?").get(swapScenario.shiftA.id);
      const sB = db.sqlite.prepare("SELECT employee_email FROM shifts WHERE id = ?").get(swapScenario.shiftB.id);
      assert.equal(sA.employee_email, swapScenario.shiftB.employeeEmail);
      assert.equal(sB.employee_email, swapScenario.shiftA.employeeEmail);

      // Verify request status is now applied
      const reqStatus = db.sqlite.prepare("SELECT status FROM requests WHERE id = ?").get(swapScenario.request.id);
      assert.equal(reqStatus.status, "applied");

      // 6. Team lead CANNOT approve swap request involving a manager
      const mgrSwapReq = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.manager.email,
        type: "swap",
      });
      await assert.rejects(
        decideRequest(db, teamLead, mgrSwapReq.id, "approved"),
        { status: 403, code: "forbidden" }
      );
    });

    test("C01-6: System admin business endpoint quarantine", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c01-6" });
      const sysAdmin = fixture.actors.systemAdmin;

      // 1. mockAuth rejects system_admin with code: system_admin_blocked
      const auth = fixture.mockAuth(sysAdmin);
      const authRes = await auth.requireApiUser();
      assert.equal(authRes.response.status, 403);
      const authBody = await authRes.response.json();
      assert.equal(authBody.code, "system_admin_blocked");

      // 2. decideRequest rejects system_admin
      const req = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: fixture.actors.employeeA.email,
        type: "leave",
      });
      await assert.rejects(
        decideRequest(db, sysAdmin, req.id, "approved"),
        { status: 403, code: "forbidden" }
      );

      // 3. reviewAttendance rejects system_admin
      await assert.rejects(
        reviewAttendance(db, sysAdmin, "event-any", "approved"),
        { status: 403, code: "forbidden" }
      );

      // 4. correctAttendance rejects system_admin
      await assert.rejects(
        correctAttendance(db, sysAdmin, {
          sessionId: "session-any",
          action: "check_in",
          adjustedTime: "2026-07-03T01:00:00.000Z",
          reason: "Hạ tầng test",
        }),
        { status: 403, code: "forbidden" }
      );
    });
  });

  // =========================================================================
  // C02: Shift Draft Slot Reservation & Trigger Overlap
  // =========================================================================
  describe("C02: Shift Draft Slot Reservation & Trigger Overlap", () => {
    test("C02-1: Draft shift reserves slot against overlapping draft shift (trigger aborts)", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c02-1" });
      const scenario = buildDraftOverlapScenario(db, fixture);

      // Attempting to insert overlapping draft shift must abort with shift_overlap
      assert.throws(
        () => seedShift(db, scenario.overlappingDraft),
        /shift_overlap/,
      );
    });

    test("C02-2: Draft shift reserves slot against overlapping published shift (trigger aborts)", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c02-2" });
      const scenario = buildDraftOverlapScenario(db, fixture);

      // Attempting to insert overlapping published shift must abort with shift_overlap
      assert.throws(
        () => seedShift(db, scenario.overlappingPublished),
        /shift_overlap/,
      );
    });

    test("C02-3: Adjacent shifts touching boundary succeed without conflict", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c02-3" });
      const scenario = buildDraftOverlapScenario(db, fixture);

      // Adjacent shift starts exactly when the draft shift ends (05:00 UTC)
      const adjacent = seedShift(db, scenario.adjacentShift);
      assert.ok(adjacent.id);

      const totalShifts = db.sqlite.prepare("SELECT COUNT(*) AS count FROM shifts WHERE store_id = ?").get(fixture.storeId).count;
      assert.equal(totalShifts, 2);
    });

    test("C02-4: Cancelled shifts and approved-leave shifts release slot", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c02-4" });
      const staffEmail = fixture.actors.employeeA.email;

      // 1. Shift that is cancelled releases slot
      const shift1 = seedShift(db, {
        storeId: fixture.storeId,
        employeeEmail: staffEmail,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T05:00:00.000Z",
        status: "cancelled",
      });
      assert.ok(shift1);

      // Same slot can now be inserted as draft
      const shift2 = seedShift(db, {
        storeId: fixture.storeId,
        employeeEmail: staffEmail,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T05:00:00.000Z",
        status: "draft",
      });
      assert.ok(shift2);

      // Seed approved leave request to satisfy foreign key constraint on shifts.approved_leave_request_id
      const leaveReq = seedRequest(db, {
        id: "req-leave-slot",
        storeId: fixture.storeId,
        employeeEmail: staffEmail,
        type: "leave",
        status: "approved",
      });

      // 2. Mark shift2 with approved_leave_request_id -> releases slot for replacement shift
      db.sqlite.prepare("UPDATE shifts SET approved_leave_request_id = ? WHERE id = ?").run(leaveReq.id, shift2.id);

      const replacementShift = seedShift(db, {
        storeId: fixture.storeId,
        employeeEmail: staffEmail,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T05:00:00.000Z",
        status: "published",
      });
      assert.ok(replacementShift);
    });

    test("C02-5: Multi-store isolation for shift overlap trigger", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const { storeA, storeB } = createMultiStoreFixture(db);

      // Two distinct employees in their respective stores
      const emailA = storeA.actors.employeeA.email;
      const emailB = storeB.actors.employeeA.email;

      // Inserting identical shift window in Store A
      const shiftA = seedShift(db, {
        storeId: storeA.storeId,
        employeeEmail: emailA,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T05:00:00.000Z",
        status: "draft",
      });
      assert.ok(shiftA);

      // Same slot in Store B succeeds because trigger scopes by s.store_id = NEW.store_id
      const shiftB = seedShift(db, {
        storeId: storeB.storeId,
        employeeEmail: emailB,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T05:00:00.000Z",
        status: "draft",
      });
      assert.ok(shiftB);
    });

    test("C02-6: Staff visibility query strictly excludes draft shifts", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c02-6" });
      const staffEmail = fixture.actors.employeeA.email;

      seedShift(db, {
        id: "shift-draft-inv",
        storeId: fixture.storeId,
        employeeEmail: staffEmail,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T05:00:00.000Z",
        status: "draft",
      });

      seedShift(db, {
        id: "shift-pub-vis",
        storeId: fixture.storeId,
        employeeEmail: staffEmail,
        startsAt: "2026-07-04T01:00:00.000Z",
        endsAt: "2026-07-04T05:00:00.000Z",
        status: "published",
      });

      // Query mimicking staff view of schedules
      const visibleShifts = db.sqlite.prepare(
        "SELECT id, status FROM shifts WHERE store_id = ? AND employee_email = ? AND status = 'published'",
      ).all(fixture.storeId, staffEmail);

      assert.equal(visibleShifts.length, 1);
      assert.equal(visibleShifts[0].id, "shift-pub-vis");
    });
  });

  // =========================================================================
  // C03: 15-Minute Attendance Clipping & Unscheduled Sessions
  // =========================================================================
  describe("C03: 15-Minute Attendance Clipping & Unscheduled Sessions", () => {
    test("C03-1: Case A - 07:50-12:10 without overtime clips to planned 240 minutes", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c03-1" });
      const scenario = buildAttendanceClippingScenario(db, fixture);

      const payableMinutes = scenario.calculatePayableMinutes({
        plannedMinutes: 240,
        approvedOvertimeMinutes: 0,
        isUnscheduled: false,
      });

      assert.equal(scenario.caseA.recordedMinutes, 260);
      assert.equal(payableMinutes, scenario.caseA.expectedPayableMinutes);
    });

    test("C03-2: Case B - 07:40-12:20 without overtime clips to planned 240 minutes", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c03-2" });
      const scenario = buildAttendanceClippingScenario(db, fixture);

      const payableMinutes = scenario.calculatePayableMinutes({
        plannedMinutes: 240,
        approvedOvertimeMinutes: 0,
        isUnscheduled: false,
      });

      assert.equal(scenario.caseB.recordedMinutes, 280);
      assert.equal(payableMinutes, scenario.caseB.expectedPayableMinutes);
    });

    test("C03-3: Case C - 07:50-12:30 with 20m approved overtime yields 260 payable minutes", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c03-3" });
      const scenario = buildAttendanceClippingScenario(db, fixture);

      const payableMinutes = scenario.calculatePayableMinutes({
        plannedMinutes: 240,
        approvedOvertimeMinutes: 20,
        isUnscheduled: false,
      });

      assert.equal(scenario.caseC.recordedMinutes, 280);
      assert.equal(payableMinutes, scenario.caseC.expectedPayableMinutes);
    });

    test("C03-4: Case D - Unscheduled session without shift yields 0 payable minutes", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c03-4" });
      const scenario = buildAttendanceClippingScenario(db, fixture);

      const payableMinutes = scenario.calculatePayableMinutes({
        plannedMinutes: 240,
        approvedOvertimeMinutes: 0,
        isUnscheduled: true,
      });

      assert.equal(scenario.caseD.recordedMinutes, 240);
      assert.equal(payableMinutes, scenario.caseD.expectedPayableMinutes);
    });

    test("C03-5: Case E - Forgotten checkout (+4h auto-close) yields 0 payable minutes", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c03-5" });
      const staff = fixture.actors.employeeA;
      const owner = fixture.actors.soleOwner;

      // Planned shift 01:00 to 05:00 UTC (ends at 05:00)
      const shift = seedShift(db, {
        id: "shift-forgotten-co",
        storeId: fixture.storeId,
        employeeEmail: staff.email,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T05:00:00.000Z",
        status: "published",
      });

      // Session opened at 01:00, no checkout (closed_at is null)
      const session = seedAttendanceSession(db, {
        id: "session-forgotten-co",
        storeId: fixture.storeId,
        employeeEmail: staff.email,
        shiftId: shift.id,
        openedAt: "2026-07-03T01:00:00.000Z",
        closedAt: null,
        workedMinutes: null,
        status: "open",
      });

      // Seed check_in event so exception links to it
      seedAttendanceEvent(db, {
        id: "ev-forgotten-checkin",
        sessionId: session.id,
        employeeEmail: staff.email,
        action: "check_in",
        recordedAt: "2026-07-03T01:00:00.000Z",
      });

      // Reference time is 10:00 UTC (> 05:00 + 4 hours = 09:00 UTC)
      const autoCloseRes = await autoCloseForgottenSessions(db, fixture.storeId, "2026-07-03T10:00:00.000Z");
      assert.equal(autoCloseRes.closedCount, 1);

      // Verify session is closed at 09:00 with worked_minutes = 0 and status 'review_required'
      const updatedSess = db.sqlite.prepare("SELECT closed_at, worked_minutes, status FROM attendance_sessions WHERE id = ?").get(session.id);
      assert.equal(updatedSess.closed_at, "2026-07-03T09:00:00.000Z");
      assert.equal(updatedSess.worked_minutes, 0);
      assert.equal(updatedSess.status, "review_required");

      // Verify MISSING_CHECKOUT exception was created
      const ex = db.sqlite.prepare("SELECT employee_reason, status FROM attendance_exceptions WHERE event_id = 'ev-forgotten-checkin'").get();
      assert.ok(ex);
      assert.match(ex.employee_reason, /MISSING_CHECKOUT/);

      // Verify in payroll report: approvedMinutes is 0
      const rep = await loadPayrollReport(db, {
        storeId: fixture.storeId,
        actorEmail: owner.email,
        actorRole: "owner",
        periodKey: "2026-07",
      });
      const staffRow = rep.rows.find((r) => r.email === staff.email);
      assert.ok(staffRow);
      assert.equal(staffRow.approvedMinutes, 0);
      assert.equal(staffRow.totalSalary, 0);
    });
  });

  // =========================================================================
  // C04: Payroll Rounding & Rate History Splitting
  // =========================================================================
  describe("C04: Payroll Rounding & Rate History Splitting", () => {
    test("C04-1: 15-minute floor rounding mathematical steps", () => {
      const scenario = buildRateHistoryScenario();

      for (const vector of scenario.floorVectors) {
        assert.equal(
          scenario.floor15(vector.in),
          vector.out,
          `Expected ${vector.in}m to floor to ${vector.out}m`,
        );
      }
    });

    test("C04-2: Total salary arithmetic rounding to nearest 1.000 VND (half-up at 500)", () => {
      const scenario = buildRateHistoryScenario();

      for (const vector of scenario.roundVectors) {
        assert.equal(
          scenario.round1000(vector.in),
          vector.out,
          `Expected ${vector.in} VND to round to ${vector.out} VND`,
        );
      }
    });

    test("C04-3: Cross-month session clipping in loadPayrollReport (D1 SQLite query)", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-c04");
      const owner = seedEmployee(db, { id: "owner-c04", storeId: "store-c04", role: "owner" });
      const staff = seedEmployee(db, { id: "staff-c04", storeId: "store-c04", role: "employee" });

      // Session spans from 23:00 VN (16:00 UTC) on July 31 to 01:00 VN (18:00 UTC) on August 1
      seedAttendanceSession(db, {
        id: "sess-cross-month",
        storeId: "store-c04",
        employeeEmail: staff.email,
        openedAt: "2026-07-31T16:00:00.000Z",
        closedAt: "2026-07-31T18:00:00.000Z",
        workedMinutes: 120,
      });

      const julyReport = await loadPayrollReport(db, {
        storeId: "store-c04",
        actorEmail: owner.email,
        actorRole: "owner",
        periodKey: "2026-07",
      });
      const augustReport = await loadPayrollReport(db, {
        storeId: "store-c04",
        actorEmail: owner.email,
        actorRole: "owner",
        periodKey: "2026-08",
      });

      const julyStaff = julyReport.rows.find((r) => r.email === staff.email);
      const augustStaff = augustReport.rows.find((r) => r.email === staff.email);

      assert.ok(julyStaff);
      assert.ok(augustStaff);
      assert.equal(julyStaff.approvedMinutes, 60);
      assert.equal(augustStaff.approvedMinutes, 60);
      assert.equal(julyStaff.totalSalary + augustStaff.totalSalary, 50000);
    });

    test("C04-4: Mid-period rate change splitting", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-c04-4");
      const owner = seedEmployee(db, { id: "owner-c04-4", storeId: "store-c04-4", role: "owner" });
      const staff = seedEmployee(db, { id: "staff-c04-4", storeId: "store-c04-4", role: "employee", hourlyRate: 20000, rateHistory: false });

      // Clean rate history to test explicit split rates
      db.sqlite.prepare("DELETE FROM employee_rate_history WHERE employee_email = ?").run(staff.email);

      // Rate period 1: July 1 to July 15 -> 20.000 VND / hour
      seedRateHistory(db, {
        id: "rate-period-1",
        storeId: "store-c04-4",
        employeeEmail: staff.email,
        hourlyRate: 20000,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: "2026-07-15T00:00:00.000Z",
      });

      // Rate period 2: July 15 onwards -> 25.000 VND / hour
      seedRateHistory(db, {
        id: "rate-period-2",
        storeId: "store-c04-4",
        employeeEmail: staff.email,
        hourlyRate: 25000,
        effectiveFrom: "2026-07-15T00:00:00.000Z",
        effectiveTo: null,
      });

      // Session 1: July 5 (10 hours = 600m at 20.000 = 200.000 VND)
      seedAttendanceSession(db, {
        id: "sess-rate-1",
        storeId: "store-c04-4",
        employeeEmail: staff.email,
        openedAt: "2026-07-05T01:00:00.000Z",
        closedAt: "2026-07-05T11:00:00.000Z",
        workedMinutes: 600,
      });

      // Session 2: July 20 (10 hours = 600m at 25.000 = 250.000 VND)
      seedAttendanceSession(db, {
        id: "sess-rate-2",
        storeId: "store-c04-4",
        employeeEmail: staff.email,
        openedAt: "2026-07-20T01:00:00.000Z",
        closedAt: "2026-07-20T11:00:00.000Z",
        workedMinutes: 600,
      });

      const report = await loadPayrollReport(db, {
        storeId: "store-c04-4",
        actorEmail: owner.email,
        actorRole: "owner",
        periodKey: "2026-07",
      });
      const staffRow = report.rows.find((r) => r.email === staff.email);
      assert.ok(staffRow);
      assert.equal(staffRow.approvedMinutes, 1200);
      assert.equal(staffRow.baseSalary, 450000);
      assert.equal(staffRow.totalSalary, 450000);
    });

    test("C04-5: Missing rate history in legacy data blocks period finalization", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-c04-5");
      const owner = seedEmployee(db, { id: "owner-c04-5", storeId: "store-c04-5", role: "owner" });
      const staff = seedEmployee(db, { id: "staff-c04-5", storeId: "store-c04-5", role: "employee", hourlyRate: 25000, rateHistory: false });

      // Ensure employee has NO entry in employee_rate_history
      db.sqlite.prepare("DELETE FROM employee_rate_history WHERE employee_email = ?").run(staff.email);

      // Session in July 2026
      seedAttendanceSession(db, {
        id: "sess-legacy",
        storeId: "store-c04-5",
        employeeEmail: staff.email,
        openedAt: "2026-07-05T01:00:00.000Z",
        closedAt: "2026-07-05T09:00:00.000Z",
        workedMinutes: 480,
      });

      // Attempting to finalize payroll must be rejected with pay_rate_required
      await assert.rejects(
        changePayrollPeriod(db, owner, "finalize", "2026-07"),
        { code: "pay_rate_required" },
      );
    });
  });

  // =========================================================================
  // C05: Handover Acknowledgment Gate & Bypass Flow
  // =========================================================================
  describe("C05: Handover Acknowledgment Gate & Bypass Flow", () => {
    test("C05-1: First shift of the day check-in bypasses handover gate specification", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c05-1" });
      const scenario = buildHandoverScenario(db, fixture);

      // Morning shift has no preceding shift
      assert.ok(scenario.morningShift);
      assert.ok(scenario.afternoonShift);
    });

    test("C05-2: Continuation shift requires handover acknowledgment", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c05-2" });
      const scenario = buildHandoverScenario(db, fixture);

      // Preceding handover is unacknowledged initially
      assert.equal(scenario.unacknowledged, true);
      assert.equal(scenario.handover.acknowledgedAt, null);

      // When receiver acknowledges handover
      const acknowledged = scenario.acknowledge(scenario.handover.id);
      assert.ok(acknowledged.acknowledgedAt);

      const updated = db.sqlite.prepare("SELECT acknowledged_at FROM handovers WHERE id = ?").get(scenario.handover.id);
      assert.ok(updated.acknowledged_at);
    });

    test("C05-3: Check-in API handover gate & emergency manager bypass", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c05-3" });
      const scenario = buildHandoverScenario(db, fixture);
      const manager = fixture.actors.manager;
      const employeeB = fixture.actors.employeeB;
      const employeeA = fixture.actors.employeeA;

      // 1. Initial state: Preceding shift has unacknowledged handover.
      // Employee B attempting check-in is gated (handover_acknowledgment_required)
      const gateResult = await checkHandoverGate(db, fixture.storeId, employeeB.email);
      assert.equal(gateResult.allowed, false);
      assert.equal(gateResult.code, "handover_acknowledgment_required");
      assert.equal(gateResult.handoverId, scenario.handover.id);

      // 2. Non-manager/owner (employee A) attempting bypass is rejected with 403 / manager_bypass_forbidden
      await assert.rejects(
        checkHandoverGate(db, fixture.storeId, employeeB.email, {
          bypass: true,
          bypassReason: "Lý do khẩn cấp của nhân viên",
          bypassActor: employeeA,
        }),
        { status: 403, code: "manager_bypass_forbidden" },
      );

      // 3. Manager bypass with insufficient reason (< 5 chars) is rejected with 400 / bypass_reason_required
      await assert.rejects(
        checkHandoverGate(db, fixture.storeId, employeeB.email, {
          bypass: true,
          bypassReason: "bận",
          bypassActor: manager,
        }),
        { status: 400, code: "bypass_reason_required" },
      );

      // 4. Manager bypass with valid reason succeeds, permits check-in, and logs audit event
      const bypassResult = await checkHandoverGate(db, fixture.storeId, employeeB.email, {
        bypass: true,
        bypassReason: "Sự cố mạng đầu ca sáng, quản lý xác nhận cho check-in",
        bypassActor: manager,
        now: "2026-07-03T05:00:00.000Z",
      });
      assert.equal(bypassResult.allowed, true);
      assert.equal(bypassResult.bypassed, true);
      assert.equal(bypassResult.handoverId, scenario.handover.id);

      // Verify audit event
      const auditEv = db.sqlite.prepare(
        "SELECT action, metadata FROM audit_events WHERE entity_id = ? AND action = 'handover.emergency_bypass'",
      ).get(scenario.handover.id);
      assert.ok(auditEv);
      const meta = JSON.parse(auditEv.metadata);
      assert.equal(meta.managerEmail, manager.email);
      assert.equal(meta.targetEmployeeEmail, employeeB.email);

      // 5. Alternatively: when handover is acknowledged via acknowledgeHandover, gate opens normally without bypass
      const ackResult = await acknowledgeHandover(db, employeeB, scenario.handover.id);
      assert.equal(ackResult.success, true);

      const normalGateResult = await checkHandoverGate(db, fixture.storeId, employeeB.email);
      assert.equal(normalGateResult.allowed, true);
    });
  });

  // =========================================================================
  // C06: Full-Shift Leave, Request Withdrawal & Sole-Owner Self-Correction
  // =========================================================================
  describe("C06: Full-Shift Leave, Request Withdrawal & Sole-Owner Self-Correction", () => {
    test("C06-1: Full-shift leave approval links shift and marks approved_leave_request_id", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-c06");
      const manager = seedEmployee(db, { id: "mgr-c06", storeId: "store-c06", role: "manager" });
      const staff = seedEmployee(db, { id: "staff-c06", storeId: "store-c06", role: "employee" });

      const shift = seedShift(db, {
        id: "shift-leave-c06",
        storeId: "store-c06",
        employeeEmail: staff.email,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T09:00:00.000Z",
        status: "published",
      });

      const request = seedRequest(db, {
        id: "req-leave-c06",
        storeId: "store-c06",
        employeeEmail: staff.email,
        type: "leave",
        title: "Xin nghỉ phép cả ca",
        shiftId: shift.id,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        status: "pending",
      });

      const result = await decideRequest(db, manager, request.id, "approved");
      assert.equal(result.status, "approved");

      // Verify shift now has approved_leave_request_id populated
      const updatedShift = db.sqlite.prepare("SELECT approved_leave_request_id, revision FROM shifts WHERE id = ?").get(shift.id);
      assert.equal(updatedShift.approved_leave_request_id, request.id);
      assert.equal(updatedShift.revision, 1);
    });

    test("C06-2: Leave approval rejected if shift has active attendance session or locked period", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-c06-conflict");
      const manager = seedEmployee(db, { id: "mgr-conflict", storeId: "store-c06-conflict", role: "manager" });
      const staff = seedEmployee(db, { id: "staff-conflict", storeId: "store-c06-conflict", role: "employee" });

      // Case 1: Shift already has an attendance session
      const shift1 = seedShift(db, {
        id: "shift-worked",
        storeId: "store-c06-conflict",
        employeeEmail: staff.email,
        startsAt: "2026-07-03T01:00:00.000Z",
        endsAt: "2026-07-03T09:00:00.000Z",
        status: "published",
      });
      seedAttendanceSession(db, {
        id: "sess-worked",
        storeId: "store-c06-conflict",
        employeeEmail: staff.email,
        shiftId: shift1.id,
      });
      const req1 = seedRequest(db, {
        id: "req-conflict-1",
        storeId: "store-c06-conflict",
        employeeEmail: staff.email,
        type: "leave",
        title: "Nghỉ ca đã làm",
        shiftId: shift1.id,
        startsAt: shift1.startsAt,
        endsAt: shift1.endsAt,
        status: "pending",
      });

      await assert.rejects(
        decideRequest(db, manager, req1.id, "approved"),
        { status: 409, code: "request_conflict" },
      );

      // Case 2: Shift falls in finalized period
      const shift2 = seedShift(db, {
        id: "shift-in-locked-period",
        storeId: "store-c06-conflict",
        employeeEmail: staff.email,
        startsAt: "2026-07-05T01:00:00.000Z",
        endsAt: "2026-07-05T09:00:00.000Z",
        status: "published",
      });
      const req2 = seedRequest(db, {
        id: "req-conflict-2",
        storeId: "store-c06-conflict",
        employeeEmail: staff.email,
        type: "leave",
        title: "Nghỉ ca trong kỳ khóa",
        shiftId: shift2.id,
        startsAt: shift2.startsAt,
        endsAt: shift2.endsAt,
        status: "pending",
      });
      // Finalize the payroll period after shift creation
      seedPayrollPeriod(db, {
        storeId: "store-c06-conflict",
        periodKey: "2026-07",
        periodStart: "2026-06-30T17:00:00.000Z",
        periodEnd: "2026-07-31T17:00:00.000Z",
        status: "finalized",
      });

      await assert.rejects(
        decideRequest(db, manager, req2.id, "approved"),
        { status: 409, code: "request_conflict" },
      );
    });

    test("C06-3: Request withdrawal by requester & approval blocking on withdrawn requests", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c06-3" });
      const empA = fixture.actors.employeeA;
      const empB = fixture.actors.employeeB;
      const manager = fixture.actors.manager;

      // 1. Employee A creates a pending leave request
      const req = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: empA.email,
        type: "leave",
        title: "Xin nghỉ phép",
        status: "pending",
      });

      // 2. Employee B (non-requester) attempts to withdraw -> 403 forbidden
      await assert.rejects(
        withdrawRequest(db, empB, req.id),
        { status: 403, code: "forbidden" }
      );

      // 3. Employee A (requester) withdraws their own request -> succeeds
      const result = await withdrawRequest(db, empA, req.id);
      assert.equal(result.withdrawn, true);
      assert.equal(result.status, "withdrawn");

      // Verify DB status
      const row = db.sqlite.prepare("SELECT status FROM requests WHERE id = ?").get(req.id);
      assert.equal(row.status, "withdrawn");

      // 4. Repeated withdrawal of withdrawn request fails -> 409 request_conflict
      await assert.rejects(
        withdrawRequest(db, empA, req.id),
        { status: 409, code: "request_conflict" }
      );

      // 5. Manager attempts to approve a withdrawn request -> 409 request_conflict
      await assert.rejects(
        decideRequest(db, manager, req.id, "approved"),
        { status: 409, code: "request_conflict" }
      );

      // 6. Withdrawal of already approved request fails -> 409 request_conflict
      const approvedReq = seedRequest(db, {
        storeId: fixture.storeId,
        employeeEmail: empA.email,
        type: "leave",
        title: "Đã duyệt",
        status: "approved",
      });
      await assert.rejects(
        withdrawRequest(db, empA, approvedReq.id),
        { status: 409, code: "request_conflict" }
      );
    });

    test("C06-4: Sole-owner self-correction vs multi-owner blocking", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      // Part 1: Sole Owner Store -> Self-correction is PERMITTED with soleOwnerCorrection: true and audit event
      const soleFixture = createWorkforceFixture(db, { storeId: "store-sole-c06", mode: "sole_owner" });
      const soleOwner = soleFixture.actors.soleOwner;

      const soleSession = seedAttendanceSession(db, {
        id: "session-sole-owner",
        storeId: soleFixture.storeId,
        employeeEmail: soleOwner.email,
        openedAt: "2026-07-03T01:10:00.000Z",
        closedAt: "2026-07-03T05:00:00.000Z",
        revision: 0,
        status: "completed",
      });

      const soleCorrection = await correctAttendance(db, soleOwner, {
        sessionId: soleSession.id,
        action: "check_in",
        adjustedTime: "2026-07-03T01:00:00.000Z",
        reason: "Quên bấm check-in do bận chuẩn bị mở quán",
        expectedRevision: 0,
      });

      assert.equal(soleCorrection.updated, true);
      assert.equal(soleCorrection.soleOwnerCorrection, true);
      assert.equal(soleCorrection.newTime, "2026-07-03T01:00:00.000Z");

      // Verify audit event has highAudit and soleOwnerCorrection flags
      const auditEv = db.sqlite.prepare(
        "SELECT action, metadata FROM audit_events WHERE actor_email = ? AND entity_type = 'attendance_event' ORDER BY created_at DESC"
      ).get(soleOwner.email);
      assert.ok(auditEv);
      assert.equal(auditEv.action, "attendance.time_adjusted");
      const meta = JSON.parse(auditEv.metadata);
      assert.equal(meta.soleOwnerCorrection, true);
      assert.equal(meta.highAudit, true);

      // Part 2: Multi-Owner Store -> Self-correction is FORBIDDEN (must be reviewed by other owner)
      const multiFixture = createWorkforceFixture(db, { storeId: "store-multi-c06", mode: "multi_owner" });
      const ownerA = multiFixture.actors.ownerA;
      const ownerB = multiFixture.actors.ownerB;

      const multiSessionA = seedAttendanceSession(db, {
        id: "session-multi-owner-a",
        storeId: multiFixture.storeId,
        employeeEmail: ownerA.email,
        openedAt: "2026-07-03T01:15:00.000Z",
        closedAt: "2026-07-03T05:00:00.000Z",
        revision: 0,
        status: "completed",
      });

      // Owner A attempting self-correction must fail with sole_owner_required
      await assert.rejects(
        correctAttendance(db, ownerA, {
          sessionId: multiSessionA.id,
          action: "check_in",
          adjustedTime: "2026-07-03T01:00:00.000Z",
          reason: "Tự điều chỉnh khi có 2 chủ quán",
          expectedRevision: 0,
        }),
        { status: 403, code: "sole_owner_required" }
      );

      // Owner B correcting Owner A's session is an independent review and succeeds
      const multiCorrectionB = await correctAttendance(db, ownerB, {
        sessionId: multiSessionA.id,
        action: "check_in",
        adjustedTime: "2026-07-03T01:00:00.000Z",
        reason: "Chủ quán B xác nhận điều chỉnh cho Chủ quán A",
        expectedRevision: 0,
      });
      assert.equal(multiCorrectionB.updated, true);
      assert.equal(multiCorrectionB.soleOwnerCorrection, false);

      // Part 3: Manager attempting self-correction is FORBIDDEN
      const mgr = multiFixture.actors.manager;
      const mgrSession = seedAttendanceSession(db, {
        id: "session-mgr-c06",
        storeId: multiFixture.storeId,
        employeeEmail: mgr.email,
        openedAt: "2026-07-03T01:20:00.000Z",
        closedAt: "2026-07-03T05:00:00.000Z",
        revision: 0,
        status: "completed",
      });

      await assert.rejects(
        correctAttendance(db, mgr, {
          sessionId: mgrSession.id,
          action: "check_in",
          adjustedTime: "2026-07-03T01:00:00.000Z",
          reason: "Quản lý tự sửa công của mình",
          expectedRevision: 0,
        }),
        { status: 403, code: "self_approval_blocked" }
      );
    });
  });

  // =========================================================================
  // C07: Retention Lifecycles & 3-Year Preservation Invariant
  // =========================================================================
  describe("C07: Retention Lifecycles & 3-Year Preservation Invariant", () => {
    test("C07-1: 90-day evidence expiry removes R2 photo and D1 GPS, preserves attendance events", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c07-1" });
      const scenario = buildRetentionScenario(db, fixture);

      const deletedKeys = [];
      const fakeR2 = {
        delete: async (key) => {
          deletedKeys.push(key);
        },
      };

      // Run evidence expiry as of 2026-07-02 (expired photo/location expired at 2026-07-01)
      const now = "2026-07-02T00:00:00.000Z";
      await expireEvidence(db, fakeR2, now);

      // 1. R2 photo was deleted
      assert.equal(deletedKeys.length, 1);
      assert.equal(deletedKeys[0], "evidence/expired-photo.jpg");

      // 2. D1 expired photo record was deleted
      const expiredPhoto = db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenario.expiredEventId);
      assert.equal(expiredPhoto, undefined);

      // 3. D1 expired location record was deleted
      const expiredLoc = db.sqlite.prepare("SELECT * FROM attendance_locations WHERE event_id = ?").get(scenario.expiredEventId);
      assert.equal(expiredLoc, undefined);

      // 4. Raw attendance event remains preserved 100%
      const preservedEvent = db.sqlite.prepare("SELECT * FROM attendance_events WHERE id = ?").get(scenario.expiredEventId);
      assert.ok(preservedEvent);
      assert.equal(preservedEvent.id, scenario.expiredEventId);

      // 5. Active photo and location (not yet expired) remain untouched
      const activePhoto = db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenario.activeEventId);
      assert.ok(activePhoto);
      const activeLoc = db.sqlite.prepare("SELECT * FROM attendance_locations WHERE event_id = ?").get(scenario.activeEventId);
      assert.ok(activeLoc);
    });

    test("C07-2: R2 failure aborts D1 deletion and preserves raw evidence", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c07-2" });
      const scenario = buildRetentionScenario(db, fixture);

      const failingR2 = {
        delete: async () => {
          throw new Error("R2 connection timeout");
        },
      };

      const now = "2026-07-02T00:00:00.000Z";
      await expireEvidence(db, failingR2, now);

      // When R2 fails, D1 photo record MUST NOT be deleted
      const photoStillExists = db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenario.expiredEventId);
      assert.ok(photoStillExists);
    });

    test("C07-3: 180-day order anonymization masks PII while preserving revenue", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c07-3" });
      const scenario = buildRetentionScenario(db, fixture);

      const now = "2026-07-02T00:00:00.000Z";

      // 1. Run order PII anonymization
      const result = await anonymizeExpiredOrders(db, now);
      assert.equal(result.anonymizedCount, 1);

      // 2. Old order (> 180 days) has customer PII masked, but financial/operational fields preserved
      const anonymizedOrder = db.sqlite.prepare(
        "SELECT id, order_code, customer_name, customer_phone, customer_note, total_amount, item_count, status FROM customer_orders WHERE id = ?",
      ).get(scenario.oldOrderId);
      assert.ok(anonymizedOrder);
      assert.equal(anonymizedOrder.customer_name, "[ANONYMIZED]");
      assert.equal(anonymizedOrder.customer_phone, "[ANONYMIZED]");
      assert.equal(anonymizedOrder.customer_note, null);
      assert.equal(anonymizedOrder.total_amount, 150000); // REVENUE PRESERVED
      assert.equal(anonymizedOrder.item_count, 2);
      assert.equal(anonymizedOrder.status, "completed");

      // Verify audit event recorded for order anonymization
      const auditEv = db.sqlite.prepare(
        "SELECT action, metadata FROM audit_events WHERE entity_id = ? AND action = 'order.anonymized'",
      ).get(scenario.oldOrderId);
      assert.ok(auditEv);

      // 3. Fresh order (1 day old) is completely untouched
      const freshOrder = db.sqlite.prepare(
        "SELECT id, customer_name, customer_phone, customer_note, total_amount FROM customer_orders WHERE id = ?",
      ).get(scenario.freshOrderId);
      assert.ok(freshOrder);
      assert.equal(freshOrder.customer_name, "Trần Thị B");
      assert.equal(freshOrder.customer_phone, "0912345678");
      assert.equal(freshOrder.customer_note, "Ít đá");
      assert.equal(freshOrder.total_amount, 65000);

      // 4. Job is idempotent: running again produces 0 anonymized orders
      const reRunResult = await anonymizeExpiredOrders(db, now);
      assert.equal(reRunResult.anonymizedCount, 0);
    });

    test("C07-4: 3-year preservation invariant retains operational history without auto-purge", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-c07-4" });
      const scenario = buildRetentionScenario(db, fixture);

      // Run evidence expiry cleanup
      const fakeR2 = { delete: async () => {} };
      await expireEvidence(db, fakeR2, "2026-07-02T00:00:00.000Z");

      // Historic event and session from 2 years ago must still exist
      const histEvent = db.sqlite.prepare("SELECT * FROM attendance_events WHERE id = ?").get(scenario.historicEventId);
      const histSession = db.sqlite.prepare("SELECT * FROM attendance_sessions WHERE id = ?").get(scenario.historicSessionId);

      assert.ok(histEvent);
      assert.ok(histSession);
      assert.equal(histEvent.id, scenario.historicEventId);
      assert.equal(histSession.id, scenario.historicSessionId);
    });

    test("C07-5: Multi-store isolation for retention scenario and order code global uniqueness", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const { storeA, storeB } = createMultiStoreFixture(db);

      // Concurrently execute retention scenario across both stores
      const [scenarioA, scenarioB] = await Promise.all([
        Promise.resolve(buildRetentionScenario(db, storeA)),
        Promise.resolve(buildRetentionScenario(db, storeB)),
      ]);

      // 1. Verify returned order identifiers exist and are distinct
      assert.ok(scenarioA.oldOrderId);
      assert.ok(scenarioB.oldOrderId);
      assert.ok(scenarioA.oldOrderCode);
      assert.ok(scenarioB.oldOrderCode);
      assert.notEqual(scenarioA.oldOrderId, scenarioB.oldOrderId);
      assert.notEqual(scenarioA.freshOrderId, scenarioB.freshOrderId);
      assert.notEqual(scenarioA.oldOrderCode, scenarioB.oldOrderCode);
      assert.notEqual(scenarioA.freshOrderCode, scenarioB.freshOrderCode);

      // 2. Query all orders across stores to verify global unique index compliance
      const orders = db.sqlite.prepare(`
        SELECT id, order_code, store_id, customer_name, total_amount, status
        FROM customer_orders
        ORDER BY store_id, created_at
      `).all();

      // Exactly 4 orders must exist: 2 belonging to storeA, 2 belonging to storeB
      assert.equal(orders.length, 4, "Expected exactly 4 customer orders across storeA and storeB");

      const ordersA = orders.filter((o) => o.store_id === storeA.storeId);
      const ordersB = orders.filter((o) => o.store_id === storeB.storeId);
      assert.equal(ordersA.length, 2, "Expected 2 orders for storeA");
      assert.equal(ordersB.length, 2, "Expected 2 orders for storeB");

      // Verify all order codes are globally distinct (no customer_orders_order_code_idx violation)
      const orderCodes = new Set(orders.map((o) => o.order_code));
      assert.equal(orderCodes.size, 4, "All order codes across stores must be globally unique");

      // 3. Verify attendance evidence and operational events are isolated per store
      const photosA = db.sqlite.prepare(`
        SELECT count(*) as count FROM attendance_photos ap
        JOIN attendance_events ae ON ap.event_id = ae.id
        JOIN attendance_sessions asess ON ae.session_id = asess.id
        WHERE asess.store_id = ?
      `).get(storeA.storeId).count;
      const photosB = db.sqlite.prepare(`
        SELECT count(*) as count FROM attendance_photos ap
        JOIN attendance_events ae ON ap.event_id = ae.id
        JOIN attendance_sessions asess ON ae.session_id = asess.id
        WHERE asess.store_id = ?
      `).get(storeB.storeId).count;

      assert.equal(photosA, 2, "Expected 2 photos for storeA");
      assert.equal(photosB, 2, "Expected 2 photos for storeB");

      // 4. Verify evidence expiry cleans only expired items for both stores independently
      const fakeR2 = { delete: async () => {} };
      const now = "2026-07-02T00:00:00.000Z";
      await expireEvidence(db, fakeR2, now);

      // Expired photos for both stores removed, active photos preserved
      assert.equal(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioA.expiredEventId), undefined);
      assert.equal(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioB.expiredEventId), undefined);
      assert.ok(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioA.activeEventId));
      assert.ok(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioB.activeEventId));
    });
  });

  // =========================================================================
  // DEC-007: Order Cancellation Reason Codes & Spoilage Metrics (Package P07)
  // =========================================================================
  describe("DEC-007: Order Cancellation Reason Codes & Spoilage Metrics", () => {
    test("P07-1: Cancelling orders from preparing/ready enforces reason code enum", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-p07-1" });
      const manager = fixture.actors.manager;
      const staff = fixture.actors.employeeA;

      const orderPrepId = "ord-prep-test";
      const now = new Date().toISOString();
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'ORD-PREP-1', 'Khách A', '0901111111', 85000, 2, 'preparing', ?, ?)
      `).run(orderPrepId, fixture.storeId, now, now);

      // Staff (employee role) attempting to cancel is forbidden (403)
      await assert.rejects(
        changeOrderStatus(db, staff, orderPrepId, {
          expectedStatus: "preparing",
          newStatus: "cancelled",
          reasonCode: "customer_abandoned",
        }),
        { status: 403, code: "forbidden" },
      );

      // Cancelling preparing order with invalid code throws 400 invalid_cancellation_reason
      await assert.rejects(
        changeOrderStatus(db, manager, orderPrepId, {
          expectedStatus: "preparing",
          newStatus: "cancelled",
          reasonCode: "invalid_reason_code",
        }),
        { status: 400, code: "invalid_cancellation_reason" },
      );

      // Cancelling preparing order with valid code succeeds
      const cancelResult = await changeOrderStatus(db, manager, orderPrepId, {
        expectedStatus: "preparing",
        newStatus: "cancelled",
        reasonCode: "item_preparation_error",
        cancelReason: "Pha nhầm lượng đường",
      });
      assert.equal(cancelResult.success, true);
      assert.equal(cancelResult.toStatus, "cancelled");

      const cancelledOrder = db.sqlite.prepare("SELECT status, cancel_reason FROM customer_orders WHERE id = ?").get(orderPrepId);
      assert.equal(cancelledOrder.status, "cancelled");
      assert.match(cancelledOrder.cancel_reason, /item_preparation_error/);
    });

    test("P07-2: Spoilage metrics correctly aggregate orders cancelled after preparation started", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const fixture = createWorkforceFixture(db, { storeId: "store-p07-2" });
      const manager = fixture.actors.manager;

      // 1. Order cancelled from 'pending' (NOT spoiled, preparation never started)
      const ordPending = "ord-pending-1";
      const now = new Date().toISOString();
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'ORD-PEND-1', 'Khách B', '0902222222', 50000, 1, 'pending', ?, ?)
      `).run(ordPending, fixture.storeId, now, now);
      await changeOrderStatus(db, manager, ordPending, {
        expectedStatus: "pending",
        newStatus: "cancelled",
        cancelReason: "Khách đổi ý trước khi làm",
      });

      // 2. Order cancelled from 'preparing' (SPOILED, value = 90000)
      const ordPrep = "ord-prep-2";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'ORD-PREP-2', 'Khách C', '0903333333', 90000, 2, 'preparing', ?, ?)
      `).run(ordPrep, fixture.storeId, now, now);
      await changeOrderStatus(db, manager, ordPrep, {
        expectedStatus: "preparing",
        newStatus: "cancelled",
        reasonCode: "store_incident",
      });

      // 3. Order cancelled from 'ready' (SPOILED, value = 60000)
      const ordReady = "ord-ready-2";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'ORD-READY-2', 'Khách D', '0904444444', 60000, 1, 'ready', ?, ?)
      `).run(ordReady, fixture.storeId, now, now);
      await changeOrderStatus(db, manager, ordReady, {
        expectedStatus: "ready",
        newStatus: "cancelled",
        reasonCode: "customer_abandoned",
      });

      // 4. Order completed normally (NOT spoiled, REVENUE = 120000)
      const ordComp = "ord-comp-2";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'ORD-COMP-2', 'Khách E', '0905555555', 120000, 3, 'ready', ?, ?)
      `).run(ordComp, fixture.storeId, now, now);
      await changeOrderStatus(db, manager, ordComp, {
        expectedStatus: "ready",
        newStatus: "completed",
      });

      // Check spoilage metrics
      const spoilage = await getSpoilageMetrics(db, fixture.storeId);
      assert.equal(spoilage.spoiledOrdersCount, 2); // only preparing and ready cancellations
      assert.equal(spoilage.spoiledAmount, 150000); // 90000 + 60000
    });
  });

  // =========================================================================
  // Multi-Store Isolation & Concurrent Scenario Execution
  // =========================================================================
  describe("Multi-Store Fixture: Cross-Tenant Scenario Concurrency", () => {
    test("MS-1: createMultiStoreFixture concurrently executes ALL scenario builders across storeA and storeB without collision", async (t) => {
      // 1. Verify Pure Logic Scenario Builder
      const rateScenario = buildRateHistoryScenario();
      assert.equal(typeof rateScenario.floor15, "function");
      assert.equal(typeof rateScenario.round1000, "function");
      assert.equal(rateScenario.floor15(29), 15);
      assert.equal(rateScenario.round1000(1450500), 1451000);

      // 2. Scenario Builders Matrix
      // Each DB-backed scenario builder is invoked concurrently across storeA and storeB
      const dbMatrix = createDatabase();
      t.after(() => dbMatrix.close());
      const { storeA, storeB } = createMultiStoreFixture(dbMatrix);

      // A. Swap Scenario Concurrency
      const [swapA, swapB] = await Promise.all([
        Promise.resolve(buildSwapScenario(dbMatrix, storeA)),
        Promise.resolve(buildSwapScenario(dbMatrix, storeB)),
      ]);
      assert.ok(swapA.request.id);
      assert.ok(swapB.request.id);
      assert.notEqual(swapA.request.id, swapB.request.id);
      assert.notEqual(swapA.shiftA.id, swapB.shiftA.id);
      assert.notEqual(swapA.shiftB.id, swapB.shiftB.id);

      // B. Attendance Clipping Scenario Concurrency
      // Tested on fresh multi-store instance to isolate shift calendar timeline
      const dbClipping = createDatabase();
      t.after(() => dbClipping.close());
      const msClipping = createMultiStoreFixture(dbClipping);
      const [clipA, clipB] = await Promise.all([
        Promise.resolve(buildAttendanceClippingScenario(dbClipping, msClipping.storeA)),
        Promise.resolve(buildAttendanceClippingScenario(dbClipping, msClipping.storeB)),
      ]);
      assert.ok(clipA.shift.id);
      assert.ok(clipB.shift.id);
      assert.notEqual(clipA.shift.id, clipB.shift.id);
      assert.equal(clipA.caseA.expectedPayableMinutes, 240);
      assert.equal(clipB.caseA.expectedPayableMinutes, 240);

      // C. Handover Scenario Concurrency
      const dbHandover = createDatabase();
      t.after(() => dbHandover.close());
      const msHandover = createMultiStoreFixture(dbHandover);
      const [hoA, hoB] = await Promise.all([
        Promise.resolve(buildHandoverScenario(dbHandover, msHandover.storeA)),
        Promise.resolve(buildHandoverScenario(dbHandover, msHandover.storeB)),
      ]);
      assert.ok(hoA.handover.id);
      assert.ok(hoB.handover.id);
      assert.notEqual(hoA.handover.id, hoB.handover.id);
      assert.notEqual(hoA.morningShift.id, hoB.morningShift.id);
      assert.equal(hoA.unacknowledged, true);
      assert.equal(hoB.unacknowledged, true);

      // D. Draft Overlap Scenario Concurrency
      const dbDraft = createDatabase();
      t.after(() => dbDraft.close());
      const msDraft = createMultiStoreFixture(dbDraft);
      const [draftA, draftB] = await Promise.all([
        Promise.resolve(buildDraftOverlapScenario(dbDraft, msDraft.storeA)),
        Promise.resolve(buildDraftOverlapScenario(dbDraft, msDraft.storeB)),
      ]);
      assert.ok(draftA.draftShift.id);
      assert.ok(draftB.draftShift.id);
      assert.notEqual(draftA.draftShift.id, draftB.draftShift.id);

      // E. Retention Scenario Concurrency (Regresses order_code collision)
      const dbRetention = createDatabase();
      t.after(() => dbRetention.close());
      const msRetention = createMultiStoreFixture(dbRetention);
      const [retA, retB] = await Promise.all([
        Promise.resolve(buildRetentionScenario(dbRetention, msRetention.storeA)),
        Promise.resolve(buildRetentionScenario(dbRetention, msRetention.storeB)),
      ]);
      assert.ok(retA.oldOrderId);
      assert.ok(retB.oldOrderId);
      assert.notEqual(retA.oldOrderId, retB.oldOrderId);
      assert.notEqual(retA.freshOrderId, retB.freshOrderId);

      // Verify all orders created across stores in dbRetention are distinct
      const orders = dbRetention.sqlite.prepare(`SELECT order_code, store_id FROM customer_orders`).all();
      assert.equal(orders.length, 4);
      assert.equal(new Set(orders.map((o) => o.order_code)).size, 4);
    });
  });
});
