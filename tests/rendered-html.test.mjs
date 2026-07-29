import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the LoopiCafe Vietnamese landing page", async () => {
  const [page, layout, mascot] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/loopy-sticker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /LoopiCafe/);
  assert.match(page, /Quán vẫn chạy trơn tru/);
  assert.match(page, /Không theo dõi nền/);
  assert.match(layout, /lang="vi"/);
  assert.match(mascot, /loopy-sticker/);
  assert.doesNotMatch(`${page}${layout}`, /Your site is taking shape|Building your site|vinext-starter/i);
});

test("keeps camera and geolocation collection explicit and fresh", async () => {
  const capture = await readFile(
    new URL("../components/attendance-capture.tsx", import.meta.url),
    "utf8",
  );
  const serverAction = await readFile(
    new URL("../app/api/attendance/actions/route.ts", import.meta.url),
    "utf8",
  );
  const headers = await readFile(
    new URL("../next.config.ts", import.meta.url),
    "utf8",
  );

  assert.match(capture, /getUserMedia/);
  assert.match(capture, /getCurrentPosition/);
  assert.match(capture, /enableHighAccuracy:\s*true/);
  assert.match(capture, /maximumAge:\s*0/);
  assert.match(capture, /timeout:\s*10000/);
  assert.match(capture, /"check_in"\s*\|\s*"check_out"/);
  assert.match(serverAction, /new Date\(\)\.toISOString\(\)/);
  assert.match(serverAction, /evidence_retention_days/);
  assert.match(headers, /camera=\(self\), geolocation=\(self\)/);
  assert.match(serverAction, /createServerStampedSvg/);
  assert.match(serverAction, /evidence\.put/);
  assert.match(serverAction, /body\.photo/);
  assert.doesNotMatch(capture, /fetch\(\"\/api\/attendance\/evidence/);
});

test("enforces membership, protected retention, and persistent workflows", async () => {
  const [auth, retention, operations, report] = await Promise.all([
    readFile(new URL("../server/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cron/retention/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/operational-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/reports/attendance.csv/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /SELECT COUNT\(\*\) AS count FROM employees/);
  assert.match(auth, /status !== "active"/);
  assert.match(auth, /employee_consents/);
  assert.match(retention, /if \(!secret\)/);
  assert.match(retention, /attendance_locations/);
  assert.match(operations, /fetch\(\"\/api\/checklists/);
  assert.match(operations, /fetch\(\"\/api\/incidents/);
  assert.match(operations, /fetch\(\"\/api\/handovers/);
  assert.match(report, /SUM\(s\.worked_minutes\)/);
  assert.doesNotMatch(report, /Trần Gia Hân/);
});
