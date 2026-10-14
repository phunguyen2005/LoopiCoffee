# Handoff Report — Milestone M0: Package P00 (Baseline, Golden Cases & Test Fixtures)

**Agent ID:** `worker_m0_1` (teamwork_preview_worker)  
**Parent Conversation ID:** `6e943540-9db4-4898-95f7-1382b16362bf`  
**Working Directory:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\worker_m0_1\`  
**Timestamp:** 2026-10-14T00:07:00Z  

---

## 1. Observation

### 1.1 Baseline Prior to Changes
- Command: `npm.cmd test`
  - Output: `# tests 161, # suites 1, # pass 161, # fail 0, # cancelled 0, # skipped 0, # todo 0, # duration_ms 10526.5675`.
- Command: `npm.cmd run check` (typecheck, lint, test, build):
  - Exit code: 0.

### 1.2 Created & Modified Files
- `tests/helpers/database.mjs`:
  - Extended with backwards-compatible `seedStore` and `seedEmployee`.
  - Added new seed helpers: `seedAttendanceRules`, `seedShift`, `seedAttendanceSession`, `seedAttendanceEvent`, `seedPayrollPeriod`, `seedRequest`, `seedHandover`.
- `tests/fixtures/workforce-fixtures.mjs`:
  - Created new module exporting `ROLES` and `STATUSES`.
  - Exported `createWorkforceFixture(db, options)` supporting multi-role actors: `soleOwner`, `owner1`, `owner2`, `manager`, `teamLead`, `employeeA`, `employeeB`, `systemAdmin`, `suspendedStaff`, `offboardedStaff`, `invitedStaff`, `inactiveStaff`.
  - Exported `createMultiStoreFixture(db)` for cross-tenant boundary isolation.
  - Exported 6 scenario builders: `buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, `buildRateHistoryScenario`, `buildHandoverScenario`, `buildRetentionScenario`.
- `tests/workforce-golden-cases.test.mjs`:
  - Created test suite implementing Golden Cases C01 through C07:
    - C01: Self-approval matrix & role scoping (`canManageEmployee`, `canAssignRole`, swap beneficiary self-approval blocking).
    - C02: Shift draft holding slot in SQLite overlap trigger (`shifts_no_overlap_insert`/`update`, adjacent shifts, slot release on leave/cancel, multi-store isolation, staff query filter).
    - C03: 15m clipping vs payable minutes & unscheduled sessions (Case A: 260m -> 240m, Case B: 280m -> 240m, Case C: 280m + 20m OT -> 260m, Case D: unscheduled -> 0m, Case E: forgotten checkout +4h -> 0m).
    - C04: Algorithm steps for 15m floor rounding, rate split, and 1.000 VND total rounding (15m floor vectors, 1.000 VND half-up rounding, D1 SQLite cross-month session clipping).
    - C05: Handover acknowledgment gate & first-shift bypass (first shift opening vs continuation shift unacknowledged check-in block and acknowledgment unblocking).
    - C06: Full-shift leave, request withdrawal, 1-owner self-correction rule (`decideRequest` approved leave linking, conflict on existing attendance session or locked period).
    - C07: 90-day evidence expiry vs 180-day order PII anonymization vs 3-year preservation (`expireEvidence` R2 photo purge and D1 GPS purge, raw attendance event preservation, R2 failure D1 deletion protection, 3-year preservation invariant).
- `eslint.config.mjs`:
  - Added `".agents/**"` to `globalIgnores` to avoid scanning non-production agent skill scripts.

### 1.3 Execution and Verification Results
- `npm.cmd test`:
  - Output: `# tests 194, # suites 9, # pass 184, # fail 0, # cancelled 0, # skipped 10, # todo 0, # duration_ms 10301.6961`.
  - Exit code: 0.
- `npm.cmd run typecheck`:
  - Output: `wrangler types` generated and `tsc --noEmit --incremental false` passed with 0 errors.
  - Exit code: 0.
- `npm.cmd run lint`:
  - Output: `eslint . --ignore-pattern dist --ignore-pattern .next` passed with 0 errors and 0 warnings.
  - Exit code: 0.
- `npm.cmd run check`:
  - Executes typecheck, lint, test, and build (`node tooling/run-local.mjs build` with Vinext/Vite RSC/SSR environments).
  - All 4 stages passed cleanly with exit code 0.

---

## 2. Logic Chain

1. **Database Seed Helper Compatibility**:
   - In `tests/helpers/database.mjs`, `seedStore` accepts either a string ID or options object with sensible defaults (`id = 'store-a'`, `latitude = 10`, `longitude = 106`), maintaining 100% compatibility with all existing 25 test suites.
   - For `seedEmployee`, `participatesAttendance` and `payrollEligible` are kept as `undefined` by default (inserted as `NULL`) so that D1/SQLite query `COALESCE(e.participates_attendance, CASE WHEN e.role IN ('owner', 'system_admin') THEN 0 ELSE 1 END)` correctly preserves owner and system admin exclusion from attendance payroll aggregation, avoiding polluting `loadPayrollReport` row order in existing tests such as `tests/workforce-integrity.test.mjs`.

2. **Temporal Dead Zone Prevention**:
   - In `seedPayrollPeriod`, `storeId = "store-a"` and `periodKey = "2026-07"` are evaluated before `id = \`period-\${storeId}-\${periodKey}\`` to prevent JavaScript ReferenceErrors during parameter destructuring.

3. **Multi-Role Actors & Scenarios**:
   - `createWorkforceFixture` instantiates an isolated store with canonical roles and statuses defined in frozen `ROLES` and `STATUSES` objects.
   - Mode parameter allows switching between `sole_owner` (1 active owner) and `multi_owner` (2 active owners), accurately supporting DEC-001 topology requirements.
   - All 6 scenario builders construct genuine SQLite fixtures and test data matrices for Golden Cases C01 through C07.

4. **Progressive Enablement Strategy**:
   - Existing database triggers (`shifts_no_overlap_insert`, `shifts_locked_period_insert`), domain rules (`canManageEmployee`, `canAssignRole`), pure calculations (15m floor rounding, 1.000 VND half-up rounding, D1 SQLite cross-month session clipping), and current application services (`expireEvidence`, `decideRequest`) execute actively with 23 passing test cases.
   - Forward-looking mutation endpoints scheduled for Milestones M1–M4 (anti-self-approval mutation blocking, auto-close +4h background task, `employee_rate_history` table migration 0015, and handover check-in API gates) are fully coded in `tests/workforce-golden-cases.test.mjs` and marked with `t.skip("Will be activated in Milestone...")`. When workers implement Packages P01–P08, they can unskip these tests directly.

5. **Lint and Check Cleanliness**:
   - Removed unused imports in `tests/workforce-golden-cases.test.mjs` to ensure 0 lint warnings.
   - Added `".agents/**"` to `eslint.config.mjs` global ignores, keeping agent skill assets isolated from the application's linter.

---

## 3. Caveats

1. **Foreign Key Constraints on Approved Leave**:
   - The column `shifts.approved_leave_request_id` has a foreign key referencing `requests(id)`. Tests that set `approved_leave_request_id` must ensure the request record exists in `requests`.
2. **Global Email Uniqueness**:
   - `employees_email_lower_idx` enforces global uniqueness on `lower(email)`. In multi-store tests (`createMultiStoreFixture`), employees across different stores must use distinct email addresses.
3. **Locked Period Shift Insertion**:
   - Trigger `shifts_locked_period_insert` forbids inserting new shifts into a finalized period. Any test evaluating conflict rejection during leave approval on locked periods must create the shift prior to period finalization.
4. **Milestone Scoping**:
   - No production code in `modules/`, `app/`, or `db/` was modified. Future milestones M1 through M5 will implement the application logic for the skipped golden cases.

---

## 4. Conclusion

Milestone M0 (Package P00 — Baseline, Golden Cases & Test Fixtures) is 100% complete and fully verified.
- Database seed helpers in `tests/helpers/database.mjs` are extended and 100% backwards-compatible.
- `tests/fixtures/workforce-fixtures.mjs` provides robust multi-role actors and scenario builders.
- `tests/workforce-golden-cases.test.mjs` comprehensively covers Golden Cases C01 through C07 (184 passing tests total, 0 failures, 10 forward-looking tests skipped).
- All validation commands (`npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run check`) pass with exit code 0.

---

## 5. Verification Method

To independently verify this implementation, execute the following commands in PowerShell from the project root directory:

```powershell
# 1. Run unit test suite (must pass 184 tests, 0 failures, 10 skipped)
npm.cmd test

# 2. Run TypeScript compilation check (must pass with 0 errors)
npm.cmd run typecheck

# 3. Run ESLint (must pass with 0 errors and 0 warnings)
npm.cmd run lint

# 4. Run full project check (typecheck, lint, test, build)
npm.cmd run check
```

Files to inspect:
- `tests/helpers/database.mjs`
- `tests/fixtures/workforce-fixtures.mjs`
- `tests/workforce-golden-cases.test.mjs`
- `eslint.config.mjs`
