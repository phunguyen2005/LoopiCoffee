import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { readFile } from "node:fs/promises";

describe("Milestone 1: Customer Ordering UI/UX Optimization Suite", () => {
  test("MenuCard source implements cartQuantity badge, terracotta styling, and aria-label contract", async () => {
    const src = await readFile(
      new URL("../components/order/menu-card.tsx", import.meta.url),
      "utf8"
    );

    // Prop interface includes cartQuantity
    assert.match(src, /cartQuantity\?:\s*number/);

    // Terracotta badge with #C85A32 and white text
    assert.match(src, /cartQuantity\s*!==\s*undefined\s*&&\s*cartQuantity\s*>\s*0/);
    assert.match(src, /bg-\[#C85A32\]\s+text-white/);

    // Invariant: aria-label begins with "Chọn món ${item.name}, giá ${formatVND(item.base_price)}"
    assert.match(src, /Chọn món \$\{item\.name\}, giá \$\{formatVND\(item\.base_price\)\}/);
  });

  test("ItemDetailModal source implements compact segmented pills, topping chips, edit mode, and sticky CTA", async () => {
    const src = await readFile(
      new URL("../components/order/item-detail-modal.tsx", import.meta.url),
      "utf8"
    );

    // Edit mode props
    assert.match(src, /cartItemToEdit\?:\s*CartItemOption\s*\|\s*null/);
    assert.match(src, /onUpdateCartItem\?:\s*\(updatedCartItem:\s*CartItemOption\)\s*=>\s*void/);

    // Segmented pill formatting helpers
    assert.match(src, /formatSizeButtonText/);
    assert.match(src, /formatSugarButtonText/);
    assert.match(src, /formatIceButtonText/);

    // Responsive styling for pills
    assert.match(src, /min-w-0 flex-1/);

    // Compact topping chips with price additions
    assert.match(src, /flex flex-wrap gap-2/);
    assert.match(src, /\(\+\{formatVND\(top\.price_modifier\)\}\)/);

    // Sticky CTA with real-time total and add/edit button texts
    assert.match(src, /sticky bottom-0/);
    assert.match(src, /isEditMode \? "Cập nhật món" : "Thêm vào giỏ"/);
  });

  test("CartDrawer source implements onEditItem, interactive card, and preserved button texts", async () => {
    const src = await readFile(
      new URL("../components/order/cart-drawer.tsx", import.meta.url),
      "utf8"
    );

    // Prop interface includes onEditItem
    assert.match(src, /onEditItem:\s*\(index:\s*number\)\s*=>\s*void/);

    // Dedicated Chỉnh sửa button
    assert.match(src, /Chỉnh sửa/);

    // Preserved button texts
    assert.match(src, /aria-label="Đóng giỏ hàng"/);
    assert.match(src, /"Xác nhận đặt hàng"/);

    // Quantity stepper and trash button
    assert.match(src, /aria-label="Giảm số lượng món"/);
    assert.match(src, /aria-label="Tăng số lượng món"/);
    assert.match(src, /Trash2/);
  });

  test("CustomerOrderPage source calculates cartItemCounts and wires edit roundtrip", async () => {
    const src = await readFile(
      new URL("../components/order/customer-order-page.tsx", import.meta.url),
      "utf8"
    );

    // cartItemCounts computation
    assert.match(src, /const cartItemCounts\s*=\s*useMemo/);
    assert.match(src, /counts\[it\.itemId\]\s*=\s*\(counts\[it\.itemId\]\s*\|\|\s*0\)\s*\+\s*it\.quantity/);

    // Passing cartQuantity to MenuCard
    assert.match(src, /cartQuantity=\{cartItemCounts\[item\.id\] \|\| 0\}/);

    // Edit roundtrip wiring
    assert.match(src, /handleEditCartItem/);
    assert.match(src, /handleUpdateCartItem/);
    assert.match(src, /onEditItem=\{handleEditCartItem\}/);
    assert.match(src, /onUpdateCartItem=\{handleUpdateCartItem\}/);
  });
});
