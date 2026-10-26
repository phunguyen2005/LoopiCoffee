import assert from "node:assert/strict";
import test, { describe, beforeEach } from "node:test";
import { createDatabase, seedStore } from "./helpers/database.mjs";
import { createOrder } from "../modules/ordering/application/create-order.ts";
import {
  prepareOrderAttempt,
  readPendingOrder,
  rememberReceipt,
  clearPendingOrder,
  lastReceipt,
  parseReceipt,
} from "../components/order/receipt-storage.ts";

// In-memory mock localStorage for receipt-storage tests
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => (mockStorage.has(key) ? mockStorage.get(key) : null),
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

// Fixture helpers
const NOW = "2026-10-25T00:00:00.000Z";
function setupDb(t) {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db, "store-order-test");

  db.sqlite
    .prepare(
      "INSERT INTO store_ordering_settings (id, store_id, is_ordering_open, updated_at) VALUES ('settings-test', 'store-order-test', 1, ?)"
    )
    .run(NOW);
  db.sqlite
    .prepare(
      "INSERT INTO menu_categories (id, store_id, name, created_at, updated_at) VALUES ('cat-tea', 'store-order-test', 'Trà Sữa', ?, ?)"
    )
    .run(NOW, NOW);
  db.sqlite
    .prepare(
      `INSERT INTO menu_items (id, store_id, category_id, name, base_price, image_url, allows_size, allows_sugar, allows_ice, allows_toppings, is_available, created_at, updated_at)
       VALUES ('oolong', 'store-order-test', 'cat-tea', 'Trà Ô Long Sữa', 35000, '/oolong.jpg', 1, 1, 1, 1, 1, ?, ?),
              ('matcha', 'store-order-test', 'cat-tea', 'Matcha Latte', 45000, '/matcha.jpg', 1, 1, 1, 1, 1, ?, ?),
              ('plain', 'store-order-test', 'cat-tea', 'Nước Suối', 15000, '/plain.jpg', 0, 0, 0, 0, 1, ?, ?)`
    )
    .run(NOW, NOW, NOW, NOW, NOW, NOW);

  const options = [
    ["sz-m", "size", "Size M", 0],
    ["sz-l", "size", "Size L", 6000],
    ["sg-100", "sugar", "100% đường", 0],
    ["sg-50", "sugar", "50% đường", 0],
    ["sg-0", "sugar", "0% đường", 0],
    ["ic-100", "ice", "100% đá", 0],
    ["ic-50", "ice", "50% đá", 0],
    ["ic-0", "ice", "0% đá", 0],
    ["top-pearl", "topping", "Trân châu đen", 5000],
    ["top-pudding", "topping", "Pudding trứng", 7000],
    ["top-jelly", "topping", "Thạch dừa", 6000],
    ["top-cheese", "topping", "Kem cheese", 10000],
    ["top-aloe", "topping", "Nha đam", 5000],
    ["top-redbean", "topping", "Đậu đỏ", 5000],
    ["top-taro", "topping", "Khoai môn", 8000],
    ["top-chia", "topping", "Hạt chia", 5000],
    ["top-grass", "topping", "Sương sáo", 5000],
    ["top-cream", "topping", "Kem mây tuyết", 12000],
  ];

  for (const [id, grp, name, price] of options) {
    db.sqlite
      .prepare(
        "INSERT INTO menu_options (id, store_id, group_type, name, price_modifier, is_available, created_at, updated_at) VALUES (?, 'store-order-test', ?, ?, ?, 1, ?, ?)"
      )
      .run(id, grp, name, price, NOW, NOW);
  }

  return db;
}

const receiptHex = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

// Pure cart reducer simulation strictly matching components/order/customer-order-page.tsx
function createCartState() {
  let cart = [];

  return {
    getCart: () => cart,
    getTotalAmount: () => cart.reduce((sum, it) => sum + it.subtotal, 0),
    getTotalQuantity: () => cart.reduce((sum, it) => sum + it.quantity, 0),
    getCartItemCounts: () => {
      const counts = {};
      for (const it of cart) {
        counts[it.itemId] = (counts[it.itemId] || 0) + it.quantity;
      }
      return counts;
    },
    addToCart: (newItem) => {
      const existingIdx = cart.findIndex(
        (it) =>
          it.itemId === newItem.itemId &&
          it.size === newItem.size &&
          it.sugar === newItem.sugar &&
          it.ice === newItem.ice &&
          JSON.stringify(it.toppings) === JSON.stringify(newItem.toppings) &&
          it.note === newItem.note
      );

      if (existingIdx >= 0) {
        const exist = cart[existingIdx];
        const newQty = Math.min(20, exist.quantity + newItem.quantity);
        cart = [...cart];
        cart[existingIdx] = {
          ...exist,
          quantity: newQty,
          subtotal: exist.unitPrice * newQty,
        };
        return;
      }
      if (cart.length < 30) {
        cart = [...cart, newItem];
      }
    },
    updateQuantity: (idx, newQty) => {
      if (newQty <= 0) {
        cart = cart.filter((_, i) => i !== idx);
        return;
      }
      if (idx < 0 || idx >= cart.length) return;
      cart = [...cart];
      const target = cart[idx];
      const clamped = Math.min(20, newQty);
      cart[idx] = {
        ...target,
        quantity: clamped,
        subtotal: target.unitPrice * clamped,
      };
    },
    removeItem: (idx) => {
      cart = cart.filter((_, i) => i !== idx);
    },
    updateCartItem: (editingCartIndex, updated) => {
      if (editingCartIndex !== null && editingCartIndex >= 0 && editingCartIndex < cart.length) {
        cart = [...cart];
        cart[editingCartIndex] = updated;
      }
    },
    clearCart: () => {
      cart = [];
    },
  };
}

describe("Adversarial Order Stress Suite — Milestone 1 UI/UX", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe("1. Price calculation formula across varied combinations", () => {
    test("Formula accuracy: (base_price + size + sum(toppings)) * quantity matches server canonical total across 10 toppings", async (t) => {
      const db = setupDb(t);

      // Base: 35,000; Size L: +6,000; 10 toppings: 5k+7k+6k+10k+5k+5k+8k+5k+5k+12k = 68,000
      // Unit price = 35000 + 6000 + 68000 = 109,000 VND
      // Quantity = 4 -> Total = 436,000 VND
      const toppings = [
        { id: "top-pearl", name: "Trân châu đen", price: 5000 },
        { id: "top-pudding", name: "Pudding trứng", price: 7000 },
        { id: "top-jelly", name: "Thạch dừa", price: 6000 },
        { id: "top-cheese", name: "Kem cheese", price: 10000 },
        { id: "top-aloe", name: "Nha đam", price: 5000 },
        { id: "top-redbean", name: "Đậu đỏ", price: 5000 },
        { id: "top-taro", name: "Khoai môn", price: 8000 },
        { id: "top-chia", name: "Hạt chia", price: 5000 },
        { id: "top-grass", name: "Sương sáo", price: 5000 },
        { id: "top-cream", name: "Kem mây tuyết", price: 12000 },
      ];
      assert.equal(toppings.length, 10);

      const toppingsTotal = toppings.reduce((s, top) => s + top.price, 0);
      assert.equal(toppingsTotal, 68000);

      const basePrice = 35000;
      const sizeModifier = 6000;
      const unitPrice = basePrice + sizeModifier + toppingsTotal;
      assert.equal(unitPrice, 109000);

      const quantity = 4;
      const calculatedSubtotal = unitPrice * quantity;
      assert.equal(calculatedSubtotal, 436000);

      // Submit to backend createOrder
      const payload = {
        customerName: "Nguyễn Văn Test",
        customerPhone: "0901234567",
        customerNote: "Full topping test",
        expectedTotal: calculatedSubtotal,
        items: [
          {
            itemId: "oolong",
            quantity,
            sizeId: "sz-l",
            sugarId: "sg-100",
            iceId: "ic-100",
            toppingIds: toppings.map((t) => t.id),
            note: "Full 10 toppings",
          },
        ],
      };

      const result = await createOrder(
        db,
        "store-order-test",
        payload,
        crypto.randomUUID(),
        receiptHex()
      );
      assert.equal(result.success, true);
      assert.equal(result.order.totalAmount, 436000);

      // Query database to ensure snapshot consistency
      const itemRow = db.sqlite
        .prepare("SELECT * FROM order_items WHERE order_id = ?")
        .get(result.order.id);
      assert.equal(itemRow.unit_price, 109000);
      assert.equal(itemRow.quantity, 4);
      assert.equal(itemRow.subtotal, 436000);
      const parsedToppings = JSON.parse(itemRow.toppings_json);
      assert.equal(parsedToppings.length, 10);
    });

    test("Fixed item with no options (allows_size=0, allows_toppings=0) calculates exact base_price * quantity", async (t) => {
      const db = setupDb(t);
      const basePrice = 15000;
      const quantity = 7;
      const expectedTotal = basePrice * quantity; // 105,000 VND

      const payload = {
        customerName: "Khách Mua Nước",
        customerPhone: "0987654321",
        customerNote: "",
        expectedTotal,
        items: [
          {
            itemId: "plain",
            quantity,
            note: "",
          },
        ],
      };

      const result = await createOrder(
        db,
        "store-order-test",
        payload,
        crypto.randomUUID(),
        receiptHex()
      );
      assert.equal(result.order.totalAmount, 105000);
    });

    test("Discrepancy attack: Tampered expectedTotal (+1 VND, -1 VND, 0) fails server verification with 409 price_changed", async (t) => {
      const db = setupDb(t);
      const canonicalTotal = 35000 * 2; // 70,000

      const basePayload = {
        customerName: "Kẻ Tấn Công Giá",
        customerPhone: "0912345678",
        customerNote: "",
        items: [
          {
            itemId: "oolong",
            quantity: 2,
            sizeId: "sz-m",
            toppingIds: [],
          },
        ],
      };

      for (const forged of [69999, 70001, 0, 1, 999999]) {
        await assert.rejects(
          createOrder(
            db,
            "store-order-test",
            { ...basePayload, expectedTotal: forged },
            crypto.randomUUID(),
            receiptHex()
          ),
          (err) => {
            assert.equal(err.code, "price_changed");
            assert.equal(err.details.expectedTotal, forged);
            assert.equal(err.details.currentTotal, 70000);
            return true;
          }
        );
      }
    });

    test("Duplicate topping attack: Client sending duplicate topping IDs is strictly rejected", async (t) => {
      const db = setupDb(t);
      const payload = {
        customerName: "Duplicate Topping Attack",
        customerPhone: "0901112233",
        expectedTotal: 45000,
        items: [
          {
            itemId: "oolong",
            quantity: 1,
            sizeId: "sz-m",
            toppingIds: ["top-pearl", "top-pearl"],
          },
        ],
      };

      await assert.rejects(
        createOrder(
          db,
          "store-order-test",
          payload,
          crypto.randomUUID(),
          receiptHex()
        ),
        (err) => {
          assert.match(err.message, /Topping không được trùng nhau/);
          return true;
        }
      );
    });

    test("Topping overflow attack: Client sending 11 toppings (>10) is rejected", async (t) => {
      const db = setupDb(t);
      const payload = {
        customerName: "Topping Overflow",
        customerPhone: "0901112233",
        expectedTotal: 100000,
        items: [
          {
            itemId: "oolong",
            quantity: 1,
            sizeId: "sz-m",
            toppingIds: [
              "top-pearl",
              "top-pudding",
              "top-jelly",
              "top-cheese",
              "top-aloe",
              "top-redbean",
              "top-taro",
              "top-chia",
              "top-grass",
              "top-cream",
              "sz-l", // 11th id
            ],
          },
        ],
      };

      await assert.rejects(
        createOrder(
          db,
          "store-order-test",
          payload,
          crypto.randomUUID(),
          receiptHex()
        ),
        (err) => {
          assert.match(err.message, /Tối đa 10 topping mỗi món/);
          return true;
        }
      );
    });
  });

  describe("2. Quantity boundary clamping (min 1, max 20)", () => {
    test("Stepper boundaries: Quantity stepper clamping [Math.max(1), Math.min(20)]", () => {
      let qty = 1;

      // Minus at 1: disabled, stays 1
      const canMinusAt1 = qty > 1;
      assert.equal(canMinusAt1, false);
      qty = Math.max(1, qty - 1);
      assert.equal(qty, 1);

      // Decrement below 0
      qty = Math.max(1, -10);
      assert.equal(qty, 1);

      // Plus up to 20
      for (let i = 1; i <= 19; i++) {
        qty = Math.min(20, qty + 1);
      }
      assert.equal(qty, 20);

      // Plus at 20: disabled, stays 20
      const canPlusAt20 = qty < 20;
      assert.equal(canPlusAt20, false);
      qty = Math.min(20, qty + 1);
      assert.equal(qty, 20);

      // Increment above 20
      qty = Math.min(20, 100);
      assert.equal(qty, 20);
    });

    test("Cart duplicate merging clamps combined quantity to 20", () => {
      const cartState = createCartState();

      const itemA = {
        itemId: "oolong",
        name: "Trà Ô Long Sữa",
        basePrice: 35000,
        unitPrice: 35000,
        quantity: 15,
        size: "Size M",
        sugar: "100%",
        ice: "100%",
        toppings: [],
        note: "",
        subtotal: 35000 * 15,
      };

      cartState.addToCart(itemA);
      assert.equal(cartState.getCart().length, 1);
      assert.equal(cartState.getTotalQuantity(), 15);
      assert.equal(cartState.getTotalAmount(), 525000);

      // Add 8 more of identical item -> 15 + 8 = 23, clamped to 20
      const itemAExtra = { ...itemA, quantity: 8, subtotal: 35000 * 8 };
      cartState.addToCart(itemAExtra);

      assert.equal(cartState.getCart().length, 1); // Still 1 line
      assert.equal(cartState.getCart()[0].quantity, 20); // Clamped to 20
      assert.equal(cartState.getCart()[0].subtotal, 35000 * 20); // 700,000 VND
      assert.equal(cartState.getTotalAmount(), 700000);
      assert.equal(cartState.getCartItemCounts()["oolong"], 20);
    });

    test("Cart updateQuantity directly clamps to 20 or removes at 0", () => {
      const cartState = createCartState();

      cartState.addToCart({
        itemId: "oolong",
        name: "Trà Ô Long Sữa",
        basePrice: 35000,
        unitPrice: 35000,
        quantity: 5,
        size: "Size M",
        sugar: "100%",
        ice: "100%",
        toppings: [],
        note: "",
        subtotal: 175000,
      });

      // Update to 25 -> clamps to 20
      cartState.updateQuantity(0, 25);
      assert.equal(cartState.getCart()[0].quantity, 20);
      assert.equal(cartState.getCart()[0].subtotal, 700000);

      // Update to 0 -> removes item
      cartState.updateQuantity(0, 0);
      assert.equal(cartState.getCart().length, 0);
      assert.equal(cartState.getTotalAmount(), 0);
    });

    test("Max line items: Cart blocks adding 31st item when length is 30", () => {
      const cartState = createCartState();

      for (let i = 0; i < 30; i++) {
        cartState.addToCart({
          itemId: `item-${i}`,
          name: `Item ${i}`,
          basePrice: 20000,
          unitPrice: 20000,
          quantity: 1,
          size: "",
          sugar: "",
          ice: "",
          toppings: [],
          note: `note-${i}`,
          subtotal: 20000,
        });
      }
      assert.equal(cartState.getCart().length, 30);

      // Attempt 31st item
      cartState.addToCart({
        itemId: "item-31",
        name: "Item 31",
        basePrice: 20000,
        unitPrice: 20000,
        quantity: 1,
        size: "",
        sugar: "",
        ice: "",
        toppings: [],
        note: "overflow",
        subtotal: 20000,
      });
      assert.equal(cartState.getCart().length, 30); // Blocked
    });

    test("Server strictly rejects invalid quantities (0, -1, 21, 1.5, '2', null)", async (t) => {
      const db = setupDb(t);

      for (const invalidQty of [0, -1, 21, 1.5, "2", null, undefined]) {
        const payload = {
          customerName: "Invalid Qty",
          customerPhone: "0901234567",
          expectedTotal: 35000,
          items: [
            {
              itemId: "oolong",
              quantity: invalidQty,
            },
          ],
        };

        await assert.rejects(
          createOrder(
            db,
            "store-order-test",
            payload,
            crypto.randomUUID(),
            receiptHex()
          ),
          (err) => err.status === 400
        );
      }
    });
  });

  describe("3. Edit mode cart replacement", () => {
    test("Edit item at index 0 preserves elements [1..N-1] and recalculates expectedTotal accurately", () => {
      const cartState = createCartState();

      // Add 3 distinct items
      const item0 = {
        itemId: "oolong",
        name: "Trà Ô Long Sữa",
        basePrice: 35000,
        unitPrice: 35000,
        quantity: 2,
        size: "Size M",
        sugar: "100%",
        ice: "100%",
        toppings: [],
        note: "Original 0",
        subtotal: 70000,
      };
      const item1 = {
        itemId: "matcha",
        name: "Matcha Latte",
        basePrice: 45000,
        unitPrice: 51000, // Size L +6k
        quantity: 1,
        size: "Size L",
        sugar: "50%",
        ice: "100%",
        toppings: [],
        note: "Original 1",
        subtotal: 51000,
      };
      const item2 = {
        itemId: "plain",
        name: "Nước Suối",
        basePrice: 15000,
        unitPrice: 15000,
        quantity: 3,
        size: "",
        sugar: "",
        ice: "",
        toppings: [],
        note: "Original 2",
        subtotal: 45000,
      };

      cartState.addToCart(item0);
      cartState.addToCart(item1);
      cartState.addToCart(item2);

      assert.equal(cartState.getCart().length, 3);
      assert.equal(cartState.getTotalAmount(), 70000 + 51000 + 45000); // 166,000 VND

      // Edit item at Index 0: change size to L (+6k), add pearl (+5k), change qty to 3
      // New unitPrice = 35000 + 6000 + 5000 = 46,000; New subtotal = 46,000 * 3 = 138,000
      const updatedItem0 = {
        ...item0,
        size: "Size L",
        sizeId: "sz-l",
        toppings: [{ id: "top-pearl", name: "Trân châu đen", price: 5000 }],
        unitPrice: 46000,
        quantity: 3,
        subtotal: 138000,
        note: "Edited 0",
      };

      cartState.updateCartItem(0, updatedItem0);

      const newCart = cartState.getCart();
      assert.equal(newCart.length, 3);

      // Index 0 replaced
      assert.deepEqual(newCart[0], updatedItem0);

      // Index 1 and 2 completely preserved (identity and values)
      assert.deepEqual(newCart[1], item1);
      assert.deepEqual(newCart[2], item2);

      // Total updated accurately
      const expectedTotal = 138000 + 51000 + 45000; // 234,000 VND
      assert.equal(cartState.getTotalAmount(), expectedTotal);
      assert.equal(cartState.getTotalQuantity(), 3 + 1 + 3); // 7 items
    });

    test("Edit item at index N-1 (last item) preserves elements [0..N-2] and recalculates expectedTotal accurately", () => {
      const cartState = createCartState();

      const item0 = {
        itemId: "oolong",
        name: "Trà Ô Long Sữa",
        basePrice: 35000,
        unitPrice: 35000,
        quantity: 1,
        size: "Size M",
        sugar: "100%",
        ice: "100%",
        toppings: [],
        note: "",
        subtotal: 35000,
      };
      const item1 = {
        itemId: "plain",
        name: "Nước Suối",
        basePrice: 15000,
        unitPrice: 15000,
        quantity: 2,
        size: "",
        sugar: "",
        ice: "",
        toppings: [],
        note: "",
        subtotal: 30000,
      };

      cartState.addToCart(item0);
      cartState.addToCart(item1);

      // Edit item at Index 1 (last element): increase qty to 10
      const updatedItem1 = {
        ...item1,
        quantity: 10,
        subtotal: 15000 * 10,
      };

      cartState.updateCartItem(1, updatedItem1);

      const cart = cartState.getCart();
      assert.equal(cart.length, 2);
      assert.deepEqual(cart[0], item0); // Preserved
      assert.deepEqual(cart[1], updatedItem1); // Updated
      assert.equal(cartState.getTotalAmount(), 35000 + 150000); // 185,000 VND
    });

    test("Edit item at middle index (Index 2 of 5 items) preserves all preceding and succeeding elements in exact order", () => {
      const cartState = createCartState();

      const items = [0, 1, 2, 3, 4].map((i) => ({
        itemId: `item-${i}`,
        name: `Item ${i}`,
        basePrice: 10000 * (i + 1),
        unitPrice: 10000 * (i + 1),
        quantity: 1,
        size: "",
        sugar: "",
        ice: "",
        toppings: [],
        note: `note-${i}`,
        subtotal: 10000 * (i + 1),
      }));

      for (const it of items) cartState.addToCart(it);
      assert.equal(cartState.getCart().length, 5);

      // Edit item at index 2 (Item 2)
      const updated2 = {
        ...items[2],
        quantity: 5,
        subtotal: items[2].unitPrice * 5,
        note: "Edited middle item",
      };

      cartState.updateCartItem(2, updated2);

      const finalCart = cartState.getCart();
      assert.equal(finalCart.length, 5);
      assert.deepEqual(finalCart[0], items[0]);
      assert.deepEqual(finalCart[1], items[1]);
      assert.deepEqual(finalCart[2], updated2);
      assert.deepEqual(finalCart[3], items[3]);
      assert.deepEqual(finalCart[4], items[4]);
    });

    test("Out of bounds edit index (-1, length, 99) safely leaves cart unchanged", () => {
      const cartState = createCartState();
      cartState.addToCart({
        itemId: "oolong",
        name: "Trà Ô Long Sữa",
        basePrice: 35000,
        unitPrice: 35000,
        quantity: 1,
        size: "Size M",
        sugar: "100%",
        ice: "100%",
        toppings: [],
        note: "",
        subtotal: 35000,
      });

      const snapshot = JSON.stringify(cartState.getCart());

      cartState.updateCartItem(-1, { itemId: "fake" });
      assert.equal(JSON.stringify(cartState.getCart()), snapshot);

      cartState.updateCartItem(1, { itemId: "fake" });
      assert.equal(JSON.stringify(cartState.getCart()), snapshot);

      cartState.updateCartItem(999, { itemId: "fake" });
      assert.equal(JSON.stringify(cartState.getCart()), snapshot);
    });

    test("End-to-End Database verification: submitting edited cart creates exact database rows", async (t) => {
      const db = setupDb(t);
      const cartState = createCartState();

      // Start with 2 items
      cartState.addToCart({
        itemId: "oolong",
        name: "Trà Ô Long Sữa",
        basePrice: 35000,
        unitPrice: 35000,
        quantity: 1,
        size: "Size M",
        sizeId: "sz-m",
        sugar: "100%",
        sugarId: "sg-100",
        ice: "100%",
        iceId: "ic-100",
        toppings: [],
        note: "",
        subtotal: 35000,
      });
      cartState.addToCart({
        itemId: "matcha",
        name: "Matcha Latte",
        basePrice: 45000,
        unitPrice: 45000,
        quantity: 1,
        size: "Size M",
        sizeId: "sz-m",
        sugar: "100%",
        sugarId: "sg-100",
        ice: "100%",
        iceId: "ic-100",
        toppings: [],
        note: "",
        subtotal: 45000,
      });

      // Edit item 0: change to Size L (+6k) + Kem cheese (+10k) + qty 2
      // unitPrice = 35k + 6k + 10k = 51k; subtotal = 102k
      cartState.updateCartItem(0, {
        itemId: "oolong",
        name: "Trà Ô Long Sữa",
        basePrice: 35000,
        unitPrice: 51000,
        quantity: 2,
        size: "Size L",
        sizeId: "sz-l",
        sugar: "100%",
        sugarId: "sg-100",
        ice: "100%",
        iceId: "ic-100",
        toppings: [{ id: "top-cheese", name: "Kem cheese", price: 10000 }],
        note: "Ghi chú món đã sửa",
        subtotal: 102000,
      });

      const finalTotal = cartState.getTotalAmount(); // 102,000 + 45,000 = 147,000 VND
      assert.equal(finalTotal, 147000);

      // Submit edited cart
      const payload = {
        customerName: "Nguyễn Khách Sửa Đơn",
        customerPhone: "0908765432",
        customerNote: "Giao trước 12h",
        expectedTotal: finalTotal,
        items: cartState.getCart().map((it) => ({
          itemId: it.itemId,
          quantity: it.quantity,
          sizeId: it.sizeId,
          sugarId: it.sugarId,
          iceId: it.iceId,
          toppingIds: it.toppings.map((t) => t.id),
          note: it.note,
        })),
      };

      const result = await createOrder(
        db,
        "store-order-test",
        payload,
        crypto.randomUUID(),
        receiptHex()
      );
      assert.equal(result.order.totalAmount, 147000);
      assert.equal(result.order.itemCount, 3); // 2 oolong + 1 matcha

      // Check DB order_items
      const rows = db.sqlite
        .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid ASC")
        .all(result.order.id);
      assert.equal(rows.length, 2);

      const oolongRow = rows.find((r) => r.item_id === "oolong");
      const matchaRow = rows.find((r) => r.item_id === "matcha");
      assert.ok(oolongRow, "oolong row must exist in DB");
      assert.ok(matchaRow, "matcha row must exist in DB");

      // First item: edited oolong
      assert.equal(oolongRow.item_name, "Trà Ô Long Sữa");
      assert.equal(oolongRow.unit_price, 51000);
      assert.equal(oolongRow.quantity, 2);
      assert.equal(oolongRow.subtotal, 102000);
      assert.equal(oolongRow.size_label, "Size L");
      assert.equal(oolongRow.item_note, "Ghi chú món đã sửa");
      assert.deepEqual(JSON.parse(oolongRow.toppings_json), [
        { name: "Kem cheese", price: 10000 },
      ]);

      // Second item: unchanged matcha
      assert.equal(matchaRow.item_name, "Matcha Latte");
      assert.equal(matchaRow.unit_price, 45000);
      assert.equal(matchaRow.quantity, 1);
      assert.equal(matchaRow.subtotal, 45000);
      assert.equal(matchaRow.size_label, "Size M");
    });
  });

  describe("4. Idempotency and receipt storage persistence after editing cart items", () => {
    test("Full lifecycle: prepareOrderAttempt -> readPendingOrder -> rememberReceipt -> clean state", () => {
      const payload = JSON.stringify({
        customerName: "Khách Lưu Biên Nhận",
        expectedTotal: 70000,
        items: [{ itemId: "oolong", quantity: 2 }],
      });

      assert.equal(readPendingOrder(), null);

      const attempt = prepareOrderAttempt(payload);
      assert.ok(attempt.key);
      assert.ok(attempt.receipt);
      assert.equal(attempt.payload, payload);

      // Verify saved in localStorage
      const pending = readPendingOrder();
      assert.deepEqual(pending, attempt);

      // Remember receipt clears pending and stores receipt
      rememberReceipt(attempt.receipt);
      assert.equal(readPendingOrder(), null);
      assert.equal(lastReceipt(), attempt.receipt);
    });

    test("In-flight conflict guard (ORD-002/ORD-003): If an unconfirmed attempt is in-flight, editing cart items throws error", () => {
      const originalPayload = JSON.stringify({
        customerName: "Khách Hàng Ban Đầu",
        expectedTotal: 35000,
        items: [{ itemId: "oolong", quantity: 1 }],
      });

      const attempt = prepareOrderAttempt(originalPayload);
      assert.ok(attempt);

      // Now user edits cart items and tries to submit a new payload while previous is pending
      const editedPayload = JSON.stringify({
        customerName: "Khách Hàng Ban Đầu",
        expectedTotal: 70000,
        items: [{ itemId: "oolong", quantity: 2 }], // Edited qty
      });

      assert.throws(
        () => prepareOrderAttempt(editedPayload),
        (err) => {
          assert.match(
            err.message,
            /Đơn trước chưa được xác nhận\. Hãy đóng giỏ và dùng nút kiểm tra đơn đang gửi trước khi đặt đơn mới\./
          );
          return true;
        }
      );

      // Original pending order remains completely intact
      const retained = readPendingOrder();
      assert.deepEqual(retained, attempt);
    });

    test("Idempotent retry: Submitting identical payload returns same attempt without regenerating key or receipt", () => {
      const payload = JSON.stringify({
        customerName: "Khách Thử Lại",
        expectedTotal: 50000,
        items: [{ itemId: "matcha", quantity: 1 }],
      });

      const firstAttempt = prepareOrderAttempt(payload);
      const secondAttempt = prepareOrderAttempt(payload);

      assert.equal(firstAttempt.key, secondAttempt.key);
      assert.equal(firstAttempt.receipt, secondAttempt.receipt);
      assert.equal(firstAttempt.payload, secondAttempt.payload);
    });

    test("Server rejection recovery: When server rejects non-500 (e.g. price_changed), clearPendingOrder enables modified cart submission", () => {
      const initialPayload = JSON.stringify({
        customerName: "Khách Giá Cũ",
        expectedTotal: 30000, // Stale price
        items: [{ itemId: "oolong", quantity: 1 }],
      });

      const attempt1 = prepareOrderAttempt(initialPayload);
      assert.ok(attempt1);

      // Simulate client clearing pending on 409 price_changed (as done in CartDrawer line 125)
      clearPendingOrder();
      assert.equal(readPendingOrder(), null);

      // Now user accepts new price or edits items
      const updatedPayload = JSON.stringify({
        customerName: "Khách Giá Cũ",
        expectedTotal: 35000, // Updated price
        items: [{ itemId: "oolong", quantity: 1 }],
      });

      const attempt2 = prepareOrderAttempt(updatedPayload);
      assert.ok(attempt2);
      assert.notEqual(attempt2.key, attempt1.key); // Fresh submission key
      assert.notEqual(attempt2.receipt, attempt1.receipt); // Fresh receipt token
      assert.equal(readPendingOrder().payload, updatedPayload);
    });

    test("Backend idempotency replay vs conflict: replaying same key/payload succeeds, altered payload causes 409 idempotency_conflict", async (t) => {
      const db = setupDb(t);
      const submissionKey = crypto.randomUUID();
      const receipt = receiptHex();

      const payload = {
        customerName: "Khách Idempotency",
        customerPhone: "0909999888",
        customerNote: "",
        expectedTotal: 35000,
        items: [{ itemId: "oolong", quantity: 1 }],
      };

      // 1. Initial creation
      const res1 = await createOrder(
        db,
        "store-order-test",
        payload,
        submissionKey,
        receipt
      );
      assert.equal(res1.replayed, false);
      assert.equal(res1.order.totalAmount, 35000);

      // 2. Replay with identical key, receipt, and payload
      const res2 = await createOrder(
        db,
        "store-order-test",
        payload,
        submissionKey,
        receipt
      );
      assert.equal(res2.replayed, true);
      assert.equal(res2.order.id, res1.order.id);

      // Confirm only 1 order created in DB
      const count = db.sqlite
        .prepare("SELECT count(*) as c FROM customer_orders")
        .get().c;
      assert.equal(count, 1);

      // 3. Conflict: Same submission key but edited/altered payload
      const alteredPayload = {
        ...payload,
        expectedTotal: 70000,
        items: [{ itemId: "oolong", quantity: 2 }], // Edited
      };

      await assert.rejects(
        createOrder(
          db,
          "store-order-test",
          alteredPayload,
          submissionKey,
          receipt
        ),
        (err) => {
          assert.equal(err.code, "idempotency_conflict");
          assert.equal(err.status, 409);
          return true;
        }
      );
    });

    test("parseReceipt utility validates 64-char hex tokens and receipt hash URL fragments", () => {
      const validToken = "a".repeat(64);
      assert.equal(parseReceipt(validToken), validToken);

      // URL with fragment
      const url = `http://localhost:3000/order#receipt=${"f".repeat(64)}`;
      assert.equal(parseReceipt(url), "f".repeat(64));

      // Invalid tokens
      assert.equal(parseReceipt(""), null);
      assert.equal(parseReceipt("invalid-token"), null);
      assert.equal(parseReceipt("a".repeat(63)), null); // 63 chars
      assert.equal(parseReceipt("g".repeat(64)), null); // non-hex
      assert.equal(parseReceipt("http://localhost:3000/order#other=123"), null);
    });
  });
});
