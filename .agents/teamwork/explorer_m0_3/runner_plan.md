# Milestone M0 (P00) — Test Runner Integration, Zero-Regression Verification & Harness Architecture

**Author**: `explorer_m0_3` (teamwork_preview_explorer)  
**Date**: 2026-10-13  
**Working Directory**: `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_3\`  
**Scope**: Node Test Runner (`node --experimental-strip-types --test`), Baseline Preservation (161 Existing Tests), Fixture Placement (`tests/fixtures/workforce-fixtures.mjs`), Golden Cases Integration (`tests/workforce-golden-cases.test.mjs`), Reviewer & Auditor Verification Gate.

---

## 1. Executive Summary

Milestone M0 establishes the baseline test foundation and golden cases (C01–C07) for the LoopiCafe Management System without breaking or altering any of the 161 existing tests across 25 test files.

This plan details:
1. **Node test runner discovery mechanics**: How `node --experimental-strip-types --test tests/*.test.mjs` discovers files on Windows and Linux, why `tests/fixtures/` is excluded from test execution, and how `tests/workforce-golden-cases.test.mjs` is automatically picked up.
2. **Zero-regression harness architecture**: Concrete isolation rules, database sandboxing (`new DatabaseSync(":memory:")`), namespace protection, and global-state safeguards ensuring zero side-effects across the test suite.
3. **Reviewer & Auditor verification protocol**: Precise commands, exact invariant criteria ($161 \rightarrow 161 + N$), diff audit checklists, and CI gate requirements.

---

## 2. Node Test Runner Discovery Mechanics

### 2.1 Invocation and Configuration
In `package.json`, line 12:
```json
"test": "node --experimental-strip-types --test tests/*.test.mjs"
```
The project runtime uses Node.js `v22.19.0` with native ESM (`"type": "module"`).

### 2.2 Shell Glob Expansion vs Native Node Glob Engine
Different execution environments handle the argument `tests/*.test.mjs` differently:

| Environment | Invocation Command | Wildcard Expansion Behavior | Target Arguments Received by `node.exe` |
|---|---|---|---|
| **Windows PowerShell** (`pwsh` / `powershell.exe`) | `node --experimental-strip-types --test tests/*.test.mjs` | PowerShell does **not** expand globs for native executables. Empirically verified: `process.argv` receives literal string `'tests/*.test.mjs'`. | `[ "tests/*.test.mjs" ]` |
| **Windows CMD / npm script** (`cmd.exe`) | `npm.cmd test` | `cmd.exe` passes literal string `tests/*.test.mjs` without globbing. | `[ "tests/*.test.mjs" ]` |
| **Linux / POSIX shell** (CI / bash / zsh) | `npm test` | Shell expands `tests/*.test.mjs` into a whitespace-separated list of individual file paths before calling Node. | `[ "tests/adversarial-m4-isolation.test.mjs", "tests/adversarial-p0-m1-m2.test.mjs", ... ]` |

**Node Internal Handling on Windows**:
When Node's test runner CLI receives an argument containing glob characters (`*`, `?`, `[`), Node invokes its internal path-matching engine relative to `process.cwd()`.
- The glob `tests/*.test.mjs` is a **single-directory-level pattern** (`*` does not traverse `/` or `\` separators).
- Files in `tests/` matching `*.test.mjs` are matched.
- Subdirectories inside `tests/` (such as `tests/fixtures/`, `tests/helpers/`, `tests/e2e/`) are **strictly excluded**.

### 2.3 Default Zero-Argument Discovery (`node --test`)
If an operator runs `node --experimental-strip-types --test` with no positional path arguments:
Node recursively walks the current working directory (excluding `node_modules` and hidden directories).
By default, Node's test runner matches files conforming to:
- `**/*.test.{js,cjs,mjs}`
- `**/*-test.{js,cjs,mjs}`
- `**/*_test.{js,cjs,mjs}`
- `**/test-*.{js,cjs,mjs}`
- `**/test.{js,cjs,mjs}`
- `**/test/**/*.{js,cjs,mjs}`

**Discovery Safety of `tests/fixtures/workforce-fixtures.mjs`**:
1. It is named `workforce-fixtures.mjs`. It does not match `.test.`, `-test.`, `_test.`, `test-`, or `test.`.
2. It resides in `tests/fixtures/`. Node's directory pattern matches `**/test/**` (directory named `test`, singular), NOT `tests/` (plural) or `fixtures/`.
3. Therefore, under BOTH `npm.cmd test` (explicit glob) and `node --test` (default zero-arg discovery), `tests/fixtures/workforce-fixtures.mjs` is **NEVER** executed as a test file.

**Automatic Discovery of `tests/workforce-golden-cases.test.mjs`**:
1. It resides directly in `tests/`.
2. It ends with `.test.mjs`.
3. It immediately matches `tests/*.test.mjs` on both Windows and Linux without requiring any modification to `package.json` scripts!

### 2.4 TypeScript Stripping (`--experimental-strip-types`)
Node's `--experimental-strip-types` flag strips type annotations at import time, enabling tests written in `.mjs` to directly import `.ts` application and domain modules:
```javascript
import { loadPayrollReport } from "../modules/payroll/application/load-report.ts";
import { correctAttendance } from "../modules/attendance/application/correct-attendance.ts";
```
This avoids a pre-compilation build step for unit tests while maintaining full TypeScript validation via `npm.cmd run typecheck`.

---

## 3. Existing Test Suite Baseline (161 Tests across 25 Files)

An empirical audit of `tests/` reveals 25 existing test files containing exactly 161 test cases, all passing:

| # | Test File | Test Cases | Scope / Functionality |
|---|---|---|---|
| 1 | `tests/adversarial-m4-isolation.test.mjs` | 3 | Store isolation, cross-tenant leak prevention |
| 2 | `tests/adversarial-p0-m1-m2.test.mjs` | 6 | API transpile routes, ordering limits, evidence |
| 3 | `tests/adversarial-p1-remediation.test.mjs` | 9 | Role escalation prevention, session checks |
| 4 | `tests/adversarial-p2-p3-remediation.test.mjs` | 5 | Shift overlap, adjustment edge cases |
| 5 | `tests/adversarial-seed-users.test.mjs` | 6 | Endpoint origin security, loopback guards |
| 6 | `tests/architecture-behavior.test.mjs` | 16 | D1 schema integrity, last-owner demotion protection, FKs |
| 7 | `tests/architecture-boundaries.test.mjs` | 8 | Layer boundaries, client/server import boundaries, migration journal |
| 8 | `tests/attendance-payload.test.mjs` | 4 | Attendance payload limits, GPS validation, retry logic |
| 9 | `tests/business-logic-verification.test.mjs` | 5 | Business rules verification, payroll basics |
| 10 | `tests/challenger-stress-suite.test.mjs` | 5 | High concurrency, stress edge cases |
| 11 | `tests/concurrency-empirical-stress.test.mjs` | 8 | Transactional races, concurrent write conflicts |
| 12 | `tests/d1-contract.test.mjs` | 1 | Miniflare D1 batch transaction rollback contract |
| 13 | `tests/daily-checklists.test.mjs` | 2 | Checklist execution basics |
| 14 | `tests/drizzle-migrations-preflight.test.mjs` | 4 | Migration chain (0000..0014, 15 files) parsing & triggers |
| 15 | `tests/evidence.test.mjs` | 7 | JPEG parsing, evidence expiration logic |
| 16 | `tests/identity-security.test.mjs` | 9 | Identity cache SLA, token verification, role permissions |
| 17 | `tests/incidents-handovers.test.mjs` | 4 | Incident reporting, basic handover workflows |
| 18 | `tests/local-safety.test.mjs` | 4 | Loopback URL safety, request body size limits |
| 19 | `tests/operational-ui-permissions.test.mjs` | 7 | UI role permission contracts, route responses |
| 20 | `tests/ordering-system.test.mjs` | 18 | QR ordering, item preparation, rate limits |
| 21 | `tests/platform-compat.test.mjs` | 4 | Windows/Linux x64 binary compat, package-lock safety |
| 22 | `tests/rendered-html.test.mjs` | 6 | Landing page assets, video element, Vietnamese text |
| 23 | `tests/security-remediation-full.test.mjs` | 5 | Audit event store isolation, CSV formula sanitization |
| 24 | `tests/seed-users-protection.test.mjs` | 2 | Seed users origin & loopback protection |
| 25 | `tests/workforce-integrity.test.mjs` | 18 | Workforce integrity, month-crossing shifts, corrections |
| **Total** | **25 files** | **161** | **All 161 passing (0 failed, 0 skipped, 0 cancelled)** |

---

## 4. Zero-Regression Test Harness Architecture

To guarantee that introducing `tests/fixtures/workforce-fixtures.mjs` and `tests/workforce-golden-cases.test.mjs` will **never** break any of the 161 existing tests, the harness architecture must enforce the following 6 isolation invariants:

### Invariant 1: In-Memory Database Isolation
- Every test in `workforce-golden-cases.test.mjs` must instantiate its own independent in-memory SQLite database via:
  ```javascript
  const db = createDatabase();
  t.after(() => db.close());
  ```
- Must never use shared SQLite files on disk (`test.db`).
- Must rely on fresh migrations applied in-memory from `drizzle/*.sql`.

### Invariant 2: Identifier & Namespace Isolation
Existing tests frequently use fixed identifiers:
- Stores: `store-a`, `store-b`, `store-test`, `store-other`
- Employees: `owner-a`, `owner-b`, `staff`, `manager`, `admin`, `external`
- Sessions/Events: `session`, `event`, `session-a`

The new workforce fixtures in `tests/fixtures/workforce-fixtures.mjs` must use a distinct, prefixed namespace:
- Stores: `wf-store-main`, `wf-store-second`
- Employees:
  - Sole Owner: `wf-sole-owner` (`wf-sole-owner@loopicafe.test`)
  - Multi-Owner: `wf-owner-alpha`, `wf-owner-beta`
  - Manager: `wf-mgr-1`
  - Team Lead: `wf-lead-1`
  - Employee A: `wf-emp-alice`
  - Employee B: `wf-emp-bob`
  - System Admin: `wf-sysadmin`
  - Lifecycle states: `wf-emp-suspended`, `wf-emp-offboarded`, `wf-emp-invited`
- Shifts/Sessions: `wf-shift-*`, `wf-session-*`

This guarantees zero collision even if fixture helpers are imported across different files in future milestones.

### Invariant 3: Pure Factory Functions Without Side-Effects
`tests/fixtures/workforce-fixtures.mjs` must:
- Export pure functions and static schemas/data objects.
- Accept the active database instance as an explicit parameter (`seedWorkforceStore(db, options)`).
- Perform no top-level module initialization, no process event listeners, and no file writes.
- Never mutate global variables or `globalThis`.

### Invariant 4: Global Environment Sandbox
If any golden case tests need to check environment-dependent behaviors:
- Use strict `try ... finally` blocks to restore `process.env`.
- Avoid altering `process.env.TZ`. Use ISO-8601 strings with explicit UTC timezones (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- If `loadModule` from `tests/helpers/load-module.mjs` is used, always invoke `dispose()` inside `t.after()` to clean up `globalThis` mock registries.

### Invariant 5: Architecture Boundaries Immunity
`tests/architecture-boundaries.test.mjs` validates:
1. `modules/` domain/contracts do not import outer layers.
2. `components/` and `app/` client files do not import server implementations.
3. `drizzle/meta/_journal.json` matches `drizzle/*.sql`.
4. Schema column definitions match Drizzle tables.
5. `db/runtime.ts` does not create schema.

Because `architecture-boundaries.test.mjs` does **not** inspect the `tests/` directory:
- Adding `tests/fixtures/workforce-fixtures.mjs` and `tests/workforce-golden-cases.test.mjs` does **not** trigger any boundary assertion failures.
- No modifications to `drizzle/*.sql` or `meta/_journal.json` occur in M0.

### Invariant 6: Strict Lint & TypeScript Conformance
- `tests/fixtures/workforce-fixtures.mjs` and `tests/workforce-golden-cases.test.mjs` must adhere strictly to ESLint rules (`eslint .`):
  - No unused imports or variables.
  - Standard ESM syntax (`import`, `export`).
  - Strict assertions (`import assert from "node:assert/strict"`).
- Any imported `.ts` files must maintain clean TypeScript type declarations so that `npm.cmd run typecheck` (`tsc --noEmit`) passes with exit code 0.

---

## 5. Test Suite Architecture for Milestone M0

```
d:\College\Practice\loopicafe-management-system\tests\
├── fixtures\
│   └── workforce-fixtures.mjs       <-- NEW: Multi-role actors & workforce scenario builders
├── helpers\
│   ├── database.mjs                 <-- UNCHANGED: In-memory SQLite & migration runner
│   └── load-module.mjs              <-- UNCHANGED: Dynamic module loader & mock isolation
├── workforce-golden-cases.test.mjs  <-- NEW: Executable test suite for Golden Cases C01-C07
└── (25 existing *.test.mjs files)   <-- UNTOUCHED: Exactly 161 tests preserved
```

### 5.1 Structure of `tests/fixtures/workforce-fixtures.mjs`
Exports:
1. `WORKFORCE_ROLES`: Constant object of canonical role strings (`owner`, `manager`, `team_lead`, `employee`, `system_admin`).
2. `WORKFORCE_STATUSES`: Canonical status strings (`active`, `suspended`, `offboarded`, `invited`).
3. `seedWorkforceStore(db, { id, name })`: Seeds an isolated store.
4. `seedWorkforceActors(db, storeId)`: Seeds the standard multi-role suite:
   - `soleOwner`: store with 1 active owner.
   - `multiOwner1`, `multiOwner2`: store with 2 active owners.
   - `manager`: store manager.
   - `teamLead`: operational shift leader.
   - `employeeA`, `employeeB`: active baristas/staff.
   - `suspendedEmployee`, `offboardedEmployee`, `invitedEmployee`.
   - `systemAdmin`: technical account without business store scope.
5. `createGoldenShift(db, options)`: Helper to seed shift records for C01-C07 scenarios.
6. `createGoldenAttendance(db, options)`: Helper to seed attendance events and sessions.

### 5.2 Structure of `tests/workforce-golden-cases.test.mjs`
Contains executable tests for points C01–C07:
- **C01: Self-approval matrix**:
  - `actor != requester` and `actor != beneficiary`.
  - `team_lead` cannot approve leave, cannot edit attendance, cannot approve swap for managers/owners.
- **C02: Shift draft holding slot**:
  - `status = 'draft'` reserves time in SQLite overlap trigger (`shifts_no_overlap_insert`), but is hidden from employee personal schedule.
- **C03: 15m clipping vs payable minutes & unscheduled sessions**:
  - 15m early/late boundary clipped to scheduled shift without overtime approval.
  - Approved overtime added to payable minutes.
  - Unscheduled session does not extrapolate `ends_at` (payable hours = 0 until approved).
- **C04: Algorithm steps for payroll**:
  - Step 1: Clip & overtime.
  - Step 2: Rate split & month split.
  - Step 3: Floor 15 minutes (`Math.floor(m / 15) * 15`).
  - Step 4: Segment pay calculation.
  - Step 5: Subtotal sum.
  - Step 6: Round 1.000 VND arithmetic total (`Math.round(total / 1000) * 1000`).
- **C05: Handover acknowledgment gate**:
  - First shift of day has no predecessor (`no_previous_handover_required = true`).
  - Second shift blocked from check-in until handover acknowledged.
  - Manager bypass allows check-in with required audit log.
- **C06: Full-shift leave, request withdrawal & 1-owner self-correction**:
  - Leave granted for entire shift only.
  - Pending request can be withdrawn by creator; finalized/rejected request cannot.
  - 1-owner self-correction allowed only when active owner count == 1, with reason and high-priority audit.
- **C07: Retention timelines**:
  - 90-day evidence expiry (photo R2 + GPS D1 purged, attendance event preserved).
  - 180-day order PII anonymization (name, phone, notes cleared; items & revenue preserved).
  - 3-year preservation floor for audit logs, payroll snapshots, and attendance history.

---

## 6. Verification Commands & Acceptance Criteria

### 6.1 Verification Commands Matrix

| Scope | Platform | Exact Command | Purpose |
|---|---|---|---|
| **Baseline Test Suite** | Windows (PowerShell/CMD) | `npm.cmd test` | Verifies all 25 existing + new test files. Expected: $161 + N$ pass, 0 fail. |
| **Baseline Test Suite** | Linux / CI | `npm test` | POSIX parity check. |
| **Targeted Golden Suite** | Windows / Linux | `node --experimental-strip-types --test tests/workforce-golden-cases.test.mjs` | Runs only the new M0 golden cases suite in isolation (~1s). |
| **Baseline Regression Spot-Check** | Windows / Linux | `node --experimental-strip-types --test tests/workforce-integrity.test.mjs` | Verifies existing workforce test suite passes 18/18 with zero changes. |
| **Type Integrity Check** | Windows / Linux | `npm.cmd run typecheck` | Compiles Cloudflare Worker types and runs `tsc --noEmit`. Must exit 0. |
| **Lint & Syntax Validation** | Windows / Linux | `npm.cmd run lint` | Runs ESLint across all `.mjs`, `.ts`, `.tsx` files. Must exit 0. |
| **Full Continuous Integration Gate** | Windows (PowerShell/CMD) | `npm.cmd run check` | Executes `typecheck` + `lint` + `test` + `build`. Full verification pass. |

### 6.2 Reviewer & Auditor Acceptance Criteria Checklist

Before accepting Milestone M0 completion, Reviewers and Auditors must verify:

- [ ] **1. Test Invariant Preservation ($161 \rightarrow 161 + N$)**:
  - Running `npm.cmd test` passes $\ge 168$ tests (161 baseline + $\ge 7$ golden cases).
  - Exactly 0 tests fail, 0 cancelled, 0 skipped, 0 todo.
- [ ] **2. Zero Modification of Existing Tests**:
  - `git diff --name-only tests/*.test.mjs` returns **empty**.
  - All 25 original test files remain byte-for-byte identical.
- [ ] **3. Non-Execution of Fixture Files**:
  - In the test runner TAP output, `tests/fixtures/workforce-fixtures.mjs` does **not** appear as a test suite or subtest.
- [ ] **4. Database Sandboxing**:
  - Every test in `tests/workforce-golden-cases.test.mjs` uses `new DatabaseSync(":memory:")` via `createDatabase()` and registers `t.after(() => db.close())`.
  - No temporary database files (`.db`, `.sqlite`) are written to the filesystem.
- [ ] **5. Strict Namespace Isolation**:
  - All IDs in `workforce-fixtures.mjs` use the `wf-*` namespace, preventing collision with legacy `store-a` / `owner-a` / `staff` fixtures.
- [ ] **6. Clean Static Checks**:
  - `npm.cmd run typecheck` exits with code 0.
  - `npm.cmd run lint` exits with code 0.
- [ ] **7. Workspace Discipline**:
  - Only test harness files are placed in `tests/` and `tests/fixtures/`.
  - No code or test files are placed in `.agents/teamwork/`.
  - No changes are made to production application code in Milestone M0.

---

## 7. Conclusion & Recommended Next Steps

The harness strategy described above guarantees seamless test runner integration, 100% zero-regression preservation of all 161 existing tests, and an unassailable verification gate for Reviewers and Auditors.

**Next steps for Implementer**:
1. Implement `tests/fixtures/workforce-fixtures.mjs` according to `explorer_m0_1` design.
2. Implement `tests/workforce-golden-cases.test.mjs` according to `explorer_m0_2` golden cases design.
3. Run `npm.cmd test`, `npm.cmd run typecheck`, and `npm.cmd run lint` to confirm all criteria pass cleanly.
