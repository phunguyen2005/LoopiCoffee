# Handoff Report — Milestone M0: Package P00 Empirical Challenge

**Agent ID:** `challenger_m0_1` (teamwork_preview_challenger)  
**Parent Conversation ID:** `6e943540-9db4-4898-95f7-1382b16362bf`  
**Working Directory:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\challenger_m0_1\`  
**Timestamp:** 2026-10-13T17:18:20Z  
**Verdict:** `REQUEST_CHANGES`

---

## 1. Observation

### 1.1 Standard Suite Verification
- Command: `npm.cmd test`
  - Output: `# tests 194, # suites 9, # pass 184, # fail 0, # cancelled 0, # skipped 10, # todo 0, # duration_ms 8292.5719`.
  - Exit code: 0.
- Command: `npm.cmd run typecheck`
  - Output: `wrangler types worker-configuration.d.ts` generated and `tsc --noEmit --incremental false` completed with 0 errors.
  - Exit code: 0.
- Command: `npm.cmd run lint`
  - Output: `eslint . --ignore-pattern dist --ignore-pattern .next` completed with 0 errors and 0 warnings.
  - Exit code: 0.
- Command: `node --experimental-strip-types --test tests/workforce-golden-cases.test.mjs`
  - Output: `# tests 33, # suites 8, # pass 23, # fail 0, # cancelled 0, # skipped 10, # todo 0, # duration_ms 2316.9095`.
  - Exit code: 0.

### 1.2 Empirical Stress-Test Observations

#### A. Active Owner Topologies (`createWorkforceFixture`)
- In `mode: 'sole_owner'`:
  - `fixture.actors.soleOwner` is active, role `owner`.
  - `fixture.actors.owner1 === fixture.actors.soleOwner`.
  - `fixture.actors.owner2 === null`.
  - SQL verification: `SELECT COUNT(*) as c FROM employees WHERE store_id = 'store-sole' AND role = 'owner' AND status = 'active'` evaluated to `1`.
- In `mode: 'multi_owner'`:
  - `fixture.actors.soleOwner === null`.
  - `fixture.actors.owner1` and `fixture.actors.owner2` are distinct active owners.
  - SQL verification: `SELECT COUNT(*) as c FROM employees WHERE store_id = 'store-multi' AND role = 'owner' AND status = 'active'` evaluated to `2`.

#### B. Multi-Store Isolation (`createMultiStoreFixture`)
- `storeA.storeId = "store-alpha"`, `storeB.storeId = "store-beta"`.
- All employee IDs and emails across `storeA` and `storeB` are strictly disjoint (e.g., `emp-a-store-alpha@example.test` vs `emp-a-store-beta@example.test`).
- Store query isolation: `SELECT id FROM employees WHERE store_id = ?` returns disjoint sets.
- Shift overlap trigger isolation: Concurrent shifts at identical time windows in `storeA` and `storeB` do not clash because SQLite trigger `shifts_no_overlap_insert` properly scopes by `s.store_id = NEW.store_id`.

#### C. Extreme & Invalid Inputs Handling
- Missing stores: Foreign key constraint enforcement (`PRAGMA foreign_keys = ON`) throws `FOREIGN KEY constraint failed` when attempting to seed records (`seedEmployee`, `seedShift`, `seedAttendanceRules`, `seedAttendanceSession`, `seedRequest`, `seedHandover`) referencing non-existent stores.
- Duplicate email: Case-insensitive unique index (`employees_email_lower_idx`) throws `UNIQUE constraint failed: employees.lower(email)` on duplicate emails.
- Negative hourly rates: `seedEmployee` allows inserting negative rate at SQLite level, but `loadPayrollReport` safely clamps calculations via `Math.max(0, ...)` (yielding `totalSalary: 0`), preventing negative pay generation.
- Empty database: `createDatabase({ migrations: false })` throws `no such table: stores`. Migrated database with 0 stores/employees returns `{ rows: [], periodStatus: 'reviewing' }` without throwing.
- Role/status access guards: `canAssignRole` in `modules/people/domain/access.ts` rejects arbitrary role strings (`"superman"`, `""`, `null`) and quarantined roles (`"system_admin"`).

#### D. Confirmed Defect: Multi-Store Order Code Collision in `buildRetentionScenario`
- File: `tests/fixtures/workforce-fixtures.mjs`, Lines 534–543:
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
- Database schema: `drizzle/0008_ordering_system.sql`, Line 73:
  ```sql
  CREATE UNIQUE INDEX `customer_orders_order_code_idx` ON `customer_orders` (`order_code`);
  ```
- Command executed:
  ```bash
  node --experimental-strip-types -e "
  import { createDatabase } from './tests/helpers/database.mjs';
  import { createMultiStoreFixture, buildRetentionScenario } from './tests/fixtures/workforce-fixtures.mjs';
  const db = createDatabase();
  const { storeA, storeB } = createMultiStoreFixture(db);
  buildRetentionScenario(db, storeA);
  buildRetentionScenario(db, storeB);
  "
  ```
- Verbatim error:
  ```
  SqliteError: UNIQUE constraint failed: customer_orders.order_code
      at buildRetentionScenario (file:///D:/College/Practice/loopicafe-management-system/tests/fixtures/workforce-fixtures.mjs:537:6)
  ```

#### E. Confirmed Limitation: Date/Employee Slot Contention Across Scenario Builders
- Scenario builders `buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, and `buildHandoverScenario` all allocate shifts for `employeeA` during the same date window (`2026-07-03T01:00:00.000Z`).
- Composing multiple builders on a single fixture/database instance trips `shift_overlap` SQLite trigger.

---

## 2. Logic Chain

1. **Owner Topology Soundness**:
   - Observations 1.2.A prove that `createWorkforceFixture` accurately differentiates between single-owner and multi-owner stores. In `sole_owner` mode, exactly 1 active owner exists in the database. In `multi_owner` mode, exactly 2 active owners exist with distinct identifiers and emails. This meets the architectural requirement for DEC-001 topology modeling.

2. **Database Seed Integrity**:
   - Observations 1.2.B and 1.2.C confirm that database seed helpers in `tests/helpers/database.mjs` honor SQLite foreign key constraints, enforce case-insensitive email uniqueness, and remain backwards-compatible with all existing suites.

3. **Defect in Multi-Store Retention Scenarios**:
   - `createMultiStoreFixture(db)` is intended to establish two isolated stores in a single database instance (`storeA` and `storeB`).
   - However, `drizzle/0008_ordering_system.sql` creates a global unique index `customer_orders_order_code_idx` on `order_code` (not scoped per `store_id`).
   - In `tests/fixtures/workforce-fixtures.mjs:537, 542`, `buildRetentionScenario` hardcodes `'ORD-OLD-01'` and `'ORD-FRESH-01'`.
   - When `buildRetentionScenario` is invoked for `storeA` followed by `storeB` (or called twice in any shared database), the second invocation throws `UNIQUE constraint failed: customer_orders.order_code`.
   - As a result, any downstream multi-tenant test (e.g., during Milestone M4 Package P08 or M5 integration) attempting to verify retention across stores using `createMultiStoreFixture` will crash.

4. **Actionable Remediation**:
   - In `tests/fixtures/workforce-fixtures.mjs`, `order_code` must be generated with store-specific and unique suffixes:
     ```javascript
     const oldOrderCode = `ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
     const freshOrderCode = `ORD-FRESH-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
     ```
   - This eliminates the global collision while maintaining valid `order_code` formatting.

---

## 3. Caveats

1. In the current test suite `tests/workforce-golden-cases.test.mjs`, each test case instantiates its own isolated `:memory:` database instance (`const db = createDatabase();`), which is why test `C07-1` passed in isolation. The bug manifests when tests share a database instance or utilize `createMultiStoreFixture(db)`.
2. Scenario builders (`buildSwapScenario`, `buildDraftOverlapScenario`, etc.) are designed as isolated templates. If future tests intend to compose multiple scenarios within the same store, separate date offsets or distinct employees should be passed.

---

## 4. Conclusion

**Verdict:** `REQUEST_CHANGES`

The M0 baseline, golden cases, and test fixtures are predominantly high quality (184 unit tests pass, typecheck and lint pass cleanly). However, an empirical defect exists in `tests/fixtures/workforce-fixtures.mjs`:
- `buildRetentionScenario` hardcodes `order_code` (`ORD-OLD-01` and `ORD-FRESH-01`), which breaks global uniqueness when used with `createMultiStoreFixture` or across multiple scenario setups in the same database.
- Worker `worker_m0_1` must patch `tests/fixtures/workforce-fixtures.mjs` lines 537 and 542 to generate unique order codes before M0 is approved for milestone closure.

---

## 5. Verification Method

To independently reproduce the defect:

```powershell
node --experimental-strip-types -e "
import { createDatabase } from './tests/helpers/database.mjs';
import { createMultiStoreFixture, buildRetentionScenario } from './tests/fixtures/workforce-fixtures.mjs';
const db = createDatabase();
const { storeA, storeB } = createMultiStoreFixture(db);
buildRetentionScenario(db, storeA);
buildRetentionScenario(db, storeB); // Throws: SqliteError: UNIQUE constraint failed: customer_orders.order_code
"
```

Files to inspect:
- `tests/fixtures/workforce-fixtures.mjs` (lines 534–544)
- `drizzle/0008_ordering_system.sql` (line 73)
