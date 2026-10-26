import { chromium } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const APP_ORIGIN = "http://127.0.0.1:4173";

const VIEWPORTS = [
  { width: 320, height: 844, name: "320×844" },
  { width: 375, height: 844, name: "375×844" },
  { width: 390, height: 844, name: "390×844" },
  { width: 768, height: 1024, name: "768×1024" },
  { width: 1440, height: 900, name: "1440×900" },
];

const ROUTES = [
  { path: "/order", auth: null },
  { path: "/auth/login", auth: null },
  { path: "/app/today", auth: "owner" },
  { path: "/app/requests", auth: "owner" },
  { path: "/app/attendance", auth: "owner" },
  { path: "/app/checklists", auth: "owner" },
  { path: "/app/schedule", auth: "owner" },
  { path: "/app/rbac", auth: "admin" },
];

let accounts = [];
const file = resolve(process.cwd(), ".wrangler/local-readiness/accounts.json");
if (existsSync(file)) {
  accounts = JSON.parse(readFileSync(file, "utf8"));
}

function getAccount(roleKey) {
  if (roleKey === "admin") return accounts.find((a) => a.role === "system_admin");
  return accounts.find((a) => a.role === roleKey);
}

async function loginUser(page, account) {
  await page.goto(`${APP_ORIGIN}/auth/login`);
  await page.waitForSelector("form[data-auth-ready='true']", { timeout: 15000 });
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(account.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const expectedPrefix = account.role === "system_admin" ? "/app/admin" : "/app";
  await page.waitForURL((url) => url.pathname.startsWith(expectedPrefix), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

async function runVerification() {
  console.log("=== STARTING CHALLENGER DEEP EMPIRICAL PROBE ===");
  const browser = await chromium.launch({ headless: true });

  const summary = {
    viewportsMatrix: [],
    attendanceOcclusion: [],
    touchTargets: [],
    rbacRoute: null,
  };

  try {
    // 1. Direct fetch verification of /app/rbac
    console.log("\n[1] Checking /app/rbac direct HTTP status...");
    const rbacRes = await fetch(`${APP_ORIGIN}/app/rbac`);
    console.log(`  HTTP Status for /app/rbac: ${rbacRes.status}`);
    summary.rbacRoute = { httpStatus: rbacRes.status };

    // 2. Viewport Matrix & Overflow
    console.log("\n[2] Testing Viewport Matrix & Horizontal Overflow (5 Viewports × 8 Routes)...");
    for (const vp of VIEWPORTS) {
      console.log(`\n--- Viewport: ${vp.name} ---`);
      for (const routeCfg of ROUTES) {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
        });
        const page = await context.newPage();

        if (routeCfg.auth) {
          const acc = getAccount(routeCfg.auth);
          await loginUser(page, acc);
        }

        await page.goto(`${APP_ORIGIN}${routeCfg.path}`);
        await page.waitForLoadState("networkidle");

        const overflowData = await page.evaluate(() => {
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const bodyScrollWidth = document.body.scrollWidth;
          const hasOverflow = scrollWidth > innerWidth || bodyScrollWidth > innerWidth;

          return {
            scrollWidth,
            innerWidth,
            bodyScrollWidth,
            hasOverflow,
          };
        });

        const pass = !overflowData.hasOverflow;
        console.log(`  [${vp.name}] ${routeCfg.path} -> scrollWidth: ${overflowData.scrollWidth}, innerWidth: ${overflowData.innerWidth}, Overflow: ${pass ? "PASS" : "FAIL"}`);
        summary.viewportsMatrix.push({
          viewport: vp.name,
          route: routeCfg.path,
          ...overflowData,
          pass,
        });

        await context.close();
      }
    }

    // 3. Deep Mobile Occlusion & Hit Testing on /app/attendance (320px and 375px)
    console.log("\n[3] Testing Mobile Occlusion & Hit-testing on /app/attendance...");
    for (const width of [320, 375]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
      });
      const page = await context.newPage();
      const acc = getAccount("owner");
      await loginUser(page, acc);

      await page.goto(`${APP_ORIGIN}/app/attendance`);
      await page.waitForLoadState("networkidle");

      const occlusionResult = await page.evaluate(async () => {
        // Disable smooth scroll to avoid async animation lag
        document.documentElement.style.scrollBehavior = "auto";
        document.body.style.scrollBehavior = "auto";
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((r) => setTimeout(r, 100));

        // Locate link "Mở lịch của bạn"
        const links = Array.from(document.querySelectorAll("a"));
        const targetLink = links.find((a) => (a.innerText || "").includes("Mở lịch của bạn"));

        const nav = document.querySelector("nav.mobile-nav");
        const navRect = nav ? nav.getBoundingClientRect() : null;

        if (!targetLink) {
          return { error: "Link 'Mở lịch của bạn' not found in DOM" };
        }

        const linkRect = targetLink.getBoundingClientRect();
        const centerX = linkRect.left + linkRect.width / 2;
        const centerY = linkRect.top + linkRect.height / 2;

        const hitEl = document.elementFromPoint(centerX, centerY);
        const hitTag = hitEl ? hitEl.tagName.toLowerCase() : null;
        const hitClass = hitEl ? (hitEl.className || "").toString() : null;
        const hitIsTargetOrChild = targetLink === hitEl || targetLink.contains(hitEl);

        const clearance = navRect ? (navRect.top - linkRect.bottom) : null;

        return {
          linkRect: {
            top: Math.round(linkRect.top * 10) / 10,
            bottom: Math.round(linkRect.bottom * 10) / 10,
            left: Math.round(linkRect.left * 10) / 10,
            width: Math.round(linkRect.width * 10) / 10,
            height: Math.round(linkRect.height * 10) / 10,
          },
          navRect: navRect ? {
            top: Math.round(navRect.top * 10) / 10,
            bottom: Math.round(navRect.bottom * 10) / 10,
            height: Math.round(navRect.height * 10) / 10,
          } : null,
          hitElement: { tag: hitTag, className: hitClass },
          hitIsTargetOrChild,
          clearance,
          isOccluded: !hitIsTargetOrChild || (navRect && linkRect.bottom > navRect.top),
        };
      });

      console.log(`  [${width}×844] /app/attendance link hit test:`, occlusionResult);
      summary.attendanceOcclusion.push({ width, ...occlusionResult });
      await context.close();
    }

    // 4. Touch Targets Inspection
    console.log("\n[4] Inspecting Specific Touch Targets (>= 44×44px)...");
    {
      // 4a. /auth/login touch targets
      const context = await browser.newContext({ viewport: { width: 375, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${APP_ORIGIN}/auth/login`);
      await page.waitForLoadState("networkidle");

      const loginTargets = await page.evaluate(() => {
        const findByText = (query) => {
          const els = Array.from(document.querySelectorAll("button, a, [role='button']"));
          return els.find((el) => (el.innerText || "").includes(query));
        };

        const menuLink = findByText("Xem thực đơn & Đặt món ngay");
        const magicLinkBtn = findByText("Gửi liên kết đăng nhập qua email");
        const headerOrderLink = findByText("Đặt món ngay");

        const measure = (el, name) => {
          if (!el) return { name, exists: false };
          const r = el.getBoundingClientRect();
          return {
            name,
            exists: true,
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
            pass: r.height >= 43.5 && r.width >= 43.5,
          };
        };

        return [
          measure(menuLink, "Xem thực đơn & Đặt món ngay"),
          measure(magicLinkBtn, "Gửi liên kết đăng nhập qua email"),
          measure(headerOrderLink, "Đặt món ngay (header)"),
        ];
      });

      console.log("  /auth/login controls:", loginTargets);
      summary.touchTargets.push(...loginTargets);
      await context.close();
    }

    {
      // 4b. /app/attendance touch targets ("Vào ca", "Ra ca", "Mở lịch của bạn")
      const context = await browser.newContext({ viewport: { width: 375, height: 844 } });
      const page = await context.newPage();
      const acc = getAccount("owner");
      await loginUser(page, acc);
      await page.goto(`${APP_ORIGIN}/app/attendance`);
      await page.waitForLoadState("networkidle");

      const attendanceTargets = await page.evaluate(() => {
        const findByText = (selector, query) => {
          const els = Array.from(document.querySelectorAll(selector));
          return els.find((el) => (el.innerText || "").includes(query));
        };

        const vaoCa = findByText("button", "Vào ca");
        const raCa = findByText("button", "Ra ca");
        const moLich = findByText("a", "Mở lịch của bạn");

        const measure = (el, name) => {
          if (!el) return { name, exists: false };
          const r = el.getBoundingClientRect();
          return {
            name,
            exists: true,
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
            pass: r.height >= 43.5 && r.width >= 43.5,
          };
        };

        return [
          measure(vaoCa, "Vào ca"),
          measure(raCa, "Ra ca"),
          measure(moLich, "Mở lịch của bạn"),
        ];
      });

      console.log("  /app/attendance controls:", attendanceTargets);
      summary.touchTargets.push(...attendanceTargets);
      await context.close();
    }

    // 5. Browser Render of /app/rbac
    console.log("\n[5] Verifying browser render of /app/rbac with system_admin...");
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const adminAcc = getAccount("admin");
      await loginUser(page, adminAcc);

      const rbacNavRes = await page.goto(`${APP_ORIGIN}/app/rbac`);
      await page.waitForLoadState("networkidle");

      const rbacRender = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map((h) => h.innerText);
        const rolesTable = document.querySelector("table, [role='table'], .rbac-container, .role-card, .matrix-table");
        const bodyText = document.body.innerText;
        return {
          currentUrl: window.location.href,
          headings,
          hasRolesTable: Boolean(rolesTable),
          textMatch: /vai trò|quyền|rbac|phân quyền|system_admin/i.test(bodyText),
        };
      });

      console.log("  /app/rbac render details:", {
        httpStatus: rbacNavRes ? rbacNavRes.status() : null,
        ...rbacRender,
      });

      summary.rbacRoute = {
        ...summary.rbacRoute,
        renderStatus: rbacNavRes ? rbacNavRes.status() : null,
        ...rbacRender,
      };
      await context.close();
    }

  } finally {
    await browser.close();
  }

  console.log("\n=== PROBE COMPLETE ===");
  console.log(JSON.stringify(summary, null, 2));
}

runVerification().catch((err) => {
  console.error("FATAL ERROR in challenger verification:", err);
  process.exit(1);
});
