"use client";

import React, { useState, useEffect } from "react";
import { ShoppingBag, Search, Clock, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { LaBoongLogo } from "./laboong-logo";
import { MenuCard, type MenuItemData, formatVND } from "./menu-card";
import { ItemDetailModal, type MenuOptionItem, type CartItemOption } from "./item-detail-modal";
import { CartDrawer } from "./cart-drawer";
import { OrderTrackingView, OrderLookupModal } from "./order-tracking-view";
import "./order-tokens.css";
import { parseReceipt, readPendingOrder, rememberReceipt, submitOrderAttempt, clearPendingOrder, type PendingOrder } from "./receipt-storage";

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

  // Active Category filter ("all" or category_id)
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Selected item for customization modal
  const [selectedItem, setSelectedItem] = useState<MenuItemData | null>(null);

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


  // Filter items
  const filteredItems = activeCategory === "all"
    ? items
    : items.filter((it) => it.category_id === activeCategory);

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
            className="min-h-[40px] px-3.5 sm:px-4 py-2 rounded-full border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors flex items-center"
          >
            Quay lại thực đơn
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
            className="min-h-[40px] min-w-[40px] flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full bg-white border border-[#E6DFD5] text-xs font-semibold text-stone-700 hover:border-stone-400 hover:bg-stone-50 transition-all shadow-sm active:scale-95"
          >
            <Search size={15} className="text-[#3D5A40]" />
            <span className="hidden sm:inline">Tra cứu đơn</span>
          </button>

          {/* View Cart Button */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label="Xem giỏ hàng"
            className="relative min-h-[40px] flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-full bg-[#3D5A40] hover:bg-[#2B3E2D] active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md transition-all"
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
      <main className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 pt-3 sm:pt-6">
        {pendingOrder && <section className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900"><p>Đơn đang gửi trước đó chưa được xác nhận trên thiết bị. Kiểm tra lại sẽ giữ nguyên nội dung, tránh tạo đơn trùng.</p><button type="button" onClick={recoverOrder} disabled={recovering} className="mt-2 min-h-[44px] px-4 rounded-xl bg-[#3D5A40] text-white font-bold disabled:opacity-50">{recovering ? "Đang kiểm tra…" : "Kiểm tra / gửi lại đơn đang chờ"}</button></section>}
        {recoveryError && <p role="alert" className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm">{recoveryError}</p>}
        {store?.announcement && <p className="mb-4 p-3 rounded-xl bg-[#EBF1EA] text-sm text-[#3D5A40]">{store.announcement}</p>}
        {/* 2. Hero Lifestyle Banner */}
        <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#2B3E2D] text-white mb-4 sm:mb-8 shadow-xl">
          <div className="relative z-10 p-5 sm:p-10 lg:p-12 max-w-xl">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[10px] sm:text-[11px] font-bold tracking-widest text-[#EBF1EA] uppercase mb-2 sm:mb-3">
              <Sparkles size={12} className="text-amber-300" />
              <span>Thương hiệu trà ô long làng La Boong</span>
            </div>
            <h1 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-snug sm:leading-tight mb-2 sm:mb-3">
              Chọn món yêu thích của bạn
            </h1>
            <p className="text-xs sm:text-sm text-stone-200/90 leading-relaxed max-w-md">
              Thưởng thức tinh hoa lá trà ô long tuyển chọn, béo ngậy vị sữa tươi và lớp kem mây tuyết bồng bềnh đặc trưng.
            </p>

            {store?.openingHoursNotice && (
              <div className="mt-4 flex items-center gap-2 text-xs text-stone-300">
                <Clock size={14} className="text-amber-300" />
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
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900 text-xs sm:text-sm shadow-sm">
            <AlertCircle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">Quán đang tạm dừng nhận đơn trực tuyến</strong>
              <span>Quý khách vui lòng quay lại sau ít phút hoặc ghé trực tiếp quầy để được phục vụ chu đáo nhất!</span>
            </div>
          </div>
        )}

        {/* 3. Category Pill Navigation (Horizontal scrollable with smooth edge bleed) */}
        <div className="sticky top-[53px] sm:top-[61px] z-30 py-2 sm:py-2.5 bg-[#FAF7F2]/95 backdrop-blur-md mb-4 sm:mb-6 border-b border-[#EAE2D7]/60 -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
          <div className="laboong-tabs-container">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`laboong-tab-pill ${activeCategory === "all" ? "active" : ""}`}
            >
              Tất cả ({items.length})
            </button>
            {categories.map((cat) => {
              const count = items.filter((i) => i.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`laboong-tab-pill ${activeCategory === cat.id ? "active" : ""}`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Menu Items Grid */}
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
              className="px-4 py-2 rounded-full bg-[#3D5A40] text-white text-xs font-semibold"
            >
              Thử lại
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-stone-200 p-8">
            <p className="text-stone-500 font-medium">Chưa có món trong danh mục này.</p>
          </div>
        ) : (
          <div className="laboong-grid">
            {filteredItems.map((item) => {
              const catObj = categories.find((c) => c.id === item.category_id);
              return (
                <MenuCard
                  key={item.id}
                  item={item}
                  categoryName={catObj?.name || ""}
                  onSelect={(selected) => setSelectedItem(selected)}
                />
              );
            })}
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
        key={selectedItem?.id || "modal"}
        item={selectedItem}
        options={options}
        onClose={() => setSelectedItem(null)}
        onAddToCart={handleAddToCart}
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
