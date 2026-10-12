import { ApplicationError } from "../../../platform/http/errors.ts";
import { hash, receiptToken } from "./input.ts";

export async function trackOrder(db: D1Database, storeId: string, token: string | null) {
  const digest = await hash(receiptToken(token));
  const row = await db.prepare(
    `SELECT id, order_code, customer_name, customer_phone, customer_note, total_amount, item_count, status, cancel_reason, created_at, updated_at
     FROM customer_orders WHERE store_id = ? AND receipt_token_hash = ?`,
  ).bind(storeId, digest).first<{
    id: string; order_code: string; customer_name: string; customer_phone: string; customer_note: string | null;
    total_amount: number; item_count: number; status: string; cancel_reason: string | null; created_at: string; updated_at: string;
  }>();
  if (!row) throw new ApplicationError("Không tìm thấy đơn hàng qua liên kết này.", 404, "receipt_not_found");
  const [items, history] = await db.batch([
    db.prepare("SELECT item_name AS name, unit_price AS unitPrice, quantity, subtotal, size_label AS size, sugar_level AS sugar, ice_level AS ice, toppings_json, item_note AS note FROM order_items WHERE order_id = ? ORDER BY id").bind(row.id),
    db.prepare("SELECT from_status, to_status, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at, id").bind(row.id),
  ]);
  return {
    order: { id: row.id, orderCode: row.order_code, customerName: row.customer_name, customerPhone: row.customer_phone,
      customerNote: row.customer_note, totalAmount: row.total_amount, itemCount: row.item_count, status: row.status,
      cancelReason: row.cancel_reason, createdAt: row.created_at, updatedAt: row.updated_at },
    items: (items.results as Record<string, unknown>[]).map(item => {
      const { toppings_json, ...rest } = item;
      let toppings: unknown = [];
      try { toppings = JSON.parse(String(toppings_json || "[]")); } catch { /* Legacy malformed snapshots have no toppings. */ }
      return { ...rest, toppings };
    }),
    history: history.results,
  };
}
