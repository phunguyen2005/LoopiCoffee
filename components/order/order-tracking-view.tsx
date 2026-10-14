"use client";

import React, { useEffect, useState } from "react";
import { Check, Copy, RefreshCw, ArrowLeft, Search, X, AlertCircle } from "lucide-react";
import { formatVND } from "./menu-card";
import { lastReceipt, parseReceipt } from "./receipt-storage";
import { useModalDialog } from "./use-modal-dialog";

type TrackedOrderData = {
  order: { id: string; orderCode: string; customerName: string; customerPhone: string; customerNote?: string | null;
    totalAmount: number; itemCount: number; status: string; cancelReason?: string | null; createdAt: string; updatedAt: string };
  items: Array<{ name: string; unitPrice: number; quantity: number; subtotal: number; size?: string | null;
    sugar?: string | null; ice?: string | null; toppings?: Array<{ name: string; price: number }>; note?: string | null }>;
};
const STEPS = [
  { key: "pending", label: "Chờ xác nhận", desc: "Quán đang tiếp nhận đơn" },
  { key: "accepted", label: "Đã nhận", desc: "Quán đã xác nhận đơn" },
  { key: "preparing", label: "Đang chuẩn bị", desc: "Barista đang pha chế" },
  { key: "ready", label: "Sẵn sàng", desc: "Đồ uống đã sẵn sàng tại quầy" },
  { key: "completed", label: "Hoàn tất", desc: "Cảm ơn bạn đã ghé La Boong" },
];

function dateTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function OrderTrackingView({ receiptToken, onBackToMenu }: { receiptToken: string; onBackToMenu: () => void }) {
  const [data, setData] = useState<TrackedOrderData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    async function load() {
      let terminal = false;
      try {
        const response = await fetch("/api/order/track", { headers: { "X-Order-Receipt": receiptToken }, cache: "no-store", signal: controller.signal });
        const payload = await response.json() as TrackedOrderData & { error?: string };
        if (!response.ok) {
          terminal = response.status === 404;
          throw new Error(payload.error || "Không thể tải đơn hàng.");
        }
        terminal = ["completed", "cancelled"].includes(payload.order.status);
        if (!cancelled) { setData(payload); setError(null); }
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Mất kết nối. Vui lòng thử lại.");
      } finally {
        if (!cancelled && !terminal) timer = setTimeout(() => { if (document.visibilityState === "visible") void load(); else timer = setTimeout(load, 10000); }, 5000);
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [receiptToken, refresh]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/order#receipt=${receiptToken}`);
      setCopied(true);
    } catch { setError("Không sao chép được. Bạn có thể sao chép địa chỉ trang trên trình duyệt."); }
  }
  const order = data?.order;
  const step = STEPS.findIndex(item => item.key === order?.status);
  return (
    <main className="max-w-2xl mx-auto px-3.5 sm:px-4 py-4 sm:py-8 pb-12">
      <div className="flex items-center justify-between gap-2 mb-5">
        <button type="button" onClick={onBackToMenu} className="min-h-[44px] flex items-center gap-1.5 text-sm font-bold text-[#3D5A40]"><ArrowLeft size={16} /> Tiếp tục đặt món</button>
        <button type="button" onClick={() => setRefresh(value => value + 1)} className="min-h-[44px] px-3 rounded-full border border-stone-200 bg-white flex items-center gap-2 text-xs"><RefreshCw size={14} /> Cập nhật</button>
      </div>
      {error && <p role="alert" className="mb-4 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error}{data ? " Thông tin bên dưới là lần cập nhật gần nhất." : ""}</p>}
      {!data && !error && <p className="p-10 text-center text-stone-600">Đang tải đơn hàng…</p>}
      {order && data && <>
        <section className="bg-white rounded-3xl p-5 sm:p-8 border border-[#E8DFD5] shadow-lg shadow-stone-900/5 mb-5">
          <div className="flex flex-wrap justify-between gap-3 pb-5 border-b border-stone-100">
            <div><p className="text-xs text-stone-500 uppercase font-bold">Mã đơn hàng La Boong</p><h1 className="text-2xl font-extrabold text-[#3D5A40] mt-1">{order.orderCode}</h1><p className="text-xs text-stone-500 mt-2">Đặt lúc {dateTime(order.createdAt)}</p></div>
            <span className={`self-start px-3 py-2 rounded-full text-xs font-bold ${order.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-emerald-50 text-[#3D5A40]"}`}>{order.status === "cancelled" ? "Đã hủy" : STEPS[step]?.label || order.status}</span>
          </div>
          {order.status === "cancelled" ? <div className="mt-5 p-4 bg-red-50 rounded-xl text-red-800 text-sm"><strong>Đơn hàng đã hủy</strong><p className="mt-1">{order.cancelReason || "Vui lòng liên hệ quán để biết thêm chi tiết."}</p></div> : <ol className="my-6 space-y-4">
            {STEPS.map((item, index) => <li key={item.key} className={`flex gap-3 ${index > step ? "opacity-40" : ""}`}>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${index <= step ? "bg-[#3D5A40] text-white" : "bg-stone-100 text-stone-400"}`}>{index < step ? <Check size={17} /> : index + 1}</span>
              <div><p className="text-sm font-bold text-stone-800">{item.label}</p><p className="text-xs text-stone-500">{item.desc}</p></div>
            </li>)}
          </ol>}
          <div className="mt-5 p-4 rounded-xl bg-[#FAF7F2] text-sm space-y-2"><p><span className="text-stone-500">Khách hàng: </span><strong>{order.customerName}</strong></p><p><span className="text-stone-500">Điện thoại: </span>{order.customerPhone}</p>{order.customerNote && <p><span className="text-stone-500">Ghi chú: </span>{order.customerNote}</p>}</div>
        </section>
        <section className="bg-white rounded-3xl p-5 sm:p-8 border border-[#E8DFD5] shadow-sm mb-5">
          <h2 className="text-base font-bold text-stone-800 mb-4">Chi tiết đơn hàng</h2>
          <div className="divide-y divide-stone-100">{data.items.map((item, index) => <div key={index} className="py-3 flex justify-between gap-3">
            <div><p className="text-sm font-bold text-stone-800">{item.quantity} × {item.name}</p><p className="text-xs text-stone-500 mt-1">{[item.size, item.sugar, item.ice].filter(Boolean).join(" · ")}</p>{item.toppings?.length ? <p className="text-xs text-stone-500 mt-1">{item.toppings.map(topping => topping.name).join(", ")}</p> : null}{item.note && <p className="text-xs italic text-stone-500 mt-1">{item.note}</p>}</div>
            <strong className="text-sm text-[#3D5A40] whitespace-nowrap">{formatVND(item.subtotal)}</strong>
          </div>)}</div>
          <div className="pt-4 mt-3 border-t border-stone-200 flex justify-between font-bold"><span>Tổng ({order.itemCount} món)</span><span className="text-[#C85A32] text-lg">{formatVND(order.totalAmount)}</span></div>
        </section>
        <section className="p-4 rounded-2xl border border-[#D6E2D3] bg-[#EBF1EA] text-sm text-[#3D5A40]">
          <p className="font-bold">Giữ liên kết riêng để xem lại đơn này.</p><p className="text-xs mt-1">Người có liên kết có thể xem đơn. Mã đơn và số điện thoại không dùng để mở thông tin riêng.</p>
          <button type="button" onClick={copyLink} className="mt-3 min-h-[44px] px-4 bg-[#3D5A40] text-white rounded-xl flex items-center gap-2 font-bold text-xs"><Copy size={14} />{copied ? "Đã sao chép liên kết" : "Sao chép liên kết riêng"}</button>
        </section>
      </>}
    </main>
  );
}

export function OrderLookupModal({ isOpen, onClose, onFound }: { isOpen: boolean; onClose: () => void; onFound: (receipt: string) => void }) {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog<HTMLElement>(isOpen, onClose);
  if (!isOpen) return null;
  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    const receipt = parseReceipt(link);
    if (!receipt) { setError("Hãy dán liên kết riêng nhận sau khi đặt món."); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/order/track", { cache: "no-store", headers: { "X-Order-Receipt": receipt } });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Không tìm thấy đơn.");
      onFound(receipt); onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không kết nối được máy chủ."); }
    finally { setLoading(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
    <section ref={dialogRef} className="relative z-10 w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-stone-200">
      <div className="flex justify-between items-center mb-4"><h2 id="receipt-title" className="font-bold flex gap-2 items-center"><Search size={18} /> Xem lại đơn hàng</h2><button type="button" onClick={onClose} aria-label="Đóng tra cứu" className="min-h-[44px] min-w-[44px] flex items-center justify-center"><X size={20} /></button></div>
      <p className="text-sm text-stone-500 mb-4">Dán liên kết riêng của đơn hàng. Với đơn cũ chưa có liên kết, vui lòng liên hệ quán.</p>
      {error && <p role="alert" className="text-sm text-red-700 mb-3 flex gap-2"><AlertCircle size={16} />{error}</p>}
      <form onSubmit={lookup} className="space-y-3"><label htmlFor="receipt-link" className="text-xs font-bold">Liên kết riêng</label><input id="receipt-link" value={link} onChange={event => setLink(event.target.value)} maxLength={2048} autoComplete="off" placeholder="https://…/order#receipt=…" className="w-full min-h-[46px] rounded-xl border border-stone-300 px-3 text-sm" />
        <button type="button" onClick={() => { const receipt = lastReceipt(); if (receipt) { setLink(receipt); setError(null); } else setError("Thiết bị chưa lưu liên kết nào."); }} className="text-xs text-[#3D5A40] underline min-h-[44px]">Dùng đơn gần nhất đã lưu trên thiết bị</button>
        <button type="submit" disabled={loading} className="w-full min-h-[48px] rounded-xl bg-[#3D5A40] text-white font-bold text-sm disabled:opacity-50">{loading ? "Đang kiểm tra…" : "Mở đơn hàng"}</button>
      </form>
    </section>
  </div>;
}
