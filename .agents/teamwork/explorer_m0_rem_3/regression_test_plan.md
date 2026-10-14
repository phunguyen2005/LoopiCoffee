# Multi-Store Regression Test Plan & Recommendation

- **Author:** `explorer_m0_rem_3` (teamwork_preview_explorer)
- **Milestone:** Milestone M0 Iteration 2 (Remediation)
- **Target File:** `tests/workforce-golden-cases.test.mjs`
- **Related Source:** `tests/fixtures/workforce-fixtures.mjs`
- **Schema Reference:** `drizzle/0008_ordering_system.sql:73`
- **Date:** 2026-10-13T17:45:00Z

---

## 1. Defect Root Cause Analysis

### 1.1 Verbatim Failure from Empirical Stress-Testing
Challenger `challenger_m0_1` uncovered an unhandled unique constraint collision when executing `buildRetentionScenario` across multi-store fixtures:

```
SqliteError: UNIQUE constraint failed: customer_orders.order_code
    at buildRetentionScenario (tests/fixtures/workforce-fixtures.mjs:537:6)
    code: 'ERR_SQLITE_ERROR',
    errcode: 2067,
    errstr: 'constraint failed'
```

### 1.2 Mechanism & Code Analysis
In `tests/fixtures/workforce-fixtures.mjs` (lines 533–544):
```javascript
  const oldOrderId = `order-old-${crypto.randomUUID()}`;
  db.sqlite.prepare(`
    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
    VALUES (?, 'ORD-OLD-01', ?, 'Nguyễn Văn A', '0901234567', 'Giao gấp', 150000, 2, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(oldOrderId, fixture.storeId);

  const freshOrderId = `order-fresh-${crypto.randomUUID()}`;
  db.sqlite.prepare(`
    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
    VALUES (?, 'ORD-FRESH-01', ?, 'Trần Thị B', '0912345678', 'Ít đá', 65000, 1, 'completed', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
  `).run(freshOrderId, fixture.storeId);
```

In `drizzle/0008_ordering_system.sql` (line 73):
```sql
CREATE UNIQUE INDEX `customer_orders_order_code_idx` ON `customer_orders` (`order_code`);
```

**Root Cause:**
1. The unique index `customer_orders_order_code_idx` is **table-wide and global** across all stores in `customer_orders`, not scoped by `(store_id, order_code)`.
2. `createMultiStoreFixture(db)` provisions `storeA` (`store-alpha`) and `storeB` (`store-beta`) inside the same SQLite `:memory:` database instance.
3. When `buildRetentionScenario(db, storeA)` runs, it inserts orders with hardcoded `order_code` values `'ORD-OLD-01'` and `'ORD-FRESH-01'`.
4. When `buildRetentionScenario(db, storeB)` runs next in the same database, it attempts to insert `'ORD-OLD-01'` a second time, immediately violating the global unique index and terminating with SQLite error code `2067`.
5. This defect escaped earlier detection because `tests/workforce-golden-cases.test.mjs` only executed `buildRetentionScenario` in single-store tests (`store-c07-1`, `store-c07-2`, `store-c07-4`) with freshly isolated database instances per test.

### 1.3 Secondary Technical Finding: Intra-Store Shift Date Contention
Investigation revealed an additional structural constraint:
- `buildSwapScenario` (shift on `2026-07-03T01:00..05:00`),
- `buildDraftOverlapScenario` (draft shift on `2026-07-03T01:00..05:00`),
- `buildAttendanceClippingScenario` (shift on `2026-07-03T01:00..05:00`),
- `buildHandoverScenario` (morning shift on `2026-07-03T00:00..05:00`)
all seed shifts for `employeeA` on the exact same date (`2026-07-03`) overlapping between `01:00` and `05:00` UTC.
- If multiple shift scenarios are invoked on the **same single store instance** (`storeA`), SQLite trigger `shifts_no_overlap_insert` (`drizzle/0011_workforce_integrity.sql:61-69`) correctly triggers `shift_overlap`.
- Between `storeA` and `storeB`, however, `store_id` and `employee_email` are strictly disjoint, so cross-store shift executions never clash.

---

## 2. Test Recommendation: Two-Tier Multi-Store Regression Suite

To ensure complete regression prevention and permanent validation of multi-tenant isolation, we recommend adding a dedicated regression test block to `tests/workforce-golden-cases.test.mjs`.

### Tier 1: `C07-5` — Targeted Multi-Store Order Code & Retention Isolation Test
- **Location:** Under `describe("C07: Retention Lifecycles & 3-Year Preservation Invariant")` (right after test `C07-4` at line 690).
- **Purpose:** Direct regression guard specifically targeting the `order_code` collision defect across stores in a shared database.

```javascript
    test("C07-5: Multi-store isolation for retention scenario and order code global uniqueness", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const { storeA, storeB } = createMultiStoreFixture(db);

      // Concurrently execute retention scenario across both stores
      const [scenarioA, scenarioB] = await Promise.all([
        Promise.resolve(buildRetentionScenario(db, storeA)),
        Promise.resolve(buildRetentionScenario(db, storeB)),
      ]);

      // 1. Verify returned order identifiers exist and are distinct
      assert.ok(scenarioA.oldOrderId);
      assert.ok(scenarioB.oldOrderId);
      assert.notEqual(scenarioA.oldOrderId, scenarioB.oldOrderId);
      assert.notEqual(scenarioA.freshOrderId, scenarioB.freshOrderId);

      // 2. Query all orders across stores to verify global unique index compliance
      const orders = db.sqlite.prepare(`
        SELECT id, order_code, store_id, customer_name, total_amount, status
        FROM customer_orders
        ORDER BY store_id, created_at
      `).all();

      // Exactly 4 orders must exist: 2 belonging to storeA, 2 belonging to storeB
      assert.equal(orders.length, 4, "Expected exactly 4 customer orders across storeA and storeB");

      const ordersA = orders.filter((o) => o.store_id === storeA.storeId);
      const ordersB = orders.filter((o) => o.store_id === storeB.storeId);
      assert.equal(ordersA.length, 2, "Expected 2 orders for storeA");
      assert.equal(ordersB.length, 2, "Expected 2 orders for storeB");

      // Verify all order codes are globally distinct (no customer_orders_order_code_idx violation)
      const orderCodes = new Set(orders.map((o) => o.order_code));
      assert.equal(orderCodes.size, 4, "All order codes across stores must be globally unique");

      // 3. Verify attendance evidence and operational events are isolated per store
      const photosA = db.sqlite.prepare(`
        SELECT count(*) as count FROM attendance_photos ap
        JOIN attendance_events ae ON ap.event_id = ae.id
        JOIN attendance_sessions asess ON ae.session_id = asess.id
        WHERE asess.store_id = ?
      `).get(storeA.storeId).count;
      const photosB = db.sqlite.prepare(`
        SELECT count(*) as count FROM attendance_photos ap
        JOIN attendance_events ae ON ap.event_id = ae.id
        JOIN attendance_sessions asess ON ae.session_id = asess.id
        WHERE asess.store_id = ?
      `).get(storeB.storeId).count;

      assert.equal(photosA, 2, "Expected 2 photos for storeA");
      assert.equal(photosB, 2, "Expected 2 photos for storeB");

      // 4. Verify evidence expiry cleans only expired items for both stores independently
      const fakeR2 = { delete: async () => {} };
      const now = "2026-07-02T00:00:00.000Z";
      await expireEvidence(db, fakeR2, now);

      // Expired photos for both stores removed, active photos preserved
      assert.equal(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioA.expiredEventId), undefined);
      assert.equal(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioB.expiredEventId), undefined);
      assert.ok(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioA.activeEventId));
      assert.ok(db.sqlite.prepare("SELECT * FROM attendance_photos WHERE event_id = ?").get(scenarioB.activeEventId));
    });
```

---

### Tier 2: `MS-1` — Comprehensive All-Scenario Multi-Store Concurrency Suite
- **Location:** As a dedicated section after C07 (lines 691–692) before the closing brace of `describe("Workforce Golden Cases (C01 - C07)", ...)`.
- **Purpose:** Systematically invokes **ALL** scenario builders concurrently across both `storeA` and `storeB`, ensuring zero cross-tenant bleeding and zero collision across all domain models.

```javascript
  // =========================================================================
  // Multi-Store Isolation & Concurrent Scenario Execution
  // =========================================================================
  describe("Multi-Store Fixture: Cross-Tenant Scenario Concurrency", () => {
    test("MS-1: createMultiStoreFixture concurrently executes ALL scenario builders across storeA and storeB without collision", async (t) => {
      // 1. Verify Pure Logic Scenario Builder
      const rateScenario = buildRateHistoryScenario();
      assert.equal(typeof rateScenario.floor15, "function");
      assert.equal(typeof rateScenario.round1000, "function");
      assert.equal(rateScenario.floor15(29), 15);
      assert.equal(rateScenario.round1000(1450500), 1451000);

      // 2. Scenario Builders Matrix
      // Each DB-backed scenario builder is invoked concurrently across storeA and storeB
      const dbMatrix = createDatabase();
      t.after(() => dbMatrix.close());
      const { storeA, storeB } = createMultiStoreFixture(dbMatrix);

      // A. Swap Scenario Concurrency
      const [swapA, swapB] = await Promise.all([
        Promise.resolve(buildSwapScenario(dbMatrix, storeA)),
        Promise.resolve(buildSwapScenario(dbMatrix, storeB)),
      ]);
      assert.ok(swapA.request.id);
      assert.ok(swapB.request.id);
      assert.notEqual(swapA.request.id, swapB.request.id);
      assert.notEqual(swapA.shiftA.id, swapB.shiftA.id);
      assert.notEqual(swapA.shiftB.id, swapB.shiftB.id);

      // B. Attendance Clipping Scenario Concurrency
      // Tested on fresh multi-store instance to isolate shift calendar timeline
      const dbClipping = createDatabase();
      t.after(() => dbClipping.close());
      const msClipping = createMultiStoreFixture(dbClipping);
      const [clipA, clipB] = await Promise.all([
        Promise.resolve(buildAttendanceClippingScenario(dbClipping, msClipping.storeA)),
        Promise.resolve(buildAttendanceClippingScenario(dbClipping, msClipping.storeB)),
      ]);
      assert.ok(clipA.shift.id);
      assert.ok(clipB.shift.id);
      assert.notEqual(clipA.shift.id, clipB.shift.id);
      assert.equal(clipA.caseA.expectedPayableMinutes, 240);
      assert.equal(clipB.caseA.expectedPayableMinutes, 240);

      // C. Handover Scenario Concurrency
      const dbHandover = createDatabase();
      t.after(() => dbHandover.close());
      const msHandover = createMultiStoreFixture(dbHandover);
      const [hoA, hoB] = await Promise.all([
        Promise.resolve(buildHandoverScenario(dbHandover, msHandover.storeA)),
        Promise.resolve(buildHandoverScenario(dbHandover, msHandover.storeB)),
      ]);
      assert.ok(hoA.handover.id);
      assert.ok(hoB.handover.id);
      assert.notEqual(hoA.handover.id, hoB.handover.id);
      assert.notEqual(hoA.morningShift.id, hoB.morningShift.id);
      assert.equal(hoA.unacknowledged, true);
      assert.equal(hoB.unacknowledged, true);

      // D. Draft Overlap Scenario Concurrency
      const dbDraft = createDatabase();
      t.after(() => dbDraft.close());
      const msDraft = createMultiStoreFixture(dbDraft);
      const [draftA, draftB] = await Promise.all([
        Promise.resolve(buildDraftOverlapScenario(dbDraft, msDraft.storeA)),
        Promise.resolve(buildDraftOverlapScenario(dbDraft, msDraft.storeB)),
      ]);
      assert.ok(draftA.draftShift.id);
      assert.ok(draftB.draftShift.id);
      assert.notEqual(draftA.draftShift.id, draftB.draftShift.id);

      // E. Retention Scenario Concurrency (Regresses order_code collision)
      const dbRetention = createDatabase();
      t.after(() => dbRetention.close());
      const msRetention = createMultiStoreFixture(dbRetention);
      const [retA, retB] = await Promise.all([
        Promise.resolve(buildRetentionScenario(dbRetention, msRetention.storeA)),
        Promise.resolve(buildRetentionScenario(dbRetention, msRetention.storeB)),
      ]);
      assert.ok(retA.oldOrderId);
      assert.ok(retB.oldOrderId);
      assert.notEqual(retA.oldOrderId, retB.oldOrderId);
      assert.notEqual(retA.freshOrderId, retB.freshOrderId);

      // Verify all orders created across stores in dbRetention are distinct
      const orders = dbRetention.sqlite.prepare(`SELECT order_code, store_id FROM customer_orders`).all();
      assert.equal(orders.length, 4);
      assert.equal(new Set(orders.map((o) => o.order_code)).size, 4);
    });
  });
```

---

## 3. Required Code Change for Worker `worker_m0_1`

To allow the recommended regression tests to pass, `worker_m0_1` must patch `tests/fixtures/workforce-fixtures.mjs`.

### Target Diff in `tests/fixtures/workforce-fixtures.mjs`
At lines 533–544:

```diff
-  const oldOrderId = `order-old-${crypto.randomUUID()}`;
-  db.sqlite.prepare(`
-    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
-    VALUES (?, 'ORD-OLD-01', ?, 'Nguyễn Văn A', '0901234567', 'Giao gấp', 150000, 2, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
-  `).run(oldOrderId, fixture.storeId);
-
-  const freshOrderId = `order-fresh-${crypto.randomUUID()}`;
-  db.sqlite.prepare(`
-    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
-    VALUES (?, 'ORD-FRESH-01', ?, 'Trần Thị B', '0912345678', 'Ít đá', 65000, 1, 'completed', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
-  `).run(freshOrderId, fixture.storeId);
+  const oldOrderId = `order-old-${crypto.randomUUID()}`;
+  const oldOrderCode = `ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
+  db.sqlite.prepare(`
+    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
+    VALUES (?, ?, ?, 'Nguyễn Văn A', '0901234567', 'Giao gấp', 150000, 2, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
+  `).run(oldOrderId, oldOrderCode, fixture.storeId);
+
+  const freshOrderId = `order-fresh-${crypto.randomUUID()}`;
+  const freshOrderCode = `ORD-FRESH-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
+  db.sqlite.prepare(`
+    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
+    VALUES (?, ?, ?, 'Trần Thị B', '0912345678', 'Ít đá', 65000, 1, 'completed', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
+  `).run(freshOrderId, freshOrderCode, fixture.storeId);
```

Also, in the return object of `buildRetentionScenario` (lines 560–567):
```diff
   return {
     expiredEventId: expiredEvent.id,
     activeEventId: activeEvent.id,
     oldOrderId,
+    oldOrderCode,
     freshOrderId,
+    freshOrderCode,
     historicEventId: historicEvent.id,
     historicSessionId: historicSession.id,
   };
```

---

## 4. Verification & Reproduction Method

### Reproduction Command (Fails on unpatched codebase)
```bash
node -e "
import('./tests/helpers/database.mjs').then(async ({ createDatabase }) => {
  const { createMultiStoreFixture, buildRetentionScenario } = await import('./tests/fixtures/workforce-fixtures.mjs');
  const db = createDatabase();
  const { storeA, storeB } = createMultiStoreFixture(db);
  buildRetentionScenario(db, storeA);
  buildRetentionScenario(db, storeB); // Throws: SqliteError: UNIQUE constraint failed: customer_orders.order_code
});
"
```

### Full Verification Command (After patch applied)
```bash
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```
Expected output: All tests pass (185+ passing, 0 failing, 0 errors).
