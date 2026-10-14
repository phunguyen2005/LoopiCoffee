import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { type NextRequest } from "next/server";
import { apiHandler, ApplicationError } from "@/platform/http/errors";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async (request: NextRequest) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status")?.trim().toLowerCase();
    const search = searchParams.get("q")?.trim();
    const dateFilter = searchParams.get("date")?.trim();
    const startDate = searchParams.get("startDate")?.trim() || searchParams.get("from")?.trim();
    const endDate = searchParams.get("endDate")?.trim() || searchParams.get("to")?.trim();

    if (search && search.length > 100) throw new ApplicationError("Nội dung tìm kiếm quá dài.");
    for (const date of [dateFilter, startDate, endDate]) {
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)))) throw new ApplicationError("Ngày không hợp lệ.");
    }
    const db = await ensureDatabase();

    // Date filtering clause
    let dateCondition = "";
    const dateParams: string[] = [];
    if (dateFilter) {
      dateCondition = ` AND date(created_at, '+7 hours') = ?`;
      dateParams.push(dateFilter);
    } else {
      if (startDate) {
        dateCondition += ` AND date(created_at, '+7 hours') >= ?`;
        dateParams.push(startDate);
      }
      if (endDate) {
        dateCondition += ` AND date(created_at, '+7 hours') <= ?`;
        dateParams.push(endDate);
      }
    }

    // Query status counts (scoped by date if date filter active)
    let countsQuery = `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) AS preparing,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM customer_orders WHERE store_id = ?`;
    const countsParams: (string | number)[] = [auth.actor.storeId];

    if (dateCondition) {
      countsQuery += dateCondition;
      countsParams.push(...dateParams);
    }

    const countsResult = await db
      .prepare(countsQuery)
      .bind(...countsParams)
      .first<{
        total: number;
        pending: number;
        accepted: number;
        preparing: number;
        ready: number;
        completed: number;
        cancelled: number;
      }>();

    // Build main query
    let query = `SELECT id, order_code, customer_name, customer_phone, customer_note, total_amount, item_count, status, cancel_reason, created_at, updated_at
                 FROM customer_orders WHERE store_id = ?`;
    const params: (string | number)[] = [auth.actor.storeId];

    if (statusFilter && statusFilter !== "all") {
      query += ` AND status = ?`;
      params.push(statusFilter);
    }

    if (search) {
      query += ` AND (upper(order_code) LIKE upper(?) OR customer_name LIKE ? OR customer_phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (dateCondition) {
      query += dateCondition;
      params.push(...dateParams);
    }

    const pageParam = parseInt(searchParams.get("page") || "1", 10);
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    const limitParam = parseInt(searchParams.get("limit") || "150", 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 150) : 150;
    const offset = (page - 1) * limit;

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const ordersResult = await db.prepare(query).bind(...params).all<{
      id: string;
      order_code: string;
      customer_name: string;
      customer_phone: string;
      customer_note: string | null;
      total_amount: number;
      item_count: number;
      status: string;
      cancel_reason: string | null;
      created_at: string;
      updated_at: string;
    }>();

    const orders = ordersResult.results ?? [];

    // Fetch items for these orders
    const orderItemsMap = new Map<string, Array<Record<string, unknown>>>();

    if (orders.length > 0) {
      const orderIds = orders.map((o) => o.id);
      const allItemsResult = await db
        .prepare(
          `SELECT id, order_id, item_id, item_name, unit_price, quantity, subtotal, size_label, sugar_level, ice_level, toppings_json, item_note
           FROM order_items WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY id ASC`,
        )
        .bind(JSON.stringify(orderIds))
        .all<{
          id: string;
          order_id: string;
          item_id: string | null;
          item_name: string;
          unit_price: number;
          quantity: number;
          subtotal: number;
          size_label: string | null;
          sugar_level: string | null;
          ice_level: string | null;
          toppings_json: string | null;
          item_note: string | null;
        }>();

      for (const it of allItemsResult.results ?? []) {
        let toppings: Array<{ name: string; price: number }> = [];
        try {
          if (it.toppings_json) toppings = JSON.parse(it.toppings_json);
        } catch {
          toppings = [];
        }
        const itemObj = {
          id: it.id,
          name: it.item_name,
          unitPrice: it.unit_price,
          quantity: it.quantity,
          subtotal: it.subtotal,
          size: it.size_label,
          sugar: it.sugar_level,
          ice: it.ice_level,
          toppings,
          note: it.item_note,
        };
        const list = orderItemsMap.get(it.order_id) ?? [];
        list.push(itemObj);
        orderItemsMap.set(it.order_id, list);
      }
    }

    // Store settings
    const settings = await db
      .prepare(
        `SELECT is_ordering_open, announcement FROM store_ordering_settings WHERE store_id = ? LIMIT 1`,
      )
      .bind(auth.actor.storeId)
      .first<{ is_ordering_open: number; announcement: string | null }>();

    const enrichedOrders = orders.map((o) => ({
      id: o.id,
      orderCode: o.order_code,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      customerNote: o.customer_note,
      totalAmount: o.total_amount,
      itemCount: o.item_count,
      status: o.status,
      cancelReason: o.cancel_reason,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
      items: orderItemsMap.get(o.id) ?? [],
    }));

    const { getSpoilageMetrics } = await import("@/modules/ordering/application/change-status");
    const spoilage = await getSpoilageMetrics(db, auth.actor.storeId, startDate || dateFilter, endDate || dateFilter);

    return Response.json({
      orders: enrichedOrders,
      counts: {
        total: Number(countsResult?.total || 0),
        pending: Number(countsResult?.pending || 0),
        accepted: Number(countsResult?.accepted || 0),
        preparing: Number(countsResult?.preparing || 0),
        ready: Number(countsResult?.ready || 0),
        completed: Number(countsResult?.completed || 0),
        cancelled: Number(countsResult?.cancelled || 0),
      },
      spoilage,
      pagination: {
        page,
        limit,
        total: Number(countsResult?.total || 0),
      },
      isOrderingOpen: Boolean(settings?.is_ordering_open),
    });
});
