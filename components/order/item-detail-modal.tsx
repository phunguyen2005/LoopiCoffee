"use client";

import React, { useState } from "react";

import { X, Minus, Plus, Check } from "lucide-react";
import { DrinkVisual } from "./drink-visual";
import { type MenuItemData, formatVND } from "./menu-card";

export interface MenuOptionItem {
  id: string;
  group_type: "size" | "sugar" | "ice" | "topping";
  name: string;
  price_modifier: number;
  is_default: boolean | number;
  is_available: boolean | number;
}

export interface CartItemOption {
  itemId: string;
  name: string;
  englishName?: string | null;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  size: string;
  sugar: string;
  ice: string;
  sizeId?: string;
  sugarId?: string;
  iceId?: string;
  toppings: Array<{ id: string; name: string; price: number }>;
  note: string;
  subtotal: number;
}

interface ItemDetailModalProps {
  item: MenuItemData | null;
  options: MenuOptionItem[];
  onClose: () => void;
  onAddToCart: (cartItem: CartItemOption) => void;
}

export function ItemDetailModal({
  item,
  options,
  onClose,
  onAddToCart,
}: ItemDetailModalProps) {
  // Available options filtered by group
  const sizeOptions = options.filter((o) => o.group_type === "size" && o.is_available && item?.allows_size);
  const sugarOptions = options.filter((o) => o.group_type === "sugar" && o.is_available && item?.allows_sugar);
  const iceOptions = options.filter((o) => o.group_type === "ice" && o.is_available && item?.allows_ice);
  const toppingOptions = options.filter((o) => o.group_type === "topping" && o.is_available && item?.allows_toppings);

  // Selection states
  const defaultSize = sizeOptions.find((o) => o.is_default) || sizeOptions[0] || { name: "Size M", price_modifier: 0 };
  const defaultSugar = sugarOptions.find((o) => o.is_default) || sugarOptions[0] || { name: "100% đường", price_modifier: 0 };
  const defaultIce = iceOptions.find((o) => o.is_default) || iceOptions[0] || { name: "100% đá", price_modifier: 0 };

  const [selectedSize, setSelectedSize] = useState<MenuOptionItem>(defaultSize as MenuOptionItem);
  const [selectedSugar, setSelectedSugar] = useState<MenuOptionItem>(defaultSugar as MenuOptionItem);
  const [selectedIce, setSelectedIce] = useState<MenuOptionItem>(defaultIce as MenuOptionItem);
  const [selectedToppings, setSelectedToppings] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  if (!item) return null;


  // Calculate pricing
  const sizeModifier = (item.allows_size ? selectedSize?.price_modifier || 0 : 0)
    + (item.allows_sugar ? selectedSugar?.price_modifier || 0 : 0)
    + (item.allows_ice ? selectedIce?.price_modifier || 0 : 0);
  const toppingsTotal = selectedToppings.reduce((sum, t) => sum + t.price, 0);
  const unitPrice = item.base_price + sizeModifier + toppingsTotal;
  const totalPrice = unitPrice * quantity;

  // Toggle topping
  const toggleTopping = (top: MenuOptionItem) => {
    const exists = selectedToppings.some((t) => t.name === top.name);
    if (exists) {
      setSelectedToppings(selectedToppings.filter((t) => t.name !== top.name));
    } else {
      if (selectedToppings.length >= 10) return;
      setSelectedToppings([...selectedToppings, { id: top.id, name: top.name, price: top.price_modifier }]);
    }
  };

  const handleAdd = () => {
    onAddToCart({
      itemId: item.id,
      name: item.name,
      englishName: item.english_name,
      basePrice: item.base_price,
      unitPrice,
      quantity,
      size: item.allows_size ? selectedSize?.name || "" : "",
      sugar: item.allows_sugar ? selectedSugar?.name || "" : "",
      ice: item.allows_ice ? selectedIce?.name || "" : "",
      sizeId: item.allows_size ? selectedSize?.id : undefined,
      sugarId: item.allows_sugar ? selectedSugar?.id : undefined,
      iceId: item.allows_ice ? selectedIce?.id : undefined,
      toppings: selectedToppings,
      note: note.trim(),
      subtotal: totalPrice,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Container */}
      <div
        className="relative z-10 w-full max-w-lg bg-[#FAF7F2] rounded-t-[28px] sm:rounded-[24px] shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden border border-[#E8DFD5] animate-in slide-in-from-bottom duration-200"
      >
        {/* Mobile Drag Indicator Bar */}
        <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto mt-2.5 mb-1 sm:hidden flex-shrink-0" />

        {/* Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng tùy chọn"
          className="absolute top-3.5 right-3.5 z-30 w-10 h-10 rounded-full bg-white/95 text-stone-700 shadow-md border border-stone-200 flex items-center justify-center hover:bg-white active:scale-90 transition-all"
        >
          <X size={18} />
        </button>

        {/* Scrollable Content */}
        <div className="overflow-y-auto custom-scroll flex-grow overscroll-contain">
          {/* Hero Image Section */}
          <div className="w-full bg-[#EAE2D7] relative p-4 sm:p-6 flex items-center justify-center">
            <div className="w-44 h-44 sm:w-56 sm:h-56">
              <DrinkVisual itemId={item.id} name={item.name} aspectRatio="square" />
            </div>
          </div>

          {/* Item Meta */}
          <div className="p-4 sm:p-6 bg-[#FAF7F2]">
            <div className="text-[12px] font-bold tracking-wider text-[#C85A32] uppercase mb-1">
              Thương hiệu La Boong
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#231F1D] leading-tight">
              {item.name}
            </h2>
            {item.english_name && (
              <p className="text-xs sm:text-sm text-[#8A7E74] font-medium tracking-wide mt-0.5">
                {item.english_name}
              </p>
            )}
            {item.description && (
              <p className="text-xs sm:text-sm text-[#6E645E] mt-2 leading-relaxed">
                {item.description}
              </p>
            )}
            <div className="mt-3 text-lg sm:text-xl font-bold text-[#C85A32]">
              {formatVND(item.base_price)}
            </div>

            <hr className="my-5 border-[#E6DFD5]" />

            {/* Size Group (Reference screenshot 1 segmented pills) */}
            {sizeOptions.length > 0 && (
              <div className="mb-5">
                <label className="block text-xs font-bold text-[#231F1D] uppercase tracking-wider mb-2.5">
                  Kích cỡ (Size) <span className="text-stone-400 font-normal">1 lựa chọn</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {sizeOptions.map((sz) => {
                    const isSelected = selectedSize?.name === sz.name;
                    return (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => setSelectedSize(sz)}
                        className={`py-3 px-3 rounded-xl border text-center transition-all ${
                          isSelected
                            ? "bg-[#EBF1EA] border-[#3D5A40] text-[#2B3E2D] font-bold shadow-sm ring-1 ring-[#3D5A40]"
                            : "bg-white border-[#DDD4C7] text-stone-700 hover:border-stone-400 font-medium"
                        }`}
                      >
                        <div className="text-sm font-semibold">{sz.name.split(" ")[0]} {sz.name.split(" ")[1]}</div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {sz.price_modifier > 0 ? `+${formatVND(sz.price_modifier)}` : "Giá chuẩn"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sugar Level Group */}
            {sugarOptions.length > 0 && (
              <div className="mb-5">
                <label className="block text-xs font-bold text-[#231F1D] uppercase tracking-wider mb-2.5">
                  Lượng đường <span className="text-stone-400 font-normal">1 lựa chọn</span>
                </label>
                <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-1.5 sm:gap-2">
                  {sugarOptions.map((sg) => {
                    const isSelected = selectedSugar?.name === sg.name;
                    return (
                      <button
                        key={sg.id}
                        type="button"
                        onClick={() => setSelectedSugar(sg)}
                        className={`min-h-[44px] py-2 px-2 rounded-xl border text-xs text-center flex flex-col justify-center items-center transition-all active:scale-95 ${
                          isSelected
                            ? "bg-[#EBF1EA] border-[#3D5A40] text-[#2B3E2D] font-bold shadow-sm ring-1 ring-[#3D5A40]"
                            : "bg-white border-[#DDD4C7] text-stone-700 hover:border-stone-400 font-medium"
                        }`}
                      >
                        <div className="font-bold">{sg.name.split(" ")[0]}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5 truncate max-w-full">
                          {sg.name.includes("Chuẩn vị") ? "Chuẩn vị" : sg.name.includes("Ít") ? "Ít ngọt" : "Tùy chọn"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ice Level Group */}
            {iceOptions.length > 0 && (
              <div className="mb-5">
                <label className="block text-xs font-bold text-[#231F1D] uppercase tracking-wider mb-2.5">
                  Lượng đá <span className="text-stone-400 font-normal">1 lựa chọn</span>
                </label>
                <div className="grid grid-cols-2 min-[360px]:grid-cols-4 gap-1.5 sm:gap-2">
                  {iceOptions.map((ic) => {
                    const isSelected = selectedIce?.name === ic.name;
                    return (
                      <button
                        key={ic.id}
                        type="button"
                        onClick={() => setSelectedIce(ic)}
                        className={`min-h-[44px] py-2 px-2 rounded-xl border text-xs text-center flex flex-col justify-center items-center transition-all active:scale-95 ${
                          isSelected
                            ? "bg-[#EBF1EA] border-[#3D5A40] text-[#2B3E2D] font-bold shadow-sm ring-1 ring-[#3D5A40]"
                            : "bg-white border-[#DDD4C7] text-stone-700 hover:border-stone-400 font-medium"
                        }`}
                      >
                        <div className="font-bold">{ic.name.split(" ")[0]}</div>
                        <div className="text-[10px] text-stone-400 mt-0.5 truncate max-w-full">
                          {ic.name.includes("Không") ? "Không đá" : "Đá viên"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Topping Multi-Select Group */}
            {toppingOptions.length > 0 && (
              <div className="mb-5">
                <label className="block text-xs font-bold text-[#231F1D] uppercase tracking-wider mb-2.5">
                  Thêm Topping <span className="text-stone-400 font-normal">Chọn nhiều</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {toppingOptions.map((top) => {
                    const isSelected = selectedToppings.some((t) => t.name === top.name);
                    return (
                      <button
                        key={top.id}
                        type="button"
                        onClick={() => toggleTopping(top)}
                        className={`min-h-[44px] flex items-center justify-between p-3 rounded-xl border text-left transition-all active:scale-[0.99] ${
                          isSelected
                            ? "bg-[#EBF1EA] border-[#3D5A40] text-[#2B3E2D] font-medium shadow-sm"
                            : "bg-white border-[#DDD4C7] text-stone-700 hover:border-stone-400"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold pr-2">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              isSelected
                                ? "bg-[#3D5A40] border-[#3D5A40] text-white"
                                : "border-stone-300 bg-white"
                            }`}
                          >
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>
                          <span>{top.name}</span>
                        </div>
                        <span className="text-xs font-bold text-[#C85A32] whitespace-nowrap">
                          +{formatVND(top.price_modifier)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Note Input */}
            <div className="mb-4">
              <label htmlFor="item-note" className="block text-xs font-bold text-[#231F1D] uppercase tracking-wider mb-1.5">
                Ghi chú riêng cho món này
              </label>
              <textarea
                id="item-note"
                maxLength={300}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: Để đá riêng, ít ngọt, nhiều thạch..."
                className="w-full text-base sm:text-sm p-3 rounded-xl bg-white border border-[#DDD4C7] focus:outline-none focus:ring-2 focus:ring-[#3D5A40] text-[#231F1D] placeholder:text-stone-400"
              />
            </div>
          </div>
        </div>

        {/* Footer Fixed Bar with Quantity Stepper and Add Button */}
        <div className="sticky bottom-0 z-20 p-4 sm:p-5 bg-white/95 backdrop-blur-md border-t border-[#EAE3D9] flex flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-stone-600 uppercase tracking-wider">
              Số lượng
            </span>
            <div className="flex items-center border border-stone-300 rounded-xl bg-white overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label="Giảm số lượng"
                className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-600 hover:bg-stone-100 disabled:opacity-30 active:bg-stone-200 transition-colors"
              >
                <Minus size={16} />
              </button>
              <span className="w-10 text-center font-extrabold text-base text-[#231F1D]">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(20, quantity + 1))}
                disabled={quantity >= 20}
                aria-label="Tăng số lượng"
                className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-600 hover:bg-stone-100 active:bg-stone-200 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Large CTA Add to Cart Button */}
          <button
            type="button"
            onClick={handleAdd}
            className="w-full min-h-[48px] py-3.5 px-6 rounded-2xl bg-[#C85A32] hover:bg-[#B34E29] active:scale-[0.99] text-white font-bold text-base shadow-lg shadow-orange-950/15 flex items-center justify-between transition-all"
          >
            <span>Thêm vào giỏ</span>
            <span className="font-extrabold text-lg">{formatVND(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
