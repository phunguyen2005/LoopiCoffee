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

let accounts = [];
const file = resolve(process.cwd(), ".wrangler/local-readiness/accounts.json");
if (existsSync(file)) {
  accounts = JSON.parse(readFileSync(file, "utf8"));
}
const ownerAccount = accounts.find((a) => a.role === "owner");

async function inspectPage(page) {
  return await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    const hasOverflow = scrollWidth > innerWidth;

    const overflowingElements = [];
    if (hasOverflow) {
      const allEls = Array.from(document.querySelectorAll("*"));
      for (const el of allEls) {
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1) {
          overflowingElements.push({
            tag: el.tagName,
            className: (el.className || "").toString().slice(0, 80),
            text: (el.innerText || "").slice(0, 30).trim(),
            right: Math.round(r.right),
          });
        }
      }
    }

    const interactiveQuery = "button, input:not([type='hidden']), select, textarea, a[href], [role='button'], [role='tab'], summary";
    const interactiveEls = Array.from(document.querySelectorAll(interactiveQuery));
    const smallTargets = [];

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

      if (r.width < 43.5 || r.height < 43.5) {
        smallTargets.push({
          tag: el.tagName.toLowerCase(),
          className: (el.className || "").toString().slice(0, 70),
          text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").slice(0, 35).trim(),
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
        });
      }
    }

    const fixedBottoms = Array.from(
      document.querySelectorAll(".mobile-nav, .mobile-sticky-primary, .mobile-attendance-cta, [class*='fixed bottom'], [class*='fixed inset-x-0 bottom-0']")
    ).filter((el) => {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.height > 0;
    });

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

        const intersects = !(r.right <= or.left || r.left >= or.right || r.bottom <= or.top || r.top >= or.bottom);
        if (intersects) {
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx >= 0 && cx <= window.innerWidth && cy >= 0 && cy <= window.innerHeight) {
            const topEl = document.elementFromPoint(cx, cy);
            if (topEl && (overlay === topEl || overlay.contains(topEl))) {
              occludedControls.push({
                text: (el.innerText || el.getAttribute("aria-label") || "").slice(0, 30).trim(),
                tag: el.tagName.toLowerCase(),
                targetRect: { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) },
                overlayClass: (overlay.className || "").toString().slice(0, 60),
                overlayTop: Math.round(or.top),
              });
            }
          }
        }
      }
    }

    const mainEl = document.querySelector(".app-main, main");
    const mainPaddingBottom = mainEl ? parseFloat(window.getComputedStyle(mainEl).paddingBottom) : 0;

    return {
      scrollWidth,
      innerWidth,
      hasOverflow,
      overflowingElements,
      totalInteractive: interactiveEls.length,
      smallTargetsCount: smallTargets.length,
      smallTargets: smallTargets.slice(0, 10),
      occludedControls,
      mainPaddingBottom,
    };
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    // Login as owner
    await page.goto(`${APP_ORIGIN}/auth/login`);
    await page.waitForSelector("form[data-auth-ready='true']", { timeout: 15000 });
    await page.locator("#login-email").fill(ownerAccount.email);
    await page.locator("#login-password").fill(ownerAccount.password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 20000 });

    // Navigate to /app/checklists with commit wait
    await page.goto(`${APP_ORIGIN}/app/checklists`, { waitUntil: "commit" });
    await page.waitForSelector("main", { timeout: 15000 });
    await page.waitForTimeout(2000); // allow hydration

    const data = await inspectPage(page);
    results.push({
      viewport: vp.name,
      width: vp.width,
      height: vp.height,
      route: "/app/checklists",
      actualPath: "/app/checklists",
      currentUrl: page.url(),
      ...data,
    });
    console.log(`[${vp.name}] /app/checklists -> Overflow: ${data.hasOverflow ? 'FAIL' : 'PASS'} (scrollWidth: ${data.scrollWidth}, innerWidth: ${data.innerWidth}), SmallTargets: ${data.smallTargetsCount}/${data.totalInteractive}, Occluded: ${data.occludedControls.length}`);

    await context.close();
  }

  await browser.close();

  // Merge into tooling/adversarial-viewport-results.json
  const jsonPath = resolve(process.cwd(), "tooling/adversarial-viewport-results.json");
  if (existsSync(jsonPath)) {
    const existing = JSON.parse(readFileSync(jsonPath, "utf8"));
    const updated = existing.map((entry) => {
      if (entry.route === "/app/checklists") {
        const found = results.find((r) => r.viewport === entry.viewport);
        if (found) {
          return { ...found };
        }
      }
      return entry;
    });
    const fs = await import("node:fs");
    fs.writeFileSync(jsonPath, JSON.stringify(updated, null, 2), "utf8");
    console.log("Successfully updated tooling/adversarial-viewport-results.json with complete /app/checklists data.");
  }
}

run().catch((e) => {
  console.error("Checklists probe failed:", e);
  process.exit(1);
});
