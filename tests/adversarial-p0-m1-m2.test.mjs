import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";
import jpeg from "jpeg-js";
import { readMigrationFiles } from "drizzle-orm/migrator";
import * as schema from "../db/schema.ts";

import {
  validateJpegDataUrl,
  parseJpegDimensions,
} from "../lib/evidence.ts";
import { createDatabase, seedStore } from "./helpers/database.mjs";
import { createOrder } from "../modules/ordering/application/create-order.ts";
import { trackOrder } from "../modules/ordering/application/track-order.ts";
import { changeOrderStatus } from "../modules/ordering/application/change-status.ts";
import { limitOrderRequests, resetTrackingRateLimitsForTesting } from "../modules/ordering/application/rate-limit.ts";
import * as input from "../modules/ordering/application/input.ts";
import * as errors from "../platform/http/errors.ts";
import * as audit from "../server/audit.ts";

// Helper: Transpile and instantiate Next.js API route handlers in tests
function route(path, db, currentActor = { storeId: "store-test", email: "manager@example.test", role: "manager" }) {
  const dependencies = {
    "@/db/runtime": { ensureDatabase: async () => db, STORE_ID: "store-test" },
    "@/server/auth": {
      requireApiUser: async (roles) =>
        currentActor
          ? !roles || roles.includes(currentActor.role)
            ? { actor: currentActor }
            : { response: Response.json({ error: "forbidden" }, { status: 403 }) }
          : { response: Response.json({ error: "unauthorized" }, { status: 401 }) },
    },
    "@/platform/http/errors": errors,
    "@/server/audit": audit,
    "@/modules/ordering/application/create-order": { createOrder },
    "@/modules/ordering/application/track-order": { trackOrder },
    "@/modules/ordering/application/change-status": { changeOrderStatus },
    "@/modules/ordering/application/rate-limit": { limitOrderRequests },
    "@/modules/ordering/application/input": input,
  };
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("exports", "require", code)(exports, (name) => {
    assert.ok(dependencies[name], `Unexpected import ${name}`);
    return dependencies[name];
  });
  return exports;
}

// Helper: Setup store ordering fixtures
function setupOrderingDb(t) {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-test");
  const now = "2026-09-17T00:00:00.000Z";
  db.sqlite.prepare("INSERT INTO store_ordering_settings (id, store_id, is_ordering_open, updated_at) VALUES ('settings', 'store-test', 1, ?)").run(now);
  db.sqlite.prepare("INSERT INTO menu_categories (id, store_id, name, created_at, updated_at) VALUES ('cat', 'store-test', 'Tea', ?, ?)").run(now, now);
  db.sqlite.prepare("INSERT INTO menu_items (id, store_id, category_id, name, base_price, image_url, created_at, updated_at) VALUES ('tea', 'store-test', 'cat', 'Canonical Tea', 45000, '/tea.jpg', ?, ?)").run(now, now);
  for (const [id, group, price] of [["large", "size", 6000], ["half", "sugar", 0], ["normal", "ice", 0], ["pearl", "topping", 5000]]) {
    db.sqlite.prepare("INSERT INTO menu_options (id, store_id, group_type, name, price_modifier, created_at, updated_at) VALUES (?, 'store-test', ?, ?, ?, ?, ?)").run(id, group, id, price, now, now);
  }
  return db;
}

// Generate realistic 1280x960 JPEG dataUrl
function generate1280x960JpegDataUrl() {
  const width = 1280;
  const height = 960;
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 160;
    raw[i + 1] = 120;
    raw[i + 2] = 80;
    raw[i + 3] = 255;
  }
  const encoded = jpeg.encode({ data: raw, width, height }, 60);
  return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
}

// =============================================================================
// 1. M1 ADVERSARIAL VERIFICATION: BENCHMARK JPEG SOF PARSER ON 1280x960
// =============================================================================
test("M1-ADV-01: Benchmark JPEG SOF parser on 1280x960 image over 100 iterations (CPU < 2ms)", () => {
  const dataUrl = generate1280x960JpegDataUrl();

  // Warmup (10 iterations)
  for (let i = 0; i < 10; i++) {
    const warmupResult = validateJpegDataUrl(dataUrl);
    assert.equal(warmupResult.width, 1280);
    assert.equal(warmupResult.height, 960);
  }

  // 100 Measured benchmark iterations
  const iterations = 100;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const res = validateJpegDataUrl(dataUrl);
    assert.equal(res.width, 1280);
    assert.equal(res.height, 960);
  }
  const totalMs = performance.now() - start;
  const avgMs = totalMs / iterations;

  assert.ok(
    avgMs < 2.0,
    `Average CPU time per iteration of validateJpegDataUrl must be < 2ms, actual: ${avgMs.toFixed(4)}ms (total: ${totalMs.toFixed(2)}ms for ${iterations} iterations)`,
  );

  // Dedicated test for JPEG SOF marker parser alone (< 0.1ms)
  const bytes = Buffer.from(dataUrl.slice("data:image/jpeg;base64,".length), "base64");
  const parseStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    const dim = parseJpegDimensions(bytes);
    assert.equal(dim.width, 1280);
    assert.equal(dim.height, 960);
  }
  const parseTotalMs = performance.now() - parseStart;
  const parseAvgMs = parseTotalMs / iterations;

  assert.ok(
    parseAvgMs < 0.1,
    `Average CPU time of parseJpegDimensions must be < 0.1ms, actual: ${parseAvgMs.toFixed(4)}ms (total: ${parseTotalMs.toFixed(2)}ms for ${iterations} iterations)`,
  );
});

// =============================================================================
// 2. M1 ADVERSARIAL VERIFICATION: ADVERSARIAL JPEG PAYLOADS
// =============================================================================
test("M1-ADV-02: Adversarial JPEG payloads reject with descriptive errors", () => {
  const toDataUrl = (bytes) => `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;

  // 1. Truncated header: Only SOI
  assert.throws(
    () => validateJpegDataUrl(toDataUrl([0xff, 0xd8])),
    /giải mã nội dung JPEG|không phải ảnh JPEG/i,
  );

  // 2. Truncated header: SOI + 0xFF
  assert.throws(
    () => validateJpegDataUrl(toDataUrl([0xff, 0xd8, 0xff])),
    /giải mã nội dung JPEG|không phải ảnh JPEG/i,
  );

  // 3. Truncated header: SOI + SOF0 marker without length
  assert.throws(
    () => validateJpegDataUrl(toDataUrl([0xff, 0xd8, 0xff, 0xc0])),
    /giải mã nội dung JPEG|không phải ảnh JPEG/i,
  );

  // 4. Truncated header: SOI + incomplete length payload
  assert.throws(
    () => validateJpegDataUrl(toDataUrl([0xff, 0xd8, 0xff, 0xc0, 0x00])),
    /giải mã nội dung JPEG|không phải ảnh JPEG/i,
  );

  // 5. Length underflow: segment length < 2 or < 8 for SOF
  assert.throws(
    () => validateJpegDataUrl(toDataUrl([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x05, 0x08, 0x01, 0x00, 0xff, 0xd9])),
    /giải mã nội dung JPEG/i,
  );

  // 6. Length overflow: segment length extends beyond buffer
  assert.throws(
    () => validateJpegDataUrl(toDataUrl([0xff, 0xd8, 0xff, 0xc0, 0xff, 0xff, 0x08, 0x01, 0x00, 0xff, 0xd9])),
    /giải mã nội dung JPEG/i,
  );

  // 7. Missing SOS: SOF present, but no SOS before EOI
  const noSosBytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(noSosBytes)),
    /giải mã nội dung JPEG/i,
  );

  // 8. Zero scan data: SOS directly followed by EOI with 0 scan bytes
  const zeroScanBytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xff, 0xd9,
  ];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(zeroScanBytes)),
    /giải mã nội dung JPEG/i,
  );

  // 9. Garbage non-JPEG headers: PNG, GIF, WebP, PDF
  const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(pngHeader)),
    /không phải ảnh JPEG/i,
  );

  const gifHeader = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(gifHeader)),
    /không phải ảnh JPEG/i,
  );

  const webpHeader = [0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(webpHeader)),
    /không phải ảnh JPEG/i,
  );

  // 10. Non-0xFF byte where marker expected
  const corruptedMarker = [
    0xff, 0xd8,
    0x00, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03,
    0xff, 0xd9,
  ];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(corruptedMarker)),
    /giải mã nội dung JPEG/i,
  );

  // 11. Boundary dimensions: < 240 or > 2048
  // Dimensions 239x239
  const smallDimensionBytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xef, 0x00, 0xef, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x12, 0x34, 0x56, 0x78,
    0xff, 0xd9,
  ];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(smallDimensionBytes)),
    /Ảnh quá nhỏ hoặc không đọc được kích thước/i,
  );

  // Dimensions 2049x2049
  const largeDimensionBytes = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x08, 0x01, 0x08, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x12, 0x34, 0x56, 0x78,
    0xff, 0xd9,
  ];
  assert.throws(
    () => validateJpegDataUrl(toDataUrl(largeDimensionBytes)),
    /Kích thước ảnh vượt quá giới hạn/i,
  );
});

// =============================================================================
// 3. M1 ADVERSARIAL VERIFICATION: CONCURRENCY & D1 ZERO WRITE INVARIANT
// =============================================================================
test("M1-ADV-03: Concurrency & D1 Zero Write Invariant on /api/order/track (30 concurrent calls + 120 rate limit ceiling)", async (t) => {
  const db = setupOrderingDb(t);
  const trackHandler = route("app/api/order/track/route.ts", db);

  // Place a valid order to obtain a live receipt token
  const receiptToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
  const placed = await createOrder(
    db,
    "store-test",
    {
      customerName: "Stress Customer",
      customerPhone: "0901234567",
      items: [{ itemId: "tea", quantity: 1, sizeId: "large" }],
    },
    crypto.randomUUID(),
    receiptToken,
  );
  assert.ok(placed.order?.id);

  // Reset rate limits before stress test
  resetTrackingRateLimitsForTesting();

  // Install strict D1 Write Spy
  let d1WriteCount = 0;
  const originalPrepare = db.prepare;
  db.prepare = (sql, values = []) => {
    if (/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i.test(sql)) {
      d1WriteCount++;
      throw new Error(`VIOLATION: D1 Write attempt detected on read-only order tracking: ${sql}`);
    }
    return originalPrepare(sql, values);
  };
  db.failOn(/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i);

  // 1. Dispatch 30 concurrent polling requests
  const concurrentCalls = 30;
  const promises = [];
  for (let i = 0; i < concurrentCalls; i++) {
    const req = new Request("http://localhost/api/order/track", {
      headers: {
        "x-order-receipt": receiptToken,
        "cf-connecting-ip": `203.0.113.${10 + (i % 3)}`,
      },
    });
    promises.push(trackHandler.GET(req));
  }

  const responses = await Promise.all(promises);
  assert.equal(responses.length, 30);
  for (let i = 0; i < responses.length; i++) {
    assert.equal(responses[i].status, 200, `Concurrent request #${i + 1} must return 200 OK`);
    const data = await responses[i].json();
    assert.equal(data.order.id, placed.order.id);
  }

  // Assert strictly 0 D1 write operations
  assert.equal(d1WriteCount, 0, "Strict D1 write invariant: expected 0 writes, got " + d1WriteCount);
  const rateLimitRows = db.sqlite.prepare("SELECT count(*) n FROM order_rate_limits").get().n;
  assert.equal(rateLimitRows, 0, "order_rate_limits table must contain 0 rows");

  // 2. Test Rate Limit Ceiling per IP (120 allowed, 121st rejected with 429)
  const testIp = "198.51.100.77";

  for (let reqNum = 1; reqNum <= 120; reqNum++) {
    const req = new Request("http://localhost/api/order/track", {
      headers: { "x-order-receipt": receiptToken, "cf-connecting-ip": testIp },
    });
    const res = await trackHandler.GET(req);
    assert.equal(res.status, 200, `Request #${reqNum} under 120 ceiling must return 200 OK`);
  }

  // 121st request from same IP must be rejected with 429 Too Many Requests
  const req121 = new Request("http://localhost/api/order/track", {
    headers: { "x-order-receipt": receiptToken, "cf-connecting-ip": testIp },
  });
  const res121 = await trackHandler.GET(req121);
  assert.equal(res121.status, 429, "121st request from same IP must return HTTP 429");
  const err121 = await res121.json();
  assert.equal(err121.code, "rate_limited");

  // Request from a different IP is completely unaffected (IP isolation)
  const differentIpReq = new Request("http://localhost/api/order/track", {
    headers: { "x-order-receipt": receiptToken, "cf-connecting-ip": "198.51.100.99" },
  });
  const diffRes = await trackHandler.GET(differentIpReq);
  assert.equal(diffRes.status, 200, "Different IP must not be throttled by neighbor's quota");

  // Verify write count remains strictly 0 after all 152 requests
  assert.equal(d1WriteCount, 0, "D1 write operations must remain strictly 0 throughout rate limiting");
});

// =============================================================================
// 4. M2 ADVERSARIAL VERIFICATION: DRIZZLE MIGRATION PREFLIGHT & RECOGNITION
// =============================================================================
test("M2-ADV-01: Drizzle migration preflight parses 29 statements in 0011, creates 31 tables & 15 triggers with 0 FK errors", (t) => {
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  assert.equal(migrations.length, 15, "Expected exactly 15 registered migrations");

  const m11 = migrations.find((m) => m.folderMillis === 1789640575611);
  assert.ok(m11, "Migration 0011_workforce_integrity must be present");
  assert.equal(m11.sql.length, 29, "Migration 0011 must parse into exactly 29 separate statements");
  for (let i = 0; i < m11.sql.length; i++) {
    assert.ok(m11.sql[i].trim().length > 0, `Statement #${i + 1} in 0011 must be non-empty`);
  }

  const m13 = migrations.find((m) => m.folderMillis === 1789640575630);
  assert.ok(m13, "Migration 0013_workforce_guardrails must be present");
  assert.equal(m13.sql.length, 1, "Migration 0013 must parse into exactly 1 statement");

  // Execute clean SQLite in-memory migration preflight
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON;");

  for (const migration of migrations) {
    for (const stmt of migration.sql) {
      const cleanStmt = stmt.trim();
      if (!cleanStmt) continue;
      db.prepare(cleanStmt).run();
    }
  }

  // Verify 31 physical tables
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);
  assert.equal(tables.length, 31, "Catalog must contain exactly 31 physical tables");

  // Verify 15 triggers
  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
    .all()
    .map((r) => r.name);
  assert.equal(triggers.length, 15, "Catalog must contain exactly 15 active triggers");

  // Verify zero foreign key violations
  const fkViolations = db.prepare("PRAGMA foreign_key_check").all();
  assert.equal(fkViolations.length, 0, "Clean migration execution must produce 0 foreign key violations");
});

// =============================================================================
// 5. M2 ADVERSARIAL VERIFICATION: CATALOG SCHEMA DRIFT & IMMUTABILITY TRIGGERS
// =============================================================================
test("M2-ADV-02: Zero catalog schema drift against db/schema.ts and immutable trigger enforcement", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON;");

  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  for (const migration of migrations) {
    for (const stmt of migration.sql) {
      const cleanStmt = stmt.trim();
      if (!cleanStmt) continue;
      db.prepare(cleanStmt).run();
    }
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);

  const driftMismatches = [];

  for (const tableName of tables) {
    const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const drizzleTable = Object.values(schema).find(
      (obj) => obj && typeof obj === "object" && obj[Symbol.for("drizzle:Name")] === tableName,
    );
    assert.ok(drizzleTable, `Table ${tableName} must be declared in db/schema.ts`);

    const drizzleColumns = drizzleTable[Symbol.for("drizzle:Columns")] || {};

    for (const col of tableInfo) {
      const dCol = Object.values(drizzleColumns).find((c) => c.name === col.name);
      assert.ok(dCol, `Column ${tableName}.${col.name} must exist in db/schema.ts`);

      const dbNotNull = col.notnull === 1;
      const schemaNotNull = dCol.notNull === true;
      if (dbNotNull !== schemaNotNull) {
        driftMismatches.push(
          `NOTNULL mismatch on ${tableName}.${col.name}: db=${dbNotNull}, schema=${schemaNotNull}`,
        );
      }

      const dbHasDefault = col.dflt_value !== null;
      const schemaHasDefault = dCol.hasDefault === true;
      if (dbHasDefault !== schemaHasDefault) {
        driftMismatches.push(
          `DEFAULT mismatch on ${tableName}.${col.name}: db=${col.dflt_value}, schema=${schemaHasDefault}`,
        );
      }
    }
  }

  assert.deepEqual(driftMismatches, [], "Catalog schema drift check must return 0 mismatches");

  // Stress-test triggers: Immutability enforcement
  db.prepare(`INSERT INTO stores (id, name, address, latitude, longitude, created_at) VALUES ('s-adv', 'Store Adv', '123 St', 10.0, 106.0, '2026-07-01T00:00:00Z')`).run();
  db.prepare(`INSERT INTO employees (id, store_id, email, display_name, role, created_at, updated_at) VALUES ('e-adv', 's-adv', 'adv@test.com', 'Adv', 'employee', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z')`).run();
  db.prepare(`INSERT INTO attendance_sessions (id, store_id, employee_email, status, revision) VALUES ('ses-adv', 's-adv', 'adv@test.com', 'open', 0)`).run();

  // 1. attendance_corrections immutability
  db.prepare(`INSERT INTO attendance_corrections (id, session_id, action, effective_time, reason, actor_email, created_at) VALUES ('c-adv', 'ses-adv', 'check_in', '2026-07-01T08:00:00Z', 'Reason', 'mgr@test.com', '2026-07-01T08:05:00Z')`).run();

  assert.throws(
    () => db.prepare(`UPDATE attendance_corrections SET reason = 'tampered' WHERE id = 'c-adv'`).run(),
    /immutable_attendance_correction/i,
  );
  assert.throws(
    () => db.prepare(`DELETE FROM attendance_corrections WHERE id = 'c-adv'`).run(),
    /immutable_attendance_correction/i,
  );

  // 2. payroll_adjustments immutability
  db.prepare(`INSERT INTO payroll_adjustments (id, store_id, period_key, employee_email, amount, reason, actor_email, created_at) VALUES ('p-adv', 's-adv', '2026-07', 'adv@test.com', 50000, 'Bonus', 'mgr@test.com', '2026-07-01T00:00:00Z')`).run();

  assert.throws(
    () => db.prepare(`UPDATE payroll_adjustments SET amount = 99999 WHERE id = 'p-adv'`).run(),
    /immutable_payroll_adjustment/i,
  );
  assert.throws(
    () => db.prepare(`DELETE FROM payroll_adjustments WHERE id = 'p-adv'`).run(),
    /immutable_payroll_adjustment/i,
  );
});
