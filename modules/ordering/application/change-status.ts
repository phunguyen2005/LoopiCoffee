import { ApplicationError } from "../../../platform/http/errors.ts";
import { object, text } from "./input.ts";

const transitions: Record<string, string[]> = {
  pending: ["accepted", "cancelled"], accepted: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: ["completed", "cancelled"], completed: [], cancelled: [],
};

export async function changeOrderStatus(db: D1Database, actor: { storeId: string; email: string; role: string }, id: string, raw: unknown) {
  if (!["owner", "manager"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền xử lý đơn.", 403);
  const body = object(raw);
  const next = text(body.newStatus, 30, "trạng thái", 1);
  const expected = text(body.expectedStatus, 30, "trạng thái hiện tại", 1);
  const reason = text(body.cancelReason, 500, "lý do hủy", next === "cancelled" ? 3 : 0);
  const note = text(body.note, 500, "ghi chú");
  if (!transitions[expected]?.includes(next)) throw new ApplicationError("Chuyển trạng thái không hợp lệ.", 409, "invalid_transition");
  const now = new Date().toISOString();
  const writes = await db.batch([
    db.prepare("UPDATE customer_orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ? AND store_id = ? AND status = ?")
      .bind(next, next === "cancelled" ? reason : null, now, text(id, 100, "mã đơn", 1), actor.storeId, expected),
    db.prepare(
      `INSERT INTO order_status_history (id, order_id, from_status, to_status, actor_type, actor_email, note, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(crypto.randomUUID(), id, expected, next, actor.role, actor.email, note || reason || null, now),
  ]);
  if (!writes[0].meta.changes) throw new ApplicationError("Đơn hàng đã thay đổi hoặc không tồn tại. Hãy tải lại.", 409, "order_conflict");
  return { success: true, orderId: id, fromStatus: expected, toStatus: next, updatedAt: now };
}
