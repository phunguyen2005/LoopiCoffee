# Fix Plan: Remediation of `order_code` Collision in `buildRetentionScenario`

**Author:** `explorer_m0_rem_1` (Teamwork Explorer)  
**Target File:** `tests/fixtures/workforce-fixtures.mjs`  
**Related Test File:** `tests/workforce-golden-cases.test.mjs`  
**Milestone:** M0 Iteration 2 (Remediation)  
**Date:** 2026-10-13  

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Defect
During empirical stress-testing conducted by `challenger_m0_1`, invoking `buildRetentionScenario` across multiple stores within a single shared database instance (via `createMultiStoreFixture`) crashed with a fatal SQLite error:

```
SqliteError: UNIQUE constraint failed: customer_orders.order_code
    at buildRetentionScenario (file:///D:/College/Practice/loopicafe-management-system/tests/fixtures/workforce-fixtures.mjs:537:6)
```

### 1.2 Root Cause
1. **Global Unique Index on `order_code`**:
   - `drizzle/0008_ordering_system.sql` (Line 73):
     ```sql
     CREATE UNIQUE INDEX `customer_orders_order_code_idx` ON `customer_orders` (`order_code`);
     ```
   - `db/schema.ts` (Line 377):
     ```typescript
     uniqueIndex("customer_orders_order_code_idx").on(table.orderCode),
     ```
   The index is table-wide and globally unique across all stores. It is NOT scoped by `(store_id, order_code)`.

2. **Hardcoded String Literals in Fixture Builder**:
   - `tests/fixtures/workforce-fixtures.mjs` (Lines 534–544):
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
   While `id` was generated dynamically using `crypto.randomUUID()`, `order_code` was hardcoded to `'ORD-OLD-01'` and `'ORD-FRESH-01'`.
   When `buildRetentionScenario(db, storeA)` runs, it inserts `'ORD-OLD-01'`. When `buildRetentionScenario(db, storeB)` immediately follows on the same database, it attempts to insert `'ORD-OLD-01'` again, triggering the UNIQUE constraint violation.

---

## 2. Fix Strategy

### 2.1 Proposed Code Modifications in `tests/fixtures/workforce-fixtures.mjs`

1. **Dynamic Store-Scoped and Entropy-Backed `order_code` Generation**:
   Define `oldOrderCode` and `freshOrderCode` using `fixture.storeId` and an 8-character UUID slice:
   ```javascript
   const oldOrderCode = `ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
   const freshOrderCode = `ORD-FRESH-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
   ```
   - **Store Scoping**: Prepending `fixture.storeId` makes each code immediately recognizable in database queries and test traces (e.g., `ORD-OLD-store-alpha-3b7f1a9c` vs `ORD-OLD-store-beta-8e4d2a1b`).
   - **Entropy & Collision Prevention**: The 8-character UUID suffix ($2^{32}$ combinations) guarantees that even if `buildRetentionScenario` is called multiple times within the same store or in loop-based scenario generations, no collision can occur.

2. **Parameterized Prepared Statements**:
   Replace SQL string literals with parameter placeholders `?` to keep queries clean, safe, and maintainable:
   ```javascript
   db.sqlite.prepare(`
     INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
     VALUES (?, ?, ?, 'Nguyễn Văn A', '0901234567', 'Giao gấp', 150000, 2, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
   `).run(oldOrderId, oldOrderCode, fixture.storeId);
   ```

3. **Return Order Codes in Scenario Object**:
   Expose `oldOrderCode` and `freshOrderCode` in the return dictionary of `buildRetentionScenario`:
   ```javascript
   return {
     expiredEventId: expiredEvent.id,
     activeEventId: activeEvent.id,
     oldOrderId,
     oldOrderCode,
     freshOrderId,
     freshOrderCode,
     historicEventId: historicEvent.id,
     historicSessionId: historicSession.id,
   };
   ```
   This allows downstream test assertions (e.g., C07-3 order anonymization tests in Milestone M4 / Package P08) to directly access and assert against the generated codes without needing auxiliary queries.

---

## 3. Exact Code Replacement for Implementer (`worker_m0_1`)

### Target File: `tests/fixtures/workforce-fixtures.mjs`

#### Chunk 1: Lines 533–544
```javascript
<<<< CURRENT CODE (Lines 533-544)
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
==== PROPOSED REPLACEMENT
  const oldOrderId = `order-old-${crypto.randomUUID()}`;
  const oldOrderCode = `ORD-OLD-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
  db.sqlite.prepare(`
    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
    VALUES (?, ?, ?, 'Nguyễn Văn A', '0901234567', 'Giao gấp', 150000, 2, 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run(oldOrderId, oldOrderCode, fixture.storeId);

  const freshOrderId = `order-fresh-${crypto.randomUUID()}`;
  const freshOrderCode = `ORD-FRESH-${fixture.storeId}-${crypto.randomUUID().slice(0, 8)}`;
  db.sqlite.prepare(`
    INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note, total_amount, item_count, status, created_at, updated_at)
    VALUES (?, ?, ?, 'Trần Thị B', '0912345678', 'Ít đá', 65000, 1, 'completed', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')
  `).run(freshOrderId, freshOrderCode, fixture.storeId);
>>>>
```

#### Chunk 2: Lines 560–567
```javascript
<<<< CURRENT CODE (Lines 560-567)
  return {
    expiredEventId: expiredEvent.id,
    activeEventId: activeEvent.id,
    oldOrderId,
    freshOrderId,
    historicEventId: historicEvent.id,
    historicSessionId: historicSession.id,
  };
==== PROPOSED REPLACEMENT
  return {
    expiredEventId: expiredEvent.id,
    activeEventId: activeEvent.id,
    oldOrderId,
    oldOrderCode,
    freshOrderId,
    freshOrderCode,
    historicEventId: historicEvent.id,
    historicSessionId: historicSession.id,
  };
>>>>
```

---

## 4. Recommended Test Suite Enhancement

To permanently lock this fix into the automated CI test suite, recommend adding a dedicated regression test `C07-5` in `tests/workforce-golden-cases.test.mjs` under the `C07: Retention Lifecycles & 3-Year Preservation Invariant` describe block:

```javascript
    test("C07-5: Multi-store retention fixture isolation without order_code collision", (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      const { storeA, storeB } = createMultiStoreFixture(db);
      const scenarioA = buildRetentionScenario(db, storeA);
      const scenarioB = buildRetentionScenario(db, storeB);

      assert.ok(scenarioA.oldOrderId);
      assert.ok(scenarioB.oldOrderId);
      assert.notEqual(scenarioA.oldOrderCode, scenarioB.oldOrderCode);
      assert.notEqual(scenarioA.freshOrderCode, scenarioB.freshOrderCode);

      const ordersCount = db.sqlite.prepare("SELECT COUNT(*) as count FROM customer_orders").get();
      assert.equal(ordersCount.count, 4);
    });
```

---

## 5. Verification Protocol

The implementer and reviewer can independently verify the fix using the following steps:

### 5.1 Direct Multi-Store Execution Test
Execute via PowerShell:
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
  console.log('PASS: 4 customer orders successfully seeded across isolated stores without collisions.');
} else {
  throw new Error('Order count mismatch: expected 4, got ' + count);
}
"
```

### 5.2 Automated Verification Commands
```powershell
# 1. Run golden cases suite
node --experimental-strip-types --test tests/workforce-golden-cases.test.mjs

# 2. Run full test suite
npm.cmd test

# 3. Type check
npm.cmd run typecheck

# 4. Lint check
npm.cmd run lint
```
