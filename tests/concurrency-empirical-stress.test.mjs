import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";
import { LatestRequestGate } from "../platform/http/latest-request.ts";

// =============================================================================
// SUITE 1: EMPIRICAL STRESS TEST - OWNER ORDERS VIEW ASYNC POLLING CONCURRENCY
// =============================================================================

function createOrdersPollingHarness(fetchFn) {
  let orders = [];
  let counts = { total: 0, pending: 0 };
  let loadingOrders = false;
  let ordersError = null;
  const gate = new LatestRequestGate();

  const fetchOrders = async (isPolling = false) => {
    const currentReqId = gate.begin();
    if (!isPolling) loadingOrders = true;

    try {
      const res = await fetchFn(currentReqId);
      if (!gate.isCurrent(currentReqId)) return;

      if (res.ok) {
        const data = await res.json();
        if (!gate.isCurrent(currentReqId)) return;

        orders = data.orders || [];
        ordersError = null;
        counts = data.counts || { total: 0, pending: 0 };
      } else {
        let errorMsg = "Không thể tải danh sách đơn hàng. Vui lòng thử lại.";
        let code;
        try {
          const errPayload = await res.json();
          if (errPayload.error) errorMsg = errPayload.error;
          if (errPayload.code) code = errPayload.code;
        } catch {
          // ignore
        }
        if (!gate.isCurrent(currentReqId)) return;
        ordersError = { message: errorMsg, status: res.status, code };
      }
    } catch {
      if (!gate.isCurrent(currentReqId)) return;
      ordersError = { message: "Không thể tải danh sách đơn hàng. Vui lòng thử lại." };
    } finally {
      if (gate.isCurrent(currentReqId) && !isPolling) {
        loadingOrders = false;
      }
    }
  };

  return {
    fetchOrders,
    getState: () => ({ orders, counts, loadingOrders, ordersError }),
    unmount: () => {
      gate.cancel();
    },
  };
}

test("Empirical: Out-of-order poll response (Req 1 slow, Req 2 fast) cannot overwrite newer state", async () => {
  const responses = {
    1: { delay: 100, data: { ok: true, orders: [{ id: "order-v1", status: "pending" }], counts: { total: 1, pending: 1 } } },
    2: { delay: 20, data: { ok: true, orders: [{ id: "order-v2", status: "accepted" }], counts: { total: 1, pending: 0 } } },
  };

  const mockFetch = (reqId) =>
    new Promise((resolve) => {
      const cfg = responses[reqId];
      setTimeout(() => {
        resolve({
          ok: cfg.data.ok,
          status: 200,
          json: async () => cfg.data,
        });
      }, cfg.delay);
    });

  const harness = createOrdersPollingHarness(mockFetch);

  // Dispatch Req 1 (slow)
  const p1 = harness.fetchOrders(true);
  // Dispatch Req 2 (fast) after 10ms
  await new Promise((r) => setTimeout(r, 10));
  const p2 = harness.fetchOrders(true);

  await Promise.all([p1, p2]);

  const state = harness.getState();
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].id, "order-v2", "Out-of-order Req 1 must NOT overwrite Req 2 state");
  assert.equal(state.orders[0].status, "accepted");
  assert.equal(state.counts.pending, 0);
  assert.equal(state.ordersError, null);
});

test("Empirical: Heavy fuzzing / Monte Carlo (50 concurrent random-latency order poll requests)", async () => {
  const mockFetch = (reqId) => {
    // Latency inversely proportional to reqId plus random jitter
    const latency = Math.floor(Math.random() * 80) + (reqId === 50 ? 5 : 20);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ok: true,
          status: 200,
          json: async () => ({
            orders: [{ id: `order-req-${reqId}`, version: reqId }],
            counts: { total: reqId, pending: 0 },
          }),
        });
      }, latency);
    });
  };

  const harness = createOrdersPollingHarness(mockFetch);
  const promises = [];

  for (let i = 1; i <= 50; i++) {
    promises.push(harness.fetchOrders(true));
    // Tiny jitter between dispatches
    if (i % 5 === 0) {
      await new Promise((r) => setTimeout(r, 2));
    }
  }

  await Promise.all(promises);

  const state = harness.getState();
  assert.equal(state.orders.length, 1);
  assert.equal(
    state.orders[0].id,
    "order-req-50",
    "Final committed state must strictly match the latest dispatched request ID (50)",
  );
  assert.equal(state.counts.total, 50);
});

test("Empirical: Stale error (Req 1 slow 500) does not overwrite newer successful response (Req 2 fast 200)", async () => {
  const mockFetch = (reqId) =>
    new Promise((resolve) => {
      if (reqId === 1) {
        // Slow error response
        setTimeout(() => {
          resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: "Server exploded" }),
          });
        }, 120);
      } else {
        // Fast success response
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => ({
              orders: [{ id: "order-live", status: "ready" }],
              counts: { total: 1, pending: 0 },
            }),
          });
        }, 20);
      }
    });

  const harness = createOrdersPollingHarness(mockFetch);
  const p1 = harness.fetchOrders(true);
  await new Promise((r) => setTimeout(r, 10));
  const p2 = harness.fetchOrders(true);

  await Promise.all([p1, p2]);

  const state = harness.getState();
  assert.equal(state.orders.length, 1);
  assert.equal(state.orders[0].id, "order-live");
  assert.equal(state.ordersError, null, "Stale 500 error must NOT overwrite active success state");
});

test("Empirical: Unmount cancellation prevents memory leak and state updates on unmounted view", async () => {
  let resolved = false;
  const mockFetch = () =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve({
          ok: true,
          status: 200,
          json: async () => ({ orders: [{ id: "after-unmount" }] }),
        });
      }, 50);
    });

  const harness = createOrdersPollingHarness(mockFetch);
  const p = harness.fetchOrders(false);

  // Unmount immediately
  harness.unmount();
  await p;

  assert.ok(resolved);
  const state = harness.getState();
  assert.equal(state.orders.length, 0, "No state change must occur after unmount");
});

// =============================================================================
// SUITE 2: EMPIRICAL STRESS TEST - SCHEDULE VIEW FAST WEEK NAVIGATION & ABORT
// =============================================================================

function createScheduleHarness(fetchShiftsFn) {
  let shifts = [];
  let loadState = "loading";
  const scheduleSeqRef = { current: 0 };
  const abortControllerRef = { current: null };
  const abortedSignals = [];

  const loadSchedule = async (weekKey, showLoading = true) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;
    abortedSignals.push(signal);
    const currentSeq = ++scheduleSeqRef.current;

    if (showLoading) loadState = "loading";

    try {
      const shiftResponse = await fetchShiftsFn(weekKey, signal);
      if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;

      const shiftPayload = await shiftResponse.json();
      if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;
      if (!shiftResponse.ok) throw new Error(shiftPayload.error ?? "Không thể tải lịch làm việc.");

      shifts = (shiftPayload.shifts ?? []).filter((s) => s.status !== "cancelled");
      loadState = "ready";
    } catch {
      if (signal.aborted || currentSeq !== scheduleSeqRef.current) {
        return;
      }
      loadState = "error";
    }
  };

  return {
    loadSchedule,
    getState: () => ({ shifts, loadState }),
    getAbortedSignals: () => abortedSignals,
  };
}

test("Empirical: Fast week switching aborts stale requests and does not display out-of-date schedule data", async () => {
  const weekLatencies = {
    "week-1": 200,
    "week-2": 150,
    "week-3": 100,
    "week-4": 30,
  };

  const mockFetchShifts = (weekKey, signal) =>
    new Promise((resolve, reject) => {
      const delay = weekLatencies[weekKey];
      const timer = setTimeout(() => {
        if (signal.aborted) {
          reject(new DOMException("The operation was aborted", "AbortError"));
          return;
        }
        resolve({
          ok: true,
          status: 200,
          json: async () => ({
            shifts: [{ id: `shift-${weekKey}`, week: weekKey, status: "scheduled" }],
          }),
        });
      }, delay);

      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("The operation was aborted", "AbortError"));
      });
    });

  const harness = createScheduleHarness(mockFetchShifts);

  // Fast navigation through 4 weeks
  const p1 = harness.loadSchedule("week-1", true);
  await new Promise((r) => setTimeout(r, 5));
  const p2 = harness.loadSchedule("week-2", true);
  await new Promise((r) => setTimeout(r, 5));
  const p3 = harness.loadSchedule("week-3", true);
  await new Promise((r) => setTimeout(r, 5));
  const p4 = harness.loadSchedule("week-4", true);

  await Promise.allSettled([p1, p2, p3, p4]);

  const state = harness.getState();
  const signals = harness.getAbortedSignals();

  // Signals 0, 1, 2 (Weeks 1, 2, 3) must be aborted
  assert.equal(signals[0].aborted, true, "Week 1 request must be aborted");
  assert.equal(signals[1].aborted, true, "Week 2 request must be aborted");
  assert.equal(signals[2].aborted, true, "Week 3 request must be aborted");
  assert.equal(signals[3].aborted, false, "Week 4 request must NOT be aborted");

  // State must reflect Week 4 only
  assert.equal(state.loadState, "ready", "loadState must be ready, not error");
  assert.equal(state.shifts.length, 1);
  assert.equal(state.shifts[0].id, "shift-week-4", "Out-of-date weeks must NOT overwrite Week 4 data");
});

test("Empirical: Monte Carlo week switching stress test (30 rapid week navigation events)", async () => {
  const mockFetchShifts = (weekKey, signal) =>
    new Promise((resolve, reject) => {
      const latency = Math.floor(Math.random() * 60) + 10;
      const timer = setTimeout(() => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        resolve({
          ok: true,
          status: 200,
          json: async () => ({
            shifts: [{ id: `shift-w${weekKey}`, week: weekKey, status: "scheduled" }],
          }),
        });
      }, latency);

      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });

  const harness = createScheduleHarness(mockFetchShifts);
  const promises = [];

  for (let i = 1; i <= 30; i++) {
    promises.push(harness.loadSchedule(i, true));
    if (i % 6 === 0) {
      await new Promise((r) => setTimeout(r, 4));
    }
  }

  await Promise.allSettled(promises);

  const state = harness.getState();
  assert.equal(state.loadState, "ready");
  assert.equal(state.shifts.length, 1);
  assert.equal(state.shifts[0].id, "shift-w30", "Final schedule shifts must strictly match latest week navigation (30)");
});

// =============================================================================
// SUITE 3: RBAC & PERMISSION MATRIX FOR /api/team
// =============================================================================

async function setupTeamRoute(t, db, currentActor) {
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

test("Empirical RBAC: /api/team full role and method permission matrix", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());

  seedStore(db, "store-alpha");
  seedStore(db, "store-beta");

  const leadAlpha = seedEmployee(db, { id: "lead-alpha", storeId: "store-alpha", role: "team_lead", status: "active" });
  const empActiveAlpha = seedEmployee(db, { id: "emp-active-alpha", storeId: "store-alpha", role: "employee", status: "active" });
  seedEmployee(db, { id: "emp-suspended-alpha", storeId: "store-alpha", role: "employee", status: "suspended" });
  seedEmployee(db, { id: "emp-beta", storeId: "store-beta", role: "employee", status: "active" });

  const managerAlpha = seedEmployee(db, { id: "mgr-alpha", storeId: "store-alpha", role: "manager", status: "active" });
  const ownerAlpha = seedEmployee(db, { id: "owner-alpha", storeId: "store-alpha", role: "owner", status: "active" });

  // 1. Team lead GET -> 200, active store employees only
  {
    const route = await setupTeamRoute(t, db, leadAlpha);
    const res = await route.GET();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.employees));

    const returnedIds = body.employees.map((e) => e.id);
    assert.deepEqual(
      returnedIds.sort(),
      ["emp-active-alpha", "lead-alpha", "mgr-alpha", "owner-alpha"].sort(),
      "Team lead must receive all active employees in the store",
    );
    assert.ok(!returnedIds.includes("emp-suspended-alpha"), "Team lead must NOT receive suspended employees");
    assert.ok(!returnedIds.includes("emp-beta"), "Team lead must NOT receive employees from other stores");

    // Strict projection check: no created_at or other non-lookup fields
    for (const emp of body.employees) {
      assert.equal(emp.created_at, undefined);
      assert.equal(emp.status, "active");
    }
  }

  // 2. Team lead PATCH -> 403 Forbidden
  {
    const route = await setupTeamRoute(t, db, leadAlpha);
    const req = new Request("http://localhost/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "emp-active-alpha", role: "manager" }),
    });
    const res = await route.PATCH(req);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "forbidden");
  }

  // 3. Employee GET -> 403 Forbidden
  {
    const route = await setupTeamRoute(t, db, empActiveAlpha);
    const res = await route.GET();
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "forbidden");
  }

  // 4. Employee PATCH -> 403 Forbidden
  {
    const route = await setupTeamRoute(t, db, empActiveAlpha);
    const req = new Request("http://localhost/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "emp-active-alpha", role: "owner" }),
    });
    const res = await route.PATCH(req);
    assert.equal(res.status, 403);
  }

  // 5. Unauthenticated GET -> 401 Unauthorized
  {
    const route = await setupTeamRoute(t, db, null);
    const res = await route.GET();
    assert.equal(res.status, 401);
  }

  // 6. Unauthenticated PATCH -> 401 Unauthorized
  {
    const route = await setupTeamRoute(t, db, null);
    const req = new Request("http://localhost/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "emp-active-alpha", role: "manager" }),
    });
    const res = await route.PATCH(req);
    assert.equal(res.status, 401);
  }

  // 7. Manager GET -> 200 OK (all store employees including suspended)
  {
    const route = await setupTeamRoute(t, db, managerAlpha);
    const res = await route.GET();
    assert.equal(res.status, 200);
    const body = await res.json();
    const returnedIds = body.employees.map((e) => e.id);
    assert.ok(returnedIds.includes("emp-suspended-alpha"), "Manager should see suspended employees");
    assert.ok(!returnedIds.includes("emp-beta"), "Manager should NOT see other stores");
  }

  // 8. Manager PATCH -> 403 Forbidden (restricted to owner)
  {
    const route = await setupTeamRoute(t, db, managerAlpha);
    const req = new Request("http://localhost/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "emp-active-alpha", role: "owner" }),
    });
    const res = await route.PATCH(req);
    assert.equal(res.status, 403);
  }

  // 9. Owner PATCH -> 200 OK
  {
    const route = await setupTeamRoute(t, db, ownerAlpha);
    const req = new Request("http://localhost/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "emp-active-alpha", role: "manager" }),
    });
    const res = await route.PATCH(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, true);
  }
});
