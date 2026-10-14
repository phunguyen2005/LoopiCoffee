import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";
import { loadModule } from "./helpers/load-module.mjs";
import { auditStatement } from "../server/audit.ts";
import { apiHandler, ApplicationError } from "../platform/http/errors.ts";
import { readObject } from "../platform/http/input.ts";

function jsonRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rawRequest(url, method, rawBody) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

test("incident POST replays the same client request key without creating a duplicate", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db, { id: "employee-idempotent", role: "employee" });
  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const payload = {
    title: "Máy pha cà phê mất điện",
    category: "Thiết bị",
    severity: "high",
    idempotencyKey: crypto.randomUUID(),
  };

  const first = await loaded.module.POST(jsonRequest("http://localhost/api/incidents", "POST", payload));
  const replay = await loaded.module.POST(jsonRequest("http://localhost/api/incidents", "POST", payload));
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  const firstBody = await first.json();
  const replayBody = await replay.json();
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.incident.id, firstBody.incident.id);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM incidents WHERE id = ?").get(payload.idempotencyKey).count, 1);
});

test("R2 (CODE-003): Injected failure on audit insertion causes entire PATCH transaction to roll back", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db, { id: "manager-1", role: "manager" });

  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // Create an incident in 'open' status
  const postRes = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "Máy xay sinh tố quá nhiệt",
    category: "Thiết bị",
    severity: "medium",
  }));
  assert.equal(postRes.status, 200);
  const { incident } = await postRes.json();
  const id = incident.id;
  assert.equal(incident.status, "open");

  // Inject failure specifically on audit log insertion
  db.failOn(/INSERT INTO audit_events/);

  // Attempt PATCH transition
  const patchRes = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id,
    status: "acknowledged",
  }));

  // Must fail safely with HTTP 500 error structure
  assert.equal(patchRes.status, 500);
  const errJson = await patchRes.json();
  assert.ok(errJson.requestId);

  // Status must remain 'open' in DB (entire batch transaction rolled back)
  const current = db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id);
  assert.equal(current.status, "open");

  // Clear injected failure and verify successful atomic commit
  db.failOn(undefined);
  const retryRes = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id,
    status: "acknowledged",
  }));
  assert.equal(retryRes.status, 200);

  const updated = db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(id);
  assert.equal(updated.status, "acknowledged");

  const auditRecord = db.sqlite.prepare(
    "SELECT action, metadata FROM audit_events WHERE entity_id = ? AND action = 'incident.acknowledged'",
  ).get(id);
  assert.ok(auditRecord);
});

test("R2 (CODE-003): Unmatched ID or cross-store access returns 404 and does not create audit log entry", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  seedStore(db, "store-b");
  const actorA = seedEmployee(db, { id: "mgr-a", storeId: "store-a", role: "manager" });

  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor: actorA }), auditStatement },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // Insert foreign incident in store-b
  const foreignId = "incident-foreign-999";
  db.sqlite.prepare(
    `INSERT INTO incidents (id, store_id, reporter_email, title, category, severity, status, created_at, updated_at)
     VALUES (?, 'store-b', 'foreign@loopicafe.test', 'Hỏng tủ lạnh', 'Thiết bị', 'high', 'open', '2026-07-01', '2026-07-01')`,
  ).run(foreignId);

  const countAuditsBefore = db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count;

  // 1. Unmatched ID (non-existent)
  const notFoundRes = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id: "non-existent-id-000",
    status: "acknowledged",
  }));
  assert.equal(notFoundRes.status, 404);
  const notFoundJson = await notFoundRes.json();
  assert.equal(notFoundJson.error, "Không tìm thấy sự cố.");

  // No audit record must be inserted
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count, countAuditsBefore);

  // 2. Cross-store access (existing incident in store-b accessed by manager of store-a)
  const crossStoreRes = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id: foreignId,
    status: "acknowledged",
  }));
  assert.equal(crossStoreRes.status, 404);
  const crossStoreJson = await crossStoreRes.json();
  assert.equal(crossStoreJson.error, "Không tìm thấy sự cố.");

  // No audit record must be inserted
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count, countAuditsBefore);

  // Foreign incident status must remain 'open'
  const foreignCurrent = db.sqlite.prepare("SELECT status FROM incidents WHERE id = ?").get(foreignId);
  assert.equal(foreignCurrent.status, "open");
});

test("R4 (CODE-004): Malformed/null/type-mismatched bodies to /api/incidents return 400 Bad Request", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db, { id: "mgr-val", role: "manager" });

  const loaded = await loadModule("../../app/api/incidents/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/platform/http/errors": { apiHandler },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // POST: null body
  const nullPost = await route.POST(rawRequest("http://localhost/api/incidents", "POST", "null"));
  assert.equal(nullPost.status, 400);
  assert.ok((await nullPost.json()).error);

  // POST: array body
  const arrayPost = await route.POST(rawRequest("http://localhost/api/incidents", "POST", "[]"));
  assert.equal(arrayPost.status, 400);

  // POST: malformed JSON
  const malformedPost = await route.POST(rawRequest("http://localhost/api/incidents", "POST", "{invalid-json"));
  assert.equal(malformedPost.status, 400);

  // POST: title type mismatch (number instead of string)
  const titleNumber = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: 42,
    severity: "medium",
  }));
  assert.equal(titleNumber.status, 400);

  // POST: category type mismatch (number instead of string)
  const categoryNumber = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "Sự cố vòi nước",
    category: 12345,
    severity: "medium",
  }));
  assert.equal(categoryNumber.status, 400);

  // POST: severity type mismatch (number instead of string)
  const severityNumber = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "Sự cố vòi nước",
    severity: 1,
  }));
  assert.equal(severityNumber.status, 400);

  // POST: invalid severity enum
  const invalidSeverity = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "Sự cố vòi nước",
    severity: "catastrophic",
  }));
  assert.equal(invalidSeverity.status, 400);

  // POST: title bounds (< 3 characters)
  const titleTooShort = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "ab",
    severity: "low",
  }));
  assert.equal(titleTooShort.status, 400);

  // POST: title bounds (> 180 characters)
  const titleTooLong = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "x".repeat(181),
    severity: "low",
  }));
  assert.equal(titleTooLong.status, 400);

  // POST: category bounds (> 60 characters)
  const catTooLong = await route.POST(jsonRequest("http://localhost/api/incidents", "POST", {
    title: "Tiêu đề hợp lệ",
    category: "c".repeat(61),
    severity: "low",
  }));
  assert.equal(catTooLong.status, 400);

  // POST: oversized payload (> 64 KiB)
  const oversizedPost = await route.POST(rawRequest(
    "http://localhost/api/incidents",
    "POST",
    JSON.stringify({ title: "Sự cố", category: "K".repeat(70_000), severity: "low" }),
  ));
  assert.equal(oversizedPost.status, 413);

  // PATCH: null body
  const nullPatch = await route.PATCH(rawRequest("http://localhost/api/incidents", "PATCH", "null"));
  assert.equal(nullPatch.status, 400);

  // PATCH: malformed JSON
  const malformedPatch = await route.PATCH(rawRequest("http://localhost/api/incidents", "PATCH", "{bad"));
  assert.equal(malformedPatch.status, 400);

  // PATCH: id type mismatch (number instead of string)
  const idNumber = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id: 12345,
    status: "acknowledged",
  }));
  assert.equal(idNumber.status, 400);

  // PATCH: status type mismatch (number instead of string)
  const statusNumber = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id: "some-incident-id",
    status: 99,
  }));
  assert.equal(statusNumber.status, 400);

  // PATCH: invalid status value
  const invalidStatus = await route.PATCH(jsonRequest("http://localhost/api/incidents", "PATCH", {
    id: "some-incident-id",
    status: "non-existent-status",
  }));
  assert.equal(invalidStatus.status, 400);
});

test("R4 (CODE-004): Malformed/null/type-mismatched bodies to /api/handovers return 400 Bad Request", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const actor = seedEmployee(db, { id: "staff-hnd", role: "employee" });

  const loaded = await loadModule("../../app/api/handovers/route.ts", {
    "@/db/runtime": { ensureDatabase: async () => db },
    "@/server/auth": { requireApiUser: async () => ({ actor }), auditStatement },
    "@/platform/http/errors": { apiHandler, ApplicationError },
    "@/platform/http/input": { readObject },
  });
  t.after(loaded.dispose);
  const route = loaded.module;

  // POST: null body
  const nullPost = await route.POST(rawRequest("http://localhost/api/handovers", "POST", "null"));
  assert.equal(nullPost.status, 400);
  assert.ok((await nullPost.json()).error);

  // POST: array body
  const arrayPost = await route.POST(rawRequest("http://localhost/api/handovers", "POST", "[]"));
  assert.equal(arrayPost.status, 400);

  // POST: malformed JSON
  const malformedPost = await route.POST(rawRequest("http://localhost/api/handovers", "POST", "{invalid"));
  assert.equal(malformedPost.status, 400);

  // POST: summary type mismatch (number instead of string)
  const summaryNumber = await route.POST(jsonRequest("http://localhost/api/handovers", "POST", {
    summary: 42,
    managerAttention: false,
  }));
  assert.equal(summaryNumber.status, 400);

  // POST: managerAttention type mismatch (string instead of boolean)
  const attentionString = await route.POST(jsonRequest("http://localhost/api/handovers", "POST", {
    summary: "Bàn giao ca sáng kiểm tra kho và máy pha",
    managerAttention: "true",
  }));
  assert.equal(attentionString.status, 400);

  // POST: summary bounds (< 10 characters)
  const summaryTooShort = await route.POST(jsonRequest("http://localhost/api/handovers", "POST", {
    summary: "Quá ngắn",
  }));
  assert.equal(summaryTooShort.status, 400);

  // POST: summary bounds (> 2000 characters)
  const summaryTooLong = await route.POST(jsonRequest("http://localhost/api/handovers", "POST", {
    summary: "B".repeat(2001),
  }));
  assert.equal(summaryTooLong.status, 400);

  // POST: oversized payload (> 64 KiB)
  const oversizedPost = await route.POST(rawRequest(
    "http://localhost/api/handovers",
    "POST",
    JSON.stringify({ summary: "X".repeat(70_000) }),
  ));
  assert.equal(oversizedPost.status, 413);

  // POST: valid handover payload succeeds
  const idempotencyKey = crypto.randomUUID();
  const validPayload = {
    summary: "Đã hoàn thành kiểm kê nguyên liệu và vệ sinh máy pha espresso",
    managerAttention: true,
    idempotencyKey,
  };
  const validRes = await route.POST(jsonRequest("http://localhost/api/handovers", "POST", validPayload));
  assert.equal(validRes.status, 200);
  const validJson = await validRes.json();
  assert.ok(validJson.handover?.id);
  assert.equal(validJson.handover.manager_attention, 1);
  const replayRes = await route.POST(jsonRequest("http://localhost/api/handovers", "POST", validPayload));
  assert.equal(replayRes.status, 200);
  assert.equal((await replayRes.json()).handover.id, validJson.handover.id);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM handovers").get().n, 1);
  const conflictRes = await route.POST(jsonRequest("http://localhost/api/handovers", "POST", {
    ...validPayload,
    summary: "Nội dung khác nhưng cố tình sử dụng lại cùng mã gửi bàn giao",
  }));
  assert.equal(conflictRes.status, 409);
  assert.equal((await conflictRes.json()).code, "idempotency_conflict");
});
