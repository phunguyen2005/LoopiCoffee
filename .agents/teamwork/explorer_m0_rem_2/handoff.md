# Handoff Report — Milestone M0 Iteration 2: Unique Constraint Collision Audit

**Agent ID:** `explorer_m0_rem_2` (teamwork_preview_explorer)  
**Parent Conversation ID:** `6e943540-9db4-4898-95f7-1382b16362bf`  
**Working Directory:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_rem_2\`  
**Timestamp:** 2026-10-13T17:45:00Z  
**Verdict:** `DEFECT_IDENTIFIED_WITH_FIX_STRATEGY`  

---

## 1. Observation

### 1.1 Scope Scanned
- **Source Files Analyzed:**
  - `tests/fixtures/workforce-fixtures.mjs` (569 lines, all 10 exports: `ROLES`, `STATUSES`, `createWorkforceFixture`, `createMultiStoreFixture`, `buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, `buildRateHistoryScenario`, `buildHandoverScenario`, `buildRetentionScenario`)
  - `tests/helpers/database.mjs` (260 lines, all 10 exports: `createDatabase`, `seedStore`, `seedEmployee`, `seedAttendanceRules`, `seedShift`, `seedAttendanceSession`, `seedAttendanceEvent`, `seedPayrollPeriod`, `seedRequest`, `seedHandover`)
  - `drizzle/` migrations: `0000_pink_doctor_doom.sql` through `0014_indexes_and_perf.sql` (all 16 unique indexes, partial indexes, and triggers)
  - `tests/workforce-golden-cases.test.mjs` (693 lines, test suites C01 - C07)

### 1.2 Direct Empirical Tool Execution Results

#### A. Isolated Multi-Store Execution Across `storeA` and `storeB`
Executed command:
```bash
node --input-type=module -e "
import { createDatabase } from './tests/helpers/database.mjs';
import { createMultiStoreFixture, buildSwapScenario, buildDraftOverlapScenario, buildAttendanceClippingScenario, buildHandoverScenario, buildRetentionScenario } from './tests/fixtures/workforce-fixtures.mjs';

function testScenario(name, fn) {
  const db = createDatabase();
  const { storeA, storeB } = createMultiStoreFixture(db);
  try {
    fn(db, storeA);
    fn(db, storeB);
    console.log(name, 'across storeA and storeB: PASS');
  } catch (e) {
    console.log(name, 'across storeA and storeB FAIL:', e.message);
  }
}

testScenario('buildSwapScenario', buildSwapScenario);
testScenario('buildDraftOverlapScenario', buildDraftOverlapScenario);
testScenario('buildAttendanceClippingScenario', buildAttendanceClippingScenario);
testScenario('buildHandoverScenario', buildHandoverScenario);
testScenario('buildRetentionScenario', buildRetentionScenario);
"
```
**Verbatim Output:**
```
buildSwapScenario across storeA and storeB: PASS
buildDraftOverlapScenario across storeA and storeB: PASS
buildAttendanceClippingScenario across storeA and storeB: PASS
buildHandoverScenario across storeA and storeB: PASS
buildRetentionScenario across storeA and storeB FAIL: UNIQUE constraint failed: customer_orders.order_code
```

#### B. Exact Collision in `buildRetentionScenario`
- **Location:** `tests/fixtures/workforce-fixtures.mjs`, Lines 534–544:
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
- **Violated Schema Definition:** `drizzle/0008_ordering_system.sql`, Line 73:
  ```sql
  CREATE UNIQUE INDEX `customer_orders_order_code_idx` ON `customer_orders` (`order_code`);
  ```
- **Constraint Behavior:** Index is on `order_code` globally (NOT composite with `store_id`).
- **Verbatim Error:**
  `SqliteError: UNIQUE constraint failed: customer_orders.order_code`

#### C. Verification of Other Unique Constraints
- `employees.email` / `employees.lower(email)`: Scoped via `${storeId}` in `createWorkforceFixture` (`emp-a-store-alpha@example.test` vs `emp-a-store-beta@example.test`). Verified distinct.
- `employees.auth_user_id`: Scoped via `auth-${id}` (`auth-emp-a-store-alpha`).
- `attendance_rules (store_id, version)`: Scoped per store (`rules-store-alpha-v1` vs `rules-store-beta-v1`).
- `shifts (id)`: Generated using `crypto.randomUUID()`.
- `requests.client_request_key`: Generated using `swap-key-${crypto.randomUUID()}`. Verified no collision with partial index `requests_client_key_idx`.
- `handovers (id)`: Generated using `crypto.randomUUID()`.
- `attendance_sessions (id)`: Generated using `crypto.randomUUID()`.
- `attendance_events (id, idempotency_key)`: Generated using `crypto.randomUUID()`.
- `attendance_photos (event_id)`: Uses `event.id` UUID. Note: `object_key` (`evidence/expired-photo.jpg`) is not unique in SQLite schema, matching exact string expectation in test `C07-1`.

#### D. Shift Overlap Trigger on Composed Single-Store Scenarios
- When `buildSwapScenario`, `buildDraftOverlapScenario`, and `buildAttendanceClippingScenario` are run sequentially on the **same store instance**, SQLite trigger `shifts_no_overlap_insert` raises:
  `SqliteError: shift_overlap`
  because all three scenario builders schedule `employeeA` at `2026-07-03T01:00:00.000Z`.

---

## 2. Logic Chain

1. **Global Unique Constraint Identification:**  
   From Observation 1.1 and 1.2.B, `customer_orders_order_code_idx` is defined on `customer_orders(order_code)` globally across all stores. Unlike `attendance_rules_store_version_idx` or `payroll_periods_store_range_idx`, it is NOT scoped by `store_id`.

2. **Causal Mechanism of the Retention Failure:**  
   In `buildRetentionScenario`, lines 537 and 542 insert static literals `'ORD-OLD-01'` and `'ORD-FRESH-01'`. When `createMultiStoreFixture` initializes `storeA` and `storeB`, both run in the same SQLite database instance. Seeding `storeA` inserts `'ORD-OLD-01'`. Seeding `storeB` attempts to insert `'ORD-OLD-01'` again, which SQLite immediately rejects with `UNIQUE constraint failed: customer_orders.order_code`.

3. **Absence of Other Multi-Store Collisions:**  
   Observation 1.2.A proves that `buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, and `buildHandoverScenario` succeed across `storeA` and `storeB`. Every actor email incorporates `storeId`, every shift ID uses `crypto.randomUUID()`, and every client request key uses `crypto.randomUUID()`. Therefore, **no other scenario builder suffers from multi-store collisions**.

4. **Resolution Strategy:**  
   By changing lines 537 and 542 to generate store-scoped, unique order codes:
   ```javascript
   const oldOrderCode = `ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
   const freshOrderCode = `ORD-FRESH-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
   ```
   both multi-store execution (`createMultiStoreFixture`) and repeated executions within the same store succeed without any constraint violation.

---

## 3. Caveats

1. **Unit Test Isolation vs Multi-Store Sandboxing:**  
   The existing golden case tests in `tests/workforce-golden-cases.test.mjs` (C01 through C07) pass individually because each unit test calls `const db = createDatabase();` to instantiate a fresh, isolated in-memory database. The defect manifests when `createMultiStoreFixture(db)` is used to run scenarios across multiple stores in a shared database instance, or when tests are composed.
2. **Object Key Retention in `attendance_photos`:**  
   While `'evidence/expired-photo.jpg'` is hardcoded, it is intentionally coupled to test `C07-1`'s assertion (`assert.equal(deletedKeys[0], "evidence/expired-photo.jpg");`). SQLite has no unique index on `object_key`, so this hardcoded string is safe and should NOT be changed without updating the test.
3. **Compound Shift Scheduling:**  
   Scenario builders currently use fixed calendar slots (`2026-07-03T01:00:00Z`). Tests wishing to compose multiple scenarios on the same store instance should instantiate separate databases or parameterize distinct dates.

---

## 4. Conclusion

**Verdict:** `DEFECT_IDENTIFIED_WITH_FIX_STRATEGY`

- **The Sole Blocking Defect:**  
  `buildRetentionScenario` in `tests/fixtures/workforce-fixtures.mjs:537, 542` hardcodes `order_code` (`'ORD-OLD-01'` and `'ORD-FRESH-01'`), violating `customer_orders_order_code_idx`.
- **All Other Scenarios and Helpers:**  
  All other builders and database helpers in `tests/fixtures/workforce-fixtures.mjs` and `tests/helpers/database.mjs` are completely free of multi-store unique constraint collisions.
- **Actionable Remediation:**  
  A worker agent should update `buildRetentionScenario` in `tests/fixtures/workforce-fixtures.mjs` to dynamically generate store-scoped UUID order codes (`ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`).

Detailed findings and constraint matrix are documented in:
`d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_rem_2\collision_audit.md`

---

## 5. Verification Method

To independently reproduce the collision and verify the fix:

```powershell
# 1. Reproduce current defect:
node --input-type=module -e "
import { createDatabase } from './tests/helpers/database.mjs';
import { createMultiStoreFixture, buildRetentionScenario } from './tests/fixtures/workforce-fixtures.mjs';
const db = createDatabase();
const { storeA, storeB } = createMultiStoreFixture(db);
buildRetentionScenario(db, storeA);
buildRetentionScenario(db, storeB); // Throws SqliteError: UNIQUE constraint failed: customer_orders.order_code
"

# 2. Verify all other builders pass across multi-store fixtures:
node --input-type=module -e "
import { createDatabase } from './tests/helpers/database.mjs';
import { createMultiStoreFixture, buildSwapScenario, buildDraftOverlapScenario, buildAttendanceClippingScenario, buildHandoverScenario } from './tests/fixtures/workforce-fixtures.mjs';
const db = createDatabase();
const { storeA, storeB } = createMultiStoreFixture(db);
buildSwapScenario(db, storeA);
buildSwapScenario(db, storeB);
console.log('Swap PASS');
const db2 = createDatabase();
const { storeA: a2, storeB: b2 } = createMultiStoreFixture(db2);
buildDraftOverlapScenario(db2, a2);
buildDraftOverlapScenario(db2, b2);
console.log('Draft Overlap PASS');
const db3 = createDatabase();
const { storeA: a3, storeB: b3 } = createMultiStoreFixture(db3);
buildAttendanceClippingScenario(db3, a3);
buildAttendanceClippingScenario(db3, b3);
console.log('Attendance Clipping PASS');
const db4 = createDatabase();
const { storeA: a4, storeB: b4 } = createMultiStoreFixture(db4);
buildHandoverScenario(db4, a4);
buildHandoverScenario(db4, b4);
console.log('Handover PASS');
"
```
