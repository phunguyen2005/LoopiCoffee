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
  assert.match(page, /Không theo dõi vị trí nền/);
  assert.match(layout, /lang="vi"/);
  assert.match(mascot, /loopy-sticker/);
  assert.doesNotMatch(`${page}${layout}`, /Your site is taking shape|Building your site|vinext-starter/i);
});

test("places the opt-in introduction video between the hero and benefits", async () => {
  const [page, video, poster] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/loopicafe-introduce-vid.mp4", import.meta.url)),
    readFile(new URL("../public/loopicafe-introduce-poster.jpg", import.meta.url)),
  ]);

  const heroEnd = page.indexOf("landing-video-section");
  const benefitsStart = page.indexOf("benefit-section");
  assert.ok(heroEnd > 0 && benefitsStart > heroEnd);
  assert.match(page, /LoopiCafe trong 10 giây/);
  assert.match(page, /controls/);
  assert.match(page, /playsInline/);
  assert.match(page, /preload="metadata"/);
  assert.match(page, /poster="\/loopicafe-introduce-poster\.jpg"/);
  assert.match(page, /Mở video giới thiệu LoopiCafe/);
  assert.doesNotMatch(page, /\bautoPlay\b|\bloop\b/);
  assert.ok(video.byteLength > 1_000_000);
  assert.equal(poster[0], 0xff);
  assert.equal(poster[1], 0xd8);
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
  const [auth, retention, operations, report, payrollReport] = await Promise.all([
    readFile(new URL("../server/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cron/retention/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/operational-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/reports/attendance.csv/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/payroll-report.ts", import.meta.url), "utf8"),
  ]);
  assert.match(auth, /SELECT COUNT\(\*\) AS count FROM employees/);
  assert.match(auth, /status !== "active"/);
  assert.match(auth, /employee_consents/);
  assert.match(retention, /if \(!secret\)/);
  assert.match(retention, /attendance_locations/);
  assert.match(operations, /fetch\(\"\/api\/checklists/);
  assert.match(operations, /fetch\(\"\/api\/incidents/);
  assert.match(operations, /fetch\(\"\/api\/handovers/);
  assert.match(report, /loadPayrollReport/);
  assert.match(payrollReport, /s\.worked_minutes BETWEEN 0 AND 720/);
  assert.match(payrollReport, /s\.status = 'completed'/);
  assert.match(payrollReport, /period\.endExclusiveIso/);
  assert.doesNotMatch(report, /Trần Gia Hân/);
});

test("keeps upgrade migrations compatible with Cloudflare D1", async () => {
  const migration = await readFile(
    new URL("../drizzle/0001_eager_peter_parker.sql", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    migration,
    /ALTER TABLE[^;]+ADD[^;]+DEFAULT CURRENT_TIMESTAMP/gi,
  );
  assert.match(migration, /UPDATE `checklist_items` SET `updated_at` = CURRENT_TIMESTAMP/);
  assert.match(migration, /UPDATE `stores` SET `updated_at` = CURRENT_TIMESTAMP/);
});

test("keeps startup work and high-resolution mascot assets bounded", async () => {
  const mascotPaths = [
    "loopy-hello.png",
    "loopy-cheer.png",
    "loopy-celebrate.png",
    "loopy-worries.png",
    "loopy-shy.png",
    "loopy-checkin.png",
    "loopy-checklist.png",
    "loopy-working.png",
    "loopy-success.png",
  ];
  const [runtime, dashboard, today, auth, globalStyles, proxy, mascotComponent, ...mascots] =
    await Promise.all([
      readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/today/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../server/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/loopy-sticker.tsx", import.meta.url), "utf8"),
      ...mascotPaths.map((name) => readFile(new URL(`../public/mascots/${name}`, import.meta.url))),
    ]);

  assert.match(runtime, /databaseInitialization \?\?=/);
  assert.match(dashboard, /db\.batch\(/);
  assert.match(today, /db\.batch\(/);
  assert.match(auth, /validatedIdentityCache/);
  assert.match(proxy, /auth\.getSession\(\)/);
  assert.doesNotMatch(proxy, /auth\.getUser\(\)/);
  assert.match(mascotComponent, /\/mascots\/loopy-hello\.png/);
  assert.match(globalStyles, /object-fit:\s*contain/);
  assert.doesNotMatch(globalStyles, /fonts\.googleapis/);
  assert.equal(mascots.length, mascotPaths.length);
  assert.ok(mascots.every((mascot) => mascot.byteLength < 1_200_000));
});
