import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  detectItemPreset,
  matchesMenuFilter,
  getPresetCounts,
  normalizeMenuText,
  MENU_FILTER_PRESETS,
} from "../lib/menu-filter.ts";

test("MENU_FILTER_PRESETS contains all required groups", () => {
  const ids = MENU_FILTER_PRESETS.map((p) => p.id);
  assert.deepEqual(ids, ["all", "coffee", "tea", "milk_tea", "topping"]);
});

test("normalizeMenuText strips accents and punctuation cleanly", () => {
  assert.equal(normalizeMenuText("Cà Phê Sữa Đá!"), "ca phe sua da");
  assert.equal(normalizeMenuText("Trà Sữa Ô Long"), "tra sua o long");
  assert.equal(normalizeMenuText("Trân Châu Đen"), "tran chau den");
});

test("detectItemPreset identifies coffee items accurately", () => {
  assert.equal(detectItemPreset({ name: "Cà Phê Đen" }), "coffee");
  assert.equal(detectItemPreset({ name: "Cà Phê Sữa Đá" }), "coffee");
  assert.equal(detectItemPreset({ name: "Bạc Xỉu" }), "coffee");
  assert.equal(detectItemPreset({ name: "Cà Phê Muối" }), "coffee");
  assert.equal(detectItemPreset({ name: "Cold Brew Cam Vàng" }), "coffee");
  assert.equal(detectItemPreset({ name: "Espresso Con Panna" }), "coffee");
  assert.equal(detectItemPreset({ name: "Americano Đá" }), "coffee");
  assert.equal(detectItemPreset({ name: "Latte Hạnh Nhân" }), "coffee");
  assert.equal(detectItemPreset({ name: "Món Mới", english_name: "Hot Latte" }), "coffee");
  assert.equal(detectItemPreset({ name: "Món Signature", category_id: "c1" }, "Cà Phê"), "coffee");
});

test("detectItemPreset identifies milk tea items accurately", () => {
  assert.equal(detectItemPreset({ name: "Ô Long Sữa" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Ô Long Nhài Sữa" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Gạo Khói" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Ô Long Sữa Hoa Dành Dành" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Ô Long Nướng" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Matcha Săn Mây" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Sữa Dừa Tuyết Mây" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Bồng Bềnh" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Nhài Bồng Bềnh" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Gạo Khói Bồng Bềnh" }), "milk_tea");
  assert.equal(detectItemPreset({ name: "Special Tea", category_id: "c2" }, "Trà Sữa"), "milk_tea");
});

test("detectItemPreset identifies tea items accurately", () => {
  assert.equal(detectItemPreset({ name: "Ô Long / Nhài / Dành Dành Nguyên Vị" }), "tea");
  assert.equal(detectItemPreset({ name: "Dành Dành Thanh Mai" }), "tea");
  assert.equal(detectItemPreset({ name: "Ô Long Mơ Xanh" }), "tea");
  assert.equal(detectItemPreset({ name: "Ô Long Dành Dành Chanh Hoa" }), "tea");
  assert.equal(detectItemPreset({ name: "Ô Long Chanh Quế Hoa" }), "tea");
  assert.equal(detectItemPreset({ name: "Hoa Hồng Đông Phương" }), "tea");
  assert.equal(detectItemPreset({ name: "Mộc Sương" }), "tea");
  assert.equal(detectItemPreset({ name: "Ô Long Bưởi Chanh Vàng" }), "tea");
  assert.equal(detectItemPreset({ name: "Boong Đỏ" }), "tea");
  assert.equal(detectItemPreset({ name: "Trà Đào Cam Sả" }), "tea");
  assert.equal(detectItemPreset({ name: "Trà Vải Hoa Hồng" }), "tea");
  assert.equal(detectItemPreset({ name: "Fresh Brew", category_id: "c3" }, "Trà Hoa Quả"), "tea");
});

test("detectItemPreset identifies topping items accurately", () => {
  assert.equal(detectItemPreset({ name: "Trân Châu Ô Long (Phần rời)" }), "topping");
  assert.equal(detectItemPreset({ name: "Phô Mai Bồng Bềnh (Cup riêng)" }), "topping");
  assert.equal(detectItemPreset({ name: "Thạch Củ Năng Giòn" }), "topping");
  assert.equal(detectItemPreset({ name: "Trân Châu Trắng" }), "topping");
  assert.equal(detectItemPreset({ name: "Hũ Kem Trứng Thêm", category_id: "c4" }, "Topping"), "topping");
});

test("matchesMenuFilter filters by preset and search query correctly", () => {
  const sampleItems = [
    { id: "1", name: "Cà Phê Muối", category_id: "cat-cp", description: "Kem muối béo ngậy" },
    { id: "2", name: "Ô Long Sữa", category_id: "cat-ts", description: "Trà sữa đậm vị" },
    { id: "3", name: "Dành Dành Thanh Mai", category_id: "cat-tra", description: "Trà thanh mai chua ngọt" },
    { id: "4", name: "Trân Châu Ô Long (Phần rời)", category_id: "cat-top", description: "Topping dẻo giòn" },
  ];

  const catNames = {
    "cat-cp": "Cà Phê",
    "cat-ts": "Trà Sữa",
    "cat-tra": "Trà Hoa Quả",
    "cat-top": "Topping",
  };

  // Filter: all
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "all")).length, 4);

  // Filter: coffee
  const coffeeItems = sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "coffee"));
  assert.equal(coffeeItems.length, 1);
  assert.equal(coffeeItems[0].name, "Cà Phê Muối");

  // Filter: milk_tea
  const milkTeaItems = sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "milk_tea"));
  assert.equal(milkTeaItems.length, 1);
  assert.equal(milkTeaItems[0].name, "Ô Long Sữa");

  // Filter: tea
  const teaItems = sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "tea"));
  assert.equal(teaItems.length, 1);
  assert.equal(teaItems[0].name, "Dành Dành Thanh Mai");

  // Filter: topping
  const toppingItems = sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "topping"));
  assert.equal(toppingItems.length, 1);
  assert.equal(toppingItems[0].name, "Trân Châu Ô Long (Phần rời)");

  // Filter with search query
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "all", "muối")).length, 1);
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "all", "béo ngậy")).length, 1);
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "all", "chua")).length, 1);
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "all", "khong-co")).length, 0);

  // Combination: preset coffee + search "muối" -> 1 match
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "coffee", "muối")).length, 1);
  // Combination: preset tea + search "muối" -> 0 match
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "tea", "muối")).length, 0);

  // Specific category ID match
  assert.equal(sampleItems.filter((i) => matchesMenuFilter(i, catNames[i.category_id], "cat-cp")).length, 1);
});

test("getPresetCounts computes accurate category totals", () => {
  const sampleItems = [
    { id: "1", name: "Cà Phê Đen", category_id: "c-cp" },
    { id: "2", name: "Cà Phê Sữa", category_id: "c-cp" },
    { id: "3", name: "Ô Long Sữa", category_id: "c-ts" },
    { id: "4", name: "Matcha Săn Mây", category_id: "c-ts" },
    { id: "5", name: "Dành Dành Thanh Mai", category_id: "c-tr" },
    { id: "6", name: "Trân Châu Ô Long", category_id: "c-tp" },
  ];
  const categories = [
    { id: "c-cp", name: "Cà phê" },
    { id: "c-ts", name: "Trà sữa" },
    { id: "c-tr", name: "Trà hoa quả" },
    { id: "c-tp", name: "Topping" },
  ];

  const counts = getPresetCounts(sampleItems, categories);
  assert.equal(counts.all, 6);
  assert.equal(counts.coffee, 2);
  assert.equal(counts.milk_tea, 2);
  assert.equal(counts.tea, 1);
  assert.equal(counts.topping, 1);
});

test("getPresetCounts includes optionsCount in all and topping totals", () => {
  const sampleItems = [
    { id: "1", name: "Cà Phê Đen", category_id: "c-cp" },
    { id: "2", name: "Trà Đào", category_id: "c-tr" },
  ];
  const categories = [
    { id: "c-cp", name: "Cà phê" },
    { id: "c-tr", name: "Trà hoa quả" },
  ];

  const counts = getPresetCounts(sampleItems, categories, 4);
  assert.equal(counts.all, 6); // 2 drinks + 4 toppings
  assert.equal(counts.coffee, 1);
  assert.equal(counts.tea, 1);
  assert.equal(counts.topping, 4);
});

test("customer ordering page search and filtering adheres to minimalist, emoji-free, brand-green design rules", async () => {
  const source = await readFile(
    new URL("../components/order/customer-order-page.tsx", import.meta.url),
    "utf8",
  );

  // 1. No emojis in primary category tabs or empty state or topping showcase
  assert.doesNotMatch(source, /preset\.icon/);
  assert.doesNotMatch(source, /☕🍃/);
  assert.doesNotMatch(source, /🍮/);

  // 2. No count badge spans inside category tabs
  assert.doesNotMatch(source, /\{count\}/);

  // 3. Consistent brand olive green accent for active filters
  assert.match(source, /bg-\[#2B3E2D\] text-white/);
  assert.match(source, /border-\[#3D5A40\]/);

  // 4. Compact single-row horizontal tablist
  assert.match(source, /role="tablist"/);
  assert.match(source, /overflow-x-auto/);

  // 5. Contextual subtle category dropdown only when availableCategories.length > 1
  assert.match(source, /availableCategories\.length > 1/);
  assert.match(source, /aria-label="Lọc theo nhóm món"/);

  // 6. Real product availability logic: hide empty customer-facing categories
  assert.match(source, /availableCategories = useMemo/);
  assert.match(source, /availablePresets = useMemo/);
});

