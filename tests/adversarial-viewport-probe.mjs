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
  { path: "/app/rbac", auth: "admin", fallbackPath: "/app/admin/roles" },
];

// Load accounts
let accounts = [];
const file = resolve(process.cwd(), ".wrangler/local-readiness/accounts.json");
if (existsSync(file)) {
  accounts = JSON.parse(readFileSync(file, "utf8"));
}

function getAccount(roleKey) {
  if (roleKey === "admin") {
    return accounts.find((a) => a.role === "system_admin");
  }
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

async function inspectPage(page) {
  return await page.evaluate(() => {
    // 1. Horizontal overflow check
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const hasOverflow = scrollWidth > innerWidth || bodyScrollWidth > innerWidth;

    const overflowingElements = [];
    if (hasOverflow) {
      const allEls = Array.from(document.querySelectorAll("*"));
      for (const el of allEls) {
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1) {
          overflowingElements.push({
            tag: el.tagName,
            id: el.id,
            className: (el.className || "").toString().slice(0, 80),
            text: (el.innerText || "").slice(0, 30).trim(),
            right: Math.round(r.right),
            width: Math.round(r.width),
          });
        }
      }
    }

    // 2. Touch targets evaluation
    const interactiveQuery = "button, input:not([type='hidden']), select, textarea, a[href], [role='button'], [role='tab'], summary";
    const interactiveEls = Array.from(document.querySelectorAll(interactiveQuery));
    const smallTargets = [];
    let totalInteractive = 0;

    for (const el of interactiveEls) {
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity || "1") === 0
      ) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      totalInteractive++;
      const isSub44 = r.width < 43.5 || r.height < 43.5; // allow subpixel margin of 0.5px

      if (isSub44) {
        smallTargets.push({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          className: (el.className || "").toString().slice(0, 70),
          text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").slice(0, 35).trim(),
          role: el.getAttribute("role") || el.tagName.toLowerCase(),
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        });
      }
    }

    // 3. Mobile nav & bottom clearance / occlusion
    // Find sticky/fixed bottom elements
    const fixedBottoms = Array.from(
      document.querySelectorAll(".mobile-nav, .mobile-sticky-primary, .mobile-attendance-cta, [class*='fixed bottom'], [class*='fixed inset-x-0 bottom-0']")
    ).filter((el) => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.height > 0;
    });

    // Scroll to bottom
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, document.body.scrollHeight);

    const occludedControls = [];
    for (const overlay of fixedBottoms) {
      const or = overlay.getBoundingClientRect();
      for (const el of interactiveEls) {
        if (overlay === el || overlay.contains(el)) continue;
        const s = window.getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        // Check intersection with overlay
        const intersects = !(r.right <= or.left || r.left >= or.right || r.bottom <= or.top || r.top >= or.bottom);
        if (intersects) {
          // Check elementFromPoint at center of element
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx >= 0 && cx <= window.innerWidth && cy >= 0 && cy <= window.innerHeight) {
            const topEl = document.elementFromPoint(cx, cy);
            if (topEl && (overlay === topEl || overlay.contains(topEl))) {
              occludedControls.push({
                text: (el.innerText || el.getAttribute("aria-label") || "").slice(0, 30).trim(),
                tag: el.tagName.toLowerCase(),
                targetRect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
                overlayTag: overlay.tagName.toLowerCase(),
                overlayClass: (overlay.className || "").toString().slice(0, 60),
                overlayTop: Math.round(or.top),
              });
            }
          }
        }
      }
    }

    // Root design tokens and main padding
    const rootStyle = window.getComputedStyle(document.documentElement);
    const mainEl = document.querySelector(".app-main, main");
    const mainPaddingBottom = mainEl ? parseFloat(window.getComputedStyle(mainEl).paddingBottom) : 0;

    return {
      scrollWidth,
      innerWidth,
      hasOverflow,
      overflowingElements: overflowingElements.slice(0, 5),
      totalInteractive,
      smallTargetsCount: smallTargets.length,
      smallTargets: smallTargets.slice(0, 15),
      fixedBottomsCount: fixedBottoms.length,
      occludedControls,
      mainPaddingBottom,
      tokenBottomNavHeight: rootStyle.getPropertyValue("--bottom-nav-height").trim(),
      tokenBottomNavWithCta: rootStyle.getPropertyValue("--bottom-nav-with-cta-height").trim(),
    };
  });
}

async function run() {
  console.log("=== STARTING EMPIRICAL ADVERSARIAL VIEWPORT PROBE ===");
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\nTesting Viewport: ${vp.name} (${vp.width}×${vp.height})`);

    // Context for unauthenticated routes
    const publicContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const publicPage = await publicContext.newPage();

    // Context for owner authenticated routes
    const ownerContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const ownerPage = await ownerContext.newPage();
    const ownerAccount = getAccount("owner");
    if (ownerAccount) {
      await loginUser(ownerPage, ownerAccount);
    }

    // Context for admin authenticated routes
    const adminContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const adminPage = await adminContext.newPage();
    const adminAccount = getAccount("admin");
    if (adminAccount) {
      await loginUser(adminPage, adminAccount);
    }

    for (const route of ROUTES) {
      let pageToUse = publicPage;
      if (route.auth === "owner") pageToUse = ownerPage;
      if (route.auth === "admin") pageToUse = adminPage;

      let targetUrl = `${APP_ORIGIN}${route.path}`;
      let actualPath = route.path;

      try {
        const resp = await pageToUse.goto(targetUrl, { timeout: 15000, waitUntil: "domcontentloaded" });
        await pageToUse.waitForTimeout(1000); // allow hydration & client layout

        // Check if 404 and fallbackPath provided
        if (resp && resp.status() === 404 && route.fallbackPath) {
          console.log(`  Route ${route.path} returned 404, testing fallback route ${route.fallbackPath}`);
          actualPath = route.fallbackPath;
          targetUrl = `${APP_ORIGIN}${actualPath}`;
          await pageToUse.goto(targetUrl, { timeout: 15000, waitUntil: "domcontentloaded" });
          await pageToUse.waitForTimeout(1000);
        }

        const currentUrl = pageToUse.url();
        const data = await inspectPage(pageToUse);

        results.push({
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          route: route.path,
          actualPath,
          currentUrl,
          ...data,
        });

        console.log(`  [${vp.name}] ${actualPath} -> Overflow: ${data.hasOverflow ? 'FAIL (' + data.scrollWidth + ' > ' + data.innerWidth + ')' : 'PASS'}, SmallTargets: ${data.smallTargetsCount}/${data.totalInteractive}, Occluded: ${data.occludedControls.length}`);
      } catch (err) {
        console.error(`  [${vp.name}] ${actualPath} -> ERROR:`, err.message);
        results.push({
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          route: route.path,
          actualPath,
          error: err.message,
        });
      }
    }

    await publicContext.close();
    await ownerContext.close();
    await adminContext.close();
  }

  await browser.close();

  console.log("\n=== SUMMARY OF EMPIRICAL FINDINGS ===");
  const overflows = results.filter((r) => r.hasOverflow);
  const smallTargetResults = results.filter((r) => r.smallTargetsCount > 0);
  const occlusions = results.filter((r) => r.occludedControls && r.occludedControls.length > 0);

  console.log(`Total Scenarios Tested: ${results.length}`);
  console.log(`Horizontal Overflows Detected: ${overflows.length}`);
  console.log(`Scenarios with Sub-44px Touch Targets: ${smallTargetResults.length}`);
  console.log(`Occluded Controls Detected: ${occlusions.length}`);

  // Save raw data to a json file in tooling
  const jsonOutput = resolve(process.cwd(), "tooling/adversarial-viewport-results.json");
  const fs = await import("node:fs");
  fs.writeFileSync(jsonOutput, JSON.stringify(results, null, 2), "utf8");
  console.log(`Wrote full results to ${jsonOutput}`);
}

run().catch((e) => {
  console.error("Probe failed:", e);
  process.exit(1);
});
