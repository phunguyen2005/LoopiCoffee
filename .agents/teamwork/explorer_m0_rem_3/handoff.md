# Handoff Report — Multi-Store Regression Test Recommendation

- **Agent ID:** `explorer_m0_rem_3` (teamwork_preview_explorer)
- **Parent Conversation ID:** `6e943540-9db4-4898-95f7-1382b16362bf`
- **Working Directory:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_rem_3\`
- **Timestamp:** 2026-10-13T17:48:00Z
- **Milestone:** Milestone M0 Iteration 2 (Remediation)
- **Status:** Complete (Hard Handoff)

---

## 1. Observation

### 1.1 Baseline Test Suite State
- Executed `npm.cmd test`:
  - Result: `# tests 194, # suites 9, # pass 184, # fail 0, # cancelled 0, # skipped 10, # todo 0, # duration_ms 16610.3966`.
  - Exit code: 0.
- Executed `tests/workforce-golden-cases.test.mjs` via standard runner:
  - 23 tests passed, 10 skipped (planned for M1–M4), 0 failed.
- In `tests/workforce-golden-cases.test.mjs`, `createMultiStoreFixture` was only invoked once in `C02-5` (lines 227–255), which only created two isolated draft shifts manually and never invoked any scenario builders.

### 1.2 Reproduction of Defect Identified by `challenger_m0_1`
- Executed:
  ```bash
  node -e "const { createDatabase } = require('./tests/helpers/database.mjs'); const { createMultiStoreFixture, buildRetentionScenario } = require('./tests/fixtures/workforce-fixtures.mjs'); const db = createDatabase(); const { storeA, storeB } = createMultiStoreFixture(db); buildRetentionScenario(db, storeA); buildRetentionScenario(db, storeB);"
  ```
- Result:
  ```
  file:///D:/College/Practice/loopicafe-management-system/tests/fixtures/workforce-fixtures.mjs:537
    `).run(oldOrderId, fixture.storeId);
       ^

  Error: UNIQUE constraint failed: customer_orders.order_code
      at buildRetentionScenario (file:///D:/College/Practice/loopicafe-management-system/tests/fixtures/workforce-fixtures.mjs:537:6)
      code: 'ERR_SQLITE_ERROR',
      errcode: 2067,
      errstr: 'constraint failed'
  ```

### 1.3 Schema and Code Observations
1. In `drizzle/0008_ordering_system.sql:73`:
   ```sql
   CREATE UNIQUE INDEX `customer_orders_order_code_idx` ON `customer_orders` (`order_code`);
   ```
   The index enforces table-wide uniqueness on `order_code` across all stores.
2. In `tests/fixtures/workforce-fixtures.mjs:533-544`:
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
3. In `tests/fixtures/workforce-fixtures.mjs:240-245`:
   ```javascript
   export function createMultiStoreFixture(db) {
     return {
       storeA: createWorkforceFixture(db, { storeId: "store-alpha", mode: "sole_owner" }),
       storeB: createWorkforceFixture(db, { storeId: "store-beta", mode: "multi_owner" }),
     };
   }
   ```
   Both `storeA` and `storeB` live within the same `db` instance.

### 1.4 Scenario Builder Execution Matrix Across Stores
Tested all 6 scenario builders with `createMultiStoreFixture(db)`:
- `buildSwapScenario`: Passed across `storeA` and `storeB`.
- `buildDraftOverlapScenario`: Passed across `storeA` and `storeB`.
- `buildAttendanceClippingScenario`: Passed across `storeA` and `storeB`.
- `buildHandoverScenario`: Passed across `storeA` and `storeB`.
- `buildRateHistoryScenario`: Passed (pure mathematical calculation, no DB).
- `buildRetentionScenario`: Failed on `storeB` with `SqliteError: UNIQUE constraint failed: customer_orders.order_code`.

### 1.5 Intra-Store Shift Date Contention Observation
- Tested calling multiple shift-based scenario builders (`buildSwapScenario` and `buildAttendanceClippingScenario`) on the **same store** (`storeA`) within the same database:
  - Result: Failed with `SqliteError: shift_overlap` from trigger `shifts_no_overlap_insert` (`drizzle/0011_workforce_integrity.sql:61-69`).
  - Reason: Both builders seed a shift for `employeeA` at `2026-07-03T01:00:00.000Z..05:00:00.000Z`.
  - Conversely, between distinct stores (`storeA` and `storeB`), shift overlap triggers are strictly scoped by `s.store_id = NEW.store_id`, preventing cross-store interference.

---

## 2. Logic Chain

1. **Defect Causality (Obs 1.2, 1.3):**
   - Because `customer_orders.order_code` has a table-wide unique index (`customer_orders_order_code_idx`), any two records in `customer_orders` having `'ORD-OLD-01'` or `'ORD-FRESH-01'` cause an immediate unrecoverable SQLite abort.
   - `buildRetentionScenario` hardcodes these exact two string literals.
   - When a test establishes a multi-tenant environment via `createMultiStoreFixture(db)` and invokes `buildRetentionScenario` for both stores, `storeA` succeeds and `storeB` crashes with `UNIQUE constraint failed: customer_orders.order_code`.

2. **Test Gap in `tests/workforce-golden-cases.test.mjs` (Obs 1.1):**
   - Existing retention golden cases (`C07-1`, `C07-2`, `C07-4`) only instantiate single-store fixtures (`createWorkforceFixture(db)`).
   - `createMultiStoreFixture` is only invoked in `C02-5`, which does not call `buildRetentionScenario` or any other scenario builder.
   - Consequently, regression detection for cross-store collisions in fixtures was zero.

3. **Multi-Store Test Architecture Design (Obs 1.4, 1.5):**
   - A multi-store test case that exercises `createMultiStoreFixture` and invokes all scenario builders must:
     a) Verify concurrent execution across `storeA` and `storeB` for each scenario builder (`buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, `buildHandoverScenario`, `buildRetentionScenario`, `buildRateHistoryScenario`).
     b) Assert that returned entities have disjoint UUIDs and store-scoped identifiers.
     c) Assert database-level counts (e.g. 4 total orders, exactly 2 for `storeA` and 2 for `storeB`, with 4 distinct `order_code` values).
     d) Avoid intra-store shift date overlap by isolating shift timelines or running per-builder multi-store fixtures.

4. **Actionable Remediation Requirement:**
   - In `tests/fixtures/workforce-fixtures.mjs:537, 542`, replace hardcoded strings with store-scoped unique codes:
     `const oldOrderCode = 'ORD-OLD-' + fixture.storeId + '-' + crypto.randomUUID().slice(0, 8);`
     `const freshOrderCode = 'ORD-FRESH-' + fixture.storeId + '-' + crypto.randomUUID().slice(0, 8);`
   - Implement the test cases `C07-5` and `MS-1` in `tests/workforce-golden-cases.test.mjs`.

---

## 3. Caveats

1. **Read-Only Explorer Constraint:** In accordance with explorer role constraints, no source code files (`tests/fixtures/workforce-fixtures.mjs` or `tests/workforce-golden-cases.test.mjs`) have been directly modified. The test plan and recommended code snippets are documented in `regression_test_plan.md` for `worker_m0_1` to implement.
2. **Shift Timeline Segregation:** If future milestones require all 5 DB scenarios to execute inside the *same single store instance* in one `:memory:` database, `workforce-fixtures.mjs` will need staggered shift dates (e.g., Day 3 for swap, Day 4 for draft, Day 5 for clipping, Day 6 for handover). For cross-tenant multi-store verification, executing each builder across `storeA` and `storeB` in parallel or isolated contexts completely satisfies the multi-store requirement.

---

## 4. Conclusion

1. **Root Cause Confirmed:** The failure reported by `challenger_m0_1` is 100% reproducible and caused by hardcoded `order_code` literals in `buildRetentionScenario` colliding with SQLite index `customer_orders_order_code_idx`.
2. **Artifacts Delivered:**
   - `regression_test_plan.md`: Comprehensive test plan containing exact drop-in test cases (`C07-5` and `MS-1`), assertion matrices, and the specific code patch for `worker_m0_1`.
   - `handoff.md`: This 5-component self-contained report.
3. **Next Action for Team:** Task `worker_m0_1` to apply the patch to `tests/fixtures/workforce-fixtures.mjs` and insert test cases `C07-5` / `MS-1` into `tests/workforce-golden-cases.test.mjs`.

---

## 5. Verification Method

### 5.1 Defect Demonstration (Fails before fix)
```bash
node -e "
const { createDatabase } = require('./tests/helpers/database.mjs');
const { createMultiStoreFixture, buildRetentionScenario } = require('./tests/fixtures/workforce-fixtures.mjs');
const db = createDatabase();
const { storeA, storeB } = createMultiStoreFixture(db);
buildRetentionScenario(db, storeA);
buildRetentionScenario(db, storeB);
"
```
*Expected Failure:* `SqliteError: UNIQUE constraint failed: customer_orders.order_code`.

### 5.2 Verification After Fix Applied
```bash
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```
*Expected Success:* Exit code 0, 185+ passing tests, 0 errors, 0 warnings.
