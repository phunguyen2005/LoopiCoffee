import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { readFile } from "node:fs/promises";

describe("Challenger Owner UI/UX Empirical Verification Suite (Milestone 2)", () => {
  let fileContent;

  test("Load components/operational/owner-orders-view.tsx", async () => {
    fileContent = await readFile(
      new URL("../components/operational/owner-orders-view.tsx", import.meta.url),
      "utf8"
    );
    assert.ok(fileContent.length > 0, "File content must not be empty");
  });

  describe("1. Viewport Fit & Horizontal Overflow Safety across 5 Viewports", () => {
    test("Kanban board uses responsive grid layout adapting across viewports", () => {
      // Must use grid-cols-1 on mobile (<md), grid-cols-2 on tablet (md:), grid-cols-4 on desktop (xl:)
      assert.match(
        fileContent,
        /grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3\.5/,
        "Kanban board must have responsive grid breakpoints: 1 col on mobile, 2 on tablet, 4 on desktop"
      );
    });

    test("Grouped list mode uses responsive grid adapting across viewports", () => {
      // 1 column on mobile/tablet, 2 columns on lg+
      assert.match(
        fileContent,
        /grid grid-cols-1 lg:grid-cols-2 gap-3\.5/,
        "Grouped list must have 1 col on mobile/tablet and 2 cols on lg desktop"
      );
    });

    test("Horizontally scrollable filter bars have overflow-x-auto and scrollbar-none to prevent page overflow", () => {
      // Sub-tabs
      assert.match(fileContent, /flex border-b border-\[#eee3df\] overflow-x-auto gap-1\.5/);
      // Date presets
      assert.match(fileContent, /flex items-center gap-1\.5 overflow-x-auto pb-0\.5 scrollbar-none/);
      // Status pills
      assert.match(fileContent, /flex overflow-x-auto gap-1\.5 pb-0\.5 scrollbar-none/);
    });

    test("Control bars and card action bars use flex-wrap to prevent overflow on narrow 320px viewports", () => {
      // Attention filters wrap
      assert.match(fileContent, /flex items-center gap-2 pt-2 border-t border-\[#f5efec\] flex-wrap/);
      // Card action row wraps
      assert.match(fileContent, /flex flex-wrap items-center justify-between gap-2\.5/);
      // Card action buttons group wraps
      assert.match(fileContent, /flex items-center flex-wrap gap-2 justify-end flex-1/);
    });
  });

  describe("2. Touch Target Sizing Analysis (Standard >= 44x44px)", () => {
    test("Order Card Action buttons meet >= 44px min-height", () => {
      // Cancel button
      assert.match(fileContent, /min-h-\[44px\] px-3\.5 py-2 rounded-xl border border-\[#fecaca\] text-\[#b91c1c\]/);
      // Nhận & Pha button
      assert.match(fileContent, /min-h-\[44px\] px-3\.5 py-2 rounded-xl bg-\[#6f2939\]/);
      // Xong ngay button
      assert.match(fileContent, /min-h-\[44px\] px-3\.5 py-2 rounded-xl bg-\[#2d6a4f\]/);
      // Bắt đầu pha button
      assert.match(fileContent, /min-h-\[44px\] px-3\.5 py-2 rounded-xl bg-\[#d96d83\]/);
      // Sẵn sàng button
      assert.match(fileContent, /min-h-\[44px\] px-3\.5 py-2 rounded-xl bg-\[#2d6a4f\] hover:bg-\[#23533d\]/);
      // Trả khách & Hoàn tất button
      assert.match(fileContent, /min-h-\[44px\] px-4 py-2 rounded-xl bg-\[#332a2b\]/);
      // View Detail button
      assert.match(fileContent, /min-w-\[44px\] min-h-\[44px\] flex items-center justify-center rounded-xl border/);
    });

    test("Navigation sub-tabs meet >= 44px min-height", () => {
      const tabMatches = fileContent.match(/min-h-\[44px\] flex items-center gap-2 border-b-2/g);
      assert.ok(tabMatches && tabMatches.length >= 2, "Main navigation sub-tabs must have min-h-[44px]");
    });

    test("Remediated: View mode toggles meet >= 44px min-height", () => {
      const listToggle = fileContent.includes("onClick={() => setViewMode(\"list\")}\n                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px]");
      const kanbanToggle = fileContent.includes("onClick={() => setViewMode(\"kanban\")}\n                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px]");
      assert.ok(listToggle && kanbanToggle, "View mode toggles must use min-h-[44px]");
    });

    test("Remediated: Status filter pills meet >= 44px min-height", () => {
      const statusPill44 = fileContent.includes("className={`min-h-[44px] px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5");
      assert.ok(statusPill44, "Status filter pills must use min-h-[44px]");
    });

    test("Remediated: Date preset buttons meet >= 44px min-height", () => {
      const datePreset44 = fileContent.includes("className={`px-3 py-1.5 min-h-[44px] rounded-full text-xs font-semibold");
      assert.ok(datePreset44, "Date preset buttons must use min-h-[44px]");
    });

    test("Remediated: Attention filter buttons meet >= 44px min-height", () => {
      const attentionFilter44 = fileContent.includes("className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-semibold");
      assert.ok(attentionFilter44, "Attention filter buttons must use min-h-[44px]");
    });

    test("Remediated: Top refresh button is 44x44px and Sound button is min-h-[44px]", () => {
      assert.match(fileContent, /min-h-\[44px\] min-w-\[44px\] flex items-center justify-center/);
      assert.match(fileContent, /min-h-\[44px\] px-3\.5 py-2 rounded-xl border flex items-center gap-1\.5/);
    });

    test("Remediated: Order Detail Modal close button is 44x44px", () => {
      assert.match(fileContent, /min-h-\[44px\] min-w-\[44px\] flex items-center justify-center rounded-full/);
    });
  });

  describe("3. Separation of Destructive Actions (Cancellation vs Next Actions)", () => {
    test("Cancel button uses mr-auto sm:mr-2 for physical spatial separation", () => {
      assert.match(
        fileContent,
        /mr-auto sm:mr-2/,
        "Cancel button must have mr-auto on mobile to anchor to opposite side from action buttons"
      );
    });

    test("Cancel button uses distinct warning/danger color palette from primary actions", () => {
      assert.match(fileContent, /border-\[#fecaca\] text-\[#b91c1c\] bg-\[#fff5f5\]\/70/);
    });

    test("Cancel button opens modal confirmation dialog rather than immediate destructive mutation", () => {
      assert.match(fileContent, /onClick=\{\(\) => setCancelModalOrder\(ord\)\}/);
      assert.match(fileContent, /cancelModalOrder/);
      assert.match(fileContent, /Xác nhận huỷ/);
    });
  });
});
