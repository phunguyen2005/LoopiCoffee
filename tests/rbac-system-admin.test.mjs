import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedAttendanceSession, seedEmployee, seedRequest, seedShift, seedStore } from "./helpers/database.mjs";
import { archiveCustomRole, createCustomRole, loadRolePermissions, replaceRolePermissions } from "../modules/people/application/rbac.ts";
import { updateEmployeeAccess } from "../modules/people/application/update-access.ts";
import {
  changeAccountEmail,
  deleteAccountAndData,
  hasAdminSecurityPin,
  setAdminSecurityPin,
  verifyAdminSecurityPin,
} from "../modules/people/application/admin-account-management.ts";
import { loadAdminAudit } from "../modules/people/application/admin-audit.ts";
import { validateRolePermissions } from "../modules/people/domain/permissions.ts";
import { canApproveRequest } from "../modules/people/domain/access.ts";
import { correctAttendance } from "../modules/attendance/application/correct-attendance.ts";
import { loadPayrollReport } from "../modules/payroll/application/load-report.ts";

function fixture(t) {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const now = "2026-10-14T00:00:00.000Z";
  db.sqlite.prepare(`INSERT INTO role_permission_sets (store_id, role, revision, updated_by, updated_at)
    VALUES ('store-a', 'manager', 0, 'test', ?), ('store-a', 'team_lead', 0, 'test', ?)`)
    .run(now, now);
  const admin = seedEmployee(db, { id: "admin", role: "system_admin", email: "admin@example.test", hourlyRate: null, rateHistory: false });
  const owner = seedEmployee(db, { id: "owner", role: "owner", email: "owner@example.test", hourlyRate: null, rateHistory: false });
  return { db, admin, owner };
}

test("RBAC catalog unlocks all permissions for manager, team_lead, and employee while enforcing dependencies", () => {
  assert.throws(() => validateRolePermissions("team_lead", ["payroll.finalize"]), /permission_dependency/);
  assert.deepEqual(
    validateRolePermissions("team_lead", ["payroll.read", "payroll.finalize"]),
    ["payroll.read", "payroll.finalize"],
  );
  assert.deepEqual(
    validateRolePermissions("employee", ["orders.read", "orders.cancel"]),
    ["orders.read", "orders.cancel"],
  );
  assert.throws(() => validateRolePermissions("manager", ["orders.cancel"]), /permission_dependency/);
  assert.deepEqual(validateRolePermissions("manager", ["orders.read", "orders.cancel"]), ["orders.read", "orders.cancel"]);
});

test("system admin configures permissions for employee role and optional reason", async (t) => {
  const { db, admin } = fixture(t);
  const actor = { ...admin, permissions: [] };
  const initial = await loadRolePermissions(db, "store-a", "employee");
  assert.deepEqual(initial.permissions, []);

  const updated = await replaceRolePermissions(
    db,
    actor,
    "employee",
    ["orders.read", "orders.transition"],
    0,
    "",
    crypto.randomUUID(),
  );
  assert.equal(updated.revision, 1);
  const loaded = await loadRolePermissions(db, "store-a", "employee");
  assert.deepEqual(loaded.permissions, ["orders.read", "orders.transition"]);
});

test("system admin replaces a permission set with revision protection", async (t) => {
  const { db, admin } = fixture(t);
  const actor = { ...admin, permissions: [] };
  const key = crypto.randomUUID();
  const result = await replaceRolePermissions(db, actor, "manager", ["orders.read", "orders.cancel"], 0, "Thu hẹp quyền thử nghiệm", key);
  assert.equal(result.revision, 1);
  assert.equal((await replaceRolePermissions(db, actor, "manager", ["orders.read", "orders.cancel"], 0, "Thu hẹp quyền thử nghiệm", key)).replayed, true);
  assert.deepEqual((await loadRolePermissions(db, "store-a", "manager")).permissions, ["orders.cancel", "orders.read"]);
  await assert.rejects(
    replaceRolePermissions(db, actor, "manager", ["orders.read"], 0, "Ghi đè revision cũ", crypto.randomUUID()),
    (error) => error.code === "permission_conflict",
  );
  assert.deepEqual((await loadRolePermissions(db, "store-a", "manager")).permissions, ["orders.cancel", "orders.read"]);
});

test("simultaneous RBAC writes accept only one revision and revocation is visible on the next load", async (t) => {
  const { db, admin } = fixture(t);
  const actor = { ...admin, permissions: [] };
  const results = await Promise.allSettled([
    replaceRolePermissions(db, actor, "manager", ["orders.read", "orders.cancel"], 0, "Cấu hình quyền đơn hàng", crypto.randomUUID()),
    replaceRolePermissions(db, actor, "manager", ["payroll.read", "payroll.finalize"], 0, "Cấu hình quyền bảng lương", crypto.randomUUID()),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected?.reason?.code, "permission_conflict");

  const current = await loadRolePermissions(db, "store-a", "manager");
  const revoked = current.permissions.includes("orders.cancel") ? ["orders.read"] : ["payroll.read"];
  const updated = await replaceRolePermissions(
    db,
    actor,
    "manager",
    revoked,
    current.revision,
    "Thu hồi quyền thao tác nhạy cảm",
    crypto.randomUUID(),
  );
  assert.equal(updated.revision, current.revision + 1);
  assert.deepEqual((await loadRolePermissions(db, "store-a", "manager")).permissions, revoked);
});

test("system admin can assign multiple owners and demote or suspend even the sole owner", async (t) => {
  const { db, admin, owner } = fixture(t);
  const employee = seedEmployee(db, { id: "employee-1", role: "employee", email: "employee1@example.test" });

  // Promote second owner
  const promoted = await updateEmployeeAccess(db, admin, employee.id, { role: "owner", expectedRevision: 0 });
  assert.equal(promoted.role, "owner");
  assert.equal(promoted.access_revision, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM employees WHERE role = 'owner'").get().count, 2);

  // Demote first owner
  const demotedFirst = await updateEmployeeAccess(db, admin, owner.id, { role: "manager", expectedRevision: 0 });
  assert.equal(demotedFirst.role, "manager");

  // Suspend or demote the sole remaining owner as system_admin
  const suspendedSole = await updateEmployeeAccess(db, admin, employee.id, {
    role: "employee",
    status: "suspended",
    expectedRevision: 1,
  });
  assert.equal(suspendedSole.role, "employee");
  assert.equal(suspendedSole.status, "suspended");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM employees WHERE role = 'owner' AND status = 'active'").get().count, 0);
});

test("simultaneous owner promotions by system admin allow multiple owners", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const admin = seedEmployee(db, { id: "admin", role: "system_admin", email: "admin@example.test", hourlyRate: null, rateHistory: false });
  const first = seedEmployee(db, { id: "candidate-1", role: "employee", email: "candidate1@example.test" });
  const second = seedEmployee(db, { id: "candidate-2", role: "employee", email: "candidate2@example.test" });

  const results = await Promise.allSettled([
    updateEmployeeAccess(db, admin, first.id, { role: "owner", expectedRevision: 0 }),
    updateEmployeeAccess(db, admin, second.id, { role: "owner", expectedRevision: 0 }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM employees WHERE role = 'owner'").get().count, 2);
});

test("admin security PIN setup, update, and audit logging without leaking PIN", async (t) => {
  const { db, admin } = fixture(t);
  assert.equal(await hasAdminSecurityPin(db, "store-a"), false);

  // Rejects invalid PIN length (<4 or >6)
  await assert.rejects(
    setAdminSecurityPin(db, admin, { newPin: "123" }),
    (err) => err.code === "invalid_pin_format",
  );
  await assert.rejects(
    setAdminSecurityPin(db, admin, { newPin: "1234567" }),
    (err) => err.code === "invalid_pin_format",
  );

  // Set 4-6 char PIN
  await setAdminSecurityPin(db, admin, { newPin: "2468" });
  assert.equal(await hasAdminSecurityPin(db, "store-a"), true);
  await verifyAdminSecurityPin(db, "store-a", "2468");

  // Reject wrong PIN
  await assert.rejects(
    verifyAdminSecurityPin(db, "store-a", "9999"),
    (err) => err.code === "invalid_pin",
  );

  // Updating PIN requires valid currentPin
  await assert.rejects(
    setAdminSecurityPin(db, admin, { currentPin: "0000", newPin: "135790" }),
    (err) => err.code === "invalid_pin",
  );
  await setAdminSecurityPin(db, admin, { currentPin: "2468", newPin: "135790" });
  await verifyAdminSecurityPin(db, "store-a", "135790");

  // Verify audit event logged and does not contain PIN
  const auditEvents = await loadAdminAudit(db, "store-a", { category: "account" });
  const pinEvents = auditEvents.filter((e) => e.action === "admin.pin_configured");
  assert.equal(pinEvents.length, 2);
  assert.equal("newPin" in pinEvents[0].details, false);
  assert.equal("pin" in pinEvents[0].details, false);
});

test("system admin changes account email and cascades across relational D1 tables", async (t) => {
  const { db, admin } = fixture(t);
  const staff = seedEmployee(db, { id: "staff-email-1", role: "employee", email: "old@example.test", hourlyRate: 30000 });
  const now = "2026-10-14T00:00:00.000Z";

  seedShift(db, { id: "shift-em-1", storeId: "store-a", employeeEmail: "old@example.test" });
  seedAttendanceSession(db, {
    id: "sess-em-1",
    storeId: "store-a",
    employeeEmail: "old@example.test",
    status: "closed",
    openedAt: "2026-10-14T01:00:00.000Z",
    closedAt: "2026-10-14T05:00:00.000Z",
  });
  db.sqlite.prepare(
    `INSERT INTO attendance_corrections (id, session_id, action, previous_time, effective_time, reason, actor_email, created_at)
     VALUES ('corr-em-1', 'sess-em-1', 'check_in', '2026-10-14T01:00:00.000Z', '2026-10-14T01:05:00.000Z', 'Test', 'old@example.test', ?)`,
  ).run(now);
  db.sqlite.prepare(
    `INSERT INTO notifications (id, recipient_email, type, title, created_at)
     VALUES ('notif-em-1', 'old@example.test', 'system', 'Test', ?)`,
  ).run(now);

  const updated = await changeAccountEmail(db, admin, staff.id, {
    newEmail: "new@example.test",
    expectedRevision: 0,
  });
  assert.equal(updated.email, "new@example.test");
  assert.equal(updated.previousEmail, "old@example.test");

  assert.equal(db.sqlite.prepare("SELECT email FROM employees WHERE id = ?").get(staff.id).email, "new@example.test");
  assert.equal(db.sqlite.prepare("SELECT employee_email FROM shifts WHERE id = 'shift-em-1'").get().employee_email, "new@example.test");
  assert.equal(db.sqlite.prepare("SELECT employee_email FROM attendance_sessions WHERE id = 'sess-em-1'").get().employee_email, "new@example.test");
  assert.equal(db.sqlite.prepare("SELECT actor_email FROM attendance_corrections WHERE id = 'corr-em-1'").get().actor_email, "new@example.test");
  assert.equal(db.sqlite.prepare("SELECT recipient_email FROM notifications WHERE id = 'notif-em-1'").get().recipient_email, "new@example.test");

  const auditEvents = await loadAdminAudit(db, "store-a", { category: "account" });
  const emailEvent = auditEvents.find((e) => e.action === "account.email_changed" && e.entity_id === staff.id);
  assert.ok(emailEvent);
  assert.equal(emailEvent.details.previousEmail, "old@example.test");
  assert.equal(emailEvent.details.newEmail, "new@example.test");
});

test("system admin deletes account and all associated data after PIN verification", async (t) => {
  const { db, admin, owner } = fixture(t);
  const now = "2026-10-14T00:00:00.000Z";

  // Seed data for sole owner to verify both owner deletion and full data cascade
  seedShift(db, { id: "shift-del-1", storeId: "store-a", employeeEmail: owner.email });
  seedAttendanceSession(db, {
    id: "sess-del-1",
    storeId: "store-a",
    employeeEmail: owner.email,
    status: "closed",
    openedAt: "2026-10-14T01:00:00.000Z",
    closedAt: "2026-10-14T05:00:00.000Z",
  });
  db.sqlite.prepare(
    `INSERT INTO attendance_corrections (id, session_id, action, previous_time, effective_time, reason, actor_email, created_at)
     VALUES ('corr-del-1', 'sess-del-1', 'check_in', '2026-10-14T01:00:00.000Z', '2026-10-14T01:05:00.000Z', 'Test', ?, ?)`,
  ).run(owner.email, now);
  db.sqlite.prepare(
    `INSERT INTO payroll_adjustments (id, store_id, period_key, employee_email, amount, reason, actor_email, created_at)
     VALUES ('adj-del-1', 'store-a', '2026-10', ?, 50000, 'Bonus', ?, ?)`,
  ).run(owner.email, admin.email, now);
  seedRequest(db, { id: "req-del-1", storeId: "store-a", employeeEmail: owner.email });

  // Cannot delete before PIN is configured
  await assert.rejects(
    deleteAccountAndData(db, admin, owner.id, { pin: "1234" }),
    (err) => err.code === "pin_not_configured",
  );

  await setAdminSecurityPin(db, admin, { newPin: "5678" });

  // Rejects wrong PIN
  await assert.rejects(
    deleteAccountAndData(db, admin, owner.id, { pin: "0000" }),
    (err) => err.code === "invalid_pin",
  );

  // Succeeds with valid PIN
  const deleted = await deleteAccountAndData(db, admin, owner.id, { pin: "5678", reason: "Xóa toàn bộ tài khoản và dữ liệu" });
  assert.equal(deleted.account.email, owner.email);

  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM employees WHERE id = ?").get(owner.id).c, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM shifts WHERE id = 'shift-del-1'").get().c, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM attendance_sessions WHERE id = 'sess-del-1'").get().c, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM attendance_corrections WHERE id = 'corr-del-1'").get().c, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM payroll_adjustments WHERE id = 'adj-del-1'").get().c, 0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS c FROM requests WHERE id = 'req-del-1'").get().c, 0);

  // Triggers remain intact after batch
  const triggerCount = db.sqlite.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger'").get().c;
  assert.equal(triggerCount, 16);

  // Audit event is recorded and shows target_label from metadata even after employee row is deleted
  const auditEvents = await loadAdminAudit(db, "store-a", { category: "account" });
  const deleteEvent = auditEvents.find((e) => e.action === "account.deleted" && e.entity_id === owner.id);
  assert.ok(deleteEvent);
  assert.equal(deleteEvent.target_label, owner.email);
});

test("custom role lifecycle: creation, permission assignment, employee assignment, and archiving safeguards", async (t) => {
  const { db, admin } = fixture(t);
  const barista = seedEmployee(db, { id: "barista-1", role: "employee", email: "barista1@example.test", hourlyRate: 25000 });

  // 1. Creation
  const createKey = crypto.randomUUID();
  const created = await createCustomRole(db, admin, { name: "Giám sát chất lượng", description: "Lead barista & QA" }, createKey);
  assert.ok(created.role.id.startsWith("crole_"));
  assert.equal(created.role.name, "Giám sát chất lượng");
  assert.equal(created.role.revision, 0);

  // Idempotency replay
  const replay = await createCustomRole(db, admin, { name: "Giám sát chất lượng" }, createKey);
  assert.equal(replay.replayed, true);
  assert.equal(replay.role.id, created.role.id);

  // Duplicate name rejected
  await assert.rejects(
    createCustomRole(db, admin, { name: "Giám sát chất lượng" }, crypto.randomUUID()),
    (error) => error.code === "role_name_exists",
  );

  // Initial permissions empty
  const initialPerms = await loadRolePermissions(db, "store-a", created.role.id);
  assert.deepEqual(initialPerms.permissions, []);

  // 2. Permission assignment: entire catalog accessible, dependencies enforced
  await assert.rejects(
    replaceRolePermissions(db, admin, created.role.id, ["requests.leave.review"], 0, "Thiếu people.read", crypto.randomUUID()),
    (error) => error.code === "permission_dependency",
  );

  const permResult = await replaceRolePermissions(
    db,
    admin,
    created.role.id,
    ["people.read", "requests.leave.review", "orders.read", "orders.transition"],
    0,
    "Cấp quyền duyệt nghỉ và xem đơn hàng",
    crypto.randomUUID(),
  );
  assert.equal(permResult.revision, 1);
  const loadedPerms = await loadRolePermissions(db, "store-a", created.role.id);
  assert.ok(loadedPerms.permissions.includes("requests.leave.review"));
  assert.ok(loadedPerms.permissions.includes("orders.transition"));

  // 3. Assign custom role to employee
  const updatedEmployee = await updateEmployeeAccess(db, admin, barista.id, {
    roleId: created.role.id,
    expectedRevision: 0,
    reason: "Thăng cấp giám sát chất lượng",
  });
  assert.equal(updatedEmployee.role_id, created.role.id);

  // 4. Archiving rejected while employees are assigned
  await assert.rejects(
    archiveCustomRole(db, admin, created.role.id, 0, "Lưu trữ vai trò đang dùng", crypto.randomUUID()),
    (error) => error.code === "role_in_use",
  );

  // Unassign employee
  await updateEmployeeAccess(db, admin, barista.id, {
    roleId: null,
    expectedRevision: 1,
    reason: "Chuyển về nhân viên tiêu chuẩn",
  });

  // Archive succeeds
  const archived = await archiveCustomRole(db, admin, created.role.id, 0, "Không còn sử dụng vai trò này", crypto.randomUUID());
  assert.equal(archived.role.status, "archived");

  // Fail-closed: archived role returns 0 permissions
  const postArchivePerms = await loadRolePermissions(db, "store-a", created.role.id);
  assert.equal(postArchivePerms.configured, false);
  assert.deepEqual(postArchivePerms.permissions, []);
});

test("custom role peer approval matrix: permits peer review, blocks self and owner approval", async (t) => {
  const { db, owner } = fixture(t);
  const customActor = {
    id: "lead-1",
    email: "lead1@example.test",
    storeId: "store-a",
    role: "employee",
    roleId: "crole_qa",
    permissions: ["people.read", "requests.leave.review", "attendance.review", "attendance.correct", "payroll.read"],
  };

  // Peer review in same store allowed
  assert.equal(
    canApproveRequest(customActor, {
      type: "leave",
      requesterEmail: "peer@example.test",
      requesterRole: "employee",
    }),
    true,
  );

  // Self-approval blocked
  assert.equal(
    canApproveRequest(customActor, {
      type: "leave",
      requesterEmail: "lead1@example.test",
      requesterRole: "employee",
    }),
    false,
  );

  // Approving owner blocked
  assert.equal(
    canApproveRequest(customActor, {
      type: "leave",
      requesterEmail: "owner@example.test",
      requesterRole: "owner",
    }),
    false,
  );

  // Approving system admin blocked
  assert.equal(
    canApproveRequest(customActor, {
      type: "leave",
      requesterEmail: "admin@example.test",
      requesterRole: "system_admin",
    }),
    false,
  );

  // Service-level target guards on correctAttendance & loadPayrollReport:
  seedEmployee(db, { id: "lead-1", role: "employee", email: "lead1@example.test" });
  const peer = seedEmployee(db, { id: "peer-1", role: "employee", email: "peer@example.test" });

  seedAttendanceSession(db, {
    id: "sess-owner",
    storeId: "store-a",
    employeeEmail: owner.email,
    status: "open",
    openedAt: "2026-10-14T01:00:00.000Z",
  });
  await assert.rejects(
    correctAttendance(db, customActor, {
      sessionId: "sess-owner",
      action: "check_out",
      adjustedTime: "2026-10-14T05:00:00.000Z",
      reason: "Thử sửa công của Owner",
    }),
    (err) => err.code === "forbidden",
  );

  seedAttendanceSession(db, {
    id: "sess-peer",
    storeId: "store-a",
    employeeEmail: peer.email,
    status: "open",
    openedAt: "2026-10-14T01:00:00.000Z",
  });
  const corrected = await correctAttendance(db, customActor, {
    sessionId: "sess-peer",
    action: "check_out",
    adjustedTime: "2026-10-14T05:00:00.000Z",
    reason: "Bổ sung giờ ra ca cho đồng nghiệp cùng cửa hàng",
  });
  assert.equal(corrected.updated, true);

  const reportAll = await loadPayrollReport(db, {
    storeId: "store-a",
    actorEmail: customActor.email,
    actorRole: customActor.role,
    canViewAll: true,
    periodKey: "2026-10",
  });
  assert.ok(reportAll.rows.some((r) => r.email === peer.email));
});


