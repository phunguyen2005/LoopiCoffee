import { ApplicationError } from "../../../platform/http/errors.ts";
import { object, text } from "./input.ts";
import { hasGrantedPermission } from "../../people/domain/permissions.ts";

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
  actor: { storeId: string; email: string; role: "system_admin" | "owner" | "manager" | "team_lead" | "employee"; permissions?: readonly string[] },
  id: string,
  raw: unknown,
) {
  const body = object(raw);
  const next = text(body.newStatus, 30, "trạng thái", 1);
  const expected = text(body.expectedStatus, 30, "trạng thái hiện tại", 1);
  const note = text(body.note, 500, "ghi chú");
  if (!hasGrantedPermission(actor, next === "cancelled" ? "orders.cancel" : "orders.transition")) {
    throw new ApplicationError("Bạn không có quyền xử lý đơn.", 403, "permission_denied");
  }

  if (!transitions[expected]?.includes(next)) {
    throw new ApplicationError("Chuyển trạng thái không hợp lệ.", 409, "invalid_transition");
  }

  let finalReason: string | null = null;
  if (next === "cancelled") {
    const rawReason = typeof body.cancelReason === "string" ? body.cancelReason.trim() : "";
    const rawCode = typeof body.reasonCode === "string" ? body.reasonCode.trim() : "";

    if (["preparing", "ready"].includes(expected)) {
      if (!rawCode) {
        throw new ApplicationError(
          "Hủy đơn đã hoặc đang pha yêu cầu mã lý do (customer_abandoned, item_preparation_error, store_incident).",
          400,
          "cancellation_reason_required",
        );
      }
      if (!VALID_CANCELLATION_CODES.includes(rawCode as CancellationCode)) {
        throw new ApplicationError(
          "Mã lý do hủy không hợp lệ (customer_abandoned, item_preparation_error, store_incident).",
          400,
          "invalid_cancellation_reason",
        );
      }
      finalReason = rawReason ? `${rawCode}: ${rawReason}` : rawCode;
    } else {
      finalReason = rawReason ? text(body.cancelReason, 500, "lý do hủy", 3) : null;
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

export const ORDER_PIPELINE_STAGES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "completed",
] as const;

export type OrderPipelineStage = (typeof ORDER_PIPELINE_STAGES)[number];

export async function advanceOrderStatusPipeline(
  db: D1Database,
  actor: { storeId: string; email: string; role: "system_admin" | "owner" | "manager" | "team_lead" | "employee"; permissions?: readonly string[] },
  id: string,
  raw: unknown,
) {
  const body = object(raw);
  const target = text(body.newStatus, 30, "trạng thái đích", 1) as OrderPipelineStage;
  const targetIdx = ORDER_PIPELINE_STAGES.indexOf(target);
  if (targetIdx === -1) {
    throw new ApplicationError("Trạng thái đích không hợp lệ cho quy trình hoàn tất tự động.", 400, "invalid_target_status");
  }

  const orderId = text(id, 100, "mã đơn", 1);
  const current = await db
    .prepare("SELECT status FROM customer_orders WHERE id = ? AND store_id = ?")
    .bind(orderId, actor.storeId)
    .first<{ status: string }>();

  if (!current) {
    throw new ApplicationError("Đơn hàng không tồn tại hoặc đã thay đổi.", 404, "order_not_found");
  }

  const currentIdx = ORDER_PIPELINE_STAGES.indexOf(current.status as OrderPipelineStage);
  if (currentIdx === -1) {
    throw new ApplicationError("Đơn hàng đã ở trạng thái kết thúc hoặc không thể chuyển tiếp.", 409, "invalid_transition");
  }
  if (currentIdx >= targetIdx) {
    throw new ApplicationError("Đơn hàng đã ở hoặc đã vượt qua trạng thái này.", 409, "order_conflict");
  }

  let lastResult = null;
  for (let i = currentIdx; i < targetIdx; i++) {
    const fromStatus = ORDER_PIPELINE_STAGES[i];
    const toStatus = ORDER_PIPELINE_STAGES[i + 1];
    lastResult = await changeOrderStatus(db, actor, orderId, {
      expectedStatus: fromStatus,
      newStatus: toStatus,
      note: body.note,
    });
  }

  return {
    ...lastResult,
    fromStatus: current.status,
    toStatus: target,
    stagesAdvanced: targetIdx - currentIdx,
  };
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
      COALESCE(SUM(o.total_amount), 0) as estimated_retail_value,
      SUM(CASE WHEN o.cancel_reason LIKE 'customer_abandoned%' THEN 1 ELSE 0 END) AS customer_abandoned_count,
      SUM(CASE WHEN o.cancel_reason LIKE 'item_preparation_error%' THEN 1 ELSE 0 END) AS item_preparation_error_count,
      SUM(CASE WHEN o.cancel_reason LIKE 'store_incident%' THEN 1 ELSE 0 END) AS store_incident_count
    FROM customer_orders o
    JOIN order_status_history h ON h.order_id = o.id
    WHERE o.store_id = ?
      AND o.status = 'cancelled'
      AND h.from_status IN ('preparing', 'ready')
      AND h.to_status = 'cancelled'
  `;
  const params: string[] = [storeId];
  if (startDate) {
    query += ` AND date(h.created_at, '+7 hours') >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND date(h.created_at, '+7 hours') <= ?`;
    params.push(endDate);
  }
  const row = await db.prepare(query).bind(...params).first<{
    spoiled_orders_count: number;
    estimated_retail_value: number;
    customer_abandoned_count: number;
    item_preparation_error_count: number;
    store_incident_count: number;
  }>();

  return {
    spoiledOrdersCount: Number(row?.spoiled_orders_count || 0),
    estimatedRetailValue: Number(row?.estimated_retail_value || 0),
    // Backward-compatible alias. This is order retail value, not ingredient cost or realized revenue.
    spoiledAmount: Number(row?.estimated_retail_value || 0),
    byReason: {
      customer_abandoned: Number(row?.customer_abandoned_count || 0),
      item_preparation_error: Number(row?.item_preparation_error_count || 0),
      store_incident: Number(row?.store_incident_count || 0),
    },
  };
}

export async function getWastageReport(
  db: D1Database,
  storeId: string,
  startDate?: string,
  endDate?: string,
) {
  let query = `
    SELECT o.id, o.order_code, o.total_amount, o.item_count, o.cancel_reason,
           h.from_status, h.actor_email, h.created_at AS cancelled_at
    FROM customer_orders o
    JOIN order_status_history h ON h.order_id = o.id
    WHERE o.store_id = ?
      AND o.status = 'cancelled'
      AND h.from_status IN ('preparing', 'ready')
      AND h.to_status = 'cancelled'
  `;
  const params: string[] = [storeId];
  if (startDate) {
    query += ` AND date(h.created_at, '+7 hours') >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND date(h.created_at, '+7 hours') <= ?`;
    params.push(endDate);
  }
  query += " ORDER BY h.created_at DESC, o.id DESC LIMIT 150";

  const rows = await db.prepare(query).bind(...params).all<{
    id: string;
    order_code: string;
    total_amount: number;
    item_count: number;
    cancel_reason: string;
    from_status: "preparing" | "ready";
    actor_email: string | null;
    cancelled_at: string;
  }>();

  return (rows.results ?? []).map((row) => {
    const separator = row.cancel_reason.indexOf(":");
    const reasonCode = separator >= 0 ? row.cancel_reason.slice(0, separator) : row.cancel_reason;
    const note = separator >= 0 ? row.cancel_reason.slice(separator + 1).trim() : null;
    return {
      orderId: row.id,
      orderCode: row.order_code,
      estimatedRetailValue: Number(row.total_amount),
      itemCount: Number(row.item_count),
      fromStatus: row.from_status,
      reasonCode,
      note,
      cancelledBy: row.actor_email,
      cancelledAt: row.cancelled_at,
    };
  });
}
