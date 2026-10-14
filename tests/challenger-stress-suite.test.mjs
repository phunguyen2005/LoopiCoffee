import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { readObject, ATTENDANCE_ACTION_MAX_BYTES } from "../platform/http/input.ts";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { auditStatement } from "../server/audit.ts";

function jsonRequest(url, method, body, headers = {}) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rawRequest(url, method, rawBody, headers = {}) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: rawBody,
  });
}

// -----------------------------------------------------------------------------
// DIMENSION 1: BOUNDARY PAYLOADS & MEMORY STRESS (FIX-01)
// -----------------------------------------------------------------------------
test("DIMENSION 1: readObject precise boundary payloads (65,536B vs 65,537B; 3,145,728B vs 3,145,729B)", async () => {
  // Test 1: Exactly 65,536 bytes with valid JSON passes default readObject
  const padLength64k = 65_536 - '{"pad":""}'.length;
  const body65536 = JSON.stringify({ pad: "a".repeat(padLength64k) });
  assert.equal(new TextEncoder().encode(body65536).length, 65_536);

  const req64k = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "65536" },
    body: body65536,
  });
  const res64k = await readObject(req64k);
  assert.ok(res64k.pad);

  // Test 2: Exactly 65,537 bytes fails default readObject with 413
  const body65537 = JSON.stringify({ pad: "a".repeat(padLength64k + 1) });
  assert.equal(new TextEncoder().encode(body65537).length, 65_537);

  const req65537 = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "65537" },
    body: body65537,
  });
  await assert.rejects(readObject(req65537), {
    status: 413,
    code: "body_too_large",
  });

  // Test 3: Exactly 3,145,728 bytes with options.maxBytes passes
  const padLength3M = ATTENDANCE_ACTION_MAX_BYTES - '{"pad":""}'.length;
  const body3M = JSON.stringify({ pad: "b".repeat(padLength3M) });
  assert.equal(new TextEncoder().encode(body3M).length, ATTENDANCE_ACTION_MAX_BYTES);

  const req3M = new Request("http://localhost/api/attendance/actions", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(ATTENDANCE_ACTION_MAX_BYTES) },
    body: body3M,
  });
  const res3M = await readObject(req3M, {}, { maxBytes: ATTENDANCE_ACTION_MAX_BYTES });
  assert.ok(res3M.pad);

  // Test 4: Exactly 3,145,729 bytes fails with 413
  const body3MPlus1 = JSON.stringify({ pad: "b".repeat(padLength3M + 1) });
  assert.equal(new TextEncoder().encode(body3MPlus1).length, ATTENDANCE_ACTION_MAX_BYTES + 1);

  const req3MPlus1 = new Request("http://localhost/api/attendance/actions", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(ATTENDANCE_ACTION_MAX_BYTES + 1) },
    body: body3MPlus1,
  });
  await assert.rejects(readObject(req3MPlus1, {}, { maxBytes: ATTENDANCE_ACTION_MAX_BYTES }), {
    status: 413,
    code: "body_too_large",
  });

  // Test 5: Stream overflow without content-length header triggers mid-stream reader cancellation
  const chunks = [
    new TextEncoder().encode('{"stream":"'),
    new Uint8Array(65_530),
    new TextEncoder().encode('"}'),
  ];
  let chunkIdx = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIdx < chunks.length) {
        controller.enqueue(chunks[chunkIdx++]);
      } else {
        controller.close();
      }
    },
  });
  const chunkedReq = new Request("http://localhost/api/test", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  await assert.rejects(readObject(chunkedReq), {
    status: 413,
    code: "body_too_large",
  });
});

// -----------------------------------------------------------------------------
// DIMENSION 2: FAILURE INJECTION ROLLBACK & STATE MACHINE (FIX-02)
// -----------------------------------------------------------------------------
test("DIMENSION 2: Incident status state machine strict unidirectional transition matrix", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const manager = seedEmployee(db, { id: "mgr-sm", role: "manager" });

  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor: manager }), auditStatement },
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // Helper to create an incident
  async function createIncident(title = "Sự cố test") {
    const res = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
      title,
      category: "Thiết bị",
      severity: "medium",
    }));
    assert.equal(res.status, 200);
    const body = await res.json();
    return body.incident.id;
  }

  // Helper to test transition
  async function transition(id, targetStatus) {
    return route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
      id,
      status: targetStatus,
    }));
  }

  // 1. ILLEGAL: open -> resolved (skip acknowledged)
  const inc1 = await createIncident("Test skip 1");
  const skipToResolved = await transition(inc1, "resolved");
  assert.equal(skipToResolved.status, 409, "Must reject skip from open to resolved with 409");

  // 2. ILLEGAL: open -> closed (skip acknowledged, resolved)
  const inc2 = await createIncident("Test skip 2");
  const skipToClosed = await transition(inc2, "closed");
  assert.equal(skipToClosed.status, 409, "Must reject skip from open to closed with 409");

  // 3. LEGAL PATH: open -> acknowledged -> resolved -> closed
  const inc3 = await createIncident("Test valid path");
  const step1 = await transition(inc3, "acknowledged");
  assert.equal(step1.status, 200);
  assert.equal((await step1.json()).status, "acknowledged");

  const step2 = await transition(inc3, "resolved");
  assert.equal(step2.status, 200);
  assert.equal((await step2.json()).status, "resolved");

  const step3 = await transition(inc3, "closed");
  assert.equal(step3.status, 200);
  assert.equal((await step3.json()).status, "closed");

  // 4. ILLEGAL: closed -> open (reopening prohibited)
  const reopenToOpen = await transition(inc3, "open");
  assert.equal(reopenToOpen.status, 409, "Must reject reopening closed incident to open");

  // 5. ILLEGAL: closed -> resolved (reopening prohibited)
  const reopenToResolved = await transition(inc3, "resolved");
  assert.equal(reopenToResolved.status, 409, "Must reject reopening closed incident to resolved");

  // 6. ILLEGAL: acknowledged -> open (backward regression)
  const inc4 = await createIncident("Test backward 1");
  await transition(inc4, "acknowledged");
  const backwardToOpen = await transition(inc4, "open");
  assert.equal(backwardToOpen.status, 409, "Must reject backward transition acknowledged -> open");

  // 7. ILLEGAL: resolved -> acknowledged (backward regression)
  const inc5 = await createIncident("Test backward 2");
  await transition(inc5, "acknowledged");
  await transition(inc5, "resolved");
  const backwardToAck = await transition(inc5, "acknowledged");
  assert.equal(backwardToAck.status, 409, "Must reject backward transition resolved -> acknowledged");

  // 8. IDEMPOTENT / CONCURRENT CONFLICT: same transition repeated
  const repeatResolved = await transition(inc5, "resolved");
  assert.equal(repeatResolved.status, 409, "Must reject repeated transition with 409");
});

test("DIMENSION 2: Failure injection on batch update/audit ensures zero partial writes", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const manager = seedEmployee(db, { id: "mgr-fi", role: "manager" });

  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor: manager }), auditStatement },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  const postRes = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "Sự cố mất điện pha 3",
    category: "Điện",
    severity: "high",
  }));
  const { incident } = await postRes.json();
  const id = incident.id;

  // Injected failure when executing UPDATE incidents
  db.failOn(/UPDATE incidents/);
  const patchFail = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id,
    status: "acknowledged",
  }));
  assert.equal(patchFail.status, 500);

  // Status must remain open
  const inDb = db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id);
  assert.equal(inDb.status, "open");

  // Audit count should not have increased
  const audits = db.sqlite.prepare("SELECT COUNT(*) as cnt FROM audit_events WHERE entity_id = ?").get(id);
  // Only the creation audit event exists
  assert.equal(audits.cnt, 1);
});

// -----------------------------------------------------------------------------
// DIMENSION 3: FUZZING & MALFORMED INPUT TYPES (FIX-04)
// -----------------------------------------------------------------------------
test("DIMENSION 3: Fuzzing /api/incidents and /api/handovers with malformed and boundary inputs", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const manager = seedEmployee(db, { id: "mgr-fuzz", role: "manager" });

  const loadedInc = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor: manager }), auditStatement },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loadedInc.dispose);
  const incRoute = loadedInc.module;

  const loadedHnd = await loadModule("../../app/api/handovers/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor: manager }), auditStatement },
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
  });
  t.after(loadedHnd.dispose);
  const hndRoute = loadedHnd.module;

  const malformedBodies = [
    "",
    "null",
    "true",
    "12345",
    '"just a string"',
    "[]",
    "[1, 2, 3]",
    "{",
    '{"title":',
    '{"title": "val",}',
    "\0",
  ];

  for (const badBody of malformedBodies) {
    const incRes = await incRoute.POST(rawRequest("http://localhost/api/incidents", "POST", badBody));
    assert.equal(incRes.status, 400, `Incidents POST should reject body '${badBody}' with 400`);

    const hndRes = await hndRoute.POST(rawRequest("http://localhost/api/handovers", "POST", badBody));
    assert.equal(hndRes.status, 400, `Handovers POST should reject body '${badBody}' with 400`);
  }

  // Exact boundary lengths for title:
  // title: min 3, max 180
  const title2 = await incRoute.POST(jsonRequest("http://localhost/api/incidents", "POST", { title: "ab", severity: "low" }));
  assert.equal(title2.status, 400);

  const title3 = await incRoute.POST(jsonRequest("http://localhost/api/incidents", "POST", { title: "abc", severity: "low" }));
  assert.equal(title3.status, 200);

  const title180 = await incRoute.POST(jsonRequest("http://localhost/api/incidents", "POST", { title: "a".repeat(180), severity: "low" }));
  assert.equal(title180.status, 200);

  const title181 = await incRoute.POST(jsonRequest("http://localhost/api/incidents", "POST", { title: "a".repeat(181), severity: "low" }));
  assert.equal(title181.status, 400);

  // Exact boundary lengths for summary:
  // summary: min 10, max 2000
  const sum9 = await hndRoute.POST(jsonRequest("http://localhost/api/handovers", "POST", { summary: "123456789", managerAttention: false }));
  assert.equal(sum9.status, 400);

  const sum10 = await hndRoute.POST(jsonRequest("http://localhost/api/handovers", "POST", { summary: "1234567890", managerAttention: false, idempotencyKey: crypto.randomUUID() }));
  assert.equal(sum10.status, 200);

  const sum2000 = await hndRoute.POST(jsonRequest("http://localhost/api/handovers", "POST", { summary: "x".repeat(2000), managerAttention: false, idempotencyKey: crypto.randomUUID() }));
  assert.equal(sum2000.status, 200);

  const sum2001 = await hndRoute.POST(jsonRequest("http://localhost/api/handovers", "POST", { summary: "x".repeat(2001), managerAttention: false }));
  assert.equal(sum2001.status, 400);
});

// -----------------------------------------------------------------------------
// DIMENSION 4: ROLE PERMISSION MATRIX & ISOLATION (FIX-05, FIX-02)
// -----------------------------------------------------------------------------
test("DIMENSION 4: Complete role matrix across /api/team and /api/incidents with store isolation", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-1");
  seedStore(db, "store-2");

  const owner1 = seedEmployee(db, { id: "owner-1", storeId: "store-1", role: "owner" });
  const manager1 = seedEmployee(db, { id: "mgr-1", storeId: "store-1", role: "manager" });
  const lead1 = seedEmployee(db, { id: "lead-1", storeId: "store-1", role: "team_lead" });
  const staff1 = seedEmployee(db, { id: "staff-1", storeId: "store-1", role: "staff" });
  const customer = { id: "cust-1", storeId: "store-1", role: "customer", email: "cust@loopicafe.test" };

  // Store 2 employee
  seedEmployee(db, { id: "staff-2", storeId: "store-2", role: "staff" });

  let currentActor = null;
  const loadedTeam = await loadModule("../../app/api/team/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
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
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
    "@/modules/people/application/update-access": {
      updateEmployeeAccess: async () => ({ updated: true }),
    },
  });
  t.after(loadedTeam.dispose);
  const teamRoute = loadedTeam.module;

  const loadedInc = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
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
      auditStatement,
    },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loadedInc.dispose);
  const incRoute = loadedInc.module;

  // Insert test incident in Store 1
  db.sqlite.prepare(`
    INSERT INTO incidents (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at)
    VALUES ('inc-store-1', 'store-1', 'owner-1@example.test', 'Incident S1', 'Thiet bi', 'low', 'open', '2026-07-01', '2026-07-01')
  `).run();

  // Test Matrix:
  const matrix = [
    { actor: owner1, getTeam: 200, patchTeam: 200, patchInc: 200 },
    { actor: manager1, getTeam: 200, patchTeam: 403, patchInc: 200 },
    { actor: lead1, getTeam: 200, patchTeam: 403, patchInc: 200 },
    { actor: staff1, getTeam: 403, patchTeam: 403, patchInc: 403 },
    { actor: customer, getTeam: 403, patchTeam: 403, patchInc: 403 },
    { actor: null, getTeam: 401, patchTeam: 401, patchInc: 401 },
  ];

  for (const tc of matrix) {
    currentActor = tc.actor;

    // Reset or insert fresh open incident in Store 1 for this test
    const testIncId = `inc-test-${tc.actor?.role ?? "unauth"}`;
    db.sqlite.prepare(`
      INSERT OR REPLACE INTO incidents (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at)
      VALUES (?, 'store-1', 'owner-1@example.test', 'Incident Test', 'Thiet bi', 'low', 'open', '2026-07-01', '2026-07-01')
    `).run(testIncId);

    // GET /api/team
    const getRes = await teamRoute.GET();
    assert.equal(getRes.status, tc.getTeam, `GET /api/team for ${tc.actor?.role ?? "unauth"} should be ${tc.getTeam}`);

    // PATCH /api/team
    const patchTeamReq = jsonRequest("http://localhost/api/team", "PATCH", { id: "staff-1", role: "manager" });
    const patchTeamRes = await teamRoute.PATCH(patchTeamReq);
    assert.equal(patchTeamRes.status, tc.patchTeam, `PATCH /api/team for ${tc.actor?.role ?? "unauth"} should be ${tc.patchTeam}`);

    // PATCH /api/incidents
    const patchIncReq = jsonRequest("http://localhost/api/incidents", "PATCH", { id: testIncId, status: "acknowledged" });
    const patchIncRes = await incRoute.PATCH(patchIncReq);
    assert.equal(patchIncRes.status, tc.patchInc, `PATCH /api/incidents for ${tc.actor?.role ?? "unauth"} should be ${tc.patchInc}`);
  }

  // Verify store isolation for lead:
  currentActor = lead1;
  const leadTeamRes = await teamRoute.GET();
  const leadTeamData = await leadTeamRes.json();
  const visibleIds = leadTeamData.employees.map((e) => e.id);
  assert.ok(!visibleIds.includes("staff-2"), "Lead of store-1 MUST NOT see staff-2 from store-2");
});
