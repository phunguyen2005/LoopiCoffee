# BRIEFING — 2026-10-13T16:45:00Z

## Mission
Analyze and recommend the exact executable test suite structure for Golden Cases C01 through C07 (`tests/workforce-golden-cases.test.mjs`) for Milestone M0.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_2\
- Original parent: 6e943540-9db4-4898-95f7-1382b16362bf
- Milestone: M0 (P00) Baseline, Golden Cases & Test Fixtures

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify codebase files
- Recommend exact test suite structure for `tests/workforce-golden-cases.test.mjs`
- Output analysis to `golden_cases_plan.md` and handoff report to `handoff.md`
- Giao tiếp tiếng Việt; code/identifiers bằng tiếng Anh theo AGENTS.md

## Current Parent
- Conversation ID: 6e943540-9db4-4898-95f7-1382b16362bf
- Updated: 2026-10-13T16:36:23Z

## Investigation State
- **Explored paths**: `ORIGINAL_REQUEST.md`, `AGENTS.md`, `orchestrator/PROJECT.md`, `spec_miner_survey_1/spec_report.md` (Section 9 C01-C07), `drizzle/*.sql` (0000..0014, specifically 0011 triggers), `modules/people/domain/access.ts`, `modules/operations/application/decide-request.ts`, `manage-shifts.ts`, `modules/attendance/application/correct-attendance.ts`, `expire-evidence.ts`, `modules/payroll/application/load-report.ts`, `tests/*.test.mjs`, `tests/helpers/database.mjs`.
- **Key findings**:
  - C01: Self-approval matrix requires tracking Actor, Requester, and Beneficiary. In swap requests, both employees are beneficiaries. Team lead scope must be restricted strictly to operational duties (cannot approve leave, corrections, or reviews; can only approve swaps between regular employees).
  - C02: The existing SQLite triggers `shifts_no_overlap_insert`/`update` already check `status IN ('draft', 'published')`. Draft shifts already hold the schedule slot in DB, but must be filtered out from employee visibility (`status = 'published'`) and cannot be checked into.
  - C03: 15-minute clipping window allows recording up to 15m early/late, but payable minutes clip strictly to planned shift bounds unless explicit approved overtime exists. Unscheduled sessions have 0 payable minutes by default.
  - C04: Clear 6-step algorithm: Clip -> Split month & rate intervals -> Floor 15m per segment -> Segment integer pay -> Subtotal -> Round total to nearest 1.000 VND (half-up at 500).
  - C05: Check-in gate requires handover acknowledgment. First shift of day has `no_previous_handover_required = true`. Manager/Owner emergency bypass requires reason >= 10 chars and emits audit log.
  - C06: Full-shift leave applies only to complete shifts. Requests can be withdrawn only while pending by requester. Sole-owner self-correction requires active owner count = 1, diff before/after, reason >= 5 chars, high-priority audit flag.
  - C07: Retention starts from `created_at`. 90d removes R2 photos and D1 GPS while preserving `attendance_events`. 180d permanently masks order PII while preserving sales items and revenue. 3-year operational data retention is a compliance floor, prohibiting automated purge jobs.
- **Unexplored areas**: None within the scope of M0 C01-C07.

## Key Decisions Made
- Completed in-depth specification analysis for all 7 Golden Cases C01-C07.
- Authored `golden_cases_plan.md` containing detailed case definitions, input/expected output tables, and executable JavaScript test structures.
- Recommended zero-regression strategy for `tests/workforce-golden-cases.test.mjs`: active tests for DB triggers/domain math, targeted `t.skip` for pending P01-P08 features.
- Produced 5-component handoff report in `handoff.md`.

## Artifact Index
- `DISPATCH.md` — Incoming parent dispatch message
- `BRIEFING.md` — Persistent working memory
- `progress.md` — Liveness heartbeat
- `golden_cases_plan.md` — Detailed Golden Cases test plan & suite architecture
- `handoff.md` — 5-component handoff report
