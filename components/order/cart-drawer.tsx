"use client";

import React, { useState, useRef } from "react";
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { type CartItemOption } from "./item-detail-modal";
import { formatVND } from "./menu-card";
import { prepareOrderAttempt, submitOrderAttempt, rememberReceipt, clearPendingOrder } from "./receipt-storage";
import { useModalDialog } from "./use-modal-dialog";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItemOption[];
  onUpdateQuantity: (index: number, newQty: number) => void;
  onRemoveItem: (index: number) => void;
  onClearCart: () => void;
  onOrderSuccess: (order: { id: string; orderCode: string; customerName: string; customerPhone: string; totalAmount: number; itemCount: number; receiptToken: string }) => void;
}

const VN_PHONE_REGEX = /^(0[35789])[0-9]{8}$/;

export function CartDrawer({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderSuccess,
}: CartDrawerProps) {
  const [customerName, setCustomerName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("laboong_saved_name") || "";
    }
    return "";
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("laboong_saved_phone") || "";
    }
    return "";
  });
  const [customerNote, setCustomerNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});
  const [priceConfirmation, setPriceConfirmation] = useState<{
    cartTotal: number;
    currentTotal: number;
  } | null>(null);

  const submitLock = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const dialogRef = useModalDialog(isOpen, onClose);

  if (!isOpen) return null;

  const totalAmount = items.reduce((sum, it) => sum + it.subtotal, 0);
  const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);
  const activePriceConfirmation = priceConfirmation?.cartTotal === totalAmount
    ? priceConfirmation
    : null;

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    setErrorMessage(null);
    setFieldErrors({});
    const confirmedTotal = activePriceConfirmation
      ? activePriceConfirmation.currentTotal
      : totalAmount;

    const name = customerName.trim();
    const phone = customerPhone.trim().replace(/[\s.-]/g, "");

    if (!name || name.length < 2) {
      setFieldErrors({ name: "Vui lòng nhập họ và tên (tối thiểu 2 ký tự)." });
      nameRef.current?.focus();
      return;
    }

    if (!phone || !VN_PHONE_REGEX.test(phone)) {
      setFieldErrors({ phone: "Nhập số di động Việt Nam gồm 10 chữ số, ví dụ 0908123456." });
      phoneRef.current?.focus();
      return;
    }

    if (items.length === 0) {
      setErrorMessage("Giỏ hàng của bạn đang trống!");
      return;
    }

    submitLock.current = true;
    setIsSubmitting(true);
    try {
      const attempt = prepareOrderAttempt(JSON.stringify({
        customerName: name, customerPhone: phone, customerNote: customerNote.trim(),
        expectedTotal: confirmedTotal,
        items: items.map(it => ({ itemId: it.itemId, quantity: it.quantity,
          sizeId: it.sizeId, sugarId: it.sugarId, iceId: it.iceId,
          toppingIds: it.toppings.map(t => t.id), note: it.note })),
      }));
      const response = await submitOrderAttempt(attempt);

      const data = (await response.json()) as {
        success?: boolean;
        order?: {
          id: string;
          orderCode: string;
          customerName: string;
          customerPhone: string;
          totalAmount: number;
          itemCount: number;
        };
        error?: string;
        code?: string;
        currentTotal?: number;
        unavailableItemId?: string;
      };

      if (!response.ok || !data.success || !data.order) {
        if (response.status < 500 && response.status !== 429 && data.code !== "idempotency_conflict") clearPendingOrder();
        if (data.code === "price_changed" && Number.isSafeInteger(data.currentTotal)) {
          setPriceConfirmation({ cartTotal: totalAmount, currentTotal: data.currentTotal! });
        }
        setErrorMessage(data.error || "Không thể đặt hàng lúc này. Vui lòng kiểm tra lại!");
        return;
      }

      rememberReceipt(attempt.receipt);
      setPriceConfirmation(null);
      onClearCart();
      onOrderSuccess({ ...data.order, receiptToken: attempt.receipt });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Chưa xác nhận được đơn. Thử lại sẽ dùng đúng mã gửi cũ, tránh tạo đơn trùng.");
    } finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Cart Panel (Slide over from right on desktop, bottom sheet on mobile) */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        className="relative z-10 w-full sm:max-w-md bg-[#FAF7F2] h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-250 border-l border-[#E2D8CC]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-[#EAE3D9] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#EBF1EA] text-[#3D5A40] flex items-center justify-center">
              <ShoppingBag size={18} />
            </div>
            <div>
              <h2 id="cart-title" className="font-bold text-base sm:text-lg text-[#231F1D]">Giỏ hàng của bạn</h2>
              <span className="text-xs text-stone-500">{totalQuantity} món đã chọn</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng giỏ hàng"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Cart Items List */}
        <div className="flex-grow overflow-y-auto custom-scroll p-4 space-y-3">
          {items.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6">
              <div className="w-16 h-16 rounded-full bg-[#EBF1EA] text-[#3D5A40] flex items-center justify-center mb-3">
                <ShoppingBag size={28} />
              </div>
              <h3 className="font-bold text-base text-[#231F1D]">Giỏ hàng đang trống</h3>
              <p className="text-xs text-stone-500 mt-1 max-w-[240px]">
                Hãy chọn những thức uống tuyệt hảo từ thực đơn La Boong bạn nhé!
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-4 py-2 rounded-full bg-[#3D5A40] text-white text-xs font-semibold hover:bg-[#2B3E2D] transition-colors"
              >
                Tiếp tục chọn món
              </button>
            </div>
          ) : (
            items.map((it, idx) => (
              <div
                key={`${it.itemId}-${idx}`}
                className="bg-white p-3.5 rounded-2xl border border-[#EAE3D9] shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-grow">
                    <h4 className="font-bold text-sm text-[#231F1D]">{it.name}</h4>
                    {/* Customization Badges */}
                    <div className="flex flex-wrap gap-1 mt-1 text-[11px] text-stone-500">
                      <span className="bg-[#FAF7F2] px-2 py-0.5 rounded border border-stone-200">
                        {it.size}
                      </span>
                      <span className="bg-[#FAF7F2] px-2 py-0.5 rounded border border-stone-200">
                        {it.sugar.split(" ")[0]}
                      </span>
                      <span className="bg-[#FAF7F2] px-2 py-0.5 rounded border border-stone-200">
                        {it.ice.split(" ")[0]}
                      </span>
                    </div>

                    {/* Toppings list */}
                    {it.toppings.length > 0 && (
                      <div className="mt-1 text-[11px] text-[#634832] font-medium">
                        + {it.toppings.map((t) => t.name).join(", ")}
                      </div>
                    )}

                    {/* Note */}
                    {it.note && (
                      <div className="mt-1 text-[11px] text-stone-400 italic">
                        &ldquo;{it.note}&rdquo;
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(idx)}
                    aria-label={`Xoá món ${it.name}`}
                    className="text-stone-400 hover:text-red-500 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <span className="font-bold text-sm text-[#C85A32]">
                    {formatVND(it.subtotal)}
                  </span>

                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden bg-stone-50">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(idx, it.quantity - 1)}
                      disabled={it.quantity <= 1}
                      aria-label="Giảm số lượng món"
                      className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-600 hover:bg-stone-200 disabled:opacity-30"
                    >
                      <Minus size={15} />
                    </button>
                    <span className="w-8 text-center font-bold text-sm text-[#231F1D]">
                      {it.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(idx, it.quantity + 1)}
                      disabled={it.quantity >= 20}
                      aria-label="Tăng số lượng món"
                      className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-600 hover:bg-stone-200"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Customer Info Form (Only when items exist) */}
          {items.length > 0 && (
            <div className="bg-white p-4 rounded-2xl border border-[#EAE3D9] shadow-sm mt-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#3D5A40] mb-3">
                Thông tin nhận đơn
              </h3>

              {errorMessage && (
                <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-start gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-3.5">
                <div>
                  <label htmlFor="customer-name" className="block text-xs font-bold text-stone-700 mb-1 uppercase tracking-wider">
                    Họ và tên <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={nameRef}
                    id="customer-name"
                    maxLength={100}
                    type="text"
                    required
                    autoComplete="name"
                    enterKeyHint="next"
                    value={customerName}
                    onChange={(e) => { setCustomerName(e.target.value); if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined })); }}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "customer-name-error" : undefined}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full text-base py-3 px-3.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40] text-stone-900 placeholder:text-stone-400 min-h-[44px]"
                  />
                  {fieldErrors.name && <p id="customer-name-error" className="mt-1.5 text-xs text-red-700" role="alert">{fieldErrors.name}</p>}
                </div>

                <div>
                  <label htmlFor="customer-phone" className="block text-xs font-bold text-stone-700 mb-1 uppercase tracking-wider">
                    Số điện thoại <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={phoneRef}
                    id="customer-phone"
                    maxLength={24}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    enterKeyHint="next"
                    required
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(e.target.value); if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: undefined })); }}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? "customer-phone-error" : undefined}
                    placeholder="090xxxxxxx (10 số)"
                    className="w-full text-base py-3 px-3.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40] text-stone-900 placeholder:text-stone-400 min-h-[44px]"
                  />
                  {fieldErrors.phone && <p id="customer-phone-error" className="mt-1.5 text-xs text-red-700" role="alert">{fieldErrors.phone}</p>}
                </div>

                <div>
                  <label htmlFor="customer-note" className="block text-xs font-bold text-stone-700 mb-1 uppercase tracking-wider">
                    Ghi chú cho quán (không bắt buộc)
                  </label>
                  <input
                    id="customer-note"
                    maxLength={500}
                    type="text"
                    enterKeyHint="done"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Ghi chú khi nhận tại quầy..."
                    className="w-full text-base py-3 px-3.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#3D5A40] text-stone-900 placeholder:text-stone-400 min-h-[44px]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Checkout Bar */}
        {items.length > 0 && (
          <div className="p-4 bg-white border-t border-[#EAE3D9] space-y-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-600 font-medium">Tổng thanh toán ({totalQuantity} món):</span>
              <span className="text-right">
                {activePriceConfirmation && (
                  <span className="block text-[11px] font-semibold text-amber-700">Giá mới cần xác nhận</span>
                )}
                <span className="block font-extrabold text-lg text-[#C85A32]">
                  {formatVND(activePriceConfirmation?.currentTotal ?? totalAmount)}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleSubmitOrder}
              disabled={isSubmitting}
              className="w-full min-h-[48px] py-3.5 px-5 rounded-2xl bg-[#C85A32] hover:bg-[#B34E29] active:scale-[0.99] text-white font-bold text-base shadow-lg shadow-orange-950/15 flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Đang gửi đơn hàng...</span>
                </>
              ) : (
                <>
                  <span>{activePriceConfirmation ? `Xác nhận ${formatVND(activePriceConfirmation.currentTotal)} và đặt hàng` : "Xác nhận đặt hàng"}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
