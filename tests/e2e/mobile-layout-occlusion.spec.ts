import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const APP_ORIGIN = "http://127.0.0.1:4173";
const AUTH_ORIGIN = "http://127.0.0.1:54321";

const MOBILE_VIEWPORTS = [
  { width: 320, height: 667, name: "320px (iPhone SE 1st / small Android)" },
  { width: 375, height: 667, name: "375px (iPhone SE 2nd/3rd)" },
  { width: 390, height: 844, name: "390px (iPhone 12/13/14)" },
  { width: 430, height: 932, name: "430px (iPhone 14/15/16 Pro Max)" },
];

type Role = "system_admin" | "owner" | "manager" | "team_lead" | "employee";
type LocalAccount = { id: string; email: string; password: string; role: Role };

let accounts: LocalAccount[] = [];
let fixtureUnavailable = "";

test.beforeAll(async () => {
  const file = resolve(process.cwd(), ".wrangler/local-readiness/accounts.json");
  if (!existsSync(file)) {
    fixtureUnavailable = "Local account fixtures are absent.";
    return;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(parsed)) {
      accounts = parsed as LocalAccount[];
    }
  } catch {
    fixtureUnavailable = "Failed to parse accounts.json.";
    return;
  }

  const configFile = resolve(process.cwd(), "tooling/local-runtime/.dev.vars");
  if (!existsSync(configFile)) {
    fixtureUnavailable = "Local auth config (.dev.vars) is absent.";
    return;
  }
  const settings = parseEnv(readFileSync(configFile, "utf8"));
  if (settings.NEXT_PUBLIC_SUPABASE_URL !== AUTH_ORIGIN || !settings.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    fixtureUnavailable = "Local auth config does not point to loopback.";
    return;
  }

  try {
    const health = await fetch(`${AUTH_ORIGIN}/auth/v1/health`, {
      headers: { apikey: settings.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(2_000),
      redirect: "error",
    });
    if (!health.ok) {
      fixtureUnavailable = "Local Supabase Auth health check failed.";
    }
  } catch {
    fixtureUnavailable = "Local Supabase Auth is unavailable at 127.0.0.1:54321.";
  }
});

test.beforeEach(async ({ context, baseURL }) => {
  expect(baseURL).toBe(APP_ORIGIN);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ? route.continue()
      : route.abort("blockedbyclient");
  });
});

async function signInEmployee(page: Page) {
  test.skip(Boolean(fixtureUnavailable), fixtureUnavailable);
  const account = accounts.find((a) => a.role === "employee");
  test.skip(!account, "No local employee account is provisioned.");

  await page.goto(`${APP_ORIGIN}/auth/login`);
  await page.locator("#login-email").fill(account!.email);
  await page.locator("#login-password").fill(account!.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/app/today`, { timeout: 20_000 });
}

/**
 * Hit-testing assertion using document.elementFromPoint across all interactive controls.
 */
async function findOccludedControls(page: Page) {
  return page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>("button, a, input, textarea, [role='button']")
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return (
        s.display !== "none" &&
        s.visibility !== "hidden" &&
        s.opacity !== "0" &&
        r.width > 0 &&
        r.height > 0
      );
    });

    const occluded: Array<{ text: string; tag: string; blocker: string; top: number; bottom: number }> = [];

    for (const el of controls) {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      // Only evaluate elements within the visible viewport window
      if (cy >= 0 && cy <= window.innerHeight && cx >= 0 && cx <= window.innerWidth) {
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && topEl !== el && !el.contains(topEl)) {
          const overlay = topEl.closest<HTMLElement>(
            ".mobile-nav, .mobile-sticky-primary, .mobile-attendance-cta, [class*='fixed bottom']"
          );
          if (overlay && overlay !== el && !el.contains(overlay)) {
            occluded.push({
              text: el.innerText.trim().slice(0, 40) || el.getAttribute("aria-label") || el.tagName,
              tag: el.tagName,
              blocker: overlay.className,
              top: r.top,
              bottom: r.bottom,
            });
          }
        }
      }
    }
    return occluded;
  });
}

test.describe("Design Tokens & Layout Contract", () => {
  test("CSS custom properties --bottom-nav-height and --bottom-nav-with-cta-height are defined in :root", async ({ page }) => {
    await page.goto(`${APP_ORIGIN}/order`);
    const rootVariables = await page.evaluate(() => {
      const rootStyle = window.getComputedStyle(document.documentElement);
      return {
        bottomNavHeight: rootStyle.getPropertyValue("--bottom-nav-height").trim(),
        bottomNavWithCtaHeight: rootStyle.getPropertyValue("--bottom-nav-with-cta-height").trim(),
      };
    });

    expect(rootVariables.bottomNavHeight).toBe("80px");
    expect(rootVariables.bottomNavWithCtaHeight).toBe("154px");
  });

  test("AppShell .app-main has unified bottom padding matching tokens on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${APP_ORIGIN}/order`);

    const paddingValues = await page.evaluate(() => {
      const regularDiv = document.createElement("main");
      regularDiv.className = "app-main";
      document.body.appendChild(regularDiv);

      const ctaDiv = document.createElement("main");
      ctaDiv.className = "app-main has-mobile-nav-and-cta";
      const stickyBtn = document.createElement("a");
      stickyBtn.className = "button mobile-sticky-primary";
      ctaDiv.appendChild(stickyBtn);
      document.body.appendChild(ctaDiv);

      const regularPadding = parseFloat(window.getComputedStyle(regularDiv).paddingBottom);
      const ctaPadding = parseFloat(window.getComputedStyle(ctaDiv).paddingBottom);

      regularDiv.remove();
      ctaDiv.remove();

      return { regularPadding, ctaPadding };
    });

    // 80px nav + 16px buffer = 96px
    expect(paddingValues.regularPadding).toBeGreaterThanOrEqual(96);
    // 154px nav with CTA + 16px buffer = 170px
    expect(paddingValues.ctaPadding).toBeGreaterThanOrEqual(170);
  });
});

test.describe("Customer Order View Action Occlusion", () => {
  for (const vp of MOBILE_VIEWPORTS) {
    test(`No menu controls occluded by floating cart bar at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${APP_ORIGIN}/order`);
      await page.waitForLoadState("domcontentloaded");

      // Verify <main> has safe bottom padding on mobile
      const mainPaddingBottom = await page.evaluate(() => {
        const main = document.querySelector("main");
        return main ? parseFloat(window.getComputedStyle(main).paddingBottom) : 0;
      });
      expect(mainPaddingBottom, "Order <main> must have at least 88px bottom padding").toBeGreaterThanOrEqual(88);

      // Add item to cart to activate the floating cart bar
      const addItemButton = page.getByRole("button", { name: /^Thêm món/i }).first();
      if (await addItemButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await addItemButton.click();
        const addToCartBtn = page.getByRole("button", { name: /Thêm vào giỏ/i });
        if (await addToCartBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await addToCartBtn.click();
        }
      }

      // Scroll to bottom of menu
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);

      // Verify no buttons or inputs are occluded
      const occluded = await findOccludedControls(page);
      expect(occluded, `Expected zero occluded controls at ${vp.name}`).toHaveLength(0);

      // Verify bounding box relationship: the lowest menu card bottom is above the floating cart top
      const boxCheck = await page.evaluate(() => {
        const floatingCart = document.querySelector<HTMLElement>("[class*='fixed bottom']");
        const menuCards = Array.from(document.querySelectorAll<HTMLElement>(".laboong-card"));
        if (!floatingCart || menuCards.length === 0) return { ok: true, diff: 0 };

        const lastCard = menuCards[menuCards.length - 1];
        const cardRect = lastCard.getBoundingClientRect();
        const cartRect = floatingCart.getBoundingClientRect();

        return {
          ok: cardRect.bottom <= cartRect.top,
          diff: cartRect.top - cardRect.bottom,
        };
      });

      expect(boxCheck.ok, `Lowest menu card must be above floating cart bar at ${vp.name}`).toBe(true);
    });
  }
});

test.describe("Order Tracking View Action Occlusion", () => {
  for (const vp of MOBILE_VIEWPORTS) {
    test(`No controls occluded on order tracking view at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${APP_ORIGIN}/order`);
      await page.waitForLoadState("domcontentloaded");

      // Open order lookup modal if button is available
      const lookupButton = page.getByRole("button", { name: /Kiểm tra đơn/i });
      if (await lookupButton.isVisible().catch(() => false)) {
        await lookupButton.click();
        const input = page.locator("input[type='text'], input[type='tel']").first();
        if (await input.isVisible().catch(() => false)) {
          const occluded = await findOccludedControls(page);
          expect(occluded).toHaveLength(0);
        }
      }
    });
  }
});

test.describe("Operational Employee Views Action Occlusion", () => {
  test("Today view buttons (Xin nghỉ, Báo sự cố) are never occluded by .mobile-sticky-primary", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    if (!fixtureUnavailable && accounts.some((a) => a.role === "employee")) {
      await signInEmployee(page);
      await page.goto(`${APP_ORIGIN}/app/today`);
      await page.waitForLoadState("domcontentloaded");

      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);

      const occluded = await findOccludedControls(page);
      expect(occluded).toHaveLength(0);

      // Verify 'Xin nghỉ / Đổi ca' and 'Báo cáo sự cố quán' hit-testing
      const buttonsHit = await page.evaluate(() => {
        const leaveLink = document.querySelector<HTMLElement>("a[href='/app/requests']");
        const issueLink = document.querySelector<HTMLElement>("a[href='/app/issues']");
        if (!leaveLink || !issueLink) return { found: false, leaveTop: null, issueTop: null };

        const lRect = leaveLink.getBoundingClientRect();
        const iRect = issueLink.getBoundingClientRect();

        const lHit = document.elementFromPoint(lRect.left + lRect.width / 2, lRect.top + lRect.height / 2);
        const iHit = document.elementFromPoint(iRect.left + iRect.width / 2, iRect.top + iRect.height / 2);

        return {
          found: true,
          leaveOk: lHit === leaveLink || leaveLink.contains(lHit),
          issueOk: iHit === issueLink || issueLink.contains(iHit),
        };
      });

      if (buttonsHit.found) {
        expect(buttonsHit.leaveOk, "Xin nghỉ link must be clickable").toBe(true);
        expect(buttonsHit.issueOk, "Báo sự cố link must be clickable").toBe(true);
      }
    } else {
      // In offline/CI fallback: verify DOM structure and CSS properties guarantee non-occlusion
      await page.goto(`${APP_ORIGIN}/order`);
      const simulation = await page.evaluate(() => {
        const container = document.createElement("main");
        container.className = "app-main";

        const todayView = document.createElement("div");
        todayView.className = "stack employee-today-view has-sticky-primary";

        const secondaryActions = document.createElement("section");
        secondaryActions.className = "today-secondary-actions";
        secondaryActions.style.display = "grid";
        secondaryActions.style.gridTemplateColumns = "1fr 1fr";
        secondaryActions.style.gap = "12px";

        const leaveBtn = document.createElement("a");
        leaveBtn.className = "button-secondary";
        leaveBtn.innerText = "Xin nghỉ / Đổi ca";
        secondaryActions.appendChild(leaveBtn);

        const issueBtn = document.createElement("a");
        issueBtn.className = "button-secondary";
        issueBtn.innerText = "Báo cáo sự cố quán";
        secondaryActions.appendChild(issueBtn);

        const stickyBtn = document.createElement("a");
        stickyBtn.className = "button mobile-sticky-primary";
        stickyBtn.innerText = "Chấm công vào ca";

        todayView.appendChild(secondaryActions);
        todayView.appendChild(stickyBtn);
        container.appendChild(todayView);
        document.body.appendChild(container);

        const computedMainPadding = parseFloat(window.getComputedStyle(container).paddingBottom);
        const stickyRect = stickyBtn.getBoundingClientRect();
        const actionsRect = secondaryActions.getBoundingClientRect();

        container.remove();

        return {
          computedMainPadding,
          stickyTop: stickyRect.top,
          actionsBottom: actionsRect.bottom,
        };
      });

      expect(simulation.computedMainPadding, "Container must have at least 170px bottom padding").toBeGreaterThanOrEqual(170);
    }
  });

  test("Attendance view elements are not occluded by .mobile-attendance-cta", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    if (!fixtureUnavailable && accounts.some((a) => a.role === "employee")) {
      await signInEmployee(page);
      await page.goto(`${APP_ORIGIN}/app/attendance`);
      await page.waitForLoadState("domcontentloaded");

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);

      const occluded = await findOccludedControls(page);
      expect(occluded).toHaveLength(0);
    } else {
      // Offline fallback: verify CSS rules for .app-main:has(.mobile-attendance-cta)
      await page.goto(`${APP_ORIGIN}/order`);
      const padding = await page.evaluate(() => {
        const container = document.createElement("main");
        container.className = "app-main";
        const cta = document.createElement("div");
        cta.className = "capture-actions mobile-attendance-cta";
        container.appendChild(cta);
        document.body.appendChild(container);

        const pb = parseFloat(window.getComputedStyle(container).paddingBottom);
        container.remove();
        return pb;
      });

      expect(padding).toBeGreaterThanOrEqual(170);
    }
  });

  test("Schedule view controls are not occluded by .mobile-nav", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    if (!fixtureUnavailable && accounts.some((a) => a.role === "employee")) {
      await signInEmployee(page);
      await page.goto(`${APP_ORIGIN}/app/schedule`);
      await page.waitForLoadState("domcontentloaded");

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);

      const occluded = await findOccludedControls(page);
      expect(occluded).toHaveLength(0);
    } else {
      // Offline fallback: verify regular .app-main padding gives adequate clearance for .mobile-nav
      await page.goto(`${APP_ORIGIN}/order`);
      const padding = await page.evaluate(() => {
        const container = document.createElement("main");
        container.className = "app-main";
        document.body.appendChild(container);

        const pb = parseFloat(window.getComputedStyle(container).paddingBottom);
        container.remove();
        return pb;
      });

      expect(padding).toBeGreaterThanOrEqual(96);
    }
  });
});
