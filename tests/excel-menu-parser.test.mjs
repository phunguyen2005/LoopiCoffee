import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeKeyword,
  autoDetectColumnMapping,
  parsePrice,
  parseCsvText,
  buildItemsFromSheetData,
  findHeaderRow,
} from "../lib/excel-menu-parser.ts";

test("normalizeKeyword cleans accents and special characters", () => {
  assert.equal(normalizeKeyword("Tên Món Ăn (bắt buộc)"), "ten mon an bat buoc");
  assert.equal(normalizeKeyword("Đơn giá niêm yết (VNĐ)"), "don gia niem yet vnd");
  assert.equal(normalizeKeyword("Nhóm thực đơn / Category"), "nhom thuc don category");
});

test("autoDetectColumnMapping detects non-standard headers accurately", () => {
  const customHeaders1 = ["STT", "Tên sản phẩm", "Đơn giá", "Nhóm món", "Ghi chú"];
  const mapping1 = autoDetectColumnMapping(customHeaders1);
  assert.equal(mapping1.name, 1);
  assert.equal(mapping1.basePrice, 2);
  assert.equal(mapping1.categoryName, 3);

  const customHeaders2 = ["Mã món", "Thức uống", "Tiền bán", "Phân loại", "Mô tả hương vị"];
  const mapping2 = autoDetectColumnMapping(customHeaders2);
  assert.equal(mapping2.name, 1);
  assert.equal(mapping2.basePrice, 2);
  assert.equal(mapping2.categoryName, 3);

  const customHeaders3 = ["STT", "Food & Drink", "VND", "Loại"];
  const mapping3 = autoDetectColumnMapping(customHeaders3);
  assert.equal(mapping3.name, 1);
  assert.equal(mapping3.basePrice, 2);
  assert.equal(mapping3.categoryName, 3);
});

test("parsePrice parses Vietnamese currency strings with dots, commas, suffix", () => {
  assert.equal(parsePrice(35000), 35000);
  assert.equal(parsePrice("35.000"), 35000);
  assert.equal(parsePrice("45,000 đ"), 45000);
  assert.equal(parsePrice("55.000 VND"), 55000);
  assert.equal(parsePrice("30k"), 30000);
  assert.equal(parsePrice(" 65 000 vnđ "), 65000);
  assert.equal(parsePrice(35), 35000); // cafe heuristic 35 -> 35k
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice("invalid"), null);
});

test("parseCsvText handles commas, quotes, and CRLF cleanly", () => {
  const csv = 'Tên món,Đơn giá,Nhóm\n"Cà Phê Muối",35000,Cà Phê\n"Ô Long Sữa",42000,Trà Sữa';
  const rows = parseCsvText(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["Tên món", "Đơn giá", "Nhóm"]);
  assert.deepEqual(rows[1], ["Cà Phê Muối", "35000", "Cà Phê"]);
  assert.deepEqual(rows[2], ["Ô Long Sữa", "42000", "Trà Sữa"]);
});

test("findHeaderRow & buildItemsFromSheetData parses heterogeneous table rows", () => {
  const rawSheet = [
    ["BẢNG BÁO GIÁ CỬA HÀNG LOOPICAFE"], // metadata row
    ["STT", "Tên món đồ uống", "Đơn giá niêm yết (VND)", "Danh mục món", "Mô tả"],
    ["1", "Cà Phê Muối", "32.000 đ", "Cà Phê", "Kem béo mặn nhẹ"],
    ["2", "Ô Long Sữa Săn Mây", "45000", "Trà Sữa", "Trà sữa đậm vị"],
    ["3", "Trân Châu Trắng", "10000", "Topping", "Giòn dai sần sật"],
  ];

  const { headerRowIndex, headers } = findHeaderRow(rawSheet);
  assert.equal(headerRowIndex, 1);
  assert.equal(headers[1], "Tên món đồ uống");

  const mapping = autoDetectColumnMapping(headers);
  assert.equal(mapping.name, 1);
  assert.equal(mapping.basePrice, 2);
  assert.equal(mapping.categoryName, 3);

  const { items, detectedCategories } = buildItemsFromSheetData(rawSheet, headerRowIndex, mapping);
  assert.equal(items.length, 3);
  assert.equal(items.filter((i) => i.isValid).length, 3);

  assert.equal(items[0].name, "Cà Phê Muối");
  assert.equal(items[0].basePrice, 32000);
  assert.equal(items[0].categoryName, "Cà Phê");

  assert.equal(items[1].name, "Ô Long Sữa Săn Mây");
  assert.equal(items[1].basePrice, 45000);
  assert.equal(items[1].categoryName, "Trà Sữa");

  assert.equal(items[2].name, "Trân Châu Trắng");
  assert.equal(items[2].basePrice, 10000);
  assert.equal(items[2].categoryName, "Topping");

  assert.deepEqual(detectedCategories.sort(), ["Cà Phê", "Topping", "Trà Sữa"].sort());
});
