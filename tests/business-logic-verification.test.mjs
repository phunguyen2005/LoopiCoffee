import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { auditStatement } from "../server/audit.ts";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";
import { decideRequest } from "../modules/operations/application/decide-request.ts";

function request(url, method, body) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

test("BIZ-001: incident state machine enforces open -> acknowledged -> resolved -> closed and rejects skip, backward, or reopen with 409", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db, { id: "manager-a", role: "manager" });

  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // 1. Create incident (starts as 'open')
  const postRes = await route.POST(request("http://localhost/api/incidents", "POST", {
    title: "Máy pha cà phê hỏng vòi đánh sữa",
    category: "Thiết bị",
    severity: "medium",
  }));
  assert.equal(postRes.status, 200);
  const { incident } = await postRes.json();
  assert.equal(incident.status, "open");
  const id = incident.id;

  // 2. Reject direct skip: open -> resolved (409)
  const skipResolved = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "resolved" }));
  assert.equal(skipResolved.status, 409);
  const skipResolvedJson = await skipResolved.json();
  assert.match(skipResolvedJson.error, /không hợp lệ|đã thay đổi/);

  // 3. Reject direct skip: open -> closed (409)
  const skipClosed = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "closed" }));
  assert.equal(skipClosed.status, 409);

  // 4. Valid transition 1: open -> acknowledged (200)
  const ackRes = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "acknowledged" }));
  assert.equal(ackRes.status, 200);
  assert.equal((await ackRes.json()).status, "acknowledged");
  assert.equal(db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id).status, "acknowledged");

  // 5. Reject duplicate / stale: acknowledged -> acknowledged (409)
  const dupAck = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "acknowledged" }));
  assert.equal(dupAck.status, 409);

  // 6. Reject skip: acknowledged -> closed (409)
  const ackToClosed = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "closed" }));
  assert.equal(ackToClosed.status, 409);

  // 7. Valid transition 2: acknowledged -> resolved (200)
  const resRes = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "resolved" }));
  assert.equal(resRes.status, 200);
  assert.equal((await resRes.json()).status, "resolved");
  assert.equal(db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id).status, "resolved");

  // 8. Reject backward regression: resolved -> acknowledged (409)
  const regAck = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "acknowledged" }));
  assert.equal(regAck.status, 409);

  // 9. Valid transition 3: resolved -> closed (200)
  const closeRes = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "closed" }));
  assert.equal(closeRes.status, 200);
  assert.equal((await closeRes.json()).status, "closed");
  assert.equal(db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id).status, "closed");

  // 10. Reject reopen or any transitions from closed (409)
  const reopenResolved = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "resolved" }));
  assert.equal(reopenResolved.status, 409);
  const reopenAck = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "acknowledged" }));
  assert.equal(reopenAck.status, 409);
  const reopenOpen = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "open" }));
  assert.equal(reopenOpen.status, 409);
  const repeatClose = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "closed" }));
  assert.equal(repeatClose.status, 409);

  // 11. Reject invalid 'investigating' status (400)
  const invalidInvestigating = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "investigating" }));
  assert.equal(invalidInvestigating.status, 400);

  // 12. Foreign store incident returns 404
  seedStore(db, "store-b");
  db.sqlite.prepare("INSERT INTO incidents (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at) VALUES ('foreign-inc', 'store-b', 'b@example.test', 'Other', 'Other', 'low', 'open', '2026-07-01', '2026-07-01')").run();
  const foreignPatch = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id: "foreign-inc", status: "acknowledged" }));
  assert.equal(foreignPatch.status, 404);
});

test("BIZ-001: incident update and audit log are committed atomically in the same batch", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db, { id: "manager-a", role: "manager" });

  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  const postRes = await route.POST(request("http://localhost/api/incidents", "POST", {
    title: "Chập điện quầy bar",
    category: "Thiết bị",
    severity: "high",
  }));
  const { incident } = await postRes.json();
  const id = incident.id;
  assert.equal(incident.status, "open");

  // Invalidate audit insert to simulate batch failure
  db.failOn(/INSERT INTO audit_events/);
  const failedPatch = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "acknowledged" }));
  assert.equal(failedPatch.status, 500);

  // Verify status remains 'open' and was rolled back atomically
  assert.equal(db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id).status, "open");

  // Reset failure and patch successfully
  db.failOn(undefined);
  const successPatch = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id, status: "acknowledged" }));
  assert.equal(successPatch.status, 200);
  assert.equal(db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id).status, "acknowledged");

  // Audit event must be recorded
  const audit = db.sqlite.prepare("SELECT action, metadata FROM audit_events WHERE entity_id = ? AND action = 'incident.acknowledged'").get(id);
  assert.ok(audit);
  assert.equal(JSON.parse(audit.metadata).fromStatus, "open");
  assert.equal(JSON.parse(audit.metadata).toStatus, "acknowledged");

  // Concurrent race condition: status changed between read and batch update
  // When meta.changes === 0, returns 409 Conflict
  const post2 = await route.POST(request("http://localhost/api/incidents", "POST", {
    title: "Cháy bóng đèn kho",
    category: "Thiết bị",
    severity: "low",
  }));
  const id2 = (await post2.json()).incident.id;

  const origPrepare = db.prepare.bind(db);
  let intercepted = false;
  db.prepare = (sql) => {
    if (sql.includes("UPDATE incidents SET status =") && !intercepted) {
      intercepted = true;
      db.sqlite.prepare("UPDATE incidents SET status = 'acknowledged' WHERE id = ?").run(id2);
    }
    return origPrepare(sql);
  };

  const conflictPatch = await route.PATCH(request("http://localhost/api/incidents", "PATCH", { id: id2, status: "acknowledged" }));
  assert.equal(conflictPatch.status, 409);
  const conflictJson = await conflictPatch.json();
  assert.match(conflictJson.error, /không hợp lệ|đã thay đổi/);
  db.prepare = origPrepare;
});

test("BIZ-002: deciding swap or correction requests returns clear guidance indicating manual action required and notifies employee", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const owner = seedEmployee(db, { id: "owner-a", role: "owner" });
  const staffA = seedEmployee(db, { id: "staff-a", role: "employee" });
  const staffB = seedEmployee(db, { id: "staff-b", role: "employee" });

  // 1. Swap request
  db.sqlite.prepare(
    "INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
  ).run("swap-req-1", "store-a", staffA.email, "swap", "Đổi ca chiều thứ 3 cho Lan", "Có bài thi", "2026-07-01T08:00:00Z");

  const swapDecision = await decideRequest(db, owner, "swap-req-1", "approved");
  assert.equal(swapDecision.status, "approved");
  assert.equal(swapDecision.requiresManualAction, true);
  assert.ok(swapDecision.guidance);
  assert.match(swapDecision.guidance, /Lịch làm việc/);

  // Notification for swap has principle approval wording
  const swapNotif = db.sqlite.prepare(
    "SELECT title FROM notifications WHERE recipient_email = ? ORDER BY created_at DESC",
  ).get(staffA.email);
  assert.ok(swapNotif);
  assert.match(swapNotif.title, /Đã duyệt nguyên tắc/);
  assert.match(swapNotif.title, /xếp lại lịch/);

  // Cannot re-decide already approved swap
  await assert.rejects(decideRequest(db, owner, "swap-req-1", "rejected"), { code: "request_conflict" });

  // 2. Correction request
  db.sqlite.prepare(
    "INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
  ).run("correction-req-1", "store-a", staffB.email, "correction", "Quên bấm check-out lúc 22h", "Hệ thống bận", "2026-07-01T08:00:00Z");

  const corrDecision = await decideRequest(db, owner, "correction-req-1", "approved");
  assert.equal(corrDecision.status, "approved");
  assert.equal(corrDecision.requiresManualAction, true);
  assert.ok(corrDecision.guidance);
  assert.match(corrDecision.guidance, /Chấm công/);

  // Notification for correction has principle approval wording
  const corrNotif = db.sqlite.prepare(
    "SELECT title FROM notifications WHERE recipient_email = ? ORDER BY created_at DESC",
  ).get(staffB.email);
  assert.ok(corrNotif);
  assert.match(corrNotif.title, /Đã duyệt nguyên tắc/);
  assert.match(corrNotif.title, /điều chỉnh công/);

  // 3. Rejected swap gives rejection notification
  db.sqlite.prepare(
    "INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
  ).run("swap-req-2", "store-a", staffA.email, "swap", "Đổi ca tối thứ 5", "Bận việc", "2026-07-01T08:00:00Z");

  const rejDecision = await decideRequest(db, owner, "swap-req-2", "rejected");
  assert.equal(rejDecision.status, "rejected");
  assert.equal(rejDecision.requiresManualAction, false);
  assert.equal(rejDecision.guidance, null);

  const rejNotif = db.sqlite.prepare(
    "SELECT title FROM notifications WHERE recipient_email = ? ORDER BY created_at DESC",
  ).get(staffA.email);
  assert.match(rejNotif.title, /^Đã từ chối:/);
});

test("BIZ-003: checklist PATCH binds and records identical business_date across execution, audit metadata, and response", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db);

  const fixedDate = "2026-09-17";
  const loaded = await loadModule("../../app/api/checklists/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/modules/operations/domain/business-day": { businessDate: () => fixedDate },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  const createRes = await route.POST(request("http://localhost/api/checklists", "POST", {
    label: "Kiểm tra nhiệt độ tủ đông",
    required: true,
  }));
  const { item } = await createRes.json();
  const id = item.id;

  // Toggle checklist
  const patchRes = await route.PATCH(request("http://localhost/api/checklists", "PATCH", {
    id,
    completed: true,
  }));
  assert.equal(patchRes.status, 200);
  const patchJson = await patchRes.json();

  // 1. Response contains businessDate
  assert.equal(patchJson.businessDate, fixedDate);
  assert.equal(patchJson.completed, true);

  // 2. Execution in DB has identical business_date
  const execution = db.sqlite.prepare(
    "SELECT business_date, completed FROM checklist_executions WHERE item_id = ?",
  ).get(id);
  assert.ok(execution);
  assert.equal(execution.business_date, fixedDate);
  assert.equal(execution.completed, 1);

  // 3. Audit log metadata has identical businessDate
  const audit = db.sqlite.prepare(
    "SELECT metadata FROM audit_events WHERE entity_id = ? AND action = 'checklist.completed'",
  ).get(id);
  assert.ok(audit);
  const meta = JSON.parse(audit.metadata);
  assert.equal(meta.businessDate, fixedDate);

  // Verify all 3 are identical
  assert.equal(patchJson.businessDate, execution.business_date);
  assert.equal(execution.business_date, meta.businessDate);
});

test("BIZ-004: handover maintains store-level scope, validates input length, and creates atomic audit", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db, { id: "barista-1", role: "employee" });

  const loaded = await loadModule("../../app/api/handovers/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // 1. Reject short summary (< 10 chars)
  const tooShort = await route.POST(request("http://localhost/api/handovers", "POST", {
    summary: "Ngắn quá",
    managerAttention: false,
  }));
  assert.equal(tooShort.status, 400);

  // 2. Valid handover created
  const postRes = await route.POST(request("http://localhost/api/handovers", "POST", {
    summary: "Ca tối đã dọn dẹp sạch sẽ, máy xay đã xả bột cũ, sữa tươi còn 3 hộp.",
    managerAttention: true,
    idempotencyKey: crypto.randomUUID(),
  }));
  assert.equal(postRes.status, 200);
  const postJson = await postRes.json();
  assert.ok(postJson.handover.id);
  assert.equal(postJson.handover.manager_attention, 1);

  // 3. Persisted with store_id and author attribution
  const saved = db.sqlite.prepare(
    "SELECT store_id, author_email, summary, manager_attention FROM handovers WHERE id = ?",
  ).get(postJson.handover.id);
  assert.ok(saved);
  assert.equal(saved.store_id, "store-a");
  assert.equal(saved.author_email, actor.email);
  assert.equal(saved.manager_attention, 1);

  // 4. Audit event created
  const audit = db.sqlite.prepare(
    "SELECT action, metadata FROM audit_events WHERE entity_id = ? AND action = 'handover.created'",
  ).get(postJson.handover.id);
  assert.ok(audit);
  assert.equal(JSON.parse(audit.metadata).managerAttention, true);

  // 5. GET returns store handovers
  const getRes = await route.GET();
  assert.equal(getRes.status, 200);
  const getJson = await getRes.json();
  assert.equal(getJson.handovers.length, 1);
  assert.equal(getJson.handovers[0].id, postJson.handover.id);
});
