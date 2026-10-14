import { auditStatement } from "../../../server/audit.ts";

export interface AnonymizeOrdersResult {
  anonymizedCount: number;
  batchSize: number;
  cutoff: string;
}

export const ANONYMIZED_PLACEHOLDER = "[ANONYMIZED]";

export async function anonymizeExpiredOrders(
  db: D1Database,
  now: string = new Date().toISOString(),
  batchSize = 100,
): Promise<AnonymizeOrdersResult> {
  const cutoff = new Date(Date.parse(now) - 180 * 24 * 60 * 60 * 1000).toISOString();

  // Find orders older than 180 days that still contain customer PII
  const expiredOrders = await db.prepare(
    `SELECT id, store_id, order_code
     FROM customer_orders
     WHERE created_at <= ?
       AND (customer_name <> ? OR customer_phone <> ? OR customer_note IS NOT NULL)
     ORDER BY created_at ASC
     LIMIT ?`,
  ).bind(cutoff, ANONYMIZED_PLACEHOLDER, ANONYMIZED_PLACEHOLDER, batchSize).all<{ id: string; store_id: string; order_code: string }>();

  const rows = expiredOrders.results ?? [];
  if (rows.length === 0) {
    return { anonymizedCount: 0, batchSize, cutoff };
  }

  const statements = [];
  for (const order of rows) {
    statements.push(
      db.prepare(
        `UPDATE customer_orders
         SET customer_name = ?,
             customer_phone = ?,
             customer_note = NULL,
             updated_at = ?
         WHERE id = ?`,
      ).bind(ANONYMIZED_PLACEHOLDER, ANONYMIZED_PLACEHOLDER, now, order.id),
      auditStatement(
        db,
        "system.retention",
        "customer_order",
        order.id,
        "order.anonymized",
        { orderCode: order.order_code, storeId: order.store_id },
        now,
      ),
    );
  }

  await db.batch(statements);

  return {
    anonymizedCount: rows.length,
    batchSize,
    cutoff,
  };
}
