import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import yaml from "js-yaml";
import { expireEvidence } from "../modules/attendance/application/expire-evidence.ts";
import { createDatabase, seedStore, seedEmployee } from "./helpers/database.mjs";

test.describe("M4 Adversarial Multi-Store Isolation & CI Verification", () => {
  test("expireEvidence strictly isolates audit logs across 4 stores with mixed failures and no cross-store leakage", async (t) => {
    const db = createDatabase({ migrations: true });
    t.after(() => db.close());

    // 1. Setup 4 independent stores
    const stores = ["store-alpha", "store-beta", "store-gamma", "store-delta"];
    for (const sid of stores) {
      seedStore(db, sid);
      seedEmployee(db, { id: `emp-${sid}`, storeId: sid });
    }

    const now = new Date().toISOString();
    const past = new Date(Date.now() - 100 * 86_400_000).toISOString();
    const future = new Date(Date.now() + 100 * 86_400_000).toISOString();

    let eventCounter = 1;
    function createEvent(sid) {
      const sessId = `ses-${sid}-${eventCounter}`;
      const evtId = `evt-${sid}-${eventCounter}`;
      eventCounter++;

      db.sqlite.prepare(`
        INSERT INTO attendance_sessions (id, employee_email, store_id, status, opened_at, closed_at)
        VALUES (?, ?, ?, 'completed', ?, ?)
      `).run(sessId, `emp-${sid}@example.test`, sid, past, past);

      db.sqlite.prepare(`
        INSERT INTO attendance_events (id, session_id, employee_email, action, recorded_at, idempotency_key, verification_results, review_required, photo_status)
        VALUES (?, ?, ?, 'check_in', ?, ?, '[]', 0, 'stored')
      `).run(evtId, sessId, `emp-${sid}@example.test`, past, `idemp-${evtId}`);

      return evtId;
    }

    // Store Alpha:
    // - 3 expired photos (2 with past expires_at, 1 with future expires_at but deleted_at set)
    // - 1 unexpired photo
    // - 2 expired locations
    const alphaEvt1 = createEvent("store-alpha");
    db.sqlite.prepare(`
      INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
      VALUES (?, 'key-alpha-1', 'image/jpeg', 1000, 'h1', '1.0', ?)
    `).run(alphaEvt1, past);

    const alphaEvt2 = createEvent("store-alpha");
    db.sqlite.prepare(`
      INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
      VALUES (?, 'key-alpha-2', 'image/jpeg', 1000, 'h2', '1.0', ?)
    `).run(alphaEvt2, past);

    const alphaEvt3 = createEvent("store-alpha");
    db.sqlite.prepare(`
      INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at, deleted_at)
      VALUES (?, 'key-alpha-3', 'image/jpeg', 1000, 'h3', '1.0', ?, ?)
    `).run(alphaEvt3, future, past);

    const alphaEvtKeep = createEvent("store-alpha");
    db.sqlite.prepare(`
      INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
      VALUES (?, 'key-alpha-keep', 'image/jpeg', 1000, 'h4', '1.0', ?)
    `).run(alphaEvtKeep, future);

    const alphaLocEvt1 = createEvent("store-alpha");
    db.sqlite.prepare(`
      INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
      VALUES (?, 10.75, 106.66, 5, ?, 10, ?)
    `).run(alphaLocEvt1, past, past);

    const alphaLocEvt2 = createEvent("store-alpha");
    db.sqlite.prepare(`
      INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
      VALUES (?, 10.75, 106.66, 5, ?, 10, ?)
    `).run(alphaLocEvt2, past, past);

    // Store Beta:
    // - 2 expired photos (key-beta-fail will simulate R2 failure)
    // - 0 locations
    const betaEvt1 = createEvent("store-beta");
    db.sqlite.prepare(`
      INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
      VALUES (?, 'key-beta-ok', 'image/jpeg', 1000, 'hb1', '1.0', ?)
    `).run(betaEvt1, past);

    const betaEvt2 = createEvent("store-beta");
    db.sqlite.prepare(`
      INSERT INTO attendance_photos (event_id, object_key, mime_type, size_bytes, sha256, overlay_version, expires_at)
      VALUES (?, 'key-beta-fail', 'image/jpeg', 1000, 'hb2', '1.0', ?)
    `).run(betaEvt2, past);

    // Store Gamma:
    // - 0 photos
    // - 3 expired locations (2 past expires_at, 1 with future expires_at but deleted_at set)
    const gammaLocEvt1 = createEvent("store-gamma");
    db.sqlite.prepare(`
      INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
      VALUES (?, 10.75, 106.66, 5, ?, 10, ?)
    `).run(gammaLocEvt1, past, past);

    const gammaLocEvt2 = createEvent("store-gamma");
    db.sqlite.prepare(`
      INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at)
      VALUES (?, 10.75, 106.66, 5, ?, 10, ?)
    `).run(gammaLocEvt2, past, past);

    const gammaLocEvt3 = createEvent("store-gamma");
    db.sqlite.prepare(`
      INSERT INTO attendance_locations (event_id, latitude, longitude, accuracy_meters, server_received_at, distance_from_store_meters, expires_at, deleted_at)
      VALUES (?, 10.75, 106.66, 5, ?, 10, ?, ?)
    `).run(gammaLocEvt3, future, past);

    // Store Delta:
    // - clean store, zero expired photos or locations

    // Evidence mock simulating R2 delete failure for key-beta-fail
    const deletedKeys = [];
    const mockEvidence = {
      async delete(key) {
        if (key === "key-beta-fail") {
          throw new Error("Simulated R2 delete error on key-beta-fail");
        }
        deletedKeys.push(key);
      },
    };

    // Run expiration cleanup
    const result = await expireEvidence(db, mockEvidence, now);

    assert.equal(result.photosDeleted, 4, "Should delete 3 alpha photos + 1 beta photo");
    assert.equal(result.locationsDeleted, 5, "Should delete 2 alpha locations + 3 gamma locations");
    assert.equal(result.failures, 1, "Should count 1 failure from beta");
    assert.deepEqual(
      deletedKeys.sort(),
      ["key-alpha-1", "key-alpha-2", "key-alpha-3", "key-beta-ok"].sort()
    );

    // Verify Store Isolation in audit_events table
    const allAuditEvents = (await db.prepare("SELECT * FROM audit_events ORDER BY id").all()).results;

    // Assert no audit event has store_id = NULL
    const nullStoreEvents = allAuditEvents.filter((e) => e.store_id === null);
    assert.equal(nullStoreEvents.length, 0, "No audit events should have store_id = NULL");

    // Store Alpha verification
    const alphaAudit = allAuditEvents.filter((e) => e.store_id === "store-alpha");
    assert.equal(alphaAudit.length, 1, "store-alpha must have exactly 1 retention audit event");
    const metaAlpha = JSON.parse(alphaAudit[0].metadata);
    assert.equal(metaAlpha.photosDeleted, 3, "Alpha should record exactly 3 photos deleted");
    assert.equal(metaAlpha.locationsDeleted, 2, "Alpha should record exactly 2 locations deleted");
    assert.equal(metaAlpha.failures, 0, "Alpha should have 0 failures");

    // Store Beta verification
    const betaAudit = allAuditEvents.filter((e) => e.store_id === "store-beta");
    assert.equal(betaAudit.length, 1, "store-beta must have exactly 1 retention audit event");
    const metaBeta = JSON.parse(betaAudit[0].metadata);
    assert.equal(metaBeta.photosDeleted, 1, "Beta should record 1 photo deleted");
    assert.equal(metaBeta.locationsDeleted, 0, "Beta should record 0 locations deleted");
    assert.equal(metaBeta.failures, 1, "Beta should record 1 failure");

    // Store Gamma verification
    const gammaAudit = allAuditEvents.filter((e) => e.store_id === "store-gamma");
    assert.equal(gammaAudit.length, 1, "store-gamma must have exactly 1 retention audit event");
    const metaGamma = JSON.parse(gammaAudit[0].metadata);
    assert.equal(metaGamma.photosDeleted, 0, "Gamma should record 0 photos deleted");
    assert.equal(metaGamma.locationsDeleted, 3, "Gamma should record 3 locations deleted");
    assert.equal(metaGamma.failures, 0, "Gamma should have 0 failures");

    // Store Delta verification: clean store has NO retention events in this run
    const deltaAudit = allAuditEvents.filter((e) => e.store_id === "store-delta");
    assert.equal(deltaAudit.length, 0, "store-delta was not affected and must have 0 audit events");

    // Cross-store isolation check: A manager or owner of store-alpha querying by store_id
    const storeAView = (await db.prepare("SELECT * FROM audit_events WHERE store_id = ?").bind("store-alpha").all()).results;
    assert.equal(storeAView.length, 1);
    const storeAViewMeta = JSON.parse(storeAView[0].metadata);
    assert.equal(storeAViewMeta.failures, 0, "store-alpha owner must NOT see failures from store-beta");

    // Verify unexpired photo for alpha and failed photo for beta remain in table
    const remainingPhotos = (await db.prepare("SELECT object_key FROM attendance_photos").all()).results.map((r) => r.object_key);
    assert.deepEqual(remainingPhotos.sort(), ["key-alpha-keep", "key-beta-fail"].sort());
  });

  test("expireEvidence on already-clean database emits store-scoped zero stats for all stores without NULL store_id", async (t) => {
    const db = createDatabase({ migrations: true });
    t.after(() => db.close());

    seedStore(db, "store-clean-1");
    seedStore(db, "store-clean-2");

    const result = await expireEvidence(db, { async delete() {} });
    assert.equal(result.photosDeleted, 0);
    assert.equal(result.locationsDeleted, 0);
    assert.equal(result.failures, 0);

    const events = (await db.prepare("SELECT * FROM audit_events").all()).results;
    assert.equal(events.length, 2, "Should emit zero-cleanup events for all registered stores");
    assert.ok(events.every((e) => e.store_id !== null && e.store_id.startsWith("store-clean-")), "All events must be strictly store-scoped");
  });

  test(".github/workflows/check.yml parses cleanly as YAML and contains all required CI verification steps", () => {
    const workflowPath = ".github/workflows/check.yml";
    assert.ok(fs.existsSync(workflowPath), "check.yml must exist");

    const content = fs.readFileSync(workflowPath, "utf8");
    const parsed = yaml.load(content);

    assert.ok(parsed && typeof parsed === "object", "check.yml must parse into an object");
    assert.ok(parsed.jobs && parsed.jobs.verify, "check.yml must contain verify job");

    const steps = parsed.jobs.verify.steps;
    assert.ok(Array.isArray(steps), "verify job must have steps array");

    // Required steps:
    // 1. Playwright install
    const playwrightStep = steps.find(
      (s) => s.run && s.run.includes("playwright install") && s.run.includes("chromium")
    );
    assert.ok(playwrightStep, "Must contain Playwright install step with chromium");

    // 2. seed-menu
    const seedMenuStep = steps.find(
      (s) => s.run && s.run.includes("tooling/local.mjs seed-menu")
    );
    assert.ok(seedMenuStep, "Must contain seed-menu step");

    // 3. npm run test:e2e with CI=1
    const testE2EStep = steps.find(
      (s) => s.run && s.run.includes("npm run test:e2e")
    );
    assert.ok(testE2EStep, "Must contain npm run test:e2e step");
    assert.equal(testE2EStep.env?.CI, "1", "npm run test:e2e must set CI: '1'");

    // Step order assertion: npm run check -> playwright install -> seed-menu -> npm run test:e2e
    const checkIdx = steps.findIndex((s) => s.run && s.run.includes("npm run check"));
    const pwIdx = steps.findIndex((s) => s === playwrightStep);
    const seedIdx = steps.findIndex((s) => s === seedMenuStep);
    const e2eIdx = steps.findIndex((s) => s === testE2EStep);

    assert.ok(checkIdx >= 0, "npm run check must be present");
    assert.ok(checkIdx < pwIdx, "npm run check must precede Playwright install");
    assert.ok(pwIdx < seedIdx, "Playwright install must precede seed-menu");
    assert.ok(seedIdx < e2eIdx, "seed-menu must precede test:e2e");
  });
});
