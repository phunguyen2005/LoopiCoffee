"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import { formatVND } from "../order/menu-card";
import { DrinkVisual } from "../order/drink-visual";
import { AsyncStatePanel, ListSkeleton } from "./shared";

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
}

interface CategoryManagement {
  id: string;
  name: string;
  english_name?: string | null;
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

export function OwnerOrdersView() {
  const [activeTab, setActiveTab] = useState<"orders" | "menu" | "pricing" | "settings">("orders");

  // Orders State
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [counts, setCounts] = useState<OrderCounts | null>(null);
  const [isOrderingOpen, setIsOrderingOpen] = useState<boolean | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<{ message: string; status?: number; code?: string } | null>(null);
  const [ordersUpdatedAt, setOrdersUpdatedAt] = useState<Date | null>(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(true);
  const [storeStatusError, setStoreStatusError] = useState("");
  const ordersRequestIdRef = useRef(0);
  const isCancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

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
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Menu Management State
  const [menuItems, setMenuItems] = useState<MenuItemManagement[]>([]);
  const [categories, setCategories] = useState<CategoryManagement[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [newPriceValue, setNewPriceValue] = useState<number>(0);

  // Filter & Search inside Menu Tab
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [menuSearchQuery, setMenuSearchQuery] = useState<string>("");

  // Item Create / Edit Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
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

  // Store Settings State
  const [announcement, setAnnouncement] = useState("");
  const [openingHours, setOpeningHours] = useState("08:00 - 22:30");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  // Fetch Orders
  const fetchOrders = useCallback(async (isPolling = false) => {
    const currentReqId = ++ordersRequestIdRef.current;
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
      if (currentReqId !== ordersRequestIdRef.current || isCancelledRef.current) return;

      if (res.ok) {
        const data = (await res.json()) as {
          orders?: OrderRecord[];
          counts?: OrderCounts;
          isOrderingOpen?: boolean;
        };
        if (currentReqId !== ordersRequestIdRef.current || isCancelledRef.current) return;

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
        if (currentReqId !== ordersRequestIdRef.current || isCancelledRef.current) return;
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
      if (currentReqId !== ordersRequestIdRef.current || isCancelledRef.current) return;
      setOrdersError({
        message: "Không thể tải danh sách đơn hàng. Vui lòng thử lại.",
      });
    } finally {
      if (currentReqId === ordersRequestIdRef.current && !isCancelledRef.current && !isPolling) {
        setLoadingOrders(false);
      }
    }
  }, [statusFilter, searchQuery, buildDateQuery]);

  // Fetch Menu Items
  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/menu", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          items?: MenuItemManagement[];
          categories?: CategoryManagement[];
        };
        setMenuItems(data.items || []);
        setCategories(data.categories || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMenu(false);
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
    isCancelledRef.current = false;
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
      isCancelledRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [fetchOrders, fetchStoreSettings]);

  useEffect(() => {
    let isCancelled = false;
    if (activeTab === "menu" || activeTab === "pricing") {
      fetch("/api/owner/menu", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((raw: unknown) => {
          if (!raw || isCancelled) return;
          const data = raw as {
            items?: MenuItemManagement[];
            categories?: CategoryManagement[];
          };
          setMenuItems(data.items || []);
          setCategories(data.categories || []);
        })
        .catch(() => {})
        .finally(() => {
          if (!isCancelled) setLoadingMenu(false);
        });
    } else if (activeTab === "settings") {
      const timer = window.setTimeout(() => { if (!isCancelled) void fetchStoreSettings(); }, 0);
      return () => { isCancelled = true; window.clearTimeout(timer); };
    }

    return () => {
      isCancelled = true;
    };
  }, [activeTab, fetchStoreSettings]);

  // Status transition handler
  const handleTransitionStatus = async (order: OrderRecord, newStatus: string) => {
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/owner/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, expectedStatus: order.status }),
      });
      if (res.ok) {
        await fetchOrders(true);
      } else {
        const err = (await res.json()) as { error?: string };
        alert(err.error || "Không thể cập nhật trạng thái đơn.");
        await fetchOrders(true);
      }
    } catch {
      alert("Lỗi kết nối máy chủ.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle Cancel Order
  const handleConfirmCancel = async () => {
    if (!cancelModalOrder) return;
    if (isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/owner/orders/${cancelModalOrder.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus: "cancelled",
          expectedStatus: cancelModalOrder.status,
          cancelReason: cancelReason.trim() || "Chủ quán huỷ đơn",
        }),
      });
      if (res.ok) {
        setCancelModalOrder(null);
        setCancelReason("");
        await fetchOrders(true);
      } else {
        const err = (await res.json()) as { error?: string };
        alert(err.error || "Không thể huỷ đơn hàng.");
        await fetchOrders(true);
      }

    } catch {
      alert("Lỗi kết nối máy chủ.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Toggle item in/out of stock
  const handleToggleItemStock = async (item: MenuItemManagement) => {
    const nextVal = !Boolean(item.is_available);
    // Optimistic update
    setMenuItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_available: nextVal } : i)),
    );

    try {
      const res = await fetch("/api/owner/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, isAvailable: nextVal }),
      });
      if (!res.ok) {
        // Rollback
        setMenuItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_available: !nextVal } : i)),
        );
      }
    } catch {
      // Rollback
      setMenuItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: !nextVal } : i)),
      );
    }
  };

  // Open modal to create a new item
  const handleOpenCreateModal = () => {
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
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#3D5A40]">
              Phân hệ quản trị La Boong
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#EBF1EA] text-[#3D5A40]">
              Live Orders
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 mt-1">
            Quản Lý Đơn Hàng Trực Tuyến
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Đồng bộ đơn hàng thời gian thực từ khách hàng trang{" "}
            <a
              href="/order"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[#3D5A40] hover:underline inline-flex items-center gap-1"
            >
              order.loopicafe.vn (/order) <ExternalLink size={12} />
            </a>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sound Alert Toggle */}
          <button
            type="button"
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              if (!soundEnabled) playChimeSound();
            }}
            title={soundEnabled ? "Tắt âm báo đơn mới" : "Bật âm báo chuông đơn mới"}
            className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold transition-all ${
              soundEnabled
                ? "bg-amber-50 text-amber-900 border-amber-300"
                : "bg-stone-50 text-stone-500 border-stone-200"
            }`}
          >
            {soundEnabled ? <Volume2 size={16} className="text-amber-600" /> : <VolumeX size={16} />}
            <span className="hidden sm:inline">{soundEnabled ? "Chuông: Bật" : "Chuông: Tắt"}</span>
          </button>

          {/* Online Ordering Toggle Quick Switch */}
          <div className="flex items-center gap-2 p-1.5 px-3 rounded-xl border border-stone-200 bg-stone-50 text-xs">
            <span className="font-semibold text-stone-600">Nhận đơn:</span>
            <button
              type="button"
              disabled={storeStatusLoading || isOrderingOpen === null}
              onClick={() => isOrderingOpen !== null && handleToggleStoreOrdering(!isOrderingOpen)}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                isOrderingOpen === null
                  ? "bg-stone-200 text-stone-500"
                  : isOrderingOpen
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-red-600 text-white shadow-sm"
              }`}
            >
              {storeStatusLoading || isOrderingOpen === null ? "Đang xác nhận…" : isOrderingOpen ? "● Đang mở" : "○ Tạm ngưng"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchOrders(false)}
            aria-label="Làm mới dữ liệu đơn"
            className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 transition-colors"
          >
            <RefreshCw size={16} className={loadingOrders ? "animate-spin text-[#3D5A40]" : ""} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-stone-200 overflow-x-auto gap-2 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "orders"
              ? "border-[#3D5A40] text-[#3D5A40]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <ShoppingBag size={16} />
          <span>Đơn hàng</span>
          {counts !== null && counts.pending > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-[#C85A32] text-white animate-pulse">
              {counts.pending}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("menu")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "menu"
              ? "border-[#3D5A40] text-[#3D5A40]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Layers size={16} />
          <span>Menu & Món còn/hết</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pricing")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "pricing"
              ? "border-[#3D5A40] text-[#3D5A40]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <DollarSign size={16} />
          <span>Quản lý giá</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`pb-3 px-4 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === "settings"
              ? "border-[#3D5A40] text-[#3D5A40]"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Store size={16} />
          <span>Cài đặt nhận đơn</span>
        </button>
      </div>

      {/* TAB 1: ORDERS DASHBOARD */}
      {activeTab === "orders" && (
        <div className="space-y-4 sm:space-y-5">
          {/* Summary Metric Counters (Horizontal swipe on mobile, grid on sm+) */}
          <div className="flex overflow-x-auto pb-1 gap-2.5 sm:grid sm:grid-cols-4 lg:grid-cols-7 sm:gap-3 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
            {[
              { key: "all", label: "Tất cả đơn", count: counts?.total, color: "bg-stone-100 text-stone-800" },
              {
                key: "pending",
                label: "Chờ xác nhận",
                count: counts?.pending,
                color: (counts?.pending ?? 0) > 0 ? "bg-amber-500 text-white font-bold animate-pulse shadow-md" : "bg-amber-100 text-amber-800",
              },
              { key: "accepted", label: "Đã nhận", count: counts?.accepted, color: "bg-blue-100 text-blue-800" },
              { key: "preparing", label: "Đang chuẩn bị", count: counts?.preparing, color: "bg-purple-100 text-purple-800" },
              { key: "ready", label: "Sẵn sàng", count: counts?.ready, color: "bg-emerald-100 text-emerald-800" },
              { key: "completed", label: "Hoàn tất", count: counts?.completed, color: "bg-stone-200 text-stone-700" },
              {
                key: "cancelled",
                label: "Đã huỷ",
                count: counts?.cancelled,
                color: (counts?.cancelled ?? 0) > 0 ? "bg-red-500 text-white font-bold shadow-md" : "bg-red-100 text-red-700",
              },
            ].map((stat) => (
              <button
                key={stat.key}
                type="button"
                onClick={() => setStatusFilter(stat.key)}
                className={`min-w-[125px] sm:min-w-0 p-3 sm:p-3.5 rounded-2xl border text-left transition-all flex-shrink-0 ${
                  statusFilter === stat.key
                    ? "border-[#3D5A40] ring-2 ring-[#3D5A40]/30 shadow-sm"
                    : "border-stone-200 hover:border-stone-300"
                } bg-white active:scale-95`}
              >
                <div className="text-[11px] sm:text-xs text-stone-500 font-medium whitespace-nowrap">{stat.label}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg sm:text-xl font-black text-stone-900">{stat.count ?? "—"}</span>
                  <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full ${stat.color}`}>
                    {stat.count ?? "—"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Date Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-stone-700">
              <Calendar size={16} className="text-[#3D5A40]" />
              <span>Thời gian:</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {[
                { key: "all", label: "Tất cả" },
                { key: "today", label: "Hôm nay" },
                { key: "yesterday", label: "Hôm qua" },
                { key: "7days", label: "7 ngày qua" },
                { key: "custom", label: "Tùy chọn ngày" },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setDatePreset(p.key as typeof datePreset)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    datePreset === p.key
                      ? "bg-[#3D5A40] text-white shadow-sm font-bold"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200"
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
                  className="px-2.5 py-1 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                />
              )}
            </div>
          </div>

          {/* Search & Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-3 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm mã đơn (LB-..), tên, SĐT..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-xs text-stone-500">
                {loadingOrders && counts === null ? "Đang xác nhận dữ liệu" : <>Hiển thị <strong>{orders.length}</strong> đơn hàng</>}
                {statusFilter !== "all" && ` (${statusFilter})`}
              </span>
            </div>
          </div>

          {/* Stale Data Warning Banner */}
          {orders.length > 0 && ordersError && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 shadow-sm">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Dữ liệu có thể chưa được cập nhật mới nhất</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {ordersError.message}
                    {ordersUpdatedAt && ` Lần cập nhật thành công: ${ordersUpdatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void fetchOrders(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-200/80 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-semibold shrink-0 transition-colors"
              >
                <RefreshCw size={14} />
                Thử lại ngay
              </button>
            </div>
          )}

          {/* Order Cards List */}
          {loadingOrders && orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200"><ListSkeleton rows={5} /></div>
          ) : orders.length === 0 && ordersError ? (
            <AsyncStatePanel
              state="error"
              title={ordersError.status === 401 ? "Phiên đăng nhập đã hết hạn" : ordersError.status === 403 ? "Không có quyền xem đơn hàng" : "Không thể tải danh sách đơn hàng"}
              description={ordersError.message}
              actionLabel={ordersError.status === 401 ? "Đăng nhập lại" : "Thử lại"}
              actionHref={ordersError.status === 401 ? "/auth/login" : undefined}
              onAction={ordersError.status === 401 ? undefined : () => void fetchOrders(false)}
            />
          ) : orders.length === 0 ? (
            statusFilter !== "all" || searchQuery.trim() || datePreset !== "all" ? (
              <AsyncStatePanel state="empty" title="Không có đơn khớp bộ lọc" description="Thử điều kiện khác hoặc xóa toàn bộ bộ lọc hiện tại." actionLabel="Xóa bộ lọc" onAction={() => { setStatusFilter("all"); setSearchQuery(""); setDatePreset("all"); setCustomDate(""); }} />
            ) : (
              <AsyncStatePanel state="empty" title="Chưa phát sinh đơn hàng" description="Đơn đặt thành công từ trang khách hàng sẽ xuất hiện tại đây." />
            )
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-sm transition-all flex flex-col justify-between ${
                        isPending
                          ? "border-amber-400 bg-amber-50/25 ring-2 ring-amber-300/60"
                          : "border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-100">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-base sm:text-lg text-stone-900 tracking-tight">
                                {ord.orderCode}
                              </span>
                              {isPending && (
                                <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-amber-500 text-white animate-pulse">
                                  MỚI
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-1.5">
                              <Clock size={12} />
                              <span>
                                {new Date(ord.createdAt).toLocaleTimeString("vi-VN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span>•</span>
                              <span>{ord.itemCount} món</span>
                            </div>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                              ord.status === "pending"
                                ? "bg-amber-100 text-amber-800"
                                : ord.status === "accepted"
                                ? "bg-blue-100 text-blue-800"
                                : ord.status === "preparing"
                                ? "bg-purple-100 text-purple-800"
                                : ord.status === "ready"
                                ? "bg-emerald-100 text-emerald-800"
                                : ord.status === "completed"
                                ? "bg-stone-200 text-stone-800"
                                : "bg-red-100 text-red-800"
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

                        {/* Customer Info */}
                        <div className="py-2.5 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2 bg-stone-50/90 px-3 rounded-xl my-3">
                          <div>
                            <span className="text-stone-400">Khách:</span>{" "}
                            <strong className="text-stone-800">{ord.customerName}</strong>
                          </div>
                          <a
                            href={`tel:${ord.customerPhone}`}
                            className="flex items-center gap-1 text-[#3D5A40] font-bold hover:underline"
                          >
                            <Phone size={13} />
                            <span>{ord.customerPhone}</span>
                          </a>
                        </div>

                        {/* Items Preview */}
                        <div className="space-y-1.5 my-2">
                          {ord.items.map((it) => (
                            <div key={it.id} className="text-xs flex items-baseline justify-between text-stone-700">
                              <div className="flex items-baseline gap-1.5 flex-grow pr-2">
                                <span className="font-bold text-stone-900">{it.quantity}x</span>
                                <span className="font-medium">{it.name}</span>
                                <span className="text-[11px] text-stone-400">
                                  ({it.size || "M"}{it.sugar ? `, ${it.sugar.split(" ")[0]}` : ""})
                                </span>
                              </div>
                              <span className="font-semibold text-stone-900 whitespace-nowrap">
                                {formatVND(it.subtotal)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {ord.customerNote && (
                          <div className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg mt-2 italic">
                            &ldquo;Ghi chú: {ord.customerNote}&rdquo;
                          </div>
                        )}

                        {ord.status === "cancelled" && (
                          <div className="text-xs text-red-800 bg-red-50 border border-red-200 p-2.5 rounded-xl mt-2 flex items-start gap-1.5">
                            <span className="font-bold whitespace-nowrap">Lý do huỷ:</span>
                            <span>{ord.cancelReason || "Huỷ bởi cửa hàng"}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions & Next Step Button */}
                      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                        <div className="font-extrabold text-sm text-[#C85A32]">
                          {formatVND(ord.totalAmount)}
                        </div>

                        <div className="flex items-center gap-2.5 sm:gap-3">
                          {ord.status === "cancelled" && (
                            <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-xl">
                              Đơn đã huỷ
                            </span>
                          )}

                          {/* Cancel Button - Kept separated with gap and confirmation modal */}
                          {ord.status !== "completed" && ord.status !== "cancelled" && (
                            <button
                              type="button"
                              onClick={() => setCancelModalOrder(ord)}
                              className="min-h-[44px] px-3 py-2.5 rounded-xl border border-red-200 text-red-600 bg-red-50/50 hover:bg-red-100 text-xs font-semibold transition-colors active:scale-95"
                            >
                              Huỷ
                            </button>
                          )}

                          {/* Workflow Next Action Buttons - 44px touch targets */}
                          {ord.status === "pending" && (
                            <button
                              type="button"
                              disabled={isUpdatingStatus}
                              onClick={() => handleTransitionStatus(ord, "accepted")}
                              className="min-h-[44px] px-3.5 sm:px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                            >
                              <span>Xác nhận</span>
                              <ArrowRight size={14} />
                            </button>
                          )}

                          {ord.status === "accepted" && (
                            <button
                              type="button"
                              disabled={isUpdatingStatus}
                              onClick={() => handleTransitionStatus(ord, "preparing")}
                              className="min-h-[44px] px-3.5 sm:px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                            >
                              <span>Chuẩn bị</span>
                              <ArrowRight size={14} />
                            </button>
                          )}

                          {ord.status === "preparing" && (
                            <button
                              type="button"
                              disabled={isUpdatingStatus}
                              onClick={() => handleTransitionStatus(ord, "ready")}
                              className="min-h-[44px] px-3.5 sm:px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                            >
                              <span>Sẵn sàng</span>
                              <ArrowRight size={14} />
                            </button>
                          )}

                          {ord.status === "ready" && (
                            <button
                              type="button"
                              disabled={isUpdatingStatus}
                              onClick={() => handleTransitionStatus(ord, "completed")}
                              className="min-h-[44px] px-3.5 sm:px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-black active:scale-95 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                            >
                              <span>Hoàn tất</span>
                              <Check size={14} strokeWidth={3} />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedOrder(ord)}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 active:scale-95"
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

      {/* TAB 2: MENU & MÓN CÒN/HẾT (FULL CRUD) */}
      {activeTab === "menu" && (
        <div className="space-y-4">
          {/* Header Bar */}
          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Quản Lý Thực Đơn & Món Ăn</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Thêm món mới, chỉnh sửa thông tin, giá bán, topping và trạng thái còn/hết hàng. Đồng bộ trực tiếp với trang khách đặt món.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl bg-[#3D5A40] hover:bg-[#2B3E2D] active:scale-95 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all"
              >
                <Plus size={16} />
                <span>Thêm món mới</span>
              </button>
              <button
                type="button"
                onClick={fetchMenu}
                aria-label="Tải lại thực đơn"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-600"
              >
                <RefreshCw size={15} className={loadingMenu ? "animate-spin text-[#3D5A40]" : ""} />
              </button>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3 text-stone-400" />
              <input
                type="text"
                value={menuSearchQuery}
                onChange={(e) => setMenuSearchQuery(e.target.value)}
                placeholder="Tìm tên món ăn, thức uống..."
                className="w-full pl-9 pr-4 py-2 min-h-[40px] rounded-xl border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
              />
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter("all")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategoryFilter === "all"
                    ? "bg-[#3D5A40] text-white shadow-sm font-bold"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                Tất cả ({menuItems.length})
              </button>
              {categories.map((cat) => {
                const countInCat = menuItems.filter((m) => m.category_id === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedCategoryFilter === cat.id
                        ? "bg-[#3D5A40] text-white shadow-sm font-bold"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {cat.name} ({countInCat})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu Items Grid */}
          {loadingMenu && menuItems.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-2xl border border-stone-200">
              <RefreshCw size={28} className="animate-spin text-[#3D5A40] mx-auto mb-2" />
              <p className="text-stone-500 text-sm">Đang tải thực đơn...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {menuItems
                .filter((item) => {
                  const matchCat =
                    selectedCategoryFilter === "all" || item.category_id === selectedCategoryFilter;
                  const matchSearch =
                    !menuSearchQuery.trim() ||
                    item.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
                    (item.english_name &&
                      item.english_name.toLowerCase().includes(menuSearchQuery.toLowerCase()));
                  return matchCat && matchSearch;
                })
                .map((item) => {
                  const isAvailable = Boolean(item.is_available);
                  const cat = categories.find((c) => c.id === item.category_id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm hover:border-stone-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Visual & Basic Info */}
                        <div className="flex gap-3 items-start">
                          <div className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-stone-100 border border-stone-200">
                            <DrinkVisual
                              itemId={item.id}
                              imageUrl={item.image_url}
                              name={item.name}
                              category={cat?.name || "Thực đơn"}
                              className="w-full h-full object-cover"
                            />
                            {item.badge && (
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-[#C85A32] text-white shadow-sm">
                                {item.badge}
                              </span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm text-stone-900 truncate">{item.name}</h3>
                            {item.english_name && (
                              <p className="text-xs text-stone-400 truncate">{item.english_name}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-600">
                                {cat?.name || "Món"}
                              </span>
                              <span className="font-extrabold text-sm text-[#C85A32]">
                                {formatVND(item.base_price)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Description if any */}
                        {item.description && (
                          <p className="text-xs text-stone-500 mt-2 line-clamp-2 italic">
                            {item.description}
                          </p>
                        )}

                        {/* Customization Support Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-stone-100 text-[10px] text-stone-500 font-medium">
                          <span className={item.allows_size ? "text-stone-700" : "text-stone-300 line-through"}>
                            Size
                          </span>
                          <span>•</span>
                          <span className={item.allows_sugar ? "text-stone-700" : "text-stone-300 line-through"}>
                            Đường
                          </span>
                          <span>•</span>
                          <span className={item.allows_ice ? "text-stone-700" : "text-stone-300 line-through"}>
                            Đá
                          </span>
                          <span>•</span>
                          <span className={item.allows_toppings ? "text-stone-700" : "text-stone-300 line-through"}>
                            Topping
                          </span>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                        {/* Toggle Stock Switch */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleItemStock(item)}
                            role="switch"
                            aria-checked={isAvailable}
                            className={`w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                              isAvailable ? "bg-[#3D5A40]" : "bg-stone-300"
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
                              isAvailable ? "text-emerald-700" : "text-stone-400"
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
                            className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
                            title="Sửa chi tiết món"
                          >
                            <Edit2 size={13} />
                            <span>Sửa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            className="min-h-[36px] px-2 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all"
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
        </div>
      )}

      {/* TAB 3: QUẢN LÝ GIÁ */}
      {activeTab === "pricing" && (
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-stone-200">
            <div>
              <h2 className="text-base font-bold text-stone-900">Quản Lý Giá Bán Món Ăn & Thức Uống</h2>
              <p className="text-xs text-stone-500">
                Cập nhật giá bán tiêu chuẩn cho từng món. Giá mới sẽ đồng bộ ngay lập tức cho khách hàng đặt món và phân hệ thu ngân.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#3D5A40] hover:bg-[#2B3E2D] active:scale-95 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
            >
              <Plus size={15} />
              <span>Thêm món mới</span>
            </button>
          </div>

          <div className="divide-y divide-stone-100">
            {menuItems.map((item) => {
              const isEditing = editingPriceId === item.id;
              const cat = categories.find((c) => c.id === item.category_id);
              return (
                <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-stone-100 border border-stone-200">
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
                        <span className="font-bold text-sm text-stone-900">{item.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-600">
                          {cat?.name || "Món"}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400">{item.english_name || ""}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step={1000}
                          value={newPriceValue}
                          onChange={(e) => setNewPriceValue(Number(e.target.value))}
                          className="w-28 px-2.5 py-1.5 text-sm rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSavePrice(item.id)}
                          className="p-2 rounded-xl bg-[#3D5A40] text-white hover:bg-[#2B3E2D]"
                          title="Lưu giá"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPriceId(null)}
                          className="p-2 rounded-xl bg-stone-200 text-stone-700 hover:bg-stone-300"
                          title="Huỷ"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-base text-[#C85A32]">
                          {formatVND(item.base_price)}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPriceId(item.id);
                            setNewPriceValue(item.base_price);
                          }}
                          className="px-2.5 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 text-xs font-medium flex items-center gap-1"
                          title="Đổi giá nhanh"
                        >
                          <Edit2 size={13} />
                          <span>Đổi giá</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(item)}
                          className="px-2.5 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 text-xs font-medium flex items-center gap-1"
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
          </div>
        </div>
      )}

      {/* TAB 4: CÀI ĐẶT CỬA HÀNG */}
      {activeTab === "settings" && (
        <form onSubmit={handleSaveStoreSettings} className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4 max-w-xl">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200">
            <div>
              <h2 className="text-base font-bold text-stone-900">Thiết Lập Nhận Đơn Trực Tuyến</h2>
              <p className="text-xs text-stone-500">
                Cấu hình trạng thái mở nhận đơn, thông báo khách hàng và khung giờ phục vụ.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchStoreSettings}
              className="p-2 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-600"
              title="Tải lại cài đặt"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {settingsMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
              {settingsMessage}
            </div>
          )}

          {storeStatusError && (
            <AsyncStatePanel compact state="error" title="Không thể tải thiết lập nhận đơn" description={storeStatusError} actionLabel="Thử lại" onAction={() => void fetchStoreSettings()} />
          )}

          <div className="pt-2 space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-stone-50 border border-stone-200">
              <div>
                <strong className="block text-sm text-stone-800">Cổng nhận đơn online</strong>
                <span className="text-xs text-stone-500">
                  Tắt tính năng này khi quán quá tải hoặc chuẩn bị đóng cửa.
                </span>
              </div>
              <button
                type="button"
                disabled={storeStatusLoading || isOrderingOpen === null}
                onClick={() => isOrderingOpen !== null && setIsOrderingOpen(!isOrderingOpen)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isOrderingOpen === null ? "bg-stone-200 text-stone-500" : isOrderingOpen ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                }`}
              >
                {storeStatusLoading || isOrderingOpen === null ? "Đang xác nhận…" : isOrderingOpen ? "Đang mở" : "Tạm ngưng"}
              </button>
            </div>

            <div>
              <label htmlFor="store-hours" className="block text-xs font-semibold text-stone-700 mb-1">
                Giờ nhận đơn hiển thị cho khách
              </label>
              <input
                id="store-hours"
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="08:00 - 22:30"
                className="w-full text-sm px-3 py-2 rounded-xl border border-stone-300 focus:ring-2 focus:ring-[#3D5A40] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="store-announcement" className="block text-xs font-semibold text-stone-700 mb-1">
                Thông báo quán (nếu có)
              </label>
              <textarea
                id="store-announcement"
                rows={3}
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Ví dụ: Chào mừng bạn đến với La Boong! Thử ngay dòng Săn Mây bồng bềnh."
                className="w-full text-sm p-3 rounded-xl border border-stone-300 focus:ring-2 focus:ring-[#3D5A40] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="py-2.5 px-6 rounded-xl bg-[#3D5A40] hover:bg-[#2B3E2D] text-white font-bold text-sm transition-all disabled:opacity-50"
            >
              {savingSettings ? "Đang lưu..." : "Lưu thiết lập"}
            </button>
          </div>
        </form>
      )}

      {/* Order Detail Modal / Mobile Bottom Sheet */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-stone-200 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto custom-scroll animate-in slide-in-from-bottom sm:zoom-in-95 flex flex-col justify-between">
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mb-3 sm:hidden" />

            <div>
              <div className="flex items-center justify-between pb-4 border-b border-stone-100">
                <div>
                  <h3 className="text-xl font-extrabold text-stone-900">{selectedOrder.orderCode}</h3>
                  <span className="text-xs text-stone-400">
                    {new Date(selectedOrder.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-500"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Customer Details */}
              <div className="my-4 p-4 rounded-2xl bg-[#FAF7F2] border border-[#E8DFD5] space-y-1 text-xs sm:text-sm">
                <div>
                  <span className="text-stone-400">Khách hàng:</span>{" "}
                  <strong className="text-stone-800">{selectedOrder.customerName}</strong>
                </div>
                <div>
                  <span className="text-stone-400">Số điện thoại:</span>{" "}
                  <a href={`tel:${selectedOrder.customerPhone}`} className="text-[#3D5A40] font-bold hover:underline">
                    {selectedOrder.customerPhone}
                  </a>
                </div>
                {selectedOrder.customerNote && (
                  <div>
                    <span className="text-stone-400">Ghi chú:</span>{" "}
                    <span className="text-stone-700 italic">&ldquo;{selectedOrder.customerNote}&rdquo;</span>
                  </div>
                )}
                {selectedOrder.status === "cancelled" && (
                  <div className="pt-2 border-t border-red-200/60 text-red-700">
                    <span className="font-bold">Lý do huỷ:</span> {selectedOrder.cancelReason || "Huỷ bởi cửa hàng"}
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="divide-y divide-stone-100 mb-4">
                {selectedOrder.items.map((it) => (
                  <div key={it.id} className="py-2.5 flex items-start justify-between text-xs sm:text-sm">
                    <div>
                      <div className="font-bold text-stone-900">
                        {it.quantity}x {it.name}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {it.size || "Size M"} • {it.sugar || "100% đường"} • {it.ice || "100% đá"}
                      </div>
                      {it.toppings && it.toppings.length > 0 && (
                        <div className="text-[11px] text-[#634832]">
                          Topping: {it.toppings.map((t) => t.name).join(", ")}
                        </div>
                      )}
                      {it.note && (
                        <div className="text-[11px] text-stone-400 italic">&ldquo;{it.note}&rdquo;</div>
                      )}
                    </div>
                    <span className="font-bold text-stone-900">{formatVND(it.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-base font-extrabold mb-5">
                <span>Tổng tiền:</span>
                <span className="text-[#C85A32]">{formatVND(selectedOrder.totalAmount)}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 active:scale-95"
              >
                Đóng
              </button>

              {selectedOrder.status !== "completed" && selectedOrder.status !== "cancelled" && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelModalOrder(selectedOrder);
                    setSelectedOrder(null);
                  }}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold active:scale-95"
                >
                  Huỷ đơn
                </button>
              )}

              {selectedOrder.status === "pending" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => {
                    handleTransitionStatus(selectedOrder, "accepted");
                    setSelectedOrder(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 active:scale-95 text-white text-xs font-bold hover:bg-blue-700 shadow-sm"
                >
                  Xác nhận đơn
                </button>
              )}

              {selectedOrder.status === "accepted" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => {
                    handleTransitionStatus(selectedOrder, "preparing");
                    setSelectedOrder(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-purple-600 active:scale-95 text-white text-xs font-bold hover:bg-purple-700 shadow-sm"
                >
                  Bắt đầu chuẩn bị
                </button>
              )}

              {selectedOrder.status === "preparing" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => {
                    handleTransitionStatus(selectedOrder, "ready");
                    setSelectedOrder(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 active:scale-95 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm"
                >
                  Đánh dấu sẵn sàng
                </button>
              )}

              {selectedOrder.status === "ready" && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => {
                    handleTransitionStatus(selectedOrder, "completed");
                    setSelectedOrder(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 active:scale-95 text-white text-xs font-bold hover:bg-black shadow-sm"
                >
                  Hoàn tất đơn
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCancelModalOrder(null)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-stone-200 animate-in slide-in-from-bottom sm:zoom-in-95">
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mb-3 sm:hidden" />

            <h3 className="font-bold text-base text-stone-900 mb-1">
              Xác nhận huỷ đơn {cancelModalOrder.orderCode}?
            </h3>
            <p className="text-xs text-stone-500 mb-3">
              Hành động này sẽ thông báo cho khách hàng rằng đơn hàng đã bị huỷ.
            </p>

            <label htmlFor="cancel-reason" className="block text-xs font-semibold text-stone-700 mb-1">
              Lý do huỷ đơn:
            </label>
            <input
              id="cancel-reason"
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ví dụ: Quán hết nguyên liệu, khách xin huỷ..."
              className="w-full text-base sm:text-xs p-3 min-h-[44px] rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 active:scale-95"
              >
                Không huỷ
              </button>
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={handleConfirmCancel}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 active:scale-95"
              >
                Xác nhận huỷ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Item Modal */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsItemModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto custom-scroll animate-in slide-in-from-bottom sm:zoom-in-95 flex flex-col justify-between">
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mb-3 sm:hidden" />

            <div>
              <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                <div>
                  <h3 className="text-lg font-extrabold text-stone-900">
                    {itemModalMode === "create" ? "Thêm Món Mới Vào Menu" : "Chỉnh Sửa Món Ăn / Thức Uống"}
                  </h3>
                  <p className="text-xs text-stone-500">
                    Dữ liệu món sẽ cập nhật trực tiếp trên trang đặt món và phân hệ quản lý.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-500"
                >
                  <X size={20} />
                </button>
              </div>

              {itemModalError && (
                <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {itemModalError}
                </div>
              )}

              <form id="menu-item-form" onSubmit={handleSaveItem} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Tên món */}
                  <div>
                    <label htmlFor="item-name" className="block text-xs font-semibold text-stone-700 mb-1">
                      Tên món <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="item-name"
                      type="text"
                      required
                      value={itemFormData.name}
                      onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
                      placeholder="Ví dụ: Trà Sữa Mắc Ca Săn Mây"
                      className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                    />
                  </div>

                  {/* Tên tiếng Anh */}
                  <div>
                    <label htmlFor="item-english-name" className="block text-xs font-semibold text-stone-700 mb-1">
                      Tên tiếng Anh (tuỳ chọn)
                    </label>
                    <input
                      id="item-english-name"
                      type="text"
                      value={itemFormData.englishName}
                      onChange={(e) => setItemFormData({ ...itemFormData, englishName: e.target.value })}
                      placeholder="Ví dụ: Macadamia Cloud Tea"
                      className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                    />
                  </div>

                  {/* Danh mục */}
                  <div>
                    <label htmlFor="item-category" className="block text-xs font-semibold text-stone-700 mb-1">
                      Danh mục <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="item-category"
                      value={itemFormData.categoryId}
                      onChange={(e) => setItemFormData({ ...itemFormData, categoryId: e.target.value })}
                      className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Giá cơ bản */}
                  <div>
                    <label htmlFor="item-price" className="block text-xs font-semibold text-stone-700 mb-1">
                      Giá bán tiêu chuẩn (VND) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="item-price"
                      type="number"
                      min={0}
                      step={1000}
                      required
                      value={itemFormData.basePrice}
                      onChange={(e) => setItemFormData({ ...itemFormData, basePrice: Number(e.target.value) })}
                      className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                    />
                  </div>

                  {/* Nhãn nổi bật (Badge) */}
                  <div>
                    <label htmlFor="item-badge" className="block text-xs font-semibold text-stone-700 mb-1">
                      Huy hiệu / Nhãn (Badge)
                    </label>
                    <input
                      id="item-badge"
                      type="text"
                      value={itemFormData.badge}
                      onChange={(e) => setItemFormData({ ...itemFormData, badge: e.target.value })}
                      placeholder="Ví dụ: Signature, Best-seller, Mới..."
                      className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                    />
                  </div>

                  {/* Thứ tự sắp xếp */}
                  <div>
                    <label htmlFor="item-sort-order" className="block text-xs font-semibold text-stone-700 mb-1">
                      Thứ tự sắp xếp
                    </label>
                    <input
                      id="item-sort-order"
                      type="number"
                      value={itemFormData.sortOrder}
                      onChange={(e) => setItemFormData({ ...itemFormData, sortOrder: Number(e.target.value) })}
                      className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                    />
                  </div>
                </div>

                {/* URL Hình ảnh */}
                <div>
                  <label htmlFor="item-image" className="block text-xs font-semibold text-stone-700 mb-1">
                    Đường dẫn ảnh đồ uống
                  </label>
                  <input
                    id="item-image"
                    type="text"
                    value={itemFormData.imageUrl}
                    onChange={(e) => setItemFormData({ ...itemFormData, imageUrl: e.target.value })}
                    placeholder="/laboong/drinks/san-may.jpg"
                    className="w-full text-base sm:text-xs min-h-[44px] px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                  />
                </div>

                {/* Mô tả món */}
                <div>
                  <label htmlFor="item-desc" className="block text-xs font-semibold text-stone-700 mb-1">
                    Mô tả món
                  </label>
                  <textarea
                    id="item-desc"
                    rows={2}
                    value={itemFormData.description}
                    onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                    placeholder="Mô tả hương vị, nguyên liệu nổi bật của món..."
                    className="w-full text-base sm:text-xs p-3 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40]"
                  />
                </div>

                {/* Tùy chọn món (Checkboxes) */}
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5">
                  <span className="block text-xs font-bold text-stone-800">Tuỳ chọn cho khách hàng:</span>
                  <div className="grid grid-cols-2 gap-2 text-xs text-stone-700">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={itemFormData.allowsSize}
                        onChange={(e) => setItemFormData({ ...itemFormData, allowsSize: e.target.checked })}
                        className="w-4 h-4 rounded text-[#3D5A40] focus:ring-[#3D5A40]"
                      />
                      <span>Cho chọn Size (M/L)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={itemFormData.allowsSugar}
                        onChange={(e) => setItemFormData({ ...itemFormData, allowsSugar: e.target.checked })}
                        className="w-4 h-4 rounded text-[#3D5A40] focus:ring-[#3D5A40]"
                      />
                      <span>Cho chọn Đường</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={itemFormData.allowsIce}
                        onChange={(e) => setItemFormData({ ...itemFormData, allowsIce: e.target.checked })}
                        className="w-4 h-4 rounded text-[#3D5A40] focus:ring-[#3D5A40]"
                      />
                      <span>Cho chọn Đá</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={itemFormData.allowsToppings}
                        onChange={(e) => setItemFormData({ ...itemFormData, allowsToppings: e.target.checked })}
                        className="w-4 h-4 rounded text-[#3D5A40] focus:ring-[#3D5A40]"
                      />
                      <span>Cho thêm Topping</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none col-span-2 pt-2 border-t border-stone-200">
                      <input
                        type="checkbox"
                        checked={itemFormData.isAvailable}
                        onChange={(e) => setItemFormData({ ...itemFormData, isAvailable: e.target.checked })}
                        className="w-4 h-4 rounded text-[#3D5A40] focus:ring-[#3D5A40]"
                      />
                      <span className="font-bold text-[#3D5A40]">Đang phục vụ (Còn hàng)</span>
                    </label>
                  </div>
                </div>
              </form>
            </div>

            {/* Form Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 mt-4 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 active:scale-95"
              >
                Huỷ
              </button>
              <button
                type="submit"
                form="menu-item-form"
                disabled={savingItem}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#3D5A40] hover:bg-[#2B3E2D] active:scale-95 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
              >
                {savingItem ? "Đang lưu..." : itemModalMode === "create" ? "Tạo món mới" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setDeletingItem(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 shadow-2xl border border-stone-200 animate-in slide-in-from-bottom sm:zoom-in-95">
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mb-3 sm:hidden" />

            <div className="flex items-center gap-3 text-red-600 mb-2">
              <div className="p-2 rounded-xl bg-red-50">
                <Trash2 size={24} />
              </div>
              <h3 className="font-bold text-base text-stone-900">Xác nhận xoá món</h3>
            </div>

            <p className="text-xs text-stone-600 mb-2 leading-relaxed">
              Bạn có chắc chắn muốn xoá món <strong className="text-stone-900">{deletingItem.name}</strong> khỏi menu quán?
            </p>
            <p className="text-[11px] text-stone-400 bg-stone-50 p-2.5 rounded-xl mb-4 border border-stone-200">
              Lưu ý: Món này sẽ không còn hiển thị cho khách đặt. Lịch sử các đơn hàng cũ đã đặt món này vẫn được bảo lưu an toàn.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 active:scale-95"
              >
                Không xoá
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 active:scale-95 transition-all"
              >
                {isDeleting ? "Đang xoá..." : "Xoá món"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
