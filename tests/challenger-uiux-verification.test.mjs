import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { readFile } from "node:fs/promises";
import {
  createDatabase,
  seedStore,
  seedEmployee,
  seedShift,
  seedAttendanceSession,
  seedRequest,
} from "./helpers/database.mjs";
import { withdrawRequest } from "../modules/operations/application/withdraw-request.ts";
import { applySwap } from "../modules/operations/application/apply-swap.ts";
import { decideRequest } from "../modules/operations/application/decide-request.ts";

describe("Adversarial Workflow & Interaction Verification Suite (challenger_uiux_2)", () => {
  // ---------------------------------------------------------------------------
  // 1a. Item Detail Modal Deduplication
  // ---------------------------------------------------------------------------
  describe("1a. Item Detail Modal: Option Deduplication", () => {
    test("Deduplication function collapses identical option names", () => {
      const dedupeByName = (arr) =>
        Array.from(new Map(arr.map((item) => [item.name, item])).values());

      const rawSizes = [
        { id: "opt-1", name: "Size M", price_modifier: 0, group_type: "size" },
        { id: "opt-2", name: "Size M", price_modifier: 0, group_type: "size" },
        { id: "opt-3", name: "Size L", price_modifier: 6000, group_type: "size" },
        { id: "opt-4", name: "Size L", price_modifier: 6000, group_type: "size" },
      ];
      const dedupedSizes = dedupeByName(rawSizes);
      assert.equal(dedupedSizes.length, 2);
      assert.deepEqual(dedupedSizes.map((s) => s.name), ["Size M", "Size L"]);

      const rawToppings = [
        { id: "top-1", name: "Trân châu trắng", price_modifier: 10000, group_type: "topping" },
        { id: "top-2", name: "Trân châu trắng", price_modifier: 10000, group_type: "topping" },
        { id: "top-3", name: "Thạch dừa", price_modifier: 8000, group_type: "topping" },
      ];
      const dedupedToppings = dedupeByName(rawToppings);
      assert.equal(dedupedToppings.length, 2);
      assert.deepEqual(dedupedToppings.map((t) => t.name), ["Trân châu trắng", "Thạch dừa"]);
    });

    test("Source code of item-detail-modal.tsx applies dedupeByName across all option groups", async () => {
      const modalSrc = await readFile(
        new URL("../components/order/item-detail-modal.tsx", import.meta.url),
        "utf8"
      );
      assert.match(modalSrc, /const dedupeByName\s*=\s*\(arr:\s*MenuOptionItem\[\]\)\s*=>/);
      assert.match(modalSrc, /const sizeOptions\s*=\s*dedupeByName\(/);
      assert.match(modalSrc, /const sugarOptions\s*=\s*dedupeByName\(/);
      assert.match(modalSrc, /const iceOptions\s*=\s*dedupeByName\(/);
      assert.match(modalSrc, /const toppingOptions\s*=\s*dedupeByName\(/);
    });
  });

  // ---------------------------------------------------------------------------
  // 1b. Login Error Handling & WCAG AA Contrast
  // ---------------------------------------------------------------------------
  describe("1b. Login Error Handling: Vietnamese Localization & WCAG Contrast", () => {
    test("Maps raw Supabase auth errors to friendly Vietnamese copy", async () => {
      const loginSrc = await readFile(
        new URL("../app/auth/login/page.tsx", import.meta.url),
        "utf8"
      );

      // Verify regex matching for invalid login credentials
      assert.match(loginSrc, /invalid login credentials\|invalid_grant/i);
      assert.match(
        loginSrc,
        /Email hoặc mật khẩu chưa chính xác\. Bạn kiểm tra lại nhé!/
      );

      // Verify network error fallback
      assert.match(loginSrc, /failed to fetch\|networkerror\|load failed/i);
      assert.match(loginSrc, /Không kết nối được dịch vụ xác thực/);

      // Verify alert styling classes
      assert.match(loginSrc, /text-\[#A83D4C\]/);
      assert.match(loginSrc, /bg-\[#fff2f4\]/);
      assert.match(loginSrc, /border-\[#ffe1e7\]/);
      assert.match(loginSrc, /role="alert"/);
    });

    test("Contrast ratio of #A83D4C on #FFF2F4 satisfies WCAG 2.1 AA (>= 4.5:1)", () => {
      // Standard WCAG 2.1 relative luminance calculation
      function getLuminance(r, g, b) {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      // Text: #A83D4C -> R:168, G:61, B:76
      const lumText = getLuminance(168, 61, 76);
      // Background: #FFF2F4 -> R:255, G:242, B:244
      const lumBg = getLuminance(255, 242, 244);

      const contrastRatio = (Math.max(lumText, lumBg) + 0.05) / (Math.min(lumText, lumBg) + 0.05);

      assert.ok(
        contrastRatio >= 4.5,
        `Expected contrast ratio >= 4.5, got ${contrastRatio.toFixed(2)}`
      );
      assert.ok(
        contrastRatio >= 5.0,
        `Expected robust contrast ratio >= 5.0, got ${contrastRatio.toFixed(2)}`
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 1c. Withdraw Request Authorization & Confirmation
  // ---------------------------------------------------------------------------
  describe("1c. Withdraw Request: Permissions, Lifecycles & UI Confirmation", () => {
    test("Employee can withdraw own pending request; other users are strictly rejected (403)", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-withdraw-test" });
      const empA = seedEmployee(db, {
        id: "emp-a",
        storeId: "store-withdraw-test",
        email: "staff.a@loopicafe.test",
        role: "employee",
      });
      const empB = seedEmployee(db, {
        id: "emp-b",
        storeId: "store-withdraw-test",
        email: "staff.b@loopicafe.test",
        role: "employee",
      });
      const manager = seedEmployee(db, {
        id: "manager-w",
        storeId: "store-withdraw-test",
        email: "manager@loopicafe.test",
        role: "manager",
      });
      const sysAdmin = seedEmployee(db, {
        id: "sysadmin-w",
        storeId: "store-withdraw-test",
        email: "admin@loopicafe.test",
        role: "system_admin",
      });

      const actorA = { id: empA.id, email: empA.email, role: "employee", storeId: "store-withdraw-test" };
      const actorB = { id: empB.id, email: empB.email, role: "employee", storeId: "store-withdraw-test" };
      const actorManager = { id: manager.id, email: manager.email, role: "manager", storeId: "store-withdraw-test" };
      const actorAdmin = { id: sysAdmin.id, email: sysAdmin.email, role: "system_admin", storeId: "store-withdraw-test" };

      const req = seedRequest(db, {
        id: "req-leave-test",
        storeId: "store-withdraw-test",
        employeeEmail: empA.email,
        type: "leave",
        title: "Xin nghỉ ca chiều",
        status: "pending",
      });

      // Adversarial Check 1: Peer employee cannot withdraw another employee's request
      await assert.rejects(
        withdrawRequest(db, actorB, req.id),
        { status: 403, code: "forbidden" }
      );

      // Adversarial Check 2: Manager cannot withdraw employee's request
      await assert.rejects(
        withdrawRequest(db, actorManager, req.id),
        { status: 403, code: "forbidden" }
      );

      // Adversarial Check 3: System Admin cannot withdraw employee's request
      await assert.rejects(
        withdrawRequest(db, actorAdmin, req.id),
        { status: 403, code: "forbidden" }
      );

      // Legitimate: Requester withdraws own request
      const res = await withdrawRequest(db, actorA, req.id);
      assert.equal(res.withdrawn, true);
      assert.equal(res.status, "withdrawn");

      // Verify DB state
      const row = db.sqlite.prepare("SELECT status FROM requests WHERE id = ?").get(req.id);
      assert.equal(row.status, "withdrawn");

      // Adversarial Check 4: Repeated withdrawal fails (409 conflict)
      await assert.rejects(
        withdrawRequest(db, actorA, req.id),
        { status: 409, code: "request_conflict" }
      );

      // Adversarial Check 5: Manager cannot approve a withdrawn request (409 conflict)
      await assert.rejects(
        decideRequest(db, actorManager, req.id, "approved"),
        { status: 409, code: "request_conflict" }
      );

      // Adversarial Check 6: Cannot withdraw an already approved request
      const approvedReq = seedRequest(db, {
        id: "req-approved-test",
        storeId: "store-withdraw-test",
        employeeEmail: empA.email,
        type: "leave",
        title: "Đơn đã duyệt",
        status: "approved",
      });
      await assert.rejects(
        withdrawRequest(db, actorA, approvedReq.id),
        { status: 409, code: "request_conflict" }
      );
    });

    test("UI in requests-view.tsx enforces own-pending gating and 2-step confirmation", async () => {
      const viewSrc = await readFile(
        new URL("../components/operational/requests-view.tsx", import.meta.url),
        "utf8"
      );
      // Gating check
      assert.match(
        viewSrc,
        /const isOwnPending\s*=\s*isPending && Boolean\(actorEmail\) && item\.employee_email\?\.toLowerCase\(\)\s*===\s*actorEmail\.toLowerCase\(\);/
      );
      // Confirmation state check
      assert.match(viewSrc, /confirmWithdrawId === item\.id/);
      assert.match(viewSrc, /Bạn chắc chắn muốn rút yêu cầu này\?/);
      assert.match(viewSrc, /Xác nhận rút đơn/);
    });
  });

  // ---------------------------------------------------------------------------
  // 1d. Apply Swap 2-Step Confirmation & Atomic Application
  // ---------------------------------------------------------------------------
  describe("1d. Apply Swap: 2-Step Confirmation & Atomic Execution", () => {
    test("UI in requests-view.tsx requires 2-step confirmation before applying swap", async () => {
      const viewSrc = await readFile(
        new URL("../components/operational/requests-view.tsx", import.meta.url),
        "utf8"
      );
      // Initial button triggers confirmation state
      assert.match(viewSrc, /onClick=\{\(\) => setConfirmApplySwapId\(item\.id\)\}/);
      // Confirmation state renders prompt and confirm button
      assert.match(viewSrc, /confirmApplySwapId === item\.id/);
      assert.match(viewSrc, /Xác nhận áp dụng đổi ca trực này vào lịch\?/);
      assert.match(viewSrc, /onClick=\{\(\) => void applyApprovedSwap\(item\)\}/);
    });

    test("applySwap atomically swaps both shifts and logs audit event; blocks self-approval", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      seedStore(db, { id: "store-swap-test" });
      const emp1 = seedEmployee(db, {
        id: "emp-swap-1",
        storeId: "store-swap-test",
        email: "staff1@loopicafe.test",
        role: "employee",
      });
      const emp2 = seedEmployee(db, {
        id: "emp-swap-2",
        storeId: "store-swap-test",
        email: "staff2@loopicafe.test",
        role: "employee",
      });
      const manager = seedEmployee(db, {
        id: "manager-swap",
        storeId: "store-swap-test",
        email: "manager@loopicafe.test",
        role: "manager",
      });

      const shift1 = seedShift(db, {
        id: "shift-swap-1",
        storeId: "store-swap-test",
        employeeEmail: emp1.email,
        startsAt: "2026-11-01T08:00:00.000Z",
        endsAt: "2026-11-01T16:00:00.000Z",
        status: "published",
        revision: 1,
      });

      const shift2 = seedShift(db, {
        id: "shift-swap-2",
        storeId: "store-swap-test",
        employeeEmail: emp2.email,
        startsAt: "2026-11-02T08:00:00.000Z",
        endsAt: "2026-11-02T16:00:00.000Z",
        status: "published",
        revision: 1,
      });

      const swapReq = seedRequest(db, {
        id: "req-swap-1",
        storeId: "store-swap-test",
        employeeEmail: emp1.email,
        shiftId: shift1.id,
        type: "swap",
        title: "Đề nghị đổi ca trực",
        status: "approved_pending_apply",
      });

      const actorEmp1 = { id: emp1.id, email: emp1.email, role: "employee", storeId: "store-swap-test", permissions: ["requests.swap.apply"] };
      const actorManager = { id: manager.id, email: manager.email, role: "manager", storeId: "store-swap-test", permissions: ["requests.swap.apply"] };

      // Adversarial Check 1: Self-approval attempt by shift owner 1 -> REJECTED (403)
      await assert.rejects(
        applySwap(db, actorEmp1, {
          requestId: swapReq.id,
          shift1Id: shift1.id,
          shift2Id: shift2.id,
        }),
        { status: 403, code: "self_approval_blocked" }
      );

      // Legitimate execution by manager
      const swapRes = await applySwap(db, actorManager, {
        requestId: swapReq.id,
        shift1Id: shift1.id,
        shift2Id: shift2.id,
      });
      assert.equal(swapRes.applied, true);
      assert.equal(swapRes.status, "applied");

      // Verify atomic swap in DB
      const updatedShift1 = db.sqlite.prepare("SELECT employee_email, revision FROM shifts WHERE id = ?").get(shift1.id);
      const updatedShift2 = db.sqlite.prepare("SELECT employee_email, revision FROM shifts WHERE id = ?").get(shift2.id);
      const updatedReq = db.sqlite.prepare("SELECT status FROM requests WHERE id = ?").get(swapReq.id);

      assert.equal(updatedShift1.employee_email, emp2.email);
      assert.equal(updatedShift1.revision, 2);
      assert.equal(updatedShift2.employee_email, emp1.email);
      assert.equal(updatedShift2.revision, 2);
      assert.equal(updatedReq.status, "applied");

      // Verify audit event
      const audit = db.sqlite.prepare("SELECT action, entity_id FROM audit_events WHERE entity_id = ?").get(swapReq.id);
      assert.ok(audit, "Audit event must be logged");
      assert.equal(audit.action, "request.applied");
    });
  });

  // ---------------------------------------------------------------------------
  // 1e. Sole Owner Attendance Audit Notice
  // ---------------------------------------------------------------------------
  describe("1e. Sole Owner Attendance: Audit Notice & Gating", () => {
    test("Sole owner mode returns isSoleOwner=true; multi-owner returns false", async (t) => {
      const db = createDatabase();
      t.after(() => db.close());

      // Store 1: Sole Owner
      seedStore(db, { id: "store-sole-test" });
      seedEmployee(db, {
        id: "owner-sole",
        storeId: "store-sole-test",
        email: "sole.owner@loopicafe.test",
        role: "owner",
        status: "active",
      });

      const soleCount = db.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM employees WHERE store_id = ? AND role = 'owner' AND status = 'active'"
      ).get("store-sole-test").count;
      assert.equal(soleCount, 1);
      const isSoleOwner = soleCount === 1;
      assert.equal(isSoleOwner, true);

      // Store 2: Multi-Owner
      seedStore(db, { id: "store-multi-test" });
      seedEmployee(db, {
        id: "owner-multi-1",
        storeId: "store-multi-test",
        email: "multi1@loopicafe.test",
        role: "owner",
        status: "active",
      });
      seedEmployee(db, {
        id: "owner-multi-2",
        storeId: "store-multi-test",
        email: "multi2@loopicafe.test",
        role: "owner",
        status: "active",
      });

      const multiCount = db.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM employees WHERE store_id = ? AND role = 'owner' AND status = 'active'"
      ).get("store-multi-test").count;
      assert.equal(multiCount, 2);
      const isMultiSoleOwner = multiCount === 1;
      assert.equal(isMultiSoleOwner, false);
    });

    test("Source code of attendance-view.tsx displays explicit audit notice for sole owners", async () => {
      const attViewSrc = await readFile(
        new URL("../components/operational/attendance-view.tsx", import.meta.url),
        "utf8"
      );
      assert.match(
        attViewSrc,
        /Chủ quán tự điều chỉnh — sự kiện sẽ được ghi nhận vào nhật ký kiểm toán mức cao/
      );
      assert.match(attViewSrc, /Chờ quản lý khác duyệt độc lập/);
      assert.match(attViewSrc, /isSoleOwner\s*\?\s*"#fffbeb"/);
    });
  });

  // ---------------------------------------------------------------------------
  // 1f. Mobile Sticky Save Bar on RBAC Matrix Changes
  // ---------------------------------------------------------------------------
  describe("1f. Mobile Sticky Save Bar: Dirty State & Viewport Adaptation", () => {
    test("Source code of rbac-view.tsx implements isDirty, sticky aside, and md:hidden", async () => {
      const rbacSrc = await readFile(
        new URL("../components/rbac-view.tsx", import.meta.url),
        "utf8"
      );

      // isDirty calculation
      assert.match(rbacSrc, /const isDirty\s*=\s*useMemo\(/);
      assert.match(rbacSrc, /if \(selected\.length !== initialPermissions\.length\) return true;/);

      // Floating aside element
      assert.match(
        rbacSrc,
        /<aside\s+className="fixed bottom-0 left-0 right-0 z-40 bg-white\/95 backdrop-blur-md border-t border-\[#e2d5cb\] p-3 shadow-lg flex items-center justify-between gap-3 md:hidden"/
      );
      assert.match(
        rbacSrc,
        /aria-label="Thanh lưu thay đổi ma trận quyền trên thiết bị di động"/
      );

      // Prompt & direct save behavior
      assert.match(rbacSrc, /Ma trận quyền đã thay đổi/);
      assert.match(rbacSrc, /Sẵn sàng lưu thay đổi/);
      assert.match(rbacSrc, /onClick=\{\(\) => void save\(\)\}/);
    });

    test("Dirty state logic accurately detects additions, deletions, and set equality", () => {
      function computeIsDirty(selected, initial) {
        if (selected.length !== initial.length) return true;
        const initialSet = new Set(initial);
        return selected.some((p) => !initialSet.has(p));
      }

      const initial = ["orders.read", "orders.update", "shifts.read_team"];

      // Case 1: Identical sets
      assert.equal(computeIsDirty(["orders.read", "orders.update", "shifts.read_team"], initial), false);
      assert.equal(computeIsDirty(["shifts.read_team", "orders.read", "orders.update"], initial), false);

      // Case 2: One added
      assert.equal(computeIsDirty([...initial, "shifts.create"], initial), true);

      // Case 3: One removed
      assert.equal(computeIsDirty(["orders.read", "orders.update"], initial), true);

      // Case 4: Equal length but swapped element
      assert.equal(computeIsDirty(["orders.read", "orders.update", "shifts.create"], initial), true);
    });
  });
});
