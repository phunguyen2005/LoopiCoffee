import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedAttendanceSession, seedEmployee, seedStore } from "./helpers/database.mjs";
import { archiveCustomRole, createCustomRole, loadRolePermissions, replaceRolePermissions } from "../modules/people/application/rbac.ts";
import { updateEmployeeAccess } from "../modules/people/application/update-access.ts";
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

test("RBAC catalog rejects forbidden grants and missing dependencies", () => {
  assert.throws(() => validateRolePermissions("team_lead", ["payroll.finalize"]), /permission_not_assignable/);
  assert.throws(() => validateRolePermissions("manager", ["orders.cancel"]), /permission_dependency/);
  assert.deepEqual(validateRolePermissions("manager", ["orders.read", "orders.cancel"]), ["orders.read", "orders.cancel"]);
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

test("system admin cannot demote or suspend the final active owner", async (t) => {
  const { db, admin, owner } = fixture(t);
  await assert.rejects(
    updateEmployeeAccess(db, admin, owner.id, { status: "suspended", expectedRevision: 0, reason: "Điều tra bảo mật" }),
    (error) => error.code === "access_conflict",
  );
  const row = db.sqlite.prepare("SELECT role, status, access_revision FROM employees WHERE id = 'owner'").get();
  assert.equal(row.role, "owner");
  assert.equal(row.status, "active");
  assert.equal(row.access_revision, 0);
});

test("system admin cannot assign a second owner in the same store", async (t) => {
  const { db, admin } = fixture(t);
  const employee = seedEmployee(db, { id: "employee-1", role: "employee", email: "employee1@example.test" });
  await assert.rejects(
    updateEmployeeAccess(db, admin, employee.id, { role: "owner", expectedRevision: 0, reason: "Thử tạo Owner thứ hai" }),
    (error) => error.code === "owner_limit",
  );
  const row = db.sqlite.prepare("SELECT role, access_revision FROM employees WHERE id = 'employee-1'").get();
  assert.equal(row.role, "employee");
  assert.equal(row.access_revision, 0);
});

test("simultaneous owner promotions allow exactly one owner", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const admin = seedEmployee(db, { id: "admin", role: "system_admin", email: "admin@example.test", hourlyRate: null, rateHistory: false });
  const first = seedEmployee(db, { id: "candidate-1", role: "employee", email: "candidate1@example.test" });
  const second = seedEmployee(db, { id: "candidate-2", role: "employee", email: "candidate2@example.test" });

  const results = await Promise.allSettled([
    updateEmployeeAccess(db, admin, first.id, { role: "owner", expectedRevision: 0, reason: "Chọn Owner duy nhất" }),
    updateEmployeeAccess(db, admin, second.id, { role: "owner", expectedRevision: 0, reason: "Chọn Owner duy nhất" }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected")?.reason?.code, "owner_limit");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM employees WHERE role = 'owner'").get().count, 1);
});

test("invited sole owner stays protected until account recovery completes", async (t) => {
  const { db, admin, owner } = fixture(t);
  db.sqlite.prepare("UPDATE employees SET status = 'invited' WHERE id = ?").run(owner.id);
  await assert.rejects(
    updateEmployeeAccess(db, admin, owner.id, { status: "suspended", expectedRevision: 0, reason: "Thử khóa Owner chưa kích hoạt" }),
    (error) => error.code === "access_conflict",
  );
  assert.equal(db.sqlite.prepare("SELECT status FROM employees WHERE id = ?").get(owner.id).status, "invited");
});

test("legacy duplicate owners can be reduced when another active owner remains", async (t) => {
  const { db, admin, owner } = fixture(t);
  seedEmployee(db, { id: "owner-2", role: "owner", email: "owner2@example.test", hourlyRate: null, rateHistory: false });
  const result = await updateEmployeeAccess(db, admin, owner.id, { role: "manager", expectedRevision: 0, reason: "Thay đổi trách nhiệm" });
  assert.equal(result.role, "manager");
  assert.equal(result.access_revision, 1);
});

test("legacy simultaneous owner demotions preserve one active owner", async (t) => {
  const { db, admin, owner } = fixture(t);
  const otherOwner = seedEmployee(db, { id: "owner-2", role: "owner", email: "owner2@example.test", hourlyRate: null, rateHistory: false });
  const results = await Promise.allSettled([
    updateEmployeeAccess(db, admin, owner.id, { role: "manager", expectedRevision: 0, reason: "Chuyển trách nhiệm owner thứ nhất" }),
    updateEmployeeAccess(db, admin, otherOwner.id, { role: "manager", expectedRevision: 0, reason: "Chuyển trách nhiệm owner thứ hai" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM employees WHERE role = 'owner' AND status = 'active'").get().count, 1);
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


