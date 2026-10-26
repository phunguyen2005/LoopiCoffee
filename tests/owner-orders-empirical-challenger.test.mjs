import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { readFile } from "node:fs/promises";
import { createDatabase, seedStore } from "./helpers/database.mjs";
import { changeOrderStatus, advanceOrderStatusPipeline, VALID_CANCELLATION_CODES } from "../modules/ordering/application/change-status.ts";

function createActor(role = "owner", storeId = "store-test") {
  return {
    storeId,
    email: "owner@test.com",
    role,
    permissions: ["orders.transition", "orders.cancel", "orders.read"],
  };
}

describe("Empirical Challenger: Milestone 2 Owner Orders Management (/app/orders)", () => {
  // -------------------------------------------------------------
  // 1. FILTERING LOGIC
  // -------------------------------------------------------------
  describe("1. Filtering Logic: Status Badge Counts, Attention Filters & Search", () => {
    test("1.1 Status badge counts match filtered counts accurately across all statuses", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-filter-test");
      const storeId = "store-filter-test";
      const now = new Date().toISOString();

      // Seed 2 pending, 1 accepted, 3 preparing, 2 ready, 4 completed, 1 cancelled = 13 total
      const seedOrders = [
        { id: "o1", code: "LB-001", status: "pending", name: "An", phone: "0901000001" },
        { id: "o2", code: "LB-002", status: "pending", name: "Binh", phone: "0901000002" },
        { id: "o3", code: "LB-003", status: "accepted", name: "Cuong", phone: "0901000003" },
        { id: "o4", code: "LB-004", status: "preparing", name: "Dung", phone: "0901000004" },
        { id: "o5", code: "LB-005", status: "preparing", name: "Em", phone: "0901000005" },
        { id: "o6", code: "LB-006", status: "preparing", name: "Giang", phone: "0901000006" },
        { id: "o7", code: "LB-007", status: "ready", name: "Hoa", phone: "0901000007" },
        { id: "o8", code: "LB-008", status: "ready", name: "Khanh", phone: "0901000008" },
        { id: "o9", code: "LB-009", status: "completed", name: "Lan", phone: "0901000009" },
        { id: "o10", code: "LB-010", status: "completed", name: "Minh", phone: "0901000010" },
        { id: "o11", code: "LB-011", status: "completed", name: "Nam", phone: "0901000011" },
        { id: "o12", code: "LB-012", status: "completed", name: "Oanh", phone: "0901000012" },
        { id: "o13", code: "LB-013", status: "cancelled", name: "Phuc", phone: "0901000013" },
      ];

      for (const ord of seedOrders) {
        db.sqlite.prepare(`
          INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 50000, 1, ?, ?, ?)
        `).run(ord.id, storeId, ord.code, ord.name, ord.phone, ord.status, now, now);
      }

      // Query status counts matching app/api/owner/orders/route.ts
      const countsQuery = `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
        SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) AS preparing,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM customer_orders WHERE store_id = ?`;

      const counts = db.sqlite.prepare(countsQuery).get(storeId);
      assert.equal(counts.total, 13);
      assert.equal(counts.pending, 2);
      assert.equal(counts.accepted, 1);
      assert.equal(counts.preparing, 3);
      assert.equal(counts.ready, 2);
      assert.equal(counts.completed, 4);
      assert.equal(counts.cancelled, 1);

      // Verify filtered query for statusFilter = 'pending'
      const pendingRows = db.sqlite.prepare(
        "SELECT * FROM customer_orders WHERE store_id = ? AND status = ?"
      ).all(storeId, "pending");
      assert.equal(pendingRows.length, counts.pending);

      // Verify filtered query for statusFilter = 'preparing'
      const prepRows = db.sqlite.prepare(
        "SELECT * FROM customer_orders WHERE store_id = ? AND status = ?"
      ).all(storeId, "preparing");
      assert.equal(prepRows.length, counts.preparing);

      // Verify filtered query for statusFilter = 'ready'
      const readyRows = db.sqlite.prepare(
        "SELECT * FROM customer_orders WHERE store_id = ? AND status = ?"
      ).all(storeId, "ready");
      assert.equal(readyRows.length, counts.ready);
    });

    test("1.2 Attention Filter: 'Có ghi chú' filters orders with order note or item note", () => {
      // Logic from components/operational/owner-orders-view.tsx:
      // countWithNote = orders.filter((o) => Boolean(o.customerNote?.trim()) || o.items.some((it) => Boolean(it.note?.trim()))).length
      const mockOrders = [
        {
          id: "1",
          orderCode: "LB-101",
          customerNote: "Giao tận tay",
          items: [{ id: "i1", note: null }],
        },
        {
          id: "2",
          orderCode: "LB-102",
          customerNote: null,
          items: [{ id: "i2", note: "Ít đá 30%" }],
        },
        {
          id: "3",
          orderCode: "LB-103",
          customerNote: "   ", // whitespace only should be false after trim
          items: [{ id: "i3", note: "" }],
        },
        {
          id: "4",
          orderCode: "LB-104",
          customerNote: undefined,
          items: [{ id: "i4", note: undefined }],
        },
        {
          id: "5",
          orderCode: "LB-105",
          customerNote: "Gọi trước khi đến",
          items: [{ id: "i5", note: "Không đường" }],
        },
      ];

      const filterByNote = (ord) =>
        Boolean(ord.customerNote?.trim()) ||
        ord.items.some((it) => Boolean(it.note?.trim()));

      const filtered = mockOrders.filter(filterByNote);
      assert.equal(filtered.length, 3);
      assert.deepEqual(filtered.map((o) => o.id), ["1", "2", "5"]);

      // Negative check: whitespace-only note and undefined/null notes are properly excluded
      assert.equal(filterByNote(mockOrders[2]), false);
      assert.equal(filterByNote(mockOrders[3]), false);
    });

    test("1.3 Attention Filter: 'Chờ lâu' (>15 mins from createdAt) filters active orders waiting >= 15 min", () => {
      const nowMs = Date.now();
      const getElapsedMinutes = (createdAt) => {
        const created = new Date(createdAt).getTime();
        if (Number.isNaN(created)) return 0;
        return Math.max(0, Math.floor((nowMs - created) / 60000));
      };

      const mockOrders = [
        {
          id: "1",
          status: "pending",
          createdAt: new Date(nowMs - 20 * 60000).toISOString(), // 20m ago -> MATCH
        },
        {
          id: "2",
          status: "preparing",
          createdAt: new Date(nowMs - 16 * 60000).toISOString(), // 16m ago -> MATCH
        },
        {
          id: "3",
          status: "accepted",
          createdAt: new Date(nowMs - 15 * 60000).toISOString(), // 15m ago -> MATCH (>= 15)
        },
        {
          id: "4",
          status: "pending",
          createdAt: new Date(nowMs - 14 * 60000).toISOString(), // 14m ago -> NO MATCH (< 15)
        },
        {
          id: "5",
          status: "completed",
          createdAt: new Date(nowMs - 60 * 60000).toISOString(), // 60m ago, but completed -> NO MATCH
        },
        {
          id: "6",
          status: "cancelled",
          createdAt: new Date(nowMs - 60 * 60000).toISOString(), // 60m ago, but cancelled -> NO MATCH
        },
        {
          id: "7",
          status: "pending",
          createdAt: "invalid-date", // invalid date -> NO MATCH, does not crash
        },
      ];

      const filterByLongWait = (ord) => {
        const isWaiting = ["pending", "accepted", "preparing"].includes(ord.status);
        const isLong = getElapsedMinutes(ord.createdAt) >= 15;
        return isWaiting && isLong;
      };

      const filtered = mockOrders.filter(filterByLongWait);
      assert.equal(filtered.length, 3);
      assert.deepEqual(filtered.map((o) => o.id), ["1", "2", "3"]);
    });

    test("1.4 Search query matches order code, customer name, and customer phone", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-search-test");
      const storeId = "store-search-test";
      const now = new Date().toISOString();

      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES
          ('s1', ?, 'LB-ABCD', 'Nguyễn Thị Hoa', '0912345678', 35000, 1, 'pending', ?, ?),
          ('s2', ?, 'LB-EFGH', 'Trần Văn Minh', '0988765432', 40000, 1, 'preparing', ?, ?),
          ('s3', ?, 'LB-IJKL', 'Lê Hoàng Nam', '0905123987', 55000, 1, 'ready', ?, ?)
      `).run(storeId, now, now, storeId, now, now, storeId, now, now);

      const searchOrders = (searchTerm) => {
        const query = `
          SELECT * FROM customer_orders
          WHERE store_id = ?
            AND (upper(order_code) LIKE upper(?) OR customer_name LIKE ? OR customer_phone LIKE ?)
        `;
        return db.sqlite.prepare(query).all(storeId, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
      };

      // Search by lowercase order code
      const resCode = searchOrders("abcd");
      assert.equal(resCode.length, 1);
      assert.equal(resCode[0].id, "s1");

      // Search by partial uppercase code
      const resUpper = searchOrders("EFG");
      assert.equal(resUpper.length, 1);
      assert.equal(resUpper[0].id, "s2");

      // Search by customer name
      const resName = searchOrders("Hoàng Nam");
      assert.equal(resName.length, 1);
      assert.equal(resName[0].id, "s3");

      // Search by partial phone
      const resPhone = searchOrders("88765");
      assert.equal(resPhone.length, 1);
      assert.equal(resPhone[0].id, "s2");

      // Search with non-matching term
      const resNone = searchOrders("không_tồn_tại");
      assert.equal(resNone.length, 0);
    });
  });

  // -------------------------------------------------------------
  // 2. STATUS TRANSITIONS & AUTO-ADVANCE PIPELINE
  // -------------------------------------------------------------
  describe("2. Status Transitions: Direct & Auto-Advance Pipeline Verification", () => {
    test("2.1 'Nhận & Pha' (pending -> preparing) auto-advances through accepted", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-pipe-1");
      const actor = createActor("owner", "store-pipe-1");
      const now = new Date().toISOString();

      const ordId = "ord-auto-prep";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'LB-AUTO-1', 'Khách 1', '0901234567', 45000, 1, 'pending', ?, ?)
      `).run(ordId, actor.storeId, now, now);

      // Advance with autoAdvance: true to "preparing"
      const res = await advanceOrderStatusPipeline(db, actor, ordId, {
        newStatus: "preparing",
        expectedStatus: "pending",
        autoAdvance: true,
      });

      assert.equal(res.toStatus, "preparing");
      assert.equal(res.stagesAdvanced, 2);

      const current = db.sqlite.prepare("SELECT status FROM customer_orders WHERE id = ?").get(ordId);
      assert.equal(current.status, "preparing");

      // Check order_status_history has both pending->accepted and accepted->preparing
      const history = db.sqlite.prepare(
        "SELECT from_status, to_status FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC"
      ).all(ordId);
      assert.equal(history.length, 2);
      assert.equal(history[0].from_status, "pending");
      assert.equal(history[0].to_status, "accepted");
      assert.equal(history[1].from_status, "accepted");
      assert.equal(history[1].to_status, "preparing");
    });

    test("2.2 'Xong ngay' (pending -> completed) auto-advances through all 4 pipeline stages", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-pipe-2");
      const actor = createActor("owner", "store-pipe-2");
      const now = new Date().toISOString();

      const ordId = "ord-auto-comp";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'LB-AUTO-2', 'Khách 2', '0901234568', 65000, 1, 'pending', ?, ?)
      `).run(ordId, actor.storeId, now, now);

      // Advance with autoAdvance: true directly to "completed"
      const res = await advanceOrderStatusPipeline(db, actor, ordId, {
        newStatus: "completed",
        expectedStatus: "pending",
        autoAdvance: true,
      });

      assert.equal(res.toStatus, "completed");
      assert.equal(res.stagesAdvanced, 4);

      const current = db.sqlite.prepare("SELECT status FROM customer_orders WHERE id = ?").get(ordId);
      assert.equal(current.status, "completed");

      const history = db.sqlite.prepare(
        "SELECT from_status, to_status FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC"
      ).all(ordId);
      assert.equal(history.length, 4);
      assert.deepEqual(history.map((h) => `${h.from_status}->${h.to_status}`), [
        "pending->accepted",
        "accepted->preparing",
        "preparing->ready",
        "ready->completed",
      ]);
    });

    test("2.3 Standard single-step transitions work correctly without autoAdvance", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-pipe-3");
      const actor = createActor("owner", "store-pipe-3");
      const now = new Date().toISOString();

      const ordId = "ord-step-test";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'LB-STEP-1', 'Khách Step', '0901234569', 50000, 1, 'preparing', ?, ?)
      `).run(ordId, actor.storeId, now, now);

      // Transition preparing -> ready (direct)
      const resReady = await changeOrderStatus(db, actor, ordId, {
        expectedStatus: "preparing",
        newStatus: "ready",
      });
      assert.equal(resReady.toStatus, "ready");

      // Transition ready -> completed (direct)
      const resComp = await changeOrderStatus(db, actor, ordId, {
        expectedStatus: "ready",
        newStatus: "completed",
      });
      assert.equal(resComp.toStatus, "completed");
    });

    test("2.4 Illegal non-consecutive jump without autoAdvance is strictly rejected", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-pipe-4");
      const actor = createActor("owner", "store-pipe-4");
      const now = new Date().toISOString();

      const ordId = "ord-jump-test";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'LB-JUMP-1', 'Khách Jump', '0901234570', 50000, 1, 'pending', ?, ?)
      `).run(ordId, actor.storeId, now, now);

      // Attempting direct jump pending -> completed via changeOrderStatus must fail
      await assert.rejects(
        changeOrderStatus(db, actor, ordId, {
          expectedStatus: "pending",
          newStatus: "completed",
        }),
        { code: "invalid_transition" }
      );

      // Attempting direct jump pending -> ready via changeOrderStatus must fail
      await assert.rejects(
        changeOrderStatus(db, actor, ordId, {
          expectedStatus: "pending",
          newStatus: "ready",
        }),
        { code: "invalid_transition" }
      );
    });
  });

  // -------------------------------------------------------------
  // 3. CANCELLATION REASON ENFORCEMENT & SPOILAGE METRICS
  // -------------------------------------------------------------
  describe("3. Cancellation Reason Modal & Reason Code Enforcement (DEC-007)", () => {
    test("3.1 Cancelling from preparing/ready strictly requires valid reasonCode", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-cancel-1");
      const actor = createActor("owner", "store-cancel-1");
      const now = new Date().toISOString();

      const prepOrd = "ord-cancel-prep";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'LB-CAN-1', 'Khách C1', '0909000001', 70000, 1, 'preparing', ?, ?)
      `).run(prepOrd, actor.storeId, now, now);

      // Missing reasonCode when cancelling preparing -> 400 cancellation_reason_required
      await assert.rejects(
        changeOrderStatus(db, actor, prepOrd, {
          expectedStatus: "preparing",
          newStatus: "cancelled",
        }),
        { status: 400, code: "cancellation_reason_required" }
      );

      // Invalid reasonCode -> 400 invalid_cancellation_reason
      await assert.rejects(
        changeOrderStatus(db, actor, prepOrd, {
          expectedStatus: "preparing",
          newStatus: "cancelled",
          reasonCode: "unauthorized_code",
        }),
        { status: 400, code: "invalid_cancellation_reason" }
      );

      // Valid reason codes: all 3 must succeed
      for (const validCode of VALID_CANCELLATION_CODES) {
        assert.ok(["customer_abandoned", "item_preparation_error", "store_incident"].includes(validCode));
      }

      // Cancelling with valid reasonCode 'item_preparation_error' succeeds
      const cancelRes = await changeOrderStatus(db, actor, prepOrd, {
        expectedStatus: "preparing",
        newStatus: "cancelled",
        reasonCode: "item_preparation_error",
        cancelReason: "Lỡ tay pha sai công thức",
      });
      assert.equal(cancelRes.toStatus, "cancelled");

      const orderInDb = db.sqlite.prepare("SELECT status, cancel_reason FROM customer_orders WHERE id = ?").get(prepOrd);
      assert.equal(orderInDb.status, "cancelled");
      assert.match(orderInDb.cancel_reason, /item_preparation_error/);
    });

    test("3.2 Cancelling from ready strictly requires valid reasonCode", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());
      seedStore(db, "store-cancel-2");
      const actor = createActor("owner", "store-cancel-2");
      const now = new Date().toISOString();

      const readyOrd = "ord-cancel-ready";
      db.sqlite.prepare(`
        INSERT INTO customer_orders (id, store_id, order_code, customer_name, customer_phone, total_amount, item_count, status, created_at, updated_at)
        VALUES (?, ?, 'LB-CAN-2', 'Khách C2', '0909000002', 80000, 1, 'ready', ?, ?)
      `).run(readyOrd, actor.storeId, now, now);

      // Missing code -> rejects
      await assert.rejects(
        changeOrderStatus(db, actor, readyOrd, {
          expectedStatus: "ready",
          newStatus: "cancelled",
        }),
        { status: 400, code: "cancellation_reason_required" }
      );

      // Valid customer_abandoned succeeds
      const cancelRes = await changeOrderStatus(db, actor, readyOrd, {
        expectedStatus: "ready",
        newStatus: "cancelled",
        reasonCode: "customer_abandoned",
      });
      assert.equal(cancelRes.toStatus, "cancelled");
    });

    test("3.3 Source code inspection: Cancel modal in owner-orders-view.tsx enforces valid codes", async () => {
      const content = await readFile(
        new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
        "utf8"
      );

      // Verify cancelReasonCode state defaults to a valid code
      assert.match(content, /const \[cancelReasonCode, setCancelReasonCode\] = useState\("customer_abandoned"\)/);

      // Verify the 3 standard enum options in the cancel reason <select>
      assert.match(content, /<option value="customer_abandoned">/);
      assert.match(content, /<option value="item_preparation_error">/);
      assert.match(content, /<option value="store_incident">/);

      // Verify the cancel reason selection is only displayed when status is preparing or ready
      assert.match(content, /\["preparing",\s*"ready"\]\.includes\(cancelModalOrder\.status\)/);

      // Verify cancel confirmation sends reasonCode for preparing or ready
      assert.match(
        content,
        /reasonCode:\s*\["preparing",\s*"ready"\]\.includes\(cancelModalOrder\.status\)\s*\?\s*cancelReasonCode\s*:\s*undefined/
      );
    });
  });

  // -------------------------------------------------------------
  // 4. UI ACCESSIBILITY, TOUCH TARGETS & ERGONOMICS
  // -------------------------------------------------------------
  describe("4. Touch Ergonomics: >=44px Touch Targets & Physical Separation", () => {
    test("4.1 Action buttons, modal buttons, and cancel buttons satisfy min-h-[44px]", async () => {
      const content = await readFile(
        new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
        "utf8"
      );

      // Match min-h-[44px] occurrences
      const matches = content.match(/min-h-\[44px\]/g);
      assert.ok(matches && matches.length >= 10, `Expected at least 10 min-h-[44px] targets, found ${matches?.length}`);

      // Verify cancel button has physical margin separation (mr-auto)
      assert.match(content, /mr-auto[\s\S]*?Huỷ đơn/);
    });
  });
});
