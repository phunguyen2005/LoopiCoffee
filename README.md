# LoopiCafe

LoopiCafe is a Vietnamese, mobile-first operations pilot for a single coffee shop. It connects scheduling, photo-and-location attendance, checklists, incident reporting, handovers, requests, staff review, and attendance exports.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open the address printed by the development server. Local development uses project-local Cloudflare D1/R2 bindings. Copy `.env.example` to an ignored local environment file and configure the required authentication values. Demo authentication is opt-in; startup no longer creates tables, staff memberships, or demo records.

Before using an existing local database, follow [database preflight and rollout](docs/database-operations.md). New databases require the versioned D1 migrations and explicit store/owner provisioning. Never use the demo seeder with real staff data.

## Verify

```bash
npm run check
```

`npm run check` runs type generation/checking, lint, behavioral/schema/boundary tests, and the production build. `npm test` runs tests only, using temporary in-memory databases without credentials or live writes. Source/asset tests are not browser-rendering tests.

See [architecture decisions and remaining work](docs/architecture.md) for the module boundaries and intentionally unfinished integrations.

## Attendance evidence

- Camera and geolocation start only after the employee taps an attendance action.
- The browser asks for a fresh one-shot location (`maximumAge: 0`) with a 10-second timeout.
- The server creates a 60-second, single-use capture session and supplies the authoritative time.
- The photo, location, capture token, and idempotency key are submitted in one attendance action.
- The server decodes the JPEG, generates the stamped evidence image, writes it to private storage, and then commits its immutable event records.
- The submitted evidence includes coordinates, device-reported accuracy, and calculated distance from the configured store.
- Distance is review evidence only; it never automatically declares an employee onsite or blocks attendance.
- Missing camera or location evidence requires an employee explanation, still records server time, and creates a manager-review exception.
- Photos and precise coordinates use the configured retention period (90 days by default). An approved scheduler must invoke the protected cleanup endpoint; see the operations guide.

The browser preview is not attendance proof. Completed evidence is rendered by the server with an opaque footer containing the action, server time, coordinates, reported accuracy, distance from the configured store, and attendance event ID. Only managers and owners assigned to the store can retrieve the private stamped image.

Attendance remains disabled until the owner saves the store coordinates and threshold settings. New employees must accept the current camera-and-location notice before starting a capture.

## Platform

- Next.js-compatible UI powered by vinext
- Cloudflare D1 for structured operational data
- Cloudflare R2 for private attendance evidence
- Sites/ChatGPT sign-in headers for deployed identity
- Persisted role-aware operations and versioned attendance settings
- Drizzle schema and generated migrations under `drizzle/`

Bindings are declared in `.openai/hosting.json`:

```json
{"d1":"DB","r2":"EVIDENCE"}
```

The protected application is under `/app`; privacy and camera/location notices remain publicly accessible.
