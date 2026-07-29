# LoopiCafe

LoopiCafe is a Vietnamese, mobile-first operations pilot for a single coffee shop. It connects scheduling, photo-and-location attendance, checklists, incident reporting, handovers, requests, staff review, and attendance exports.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Local development uses a demo owner identity and local Cloudflare D1/R2 bindings.

## Verify

```bash
npm run lint
npm test
```

`npm test` builds the Cloudflare Worker bundle and verifies the public interface plus the attendance privacy invariants.

## Attendance evidence

- Camera and geolocation start only after the employee taps an attendance action.
- The browser asks for a fresh one-shot location (`maximumAge: 0`) with a 10-second timeout.
- The server creates a 60-second, single-use capture session and supplies the authoritative time.
- The submitted evidence includes coordinates, device-reported accuracy, and calculated distance from the configured store.
- Distance is review evidence only; it never automatically declares an employee onsite or blocks attendance.
- Missing camera or location evidence still records server time and creates a manager-review exception.
- Photos and precise coordinates expire after 90 days.

The visual footer is composed in the browser from server-authoritative event data before the private image is stored. A production image-rendering adapter can move the final composition fully server-side without changing the attendance event model.

## Platform

- Next.js-compatible UI powered by vinext
- Cloudflare D1 for structured operational data
- Cloudflare R2 for private attendance evidence
- Sites/ChatGPT sign-in headers for deployed identity
- Drizzle schema and generated migration under `drizzle/`

Bindings are declared in `.openai/hosting.json`:

```json
{"d1":"DB","r2":"EVIDENCE"}
```

The protected application is under `/app`; privacy and camera/location notices remain publicly accessible.
