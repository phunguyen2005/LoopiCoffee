import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("OwnerOrdersView UI/UX: 3-group operational order hierarchy and collapsible history", async () => {
  const content = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );

  // Group 1: Pending with waiting time badge and urgent priority
  assert.match(content, /heading-pending-orders/);
  assert.match(content, /Đơn mới chờ nhận/);
  assert.match(content, /Ưu tiên xử lý/);
  assert.match(content, /getWaitingTimeBadge/);

  // Group 2: Active (accepted, preparing, ready)
  assert.match(content, /heading-active-orders/);
  assert.match(content, /Đang xử lý & Sẵn sàng giao/);

  // Group 3: History (completed, cancelled) with collapsible toggle
  assert.match(content, /heading-history-orders/);
  assert.match(content, /Đã hoàn tất & Đã huỷ/);
  assert.match(content, /isHistoryCollapsed/);
  assert.match(content, /shouldCollapseHistory/);
  assert.match(content, /aria-expanded=\{!shouldCollapseHistory\}/);
});

test("OwnerOrdersView UI/UX: Dual view toggle (Grouped List vs Kanban Board)", async () => {
  const content = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );

  // View mode state
  assert.match(content, /const \[viewMode, setViewMode\] = useState<"list" \| "kanban">\("list"\)/);
  assert.match(content, /Phân nhóm/);
  assert.match(content, /Kanban/);

  // Kanban 4 columns
  assert.match(content, /viewMode === "kanban"/);
  assert.match(content, /Chờ xác nhận/);
  assert.match(content, /Đang pha chế/);
  assert.match(content, /Sẵn sàng giao/);
  assert.match(content, /Đã xong \/ Huỷ/);
  assert.match(content, /isKanbanClosedCollapsed/);
});

test("OwnerOrdersView UI/UX: Minimalist order cards with full recipe formula", async () => {
  const content = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );

  // Redundant stepper is excluded from renderOrderCard loop
  const renderCardBody = content.slice(
    content.indexOf("const renderOrderCard = (ord: OrderRecord) => {"),
    content.indexOf("return (\n    <div className=\"space-y-4")
  );
  assert.doesNotMatch(
    renderCardBody,
    /<OrderWorkflowStepper/,
    "Order cards must not render the redundant 4-step stepper; stepper is reserved for the detail modal"
  );

  // Recipe formula displays size, sugar, ice, toppings chips, item note, order note
  assert.match(renderCardBody, /it\.quantity/);
  assert.match(renderCardBody, /it\.name/);
  assert.match(renderCardBody, /it\.size/);
  assert.match(renderCardBody, /it\.sugar/);
  assert.match(renderCardBody, /it\.ice/);
  assert.match(renderCardBody, /it\.toppings/);
  assert.match(renderCardBody, /it\.note/);
  assert.match(renderCardBody, /ord\.customerNote/);
});

test("OwnerOrdersView UI/UX: Attention filters and touch-optimized buttons", async () => {
  const content = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );

  // Attention filter pills
  assert.match(content, /attentionFilter/);
  assert.match(content, /Có ghi chú/);
  assert.match(content, /Chờ lâu \(&gt;15p\)/);
  assert.match(content, /countWithNote/);
  assert.match(content, /countLongWait/);

  // 1-touch transition buttons with min-h-[44px]
  assert.match(content, /min-h-\[44px\]/);
  assert.match(content, /Nhận & Pha/);
  assert.match(content, /Bắt đầu pha/);
  assert.match(content, /Sẵn sàng/);
  assert.match(content, /Trả khách & Hoàn tất/);
  assert.match(content, /Xong ngay/);

  // Cancel button physical safety separation
  assert.match(content, /Huỷ đơn/);
  assert.match(content, /mr-auto/);
});

test("OwnerOrdersView UI/UX: Preserves all critical architectural and security invariants", async () => {
  const content = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );

  // Single-flight polling & background throttler
  assert.match(content, /document\.addEventListener\(["']visibilitychange["']/);
  assert.match(content, /document\.removeEventListener\(["']visibilitychange["']/);
  assert.match(content, /document\.hidden/);
  assert.match(content, /15000/);
  assert.match(content, /new AbortController\(\)/);
  assert.match(content, /signal:\s*controller\.signal/);
  assert.match(content, /abortControllerRef\.current\.abort\(\)/);
  assert.match(content, /pollTimer\s*=\s*setTimeout\s*\(\s*poll,\s*4000\s*\)/);
  assert.match(content, /LatestRequestGate/);
  assert.match(content, /ordersRequestGateRef\.current\.isCurrent/);

  // Error banners and states
  assert.match(content, /ordersError,\s*setOrdersError/);
  assert.match(content, /orders\.length\s*>\s*0\s*&&\s*ordersError/);
  assert.match(content, /Dữ liệu có thể chưa được cập nhật mới nhất/);
  assert.match(content, /orders\.length\s*===\s*0\s*&&\s*ordersError/);
  assert.match(content, /Không thể tải danh sách đơn hàng/);
  assert.match(content, /Phiên đăng nhập đã hết hạn/);
  assert.match(content, /Thử lại/);

  // Cancel modal & reason enum
  assert.match(content, /cancelModalOrder/);
  assert.match(content, /Xác nhận huỷ/);
  assert.match(content, /customer_abandoned/);
  assert.match(content, /item_preparation_error/);
  assert.match(content, /store_incident/);

  // 4 other tabs preserved
  assert.match(content, /activeTab === "wastage"/);
  assert.match(content, /activeTab === "menu"/);
  assert.match(content, /activeTab === "pricing"/);
  assert.match(content, /activeTab === "settings"/);
});

test("OwnerOrdersView UI/UX: Menu, Pricing, Wastage & Settings tabs meet >= 44px touch targets and clear hierarchy", async () => {
  const content = await readFile(
    new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
    "utf8"
  );

  // Menu tab stock availability filter pills
  assert.match(content, /const \[menuStockFilter, setMenuStockFilter\] = useState<"all" \| "available" \| "out_of_stock">\("all"\)/);
  assert.match(content, /Trạng thái bán:/);
  assert.match(content, /Đang bán/);
  assert.match(content, /Tạm hết/);

  // Option capability badges on menu cards
  assert.match(content, /Size M\/L/);
  assert.match(content, /\+Topping/);

  // Empty filter recovery in menu & pricing
  assert.match(content, /Không tìm thấy món phù hợp/);
  assert.match(content, /Không tìm thấy topping phù hợp/);
  assert.match(content, /Xóa bộ lọc/);

  // Quick price step adjustments (-5k / +5k) and Enter/Escape keyboard support in Pricing tab
  assert.match(content, /-5k/);
  assert.match(content, /\+5k/);
  assert.match(content, /e\.key === "Enter"/);
  assert.match(content, /e\.key === "Escape"/);

  // No native blocking alert() calls in OwnerOrdersView
  assert.doesNotMatch(content, /\balert\s*\(/, "OwnerOrdersView should use non-blocking statusFeedback instead of native alert()");
});

test("MenuImportModal UI/UX: Preview filter pills, responsive mobile card list + desktop table, and >= 44px touch targets", async () => {
  const content = await readFile(
    new URL("../components/operational/menu-import-modal.tsx", import.meta.url),
    "utf8"
  );

  // Preview filter pills (all / new / update / invalid)
  assert.match(content, /const \[previewFilter, setPreviewFilter\] = useState<"all" \| "new" \| "update" \| "invalid">\("all"\)/);
  assert.match(content, /newValidItems/);
  assert.match(content, /updateValidItems/);
  assert.match(content, /filteredCandidates/);
  assert.match(content, /Dòng lỗi/);

  // Responsive dual layout: mobile stacked cards (sm:hidden) + desktop table (hidden sm:table)
  assert.match(content, /sm:hidden divide-y divide-\[#f5efec\]/);
  assert.match(content, /hidden sm:table w-full text-left text-xs/);

  // Safe area bottom padding and >= 44px touch targets
  assert.match(content, /min-h-\[44px\]/);
  assert.match(content, /env\(safe-area-inset-bottom,0px\)/);
});
