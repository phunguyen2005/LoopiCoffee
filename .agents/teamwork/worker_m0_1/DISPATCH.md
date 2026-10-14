## 2026-10-13T16:46:26Z

You are worker_m0_1, a teamwork_preview_worker.
Your working directory is d:\College\Practice\loopicafe-management-system\.agents\teamwork\worker_m0_1\
Your parent conversation ID is 6e943540-9db4-4898-95f7-1382b16362bf.

MANDATORY: Read the original user request at:
d:\College\Practice\loopicafe-management-system\.agents\teamwork\ORIGINAL_REQUEST.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Project Context & Analysis Plans:
- d:\College\Practice\loopicafe-management-system\AGENTS.md
- d:\College\Practice\loopicafe-management-system\.agents\teamwork\orchestrator\PROJECT.md
- d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_1\fixtures_plan.md
- d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_2\golden_cases_plan.md
- d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_3\runner_plan.md

Milestone M0: Package P00 — Baseline, Golden Cases & Test Fixtures.

Files owned exclusively by you:
- `tests/fixtures/workforce-fixtures.mjs` (create new)
- `tests/workforce-golden-cases.test.mjs` (create new)
- `tests/helpers/database.mjs` (backward-compatible extensions)

Tasks:
1. Implement `tests/helpers/database.mjs` extensions:
   - Preserve existing function signatures and defaults for `createDatabase`, `seedStore`, `seedEmployee`.
   - Add new seed helpers: `seedAttendanceRules`, `seedShift`, `seedAttendanceSession`, `seedAttendanceEvent`, `seedPayrollPeriod`, `seedRequest`, `seedHandover`.
2. Implement `tests/fixtures/workforce-fixtures.mjs`:
   - Export `ROLES` and `STATUSES`.
   - Export `createWorkforceFixture(db, options)` providing multi-role actors: `employeeA`, `employeeB`, `teamLead`, `manager`, `soleOwner`, `owner1`, `owner2`, `systemAdmin`, `suspendedStaff`, `offboardedStaff`, `invitedStaff`, `inactiveStaff`.
   - Export `createMultiStoreFixture(db)` for isolated tenant testing.
   - Export scenario builders: `buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, `buildRateHistoryScenario`, `buildHandoverScenario`, `buildRetentionScenario`.
3. Implement `tests/workforce-golden-cases.test.mjs`:
   - Comprehensive test suite for Golden Cases C01 through C07 per `golden_cases_plan.md`:
     - C01: Self-approval matrix (actor != requester, actor != beneficiary) & team_lead scope.
     - C02: Shift draft holding slot in SQLite overlap trigger.
     - C03: 15m clipping vs payable minutes & unscheduled sessions.
     - C04: Algorithm steps for 15m floor rounding, rate split, and 1.000 VND total rounding.
     - C05: Handover acknowledgment gate & first-shift / bypass scenarios.
     - C06: Full-shift leave, request withdrawal, 1-owner self-correction rule.
     - C07: 90-day evidence expiry vs 180-day order PII anonymization vs 3-year preservation.
4. Run verification commands:
   - `npm.cmd test` (Must pass all 161 existing tests + all new golden cases, 0 failures).
   - `npm.cmd run typecheck` (Must pass with 0 errors).
   - `npm.cmd run lint` (Must pass with 0 errors).
   - `npm.cmd run check` (Must pass cleanly).
5. Write your handoff report to `d:\College\Practice\loopicafe-management-system\.agents\teamwork\worker_m0_1\handoff.md`
6. When finished, send a message to parent (6e943540-9db4-4898-95f7-1382b16362bf) notifying completion with file paths.
