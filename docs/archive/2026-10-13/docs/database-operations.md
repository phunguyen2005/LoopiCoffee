# Database and rollout operations

## Sources of truth

`db/schema.ts` is the model and `drizzle/*.sql` is the migration history. Normal HTTP requests only obtain the D1 binding. There is no request-time schema repair or automatic demo insertion.

Old migrations `0000`–`0005` were retained unchanged. This release adds:

- `0006_repair_application_columns`: employee job title/phone/start date/last login and store geofence radius, which existed in the old runtime initializer but were missing from SQL migration history.
- `0007_payroll_snapshots`: saved report JSON and version on payroll entries. Existing entries retain version zero and their original saved totals; historical rates are not reconstructed from current employee data.

## Preflight before applying migrations

1. Back up the target D1 database using the deployment platform's supported backup/export procedure. Confirm the exact environment and migration history.
2. Inspect columns on `employees`, `stores`, and `payroll_entries`. For a local SQLite database or restored test copy, run `npm run db:preflight -- <absolute-database-path>`. This tool is read-only and prints schema names, not employee records.
3. If a target has SQL migrations through `0005` and lacks the repair columns, apply `0006`, then `0007`, through the normal Sites migration deployment flow.
4. If repair columns already exist (common in old local databases created by runtime DDL), do **not** blindly run `0006`: SQLite rejects duplicate columns. Compare all schema/default/index/foreign-key definitions and migration bookkeeping on a restored copy. Reconcile that database under a reviewed environment-specific plan before rollout; the preflight does not mark migrations applied. A mixture of present/missing repair columns is a blocker for automatic migration.
5. A database with no migration history is not automatically equivalent to `0005`, even if some column names match. Do not fabricate its history or delete its data to make a migration pass.
6. Apply/verify migrations before routing requests to the new Worker. Run foreign-key checks, smoke-test sign-in, account updates, attendance capture/review, payroll finalize/export, and retention with disposable evidence.

The fresh-schema test executes the complete migration chain and compares all model column names. Existing runtime-created databases still require the preflight above; passing the test is not proof that every historical database can be upgraded blindly.

## Membership and demos

The first authenticated visitor is no longer promoted to owner. Real initial store/owner provisioning is an explicit operator task using approved identities and audited database administration. Authentication must match an existing membership; no privacy consent is inserted on sign-in.

`/api/seed-users` is a demo provisioning endpoint only. It requires all of `ENABLE_DEMO_SEED=true`, a dedicated `SEED_SECRET` bearer value, `TEST_ACCOUNT_PASSWORD`, and configured Supabase admin credentials. `CRON_SECRET` is not a seed credential. The seeder can overwrite demo records/passwords; never enable or call it against real staff data. Disable it after use. This refactor does not call it.

For local demo identity, `ALLOW_DEMO_AUTH=true` is honored only outside production, and the matching membership must already exist. Supabase remains preferred when a valid session is present. Normal startup is intentionally not a provisioning operation.

## Retention

An approved scheduler should invoke `POST /api/cron/retention` with `Authorization: Bearer <CRON_SECRET>` over HTTPS. Existing GET callers remain compatible. Keep the secret in scheduler secret storage, not source, query strings, browser code, or logs.

Each invocation handles up to 100 photo objects and 200 coordinate records. Inspect `remaining`, `failures`, and HTTP status. A storage failure returns 503 and retains photo metadata for retry. Drain remaining work with bounded, paced retries and alert on repeated failures. Avoid overlapping runs. The endpoint being present does not mean a scheduler is configured.

Coordinate deletion and R2 deletion cannot share a distributed transaction. Photo cleanup is retry-safe after an object deletion or metadata-write failure; missing objects can be deleted again. Retained attendance events continue to support hours and review history after detailed evidence expires.

## Rollback

These new migrations are additive. Prefer rolling back application code while retaining the new columns. Do not drop payroll snapshots or restore an old database over new attendance/payroll writes. If migration or smoke tests fail, stop rollout and use the approved restore/reconciliation process.

The refactor itself does not deploy, mutate the live database, run cleanup, reset passwords, or change site access.
