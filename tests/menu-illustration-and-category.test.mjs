import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

test("Menu Illustration & Category Customization Verification", async (t) => {
  await t.test("DrinkVisual exports detectDrinkVisualType and identifies categories correctly", async () => {
    const drinkVisualSrc = fs.readFileSync(path.join(rootDir, "components/order/drink-visual.tsx"), "utf8");

    // Must export detectDrinkVisualType
    assert.match(drinkVisualSrc, /export function detectDrinkVisualType/, "DrinkVisual must export detectDrinkVisualType");

    // Must have SVG cartoon illustrations for coffee, tea, milk_tea, topping
    assert.match(drinkVisualSrc, /aria-label="Minh họa Cà phê"/, "DrinkVisual must have coffee SVG illustration");
    assert.match(drinkVisualSrc, /aria-label="Minh họa Trà tươi"/, "DrinkVisual must have tea SVG illustration");
    assert.match(drinkVisualSrc, /aria-label="Minh họa Trà sữa"/, "DrinkVisual must have milk tea SVG illustration");
    assert.match(drinkVisualSrc, /aria-label="Minh họa Topping"/, "DrinkVisual must have topping SVG illustration");
  });

  await t.test("Owner Modal: Image URL input field is removed and Live Preview is present", async () => {
    const ownerSrc = fs.readFileSync(path.join(rootDir, "components/operational/owner-orders-view.tsx"), "utf8");

    // The legacy input field 'id="item-image"' must be removed
    assert.doesNotMatch(ownerSrc, /id="item-image"/, "id='item-image' input field must be completely removed");
    assert.doesNotMatch(ownerSrc, /Đường dẫn ảnh đồ uống<\/label>/, "Label 'Đường dẫn ảnh đồ uống' must be removed");

    // Live preview must be rendered
    assert.match(ownerSrc, /Mẫu ảnh hoạt họa tự động/, "Live preview badge must be rendered in modal");
    assert.match(ownerSrc, /<DrinkVisual\s+name=\{itemFormData\.name\}/, "Live preview must use DrinkVisual with itemFormData.name");
  });

  await t.test("Owner Modal: Category customization allows adding new category inline", async () => {
    const ownerSrc = fs.readFileSync(path.join(rootDir, "components/operational/owner-orders-view.tsx"), "utf8");

    // Must have option to add new category in select
    assert.match(ownerSrc, /value="__new_category__">[\s\S]*?\+ Thêm danh mục mới\.\.\.<\/option>/, "Dropdown must contain '+ Thêm danh mục mới...' option");

    // Must have inline quick creation handler
    assert.match(ownerSrc, /handleCreateCategory/, "Must define handleCreateCategory function");
    assert.match(ownerSrc, /type:\s*"category"/, "handleCreateCategory must send body.type = 'category'");
  });

  await t.test("Backend API: /api/owner/menu handles category creation and optional imageUrl", async () => {
    const apiSrc = fs.readFileSync(path.join(rootDir, "app/api/owner/menu/route.ts"), "utf8");

    // Must handle body.type === "category"
    assert.match(apiSrc, /body\.type === "category"/, "POST /api/owner/menu must handle body.type === 'category'");
    assert.match(apiSrc, /INSERT INTO menu_categories/, "POST /api/owner/menu must insert into menu_categories");

    // parseItem must not require imageUrl
    assert.match(apiSrc, /imageUrl" && \(value === undefined || value === ""\)/, "parseItem must allow missing/empty imageUrl");
  });
});
