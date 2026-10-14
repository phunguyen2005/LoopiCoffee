# Handoff Report — Milestone M0 Iteration 2 (Remediation Analysis)

**Agent ID:** `explorer_m0_rem_1` (teamwork_preview_explorer)  
**Parent Conversation ID:** `6e943540-9db4-4898-95f7-1382b16362bf`  
**Working Directory:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_rem_1\`  
**Timestamp:** 2026-10-13T17:40:00Z  
**Target:** Package P00 Fixture Remediation (`tests/fixtures/workforce-fixtures.mjs`)  

---

## 1. Observation

### 1.1 Direct Defect Reproduction
- Command executed:
  ```powershell
  node --experimental-strip-types -e "import { createDatabase } from './tests/helpers/database.mjs'; import { createMultiStoreFixture, buildRetentionScenario } from './tests/fixtures/workforce-fixtures.mjs'; const db = createDatabase(); const { storeA, storeB } = createMultiStoreFixture(db); buildRetentionScenario(db, storeA); buildRetentionScenario(db, storeB);"
  ```
- Verbatim error output:
  ```
  file:///D:/College/Practice/loopicafe-management-system/tests/fixtures/workforce-fixtures.mjs:537
    `).run(oldOrderId, fixture.storeId);
       ^

  Error: UNIQUE constraint failed: customer_orders.order_code
      at buildRetentionScenario (file:///D:/College/Practice/loopicafe-management-system/tests/fixtures/workforce-fixtures.mjs:537:6)
      at file:///D:/College/Practice/loopicafe-management-system/[eval1]:1:292
  ```

### 1.2 Schema and Index Constraints Observed
- File: `drizzle/0008_ordering_system.sql`, Line 73:
  ```sql
  CREATE UNIQUE INDEX `customer_orders_order_code_idx` ON `customer_orders` (`order_code`);
  ```
- File: `db/schema.ts`, Line 377:
  ```typescript
  uniqueIndex("customer_orders_order_code_idx").on(table.orderCode),
  ```
  Observation: The index is table-wide and globally unique on column `order_code` across all stores (not a compound index on `(store_id, order_code)`).

### 1.3 Exact Code in `tests/fixtures/workforce-fixtures.mjs`
- Lines 533–544:
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
- Lines 560–567:
  ```javascript
  return {
    expiredEventId: expiredEvent.id,
    activeEventId: activeEvent.id,
    oldOrderId,
    freshOrderId,
    historicEventId: historicEvent.id,
    historicSessionId: historicSession.id,
  };
  ```

### 1.4 Consumer Test Usage in `tests/workforce-golden-cases.test.mjs`
- Lines 611, 652, 676 invoke `buildRetentionScenario(db, fixture)` in tests `C07-1`, `C07-2`, `C07-4`.
- Each test runs in an isolated `const db = createDatabase();` instance, which explains why single-store unit tests passed previously.
- None of the test cases depend on a hardcoded string `'ORD-OLD-01'` or `'ORD-FRESH-01'`.
- Test `C07-3` (Line 668) is currently skipped pending Milestone M4 / Package P08:
  ```javascript
  test("C07-3: 180-day order anonymization masks PII while preserving revenue (t.skip for M4/P08)", (t) => {
    t.skip("Will be activated in Milestone M4/P08 (Package P08: Order PII anonymization)");
  });
  ```

### 1.5 Baseline Suite Verification Results
- `npm.cmd test`: 194 tests across 9 suites passed (184 passed, 0 failed, 10 skipped).

---

## 2. Logic Chain

1. **Global Uniqueness Invariant** (Observation 1.2):
   - SQLite table `customer_orders` enforces global uniqueness across the entire table for `order_code` via `customer_orders_order_code_idx`.
   - Any insertion of an existing `order_code` will immediately fail with `SqliteError: UNIQUE constraint failed: customer_orders.order_code`.

2. **Hardcoded Collisions Across Stores** (Observation 1.1 & 1.3):
   - `buildRetentionScenario` hardcoded string literals `'ORD-OLD-01'` and `'ORD-FRESH-01'` directly into the SQL statement.
   - When `buildRetentionScenario` is called for `storeA` followed by `storeB` in `createMultiStoreFixture(db)` (or called repeatedly in any shared database instance), the second call re-inserts `'ORD-OLD-01'` and fails with constraint violation.

3. **Remediation Strategy** (Supported by Observations 1.3 & 1.4):
   - Replacing hardcoded `'ORD-OLD-01'` and `'ORD-FRESH-01'` with dynamically generated codes:
     ```javascript
     const oldOrderCode = `ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
     const freshOrderCode = `ORD-FRESH-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
     ```
   - Prepending `fixture.storeId` ensures clear store-level attribution during debugging and test assertions.
   - Appending `crypto.randomUUID().slice(0, 8)` provides 32-bit random entropy, guaranteeing collision-free operation even across repeated calls on the same store.
   - Changing the SQL statements from embedded string literals to parameterized queries `VALUES (?, ?, ?, ...)` improves query safety and clarity.
   - Exposing `oldOrderCode` and `freshOrderCode` in the returned scenario dictionary enables downstream tests (like C07-3 order anonymization in M4/P08) to assert against order codes without auxiliary queries.

4. **Zero Negative Impact on Existing Suites** (Observation 1.4 & 1.5):
   - Existing tests C07-1, C07-2, and C07-4 inspect `expiredEventId`, `activeEventId`, `historicEventId`, and `historicSessionId`. None rely on exact keys or hardcoded order codes.
   - Therefore, the proposed change maintains 100% backwards compatibility while fixing the multi-tenant isolation failure.

---

## 3. Caveats

1. **Single-Store Unit Test Blindspot**: `tests/workforce-golden-cases.test.mjs` ran C07 tests inside isolated per-test database instances (`createDatabase()`), masking the global collision. A dedicated multi-store regression test (`C07-5`) should be added to prevent regression.
2. **Scenario Builders Slot Sharing**: As noted by `challenger_m0_1`, scenario builders (`buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, `buildHandoverScenario`) allocate shifts on the same date window (`2026-07-03T01:00:00.000Z`) for `employeeA`. They are intended to be executed on isolated fixture instances or with dedicated date offsets.

---

## 4. Conclusion

The root cause of the defect in `buildRetentionScenario` is conclusively identified as hardcoded `order_code` values (`ORD-OLD-01` and `ORD-FRESH-01`) colliding against the table-wide unique index `customer_orders_order_code_idx`.

The remediation plan has been fully formulated and documented in:
`d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_rem_1\fix_plan.md`

Worker `worker_m0_1` should apply the following modifications:
1. In `tests/fixtures/workforce-fixtures.mjs` (lines 533–544):
   - Generate `oldOrderCode = 'ORD-OLD-' + fixture.storeId + '-' + crypto.randomUUID().slice(0, 8)`
   - Generate `freshOrderCode = 'ORD-FRESH-' + fixture.storeId + '-' + crypto.randomUUID().slice(0, 8)`
   - Bind `oldOrderCode` and `freshOrderCode` via parameterized queries.
2. In `tests/fixtures/workforce-fixtures.mjs` (lines 560–567):
   - Add `oldOrderCode` and `freshOrderCode` to the returned scenario object.
3. In `tests/workforce-golden-cases.test.mjs`:
   - Add regression test `C07-5: Multi-store retention fixture isolation without order_code collision`.

---

## 5. Verification Method

To verify the defect fix:

1. **Reproduction Test Command** (must pass without errors):
   ```powershell
   node --experimental-strip-types -e "
   import { createDatabase } from './tests/helpers/database.mjs';
   import { createMultiStoreFixture, buildRetentionScenario } from './tests/fixtures/workforce-fixtures.mjs';
   const db = createDatabase();
   const { storeA, storeB } = createMultiStoreFixture(db);
   const sA = buildRetentionScenario(db, storeA);
   const sB = buildRetentionScenario(db, storeB);
   console.log('Store A Old Order Code:', sA.oldOrderCode);
   console.log('Store B Old Order Code:', sB.oldOrderCode);
   const count = db.sqlite.prepare('SELECT COUNT(*) as c FROM customer_orders').get().c;
   if (count === 4) {
     console.log('PASS: 4 customer orders seeded across isolated stores without collisions.');
   } else {
     throw new Error('Expected 4 orders, got ' + count);
   }
   "
   ```

2. **Automated Test Suite**:
   ```powershell
   node --experimental-strip-types --test tests/workforce-golden-cases.test.mjs
   npm.cmd test
   npm.cmd run typecheck
   npm.cmd run lint
   ```

3. **Files to Inspect**:
   - `tests/fixtures/workforce-fixtures.mjs` (lines 533–568)
   - `tests/workforce-golden-cases.test.mjs` (describe block C07)
