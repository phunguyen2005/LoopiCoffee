import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("landing source and assets retain Vietnamese content", async () => {
  const [page, layout, mascot] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/loopy-sticker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /LoopyCafe/);
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
  assert.match(page, /LoopyCafe trong 10 giây/);
  assert.match(page, /controls/);
  assert.match(page, /playsInline/);
  assert.match(page, /preload="metadata"/);
  assert.match(page, /poster="\/loopicafe-introduce-poster\.jpg"/);
  assert.match(page, /Mở video giới thiệu LoopyCafe/);
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
    Promise.all([
      readFile(new URL("../components/operational-views.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/operational/checklists-view.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/operational/issues-view.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/operational/handovers-view.tsx", import.meta.url), "utf8"),
    ]).then((files) => files.join("\n")),
    readFile(new URL("../app/api/reports/attendance.csv/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../modules/payroll/application/load-report.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(auth, /INSERT INTO employees|UPDATE employees|INSERT INTO employee_consents/);
  assert.match(auth, /status !== "active"/);
  assert.match(auth, /employee_consents/);
  assert.match(retention, /if \(!secret\)/);
  assert.match(retention, /expireEvidence/);
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
    "loopy-hello.webp",
    "loopy-cheer.webp",
    "loopy-celebrate.webp",
    "loopy-worries.webp",
    "loopy-shy.webp",
    "loopy-checkin.webp",
    "loopy-checklist.webp",
    "loopy-working.webp",
    "loopy-success.webp",
  ];
  const [runtime, dashboard, today, auth, globalStyles, proxy, mascotComponent, ...mascots] =
    await Promise.all([
      readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/today/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../server/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      readFile(new URL("../server/session.ts", import.meta.url), "utf8"),
      readFile(new URL("../components/loopy-sticker.tsx", import.meta.url), "utf8"),
      ...mascotPaths.map((name) => readFile(new URL(`../public/mascots/${name}`, import.meta.url))),
    ]);

  assert.match(runtime, /export async function ensureDatabase\(\)/);
  assert.match(dashboard, /db\.batch\(/);
  assert.match(today, /db\.batch\(/);
  assert.match(auth, /validatedIdentityCache/);
  assert.match(proxy, /auth\.getSession\(\)/);
  assert.doesNotMatch(proxy, /auth\.getUser\(\)/);
  assert.match(mascotComponent, /\/mascots\/loopy-hello\.webp/);
  assert.match(globalStyles, /object-fit:\s*contain/);
  assert.doesNotMatch(globalStyles, /fonts\.googleapis/);
  assert.equal(mascots.length, mascotPaths.length);
  assert.ok(mascots.every((mascot) => mascot.byteLength < 100_000));
});

test("maintains mobile UX operational hierarchy and touch target safeguards for OWNER and STAFF", async () => {
  const [
    todayView,
    dashboardView,
    handoversView,
    requestsView,
    attendanceView,
    issuesView,
    scheduleView,
    payrollView,
    appShell,
    globalStyles,
  ] = await Promise.all([
    readFile(new URL("../components/operational/today-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/operational/dashboard-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/operational/handovers-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/operational/requests-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/operational/attendance-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/operational/issues-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/operational/schedule-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/payroll-reports-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  // STAFF Today view: shift progress & tasks appear before monthly statistics
  const todayWorkflowIdx = todayView.indexOf("Tiến trình ca làm");
  const todayMonthlyIdx = todayView.indexOf("Thống kê công tháng này");
  assert.ok(todayWorkflowIdx > 0 && todayMonthlyIdx > todayWorkflowIdx);

  // OWNER Dashboard view: action alerts appear before management shortcuts without CSS order hacks
  assert.doesNotMatch(dashboardView, /order:\s*-1/);
  const ownerAlertIdx = dashboardView.indexOf("Cần xử lý ngay");
  const ownerShortcutsIdx = dashboardView.indexOf("Lối tắt quản trị");
  assert.ok(ownerAlertIdx > 0 && ownerShortcutsIdx > ownerAlertIdx);

  // STAFF Handovers view: promotes incoming unacknowledged handovers above the create form
  const incomingHandoverIdx = handoversView.indexOf("Bàn giao cần xác nhận ngay");
  const createHandoverFormIdx = handoversView.indexOf("<form onSubmit={submit}>");
  assert.ok(incomingHandoverIdx > 0 && createHandoverFormIdx > incomingHandoverIdx);

  // Accidental tap prevention (2-step inline confirmation) on mobile approvals
  assert.match(requestsView, /confirmRejectId/);
  assert.match(attendanceView, /confirmApproveAll/);
  assert.match(attendanceView, /confirmRejectEventId/);

  // Filter chips & presets for fast mobile operations
  assert.match(issuesView, /Máy pha \/ máy xay trục trặc/);
  assert.match(scheduleView, /Ưu tiên hôm nay/);
  assert.match(payrollView, /Lọc nhanh trạng thái nhân sự/);
  assert.match(appShell, /showMobileQuickPanel/);
  assert.match(globalStyles, /\.week-grid > \.week-person/);

  // Employee Mobile UX refinements (375px - 430px)
  const notificationsPopover = await readFile(
    new URL("../components/notifications-popover.tsx", import.meta.url),
    "utf8",
  );
  assert.match(notificationsPopover, /fixed inset-x-3 top-16 z-50 max-h-\[75vh\] flex flex-col/);
  assert.match(notificationsPopover, /bg-black\/30/);
  assert.doesNotMatch(appShell, /highlight-item/);
  assert.match(todayView, /grid-cols-3 gap-2/);
  assert.doesNotMatch(todayView, /mobile-sticky-primary/);
  assert.match(scheduleView, /grid-cols-3 gap-2/);
  assert.doesNotMatch(scheduleView, /<span className="badge neutral">Danh sách<\/span>/);
  assert.doesNotMatch(scheduleView, /Nghỉ đã duyệt · Chưa bố trí/);

  // Owner / Manager Mobile UX refinements (375px - 430px)
  const kpiBlockIdx = dashboardView.indexOf("owner-kpi-grid");
  const quickPanelIdx = dashboardView.indexOf("Thao tác nhanh cho quản lý");
  assert.ok(ownerAlertIdx < kpiBlockIdx && kpiBlockIdx < quickPanelIdx);
  assert.match(attendanceView, /Thông tin tham khảo để đối soát/);
  assert.match(attendanceView, /min-h-\[40px\] px-3 py-1\.5 rounded-lg border/);
  assert.match(payrollView, /grid-cols-2 gap-2\.5/);
  assert.doesNotMatch(payrollView, /<h2 className="card-title">Báo cáo<\/h2>/);

  // P0 Team search bar, filter chip scroll, viewport-safe status badge & bounded editor sheet
  const teamView = await readFile(new URL("../components/operational/team-view.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(teamView, /flex:\s*"1 1 240px"/);
  assert.match(teamView, /team-search-box/);
  assert.match(teamView, /team-filter-scroll/);
  assert.match(teamView, /team-editor-sheet/);
  assert.match(teamView, /team-editor-header/);
  assert.match(teamView, /team-editor-body/);
  assert.match(teamView, /team-editor-footer/);
  assert.match(globalStyles, /\.team-search-box\s*\{[\s\S]*?height:\s*46px/);
  assert.match(globalStyles, /\.team-filter-scroll::-webkit-scrollbar\s*\{\s*display:\s*none/);
  assert.match(scheduleView, /schedule-mode-bar/);
});


