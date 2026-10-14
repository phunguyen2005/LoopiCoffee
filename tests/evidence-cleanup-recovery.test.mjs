import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, seedStore } from "./helpers/database.mjs";
import {
  processPendingEvidenceCleanup,
  recoverAttendanceWrite,
  scheduleEvidenceCleanup,
} from "../modules/attendance/application/evidence-cleanup.ts";

test("ambiguous attendance commit checks replay before considering object deletion", async () => {
  let deletes = 0;
  const replay = {
    id: "event-a",
    session_id: "session-a",
    recorded_at: "2026-10-14T00:00:00.000Z",
    verification_results: "[]",
    review_required: 0,
    photo_status: "stored",
  };
  const db = {
    prepare: () => ({
      bind: () => ({ first: async () => replay }),
    }),
  };
  const result = await recoverAttendanceWrite(db, { delete: async () => { deletes += 1; } }, {
    idempotencyKey: crypto.randomUUID(),
    employeeEmail: "employee-a@example.test",
    objectKey: "store-a/attendance/employee-a/2026/10/event-a.svg",
    eventId: "event-a",
    storeId: "store-a",
    recordedAt: replay.recorded_at,
  });
  assert.equal(result, replay);
  assert.equal(deletes, 0);
});

test("failed attendance object cleanup is durable, retryable, and resolves once", async (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-a");
  const objectKey = "store-a/attendance/employee-a/2026/10/event-a.svg";
  await scheduleEvidenceCleanup(db, {
    objectKey,
    eventId: "event-a",
    storeId: "store-a",
    actorEmail: "employee-a@example.test",
  });

  const failed = await processPendingEvidenceCleanup(db, { delete: async () => { throw new Error("R2 unavailable"); } });
  assert.deepEqual(failed, { deleted: 0, failures: 1 });
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='attendance.evidence_cleanup_resolved'").get().n, 0);

  const deletedKeys = [];
  const recovered = await processPendingEvidenceCleanup(db, { delete: async (key) => { deletedKeys.push(key); } });
  assert.deepEqual(recovered, { deleted: 1, failures: 0 });
  assert.deepEqual(deletedKeys, [objectKey]);

  const replay = await processPendingEvidenceCleanup(db, { delete: async (key) => { deletedKeys.push(key); } });
  assert.deepEqual(replay, { deleted: 0, failures: 0 });
  assert.deepEqual(deletedKeys, [objectKey]);
});
