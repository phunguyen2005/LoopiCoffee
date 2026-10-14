import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";

async function setupTeamRouteTest(t, db, currentActor) {
  const loaded = await loadModule("../../app/api/team/route.ts", {
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
    },
    "@/platform/http/errors": {
      apiHandler,
      ApplicationError,
    },
    "@/platform/http/input": {
      readObject,
    },
    "@/modules/people/application/update-access": {
      updateEmployeeAccess: async () => ({ updated: true }),
    },
  });
  t.after(loaded.dispose);
  return loaded.module;
}

test("team lead GET /api/team succeeds with 200 and returns active store employees", async (t) => {
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

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.employees));

  const employeeIds = body.employees.map((e) => e.id);
  assert.ok(employeeIds.includes("lead-a"), "Team lead should see self");
  assert.ok(employeeIds.includes("emp-active-1"), "Team lead should see active store employee");
  assert.ok(!employeeIds.includes("emp-suspended-1"), "Team lead should NOT see suspended employees");
  assert.ok(!employeeIds.includes("emp-store-b"), "Team lead should NOT see employees from other stores");

  // Verify projection contains only operational lookup fields
  for (const emp of body.employees) {
    assert.ok(emp.id);
    assert.ok(emp.email);
    assert.ok(emp.display_name);
    assert.ok(emp.role);
    assert.equal(emp.status, "active");
    assert.equal(emp.created_at, undefined, "created_at should not be exposed to team lead");
  }
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
  assert.equal(body.error, "forbidden");
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
  assert.equal(body.error, "forbidden");
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
