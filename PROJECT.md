# Project: LoopiCafe Priority Fixes (FIX-01 to FIX-05)

## Architecture
LoopiCafe is a mobile-first cafe operations web application built on Vinext / Cloudflare Workers, Cloudflare D1 (SQLite via Drizzle), Cloudflare R2 private bucket, and Supabase Auth.
The architecture is a Modular Monolith with:
- `platform/http/`: HTTP runtime boundary, input parsing, error handling.
- `app/api/`: Route handlers for attendance, incidents, handovers, team, shifts, orders.
- `components/operational/`: Frontend view components for orders and schedule management.
- `modules/`: Domain and application services for operations, people, attendance.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R3 Cross-Platform Package & CI (CODE-002 / FIX-03) | Remove direct `@supabase/cli-windows-x64` from package.json devDependencies, mark optional in lockfile with linux-x64 entry to resolve `EBADPLATFORM` | M1 | Survey 1 |
| 2 | R1 Attendance Action Payload Limit (CODE-001 / FIX-01) | Add `options.maxBytes` to `readObject`, allow 3 MiB at `/api/attendance/actions` while keeping 64 KiB default elsewhere | M2 | Survey 1 |
| 3 | R2 Incident State and Audit Atomicity (CODE-003 / FIX-02) | Batch `UPDATE incidents` and `auditStatement` with `onlyIfChanged = true` in single `db.batch`, atomic rollback on audit failure | M3 | Survey 2 |
| 4 | R4 Runtime Input Validation for Legacy Handlers (CODE-004 / FIX-04) | Wrap `/api/incidents` and `/api/handovers` with `apiHandler` and `readObject`, validate types and bounds, return structured 400 | M4 | Survey 2 |
| 5 | R5 Operational UI State and Scheduling Permissions (CODE-005, CODE-006, CODE-008 / FIX-05) | Owner orders error/retry state and race-free polling; team lead employee lookup permission on `GET /api/team`; schedule week navigation race protection | M5 | Survey 3 |
| 6 | Full Regression Suite & Quality Verification | Run all 79 existing tests + new regression tests + zero type errors + clean lint | M6 | Survey 1, 2, 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Cross-Platform CI Compatibility | `package.json`, `package-lock.json`, `tests/platform-compat.test.mjs` | none | IN_PROGRESS (Worker f4e4765f) |
| 2 | M2: Attendance Payload Limit | `platform/http/input.ts`, `app/api/attendance/actions/route.ts`, `tests/attendance-payload.test.mjs` | none | IN_PROGRESS (Worker 5b281996) |
| 3 | M3: Incident State & Audit Atomicity | `app/api/incidents/route.ts`, atomic rollback and non-matching update test | none | IN_PROGRESS (Worker c4c23b33) |
| 4 | M4: Runtime Input Validation | `app/api/incidents/route.ts`, `app/api/handovers/route.ts`, `tests/incidents-handovers.test.mjs` | M3 | IN_PROGRESS (Worker c4c23b33) |
| 5 | M5: Operational UI & Scheduling Permissions | `components/operational/owner-orders-view.tsx`, `components/operational/schedule-view.tsx`, `app/api/team/route.ts`, `tests/operational-ui-permissions.test.mjs` | none | IN_PROGRESS (Worker 8f099ae1) |
| 6 | M6: Final Verification & Audit Hardening | Full 79 pre-existing tests, all new tests, typecheck, lint, independent audit | M1, M2, M3, M4, M5 | PLANNED |

## Interface Contracts
### `platform/http/input.ts` -> `app/api/*`
- `readObject(request: Request, fields?: Record<string, string>, options?: { maxBytes?: number }): Promise<Record<string, unknown>>`
- Default `maxBytes`: 65,536 bytes (64 KiB).
- Custom `maxBytes` for attendance action: 3,145,728 bytes (3 MiB).
- Throws `ApplicationError("Nội dung yêu cầu quá lớn.", 413, "body_too_large")` when limit is exceeded.
- Throws `ApplicationError(..., 400, "invalid_json" | "invalid_input")` for non-object, null, array, or type mismatch.

### `app/api/incidents` PATCH
- Request: `{ id: string, status: "open" | "investigating" | "resolved" }`
- Batch operation:
  ```ts
  const results = await db.batch([
    db.prepare("UPDATE incidents SET status = ?, updated_at = ? WHERE id = ? AND store_id = ?").bind(status, now, id, storeId),
    auditStatement(db, email, "incident", id, `incident.${status}`, {}, now, true)
  ]);
  ```
- If `results[0].meta.changes === 0`, return 404 without creating audit log.
- If audit statement fails, entire batch rolls back.

### `app/api/team` GET
- Allows roles: `["owner", "manager", "team_lead"]`.
- For `team_lead`: returns active employees in the same `store_id` (`id, email, display_name, role, status`).
- `PATCH /api/team`: remains restricted to `["owner"]` only.

## Code Layout
- `package.json`, `package-lock.json`: Dependencies and platform configs (Worker M1).
- `platform/http/input.ts`, `app/api/attendance/actions/route.ts`: Attendance limits (Worker M2).
- `app/api/incidents/route.ts`, `app/api/handovers/route.ts`: Incidents & handovers (Worker M3_M4).
- `components/operational/owner-orders-view.tsx`, `components/operational/schedule-view.tsx`, `app/api/team/route.ts`: Operational UI & Permissions (Worker M5).
- `tests/`: Automated unit and integration tests (`*.test.mjs`).
