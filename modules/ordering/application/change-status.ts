import { ApplicationError } from "../../../platform/http/errors.ts";
import { object, text } from "./input.ts";

const transitions: Record<string, string[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const VALID_CANCELLATION_CODES = [
  "customer_abandoned",
  "item_preparation_error",
  "store_incident",
] as const;

export type CancellationCode = (typeof VALID_CANCELLATION_CODES)[number];

export async function changeOrderStatus(
  db: D1Database,
  actor: { storeId: string; email: string; role: string },
  id: string,
  raw: unknown,
) {
  if (!["owner", "manager"].includes(actor.role)) {
    throw new ApplicationError("Bạn không có quyền xử lý đơn.", 403, "forbidden");
  }

  const body = object(raw);
  const next = text(body.newStatus, 30, "trạng thái", 1);
  const expected = text(body.expectedStatus, 30, "trạng thái hiện tại", 1);
  const note = text(body.note, 500, "ghi chú");

  if (!transitions[expected]?.includes(next)) {
    throw new ApplicationError("Chuyển trạng thái không hợp lệ.", 409, "invalid_transition");
  }

  let finalReason: string | null = null;
  if (next === "cancelled") {
    const rawReason = typeof body.cancelReason === "string" ? body.cancelReason.trim() : "";
    const rawCode = typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";

    if (["preparing", "ready"].includes(expected)) {
      if (rawCode) {
        if (!VALID_CANCELLATION_CODES.includes(rawCode as CancellationCode)) {
          throw new ApplicationError(
            "Mã lý do hủy không hợp lệ (customer_abandoned, item_preparation_error, store_incident).",
            400,
            "invalid_cancellation_reason",
          );
        }
        finalReason = rawReason ? `${rawCode}: ${rawReason}` : rawCode;
      } else if (rawReason) {
        if (VALID_CANCELLATION_CODES.includes(rawReason as CancellationCode)) {
          finalReason = rawReason;
        } else if (rawReason.length >= 3) {
          finalReason = rawReason;
        } else {
          throw new ApplicationError(
            "Hủy đơn đã hoặc đang pha yêu cầu lý do hủy hợp lệ.",
            400,
            "cancellation_reason_required",
          );
        }
      } else {
        throw new ApplicationError(
          "Hủy đơn đã hoặc đang pha yêu cầu mã lý do (customer_abandoned, item_preparation_error, store_incident).",
          400,
          "cancellation_reason_required",
        );
      }
    } else {
      finalReason = text(body.cancelReason, 500, "lý do hủy", 3);
    }
  }

  const now = new Date().toISOString();
  const writes = await db.batch([
    db
      .prepare(
        "UPDATE customer_orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ? AND store_id = ? AND status = ?",
      )
      .bind(
        next,
        next === "cancelled" ? finalReason : null,
        now,
        text(id, 100, "mã đơn", 1),
        actor.storeId,
        expected,
      ),
    db
      .prepare(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, actor_type, actor_email, note, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        expected,
        next,
        actor.role,
        actor.email,
        note || finalReason || null,
        now,
      ),
  ]);

  if (!writes[0].meta.changes) {
    throw new ApplicationError("Đơn hàng đã thay đổi hoặc không tồn tại. Hãy tải lại.", 409, "order_conflict");
  }

  return { success: true, orderId: id, fromStatus: expected, toStatus: next, updatedAt: now };
}

export async function getSpoilageMetrics(
  db: D1Database,
  storeId: string,
  startDate?: string,
  endDate?: string,
) {
  let query = `
    SELECT
      COUNT(DISTINCT o.id) as spoiled_orders_count,
      COALESCE(SUM(o.total_amount), 0) as spoiled_amount
    FROM customer_orders o
    JOIN order_status_history h ON h.order_id = o.id
    WHERE o.store_id = ?
      AND o.status = 'cancelled'
      AND h.from_status IN ('preparing', 'ready')
      AND h.to_status = 'cancelled'
  `;
  const params: string[] = [storeId];
  if (startDate) {
    query += ` AND date(o.created_at, '+7 hours') >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND date(o.created_at, '+7 hours') <= ?`;
    params.push(endDate);
  }
  const row = await db.prepare(query).bind(...params).first<{
    spoiled_orders_count: number;
    spoiled_amount: number;
  }>();

  return {
    spoiledOrdersCount: Number(row?.spoiled_orders_count || 0),
    spoiledAmount: Number(row?.spoiled_amount || 0),
  };
}
