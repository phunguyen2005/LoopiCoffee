"use client";

import React from "react";
import { Plus } from "lucide-react";
import { DrinkVisual } from "./drink-visual";

export interface MenuItemData {
  id: string;
  category_id: string;
  name: string;
  english_name?: string | null;
  description?: string | null;
  base_price: number;
  image_url: string;
  badge?: "best_seller" | "new" | "limited" | null;
  is_available: boolean | number;
  allows_size?: boolean | number;
  allows_sugar?: boolean | number;
  allows_ice?: boolean | number;
  allows_toppings?: boolean | number;
}

interface MenuCardProps {
  item: MenuItemData;
  categoryName?: string;
  cartQuantity?: number;
  onSelect: (item: MenuItemData) => void;
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace("₫", "đ");
}

export function MenuCard({ item, categoryName, cartQuantity, onSelect }: MenuCardProps) {
  const isAvailable = Boolean(item.is_available);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      disabled={!isAvailable}
      aria-label={
        isAvailable
          ? `Chọn món ${item.name}, giá ${formatVND(item.base_price)}${cartQuantity && cartQuantity > 0 ? `, trong giỏ: ${cartQuantity}` : ""}`
          : `${item.name} hiện tạm hết`
      }
      className={`group relative w-full text-left flex flex-col justify-between rounded-2xl sm:rounded-3xl bg-white p-2.5 sm:p-4 border transition-all duration-200 cursor-pointer select-none active:scale-[0.99] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D5A40] focus-visible:ring-offset-2 ${
        isAvailable
          ? "border-[#EAE3D9] hover:border-[#3D5A40]/40 hover:shadow-lg hover:-translate-y-0.5 shadow-sm"
          : "border-stone-200 bg-stone-50/70 opacity-65 cursor-not-allowed"
      }`}
      style={{
        boxShadow: "0 2px 10px rgba(43, 62, 45, 0.04)",
      }}
    >
      {/* Top Image Container */}
      <div className="relative w-full mb-2.5 sm:mb-3 overflow-hidden rounded-xl sm:rounded-2xl">
        <DrinkVisual
          itemId={item.id}
          name={item.name}
          category={categoryName}
          imageUrl={item.image_url}
        />

        {/* Badges */}
        <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 flex flex-col gap-1 z-20">
          {!isAvailable ? (
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase rounded-md bg-stone-800 text-white shadow-sm">
              Hết món
            </span>
          ) : item.badge === "best_seller" ? (
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase rounded-md bg-[#C85A32] text-white shadow-sm">
              Bán chạy
            </span>
          ) : item.badge === "new" ? (
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[10px] sm:text-[11px] font-extrabold tracking-wider uppercase rounded-md bg-[#3D5A40] text-white shadow-sm">
              Mới
            </span>
          ) : null}
        </div>

        {/* Cart Quantity Badge */}
        {cartQuantity !== undefined && cartQuantity > 0 && (
          <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20">
            <span
              className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-black rounded-full bg-[#C85A32] text-white shadow-md border-2 border-white select-none pointer-events-none"
              title={`${cartQuantity} món trong giỏ`}
            >
              {cartQuantity}
            </span>
          </div>
        )}

        {/* Quick Add Floating Button with Touch-Friendly Hit Target */}
        {isAvailable && (
          <span
            aria-hidden="true"
            className="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 z-20 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white text-[#2B3E2D] shadow-md border border-[#E6DFD5] flex items-center justify-center transition-all duration-150 hover:bg-[#3D5A40] hover:text-white active:scale-90"
          >
            <Plus size={18} strokeWidth={2.5} />
          </span>
        )}
      </div>

      {/* Item Details */}
      <div className="flex flex-col flex-grow justify-between">
        <div>
          <h3 className="font-bold text-sm sm:text-base text-[#231F1D] group-hover:text-[#3D5A40] transition-colors leading-snug line-clamp-2 min-h-[2.4rem] sm:min-h-[2.6rem]">
            {item.name}
          </h3>
          {item.english_name && (
            <p className="text-[11px] sm:text-xs text-[#8A7E74] font-medium tracking-wide mt-0.5 line-clamp-1">
              {item.english_name}
            </p>
          )}
          {item.description && (
            <p className="hidden sm:line-clamp-2 text-xs text-[#6E645E] mt-1.5 leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Price & Action */}
        <div className="mt-2.5 sm:mt-3 pt-2 border-t border-[#F2ECE4] flex items-center justify-between gap-1">
          <div className="flex items-baseline gap-1">
            <span className="text-sm sm:text-base font-extrabold text-[#C85A32]">
              {formatVND(item.base_price)}
            </span>
          </div>

          <span
            className={`text-[11px] sm:text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full whitespace-nowrap ${
              isAvailable
                ? "bg-[#EBF1EA] text-[#3D5A40]"
                : "bg-stone-200 text-stone-600"
            }`}
          >
            {isAvailable ? "Chọn" : "Tạm hết"}
          </span>
        </div>
      </div>
    </button>
  );
}
