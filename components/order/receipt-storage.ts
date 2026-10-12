export type PendingOrder = { key: string; receipt: string; payload: string };
const PENDING_KEY = "laboong_pending_order_v1";
const RECEIPT_KEY = "laboong_last_receipt_v1";

export function parseReceipt(value: string): string | null {
  const raw = value.trim();
  if (/^[a-f0-9]{64}$/.test(raw)) return raw;
  try {
    const receipt = new URLSearchParams(new URL(raw).hash.slice(1)).get("receipt");
    return receipt && /^[a-f0-9]{64}$/.test(receipt) ? receipt : null;
  } catch { return null; }
}

export function readPendingOrder(): PendingOrder | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_KEY) || "null") as PendingOrder | null;
    return value && typeof value.payload === "string" && typeof value.key === "string" && parseReceipt(value.receipt) ? value : null;
  } catch { return null; }
}

export function prepareOrderAttempt(payload: string): PendingOrder {
  const prior = readPendingOrder();
  if (prior) {
    if (prior.payload !== payload) throw new Error("Đơn trước chưa được xác nhận. Hãy đóng giỏ và dùng nút kiểm tra đơn đang gửi trước khi đặt đơn mới.");
    return prior;
  }
  const receipt = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const pending = { key: crypto.randomUUID(), receipt, payload };
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch {
    throw new Error("Không lưu được thông tin khôi phục đơn trên thiết bị. Vui lòng cho phép lưu trữ trình duyệt rồi thử lại.");
  }
  return pending;
}

export function clearPendingOrder() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* Replaying a retained attempt remains safe. */ }
}

export function rememberReceipt(receipt: string) {
  try { localStorage.setItem(RECEIPT_KEY, receipt); } catch { /* The fragment URL remains a usable receipt. */ }
  clearPendingOrder();
}

export function lastReceipt(): string {
  try { return localStorage.getItem(RECEIPT_KEY) || ""; } catch { return ""; }
}

export function submitOrderAttempt(attempt: PendingOrder) {
  return fetch("/api/order/create", { method: "POST", headers: {
    "Content-Type": "application/json", "Idempotency-Key": attempt.key, "X-Order-Receipt": attempt.receipt,
  }, body: attempt.payload });
}
