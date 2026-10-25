"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ShoppingBag,
  Clock,
  Search,
  RefreshCw,
  Phone,
  Volume2,
  VolumeX,
  ChevronRight,
  ExternalLink,
  Edit2,
  Check,
  X,
  Store,
  DollarSign,
  Layers,
  ArrowRight,
  Trash2,
  Plus,
  Calendar,
  AlertCircle,
  ClipboardX,
  Coffee,
  CheckCheck,
  Sparkles,
  FileSpreadsheet,
} from "lucide-react";
import { formatVND } from "../order/menu-card";
import { DrinkVisual } from "../order/drink-visual";
import { AsyncStatePanel, ListSkeleton, readJson } from "./shared";
import { LatestRequestGate } from "@/platform/http/latest-request";
import { useModalDialog } from "../order/use-modal-dialog";
import { ClientPortal } from "@/components/ui/client-portal";
import { MenuImportModal } from "./menu-import-modal";
import {
  MENU_FILTER_PRESETS,
  matchesMenuFilter,
  getPresetCounts,
  normalizeMenuText,
} from "@/lib/menu-filter";

interface OrderItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  size?: string | null;
  sugar?: string | null;
  ice?: string | null;
  toppings?: Array<{ name: string; price: number }>;
  note?: string | null;
}

interface OrderRecord {
  id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  customerNote?: string | null;
  totalAmount: number;
  itemCount: number;
  status: "pending" | "accepted" | "preparing" | "ready" | "completed" | "cancelled";
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

interface OrderCounts {
  total: number;
  pending: number;
  accepted: number;
  preparing: number;
  ready: number;
  completed: number;
  cancelled: number;
}

interface WastageMetrics {
  spoiledOrdersCount: number;
  estimatedRetailValue: number;
  byReason: Record<"customer_abandoned" | "item_preparation_error" | "store_incident", number>;
}

interface WastageEntry {
  orderId: string;
  orderCode: string;
  estimatedRetailValue: number;
  itemCount: number;
  fromStatus: "preparing" | "ready";
  reasonCode: "customer_abandoned" | "item_preparation_error" | "store_incident";
  note: string | null;
  cancelledBy: string | null;
  cancelledAt: string;
}

interface MenuItemManagement {
  id: string;
  category_id: string;
  name: string;
  english_name?: string | null;
  description?: string | null;
  base_price: number;
  image_url: string;
  badge?: string | null;
  is_available: boolean | number;
  allows_size?: boolean | number;
  allows_sugar?: boolean | number;
  allows_ice?: boolean | number;
  allows_toppings?: boolean | number;
  sort_order?: number;
  updated_at: string;
}

interface CategoryManagement {
  id: string;
  name: string;
  english_name?: string | null;
}

interface MenuOptionManagement {
  id: string;
  store_id?: string;
  group_type: string;
  name: string;
  price_modifier: number;
  is_available: boolean | number;
  sort_order?: number;
}

// Play notification sound using Web Audio API synthesis
function playChimeSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880.0, now + 0.15); // A5
    gain2.gain.setValueAtTime(0.4, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.8);
  } catch {
    // Audio may be blocked by browser autoplay policy until user interaction
  }
}

function OrderWorkflowStepper({ status }: { status: OrderRecord["status"] }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-xl bg-[#fff5f5] text-[#b91c1c] text-xs font-bold border border-[#fecaca] my-2">
        <X size={13} strokeWidth={3} />
        <span>Đơn đã bị huỷ</span>
      </div>
    );
  }

  const stages = [
    { key: "received", label: "Tiếp nhận", step: 1, active: ["pending", "accepted", "preparing", "ready", "completed"].includes(status), current: status === "pending" || status === "accepted" },
    { key: "preparing", label: "Pha chế", step: 2, active: ["preparing", "ready", "completed"].includes(status), current: status === "preparing" },
    { key: "ready", label: "Sẵn sàng", step: 3, active: ["ready", "completed"].includes(status), current: status === "ready" },
    { key: "completed", label: "Hoàn tất", step: 4, active: status === "completed", current: status === "completed" },
  ];

  return (
    <div className="w-full my-2.5 py-1.5 px-2 bg-[#fffaf8] rounded-xl border border-[#f5efec]">
      <div className="flex items-center justify-between relative px-2">
        {/* Progress Track Line */}
        <div className="absolute left-5 right-5 top-2.5 h-0.5 bg-[#ede4e0] -z-0" />

        {stages.map((st) => {
          const isDone = st.active && !st.current;
          const isCurrent = st.current;
          return (
            <div key={st.key} className="flex flex-col items-center relative z-10 gap-0.5">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                  isCurrent
                    ? "bg-[#6f2939] text-white ring-4 ring-[#f4a9b7]/50 scale-110 shadow-xs"
                    : isDone
                    ? "bg-[#2d6a4f] text-white shadow-xs"
                    : "bg-[#e5dcd8] text-[#8a7f7c]"
                }`}
              >
                {isDone ? <Check size={11} strokeWidth={3.5} /> : st.step}
              </div>
              <span
                className={`text-[9.5px] font-semibold tracking-tight whitespace-nowrap ${
                  isCurrent
                    ? "text-[#6f2939] font-bold"
                    : isDone
                    ? "text-[#2d6a4f]"
                    : "text-[#9c9391]"
                }`}
              >
                {st.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OwnerOrdersView({ permissions = [] }: { permissions?: readonly string[] }) {
  const [activeTab, setActiveTab] = useState<"orders" | "wastage" | "menu" | "pricing" | "settings">("orders");
  const canTransitionOrders = permissions.includes("orders.transition");
  const canCancelOrders = permissions.includes("orders.cancel");
  const canManageMenu = permissions.includes("menu.manage");

  // Orders State
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [counts, setCounts] = useState<OrderCounts | null>(null);
  const [isOrderingOpen, setIsOrderingOpen] = useState<boolean | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<{ message: string; status?: number; code?: string } | null>(null);
  const [ordersUpdatedAt, setOrdersUpdatedAt] = useState<Date | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(true);
  const [storeStatusError, setStoreStatusError] = useState("");
  const ordersRequestGateRef = useRef(new LatestRequestGate());
  const abortControllerRef = useRef<AbortController | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [wastage, setWastage] = useState<WastageMetrics | null>(null);
  const [wastageReport, setWastageReport] = useState<WastageEntry[]>([]);
  const [statusFeedback, setStatusFeedback] = useState<{ kind: "error" | "success"; message: string } | null>(null);

  // Date filter state: "all" | "today" | "yesterday" | "7days" | "custom"
  const [datePreset, setDatePreset] = useState<"all" | "today" | "yesterday" | "7days" | "custom">("all");
  const [customDate, setCustomDate] = useState<string>("");

  const buildDateQuery = useCallback(() => {
    const todayStr = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (datePreset === "today") {
      return `date=${todayStr}`;
    }
    if (datePreset === "yesterday") {
      const yesterday = new Date(Date.now() - 86400000 + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return `date=${yesterday}`;
    }
    if (datePreset === "7days") {
      const sevenDaysAgo = new Date(Date.now() - 6 * 86400000 + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return `startDate=${sevenDaysAgo}&endDate=${todayStr}`;
    }
    if (datePreset === "custom" && customDate) {
      return `date=${customDate}`;
    }
    return "";
  }, [datePreset, customDate]);

  // Sound alert
  const [soundEnabled, setSoundEnabled] = useState(true);
  const previousPendingCount = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Cancellation Modal State
  const [cancelModalOrder, setCancelModalOrder] = useState<OrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonCode, setCancelReasonCode] = useState("customer_abandoned");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Set<string>>(new Set());
  const cancelDialogRef = useModalDialog(Boolean(cancelModalOrder), () => {
    if (!isUpdatingStatus) setCancelModalOrder(null);
  });

  // Menu Management State
  const [menuItems, setMenuItems] = useState<MenuItemManagement[]>([]);
  const [categories, setCategories] = useState<CategoryManagement[]>([]);
  const [menuOptions, setMenuOptions] = useState<MenuOptionManagement[]>([]);
  const [updatingOptionIds, setUpdatingOptionIds] = useState<Set<string>>(new Set());
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [updatingMenuItemIds, setUpdatingMenuItemIds] = useState<Set<string>>(new Set());
  const menuRequestIdRef = useRef(0);
  const menuAbortControllerRef = useRef<AbortController | null>(null);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [newPriceValue, setNewPriceValue] = useState<number>(0);
  const [editingOptionPriceId, setEditingOptionPriceId] = useState<string | null>(null);
  const [newOptionPriceValue, setNewOptionPriceValue] = useState<number>(0);

  // Filter & Search inside Menu Tab
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [menuSearchQuery, setMenuSearchQuery] = useState<string>("");

  // Filter & Search inside Pricing Tab
  const [pricingCategoryFilter, setPricingCategoryFilter] = useState<string>("all");
  const [pricingSearchQuery, setPricingSearchQuery] = useState<string>("");

  const ownerPresetCounts = useMemo(
    () => getPresetCounts(menuItems, categories, menuOptions.length),
    [menuItems, categories, menuOptions],
  );

  // Topping Modal State
  const [isToppingModalOpen, setIsToppingModalOpen] = useState(false);
  const [toppingFormData, setToppingFormData] = useState({
    name: "",
    priceModifier: 5000,
    isAvailable: true,
  });
  const [savingTopping, setSavingTopping] = useState(false);
  const [deletingOption, setDeletingOption] = useState<MenuOptionManagement | null>(null);
  const [isDeletingOption, setIsDeletingOption] = useState(false);

  // Item Create / Edit Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [itemModalMode, setItemModalMode] = useState<"create" | "edit">("create");
  const [itemFormData, setItemFormData] = useState<{
    id?: string;
    name: string;
    englishName: string;
    categoryId: string;
    basePrice: number;
    description: string;
    badge: string;
    isAvailable: boolean;
    allowsSize: boolean;
    allowsSugar: boolean;
    allowsIce: boolean;
    allowsToppings: boolean;
    sortOrder: number;
    imageUrl: string;
  }>({
    name: "",
    englishName: "",
    categoryId: "",
    basePrice: 35000,
    description: "",
    badge: "",
    isAvailable: true,
    allowsSize: true,
    allowsSugar: true,
    allowsIce: true,
    allowsToppings: true,
    sortOrder: 0,
    imageUrl: "/laboong/drinks/default.jpg",
  });
  const [savingItem, setSavingItem] = useState(false);
  const [itemModalError, setItemModalError] = useState<string | null>(null);

  // Delete Item Confirmation Modal State
  const [deletingItem, setDeletingItem] = useState<MenuItemManagement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const itemDialogRef = useModalDialog(isItemModalOpen, () => {
    if (!savingItem) setIsItemModalOpen(false);
  });
  const toppingDialogRef = useModalDialog(isToppingModalOpen, () => {
    if (!savingTopping) setIsToppingModalOpen(false);
  });
  const orderDetailDialogRef = useModalDialog(Boolean(selectedOrder), () => {
    setSelectedOrder(null);
  });
  const deleteDialogRef = useModalDialog(Boolean(deletingItem), () => {
    if (!isDeleting) setDeletingItem(null);
  });
  const deleteOptionDialogRef = useModalDialog(Boolean(deletingOption), () => {
    if (!isDeletingOption) setDeletingOption(null);
  });

  // Ensure category is automatically selected if categories loaded after modal opened
  useEffect(() => {
    if (isItemModalOpen && !itemFormData.categoryId && categories.length > 0) {
      const timer = window.setTimeout(() => {
        setItemFormData((prev) => ({ ...prev, categoryId: categories[0].id }));
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [isItemModalOpen, itemFormData.categoryId, categories]);

  // Store Settings State
  const [announcement, setAnnouncement] = useState("");
  const [openingHours, setOpeningHours] = useState("08:00 - 22:30");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  // Fetch Orders
  const fetchOrders = useCallback(async (isPolling = false) => {
    const currentReqId = ordersRequestGateRef.current.begin();
    if (!isPolling) setLoadingOrders(true);
    try {
      let url = `/api/owner/orders?`;
      if (statusFilter !== "all") url += `status=${encodeURIComponent(statusFilter)}&`;
      if (searchQuery.trim()) url += `q=${encodeURIComponent(searchQuery.trim())}&`;
      const dateQ = buildDateQuery();
      if (dateQ) url += `${dateQ}&`;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!ordersRequestGateRef.current.isCurrent(currentReqId)) return;

      if (res.ok) {
        const data = (await res.json()) as {
          orders?: OrderRecord[];
          counts?: OrderCounts;
          isOrderingOpen?: boolean;
          spoilage?: WastageMetrics;
          wastageReport?: WastageEntry[];
        };
        if (!ordersRequestGateRef.current.isCurrent(currentReqId)) return;

        setOrders(data.orders || []);
        setOrdersError(null);
        const newCounts = data.counts || {
          total: 0,
          pending: 0,
          accepted: 0,
          preparing: 0,
          ready: 0,
          completed: 0,
          cancelled: 0,
        };
        setCounts(newCounts);
        setWastage(data.spoilage || null);
        setWastageReport(data.wastageReport || []);
        setIsOrderingOpen(Boolean(data.isOrderingOpen));
        setStoreStatusLoading(false);
        setStoreStatusError("");
        setOrdersUpdatedAt(new Date());

        // Sound alert if new pending orders arrived
        if (soundEnabledRef.current && newCounts.pending > previousPendingCount.current) {
          playChimeSound();
        }
        previousPendingCount.current = newCounts.pending;

        // Keep selected order updated
        setSelectedOrder((prev) => {
          if (!prev) return null;
          const found = (data.orders || []).find((o: OrderRecord) => o.id === prev.id);
          return found || prev;
        });
      } else {
        let errorMsg = "Không thể tải danh sách đơn hàng. Vui lòng thử lại.";
        let code: string | undefined;
        try {
          const errPayload = (await res.json()) as { error?: string; code?: string };
          if (errPayload.error) errorMsg = errPayload.error;
          if (errPayload.code) code = errPayload.code;
        } catch {
          // ignore parsing error
        }
        if (!ordersRequestGateRef.current.isCurrent(currentReqId)) return;
        if (res.status === 401) {
          errorMsg = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
        } else if (res.status === 403) {
          errorMsg = "Tài khoản của bạn không có quyền xem đơn hàng của cửa hàng.";
        } else if (!res.ok) {
          errorMsg = "Không thể tải danh sách đơn hàng. Vui lòng thử lại.";
        }
        setOrdersError({ message: errorMsg, status: res.status, code });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (!ordersRequestGateRef.current.isCurrent(currentReqId)) return;
      setOrdersError({
        message: "Không thể tải danh sách đơn hàng. Vui lòng thử lại.",
      });
    } finally {
      if (ordersRequestGateRef.current.isCurrent(currentReqId) && !isPolling) {
        setLoadingOrders(false);
      }
    }
  }, [statusFilter, searchQuery, buildDateQuery]);

  // Fetch Menu Items
  const fetchMenu = useCallback(async () => {
    const requestId = ++menuRequestIdRef.current;
    menuAbortControllerRef.current?.abort();
    const controller = new AbortController();
    menuAbortControllerRef.current = controller;
    setLoadingMenu(true);
    setMenuError(null);
    try {
      const data = await readJson<{
        items?: MenuItemManagement[];
        categories?: CategoryManagement[];
        options?: MenuOptionManagement[];
      }>(
        await fetch("/api/owner/menu", { cache: "no-store", signal: controller.signal }),
      );
      if (requestId !== menuRequestIdRef.current) return;
      setMenuItems(data.items || []);
      setCategories(data.categories || []);
      setMenuOptions(data.options || []);
    } catch (failure) {
      if (failure instanceof Error && failure.name === "AbortError") return;
      if (requestId !== menuRequestIdRef.current) return;
      setMenuError(failure instanceof Error ? failure.message : "Không thể tải thực đơn. Vui lòng thử lại.");
    } finally {
      if (requestId === menuRequestIdRef.current) setLoadingMenu(false);
    }
  }, []);

  // Fetch Store Status
  const fetchStoreSettings = useCallback(async () => {
    setStoreStatusLoading(true);
    setStoreStatusError("");
    try {
      const res = await fetch("/api/owner/store-status", { cache: "no-store" });
      const data = (await res.json()) as {
        isOrderingOpen?: boolean;
        announcement?: string;
        openingHoursNotice?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Không thể tải trạng thái nhận đơn.");
      setIsOrderingOpen(Boolean(data.isOrderingOpen));
      setAnnouncement(data.announcement || "");
      setOpeningHours(data.openingHoursNotice || "08:00 - 22:30");
    } catch (cause) {
      setStoreStatusError(cause instanceof Error ? cause.message : "Không thể tải trạng thái nhận đơn.");
    } finally {
      setStoreStatusLoading(false);
    }
  }, []);

  // Initial load and single-flight recursive polling via setTimeout with visibility handling
  useEffect(() => {
    const ordersRequestGate = ordersRequestGateRef.current;
    ordersRequestGate.reset();
    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        if (!isCancelled) {
          pollTimer = setTimeout(poll, 15000);
        }
        return;
      }
      await fetchOrders(true);
      if (!isCancelled) {
        pollTimer = setTimeout(poll, 4000);
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden && !isCancelled) {
        if (pollTimer) clearTimeout(pollTimer);
        void fetchOrders(true);
        pollTimer = setTimeout(poll, 4000);
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    pollTimer = setTimeout(() => {
      void fetchStoreSettings();
      void fetchOrders(false).then(() => {
        if (!isCancelled) {
          pollTimer = setTimeout(poll, 4000);
        }
      });
    }, 0);

    return () => {
      isCancelled = true;
      ordersRequestGate.cancel();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      menuAbortControllerRef.current?.abort();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [fetchOrders, fetchStoreSettings]);

  useEffect(() => {
    let isCancelled = false;
    if (activeTab === "menu" || activeTab === "pricing") {
      const timer = window.setTimeout(() => { if (!isCancelled) void fetchMenu(); }, 0);
      return () => { isCancelled = true; window.clearTimeout(timer); };
    } else if (activeTab === "settings") {
      const timer = window.setTimeout(() => { if (!isCancelled) void fetchStoreSettings(); }, 0);
      return () => { isCancelled = true; window.clearTimeout(timer); };
    }

    return () => {
      isCancelled = true;
    };
  }, [activeTab, fetchMenu, fetchStoreSettings]);

  // Status transition handler with per-order tracking & optimistic updates
  const handleTransitionStatus = async (
    order: OrderRecord,
    newStatus: OrderRecord["status"],
    options?: { autoAdvance?: boolean; customSuccessMsg?: string }
  ) => {
    if (updatingOrderIds.has(order.id)) return;
    setUpdatingOrderIds((prev) => new Set(prev).add(order.id));
    setStatusFeedback(null);

    // Save snapshot for rollback
    const prevOrders = orders;
    const prevSelected = selectedOrder;

    // Optimistic UI state update: immediate feedback
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
    );
    if (selectedOrder && selectedOrder.id === order.id) {
      if (newStatus === "completed") {
        setSelectedOrder(null);
      } else {
        setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    }

    try {
      const res = await fetch(`/api/owner/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus,
          expectedStatus: order.status,
          autoAdvance: options?.autoAdvance ?? false,
        }),
      });
      if (res.ok) {
        const msg =
          options?.customSuccessMsg ||
          (newStatus === "completed"
            ? `Đã hoàn tất đơn ${order.orderCode} thành công! 🎉`
            : newStatus === "preparing"
            ? `Đã nhận & bắt đầu pha đơn ${order.orderCode}. ☕`
            : newStatus === "ready"
            ? `Đơn ${order.orderCode} đã sẵn sàng giao khách! ✨`
            : `Đã cập nhật đơn ${order.orderCode}.`);
        setStatusFeedback({ kind: "success", message: msg });
        await fetchOrders(true);
      } else {
        const err = (await res.json()) as { error?: string };
        setStatusFeedback({ kind: "error", message: err.error || "Không thể cập nhật trạng thái đơn." });
        setOrders(prevOrders);
        setSelectedOrder(prevSelected);
        await fetchOrders(true);
      }
    } catch {
      setStatusFeedback({
        kind: "error",
        message: "Mất kết nối máy chủ. Trạng thái đơn chưa được xác nhận; hãy tải lại trước khi thao tác tiếp.",
      });
      setOrders(prevOrders);
      setSelectedOrder(prevSelected);
      await fetchOrders(true);
    } finally {
      setUpdatingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Handle Cancel Order
  const handleConfirmCancel = async () => {
    if (!cancelModalOrder) return;
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    setStatusFeedback(null);
    try {
      const res = await fetch(`/api/owner/orders/${cancelModalOrder.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus: "cancelled",
          expectedStatus: cancelModalOrder.status,
          reasonCode: ["preparing", "ready"].includes(cancelModalOrder.status) ? cancelReasonCode : undefined,
          cancelReason: cancelReason.trim() || undefined,
        }),
      });
      if (res.ok) {
        setCancelModalOrder(null);
        setCancelReason("");
        setStatusFeedback({
          kind: "success",
          message: ["preparing", "ready"].includes(cancelModalOrder.status)
            ? `Đã huỷ đơn ${cancelModalOrder.orderCode} và ghi nhận vào báo cáo hao hụt.`
            : `Đã huỷ đơn ${cancelModalOrder.orderCode}.`,
        });
        await fetchOrders(true);
      } else {
        const err = (await res.json()) as { error?: string };
        setStatusFeedback({ kind: "error", message: err.error || "Không thể huỷ đơn hàng." });
        await fetchOrders(true);
      }

    } catch {
      setStatusFeedback({ kind: "error", message: "Mất kết nối máy chủ. Chưa thể xác nhận kết quả huỷ; hãy tải lại danh sách đơn." });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Toggle item in/out of stock
  const handleToggleItemStock = async (item: MenuItemManagement) => {
    if (updatingMenuItemIds.has(item.id)) return;
    const nextVal = !Boolean(item.is_available);
    setUpdatingMenuItemIds((current) => new Set(current).add(item.id));
    setMenuError(null);
    let updateError: string | null = null;
    try {
      await readJson(await fetch("/api/owner/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, isAvailable: nextVal, expectedUpdatedAt: item.updated_at }),
      }));
    } catch (failure) {
      updateError = failure instanceof Error ? failure.message : "Không thể cập nhật trạng thái món.";
    } finally {
      await fetchMenu();
      if (updateError) setMenuError(updateError);
      setUpdatingMenuItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Open modal to create a new item
  const handleOpenCreateModal = () => {
    if (categories.length === 0) {
      void fetchMenu();
    }
    setItemModalMode("create");
    setItemFormData({
      name: "",
      englishName: "",
      categoryId: categories[0]?.id || "",
      basePrice: 35000,
      description: "",
      badge: "",
      isAvailable: true,
      allowsSize: true,
      allowsSugar: true,
      allowsIce: true,
      allowsToppings: true,
      sortOrder: menuItems.length + 1,
      imageUrl: "/laboong/drinks/default.jpg",
    });
    setItemModalError(null);
    setIsItemModalOpen(true);
  };

  // Open modal to edit an existing item
  const handleOpenEditModal = (item: MenuItemManagement) => {
    setItemModalMode("edit");
    setItemFormData({
      id: item.id,
      name: item.name,
      englishName: item.english_name || "",
      categoryId: item.category_id,
      basePrice: item.base_price,
      description: item.description || "",
      badge: item.badge || "",
      isAvailable: Boolean(item.is_available),
      allowsSize: item.allows_size !== undefined ? Boolean(item.allows_size) : true,
      allowsSugar: item.allows_sugar !== undefined ? Boolean(item.allows_sugar) : true,
      allowsIce: item.allows_ice !== undefined ? Boolean(item.allows_ice) : true,
      allowsToppings: item.allows_toppings !== undefined ? Boolean(item.allows_toppings) : true,
      sortOrder: item.sort_order || 0,
      imageUrl: item.image_url || "/laboong/drinks/default.jpg",
    });
    setItemModalError(null);
    setIsItemModalOpen(true);
  };

  // Save item (Create or Edit)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemFormData.name.trim()) {
      setItemModalError("Tên món không được để trống.");
      return;
    }
    if (!itemFormData.categoryId) {
      setItemModalError("Vui lòng chọn danh mục cho món.");
      return;
    }
    if (itemFormData.basePrice < 0) {
      setItemModalError("Giá bán phải lớn hơn hoặc bằng 0.");
      return;
    }

    setSavingItem(true);
    setItemModalError(null);

    try {
      if (itemModalMode === "create") {
        const res = await fetch("/api/owner/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: itemFormData.name.trim(),
            englishName: itemFormData.englishName.trim() || null,
            categoryId: itemFormData.categoryId,
            basePrice: Math.round(itemFormData.basePrice),
            description: itemFormData.description.trim() || null,
            badge: itemFormData.badge || null,
            isAvailable: itemFormData.isAvailable,
            allowsSize: itemFormData.allowsSize,
            allowsSugar: itemFormData.allowsSugar,
            allowsIce: itemFormData.allowsIce,
            allowsToppings: itemFormData.allowsToppings,
            sortOrder: Number(itemFormData.sortOrder) || 0,
            imageUrl: itemFormData.imageUrl || "/laboong/drinks/default.jpg",
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) {
          throw new Error(json.error || "Không thể tạo món mới.");
        }
        setIsItemModalOpen(false);
        await fetchMenu();
      } else {
        const res = await fetch("/api/owner/menu", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: itemFormData.id,
            name: itemFormData.name.trim(),
            englishName: itemFormData.englishName.trim() || null,
            categoryId: itemFormData.categoryId,
            basePrice: Math.round(itemFormData.basePrice),
            description: itemFormData.description.trim() || null,
            badge: itemFormData.badge || null,
            isAvailable: itemFormData.isAvailable,
            allowsSize: itemFormData.allowsSize,
            allowsSugar: itemFormData.allowsSugar,
            allowsIce: itemFormData.allowsIce,
            allowsToppings: itemFormData.allowsToppings,
            sortOrder: Number(itemFormData.sortOrder) || 0,
            imageUrl: itemFormData.imageUrl || "/laboong/drinks/default.jpg",
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) {
          throw new Error(json.error || "Không thể cập nhật món.");
        }
        setIsItemModalOpen(false);
        await fetchMenu();
      }
    } catch (err: unknown) {
      setItemModalError(err instanceof Error ? err.message : "Lỗi lưu thông tin món.");
    } finally {
      setSavingItem(false);
    }
  };

  // Confirm delete item
  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/owner/menu?id=${encodeURIComponent(deletingItem.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        alert(json.error || "Không thể xoá món này.");
        return;
      }
      setDeletingItem(null);
      await fetchMenu();
    } catch {
      alert("Lỗi kết nối máy chủ.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Save updated base price
  const handleSavePrice = async (itemId: string) => {
    if (newPriceValue <= 0) return;
    try {
      const res = await fetch("/api/owner/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, basePrice: newPriceValue }),
      });
      if (res.ok) {
        setMenuItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, base_price: newPriceValue } : i)),
        );
        setEditingPriceId(null);
      }
    } catch {
      alert("Không thể lưu giá món.");
    }
  };

  // Toggle option stock
  const handleToggleOptionStock = async (option: MenuOptionManagement) => {
    if (updatingOptionIds.has(option.id)) return;
    const nextVal = !Boolean(option.is_available);
    setUpdatingOptionIds((prev) => new Set(prev).add(option.id));
    setMenuError(null);
    let updateError: string | null = null;
    try {
      await readJson(
        await fetch("/api/owner/menu", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId: option.id, isAvailable: nextVal }),
        }),
      );
    } catch (err) {
      updateError = err instanceof Error ? err.message : "Không thể cập nhật trạng thái topping.";
    } finally {
      await fetchMenu();
      if (updateError) setMenuError(updateError);
      setUpdatingOptionIds((prev) => {
        const next = new Set(prev);
        next.delete(option.id);
        return next;
      });
    }
  };

  // Save updated option price
  const handleSaveOptionPrice = async (optionId: string) => {
    if (newOptionPriceValue < 0) return;
    try {
      await readJson(
        await fetch("/api/owner/menu", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId, priceModifier: newOptionPriceValue }),
        }),
      );
      setMenuOptions((prev) =>
        prev.map((opt) => (opt.id === optionId ? { ...opt, price_modifier: newOptionPriceValue } : opt)),
      );
      setEditingOptionPriceId(null);
      setStatusFeedback({ kind: "success", message: "Đã cập nhật giá topping thành công!" });
    } catch {
      alert("Không thể đổi giá topping.");
    }
  };

  // Create new topping option
  const handleSaveTopping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toppingFormData.name.trim()) return;
    setSavingTopping(true);
    try {
      await readJson(
        await fetch("/api/owner/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "option",
            groupType: "topping",
            name: toppingFormData.name.trim(),
            priceModifier: toppingFormData.priceModifier,
            isAvailable: toppingFormData.isAvailable,
          }),
        }),
      );
      setIsToppingModalOpen(false);
      setToppingFormData({ name: "", priceModifier: 5000, isAvailable: true });
      await fetchMenu();
      setStatusFeedback({
        kind: "success",
        message: `Đã thêm topping "${toppingFormData.name.trim()}" thành công! 🎉`,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không thể tạo topping mới.");
    } finally {
      setSavingTopping(false);
    }
  };

  // Delete topping option
  const handleConfirmDeleteOption = async () => {
    if (!deletingOption) return;
    setIsDeletingOption(true);
    try {
      await readJson(
        await fetch(`/api/owner/menu?optionId=${encodeURIComponent(deletingOption.id)}`, {
          method: "DELETE",
        }),
      );
      setDeletingOption(null);
      await fetchMenu();
      setStatusFeedback({
        kind: "success",
        message: `Đã xoá topping "${deletingOption.name}" thành công.`,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không thể xoá topping.");
    } finally {
      setIsDeletingOption(false);
    }
  };

  // Toggle online ordering
  const handleToggleStoreOrdering = async (open: boolean) => {
    if (isOrderingOpen === null) return;
    setIsOrderingOpen(open);
    try {
      const response = await fetch("/api/owner/store-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOrderingOpen: open }),
      });
      if (!response.ok) throw new Error("Không lưu được trạng thái nhận đơn.");
    } catch {
      setIsOrderingOpen(!open);
      alert("Không lưu được trạng thái nhận đơn. Vui lòng thử lại.");
    }
  };

  // Save store settings
  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOrderingOpen === null) {
      setSettingsMessage("Chưa tải được trạng thái nhận đơn. Hãy tải lại trước khi lưu.");
      return;
    }
    setSavingSettings(true);
    setSettingsMessage(null);
    try {
      const res = await fetch("/api/owner/store-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isOrderingOpen,
          announcement: announcement.trim(),
          openingHoursNotice: openingHours.trim(),
        }),
      });
      if (res.ok) {
        setSettingsMessage("Đã lưu thiết lập nhận đơn thành công!");
        setTimeout(() => setSettingsMessage(null), 3000);
      }
    } catch {
      setSettingsMessage("Lỗi lưu thiết lập.");
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Minimalist Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 bg-white p-4 sm:p-5 rounded-2xl border border-[#eee3df]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6f2939]">
              Điều phối đơn hàng
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fff2f4] text-[#d96d83]">
              Trực tiếp
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-[#332a2b] mt-1">
            Quản lý đơn hàng trực tuyến
          </h1>
          <p className="text-xs text-[#7b6f70] mt-0.5">
            Đồng bộ thời gian thực từ trang đặt món{" "}
            <a
              href="/order"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[#6f2939] hover:underline inline-flex items-center gap-1"
            >
              /order <ExternalLink size={12} />
            </a>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sound Alert Toggle */}
          <button
            type="button"
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              if (!soundEnabled) playChimeSound();
            }}
            title={soundEnabled ? "Tắt âm báo đơn mới" : "Bật âm báo chuông đơn mới"}
            className={`min-h-[40px] px-3 py-2 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all ${
              soundEnabled
                ? "bg-[#fff8e7] text-[#8a5d00] border-[#ffe8a3]"
                : "bg-[#fffaf4] text-[#7b6f70] border-[#eee3df]"
            }`}
          >
            {soundEnabled ? <Volume2 size={15} className="text-[#d48b00]" /> : <VolumeX size={15} />}
            <span>{soundEnabled ? "Chuông: Bật" : "Chuông: Tắt"}</span>
          </button>

          {/* Online Ordering Toggle Quick Switch */}
          {canManageMenu && (
            <div className="flex items-center gap-2 min-h-[40px] px-2.5 py-1 rounded-xl border border-[#eee3df] bg-[#fffaf4] text-xs">
              <span className="font-semibold text-[#7b6f70]">Nhận đơn:</span>
              <button
                type="button"
                disabled={storeStatusLoading || isOrderingOpen === null}
                onClick={() => isOrderingOpen !== null && handleToggleStoreOrdering(!isOrderingOpen)}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                  isOrderingOpen === null
                    ? "bg-[#eee3df] text-[#7b6f70]"
                    : isOrderingOpen
                    ? "bg-[#2d6a4f] text-white"
                    : "bg-[#b91c1c] text-white"
                }`}
              >
                {storeStatusLoading || isOrderingOpen === null
                  ? "Đang xác nhận…"
                  : isOrderingOpen
                  ? "● Đang mở"
                  : "○ Tạm ngưng"}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => fetchOrders(false)}
            aria-label="Làm mới dữ liệu đơn"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#eee3df] bg-white hover:bg-[#fffaf4] text-[#332a2b] transition-colors"
          >
            <RefreshCw size={15} className={loadingOrders ? "animate-spin text-[#6f2939]" : ""} />
          </button>
        </div>
      </div>

      {/* Minimalist Navigation Sub-Tabs */}
      <div className="flex border-b border-[#eee3df] overflow-x-auto gap-1.5 text-xs sm:text-sm font-semibold scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`pb-2.5 px-3.5 min-h-[44px] flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "orders"
              ? "border-[#6f2939] text-[#6f2939]"
              : "border-transparent text-[#7b6f70] hover:text-[#332a2b]"
          }`}
        >
          <ShoppingBag size={15} />
          <span>Đơn hàng</span>
          {counts !== null && counts.pending > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-[#d96d83] text-white">
              {counts.pending}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("wastage")}
          className={`pb-2.5 px-3.5 min-h-[44px] flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "wastage"
              ? "border-[#6f2939] text-[#6f2939]"
              : "border-transparent text-[#7b6f70] hover:text-[#332a2b]"
          }`}
        >
          <ClipboardX size={15} />
          <span>Báo cáo hao hụt</span>
          {(wastage?.spoiledOrdersCount ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#fee2e2] text-[#991b1b]">
              {wastage?.spoiledOrdersCount}
            </span>
          )}
        </button>

        {canManageMenu && (
          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`pb-2.5 px-3.5 min-h-[44px] flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === "menu"
                ? "border-[#6f2939] text-[#6f2939]"
                : "border-transparent text-[#7b6f70] hover:text-[#332a2b]"
            }`}
          >
            <Layers size={15} />
            <span>Menu & Món còn/hết</span>
          </button>
        )}

        {canManageMenu && (
          <button
            type="button"
            onClick={() => setActiveTab("pricing")}
            className={`pb-2.5 px-3.5 min-h-[44px] flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === "pricing"
                ? "border-[#6f2939] text-[#6f2939]"
                : "border-transparent text-[#7b6f70] hover:text-[#332a2b]"
            }`}
          >
            <DollarSign size={15} />
            <span>Quản lý giá</span>
          </button>
        )}

        {canManageMenu && (
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`pb-2.5 px-3.5 min-h-[44px] flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === "settings"
                ? "border-[#6f2939] text-[#6f2939]"
                : "border-transparent text-[#7b6f70] hover:text-[#332a2b]"
            }`}
          >
            <Store size={15} />
            <span>Cài đặt nhận đơn</span>
          </button>
        )}
      </div>

      {statusFeedback && (
        <div
          role={statusFeedback.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-2xl border p-3.5 text-xs sm:text-sm flex items-start justify-between gap-3 ${
            statusFeedback.kind === "error"
              ? "border-[#fecaca] bg-[#fff5f5] text-[#991b1b]"
              : "border-[#d8f3e5] bg-[#f0faf5] text-[#2d6a4f]"
          }`}
        >
          <span>{statusFeedback.message}</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            aria-label="Đóng thông báo"
            className="min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-xl hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* TAB 1: ORDERS DASHBOARD */}
      {activeTab === "orders" && (
        <div className="space-y-3.5 sm:space-y-4">
          {/* Unified Minimalist Mobile-First Control Bar (Status + Date + Search) */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-[#eee3df] space-y-3">
            {/* Row 1: Search & Date Presets */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3.5 top-3 text-[#9c9391]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã đơn (LB-..), tên, SĐT..."
                  className="w-full pl-9 pr-4 py-2 min-h-[40px] rounded-xl border border-[#e6dad5] bg-[#fffaf4]/60 text-xs sm:text-sm text-[#332a2b] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#d96d83]/40"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                <Calendar size={14} className="text-[#6f2939] shrink-0 mr-0.5" />
                {[
                  { key: "all", label: "Tất cả" },
                  { key: "today", label: "Hôm nay" },
                  { key: "yesterday", label: "Hôm qua" },
                  { key: "7days", label: "7 ngày" },
                  { key: "custom", label: "Chọn ngày" },
                ].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setDatePreset(p.key as typeof datePreset)}
                    className={`px-2.5 py-1.5 min-h-[34px] rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      datePreset === p.key
                        ? "bg-[#6f2939] text-white"
                        : "bg-[#f8f3ef] text-[#7b6f70] hover:bg-[#eee3df] hover:text-[#332a2b]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                {datePreset === "custom" && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-xl border border-[#e6dad5] text-[#332a2b] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                  />
                )}
              </div>
            </div>

            {/* Row 2: Horizontal Minimalist Status Filter Pills */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#f5efec]">
              <div className="flex overflow-x-auto gap-1.5 pb-0.5 scrollbar-none -mx-1 px-1">
                {[
                  { key: "all", label: "Tất cả", count: counts?.total },
                  { key: "pending", label: "Chờ xác nhận", count: counts?.pending, urgent: (counts?.pending ?? 0) > 0 },
                  { key: "accepted", label: "Đã nhận", count: counts?.accepted },
                  { key: "preparing", label: "Đang pha", count: counts?.preparing },
                  { key: "ready", label: "Sẵn sàng", count: counts?.ready },
                  { key: "completed", label: "Hoàn tất", count: counts?.completed },
                  { key: "cancelled", label: "Đã huỷ", count: counts?.cancelled },
                ].map((stat) => {
                  const isActive = statusFilter === stat.key;
                  return (
                    <button
                      key={stat.key}
                      type="button"
                      onClick={() => setStatusFilter(stat.key)}
                      className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all shrink-0 ${
                        isActive
                          ? "bg-[#6f2939] text-white border-[#6f2939] shadow-2xs"
                          : stat.urgent
                          ? "bg-[#fff2f4] text-[#6f2939] border-[#f4a9b7]"
                          : "bg-white text-[#554a4c] border-[#eee3df] hover:bg-[#fffaf4]"
                      }`}
                    >
                      <span>{stat.label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                          isActive
                            ? "bg-white/20 text-white"
                            : stat.urgent
                            ? "bg-[#d96d83] text-white"
                            : "bg-[#f4ece8] text-[#6f2939]"
                        }`}
                      >
                        {stat.count ?? "—"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <span className="hidden sm:inline text-[11px] text-[#7b6f70] whitespace-nowrap shrink-0">
                {loadingOrders && counts === null ? (
                  "Đang xác nhận dữ liệu"
                ) : (
                  <>
                    Hiển thị <strong>{orders.length}</strong> đơn
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Stale Data Warning Banner */}
          {orders.length > 0 && ordersError && (
            <div className="bg-[#fff8e7] border border-[#ffe8a3] rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[#8a5d00]">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-[#d48b00] shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-semibold">Dữ liệu có thể chưa được cập nhật mới nhất</p>
                  <p className="text-xs text-[#92400e] mt-0.5">
                    {ordersError.message}
                    {ordersUpdatedAt &&
                      ` Lần cập nhật thành công: ${ordersUpdatedAt.toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void fetchOrders(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] bg-white hover:bg-[#fff2cf] text-[#8a5d00] border border-[#ffe8a3] rounded-xl text-xs font-semibold shrink-0 transition-colors"
              >
                <RefreshCw size={13} />
                Thử lại ngay
              </button>
            </div>
          )}

          {/* Order Cards List */}
          {loadingOrders && orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#eee3df]">
              <ListSkeleton rows={5} />
            </div>
          ) : orders.length === 0 && ordersError ? (
            <AsyncStatePanel
              state="error"
              title={
                ordersError.status === 401
                  ? "Phiên đăng nhập đã hết hạn"
                  : ordersError.status === 403
                  ? "Không có quyền xem đơn hàng"
                  : "Không thể tải danh sách đơn hàng"
              }
              description={ordersError.message}
              actionLabel={ordersError.status === 401 ? "Đăng nhập lại" : "Thử lại"}
              actionHref={ordersError.status === 401 ? "/auth/login" : undefined}
              onAction={ordersError.status === 401 ? undefined : () => void fetchOrders(false)}
            />
          ) : orders.length === 0 ? (
            statusFilter !== "all" || searchQuery.trim() || datePreset !== "all" ? (
              <AsyncStatePanel
                state="empty"
                title="Không có đơn khớp bộ lọc"
                description="Thử điều kiện khác hoặc xóa toàn bộ bộ lọc hiện tại."
                actionLabel="Xóa bộ lọc"
                onAction={() => {
                  setStatusFilter("all");
                  setSearchQuery("");
                  setDatePreset("all");
                  setCustomDate("");
                }}
              />
            ) : (
              <AsyncStatePanel
                state="empty"
                title="Chưa phát sinh đơn hàng"
                description="Đơn đặt thành công từ trang khách hàng sẽ xuất hiện tại đây."
              />
            )
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 pb-28 sm:pb-20">
              {[...orders]
                .sort((a, b) => {
                  if (a.status === "pending" && b.status !== "pending") return -1;
                  if (a.status !== "pending" && b.status === "pending") return 1;
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                })
                .map((ord) => {
                  const isPending = ord.status === "pending";
                  return (
                    <div
                      key={ord.id}
                      className={`bg-white rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                        isPending
                          ? "border-[#d96d83] bg-[#fffaf4]/40 ring-1 ring-[#f4a9b7]"
                          : "border-[#eee3df] hover:border-[#dfc9c2]"
                      }`}
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#f5efec]">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-base text-[#332a2b] tracking-tight">
                                {ord.orderCode}
                              </span>
                              {isPending && (
                                <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#d96d83] text-white">
                                  MỚI
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#7b6f70] mt-0.5 flex items-center gap-1.5">
                              <Clock size={12} />
                              <span>
                                {new Date(ord.createdAt).toLocaleTimeString("vi-VN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span>·</span>
                              <span>{ord.itemCount} món</span>
                            </div>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                              ord.status === "pending"
                                ? "bg-[#fff8e7] text-[#a86e23]"
                                : ord.status === "accepted"
                                ? "bg-[#fff2f4] text-[#6f2939]"
                                : ord.status === "preparing"
                                ? "bg-[#f3e4e7] text-[#6f2939]"
                                : ord.status === "ready"
                                ? "bg-[#f0faf5] text-[#2d6a4f]"
                                : ord.status === "completed"
                                ? "bg-[#f4ece8] text-[#554a4c]"
                                : "bg-[#fff5f5] text-[#991b1b]"
                            }`}
                          >
                            {ord.status === "pending"
                              ? "Chờ xác nhận"
                              : ord.status === "accepted"
                              ? "Đã nhận"
                              : ord.status === "preparing"
                              ? "Đang chuẩn bị"
                              : ord.status === "ready"
                              ? "Sẵn sàng"
                              : ord.status === "completed"
                              ? "Hoàn tất"
                              : "Đã huỷ"}
                          </span>
                        </div>

                        {/* Visual Workflow Stepper */}
                        <OrderWorkflowStepper status={ord.status} />

                        {/* Customer Info */}
                        <div className="py-2 px-3 rounded-xl bg-[#fffaf4] border border-[#f5efec] my-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="text-[#7b6f70]">Khách:</span>{" "}
                            <strong className="text-[#332a2b]">{ord.customerName}</strong>
                          </div>
                          <a
                            href={`tel:${ord.customerPhone}`}
                            className="inline-flex items-center gap-1 text-[#6f2939] font-bold hover:underline"
                          >
                            <Phone size={12} />
                            <span>{ord.customerPhone}</span>
                          </a>
                        </div>

                        {/* Items Preview */}
                        <div className="space-y-1.5 my-2">
                          {ord.items.map((it) => (
                            <div
                              key={it.id}
                              className="text-xs flex items-baseline justify-between text-[#554a4c]"
                            >
                              <div className="flex items-baseline gap-1.5 flex-grow pr-2">
                                <span className="font-bold text-[#6f2939]">{it.quantity}x</span>
                                <span className="font-medium text-[#332a2b]">{it.name}</span>
                                <span className="text-[11px] text-[#9c9391]">
                                  ({it.size || "M"}
                                  {it.sugar ? `, ${it.sugar.split(" ")[0]}` : ""})
                                </span>
                              </div>
                              <span className="font-semibold text-[#332a2b] whitespace-nowrap tabular-nums">
                                {formatVND(it.subtotal)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {ord.customerNote && (
                          <div className="text-xs text-[#8a5d00] bg-[#fff8e7] p-2 rounded-xl mt-2 italic">
                            &ldquo;Ghi chú: {ord.customerNote}&rdquo;
                          </div>
                        )}

                        {ord.status === "cancelled" && (
                          <div className="text-xs text-[#991b1b] bg-[#fff5f5] border border-[#fecaca] p-2.5 rounded-xl mt-2 flex items-start gap-1.5">
                            <span className="font-bold whitespace-nowrap">Lý do huỷ:</span>
                            <span>{ord.cancelReason || "Huỷ bởi cửa hàng"}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions & Next Step Button */}
                      <div className="mt-3.5 pt-2.5 border-t border-[#f5efec] flex flex-wrap items-center justify-between gap-2">
                        <div className="font-extrabold text-sm text-[#6f2939] tabular-nums whitespace-nowrap">
                          {formatVND(ord.totalAmount)}
                        </div>

                        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
                          {ord.status === "cancelled" && (
                            <span className="text-[11px] font-bold text-[#991b1b] bg-[#fff5f5] border border-[#fecaca] px-2.5 py-1.5 rounded-xl whitespace-nowrap">
                              Đơn đã huỷ
                            </span>
                          )}

                          {ord.status === "completed" && (
                            <span className="text-[11px] font-bold text-[#2d6a4f] bg-[#f0faf5] border border-[#bbf7d0] px-2.5 py-1.5 rounded-xl flex items-center gap-1 whitespace-nowrap">
                              <Check size={12} strokeWidth={3} />
                              Đã hoàn tất
                            </span>
                          )}

                          {/* Cancel Button */}
                          {canCancelOrders &&
                            ord.status !== "completed" &&
                            ord.status !== "cancelled" && (
                              <button
                                type="button"
                                disabled={updatingOrderIds.has(ord.id)}
                                onClick={() => setCancelModalOrder(ord)}
                                className="min-h-[40px] px-2.5 py-1.5 rounded-xl border border-[#fecaca] text-[#b91c1c] bg-[#fff5f5]/60 hover:bg-[#fee2e2] text-xs font-semibold transition-colors active:scale-95 disabled:opacity-50 whitespace-nowrap"
                              >
                                Huỷ
                              </button>
                            )}

                          {/* Workflow Next Action Buttons */}
                          {canTransitionOrders && ord.status === "pending" && (
                            <>
                              <button
                                type="button"
                                disabled={updatingOrderIds.has(ord.id)}
                                onClick={() => handleTransitionStatus(ord, "preparing", { autoAdvance: true })}
                                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap disabled:opacity-60"
                                title="Nhận đơn và bắt đầu pha chế ngay"
                              >
                                {updatingOrderIds.has(ord.id) ? (
                                  <RefreshCw size={13} className="animate-spin" />
                                ) : (
                                  <Coffee size={13} />
                                )}
                                <span>Nhận & Pha</span>
                                <ArrowRight size={13} />
                              </button>

                              <button
                                type="button"
                                disabled={updatingOrderIds.has(ord.id)}
                                onClick={() => handleTransitionStatus(ord, "completed", { autoAdvance: true })}
                                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#2d6a4f] hover:bg-[#23533d] active:scale-95 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-2xs whitespace-nowrap disabled:opacity-60"
                                title="Hoàn tất đơn hàng ngay (1 chạm)"
                              >
                                {updatingOrderIds.has(ord.id) ? (
                                  <RefreshCw size={13} className="animate-spin" />
                                ) : (
                                  <CheckCheck size={14} strokeWidth={2.5} />
                                )}
                                <span>Xong ngay</span>
                              </button>
                            </>
                          )}

                          {canTransitionOrders && ord.status === "accepted" && (
                            <>
                              <button
                                type="button"
                                disabled={updatingOrderIds.has(ord.id)}
                                onClick={() => handleTransitionStatus(ord, "preparing")}
                                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#d96d83] hover:bg-[#c75865] active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap disabled:opacity-60"
                              >
                                {updatingOrderIds.has(ord.id) ? (
                                  <RefreshCw size={13} className="animate-spin" />
                                ) : (
                                  <Coffee size={13} />
                                )}
                                <span>Bắt đầu pha</span>
                                <ArrowRight size={13} />
                              </button>

                              <button
                                type="button"
                                disabled={updatingOrderIds.has(ord.id)}
                                onClick={() => handleTransitionStatus(ord, "completed", { autoAdvance: true })}
                                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#2d6a4f] hover:bg-[#23533d] active:scale-95 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-2xs whitespace-nowrap disabled:opacity-60"
                                title="Hoàn tất đơn hàng ngay (1 chạm)"
                              >
                                {updatingOrderIds.has(ord.id) ? (
                                  <RefreshCw size={13} className="animate-spin" />
                                ) : (
                                  <CheckCheck size={14} strokeWidth={2.5} />
                                )}
                                <span>Xong ngay</span>
                              </button>
                            </>
                          )}

                          {canTransitionOrders && ord.status === "preparing" && (
                            <>
                              <button
                                type="button"
                                disabled={updatingOrderIds.has(ord.id)}
                                onClick={() => handleTransitionStatus(ord, "ready")}
                                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#2d6a4f] hover:bg-[#23533d] active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap disabled:opacity-60"
                              >
                                {updatingOrderIds.has(ord.id) ? (
                                  <RefreshCw size={13} className="animate-spin" />
                                ) : (
                                  <Sparkles size={13} />
                                )}
                                <span>Sẵn sàng</span>
                                <ArrowRight size={13} />
                              </button>

                              <button
                                type="button"
                                disabled={updatingOrderIds.has(ord.id)}
                                onClick={() => handleTransitionStatus(ord, "completed", { autoAdvance: true })}
                                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#332a2b] hover:bg-[#1f191a] active:scale-95 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-2xs whitespace-nowrap disabled:opacity-60"
                                title="Hoàn tất đơn hàng ngay (1 chạm)"
                              >
                                {updatingOrderIds.has(ord.id) ? (
                                  <RefreshCw size={13} className="animate-spin" />
                                ) : (
                                  <CheckCheck size={14} strokeWidth={2.5} />
                                )}
                                <span>Xong ngay</span>
                              </button>
                            </>
                          )}

                          {canTransitionOrders && ord.status === "ready" && (
                            <button
                              type="button"
                              disabled={updatingOrderIds.has(ord.id)}
                              onClick={() => handleTransitionStatus(ord, "completed")}
                              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#332a2b] hover:bg-[#1f191a] active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs whitespace-nowrap disabled:opacity-60"
                            >
                              {updatingOrderIds.has(ord.id) ? (
                                <RefreshCw size={13} className="animate-spin" />
                              ) : (
                                <Check size={14} strokeWidth={3} />
                              )}
                              <span>Trả khách & Hoàn tất</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#7b6f70] active:scale-95 transition-colors"
                            title="Xem chi tiết đơn"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeTab === "wastage" && (
        <section className="space-y-4" aria-labelledby="wastage-title">
          <div className="rounded-2xl border border-[#fecaca] bg-[#fff5f5] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2.5 text-[#b91c1c]">
                <ClipboardX size={20} />
              </div>
              <div className="min-w-0">
                <h2 id="wastage-title" className="text-base sm:text-lg font-bold text-[#332a2b]">
                  Báo cáo hao hụt sau khi bắt đầu chuẩn bị
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[#7b6f70]">
                  Chỉ gồm đơn bị huỷ từ trạng thái Đang chuẩn bị hoặc Sẵn sàng. Giá trị dưới đây là giá bán lẻ theo snapshot đơn,
                  không phải chi phí nguyên liệu thực tế và không được tính là doanh thu thực thu.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="col-span-2 rounded-2xl border border-[#eee3df] bg-white p-4 lg:col-span-1">
              <p className="text-xs font-medium text-[#7b6f70]">Đơn phát sinh hao hụt</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#332a2b]">
                {wastage?.spoiledOrdersCount ?? 0}
              </p>
            </div>
            <div className="col-span-2 rounded-2xl border border-[#eee3df] bg-white p-4">
              <p className="text-xs font-medium text-[#7b6f70]">Giá trị bán lẻ của món bị huỷ</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[#b91c1c]">
                {formatVND(wastage?.estimatedRetailValue ?? 0)}
              </p>
            </div>
            {(
              [
                ["customer_abandoned", "Khách bỏ đơn"],
                ["item_preparation_error", "Lỗi pha chế"],
                ["store_incident", "Sự cố cửa hàng"],
              ] as const
            ).map(([code, label]) => (
              <div key={code} className="rounded-2xl border border-[#eee3df] bg-white p-4">
                <p className="text-xs font-medium text-[#7b6f70]">{label}</p>
                <p className="mt-1 text-xl font-black tabular-nums text-[#332a2b]">
                  {wastage?.byReason?.[code] ?? 0}
                </p>
              </div>
            ))}
          </div>

          {loadingOrders && !wastage ? (
            <div className="rounded-2xl border border-[#eee3df] bg-white">
              <ListSkeleton rows={4} />
            </div>
          ) : wastageReport.length === 0 ? (
            <AsyncStatePanel
              state="empty"
              title="Không có hao hụt trong khoảng thời gian này"
              description="Đơn huỷ trước khi pha không xuất hiện tại đây. Bạn có thể đổi bộ lọc thời gian ở tab Đơn hàng."
              actionLabel="Xem đơn hàng"
              onAction={() => setActiveTab("orders")}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#eee3df] bg-white">
              <div className="border-b border-[#f5efec] px-4 py-3">
                <h3 className="text-sm font-bold text-[#332a2b]">Lịch sử hao hụt</h3>
                <p className="text-xs text-[#7b6f70]">Theo bộ lọc thời gian hiện tại, mới nhất trước.</p>
              </div>
              <div className="divide-y divide-[#f5efec]">
                {wastageReport.map((entry) => {
                  const labels = {
                    customer_abandoned: "Khách bỏ đơn không nhận",
                    item_preparation_error: "Lỗi pha chế / làm sai món",
                    store_incident: "Sự cố tại cửa hàng",
                  } as const;
                  return (
                    <article
                      key={entry.orderId}
                      className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm text-[#332a2b]">{entry.orderCode}</strong>
                          <span className="rounded-full bg-[#fff5f5] px-2.5 py-0.5 text-[11px] font-bold text-[#991b1b]">
                            {labels[entry.reasonCode] ?? entry.reasonCode}
                          </span>
                          <span className="text-[11px] text-[#7b6f70]">
                            Huỷ từ {entry.fromStatus === "ready" ? "Sẵn sàng" : "Đang chuẩn bị"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#554a4c]">
                          {entry.itemCount} món ·{" "}
                          {new Date(entry.cancelledAt).toLocaleString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh",
                          })}
                          {entry.cancelledBy ? ` · ${entry.cancelledBy}` : ""}
                        </p>
                        {entry.note && <p className="mt-1 text-xs text-[#332a2b]">Ghi chú: {entry.note}</p>}
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-[11px] text-[#7b6f70]">Giá trị bán lẻ snapshot</p>
                        <p className="font-extrabold tabular-nums text-[#b91c1c]">
                          {formatVND(entry.estimatedRetailValue)}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB: MENU & MÓN CÒN/HẾT (FULL CRUD) */}
      {activeTab === "menu" && (
        <div className="space-y-4">
          {/* Header + Search + Category Filter in a Unified Minimalist Surface */}
          {menuError && (
            <AsyncStatePanel
              compact
              state="error"
              title="Không thể đồng bộ thực đơn"
              description={menuError}
              actionLabel="Thử lại"
              onAction={() => void fetchMenu()}
            />
          )}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#eee3df] space-y-3.5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#332a2b]">Quản lý thực đơn & món còn/hết</h2>
                <p className="text-xs text-[#7b6f70] mt-0.5">
                  Bật/tắt nhanh món còn hàng hoặc chỉnh sửa thông tin món trực tiếp.
                </p>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex-1 min-w-[130px] sm:flex-none min-h-[42px] px-3.5 py-2 rounded-xl border border-[#e6dad5] bg-white hover:bg-[#fffaf4] active:scale-95 text-[#6f2939] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  <FileSpreadsheet size={15} />
                  <span>Nhập Excel / CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="flex-1 min-w-[130px] sm:flex-none min-h-[42px] px-4 py-2 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  <Plus size={15} />
                  <span>Thêm món mới</span>
                </button>
                <button
                  type="button"
                  onClick={fetchMenu}
                  aria-label="Tải lại thực đơn"
                  className="min-h-[42px] min-w-[42px] shrink-0 flex items-center justify-center rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#554a4c] active:scale-95 transition-all"
                >
                  <RefreshCw size={15} className={loadingMenu ? "animate-spin text-[#6f2939]" : ""} />
                </button>
              </div>
            </div>

            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-3 text-[#9c9391]" />
              <input
                type="text"
                value={menuSearchQuery}
                onChange={(e) => setMenuSearchQuery(e.target.value)}
                placeholder="Tìm tên món ăn, thức uống..."
                className="w-full pl-9 pr-4 py-2 min-h-[40px] rounded-xl border border-[#e6dad5] bg-[#fffaf4]/60 text-xs sm:text-sm text-[#332a2b] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#d96d83]/40"
              />
            </div>

            {/* Category Pills & Filter Presets: Tất cả, Cà phê, Trà, Trà sữa, Topping */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {MENU_FILTER_PRESETS.map((preset) => {
                const count = ownerPresetCounts[preset.id];
                const isActive = selectedCategoryFilter === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(preset.id)}
                    className={`px-3 py-1.5 min-h-[34px] rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isActive
                        ? "bg-[#6f2939] text-white shadow-xs"
                        : "bg-[#f8f3ef] text-[#7b6f70] hover:bg-[#eee3df]"
                    }`}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-[#eee3df] text-[#554a4c]"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {categories.length > 0 && (
                <div className="w-[1px] h-5 bg-[#e6dad5] mx-1 shrink-0" />
              )}

              {categories.map((cat) => {
                const countInCat = menuItems.filter((m) => m.category_id === cat.id).length;
                const isActive = selectedCategoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 min-h-[34px] rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-[#6f2939] text-white shadow-xs"
                        : "bg-[#f8f3ef] text-[#7b6f70] hover:bg-[#eee3df]"
                    }`}
                  >
                    {cat.name} ({countInCat})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu Items Grid or Topping Management Grid */}
          {selectedCategoryFilter === "topping" ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-[#eee3df]">
                <div>
                  <h3 className="font-bold text-sm text-[#332a2b] flex items-center gap-1.5">
                    <span>🍮</span>
                    <span>Topping kèm theo đồ uống ({menuOptions.length})</span>
                  </h3>
                  <p className="text-xs text-[#7b6f70] mt-0.5">
                    Bật/tắt topping còn hàng, cập nhật giá phụ thu hoặc thêm topping mới cho menu.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsToppingModalOpen(true)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Plus size={15} />
                  <span>Thêm Topping mới</span>
                </button>
              </div>

              {loadingMenu && menuOptions.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-2xl border border-[#eee3df]">
                  <RefreshCw size={24} className="animate-spin text-[#6f2939] mx-auto mb-2" />
                  <p className="text-[#7b6f70] text-xs">Đang tải danh sách topping...</p>
                </div>
              ) : menuOptions.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-2xl border border-[#eee3df]">
                  <p className="text-[#7b6f70] text-xs">Chưa có topping nào. Nhấn &quot;+ Thêm Topping mới&quot; để tạo topping.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {menuOptions
                    .filter((opt) => {
                      if (!menuSearchQuery.trim()) return true;
                      return normalizeMenuText(opt.name).includes(normalizeMenuText(menuSearchQuery));
                    })
                    .map((opt) => {
                      const isAvailable = Boolean(opt.is_available);
                      const isEditingPrice = editingOptionPriceId === opt.id;
                      return (
                        <div
                          key={opt.id}
                          className="bg-white rounded-2xl border border-[#eee3df] p-4 hover:border-[#dfc9c2] transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl bg-[#fff5f5] text-[#831843] flex items-center justify-center font-bold text-lg shrink-0 border border-[#fed7aa]/30">
                                  🍮
                                </div>
                                <div>
                                  <h4 className="font-bold text-sm text-[#332a2b]">{opt.name}</h4>
                                  <span className="text-[10px] text-[#7b6f70] bg-[#f8f3ef] px-2 py-0.5 rounded-full font-medium">
                                    Topping
                                  </span>
                                </div>
                              </div>
                              <span className="font-extrabold text-sm text-[#6f2939] tabular-nums">
                                +{formatVND(opt.price_modifier)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3.5 pt-2.5 border-t border-[#f5efec] flex items-center justify-between gap-2">
                            {/* Toggle Stock Switch */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleOptionStock(opt)}
                                role="switch"
                                aria-checked={isAvailable}
                                aria-busy={updatingOptionIds.has(opt.id)}
                                disabled={updatingOptionIds.has(opt.id)}
                                className={`w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                                  isAvailable ? "bg-[#2d6a4f]" : "bg-[#d6ccc8]"
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                    isAvailable ? "translate-x-5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                              <span
                                className={`text-xs font-bold ${
                                  isAvailable ? "text-[#2d6a4f]" : "text-[#9c9391]"
                                }`}
                              >
                                {isAvailable ? "Còn hàng" : "Hết topping"}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5">
                              {isEditingPrice ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    step={1000}
                                    min={0}
                                    value={newOptionPriceValue}
                                    onChange={(e) => setNewOptionPriceValue(Number(e.target.value))}
                                    className="w-20 px-2 py-1 text-xs rounded-lg border border-[#e6dad5] focus:outline-none focus:ring-1 focus:ring-[#6f2939]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveOptionPrice(opt.id)}
                                    className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg bg-[#6f2939] text-white"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingOptionPriceId(null)}
                                    className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg bg-[#f4ece8] text-[#554a4c]"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingOptionPriceId(opt.id);
                                      setNewOptionPriceValue(opt.price_modifier);
                                    }}
                                    className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#332a2b] text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                                    title="Đổi giá topping"
                                  >
                                    <Edit2 size={13} />
                                    <span>Đổi giá</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingOption(opt)}
                                    className="min-h-[36px] px-2 py-1.5 rounded-xl border border-[#fecaca] text-[#b91c1c] hover:bg-[#fff5f5] text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                                    title="Xoá topping"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            <>
              {loadingMenu && menuItems.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-2xl border border-[#eee3df]">
                  <RefreshCw size={24} className="animate-spin text-[#6f2939] mx-auto mb-2" />
                  <p className="text-[#7b6f70] text-xs">Đang tải thực đơn...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {menuItems
                    .filter((item) => {
                      const cat = categories.find((c) => c.id === item.category_id);
                      return matchesMenuFilter(
                        item,
                        cat?.name || "",
                        selectedCategoryFilter,
                        menuSearchQuery,
                      );
                    })
                    .map((item) => {
                      const isAvailable = Boolean(item.is_available);
                      const cat = categories.find((c) => c.id === item.category_id);
                      return (
                        <div
                          key={item.id}
                          className="bg-white rounded-2xl border border-[#eee3df] p-4 hover:border-[#dfc9c2] transition-all flex flex-col justify-between"
                        >
                          <div>
                            {/* Visual & Basic Info */}
                            <div className="flex gap-3 items-start">
                              <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#fffaf4] border border-[#eee3df]">
                                <DrinkVisual
                                  itemId={item.id}
                                  imageUrl={item.image_url}
                                  name={item.name}
                                  category={cat?.name || "Thực đơn"}
                                  className="w-full h-full object-cover"
                                />
                                {item.badge && (
                                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-[#d96d83] text-white">
                                    {item.badge}
                                  </span>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-sm text-[#332a2b] truncate">{item.name}</h3>
                                {item.english_name && (
                                  <p className="text-xs text-[#9c9391] truncate">{item.english_name}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f8f3ef] text-[#7b6f70]">
                                    {cat?.name || "Món"}
                                  </span>
                                  <span className="font-extrabold text-sm text-[#6f2939] tabular-nums">
                                    {formatVND(item.base_price)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {item.description && (
                              <p className="text-xs text-[#7b6f70] mt-2 line-clamp-2">{item.description}</p>
                            )}
                          </div>

                          {/* Action Bar */}
                          <div className="mt-3.5 pt-2.5 border-t border-[#f5efec] flex items-center justify-between gap-2">
                            {/* Toggle Stock Switch */}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleItemStock(item)}
                                role="switch"
                                aria-checked={isAvailable}
                                aria-busy={updatingMenuItemIds.has(item.id)}
                                disabled={updatingMenuItemIds.has(item.id)}
                                className={`w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                                  isAvailable ? "bg-[#2d6a4f]" : "bg-[#d6ccc8]"
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                    isAvailable ? "translate-x-5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                              <span
                                className={`text-xs font-bold ${
                                  isAvailable ? "text-[#2d6a4f]" : "text-[#9c9391]"
                                }`}
                              >
                                {isAvailable ? "Còn hàng" : "Hết món"}
                              </span>
                            </div>

                            {/* Edit & Delete Buttons */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(item)}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#332a2b] text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                                title="Sửa chi tiết món"
                              >
                                <Edit2 size={13} />
                                <span>Sửa</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingItem(item)}
                                className="min-h-[36px] px-2 py-1.5 rounded-xl border border-[#fecaca] text-[#b91c1c] hover:bg-[#fff5f5] text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                                title="Xoá món"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 3: QUẢN LÝ GIÁ */}
      {activeTab === "pricing" && (
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#eee3df] space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#f5efec]">
            <div>
              <h2 className="text-base font-bold text-[#332a2b]">Quản lý giá bán món ăn, thức uống & topping</h2>
              <p className="text-xs text-[#7b6f70]">
                Cập nhật giá bán tiêu chuẩn cho từng món hoặc nhập hàng loạt từ Excel. Giá mới đồng bộ tức thời cho khách.
              </p>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex-1 min-w-[130px] sm:flex-none min-h-[42px] px-3.5 py-2 rounded-xl border border-[#e6dad5] bg-white hover:bg-[#fffaf4] active:scale-95 text-[#6f2939] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <FileSpreadsheet size={15} />
                <span>Nhập Excel / CSV</span>
              </button>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="flex-1 min-w-[130px] sm:flex-none min-h-[42px] px-4 py-2 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <Plus size={15} />
                <span>Thêm món mới</span>
              </button>
              <button
                type="button"
                onClick={fetchMenu}
                aria-label="Tải lại thực đơn"
                className="min-h-[42px] min-w-[42px] shrink-0 flex items-center justify-center rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#554a4c] active:scale-95 transition-all"
              >
                <RefreshCw size={15} className={loadingMenu ? "animate-spin text-[#6f2939]" : ""} />
              </button>
            </div>
          </div>

          {/* Search bar inside pricing tab */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-3 text-[#9c9391]" />
            <input
              type="text"
              value={pricingSearchQuery}
              onChange={(e) => setPricingSearchQuery(e.target.value)}
              placeholder="Tìm tên món ăn, đồ uống hoặc topping để chỉnh giá..."
              className="w-full pl-9 pr-4 py-2 min-h-[40px] rounded-xl border border-[#e6dad5] bg-[#fffaf4]/60 text-xs sm:text-sm text-[#332a2b] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#d96d83]/40"
            />
          </div>

          {/* Preset filter pills inside pricing tab */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {MENU_FILTER_PRESETS.map((preset) => {
              const count = ownerPresetCounts[preset.id];
              const isActive = pricingCategoryFilter === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPricingCategoryFilter(preset.id)}
                  className={`px-3 py-1.5 min-h-[34px] rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-[#6f2939] text-white shadow-xs"
                      : "bg-[#f8f3ef] text-[#7b6f70] hover:bg-[#eee3df]"
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span>{preset.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-[#eee3df] text-[#554a4c]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {categories.length > 0 && (
              <div className="w-[1px] h-5 bg-[#e6dad5] mx-1 shrink-0" />
            )}

            {categories.map((cat) => {
              const countInCat = menuItems.filter((m) => m.category_id === cat.id).length;
              const isActive = pricingCategoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPricingCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 min-h-[34px] rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-[#6f2939] text-white shadow-xs"
                      : "bg-[#f8f3ef] text-[#7b6f70] hover:bg-[#eee3df]"
                  }`}
                >
                  {cat.name} ({countInCat})
                </button>
              );
            })}
          </div>

          {/* Pricing List */}
          <div className="divide-y divide-[#f5efec]">
            {/* If Topping filter is active, only show Toppings */}
            {pricingCategoryFilter === "topping" ? (
              menuOptions
                .filter((opt) => {
                  if (!pricingSearchQuery.trim()) return true;
                  return normalizeMenuText(opt.name).includes(normalizeMenuText(pricingSearchQuery));
                })
                .map((opt) => {
                  const isEditing = editingOptionPriceId === opt.id;
                  return (
                    <div key={opt.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#fff5f5] text-[#831843] border border-[#eee3df] text-lg font-bold">
                          🍮
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[#332a2b]">{opt.name}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f8f3ef] text-[#7b6f70]">
                              Topping
                            </span>
                          </div>
                          <span className={`text-[11px] font-semibold ${opt.is_available ? "text-[#2d6a4f]" : "text-[#9c9391]"}`}>
                            {opt.is_available ? "Đang phục vụ" : "Hết hàng"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step={1000}
                              min={0}
                              value={newOptionPriceValue}
                              onChange={(e) => setNewOptionPriceValue(Number(e.target.value))}
                              className="w-28 px-2.5 py-1.5 text-sm rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveOptionPrice(opt.id)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-[#6f2939] text-white hover:bg-[#5a1f2d]"
                              title="Lưu giá"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingOptionPriceId(null)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-[#f4ece8] text-[#554a4c] hover:bg-[#eee3df]"
                              title="Huỷ"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <span className="font-extrabold text-sm sm:text-base text-[#6f2939] tabular-nums">
                              +{formatVND(opt.price_modifier)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOptionPriceId(opt.id);
                                setNewOptionPriceValue(opt.price_modifier);
                              }}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#554a4c] text-xs font-medium flex items-center gap-1"
                              title="Đổi giá topping"
                            >
                              <Edit2 size={13} />
                              <span>Đổi giá</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            ) : (
              <>
                {menuItems
                  .filter((item) => {
                    const cat = categories.find((c) => c.id === item.category_id);
                    return matchesMenuFilter(
                      item,
                      cat?.name || "",
                      pricingCategoryFilter,
                      pricingSearchQuery,
                    );
                  })
                  .map((item) => {
                    const isEditing = editingPriceId === item.id;
                    const cat = categories.find((c) => c.id === item.category_id);
                    return (
                      <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[#fffaf4] border border-[#eee3df]">
                            <DrinkVisual
                              itemId={item.id}
                              imageUrl={item.image_url}
                              name={item.name}
                              category={cat?.name || "Món"}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-[#332a2b]">{item.name}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#f8f3ef] text-[#7b6f70]">
                                {cat?.name || "Món"}
                              </span>
                            </div>
                            <p className="text-xs text-[#9c9391]">{item.english_name || ""}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step={1000}
                                min={0}
                                value={newPriceValue}
                                onChange={(e) => setNewPriceValue(Number(e.target.value))}
                                className="w-28 px-2.5 py-1.5 text-sm rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePrice(item.id)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-[#6f2939] text-white hover:bg-[#5a1f2d]"
                                title="Lưu giá"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPriceId(null)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-[#f4ece8] text-[#554a4c] hover:bg-[#eee3df]"
                                title="Huỷ"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <span className="font-extrabold text-sm sm:text-base text-[#6f2939] tabular-nums">
                                {formatVND(item.base_price)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPriceId(item.id);
                                  setNewPriceValue(item.base_price);
                                }}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#554a4c] text-xs font-medium flex items-center gap-1"
                                title="Đổi giá nhanh"
                              >
                                <Edit2 size={13} />
                                <span>Đổi giá</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(item)}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#554a4c] text-xs font-medium flex items-center gap-1"
                                title="Chỉnh sửa toàn bộ thông tin món"
                              >
                                <span>Sửa món</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {/* If "all" is active and toppings exist, also show Toppings in Pricing */}
                {pricingCategoryFilter === "all" && menuOptions.length > 0 && (
                  <div className="pt-6 mt-4">
                    <h3 className="font-bold text-sm text-[#332a2b] mb-3 flex items-center gap-2">
                      <span>🍮</span>
                      <span>Giá phụ thu Topping ({menuOptions.length})</span>
                    </h3>
                    <div className="divide-y divide-[#f5efec]">
                      {menuOptions
                        .filter((opt) => {
                          if (!pricingSearchQuery.trim()) return true;
                          return normalizeMenuText(opt.name).includes(normalizeMenuText(pricingSearchQuery));
                        })
                        .map((opt) => {
                          const isEditing = editingOptionPriceId === opt.id;
                          return (
                            <div key={opt.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#fff5f5] text-[#831843] border border-[#eee3df] text-sm font-bold">
                                  🍮
                                </div>
                                <span className="font-bold text-xs sm:text-sm text-[#332a2b]">{opt.name}</span>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3">
                                {isEditing ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      step={1000}
                                      min={0}
                                      value={newOptionPriceValue}
                                      onChange={(e) => setNewOptionPriceValue(Number(e.target.value))}
                                      className="w-24 px-2 py-1 text-xs rounded-lg border border-[#e6dad5] focus:outline-none focus:ring-1 focus:ring-[#6f2939]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveOptionPrice(opt.id)}
                                      className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg bg-[#6f2939] text-white"
                                    >
                                      <Check size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingOptionPriceId(null)}
                                      className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg bg-[#f4ece8] text-[#554a4c]"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-xs sm:text-sm text-[#6f2939] tabular-nums">
                                      +{formatVND(opt.price_modifier)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingOptionPriceId(opt.id);
                                        setNewOptionPriceValue(opt.price_modifier);
                                      }}
                                      className="min-h-[32px] px-2 py-1 rounded-lg border border-[#eee3df] hover:bg-[#fffaf4] text-[#554a4c] text-xs font-medium flex items-center gap-1"
                                      title="Đổi giá topping"
                                    >
                                      <Edit2 size={12} />
                                      <span>Đổi giá</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CÀI ĐẶT CỬA HÀNG */}
      {activeTab === "settings" && (
        <form
          onSubmit={handleSaveStoreSettings}
          className="bg-white p-5 sm:p-6 rounded-2xl border border-[#eee3df] space-y-4 max-w-xl"
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-[#f5efec]">
            <div>
              <h2 className="text-base font-bold text-[#332a2b]">Thiết lập nhận đơn trực tuyến</h2>
              <p className="text-xs text-[#7b6f70]">
                Cấu hình trạng thái mở nhận đơn, thông báo khách hàng và khung giờ phục vụ.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchStoreSettings}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-[#eee3df] hover:bg-[#fffaf4] text-[#554a4c]"
              title="Tải lại cài đặt"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {settingsMessage && (
            <div className="p-3 rounded-xl bg-[#f0faf5] border border-[#d8f3e5] text-xs font-semibold text-[#2d6a4f]">
              {settingsMessage}
            </div>
          )}

          {storeStatusError && (
            <AsyncStatePanel
              compact
              state="error"
              title="Không thể tải thiết lập nhận đơn"
              description={storeStatusError}
              actionLabel="Thử lại"
              onAction={() => void fetchStoreSettings()}
            />
          )}

          <div className="pt-1 space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#fffaf4] border border-[#eee3df]">
              <div>
                <strong className="block text-sm text-[#332a2b]">Cổng nhận đơn online</strong>
                <span className="text-xs text-[#7b6f70]">
                  Tắt tính năng này khi quán quá tải hoặc chuẩn bị đóng cửa.
                </span>
              </div>
              <button
                type="button"
                disabled={storeStatusLoading || isOrderingOpen === null}
                onClick={() => isOrderingOpen !== null && setIsOrderingOpen(!isOrderingOpen)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isOrderingOpen === null
                    ? "bg-[#eee3df] text-[#7b6f70]"
                    : isOrderingOpen
                    ? "bg-[#2d6a4f] text-white"
                    : "bg-[#b91c1c] text-white"
                }`}
              >
                {storeStatusLoading || isOrderingOpen === null
                  ? "Đang xác nhận…"
                  : isOrderingOpen
                  ? "Đang mở"
                  : "Tạm ngưng"}
              </button>
            </div>

            <div>
              <label htmlFor="store-hours" className="block text-xs font-semibold text-[#554a4c] mb-1">
                Giờ nhận đơn hiển thị cho khách
              </label>
              <input
                id="store-hours"
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="08:00 - 22:30"
                className="w-full text-sm px-3 py-2 min-h-[42px] rounded-xl border border-[#e6dad5] focus:ring-2 focus:ring-[#6f2939] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="store-announcement" className="block text-xs font-semibold text-[#554a4c] mb-1">
                Thông báo quán (nếu có)
              </label>
              <textarea
                id="store-announcement"
                rows={3}
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Ví dụ: Chào mừng bạn đến với LoopyCafe!"
                className="w-full text-sm p-3 rounded-xl border border-[#e6dad5] focus:ring-2 focus:ring-[#6f2939] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="min-h-[44px] py-2.5 px-6 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] text-white font-bold text-xs sm:text-sm transition-all disabled:opacity-50"
            >
              {savingSettings ? "Đang lưu..." : "Lưu thiết lập"}
            </button>
          </div>
        </form>
      )}

      {/* Order Detail Modal / Mobile Bottom Sheet */}
      {selectedOrder && (
        <ClientPortal>
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity z-0"
              onClick={() => setSelectedOrder(null)}
              aria-hidden="true"
            />
            <div
              ref={orderDetailDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-detail-title"
              className="relative z-10 w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-[#eee3df] max-h-[88dvh] sm:max-h-[90vh] overflow-y-auto custom-scroll flex flex-col justify-between"
            >
              {/* Mobile Drag Handle */}
              <div className="w-12 h-1.5 bg-[#e6dad5] rounded-full mx-auto mb-3 sm:hidden" />

            <div>
              <div className="flex items-center justify-between pb-3.5 border-b border-[#f5efec]">
                <div>
                  <h3 className="text-lg sm:text-xl font-extrabold text-[#332a2b]">{selectedOrder.orderCode}</h3>
                  <span className="text-xs text-[#9c9391]">
                    {new Date(selectedOrder.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-full hover:bg-[#fffaf4] text-[#7b6f70]"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Workflow Stepper inside Modal */}
              <OrderWorkflowStepper status={selectedOrder.status} />

              {/* Customer Details */}
              <div className="my-3.5 p-3.5 rounded-2xl bg-[#fffaf4] border border-[#eee3df] space-y-1 text-xs sm:text-sm">
                <div>
                  <span className="text-[#7b6f70]">Khách hàng:</span>{" "}
                  <strong className="text-[#332a2b]">{selectedOrder.customerName}</strong>
                </div>
                <div>
                  <span className="text-[#7b6f70]">Số điện thoại:</span>{" "}
                  <a
                    href={`tel:${selectedOrder.customerPhone}`}
                    className="text-[#6f2939] font-bold hover:underline"
                  >
                    {selectedOrder.customerPhone}
                  </a>
                </div>
                {selectedOrder.customerNote && (
                  <div>
                    <span className="text-[#7b6f70]">Ghi chú:</span>{" "}
                    <span className="text-[#554a4c] italic">&ldquo;{selectedOrder.customerNote}&rdquo;</span>
                  </div>
                )}
                {selectedOrder.status === "cancelled" && (
                  <div className="pt-2 border-t border-[#fecaca] text-[#991b1b]">
                    <span className="font-bold">Lý do huỷ:</span>{" "}
                    {selectedOrder.cancelReason || "Huỷ bởi cửa hàng"}
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="divide-y divide-[#f5efec] mb-4">
                {selectedOrder.items.map((it) => (
                  <div key={it.id} className="py-2.5 flex items-start justify-between text-xs sm:text-sm">
                    <div>
                      <div className="font-bold text-[#332a2b]">
                        {it.quantity}x {it.name}
                      </div>
                      <div className="text-[11px] text-[#7b6f70]">
                        {it.size || "Size M"} · {it.sugar || "100% đường"} · {it.ice || "100% đá"}
                      </div>
                      {it.toppings && it.toppings.length > 0 && (
                        <div className="text-[11px] text-[#6f2939]">
                          Topping: {it.toppings.map((t) => t.name).join(", ")}
                        </div>
                      )}
                      {it.note && <div className="text-[11px] text-[#9c9391] italic">&ldquo;{it.note}&rdquo;</div>}
                    </div>
                    <span className="font-bold text-[#332a2b] tabular-nums">{formatVND(it.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-[#eee3df] flex items-center justify-between text-base font-extrabold mb-4">
                <span className="text-[#332a2b]">Tổng tiền:</span>
                <span className="text-[#6f2939] tabular-nums">{formatVND(selectedOrder.totalAmount)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#f5efec]">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#e6dad5] text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4] active:scale-95"
              >
                Đóng
              </button>

              {canCancelOrders &&
                selectedOrder.status !== "completed" &&
                selectedOrder.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelModalOrder(selectedOrder);
                      setSelectedOrder(null);
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#fecaca] text-[#b91c1c] hover:bg-[#fff5f5] text-xs font-semibold active:scale-95"
                  >
                    Huỷ đơn
                  </button>
                )}

              {canTransitionOrders && selectedOrder.status === "pending" && (
                <>
                  <button
                    type="button"
                    disabled={updatingOrderIds.has(selectedOrder.id)}
                    onClick={() => void handleTransitionStatus(selectedOrder, "preparing", { autoAdvance: true })}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#6f2939] active:scale-95 text-white text-xs font-bold hover:bg-[#5a1f2d] flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-60"
                  >
                    {updatingOrderIds.has(selectedOrder.id) ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Coffee size={14} />
                    )}
                    <span>Nhận & Pha chế</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingOrderIds.has(selectedOrder.id)}
                    onClick={() => void handleTransitionStatus(selectedOrder, "completed", { autoAdvance: true })}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2d6a4f] active:scale-95 text-white text-xs font-bold hover:bg-[#23533d] flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-60"
                  >
                    {updatingOrderIds.has(selectedOrder.id) ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <CheckCheck size={15} strokeWidth={2.5} />
                    )}
                    <span>Hoàn tất 1-chạm</span>
                  </button>
                </>
              )}

              {canTransitionOrders && selectedOrder.status === "accepted" && (
                <>
                  <button
                    type="button"
                    disabled={updatingOrderIds.has(selectedOrder.id)}
                    onClick={() => void handleTransitionStatus(selectedOrder, "preparing")}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#d96d83] active:scale-95 text-white text-xs font-bold hover:bg-[#c75865] flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-60"
                  >
                    {updatingOrderIds.has(selectedOrder.id) ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Coffee size={14} />
                    )}
                    <span>Bắt đầu chuẩn bị</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingOrderIds.has(selectedOrder.id)}
                    onClick={() => void handleTransitionStatus(selectedOrder, "completed", { autoAdvance: true })}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2d6a4f] active:scale-95 text-white text-xs font-bold hover:bg-[#23533d] flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-60"
                  >
                    {updatingOrderIds.has(selectedOrder.id) ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <CheckCheck size={15} strokeWidth={2.5} />
                    )}
                    <span>Hoàn tất 1-chạm</span>
                  </button>
                </>
              )}

              {canTransitionOrders && selectedOrder.status === "preparing" && (
                <>
                  <button
                    type="button"
                    disabled={updatingOrderIds.has(selectedOrder.id)}
                    onClick={() => void handleTransitionStatus(selectedOrder, "ready")}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#2d6a4f] active:scale-95 text-white text-xs font-bold hover:bg-[#23533d] flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-60"
                  >
                    {updatingOrderIds.has(selectedOrder.id) ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    <span>Đánh dấu sẵn sàng</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingOrderIds.has(selectedOrder.id)}
                    onClick={() => void handleTransitionStatus(selectedOrder, "completed", { autoAdvance: true })}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#332a2b] active:scale-95 text-white text-xs font-bold hover:bg-[#1f191a] flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-60"
                  >
                    {updatingOrderIds.has(selectedOrder.id) ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <CheckCheck size={15} strokeWidth={2.5} />
                    )}
                    <span>Hoàn tất 1-chạm</span>
                  </button>
                </>
              )}

              {canTransitionOrders && selectedOrder.status === "ready" && (
                <button
                  type="button"
                  disabled={updatingOrderIds.has(selectedOrder.id)}
                  onClick={() => void handleTransitionStatus(selectedOrder, "completed")}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#332a2b] active:scale-95 text-white text-xs font-bold hover:bg-[#1f191a] flex items-center gap-1.5 shadow-2xs whitespace-nowrap disabled:opacity-60"
                >
                  {updatingOrderIds.has(selectedOrder.id) ? (
                    <RefreshCw size={13} className="animate-spin" />
                  ) : (
                    <Check size={15} strokeWidth={3} />
                  )}
                  <span>Hoàn tất đơn</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </ClientPortal>
      )}

      {/* Cancellation Modal */}
      {cancelModalOrder && (
        <ClientPortal>
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity z-0"
              onClick={() => {
                if (!isUpdatingStatus) setCancelModalOrder(null);
              }}
              aria-hidden="true"
            />
            <div
              ref={cancelDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-order-title"
              className="relative z-10 w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-[#eee3df]"
            >
              {/* Mobile Drag Handle */}
              <div className="w-12 h-1.5 bg-[#e6dad5] rounded-full mx-auto mb-3 sm:hidden" />

              <h3 id="cancel-order-title" className="font-bold text-base text-[#332a2b] mb-1">
                Xác nhận huỷ đơn {cancelModalOrder.orderCode}?
              </h3>
              <p className="text-xs text-[#7b6f70] mb-3">
                Hành động này sẽ thông báo cho khách hàng rằng đơn hàng đã bị huỷ.
              </p>

              {["preparing", "ready"].includes(cancelModalOrder.status) && (
                <div className="mb-3">
                  <label htmlFor="cancel-reason-code" className="block text-xs font-semibold text-[#554a4c] mb-1">
                    Mã lý do huỷ sau pha (DEC-007):
                  </label>
                  <select
                    id="cancel-reason-code"
                    value={cancelReasonCode}
                    onChange={(e) => setCancelReasonCode(e.target.value)}
                    className="w-full text-base sm:text-xs p-2.5 min-h-[44px] rounded-xl border border-[#e6dad5] bg-white focus:outline-none focus:ring-2 focus:ring-[#b91c1c]"
                  >
                    <option value="customer_abandoned">Khách không nhận / bỏ về (customer_abandoned)</option>
                    <option value="item_preparation_error">Pha chế hỏng / lỗi món (item_preparation_error)</option>
                    <option value="store_incident">Sự cố vận hành quán (store_incident)</option>
                  </select>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-[#b91c1c]">
                    Đơn sẽ được ghi vào Báo cáo hao hụt sau khi huỷ.
                  </p>
                </div>
              )}

              <label htmlFor="cancel-reason" className="block text-xs font-semibold text-[#554a4c] mb-1">
                Ghi chú chi tiết (không bắt buộc):
              </label>
              <input
                id="cancel-reason"
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ví dụ: Quán hết nguyên liệu, khách xin huỷ..."
                className="w-full text-base sm:text-xs p-3 min-h-[44px] rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#b91c1c] mb-4"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#e6dad5] text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4] active:scale-95"
                >
                  Không huỷ
                </button>
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={handleConfirmCancel}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#b91c1c] text-white text-xs font-bold hover:bg-[#991b1b] disabled:opacity-50 active:scale-95"
                >
                  Xác nhận huỷ
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Create / Edit Item Modal */}
      {isItemModalOpen && (
        <ClientPortal>
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity z-0"
              onClick={() => {
                if (!savingItem) setIsItemModalOpen(false);
              }}
              aria-hidden="true"
            />
            <div
              ref={itemDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="menu-item-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#eee3df] max-h-[90dvh] sm:max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="shrink-0 p-5 sm:p-6 pb-3 border-b border-[#f5efec]">
                <div className="w-12 h-1.5 bg-[#e6dad5] rounded-full mx-auto mb-3 sm:hidden" />
                <div className="flex items-center justify-between">
                  <div>
                    <h3 id="menu-item-modal-title" className="text-lg font-extrabold text-[#332a2b]">
                      {itemModalMode === "create" ? "Thêm món mới vào menu" : "Chỉnh sửa món ăn / thức uống"}
                    </h3>
                    <p className="text-xs text-[#7b6f70] mt-0.5">
                      Dữ liệu món sẽ cập nhật trực tiếp trên trang đặt món và phân hệ quản lý.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsItemModalOpen(false)}
                    aria-label="Đóng cửa sổ"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-[#fffaf4] text-[#7b6f70] active:scale-95 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 py-4 space-y-4 custom-scroll">
                {itemModalError && (
                  <div className="p-3 rounded-xl bg-[#fff5f5] border border-[#fecaca] text-xs font-semibold text-[#991b1b] flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{itemModalError}</span>
                  </div>
                )}

                <form id="menu-item-form" onSubmit={handleSaveItem} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Tên món */}
                    <div>
                      <label htmlFor="item-name" className="block text-xs font-semibold text-[#554a4c] mb-1">
                        Tên món <span className="text-[#b91c1c]">*</span>
                      </label>
                      <input
                        id="item-name"
                        type="text"
                        required
                        value={itemFormData.name}
                        onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                        placeholder="Ví dụ: Trà Sữa Mắc Ca Săn Mây"
                        className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                      />
                    </div>

                    {/* Tên tiếng Anh */}
                    <div>
                      <label htmlFor="item-english-name" className="block text-xs font-semibold text-[#554a4c] mb-1">
                        Tên tiếng Anh (tuỳ chọn)
                      </label>
                      <input
                        id="item-english-name"
                        type="text"
                        value={itemFormData.englishName}
                        onChange={(e) => setItemFormData({ ...itemFormData, englishName: e.target.value })}
                        placeholder="Ví dụ: Macadamia Cloud Tea"
                        className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                      />
                    </div>

                    {/* Danh mục */}
                    <div>
                      <label htmlFor="item-category" className="block text-xs font-semibold text-[#554a4c] mb-1">
                        Danh mục <span className="text-[#b91c1c]">*</span>
                      </label>
                      <select
                        id="item-category"
                        value={itemFormData.categoryId}
                        onChange={(e) => setItemFormData({ ...itemFormData, categoryId: e.target.value })}
                        className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] bg-white focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                      >
                        {categories.length === 0 && (
                          <option value="">Đang tải danh mục...</option>
                        )}
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Giá cơ bản */}
                    <div>
                      <label htmlFor="item-price" className="block text-xs font-semibold text-[#554a4c] mb-1">
                        Giá bán tiêu chuẩn (VND) <span className="text-[#b91c1c]">*</span>
                      </label>
                      <input
                        id="item-price"
                        type="number"
                        min={0}
                        step={1000}
                        required
                        value={itemFormData.basePrice}
                        onChange={(e) => setItemFormData({ ...itemFormData, basePrice: Number(e.target.value) })}
                        className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                      />
                    </div>

                    {/* Nhãn nổi bật (Badge) */}
                    <div>
                      <label htmlFor="item-badge" className="block text-xs font-semibold text-[#554a4c] mb-1">
                        Huy hiệu / Nhãn (Badge)
                      </label>
                      <input
                        id="item-badge"
                        type="text"
                        value={itemFormData.badge}
                        onChange={(e) => setItemFormData({ ...itemFormData, badge: e.target.value })}
                        placeholder="Ví dụ: Signature, Best-seller, Mới..."
                        className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                      />
                    </div>

                    {/* Thứ tự sắp xếp */}
                    <div>
                      <label htmlFor="item-sort-order" className="block text-xs font-semibold text-[#554a4c] mb-1">
                        Thứ tự sắp xếp
                      </label>
                      <input
                        id="item-sort-order"
                        type="number"
                        value={itemFormData.sortOrder}
                        onChange={(e) => setItemFormData({ ...itemFormData, sortOrder: Number(e.target.value) })}
                        className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                      />
                    </div>
                  </div>

                  {/* URL Hình ảnh */}
                  <div>
                    <label htmlFor="item-image" className="block text-xs font-semibold text-[#554a4c] mb-1">
                      Đường dẫn ảnh đồ uống
                    </label>
                    <input
                      id="item-image"
                      type="text"
                      value={itemFormData.imageUrl}
                      onChange={(e) => setItemFormData({ ...itemFormData, imageUrl: e.target.value })}
                      placeholder="/laboong/drinks/san-may.jpg"
                      className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                    />
                  </div>

                  {/* Mô tả món */}
                  <div>
                    <label htmlFor="item-desc" className="block text-xs font-semibold text-[#554a4c] mb-1">
                      Mô tả món
                    </label>
                    <textarea
                      id="item-desc"
                      rows={2}
                      value={itemFormData.description}
                      onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                      placeholder="Mô tả hương vị, nguyên liệu nổi bật của món..."
                      className="w-full text-base sm:text-xs p-3 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                    />
                  </div>

                  {/* Tùy chọn món (Checkboxes) */}
                  <div className="p-3.5 bg-[#fffaf4] rounded-2xl border border-[#eee3df] space-y-2.5">
                    <span className="block text-xs font-bold text-[#332a2b]">Tuỳ chọn cho khách hàng:</span>
                    <div className="grid grid-cols-2 gap-2 text-xs text-[#554a4c]">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={itemFormData.allowsSize}
                          onChange={(e) => setItemFormData({ ...itemFormData, allowsSize: e.target.checked })}
                          className="w-4 h-4 rounded accent-[#6f2939]"
                        />
                        <span>Cho chọn Size (M/L)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={itemFormData.allowsSugar}
                          onChange={(e) => setItemFormData({ ...itemFormData, allowsSugar: e.target.checked })}
                          className="w-4 h-4 rounded accent-[#6f2939]"
                        />
                        <span>Cho chọn Đường</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={itemFormData.allowsIce}
                          onChange={(e) => setItemFormData({ ...itemFormData, allowsIce: e.target.checked })}
                          className="w-4 h-4 rounded accent-[#6f2939]"
                        />
                        <span>Cho chọn Đá</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={itemFormData.allowsToppings}
                          onChange={(e) => setItemFormData({ ...itemFormData, allowsToppings: e.target.checked })}
                          className="w-4 h-4 rounded accent-[#6f2939]"
                        />
                        <span>Cho thêm Topping</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none col-span-2 pt-2 border-t border-[#eee3df]">
                        <input
                          type="checkbox"
                          checked={itemFormData.isAvailable}
                          onChange={(e) => setItemFormData({ ...itemFormData, isAvailable: e.target.checked })}
                          className="w-4 h-4 rounded accent-[#2d6a4f]"
                        />
                        <span className="font-bold text-[#2d6a4f]">Đang phục vụ (Còn hàng)</span>
                      </label>
                    </div>
                  </div>
                </form>
              </div>

              {/* Sticky Form Footer Buttons */}
              <div className="shrink-0 p-4 sm:p-6 pt-3 border-t border-[#f5efec] bg-white flex items-center justify-end gap-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-5">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[#e6dad5] text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4] active:scale-95 transition-all"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  form="menu-item-form"
                  disabled={savingItem}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] active:scale-95 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-xs"
                >
                  {savingItem ? "Đang lưu..." : itemModalMode === "create" ? "Tạo món mới" : "Lưu thay đổi"}
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Delete Item Confirmation Modal */}
      {deletingItem && (
        <ClientPortal>
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity z-0"
              onClick={() => {
                if (!isDeleting) setDeletingItem(null);
              }}
              aria-hidden="true"
            />
            <div
              ref={deleteDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-item-title"
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-[#eee3df]"
            >
              {/* Mobile Drag Handle */}
              <div className="w-12 h-1.5 bg-[#e6dad5] rounded-full mx-auto mb-3 sm:hidden" />

              <div className="flex items-center gap-3 text-[#b91c1c] mb-2">
                <div className="p-2 rounded-xl bg-[#fff5f5]">
                  <Trash2 size={22} />
                </div>
                <h3 id="delete-item-title" className="font-bold text-base text-[#332a2b]">Xác nhận xoá món</h3>
              </div>

              <p className="text-xs text-[#554a4c] mb-2 leading-relaxed">
                Bạn có chắc chắn muốn xoá món <strong className="text-[#332a2b]">{deletingItem.name}</strong> khỏi menu quán?
              </p>
              <p className="text-[11px] text-[#7b6f70] bg-[#fffaf4] p-2.5 rounded-xl mb-4 border border-[#eee3df]">
                Lưu ý: Món này sẽ không còn hiển thị cho khách đặt. Lịch sử các đơn hàng cũ đã đặt món này vẫn được bảo lưu an toàn.
              </p>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#e6dad5] text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4] active:scale-95"
                >
                  Không xoá
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#b91c1c] text-white text-xs font-bold hover:bg-[#991b1b] disabled:opacity-50 active:scale-95 transition-all"
                >
                  {isDeleting ? "Đang xoá..." : "Xoá món"}
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Create Topping Modal */}
      {isToppingModalOpen && (
        <ClientPortal>
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity z-0"
              onClick={() => {
                if (!savingTopping) setIsToppingModalOpen(false);
              }}
              aria-hidden="true"
            />
            <div
              ref={toppingDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="topping-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[#eee3df] max-h-[90dvh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="shrink-0 p-5 sm:p-6 pb-3 border-b border-[#f5efec]">
                <div className="w-12 h-1.5 bg-[#e6dad5] rounded-full mx-auto mb-3 sm:hidden" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍮</span>
                    <div>
                      <h3 id="topping-modal-title" className="text-base sm:text-lg font-extrabold text-[#332a2b]">
                        Thêm Topping mới
                      </h3>
                      <p className="text-xs text-[#7b6f70] mt-0.5">
                        Topping sẽ hiển thị khi khách chọn đồ uống tương thích.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsToppingModalOpen(false)}
                    aria-label="Đóng cửa sổ"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full hover:bg-[#fffaf4] text-[#7b6f70] active:scale-95"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Form Body */}
              <form id="topping-form" onSubmit={handleSaveTopping} className="p-5 sm:p-6 space-y-4">
                <div>
                  <label htmlFor="topping-name" className="block text-xs font-semibold text-[#554a4c] mb-1">
                    Tên topping <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input
                    id="topping-name"
                    type="text"
                    required
                    value={toppingFormData.name}
                    onChange={(e) => setToppingFormData({ ...toppingFormData, name: e.target.value })}
                    placeholder="Ví dụ: Trân Châu Đường Đen, Kem Trứng..."
                    className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                  />
                </div>

                <div>
                  <label htmlFor="topping-price" className="block text-xs font-semibold text-[#554a4c] mb-1">
                    Giá phụ thu (VND) <span className="text-[#b91c1c]">*</span>
                  </label>
                  <input
                    id="topping-price"
                    type="number"
                    min={0}
                    step={1000}
                    required
                    value={toppingFormData.priceModifier}
                    onChange={(e) => setToppingFormData({ ...toppingFormData, priceModifier: Number(e.target.value) })}
                    className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-[#e6dad5] focus:outline-none focus:ring-2 focus:ring-[#6f2939]"
                  />
                </div>

                <div className="p-3.5 bg-[#fffaf4] rounded-2xl border border-[#eee3df]">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={toppingFormData.isAvailable}
                      onChange={(e) => setToppingFormData({ ...toppingFormData, isAvailable: e.target.checked })}
                      className="w-4 h-4 rounded accent-[#2d6a4f]"
                    />
                    <span className="font-bold text-xs text-[#2d6a4f]">Đang phục vụ (Còn hàng)</span>
                  </label>
                </div>
              </form>

              {/* Footer */}
              <div className="shrink-0 p-4 sm:p-6 pt-3 border-t border-[#f5efec] bg-white flex items-center justify-end gap-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-5">
                <button
                  type="button"
                  onClick={() => setIsToppingModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[#e6dad5] text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4]"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  form="topping-form"
                  disabled={savingTopping}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#6f2939] hover:bg-[#5a1f2d] active:scale-95 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-xs"
                >
                  {savingTopping ? "Đang lưu..." : "Thêm topping"}
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Delete Topping Confirmation Modal */}
      {deletingOption && (
        <ClientPortal>
          <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="absolute inset-0 bg-black/55 backdrop-blur-xs transition-opacity z-0"
              onClick={() => {
                if (!isDeletingOption) setDeletingOption(null);
              }}
              aria-hidden="true"
            />
            <div
              ref={deleteOptionDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-option-title"
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-[#eee3df]"
            >
              <div className="w-12 h-1.5 bg-[#e6dad5] rounded-full mx-auto mb-3 sm:hidden" />
              <div className="flex items-center gap-3 text-[#b91c1c] mb-2">
                <div className="p-2 rounded-xl bg-[#fff5f5]">
                  <Trash2 size={22} />
                </div>
                <h3 id="delete-option-title" className="font-bold text-base text-[#332a2b]">Xác nhận xoá topping</h3>
              </div>
              <p className="text-xs text-[#554a4c] mb-2 leading-relaxed">
                Bạn có chắc chắn muốn xoá topping <strong className="text-[#332a2b]">{deletingOption.name}</strong> khỏi menu không?
              </p>
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setDeletingOption(null)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[#e6dad5] text-xs font-semibold text-[#554a4c] hover:bg-[#fffaf4]"
                >
                  Không xoá
                </button>
                <button
                  type="button"
                  disabled={isDeletingOption}
                  onClick={handleConfirmDeleteOption}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#b91c1c] text-white text-xs font-bold hover:bg-[#991b1b] disabled:opacity-50 transition-all"
                >
                  {isDeletingOption ? "Đang xoá..." : "Xoá topping"}
                </button>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Excel / CSV Import Modal */}
      <MenuImportModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        categories={categories}
        existingItemNames={useMemo(
          () => new Set(menuItems.map((m) => m.name.toLowerCase().trim())),
          [menuItems],
        )}
        onImportSuccess={async (res) => {
          await fetchMenu();
          const msg =
            res.updatedItems && res.updatedItems > 0
              ? `Đã cập nhật ${res.updatedItems} món và thêm mới ${res.createdItems} món vào thực đơn! 🎉`
              : `Đã nhập thành công ${res.createdItems} món vào thực đơn! 🎉`;
          setStatusFeedback({
            kind: "success",
            message: msg,
          });
        }}
      />
    </div>
  );
}

