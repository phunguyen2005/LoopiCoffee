import { ApplicationError } from "../../../platform/http/errors.ts";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApplicationError("Dữ liệu không hợp lệ.");
  return value as Record<string, unknown>;
}

export function text(value: unknown, max: number, label: string, min = 0): string {
  if (value === undefined || value === null) {
    if (min) throw new ApplicationError(`Thiếu ${label}.`);
    return "";
  }
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new ApplicationError(`${label} không hợp lệ (tối đa ${max} ký tự).`);
  }
  return value.trim();
}

export function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ApplicationError(`${label} phải là số nguyên từ ${min} đến ${max}.`);
  }
  return value;
}

export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function receiptToken(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ApplicationError("Cần liên kết riêng được cấp khi đặt đơn.", 404, "receipt_not_found");
  }
  return value;
}

export async function readOrderBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApplicationError("Yêu cầu phải dùng JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ApplicationError("Thiếu nội dung yêu cầu.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 32768) {
        await reader.cancel();
        throw new ApplicationError("Yêu cầu quá lớn.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApplicationError("JSON không hợp lệ."); }
  return object(body);
}
