export type PendingHandover = { key: string; payload: string };

const PENDING_HANDOVER_KEY = "loopi_pending_handover_v1";

export function readPendingHandover(): PendingHandover | null {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_HANDOVER_KEY) || "null") as PendingHandover | null;
    return value && typeof value.key === "string" && typeof value.payload === "string" ? value : null;
  } catch {
    return null;
  }
}

export function prepareHandoverAttempt(payload: string): PendingHandover {
  const prior = readPendingHandover();
  if (prior) {
    if (prior.payload !== payload) {
      throw new Error("Bản bàn giao trước chưa được xác nhận. Hãy gửi lại đúng nội dung cũ trước khi tạo bản mới.");
    }
    return prior;
  }
  const pending = { key: crypto.randomUUID(), payload };
  localStorage.setItem(PENDING_HANDOVER_KEY, JSON.stringify(pending));
  return pending;
}

export function clearPendingHandover() {
  try {
    localStorage.removeItem(PENDING_HANDOVER_KEY);
  } catch {
    // Keeping the key is safe: a later retry returns the original handover.
  }
}
