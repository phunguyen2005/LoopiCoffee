# Architecture after the hardening pass

## Decision

Keep a modular monolith. A single-store operations pilot does not need microservices, a DI container, or one repository interface per table. Extract the highest-risk workflows first, preserving existing screens and URLs.

```text
app/api/                 HTTP routing, authentication, input validation
components/              React presentation and browser interaction
modules/
  people/
    domain/              Role hierarchy and store boundaries
    application/         Access changes and explicit invitation acceptance
  attendance/
    domain/              Shift-window rules, independent of framework/storage
    application/         Evidence expiration and retry behavior
  operations/application/ Atomic request decisions
  payroll/
    contracts/           Shared report types; safe for browser imports
    domain/              Period calculation
    application/         Report queries, locked snapshots, finalize/reopen
platform/http/           JSON client, input validation, safe API error responses
server/                  Identity provider adapters, session refresh, audit SQL
db/schema.ts             Declarative database model
db/runtime.ts            Binding access only (no DDL or implicit seeding)
db/seed.ts               Explicit demo data provisioning
drizzle/                 Ordered, immutable applied migrations
tests/                   Behavior, schema parity, boundary and source checks
tooling/                 Local type generation and read-only schema preflight
```

## Dependency rules

- Domain policies and contracts must not import React, Next, Workers, HTTP handlers, or persistence implementations.
- Browser code may import shared contracts and HTTP client code, never server/application implementations.
- Routes authorize and validate, then call application functions. Do not copy owner-protection logic into a second endpoint.
- Application functions currently take the narrow D1 execution surface directly. This is a deliberate intermediate design, not complete Clean Architecture: SQL and business orchestration remain coupled. Introduce explicit storage ports only when a second adapter or more complex testing warrants them.
- `lib/payroll-report.ts` and the audit export in `server/auth.ts` are compatibility bridges. New code should import the owning module directly. Delete bridges once all consumers move.
- Legacy operations routes have not all been migrated. Move one workflow at a time with behavioral tests; avoid a catch-all `utils` or `services` directory.

## Guarantees covered by tests

- Both account administration and team access changes use the same role/store checks. The final active owner is protected inside the conditional SQL update, including competing demotions.
- Employee access updates and their audits commit atomically. Request decisions, recipient notifications and audit records are one D1 batch; losing or repeated decisions create no duplicate notification.
- Authentication reads do not create membership, elevate the first visitor, accept privacy notices, or activate invitations. Invitation acceptance is an explicit write workflow. Suspended/offboarded memberships remain denied.
- Payroll finalization writes entries, versioned report snapshots and the lock/audit in one batch. Locked reports are anchored to saved entries, not current active employees. Later names/rates/status changes do not rewrite new snapshots. Legacy entries preserve stored totals and explicitly mark missing historical detail.
- Evidence cleanup physically removes expired coordinate rows. It deletes photo metadata only after R2 deletion succeeds, preserving retry information on storage failures. Retrieval/review also filter by expiry, so delayed cleanup does not extend access. Attendance events survive evidence expiration.
- HTTP JSON errors always reject in the shared client. Server errors expose a generic message and request ID, not tokens, database statements or exception bodies.

## Deliberately unfinished boundaries

- D1 updates and Supabase admin operations are not a distributed transaction. A durable outbox/reconciliation worker is still needed for reliable provider synchronization. Application access is checked against D1 on every protected request.
- Payroll report reads happen before the final write batch. Concurrent attendance corrections can race with report generation; a revision/close-period barrier is needed for stronger accounting guarantees. This app is not a certified payroll engine.
- Existing forced-password flags use Supabase user metadata. Moving this requirement into server-owned state and adding provider-level tests remains security work.
- Some older routes still contain SQL and ad-hoc input validation; the new handler/input utilities are the migration path, not a claim that every endpoint is hardened.
- Large account and attendance screens remain candidates for feature-specific components/hooks. Avoid splitting solely to reduce line count before tests cover the interaction.
- The source/asset tests do not render a browser. Behavioral tests execute real SQLite with a D1-shaped transaction adapter; a separate Miniflare test verifies the batch guards and rollback against the D1 emulator. Staging tests must still verify hosted D1, R2, Supabase, and browser workflows.
- No scheduler is configured by this patch. The retention endpoint must be invoked and monitored by an approved scheduler before relying on automatic erasure.
- Supabase SQL in the legacy `supabase/` directory is not the active operational database schema. D1 migrations are authoritative; do not deploy competing operational tables from that legacy SQL.

## Verification

`npm run check` generates Workers types, checks TypeScript, runs ESLint, runs tests, and builds the Worker. CI uses the same command without production credentials.

A dependency audit during this pass found existing production-tree advisories for Next.js, its PostCSS/Sharp dependencies, and Nano ID. The framework/runtime versions were not automatically upgraded or force-fixed. Triage with `npm audit --omit=dev`, then perform an isolated compatible upgrade and repeat the full check plus staging auth/attendance/payroll tests. No assertion is made that all advisories are exploitable in the Vinext Worker deployment.
