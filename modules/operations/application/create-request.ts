import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export async function createRequest(db: D1Database, actor: AccessActor, input: { type?: unknown; title?: unknown; reason?: unknown; shiftId?: unknown; idempotencyKey?: unknown }) {
  if (typeof input.type !== "string" || !["leave", "swap", "correction"].includes(input.type) || typeof input.title !== "string" || !input.title.trim() || input.title.length > 180 || typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.length > 1000 || typeof input.idempotencyKey !== "string" || !input.idempotencyKey || input.idempotencyKey.length > 128) throw new ApplicationError("Yêu cầu chưa đủ thông tin hợp lệ; lý do cần ít nhất 5 ký tự.");
  const key = input.idempotencyKey;
  const existing = await db.prepare("SELECT id, type, title, reason, shift_id FROM requests WHERE employee_email = ? AND client_request_key = ?").bind(actor.email, key).first<{ id: string; type: string; title: string; reason: string; shift_id: string | null }>();
  if (existing) {
    if (existing.type !== input.type || existing.title !== input.title.trim() || existing.reason !== input.reason.trim() || existing.shift_id !== (input.shiftId || null)) throw new ApplicationError("Nội dung yêu cầu đã thay đổi. Hãy tải lại biểu mẫu.", 409, "request_conflict");
    return { request: existing, replayed: true };
  }
  let shift: { id: string; starts_at: string; ends_at: string } | null = null;
  if (input.type === "leave" && !input.shiftId) throw new ApplicationError("Chọn ca cần xin nghỉ.");
  if (input.shiftId) {
    if (typeof input.shiftId !== "string") throw new ApplicationError("Ca không hợp lệ.");
    shift = await db.prepare("SELECT id, starts_at, ends_at FROM shifts WHERE id = ? AND store_id = ? AND lower(employee_email) = lower(?) AND status = 'published' AND approved_leave_request_id IS NULL")
      .bind(input.shiftId, actor.storeId, actor.email).first();
    if (!shift) throw new ApplicationError("Không tìm thấy ca của bạn hoặc ca đã được duyệt nghỉ.", 404, "not_found");
  }
  const id = crypto.randomUUID(), now = new Date().toISOString();
  try {
    await db.batch([
      db.prepare(`INSERT INTO requests (id, store_id, employee_email, type, title, reason, status, created_at, shift_id, starts_at, ends_at, client_request_key)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`)
        .bind(id, actor.storeId, actor.email, input.type, input.title.trim(), input.reason.trim(), now, shift?.id ?? null, shift?.starts_at ?? null, shift?.ends_at ?? null, key),
      auditStatement(db, actor.email, "request", id, "request.created", { type: input.type, shiftId: shift?.id ?? null }, now),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message)) return createRequest(db, actor, input);
    throw error;
  }
  return { request: { id }, replayed: false };
}
