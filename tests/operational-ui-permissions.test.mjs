import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";

async function setupTeamRouteTest(t, db, currentActor, supabaseAdminOverrides = {}) {
  const loaded = await loadModule("../../app/api/team/route.ts", {
    "@/db/runtime": {
      ensureDatabase: async () => db,
    },
    "@/server/auth": {
      invalidateIdentityCache: () => {},
      requireApiUser: async (roles) => {
        if (!currentActor) {
          return { response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) };
        }
        if (roles && !roles.includes(currentActor.role)) {
          return { response: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }) };
        }
        return { actor: currentActor };
      },
    },
    "@/platform/http/errors": {
      apiHandler,
      ApplicationError,
    },
    "@/platform/http/input": {
      readObject,
    },
    "@/modules/people/application/update-access": {
      updateEmployeeAccess: async (targetDb, _actor, employeeId, change) => {
        const current = targetDb.sqlite.prepare(
          "SELECT status, access_revision FROM employees WHERE id = ?",
        ).get(employeeId);
        const status = change.status ?? current.status;
        targetDb.sqlite.prepare(
          "UPDATE employees SET status = ?, access_revision = access_revision + 1 WHERE id = ?",
        ).run(status, employeeId);
        return { status, access_revision: current.access_revision + 1 };
      },
    },
    "@/lib/supabase/server": {
      createAdmin: () => ({
        auth: {
          admin: {
            createUser: async () => ({ data: { user: { id: "test-auth-user-id" } }, error: null }),
            inviteUserByEmail: async () => ({ data: { user: { id: "test-auth-user-id" } }, error: null }),
            listUsers: async () => ({ data: { users: [] }, error: null }),
            updateUserById: async () => ({ error: null }),
            deleteUser: async () => ({ error: null }),
            ...supabaseAdminOverrides,
          },
        },
      }),
    },
  });
  t.after(loaded.dispose);
  return loaded.module;
}

async function setupStoreRouteTest(t, db, currentActor) {
  const loaded = await loadModule("../../app/api/store/route.ts", {
    "@/db/runtime": {
      ensureDatabase: async () => db,
    },
    "@/server/auth": {
      requireApiUser: async (roles) => {
        if (!currentActor) {
          return { response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }) };
        }
        if (roles && !roles.includes(currentActor.role)) {
          return { response: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }) };
        }
        return { actor: currentActor };
      },
      auditStatement: () => db.prepare("SELECT 1"),
    },
    "@/platform/http/errors": {
      apiHandler,
      ApplicationError,
    },
    "@/platform/http/input": {
      readObject,
    },
    "@/lib/attendance": {
      isCoordinate: (val, min, max) => typeof val === "number" && !Number.isNaN(val) && val >= min && val <= max,
    },
  });
  t.after(loaded.dispose);
  return loaded.module;
}


test("team lead GET /api/team is denied without people.read", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());

  seedStore(db, "store-a");
  seedStore(db, "store-b");

  // Store A employees
  const lead = seedEmployee(db, { id: "lead-a", storeId: "store-a", role: "team_lead", status: "active" });
  seedEmployee(db, { id: "emp-active-1", storeId: "store-a", role: "employee", status: "active" });
  seedEmployee(db, { id: "emp-suspended-1", storeId: "store-a", role: "employee", status: "suspended" });

  // Store B employees (different store)
  seedEmployee(db, { id: "emp-store-b", storeId: "store-b", role: "employee", status: "active" });

  const route = await setupTeamRouteTest(t, db, lead);
  const response = await route.GET();

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "permission_denied");
});
test("team lead PATCH /api/team returns 403 forbidden", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const lead = seedEmployee(db, { id: "lead-a", storeId: "store-a", role: "team_lead", status: "active" });

  const route = await setupTeamRouteTest(t, db, lead);
  const request = new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "emp-active-1", role: "manager" }),
  });
  const response = await route.PATCH(request);

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "permission_denied");
});

test("employee GET /api/team returns 403 forbidden", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const employee = seedEmployee(db, { id: "emp-1", storeId: "store-a", role: "employee", status: "active" });

  const route = await setupTeamRouteTest(t, db, employee);
  const response = await route.GET();

  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "permission_denied");
});

test("unauthenticated GET /api/team returns 401 unauthorized", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());

  const route = await setupTeamRouteTest(t, db, null);
  const response = await route.GET();

  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, "unauthorized");
});

test("owner GET /api/team succeeds with 200 and returns all store employees including inactive and created_at", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");

  const owner = seedEmployee(db, { id: "owner-a", storeId: "store-a", role: "owner", status: "active" });
  seedEmployee(db, { id: "emp-active", storeId: "store-a", role: "employee", status: "active" });
  seedEmployee(db, { id: "emp-suspended", storeId: "store-a", role: "employee", status: "suspended" });

  const route = await setupTeamRouteTest(t, db, owner);
  const response = await route.GET();

  assert.equal(response.status, 200);
  const body = await response.json();
  const ids = body.employees.map((e) => e.id);
  assert.ok(ids.includes("owner-a"));
  assert.ok(ids.includes("emp-active"));
  assert.ok(ids.includes("emp-suspended"), "Owner should see suspended employees");

  const suspended = body.employees.find((e) => e.id === "emp-suspended");
  assert.ok(suspended.created_at, "Owner receives created_at timestamp");
});

test("schedulable team query returns only active employees who participate in attendance", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-schedule", storeId: "store-a", role: "owner", status: "active" });
  const active = seedEmployee(db, { id: "active-schedule", storeId: "store-a", role: "employee", status: "active" });
  seedEmployee(db, { id: "suspended-schedule", storeId: "store-a", role: "employee", status: "suspended" });
  seedEmployee(db, { id: "offboarded-schedule", storeId: "store-a", role: "employee", status: "offboarded" });
  const excluded = seedEmployee(db, { id: "no-attendance-schedule", storeId: "store-a", role: "employee", status: "active" });
  db.sqlite.prepare("UPDATE employees SET participates_attendance = 0 WHERE id = ?").run(excluded.id);
  const route = await setupTeamRouteTest(t, db, owner);

  const response = await route.GET(new Request("http://localhost/api/team?schedulable=1"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  const ids = payload.employees.map((employee) => employee.id);
  assert.ok(ids.includes(active.id));
  assert.ok(!ids.includes("suspended-schedule"));
  assert.ok(!ids.includes("offboarded-schedule"));
  assert.ok(!ids.includes(excluded.id));
});

test("owner POST /api/team creates a new employee account with role and compensation", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-a", storeId: "store-a", role: "owner", status: "active" });

  const route = await setupTeamRouteTest(t, db, owner);
  const request = new Request("http://localhost/api/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "newbarista@loopicafe.test",
      displayName: "Nguyễn Văn Mới",
      role: "employee",
      roleId: null,
      jobTitle: "Barista Part-time",
      phone: "0901234567",
      startDate: "2026-10-20",
      participatesAttendance: true,
      payrollEligible: true,
      compensationType: "hourly",
      hourlyRate: 30000,
      activationMethod: "temporary_password",
      reason: "Tuyển thêm bạn pha chế",
    }),
  });

  const response = await route.POST(request);
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.ok(data.account);
  assert.equal(data.account.email, "newbarista@loopicafe.test");
  assert.equal(data.account.role, "employee");
  assert.equal(data.account.hourly_rate, 30000);
  assert.ok(data.temporaryPassword, "Temporary password must be generated");

  // Verify in database
  const inDb = db.sqlite.prepare("SELECT email, display_name, role, hourly_rate FROM employees WHERE email = ?").get("newbarista@loopicafe.test");
  assert.ok(inDb);
  assert.equal(inDb.display_name, "Nguyễn Văn Mới");
  assert.equal(inDb.role, "employee");
  assert.equal(inDb.hourly_rate, 30000);
});

test("manager POST /api/team returns 403 forbidden", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const manager = seedEmployee(db, { id: "mgr-a", storeId: "store-a", role: "manager", status: "active" });

  const route = await setupTeamRouteTest(t, db, manager);
  const request = new Request("http://localhost/api/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "unauthorized@loopicafe.test",
      displayName: "Hack Attempt",
      role: "employee",
    }),
  });

  const response = await route.POST(request);
  assert.equal(response.status, 403);
});

test("owner PATCH /api/team can assign a new role to an employee", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-a", storeId: "store-a", role: "owner", status: "active" });
  seedEmployee(db, { id: "emp-promoted", storeId: "store-a", role: "employee", status: "active" });

  const route = await setupTeamRouteTest(t, db, owner);
  const expectedUpdatedAt = db.sqlite.prepare("SELECT updated_at FROM employees WHERE id = 'emp-promoted'").get().updated_at;

  const request = new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "emp-promoted",
      role: "team_lead",
      roleId: null,
      jobTitle: "Trưởng ca vận hành",
      expectedUpdatedAt,
      reason: "Thăng chức lên trưởng ca",
    }),
  });

  const response = await route.PATCH(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.role, "team_lead");

  const inDb = db.sqlite.prepare("SELECT role, job_title FROM employees WHERE id = 'emp-promoted'").get();
  assert.equal(inDb.role, "team_lead");
  assert.equal(inDb.job_title, "Trưởng ca vận hành");
});

test("owner can suspend an employee and remove access to new scheduling", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-status", storeId: "store-a", role: "owner", status: "active" });
  const employee = seedEmployee(db, { id: "employee-status", storeId: "store-a", role: "employee", status: "active" });
  let banDuration = "";
  const route = await setupTeamRouteTest(t, db, owner, {
    updateUserById: async (_id, attributes) => {
      banDuration = attributes.ban_duration;
      return { error: null };
    },
  });

  const response = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: employee.id,
      action: "update_status",
      status: "suspended",
      expectedRevision: 0,
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "suspended");
  assert.equal(banDuration, "876000h");
  assert.equal(db.sqlite.prepare("SELECT status FROM employees WHERE id = ?").get(employee.id).status, "suspended");
});

test("owner PATCH /api/team can update employee status and profile simultaneously in save flow", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-status-save", storeId: "store-a", role: "owner", status: "active" });
  const employee = seedEmployee(db, { id: "employee-status-save", storeId: "store-a", role: "employee", status: "active" });
  let banDuration = null;
  const route = await setupTeamRouteTest(t, db, owner, {
    updateUserById: async (_id, attributes) => {
      banDuration = attributes.ban_duration;
      return { error: null };
    },
  });

  const response = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: employee.id,
      expectedUpdatedAt: "2026-07-01T00:00:00.000Z",
      displayName: "Nhân viên Đã Đổi Trạng Thái",
      status: "suspended",
      expectedRevision: 0,
    }),
  }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.status, "suspended");
  assert.equal(banDuration, "876000h");
  assert.equal(db.sqlite.prepare("SELECT status, display_name FROM employees WHERE id = ?").get(employee.id).status, "suspended");
  assert.equal(db.sqlite.prepare("SELECT display_name FROM employees WHERE id = ?").get(employee.id).display_name, "Nhân viên Đã Đổi Trạng Thái");
});

test("owner PATCH /api/team still requires a reason for role and payroll changes", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-sensitive-profile", storeId: "store-a", role: "owner", status: "active" });
  const employee = seedEmployee(db, { id: "employee-sensitive-profile", storeId: "store-a", role: "employee", status: "active" });
  const route = await setupTeamRouteTest(t, db, owner);
  const expectedUpdatedAt = db.sqlite.prepare("SELECT updated_at FROM employees WHERE id = ?").get(employee.id).updated_at;

  const staleStatusResponse = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employee.id, expectedUpdatedAt, status: "suspended" }),
  }));
  assert.equal(staleStatusResponse.status, 400);
  assert.equal((await staleStatusResponse.json()).code, "account_conflict");

  const roleResponse = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employee.id, expectedUpdatedAt, role: "team_lead" }),
  }));
  assert.equal(roleResponse.status, 400);
  assert.equal((await roleResponse.json()).code, "reason_required");

  const payrollResponse = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employee.id, expectedUpdatedAt, payrollEligible: true, compensationType: "hourly", hourlyRate: 30000 }),
  }));
  assert.equal(payrollResponse.status, 400);
  assert.equal((await payrollResponse.json()).code, "reason_required");
});

test("manager cannot update employee account status through the team route", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const manager = seedEmployee(db, { id: "manager-status", storeId: "store-a", role: "manager", status: "active" });
  const employee = seedEmployee(db, { id: "employee-manager-status", storeId: "store-a", role: "employee", status: "active" });
  const route = await setupTeamRouteTest(t, db, manager);
  const response = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employee.id, action: "update_status", status: "suspended", expectedRevision: 0, reason: "Thử khóa tài khoản" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(db.sqlite.prepare("SELECT status FROM employees WHERE id = ?").get(employee.id).status, "active");
});

test("owner can reset an existing employee password and force a change on next login", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-reset", storeId: "store-a", role: "owner", status: "active" });
  const employee = seedEmployee(db, { id: "employee-reset", storeId: "store-a", role: "employee", status: "active", mustChangePassword: false });
  const route = await setupTeamRouteTest(t, db, owner);

  const response = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employee.id, action: "reset_password", reason: "Nhân viên quên mật khẩu đăng nhập" }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(typeof payload.temporaryPassword, "string");
  assert.ok(payload.temporaryPassword.length >= 10);
  const account = db.sqlite.prepare("SELECT must_change_password, password_reset_pending, password_version FROM employees WHERE id = ?").get(employee.id);
  assert.equal(account.must_change_password, 1);
  assert.equal(account.password_reset_pending, 0);
  assert.equal(account.password_version, 1);
  const audit = db.sqlite.prepare("SELECT metadata FROM audit_events WHERE entity_id = ? AND action = 'account.password_reset'").get(employee.id);
  assert.match(audit.metadata, /Nhân viên quên mật khẩu/);
});

test("owner password reset repairs an employee whose Auth identity was lost", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-repair", storeId: "store-a", role: "owner", status: "active" });
  const employee = seedEmployee(db, { id: "employee-repair", storeId: "store-a", role: "employee", status: "active" });
  db.sqlite.prepare("UPDATE employees SET email = ?, auth_user_id = ? WHERE id = ?")
    .run("lost-auth@loopicafe.test", "stale-auth-id", employee.id);
  let createdPassword = "";
  const route = await setupTeamRouteTest(t, db, owner, {
    updateUserById: async (id) => id === "stale-auth-id"
      ? { error: { status: 404, code: "user_not_found", message: "User not found" } }
      : { error: null },
    listUsers: async () => ({ data: { users: [] }, error: null }),
    createUser: async ({ password }) => {
      createdPassword = password;
      return { data: { user: { id: "repaired-auth-id" } }, error: null };
    },
  });

  const response = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employee.id, action: "reset_password", reason: "Khôi phục tài khoản bị mất liên kết" }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(createdPassword, payload.temporaryPassword);
  const account = db.sqlite.prepare("SELECT auth_user_id, must_change_password, password_reset_pending FROM employees WHERE id = ?").get(employee.id);
  assert.equal(account.auth_user_id, "repaired-auth-id");
  assert.equal(account.must_change_password, 1);
  assert.equal(account.password_reset_pending, 0);
});

test("manager cannot reset another employee password even with people.update", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const manager = seedEmployee(db, { id: "manager-reset", storeId: "store-a", role: "manager", status: "active" });
  const employee = seedEmployee(db, { id: "employee-protected", storeId: "store-a", role: "employee", status: "active" });
  const route = await setupTeamRouteTest(t, db, manager);
  const response = await route.PATCH(new Request("http://localhost/api/team", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: employee.id, action: "reset_password", reason: "Thử cấp lại mật khẩu" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(db.sqlite.prepare("SELECT password_version FROM employees WHERE id = ?").get(employee.id).password_version, 0);
});

test("team and profile UI expose owner reset and verified self-service password change", async () => {
  const teamSource = await readFile(new URL("../components/operational/team-view.tsx", import.meta.url), "utf8");
  const profileSource = await readFile(new URL("../components/operational/profile-view.tsx", import.meta.url), "utf8");
  const scheduleSource = await readFile(new URL("../components/operational/schedule-view.tsx", import.meta.url), "utf8");
  assert.match(teamSource, /Cấp lại mật khẩu tạm/);
  assert.match(teamSource, /action:\s*"reset_password"/);
  assert.match(teamSource, /action:\s*"update_status"/);
  assert.match(teamSource, /Đã nghỉ việc/);
  assert.match(teamSource, /resetCredential\.password/);
  assert.match(teamSource, /onClick=\{\(\) => void copyText\(resetCredential\.password\)\}/);
  assert.match(teamSource, /fallbackCopy\(text\)/);
  assert.match(profileSource, /\/api\/auth\/verify-change-password/);
  assert.match(profileSource, /currentPassword/);
  assert.match(scheduleSource, /\/api\/team\?schedulable=1/);
});

test("owner-orders-view implements error handling, retry state, stale warning banner, and single-flight polling", async () => {
  const source = await readFile(new URL("../components/operational/owner-orders-view.tsx", import.meta.url), "utf8");

  // Error state and request sequencing ref
  assert.match(source, /ordersError,\s*setOrdersError/);
  assert.match(source, /LatestRequestGate/);
  assert.match(source, /ordersRequestGateRef\.current\.isCurrent/);

  // Single-flight polling with recursive setTimeout instead of setInterval
  assert.doesNotMatch(source, /setInterval\s*\(/, "setInterval should be replaced with recursive setTimeout single-flight polling");
  assert.match(source, /pollTimer\s*=\s*setTimeout\s*\(\s*poll,\s*4000\s*\)/);

  // Stale data warning banner when orders exist and polling fails
  assert.match(source, /orders\.length\s*>\s*0\s*&&\s*ordersError/);
  assert.match(source, /Dữ liệu có thể chưa được cập nhật mới nhất/);

  // Error state card when orders are empty and error occurs (instead of misleading empty state)
  assert.match(source, /orders\.length\s*===\s*0\s*&&\s*ordersError/);
  assert.match(source, /Không thể tải danh sách đơn hàng/);
  assert.match(source, /Phiên đăng nhập đã hết hạn/);
  assert.match(source, /Thử lại/);
});

test("schedule-view prevents out-of-order stale responses during week navigation with sequence ref and AbortController", async () => {
  const source = await readFile(new URL("../components/operational/schedule-view.tsx", import.meta.url), "utf8");

  // Sequence tracking ref and abort controller
  assert.match(source, /scheduleSeqRef\s*=\s*useRef\(0\)/);
  assert.match(source, /abortControllerRef\s*=\s*useRef/);

  // AbortController creation and signal passing
  assert.match(source, /new\s+AbortController\(\)/);
  assert.match(source, /signal\.aborted/);
  assert.match(source, /currentSeq\s*!==\s*scheduleSeqRef\.current/);
  assert.match(source, /fetch\([^)]*signal[^)]*\)/);
});

test("attendance rules time inputs are number-only, blocking text input and serializing as numbers", async () => {
  const [settingsView, shared] = await Promise.all([
    readFile(new URL("../components/operational/settings-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/operational/shared.tsx", import.meta.url), "utf8"),
  ]);

  // PersistentStoreSettingsView: all 5 attendance rule inputs configured with type="number" and onlyNumbers
  assert.match(settingsView, /id="early-checkin"[\s\S]*?type="number"[\s\S]*?min=\{0\}[\s\S]*?max=\{180\}[\s\S]*?step=\{1\}[\s\S]*?onlyNumbers/);
  assert.match(settingsView, /id="late"[\s\S]*?type="number"[\s\S]*?min=\{0\}[\s\S]*?max=\{180\}[\s\S]*?step=\{1\}[\s\S]*?onlyNumbers/);
  assert.match(settingsView, /id="early-departure"[\s\S]*?type="number"[\s\S]*?min=\{0\}[\s\S]*?max=\{240\}[\s\S]*?step=\{1\}[\s\S]*?onlyNumbers/);
  assert.match(settingsView, /id="absence"[\s\S]*?type="number"[\s\S]*?min=\{1\}[\s\S]*?max=\{720\}[\s\S]*?step=\{1\}[\s\S]*?onlyNumbers/);
  assert.match(settingsView, /id="missing-checkout"[\s\S]*?type="number"[\s\S]*?min=\{1\}[\s\S]*?max=\{720\}[\s\S]*?step=\{1\}[\s\S]*?onlyNumbers/);

  // State sanitization & payload numeric serialization
  assert.match(settingsView, /value\.replace\(\/\\D\/g,\s*""\)/);
  assert.match(settingsView, /Number\.parseInt\(form\.earlyCheckinMinutes,\s*10\)/);
  assert.match(settingsView, /earlyCheckinMinutes:\s*earlyCheckin/);

  // InputField in shared.tsx enforces non-numeric key blocking and sanitization
  assert.match(shared, /const isNumeric = type === "number" \|\| onlyNumbers/);
  assert.ok(shared.includes("!/^\\d$/.test(event.key)"));
  assert.match(shared, /handlePaste/);
  assert.match(shared, /raw\.replace\(\/\\D\/g,\s*""\)/);
  assert.match(shared, /inputMode=\{isNumeric \? "numeric" : undefined\}/);
  assert.match(shared, /pattern=\{isNumeric \? "\[0-9\]\*" : undefined\}/);
});

test("store route rejects non-numeric and empty-string attendance rule values and accepts valid numbers", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const owner = seedEmployee(db, { id: "owner-a", storeId: "store-a", role: "owner", status: "active" });

  const route = await setupStoreRouteTest(t, db, owner);

  // 1. Text string in attendance rule minutes is rejected with 400
  const reqText = new Request("http://localhost/api/store", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "LoopyCafe Test",
      address: "123 Le Loi, TP.HCM",
      latitude: 10.75,
      longitude: 106.66,
      geofenceRadiusMeters: 100,
      wifiSsid: "LoopyWiFi",
      wifiPublicIp: "127.0.0.1",
      timezone: "Asia/Ho_Chi_Minh",
      earlyCheckinMinutes: "not-a-number",
      lateMinutes: 5,
      earlyDepartureMinutes: 5,
      absenceMinutes: 60,
      missingCheckoutMinutes: 240,
    }),
  });
  const resText = await route.PATCH(reqText);
  assert.equal(resText.status, 400);

  // 2. Empty string in attendance rule minutes is rejected with 400
  const reqEmpty = new Request("http://localhost/api/store", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "LoopyCafe Test",
      address: "123 Le Loi, TP.HCM",
      latitude: 10.75,
      longitude: 106.66,
      geofenceRadiusMeters: 100,
      wifiSsid: "LoopyWiFi",
      wifiPublicIp: "127.0.0.1",
      timezone: "Asia/Ho_Chi_Minh",
      earlyCheckinMinutes: "",
      lateMinutes: 5,
      earlyDepartureMinutes: 5,
      absenceMinutes: 60,
      missingCheckoutMinutes: 240,
    }),
  });
  const resEmpty = await route.PATCH(reqEmpty);
  assert.equal(resEmpty.status, 400);

  // 3. Valid numeric values succeed with 200
  const reqValid = new Request("http://localhost/api/store", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "LoopyCafe Test",
      address: "123 Le Loi, TP.HCM",
      latitude: 10.75,
      longitude: 106.66,
      geofenceRadiusMeters: 100,
      wifiSsid: "LoopyWiFi",
      wifiPublicIp: "127.0.0.1",
      timezone: "Asia/Ho_Chi_Minh",
      earlyCheckinMinutes: 20,
      lateMinutes: 10,
      earlyDepartureMinutes: 10,
      absenceMinutes: 90,
      missingCheckoutMinutes: 300,
    }),
  });
  const resValid = await route.PATCH(reqValid);
  assert.equal(resValid.status, 200);
  const dataValid = await resValid.json();
  assert.equal(dataValid.updated, true);
});
