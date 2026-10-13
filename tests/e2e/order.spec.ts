import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:4173";
const orderPayload = {
  customerName: "Local Order QA", customerPhone: "0901234567", customerNote: "Local test only",
  items: [{ itemId: "local-coffee", quantity: 2, sizeId: "local-size-l", sugarId: "local-sugar", iceId: "local-ice", toppingIds: ["local-topping"], note: "" }],
};

test.beforeEach(async ({ context, baseURL }) => {
  expect(baseURL).toBe(origin);
  // A broken local page must never send fixtures or requests to remote services.
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? route.continue() : route.abort("blockedbyclient");
  });
});

async function ensureMenu(request: APIRequestContext) {
  const response = await request.get(`${origin}/api/order/menu`);
  expect(response.ok()).toBeTruthy();
  const menu = await response.json();
  expect(menu.items.some((item: { id: string }) => item.id === "local-coffee")).toBeTruthy();
  expect(menu.store.isOrderingOpen).toBe(true);
}

test("local HTTP checkout calculates canonical prices, replays safely and hides phone history", async ({ request }) => {
  await ensureMenu(request);
  const receipt = randomBytes(32).toString("hex");
  const headers = { Origin: origin, "Idempotency-Key": randomUUID(), "X-Order-Receipt": receipt };
  const submitted = { ...orderPayload, items: [{ ...orderPayload.items[0], price: 1, name: "Forged price" }] };
  const response = await request.post(`${origin}/api/order/create`, { headers, data: submitted });
  expect(response.status()).toBe(201);
  const created = await response.json();
  expect(created.order.totalAmount).toBe(92000);
  const replay = await request.post(`${origin}/api/order/create`, { headers, data: submitted });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).order.id).toBe(created.order.id);
  const conflict = await request.post(`${origin}/api/order/create`, { headers, data: { ...submitted, customerNote: "Different content" } });
  expect(conflict.status()).toBe(409);
  const leaked = await request.get(`${origin}/api/order/track?phone=0901234567&code=${created.order.orderCode}`);
  expect(leaked.status()).toBe(404);
  const tracked = await request.get(`${origin}/api/order/track`, { headers: { "X-Order-Receipt": receipt } });
  expect(tracked.status()).toBe(200);
  expect(tracked.headers()["cache-control"]).toContain("no-store");
  const detail = await tracked.json();
  expect(detail.order.id).toBe(created.order.id);
  expect(detail.orders).toBeUndefined();
  expect(detail.items[0].name).toBe("Cà phê sữa");
  expect(detail.items[0].unitPrice).toBe(46000);
  const wrong = await request.get(`${origin}/api/order/track`, { headers: { "X-Order-Receipt": randomBytes(32).toString("hex") } });
  expect(wrong.status()).toBe(404);
});

async function fillCheckout(page: Page) {
  await page.goto("/order");
  await page.getByRole("button", { name: "Thêm món Cà phê sữa", exact: true }).click();
  await page.getByRole("button", { name: /^L\s/ }).first().click();
  await page.getByRole("button", { name: /Trân châu/ }).first().click();
  await page.getByRole("button", { name: /Thêm vào giỏ/ }).first().click();
  await page.getByRole("button", { name: "Xem giỏ hàng", exact: true }).first().click();
  await page.locator("#customer-name").fill("Local Browser QA");
  await page.locator("#customer-phone").fill("0901234567");
}

test("browser checkout recovers a committed order after a lost response without creating another", async ({ page, request }) => {
  test.setTimeout(90000);
  await ensureMenu(request);
  let committedId = "";
  await page.route("**/api/order/create", async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    committedId = (await response.json()).order.id;
    await route.abort("failed");
  }, { times: 1 });
  await fillCheckout(page);
  await page.getByRole("button", { name: "Xác nhận đặt hàng", exact: true }).click();
  await expect.poll(() => committedId, { timeout: 15000 }).not.toBe("");
  await expect(page.getByRole("button", { name: "Xác nhận đặt hàng", exact: true })).toBeEnabled({ timeout: 15000 });
  await page.getByRole("button", { name: "Đóng giỏ hàng", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kiểm tra / gửi lại đơn đang chờ", exact: true })).toBeVisible({ timeout: 15000 });
  // Reload proves the retry credentials survive an interrupted browser session.
  await page.reload();
  const replayResponse = page.waitForResponse(response => response.url().endsWith("/api/order/create") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Kiểm tra / gửi lại đơn đang chờ", exact: true }).click();
  const replay = await replayResponse;
  expect(replay.status()).toBe(200);
  const recovered = await replay.json();
  expect(recovered.replayed).toBe(true);
  expect(recovered.order.id).toBe(committedId);
  await expect(page).toHaveURL(/\/order#receipt=[a-f0-9]{64}$/);
  await expect(page.getByRole("heading", { name: recovered.order.orderCode, exact: true })).toBeVisible();
  await expect(page.getByText(/46\.000\s*đ/).last()).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("laboong_pending_order_v1"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: recovered.order.orderCode, exact: true })).toBeVisible({ timeout: 15000 });
});

test("public caller cannot read or mutate owner endpoints", async ({ request }) => {
  for (const path of ["/api/owner/orders", "/api/owner/menu", "/api/owner/store-status"]) {
    expect((await request.get(`${origin}${path}`)).status()).toBe(401);
  }
  const response = await request.patch(`${origin}/api/owner/orders/unknown/status`, { headers: { Origin: origin }, data: { expectedStatus: "pending", newStatus: "accepted" } });
  expect(response.status()).toBe(401);
});
