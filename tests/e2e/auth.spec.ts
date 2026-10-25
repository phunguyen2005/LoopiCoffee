import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const APP_ORIGIN = "http://127.0.0.1:4173";
const AUTH_ORIGIN = "http://127.0.0.1:54321";
type Role = "system_admin" | "owner" | "manager" | "team_lead" | "employee";
type LocalAccount = { id: string; email: string; password: string; role: Role };

// Local passwords and session cookies must not be captured in trace artifacts.
test.use({ trace: "off", video: "off", screenshot: "off" });
// Logout invalidates provider sessions; keep shared fixture accounts sequential.
test.describe.configure({ mode: "default" });

let accounts: LocalAccount[] = [];
let fixtureUnavailable = "";
const blockedHosts = new WeakMap<Page, string[]>();

test.beforeAll(async () => {
  const file = resolve(process.cwd(), ".wrangler/local-readiness/accounts.json");
  if (!existsSync(file)) {
    fixtureUnavailable = "Local account fixtures are absent. Run local:auth:start and local:provision; cloud authentication is forbidden.";
    return;
  }
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(parsed) || parsed.some((account) => !account ||
    typeof account.id !== "string" || !account.id.startsWith("local-") ||
    typeof account.email !== "string" || !account.email.endsWith("@loopicafe.test") ||
    typeof account.password !== "string" || account.password.length < 12 ||
    !["system_admin", "owner", "manager", "team_lead", "employee"].includes(account.role))) {
    throw new Error("Local account fixture format is invalid. Refusing to use unknown credentials.");
  }
  accounts = parsed as LocalAccount[];
  const configFile = resolve(process.cwd(), "tooling/local-runtime/.dev.vars");
  if (!existsSync(configFile)) {
    fixtureUnavailable = "Dedicated local Auth configuration is absent. Run local:auth:configure.";
    return;
  }
  const settings = parseEnv(readFileSync(configFile, "utf8"));
  if (settings.NEXT_PUBLIC_SUPABASE_URL !== AUTH_ORIGIN || !settings.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Auth smoke requires the dedicated loopback Auth URL and key; refusing another configuration.");
  }
  try {
    const health = await fetch(`${AUTH_ORIGIN}/auth/v1/health`, {
      headers: { apikey: settings.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(3_000), redirect: "error",
    });
    if (!health.ok) fixtureUnavailable = "Local Supabase Auth health check failed; authenticated tests cannot run.";
  } catch { fixtureUnavailable = "Local Supabase Auth is unavailable at 127.0.0.1:54321; authenticated tests cannot run."; }
});

test.beforeEach(async ({ page, baseURL }) => {
  expect(baseURL, "Auth smoke tests must never target a hosted application").toBe(APP_ORIGIN);
  const blocked: string[] = [];
  blockedHosts.set(page, blocked);
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      blocked.push(url.origin);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
});

test.afterEach(async ({ page }) => {
  expect(blockedHosts.get(page) ?? [], "A browser request tried to leave loopback and was blocked").toEqual([]);
});

function accountFor(role: Role) {
  test.skip(Boolean(fixtureUnavailable), fixtureUnavailable);
  const account = accounts.find((entry) => entry.role === role);
  test.skip(!account, `No local ${role} account is provisioned. This role has not been browser-verified.`);
  return account!;
}

async function signIn(page: Page, account: LocalAccount) {
  await page.goto(`${APP_ORIGIN}/auth/login`);
  await expect(page.locator("form[data-auth-ready]"))
    .toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(account.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const expectedPath = account.role === "system_admin" ? "/app/admin" : ["employee", "team_lead"].includes(account.role) ? "/app/today" : "/app";
  await expect(page, "Fixture login must reach the real authenticated application without a bypass").toHaveURL(`${APP_ORIGIN}${expectedPath}`, { timeout: 20_000 });
  const response = await page.request.get(`${APP_ORIGIN}/api/profile`, { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  const { user } = await response.json();
  expect(user.id).toBe(account.id);
  expect(user.role).toBe(account.role);
}

test("anonymous protected pages redirect to login and identity headers do not authenticate", async ({ page }) => {
  await page.goto(`${APP_ORIGIN}/app/team`);
  await expect(page).toHaveURL(`${APP_ORIGIN}/auth/login`);
  await expect(page.locator("#login-email")).toBeVisible();
  const response = await page.request.get(`${APP_ORIGIN}/api/admin/accounts`, {
    headers: { "oai-authenticated-user-email": "owner@loopicafe.test", "oai-authenticated-user-full-name": "Forged owner" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(401);
});

test("forgot-password link reaches a real recovery form", async ({ page }) => {
  await page.goto(`${APP_ORIGIN}/auth/login`);
  await page.getByRole("link", { name: "Quên mật khẩu?" }).click();
  await expect(page).toHaveURL(`${APP_ORIGIN}/auth/forgot-password`);
  await expect(page.getByRole("heading", { name: "Đặt lại mật khẩu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi liên kết đặt lại" })).toBeVisible();
});

test("invalid credentials show an error and do not create an app session", async ({ page }) => {
  const account = accountFor("owner");
  await page.goto(`${APP_ORIGIN}/auth/login`);
  await expect(page.locator("form[data-auth-ready]"))
    .toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill("Definitely-invalid-local-password-2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(`${APP_ORIGIN}/auth/login`);
  expect((await page.request.get(`${APP_ORIGIN}/api/profile`, { maxRedirects: 0 })).status()).toBe(401);
});

test("successful login shows accessible backend-linked progress before navigation", async ({ page }) => {
  const account = accountFor("owner");
  await page.route("**/api/auth/activate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.goto(`${APP_ORIGIN}/auth/login`);
  await expect(page.locator("form[data-auth-ready]"))
    .toHaveAttribute("data-auth-ready", "true", { timeout: 15_000 });
  await page.locator("#login-email").fill(account.email);
  await page.locator("#login-password").fill(account.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

  const progress = page.getByRole("progressbar", { name: "Tiến trình đăng nhập" });
  await expect(progress).toBeVisible({ timeout: 15_000 });
  await expect(progress).toHaveAttribute("aria-valuenow", "36");
  await expect(page.getByText("Đang kiểm tra quyền truy cập...", { exact: true })).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "100", { timeout: 15_000 });
  await expect(page.getByText("Đăng nhập thành công, đang mở không gian làm việc...", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${APP_ORIGIN}/app`, { timeout: 20_000 });
});

test("owner logs in, refreshes an authenticated page, and logs out through the UI", async ({ page }) => {
  await signIn(page, accountFor("owner"));
  await page.reload();
  await expect(page).toHaveURL(`${APP_ORIGIN}/app`);
  await page.getByTitle("Thông tin tài khoản", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Đăng xuất tài khoản" }).click();
  await expect(page.getByText("Đang đăng xuất an toàn...", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(`${APP_ORIGIN}/auth/login`, { timeout: 15_000 });
  expect((await page.request.get(`${APP_ORIGIN}/api/profile`, { maxRedirects: 0 })).status()).toBe(401);
});

for (const role of ["system_admin", "owner", "manager", "team_lead", "employee"] as const) {
  test(`${role} page access and API permissions agree`, async ({ page }) => {
    await signIn(page, accountFor(role));
    const managesAccounts = role === "system_admin";
    const managesPeople = ["owner", "manager"].includes(role);
    const ownsStore = role === "owner";
    const accountsResponse = await page.request.get(`${APP_ORIGIN}/api/admin/accounts`, { maxRedirects: 0 });
    expect(accountsResponse.status()).toBe(managesAccounts ? 200 : 403);
    if (managesAccounts) {
      const accountsPayload = await accountsResponse.json();
      expect(JSON.stringify(accountsPayload)).not.toMatch(/hourly_rate|monthly_salary|compensation_type|latitude|longitude|photo/i);
    }
    const auditResponse = await page.request.get(`${APP_ORIGIN}/api/audit`, { maxRedirects: 0 });
    expect(auditResponse.status()).toBe(ownsStore ? 200 : 403);
    const adminAuditResponse = await page.request.get(`${APP_ORIGIN}/api/admin/audit`, { maxRedirects: 0 });
    expect(adminAuditResponse.status()).toBe(role === "system_admin" ? 200 : 403);
    const rolesResponse = await page.request.get(`${APP_ORIGIN}/api/admin/roles`, { maxRedirects: 0 });
    expect(rolesResponse.status()).toBe(role === "system_admin" ? 200 : 403);
    if (role === "system_admin") {
      expect((await page.request.get(`${APP_ORIGIN}/api/owner/orders`, { maxRedirects: 0 })).status()).toBe(403);
    }
    await page.goto(`${APP_ORIGIN}/app/admin/accounts`);
    await expect(page).toHaveURL(`${APP_ORIGIN}${managesAccounts ? "/app/admin/accounts" : "/app"}`);
    if (managesAccounts) await expect(page.getByRole("heading", { name: "Quản trị tài khoản", exact: true }).first()).toBeVisible();
    await page.goto(`${APP_ORIGIN}/app/team`);
    await expect(page).toHaveURL(`${APP_ORIGIN}${managesPeople ? "/app/team" : role === "system_admin" ? "/app/admin" : "/app"}`);
    // A forged owner header must not elevate an existing staff/manager session.
    const profile = await page.request.get(`${APP_ORIGIN}/api/profile`, {
      headers: { "oai-authenticated-user-email": "owner@loopicafe.test" }, maxRedirects: 0,
    });
    expect((await profile.json()).user.role).toBe(role);
  });
}

test("admin UI keeps the single owner recoverable without offering a second owner", async ({ page }) => {
  await signIn(page, accountFor("system_admin"));
  const owner = accountFor("owner");
  await page.goto(`${APP_ORIGIN}/app/admin/accounts`);
  await expect(page.getByText(/Hiển thị \d+\/\d+ tài khoản/)).toBeVisible({ timeout: 15_000 });

  const duplicateOwner = await page.request.post(`${APP_ORIGIN}/api/admin/accounts`, {
    headers: { Origin: APP_ORIGIN },
    data: {
      email: "second.owner@loopicafe.test",
      displayName: "Owner thứ hai",
      role: "owner",
      activationMethod: "invite",
      mustChangePassword: true,
      reason: "Xác minh giới hạn một Owner",
      idempotencyKey: crypto.randomUUID(),
    },
    maxRedirects: 0,
  });
  expect(duplicateOwner.status()).toBe(409);
  expect((await duplicateOwner.json()).code).toBe("owner_limit");

  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "Tạo tài khoản đăng nhập" });
  const createOwnerOption = createDialog.locator('option[value="owner"]');
  await expect(createOwnerOption).toHaveAttribute("disabled", "");
  await expect(createOwnerOption).toHaveText("Chủ quán (đã có)");
  await expect(createDialog.getByText("Mỗi cửa hàng chỉ có một Chủ quán.", { exact: false })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.locator(".adm-row").filter({ hasText: owner.email }).click();
  const ownerDialog = page.getByRole("dialog");
  await expect(ownerDialog.getByLabel("Vai trò")).toBeDisabled();
  await expect(ownerDialog.getByLabel("Trạng thái").locator('option[value="suspended"]')).toHaveAttribute("disabled", "");
  await expect(ownerDialog.getByRole("button", { name: "Mật khẩu tạm" })).toBeVisible();
});

test("cookie-authenticated writes require the exact request origin", async ({ page }) => {
  await signIn(page, accountFor("employee"));
  const profile = await (await page.request.get(`${APP_ORIGIN}/api/profile`, { maxRedirects: 0 })).json();
  const disallowedHeaders: Record<string, string>[] = [
    { Origin: "https://untrusted.invalid" },
    {},
    { Origin: APP_ORIGIN, "Sec-Fetch-Site": "cross-site" },
  ];
  for (const headers of disallowedHeaders) {
    const response = await page.request.patch(`${APP_ORIGIN}/api/profile`, {
      headers, data: { displayName: profile.user.displayName }, maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  }
  // This reaches route validation but cannot mutate the profile.
  const sameOrigin = await page.request.patch(`${APP_ORIGIN}/api/profile`, {
    headers: { Origin: APP_ORIGIN }, data: { displayName: 42 }, maxRedirects: 0,
  });
  expect(sameOrigin.status()).toBe(400);
  const unchanged = await (await page.request.get(`${APP_ORIGIN}/api/profile`, { maxRedirects: 0 })).json();
  expect(unchanged.user.displayName).toBe(profile.user.displayName);
});
