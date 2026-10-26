"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ShoppingBag, Search, Clock, Sparkles, RefreshCw, AlertCircle, X, ChevronDown } from "lucide-react";
import { LaBoongLogo } from "./laboong-logo";
import { MenuCard, type MenuItemData, formatVND } from "./menu-card";
import { ItemDetailModal, type MenuOptionItem, type CartItemOption } from "./item-detail-modal";
import { CartDrawer } from "./cart-drawer";
import { OrderTrackingView, OrderLookupModal } from "./order-tracking-view";
import "./order-tokens.css";
import { parseReceipt, readPendingOrder, rememberReceipt, submitOrderAttempt, clearPendingOrder, type PendingOrder } from "./receipt-storage";
import {
  MENU_FILTER_PRESETS,
  matchesMenuFilter,
  getPresetCounts,
  type MenuFilterPresetId,
} from "@/lib/menu-filter";

interface StoreData {
  id: string;
  name: string;
  address: string;
  isOrderingOpen: boolean;
  announcement?: string;
  openingHoursNotice?: string;
}

interface CategoryData {
  id: string;
  name: string;
  english_name?: string | null;
  sort_order: number;
}

export function CustomerOrderPage() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [items, setItems] = useState<MenuItemData[]>([]);
  const [options, setOptions] = useState<MenuOptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Filter Preset ("all" | "coffee" | "tea" | "milk_tea" | "topping")
  const [activePreset, setActivePreset] = useState<MenuFilterPresetId>("all");
  // Active Category filter ("all" or category_id)
  const [activeCategory, setActiveCategory] = useState<string>("all");
  // Real-time Search query
  const [searchQuery, setSearchQuery] = useState("");

  // Selected item for customization modal
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);
  const [cartItemToEdit, setCartItemToEdit] = useState<CartItemOption | null>(null);
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartItemOption[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [trackingReceipt, setTrackingReceipt] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("receipt");
      setTrackingReceipt(token ? parseReceipt(token) : null);
      setPendingOrder(readPendingOrder());
    };
    queueMicrotask(update);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  // Lookup modal
  const [isLookupOpen, setIsLookupOpen] = useState(false);

  // Load menu data
  const loadMenu = () => {
    setLoading(true);
    fetch("/api/order/menu", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Lỗi"))))
      .then((payload) => {
        const data = payload as {
          store: StoreData;
          categories: CategoryData[];
          items: MenuItemData[];
          options: MenuOptionItem[];
        };
        setStore(data.store);
        setCategories(data.categories || []);
        setItems(data.items || []);
        setOptions(data.options || []);
        setError(null);
      })
      .catch(() => {
        setError("Không thể nạp danh sách món lúc này. Vui lòng tải lại trang.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    fetch("/api/order/menu", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Lỗi"))))
      .then((payload) => {
        if (!isMounted) return;
        const data = payload as {
          store: StoreData;
          categories: CategoryData[];
          items: MenuItemData[];
          options: MenuOptionItem[];
        };
        setStore(data.store);
        setCategories(data.categories || []);
        setItems(data.items || []);
        setOptions(data.options || []);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setError("Không thể nạp danh sách món lúc này. Vui lòng tải lại trang.");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);


  const categoriesMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const toppingOptions = useMemo(
    () => options.filter((o) => o.group_type === "topping" && Boolean(o.is_available)),
    [options],
  );
  const presetCounts = useMemo(
    () => getPresetCounts(items, categories, toppingOptions.length),
    [items, categories, toppingOptions.length],
  );

  // Available categories with at least 1 real item in menu
  const availableCategories = useMemo(
    () => categories.filter((cat) => items.some((item) => item.category_id === cat.id)),
    [categories, items],
  );

  // Available presets based on real product availability
  const availablePresets = useMemo(() => {
    return MENU_FILTER_PRESETS.filter((preset) => {
      if (preset.id === "all") return true;
      if (preset.id === "topping") {
        return (presetCounts.topping ?? 0) > 0 || toppingOptions.length > 0;
      }
      return (presetCounts[preset.id] ?? 0) > 0;
    });
  }, [presetCounts, toppingOptions.length]);

  // Keep active category and preset valid when availability changes
  useEffect(() => {
    if (activeCategory !== "all" && !availableCategories.some((c) => c.id === activeCategory)) {
      const timer = window.setTimeout(() => setActiveCategory("all"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeCategory, availableCategories]);

  useEffect(() => {
    if (activePreset !== "all" && !availablePresets.some((p) => p.id === activePreset)) {
      const timer = window.setTimeout(() => setActivePreset("all"), 0);
      return () => window.clearTimeout(timer);
    }
  }, [activePreset, availablePresets]);

  // Filter items based on activePreset, activeCategory and searchQuery
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const catName = categoriesMap.get(item.category_id) || "";
      const targetFilter = activeCategory !== "all" ? activeCategory : activePreset;
      return matchesMenuFilter(item, catName, targetFilter, searchQuery);
    });
  }, [items, categoriesMap, activePreset, activeCategory, searchQuery]);

  // Cart helper functions
  const handleAddToCart = (newItem: CartItemOption) => {
    setCart((prev) => {
      // Find matching item with same customizations
      const existingIdx = prev.findIndex(
        (it) =>
          it.itemId === newItem.itemId &&
          it.size === newItem.size &&
          it.sugar === newItem.sugar &&
          it.ice === newItem.ice &&
          JSON.stringify(it.toppings) === JSON.stringify(newItem.toppings) &&
          it.note === newItem.note,
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        const exist = updated[existingIdx];
        const newQty = Math.min(20, exist.quantity + newItem.quantity);
        updated[existingIdx] = {
          ...exist,
          quantity: newQty,
          subtotal: exist.unitPrice * newQty,
        };
        return updated;
      }
      return prev.length >= 30 ? prev : [...prev, newItem];
    });
  };

  const handleUpdateQuantity = (idx: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(idx);
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      const target = updated[idx];
      updated[idx] = {
        ...target,
        quantity: Math.min(20, newQty),
        subtotal: target.unitPrice * Math.min(20, newQty),
      };
      return updated;
    });
  };

  const handleRemoveItem = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Compute total quantities of each item in cart for MenuCard badges
  const cartItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of cart) {
      counts[it.itemId] = (counts[it.itemId] || 0) + it.quantity;
    }
    return counts;
  }, [cart]);

  const handleEditCartItem = (index: number) => {
    const itemInCart = cart[index];
    if (!itemInCart) return;

    // Locate the MenuItemData in items list or create matching record
    const foundMenuItem = items.find((m) => m.id === itemInCart.itemId);
    const menuItem: MenuItemData = foundMenuItem || {
      id: itemInCart.itemId,
      category_id: "",
      name: itemInCart.name,
      english_name: itemInCart.englishName,
      base_price: itemInCart.basePrice,
      image_url: "",
      is_available: 1,
      allows_size: Boolean(itemInCart.size),
      allows_sugar: Boolean(itemInCart.sugar),
      allows_ice: Boolean(itemInCart.ice),
      allows_toppings: itemInCart.toppings.length > 0 || true,
    };

    setEditingCartIndex(index);
    setCartItemToEdit(itemInCart);
    setSelectedItem(menuItem);
    setIsCartOpen(false);
  };

  const handleUpdateCartItem = (updated: CartItemOption) => {
    if (editingCartIndex !== null && editingCartIndex >= 0 && editingCartIndex < cart.length) {
      setCart((prev) => {
        const next = [...prev];
        next[editingCartIndex] = updated;
        return next;
      });
    }
    setEditingCartIndex(null);
    setCartItemToEdit(null);
    setSelectedItem(null);
    setIsCartOpen(true);
  };

  const handleCloseDetailModal = () => {
    setSelectedItem(null);
    setCartItemToEdit(null);
    setEditingCartIndex(null);
  };

  const openReceipt = (receipt: string) => {
    window.history.replaceState(null, "", "/order#receipt=" + receipt);
    setTrackingReceipt(receipt);
  };
  const handleOrderSuccess = (order: { receiptToken: string }) => {
    setPendingOrder(null);
    openReceipt(order.receiptToken);
  };
  const handleBackToMenu = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setTrackingReceipt(null);
    setPendingOrder(readPendingOrder());
    loadMenu();
  };
  async function recoverOrder() {
    if (!pendingOrder || recovering) return;
    setRecovering(true); setRecoveryError(null);
    try {
      const response = await submitOrderAttempt(pendingOrder);
      const result = await response.json() as { success?: boolean; error?: string; code?: string };
      if (!response.ok || !result.success) {
        if (response.status < 500 && response.status !== 429 && result.code !== "idempotency_conflict") {
          clearPendingOrder(); setPendingOrder(null);
        }
        throw new Error(result.error || "Chưa xác nhận được đơn. Vui lòng thử lại.");
      }
      rememberReceipt(pendingOrder.receipt);
      setCart([]);
      handleOrderSuccess({ receiptToken: pendingOrder.receipt });
    } catch (failure) { setRecoveryError(failure instanceof Error ? failure.message : "Không thể kết nối."); }
    finally { setRecovering(false); }
  }

  const cartTotalAmount = cart.reduce((sum, it) => sum + it.subtotal, 0);
  const cartTotalCount = cart.reduce((sum, it) => sum + it.quantity, 0);

  // If tracking view is active, render it
  if (trackingReceipt) {
    return (
      <div className="laboong-page">
        {/* Header */}
        <header className="laboong-header px-3.5 sm:px-8 py-2.5 sm:py-3.5 flex items-center justify-between">
          <div className="sm:hidden">
            <LaBoongLogo size="small" />
          </div>
          <div className="hidden sm:block">
            <LaBoongLogo size="medium" />
          </div>
          <button
            type="button"
            onClick={handleBackToMenu}
            className="min-h-[44px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors flex items-center whitespace-nowrap shrink-0"
          >
            ← Thực đơn
          </button>
        </header>

        <OrderTrackingView key={trackingReceipt} receiptToken={trackingReceipt} onBackToMenu={handleBackToMenu} />
      </div>
    );
  }

  return (
    <div className="laboong-page">
      {/* 1. Header (Mobile First, Sticky) */}
      <header className="laboong-header px-3.5 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="sm:hidden">
            <LaBoongLogo size="small" />
          </div>
          <div className="hidden sm:block">
            <LaBoongLogo size="medium" />
          </div>
          <div className="hidden md:flex flex-col border-l border-stone-300 pl-3">
            <span className="text-xs font-semibold text-stone-800">
              {store?.name || "La Boong"}
            </span>
            <span className="text-[11px] text-stone-500">
              {store?.address || "Chi nhánh chính"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Store status badge */}
          {store && (
            <div
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                store.isOrderingOpen
                  ? "bg-emerald-100/80 text-emerald-800 border border-emerald-200"
                  : "bg-red-100 text-red-800 border border-red-200"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  store.isOrderingOpen ? "bg-emerald-600 animate-pulse" : "bg-red-600"
                }`}
              />
              <span>{store.isOrderingOpen ? "Đang mở cửa" : "Tạm ngưng nhận đơn"}</span>
            </div>
          )}

          {/* Search / Lookup past order button */}
          <button
            type="button"
            onClick={() => setIsLookupOpen(true)}
            title="Tra cứu đơn hàng của bạn"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full bg-white border border-[#E6DFD5] text-xs font-semibold text-stone-700 hover:border-stone-400 hover:bg-stone-50 transition-all shadow-sm active:scale-95"
          >
            <Search size={15} className="text-[#3D5A40]" />
            <span className="hidden sm:inline">Tra cứu đơn</span>
          </button>

          {/* View Cart Button */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label="Xem giỏ hàng"
            className="relative min-h-[44px] min-w-[44px] flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-full bg-[#3D5A40] hover:bg-[#2B3E2D] active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md transition-all"
          >
            <ShoppingBag size={16} />
            <span className="hidden xs:inline">Giỏ hàng</span>
            {cartTotalCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-[#C85A32] text-white text-[11px] font-extrabold flex items-center justify-center shadow-sm">
                {cartTotalCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-[calc(88px+env(safe-area-inset-bottom,0px))] lg:pb-12">
        {pendingOrder && <section className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900"><p>Đơn đang gửi trước đó chưa được xác nhận trên thiết bị. Kiểm tra lại sẽ giữ nguyên nội dung, tránh tạo đơn trùng.</p><button type="button" onClick={recoverOrder} disabled={recovering} className="mt-2 min-h-[44px] px-4 rounded-xl bg-[#3D5A40] text-white font-bold disabled:opacity-50">{recovering ? "Đang kiểm tra…" : "Kiểm tra / gửi lại đơn đang chờ"}</button></section>}
        {recoveryError && <p role="alert" className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{recoveryError}</p>}
        {store?.announcement && <p className="mb-4 p-3 rounded-xl bg-[#EBF1EA] text-sm text-[#3D5A40]">{store.announcement}</p>}
        {/* 2. Hero Lifestyle Banner */}
        <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#2B3E2D] text-white mb-3 sm:mb-6 shadow-md">
          <div className="relative z-10 p-4 sm:p-8 lg:p-10 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-[10px] sm:text-[11px] font-semibold tracking-wider text-[#EBF1EA] uppercase mb-1.5 sm:mb-2.5">
              <Sparkles size={11} className="text-amber-300" />
              <span>Trà Ô Long Làng La Boong</span>
            </div>
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight leading-snug sm:leading-tight mb-1.5 sm:mb-2">
              Chọn món yêu thích của bạn
            </h1>
            <p className="text-xs sm:text-sm text-stone-200/90 leading-relaxed max-w-md line-clamp-2 sm:line-clamp-none">
              Thưởng thức tinh hoa lá trà ô long tuyển chọn, béo ngậy vị sữa tươi và lớp kem mây tuyết bồng bềnh đặc trưng.
            </p>

            {store?.openingHoursNotice && (
              <div className="mt-2.5 sm:mt-3.5 flex items-center gap-1.5 text-xs text-stone-300">
                <Clock size={13} className="text-amber-300" />
                <span>Giờ phục vụ: {store.openingHoursNotice}</span>
              </div>
            )}
          </div>

          {/* Background image overlay using actual lifestyle photo */}
          <div
            className="absolute inset-0 z-0 bg-cover bg-center opacity-45 mix-blend-luminosity transform scale-105"
            style={{
              backgroundImage: "url('/laboong/hero-lifestyle.jpg')",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1B2A1C] via-[#2B3E2D]/80 to-transparent" />
        </section>

        {/* Store Announcement if closed or notice */}
        {store && !store.isOrderingOpen && (
          <div className="mb-4 sm:mb-6 p-3.5 sm:p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900 text-xs sm:text-sm shadow-xs">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Quán đang tạm dừng nhận đơn trực tuyến</strong>
              <span>Quý khách vui lòng quay lại sau ít phút hoặc ghé trực tiếp quầy để được phục vụ chu đáo nhất!</span>
            </div>
          </div>
        )}

        {/* 3. Search & Category Filters (Sticky Navigation) */}
        <div className="sticky top-[53px] sm:top-[61px] z-30 py-2 sm:py-2.5 bg-[#FAF7F2]/95 backdrop-blur-md mb-3 sm:mb-5 border-b border-[#EAE2D7]/60 -mx-3.5 px-3.5 sm:mx-0 sm:px-0 space-y-2">
          {/* Row 1: Search Input & Contextual Category Dropdown */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm món (cà phê, trà...)"
                className="w-full pl-8.5 pr-11 py-2 min-h-[44px] rounded-xl border border-[#EAE2D7] bg-white text-xs sm:text-sm text-[#231F1D] placeholder:text-stone-400 focus:outline-none focus:border-[#3D5A40] focus:ring-1 focus:ring-[#3D5A40] transition-colors"
                aria-label="Tìm kiếm món"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-0 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-400 hover:text-stone-700 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5A40]"
                  aria-label="Xoá tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Subtle Contextual Category Dropdown (only when 2+ available categories) */}
            {availableCategories.length > 1 && (
              <div className="relative shrink-0">
                <select
                  value={activeCategory}
                  onChange={(e) => {
                    const val = e.target.value;
                    setActiveCategory(val);
                    if (val !== "all") {
                      setActivePreset("all");
                    }
                  }}
                  aria-label="Lọc theo nhóm món"
                  className={`appearance-none min-h-[44px] max-w-[130px] sm:max-w-[180px] truncate pl-3 pr-7 py-2 text-xs font-medium rounded-xl border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5A40] ${
                    activeCategory !== "all"
                      ? "bg-[#F4F7F3] border-[#3D5A40] text-[#2B3E2D] font-semibold"
                      : "bg-white border-[#EAE2D7] text-stone-700 hover:border-stone-300"
                  }`}
                >
                  <option value="all">Tất cả nhóm</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
                    activeCategory !== "all" ? "text-[#3D5A40]" : "text-stone-400"
                  }`}
                  aria-hidden="true"
                />
              </div>
            )}
          </div>

          {/* Row 2: Compact, Single-Row Horizontally Scrollable Category Tabs */}
          <div
            role="tablist"
            aria-label="Phân loại thực đơn"
            className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-0.5 scrollbar-none overscroll-x-contain -mx-3.5 px-3.5 sm:-mx-0 sm:px-0"
          >
            {availablePresets.map((preset) => {
              const isActive = activePreset === preset.id && activeCategory === "all";
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActivePreset(preset.id);
                    setActiveCategory("all");
                  }}
                  className={`shrink-0 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all select-none active:scale-97 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5A40] focus-visible:ring-offset-1 ${
                    isActive
                      ? "bg-[#2B3E2D] text-white shadow-xs"
                      : "bg-white text-stone-700 hover:text-stone-900 hover:bg-[#F4EFEA] border border-[#EAE2D7]"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Menu Items Grid & Topping Showcase */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <RefreshCw size={32} className="animate-spin text-[#3D5A40] mb-3" />
            <p className="text-sm font-semibold text-stone-600">Đang chuẩn bị thực đơn La Boong...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-red-600 font-medium mb-3">{error}</p>
            <button
              type="button"
              onClick={loadMenu}
              className="px-4 py-2 rounded-full bg-[#3D5A40] text-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5A40]"
            >
              Thử lại
            </button>
          </div>
        ) : filteredItems.length === 0 && (activePreset !== "topping" || toppingOptions.length === 0) ? (
          <div className="py-12 sm:py-16 text-center bg-white rounded-2xl sm:rounded-3xl border border-[#EAE2D7] p-6 sm:p-8 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#EBF1EA] flex items-center justify-center text-[#3D5A40]">
              <Search size={22} aria-hidden="true" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-stone-800">
              Không tìm thấy món phù hợp
            </h2>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {searchQuery
                ? `Không có kết quả nào khớp với từ khóa "${searchQuery}".`
                : "Hiện chưa có món nào trong phân loại này."}
            </p>
            <button
              type="button"
              onClick={() => {
                setActivePreset("all");
                setActiveCategory("all");
                setSearchQuery("");
              }}
              className="mt-1 px-4 py-2 min-h-[38px] rounded-xl bg-[#2B3E2D] hover:bg-[#3D5A40] text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5A40] focus-visible:ring-offset-1"
            >
              Xem tất cả thực đơn
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Topping Showcase Card when Topping is active */}
            {activePreset === "topping" && toppingOptions.length > 0 && (
              <div className="bg-[#F4F7F3] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#EAE2D7]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 mb-3.5">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#2B3E2D]/10 text-[#2B3E2D] text-[11px] font-semibold uppercase tracking-wider mb-1">
                      <span>Topping tươi thủ công</span>
                    </div>
                    <h2 className="text-sm sm:text-base font-bold text-[#231F1D]">
                      Topping tươi chế biến mỗi ngày tại quầy bar
                    </h2>
                    <p className="text-xs text-stone-600 mt-0.5">
                      Nấu mới liên tục để giữ trọn độ dẻo giòn và hương hoa tự nhiên. Có thể chọn thêm vào bất kỳ món trà &amp; trà sữa nào!
                    </p>
                  </div>
                  <span className="text-xs text-[#2B3E2D] font-medium bg-white px-2.5 py-1 rounded-lg border border-[#EAE2D7] shrink-0">
                    {toppingOptions.length} loại topping
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {toppingOptions.map((opt) => (
                    <div
                      key={opt.id}
                      className="bg-white rounded-xl p-3 border border-[#EAE2D7] flex items-center justify-between transition-colors hover:border-[#3D5A40]/40"
                    >
                      <div>
                        <div className="text-xs font-semibold text-stone-800">{opt.name}</div>
                        <div className="text-[11px] text-[#3D5A40] font-bold mt-0.5">
                          +{formatVND(opt.price_modifier)}
                        </div>
                      </div>
                      <span className="text-[10px] text-stone-500 bg-[#F4F7F3] px-2 py-0.5 rounded-md font-medium border border-[#EAE2D7]">
                        Đang phục vụ
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredItems.length > 0 && (
              <div className="laboong-grid">
                {filteredItems.map((item) => {
                  const catObj = categories.find((c) => c.id === item.category_id);
                  return (
                    <MenuCard
                      key={item.id}
                      item={item}
                      categoryName={catObj?.name || ""}
                      cartQuantity={cartItemCounts[item.id] || 0}
                      onSelect={(selected) => {
                        setCartItemToEdit(null);
                        setEditingCartIndex(null);
                        setSelectedItem(selected);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Bottom Bar for Mobile Cart with Safe Area Inset */}
      {cartTotalCount > 0 && !isCartOpen && (
        <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] left-3 right-3 sm:left-4 sm:right-4 z-40 lg:hidden">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="w-full min-h-[50px] py-3 px-4 sm:px-5 rounded-2xl bg-[#C85A32] text-white font-bold shadow-xl shadow-orange-950/30 flex items-center justify-between active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-white/20 text-xs flex items-center justify-center font-extrabold">
                {cartTotalCount}
              </span>
              <span className="text-sm font-bold">Xem giỏ hàng</span>
            </div>
            <span className="text-sm sm:text-base font-extrabold">{formatVND(cartTotalAmount)}</span>
          </button>
        </div>
      )}

      {/* Item Customization Modal */}
      <ItemDetailModal
        key={editingCartIndex !== null ? `edit-${editingCartIndex}-${selectedItem?.id}` : (selectedItem?.id || "modal")}
        item={selectedItem}
        categoryName={categories.find((c) => c.id === selectedItem?.category_id)?.name || ""}
        options={options}
        cartItemToEdit={cartItemToEdit}
        onClose={handleCloseDetailModal}
        onAddToCart={handleAddToCart}
        onUpdateCartItem={handleUpdateCartItem}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => { setIsCartOpen(false); setPendingOrder(readPendingOrder()); }}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        onOrderSuccess={handleOrderSuccess}
        onEditItem={handleEditCartItem}
      />

      {/* Lookup past order modal */}
      <OrderLookupModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
        onFound={openReceipt}
      />
    </div>
  );
}
