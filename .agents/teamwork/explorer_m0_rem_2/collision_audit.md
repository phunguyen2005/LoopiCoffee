# Comprehensive Unique Constraint Collision Audit

**Document Path:** `tests/fixtures/workforce-fixtures.mjs` & `tests/helpers/database.mjs`  
**Auditor Agent:** `explorer_m0_rem_2` (teamwork_preview_explorer)  
**Parent Conversation ID:** `6e943540-9db4-4898-95f7-1382b16362bf`  
**Date:** 2026-10-13  
**Status:** COMPLETE — READ-ONLY INVESTIGATION  

---

## 1. Executive Summary

This audit evaluates all scenario builders and seed helpers in `tests/fixtures/workforce-fixtures.mjs` and `tests/helpers/database.mjs` against the full set of database constraints (Primary Keys, Foreign Keys, Unique Indexes, Partial Unique Indexes, and Database Triggers) defined in `drizzle/` migrations (`0000` through `0014`).

### Core Findings
1. **Confirmed Defect (Critical / Blocking):**  
   In `tests/fixtures/workforce-fixtures.mjs:537, 542`, `buildRetentionScenario` hardcodes `order_code` literals (`'ORD-OLD-01'` and `'ORD-FRESH-01'`). Because `customer_orders_order_code_idx` (`drizzle/0008_ordering_system.sql:73`) enforces a **global unique constraint** on `customer_orders(order_code)` (independent of `store_id`), invoking `buildRetentionScenario` across `storeA` and `storeB` in `createMultiStoreFixture` immediately throws:
   ```
   SqliteError: UNIQUE constraint failed: customer_orders.order_code
   ```
   Similarly, invoking `buildRetentionScenario` twice within the same store instance fails with the identical error.

2. **Clean Multi-Store Isolation in Other Builders:**  
   Empirical testing verified that `buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, and `buildHandoverScenario` pass without error when executed across `storeA` and `storeB` in `createMultiStoreFixture`. All employee emails, employee IDs, auth IDs, shift IDs, request IDs, handover IDs, and `client_request_key` values are either store-scoped or generated via `crypto.randomUUID()`.

3. **Single-Store Shift Slot Contention (Architectural Limitation):**  
   `buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, and `buildHandoverScenario` all allocate shifts for `employeeA` during the same calendar day window (`2026-07-03T00:00:00Z` to `05:00:00Z` / `01:00:00Z` to `05:00:00Z`). Consequently, executing multiple scenario builders sequentially on the **same store instance** triggers the SQLite trigger `shifts_no_overlap_insert`, aborting with:
   ```
   SqliteError: shift_overlap
   ```
   This is an expected SQLite trigger guardrail, but prevents multi-scenario composition within a single store unless separate dates or distinct employees are parameterized.

4. **Static Default Values in Low-Level Database Helpers:**  
   In `tests/helpers/database.mjs`, seed helpers such as `seedStore`, `seedEmployee`, `seedAttendanceRules`, and `seedPayrollPeriod` use static default IDs (e.g., `id = "owner-a"`, `email = "owner-a@example.test"`, `storeId = "store-a"`). While acceptable for single-call unit tests, calling these helpers multiple times without overriding the default parameters produces immediate PK and unique index collisions.

---

## 2. Complete Database Unique Constraint & Index Matrix

Below is the verified inventory of all unique constraints, partial indexes, and unique triggers active in the SQLite / D1 database schema:

| Table | Constraint / Index Name | Columns / Expression | Scope | Condition / Filter | Collision Risk in Helpers/Fixtures |
|---|---|---|---|---|---|
| `customer_orders` | `customer_orders_order_code_idx` | `order_code` | **GLOBAL** | None | **HIGH (DEFECT)**: Hardcoded in `buildRetentionScenario` |
| `customer_orders` | `customer_orders_store_receipt_idx` | `(store_id, receipt_token_hash)` | Store-scoped | None | None (NULLs permitted) |
| `customer_orders` | `customer_orders_store_submission_idx` | `(store_id, submission_key)` | Store-scoped | None | None (NULLs permitted) |
| `employees` | `employees_email_idx` | `email` | **GLOBAL** | None | Low in fixtures (store-scoped); High if calling `seedEmployee()` repeatedly with default `"owner-a"` |
| `employees` | `employees_email_lower_idx` | `lower(email)` | **GLOBAL** | None | Same as above |
| `attendance_sessions` | `active_attendance_session_employee_idx` | `employee_email` | **GLOBAL** | `WHERE closed_at IS NULL` | Medium if open sessions are created for same email |
| `attendance_events` | `attendance_idempotency_idx` | `idempotency_key` | **GLOBAL** | None | None (helpers default to `event-${crypto.randomUUID()}`) |
| `attendance_events` | `attendance_event_session_action_idx` | `(session_id, action)` | Session-scoped | None | Medium if duplicate action seeded for same session |
| `attendance_events` | `attendance_events_capture_idx` | `capture_session_id` | **GLOBAL** | `WHERE capture_session_id IS NOT NULL` | None (helpers default to `null`) |
| `attendance_exceptions` | `attendance_exceptions_event_idx` | `event_id` | Event-scoped | None | None (1:1 with event) |
| `attendance_rules` | `attendance_rules_store_version_idx` | `(store_id, version)` | Store-scoped | None | None across stores; collides if same store & version re-seeded |
| `employee_consents` | `employee_consents_email_version_idx` | `(employee_email, notice_version)` | Email-scoped | None | None |
| `requests` | `requests_client_key_idx` | `(employee_email, client_request_key)` | Email-scoped | `WHERE client_request_key IS NOT NULL` | None (`buildSwapScenario` generates UUID client keys) |
| `payroll_periods` | `payroll_periods_store_range_idx` | `(store_id, period_start, period_end)` | Store-scoped | None | None across stores; collides if same store & period range re-seeded |
| `payroll_entries` | `payroll_entries_period_employee_idx` | `(payroll_period_id, employee_email)` | Period-scoped | None | None |
| `store_ordering_settings`| `store_ordering_settings_store_id_idx` | `store_id` | Store-scoped | None | None across stores |
| `order_rate_limits` | PK | `bucket_key` | **GLOBAL** | None | None |
| `checklist_executions` | PK | `(item_id, business_date)` | Item-scoped | None | None |

---

## 3. Systematic Scan of `tests/fixtures/workforce-fixtures.mjs`

### 3.1 `createWorkforceFixture(db, options)`
- **Line Reference:** Lines 39–234
- **Store ID:** Defaults to `storeId = "store-alpha"`.
- **Actor Identifiers & Emails:**
  - `soleOwner`: `id: owner-sole-${storeId}`, `email: owner-sole-${storeId}@example.test`, `authUserId: auth-owner-sole-${storeId}`
  - `owner1`: `id: owner-1-${storeId}`, `email: owner-1-${storeId}@example.test`
  - `owner2`: `id: owner-2-${storeId}`, `email: owner-2-${storeId}@example.test`
  - `manager`: `id: mgr-${storeId}`, `email: mgr-${storeId}@example.test`
  - `teamLead`: `id: lead-${storeId}`, `email: lead-${storeId}@example.test`
  - `employeeA`: `id: emp-a-${storeId}`, `email: emp-a-${storeId}@example.test`
  - `employeeB`: `id: emp-b-${storeId}`, `email: emp-b-${storeId}@example.test`
  - `systemAdmin`: `id: admin-sys-${storeId}`, `email: admin-sys-${storeId}@example.test`
  - `suspendedStaff`: `id: emp-suspended-${storeId}`
  - `offboardedStaff`: `id: emp-offboarded-${storeId}`
  - `invitedStaff`: `id: emp-invited-${storeId}`
  - `inactiveStaff`: `id: emp-inactive-${storeId}`
- **Attendance Rules:** `id: rules-${storeId}-v1`, `storeId: ${storeId}`, `version: 1`.
- **Collision Assessment:**
  - **Across Multi-Store Fixtures:** Perfectly isolated. Because every ID, email, auth ID, and rule ID contains `${storeId}`, Store A (`store-alpha`) and Store B (`store-beta`) have mutually disjoint values.
  - **Re-executing on Same Store:** If `createWorkforceFixture` is called twice with the same `storeId`, it will fail on `stores.id` PK and `employees.email` unique index. This is correct and expected behavior for fixture setup.

### 3.2 `createMultiStoreFixture(db)`
- **Line Reference:** Lines 240–245
- **Implementation:**
  ```javascript
  export function createMultiStoreFixture(db) {
    return {
      storeA: createWorkforceFixture(db, { storeId: "store-alpha", mode: "sole_owner" }),
      storeB: createWorkforceFixture(db, { storeId: "store-beta", mode: "multi_owner" }),
    };
  }
  ```
- **Collision Assessment:** Completely disjoint store IDs (`store-alpha` vs `store-beta`). No primary key or unique index collisions occur during initial setup.

### 3.3 `buildSwapScenario(db, fixture)`
- **Line Reference:** Lines 250–296
- **Database Records Seeded:**
  - `shiftA`: `id: shift-swap-a-${crypto.randomUUID()}`
  - `shiftB`: `id: shift-swap-b-${crypto.randomUUID()}`
  - `request`: `id: req-swap-${crypto.randomUUID()}`, `clientRequestKey: swap-key-${crypto.randomUUID()}`
- **Collision Assessment:**
  - **Multi-Store Isolation:** **PASS**. Shift IDs, request IDs, and `clientRequestKey` all use random UUIDs. The `requests_client_key_idx` index on `(employee_email, client_request_key)` does not collide.
  - **Single-Store Repeated Call:** **COLLISION ON TRIGGER**. Calling `buildSwapScenario` twice for the same store attempts to insert a second shift for `employeeA` at `2026-07-03T01:00:00Z` to `05:00:00Z`, triggering `shifts_no_overlap_insert`.

### 3.4 `buildDraftOverlapScenario(db, fixture)`
- **Line Reference:** Lines 301–341
- **Database Records Seeded:**
  - `draftShift`: `id: shift-draft-base-${crypto.randomUUID()}`
  - Note: `overlappingDraft`, `overlappingPublished`, `adjacentShift` are pure JavaScript test vectors returned in the scenario object and are **not** inserted into SQLite by the builder.
- **Collision Assessment:**
  - **Multi-Store Isolation:** **PASS**. Uses random UUID.
  - **Single-Store Repeated Call:** **COLLISION ON TRIGGER** (`shift_overlap`).

### 3.5 `buildAttendanceClippingScenario(db, fixture)`
- **Line Reference:** Lines 346–401
- **Database Records Seeded:**
  - `shift`: `id: shift-clip-${crypto.randomUUID()}`
  - Note: `caseA`, `caseB`, `caseC`, `caseD`, `caseE` are test vectors, not inserted into SQLite.
- **Collision Assessment:**
  - **Multi-Store Isolation:** **PASS**. Uses random UUID.
  - **Single-Store Repeated Call:** **COLLISION ON TRIGGER** (`shift_overlap`).

### 3.6 `buildRateHistoryScenario()`
- **Line Reference:** Lines 406–435
- **Database Records Seeded:** None (Pure memory calculation vectors).
- **Collision Assessment:** **PASS**. Zero risk.

### 3.7 `buildHandoverScenario(db, fixture)`
- **Line Reference:** Lines 440–477
- **Database Records Seeded:**
  - `morningShift`: `id: shift-ho-morning-${crypto.randomUUID()}` (00:00 - 05:00)
  - `afternoonShift`: `id: shift-ho-afternoon-${crypto.randomUUID()}` (05:00 - 10:00)
  - `handover`: `id: ho-test-${crypto.randomUUID()}`
- **Collision Assessment:**
  - **Multi-Store Isolation:** **PASS**. All IDs generated with random UUIDs.
  - **Single-Store Repeated Call:** **COLLISION ON TRIGGER** (`shift_overlap`).

### 3.8 `buildRetentionScenario(db, fixture)`
- **Line Reference:** Lines 482–568
- **Database Records Seeded:**
  - `expiredSession`: `id: sess-exp-${crypto.randomUUID()}`, `closedAt: 2026-04-01T09:00:00.000Z`
  - `expiredEvent`: `id: ev-exp-${crypto.randomUUID()}`, `sessionId: expiredSession.id`
  - `attendance_photos` (expired): `event_id: expiredEvent.id`, `object_key: evidence/expired-photo.jpg`
  - `attendance_locations` (expired): `event_id: expiredEvent.id`
  - `activeSession`: `id: sess-act-${crypto.randomUUID()}`, `closedAt: 2026-07-01T09:00:00.000Z`
  - `activeEvent`: `id: ev-act-${crypto.randomUUID()}`, `sessionId: activeSession.id`
  - `attendance_photos` (active): `event_id: activeEvent.id`, `object_key: evidence/active-photo.jpg`
  - `attendance_locations` (active): `event_id: activeEvent.id`
  - `customer_orders` (old): `id: order-old-${crypto.randomUUID()}`, **`order_code: ORD-OLD-01`**
  - `customer_orders` (fresh): `id: order-fresh-${crypto.randomUUID()}`, **`order_code: ORD-FRESH-01`**
  - `historicSession`: `id: sess-hist-${crypto.randomUUID()}`, `closedAt: 2024-07-01T09:00:00.000Z`
  - `historicEvent`: `id: ev-hist-${crypto.randomUUID()}`, `sessionId: historicSession.id`
- **Collision Assessment:**
  - **`customer_orders.order_code`:** **FATAL DEFECT**.
    Hardcoded `'ORD-OLD-01'` and `'ORD-FRESH-01'` collide with `customer_orders_order_code_idx` on any subsequent invocation (cross-store or repeated).
  - **`attendance_photos.object_key`:**
    `'evidence/expired-photo.jpg'` and `'evidence/active-photo.jpg'` are hardcoded. In SQLite, the primary key is `event_id`, and there is no unique index on `object_key`, so SQLite does not throw. Moreover, test `C07-1` in `tests/workforce-golden-cases.test.mjs:626` explicitly asserts `assert.equal(deletedKeys[0], "evidence/expired-photo.jpg");`. Therefore, keeping this key consistent with the test expectation is required.
  - **`attendance_sessions`:**
    All three sessions have non-null `closedAt`, so the partial index `active_attendance_session_employee_idx` is never violated.
  - **`attendance_events`:**
    Each event belongs to a distinct session ID, so `attendance_event_session_action_idx` on `(session_id, action)` is never violated.

---

## 4. Systematic Scan of `tests/helpers/database.mjs`

| Helper Function | Default Values | Unique Constraints Checked | Potential Collision Point | Severity |
|---|---|---|---|---|
| `createDatabase` | `:memory:` SQLite | Pragma foreign_keys = ON, Drizzle 0000–0014 | Isolated per instance | None |
| `seedStore` | `id: "store-a"` | PK `stores.id` | If called twice without `id` parameter | Low (unit test scope) |
| `seedEmployee` | `id: "owner-a"`, `email: "owner-a@example.test"` | PK `employees.id`, `employees_email_idx`, `employees_email_lower_idx` | If called twice without distinct `id` parameter | Low (unit test scope) |
| `seedAttendanceRules` | `id: rules-${storeId}-v${version}`, `version: 1` | PK `id`, `attendance_rules_store_version_idx` | If called twice for same `storeId` with same `version` | Low |
| `seedShift` | `id: shift-${crypto.randomUUID()}` | PK `shifts.id`, Triggers: `shifts_no_overlap_insert`, `shifts_locked_period_insert` | Random UUID prevents PK collisions; trigger fires if overlapping dates inserted for same employee | Expected trigger behavior |
| `seedAttendanceSession` | `id: session-${crypto.randomUUID()}`, `closedAt: 2026-07-03T09:00:00Z` | PK `id`, `active_attendance_session_employee_idx` | Default session is closed. If caller passes `closedAt: null` twice for same employee, throws UNIQUE violation | Expected partial index behavior |
| `seedAttendanceEvent` | `id: event-${crypto.randomUUID()}`, `idempotencyKey = id` | PK `id`, `attendance_idempotency_idx`, `attendance_event_session_action_idx`, `attendance_events_capture_idx` | If called twice with same `sessionId` and same `action`, throws UNIQUE violation | Expected composite unique index behavior |
| `seedPayrollPeriod` | `id: period-${storeId}-${periodKey}`, `periodKey: "2026-07"` | PK `id`, `payroll_periods_store_range_idx` | If called twice for same store and same period range | Low |
| `seedRequest` | `id: req-${crypto.randomUUID()}`, `clientRequestKey: null` | PK `id`, `requests_client_key_idx` | Random UUID; default clientRequestKey is null | None |
| `seedHandover` | `id: ho-${crypto.randomUUID()}` | PK `id` | Random UUID | None |

---

## 5. Empirical Verification Matrix

Empirical test runs were executed against an in-memory SQLite database (`DatabaseSync(":memory:")`) with all Drizzle migrations applied:

| Test Scenario | Executed Code | Result | Error / Note |
|---|---|---|---|
| **Multi-Store Swap** | `buildSwapScenario(db, storeA)`<br>`buildSwapScenario(db, storeB)` | **PASS** | Shift IDs and request keys are disjoint |
| **Multi-Store Draft Overlap** | `buildDraftOverlapScenario(db, storeA)`<br>`buildDraftOverlapScenario(db, storeB)` | **PASS** | Shift IDs are disjoint |
| **Multi-Store Attendance Clipping** | `buildAttendanceClippingScenario(db, storeA)`<br>`buildAttendanceClippingScenario(db, storeB)` | **PASS** | Shift IDs are disjoint |
| **Multi-Store Handover** | `buildHandoverScenario(db, storeA)`<br>`buildHandoverScenario(db, storeB)` | **PASS** | Handover and shift IDs are disjoint |
| **Multi-Store Retention (Current)** | `buildRetentionScenario(db, storeA)`<br>`buildRetentionScenario(db, storeB)` | **FAIL** | `SqliteError: UNIQUE constraint failed: customer_orders.order_code` |
| **Multi-Store Retention (Patched)** | Patched `buildRetentionScenario` with dynamic `order_code` | **PASS** | Both stores seeded orders successfully |
| **Single-Store Repeated Swap** | `buildSwapScenario(db, storeA)`<br>`buildSwapScenario(db, storeA)` | **TRIGGER FAIL** | `SqliteError: shift_overlap` (Contention at 01:00-05:00) |
| **Single-Store Scenario Composition** | `buildSwapScenario(db, storeA)`<br>`buildDraftOverlapScenario(db, storeA)` | **TRIGGER FAIL** | `SqliteError: shift_overlap` (Contention at 01:00-05:00) |
| **Duplicate Active Session** | Two `seedAttendanceSession` with `closedAt: null` for same email | **FAIL** | `SqliteError: UNIQUE constraint failed: attendance_sessions.employee_email` |
| **Duplicate Event Action** | Two `seedAttendanceEvent` with same `sessionId` and `action: "check_in"` | **FAIL** | `SqliteError: UNIQUE constraint failed: attendance_events.session_id, attendance_events.action` |

---

## 6. Fix Recommendations

### 6.1 Critical Fix for `tests/fixtures/workforce-fixtures.mjs` (Line 534–544)
Replace hardcoded `'ORD-OLD-01'` and `'ORD-FRESH-01'` with store-scoped and unique codes, and expose them in the return object:

#### Proposed Code Diff:
```javascript
<<<<
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
====
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

And in the return statement (lines 560–568):
```javascript
<<<<
  return {
    expiredEventId: expiredEvent.id,
    activeEventId: activeEvent.id,
    oldOrderId,
    freshOrderId,
    historicEventId: historicEvent.id,
    historicSessionId: historicSession.id,
  };
====
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

### 6.2 Optional Enhancement: Scenario Date Offset / Parameterization
To allow composability of multiple scenario builders within a single store instance without triggering `shifts_no_overlap_insert`, scenario builders can accept an optional `options` parameter with a default `date`:
```javascript
export function buildSwapScenario(db, fixture, { date = "2026-07-03" } = {}) { ... }
export function buildDraftOverlapScenario(db, fixture, { date = "2026-07-04" } = {}) { ... }
export function buildAttendanceClippingScenario(db, fixture, { date = "2026-07-05" } = {}) { ... }
export function buildHandoverScenario(db, fixture, { date = "2026-07-06" } = {}) { ... }
```
This is non-breaking for existing callers and enables compound testing pipelines.

---

## 7. Conclusion

Except for `buildRetentionScenario` (`order_code`), all scenario builders and multi-store fixtures are completely free of unique constraint collisions across tenant boundaries. Implementing the dynamic `order_code` pattern resolves the sole blocking defect and restores complete multi-store fixture robustness.
