import { ApplicationError } from "../../../platform/http/errors.ts";
import { hash, integer, object, receiptToken, text } from "./input.ts";

type OrderRow = {
  id: string; order_code: string; customer_name: string; customer_phone: string;
  total_amount: number; item_count: number; status: string; created_at: string;
  submission_hash: string; receipt_token_hash: string;
};
type MenuItem = {
  id: string; name: string; base_price: number; is_available: number; is_active: number;
  allows_size: number; allows_sugar: number; allows_ice: number; allows_toppings: number; updated_at: string;
};
type Option = { id: string; name: string; group_type: string; price_modifier: number; is_available: number; updated_at: string };

function result(row: OrderRow, replayed: boolean) {
  return { success: true, replayed, order: {
    id: row.id, orderCode: row.order_code, customerName: row.customer_name, customerPhone: row.customer_phone,
    totalAmount: row.total_amount, itemCount: row.item_count, status: row.status, createdAt: row.created_at,
  } };
}

export async function createOrder(db: D1Database, storeId: string, raw: unknown, key: string | null, token: string | null) {
  const body = object(raw);
  if (!key || !/^[a-f0-9-]{36}$/i.test(key)) throw new ApplicationError("Thiếu mã gửi đơn hợp lệ.");
  const credentialHash = await hash(receiptToken(token));
  const customerName = text(body.customerName, 100, "họ tên", 2);
  const customerPhone = text(body.customerPhone, 24, "số điện thoại", 1).replace(/[\s.-]/g, "");
  if (!/^(0[35789])[0-9]{8}$/.test(customerPhone)) throw new ApplicationError("Số điện thoại phải là số di động Việt Nam 10 chữ số.");
  const customerNote = text(body.customerNote, 500, "ghi chú");
  const expectedTotal = integer(body.expectedTotal, 0, 50000000, "Tổng tiền đã xác nhận");
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30) throw new ApplicationError("Đơn hàng cần từ 1 đến 30 dòng món.");
  const items = body.items.map(value => {
    const item = object(value);
    const ids = item.toppingIds ?? [];
    if (!Array.isArray(ids) || ids.length > 10) throw new ApplicationError("Tối đa 10 topping mỗi món.");
    const toppingIds = ids.map(id => text(id, 100, "topping", 1)).sort();
    if (new Set(toppingIds).size !== toppingIds.length) throw new ApplicationError("Topping không được trùng nhau.");
    return {
      itemId: text(item.itemId, 100, "món", 1), quantity: integer(item.quantity, 1, 20, "Số lượng"),
      sizeId: text(item.sizeId, 100, "size"), sugarId: text(item.sugarId, 100, "đường"), iceId: text(item.iceId, 100, "đá"),
      toppingIds, note: text(item.note, 300, "ghi chú món"),
    };
  });
  const payloadHash = await hash(JSON.stringify({ customerName, customerPhone, customerNote, expectedTotal, items }));
  const replay = async () => {
    const prior = await db.prepare("SELECT * FROM customer_orders WHERE store_id = ? AND submission_key = ?").bind(storeId, key).first<OrderRow>();
    if (!prior) return null;
    if (prior.submission_hash !== payloadHash || prior.receipt_token_hash !== credentialHash) {
      throw new ApplicationError("Mã gửi này đã dùng cho nội dung khác. Hãy kiểm tra đơn trước đó.", 409, "idempotency_conflict");
    }
    return result(prior, true);
  };
  const prior = await replay();
  if (prior) return prior;

  const settings = await db.prepare("SELECT is_ordering_open FROM store_ordering_settings WHERE store_id = ?").bind(storeId).first<{ is_ordering_open: number }>();
  if (!settings?.is_ordering_open) throw new ApplicationError("Cửa hàng đang tạm ngưng nhận đơn.", 409, "ordering_closed");
  const itemIds = [...new Set(items.map(item => item.itemId))];
  const itemRows = await db.prepare(
    `SELECT m.*, c.is_active FROM menu_items m JOIN menu_categories c ON c.id = m.category_id AND c.store_id = m.store_id
     WHERE m.store_id = ? AND m.id IN (${itemIds.map(() => "?").join(",")})`,
  ).bind(storeId, ...itemIds).all<MenuItem>();
  const optionRows = await db.prepare("SELECT id, name, group_type, price_modifier, is_available, updated_at FROM menu_options WHERE store_id = ?").bind(storeId).all<Option>();
  const menu = new Map(itemRows.results.map(item => [item.id, item]));
  const options = new Map(optionRows.results.map(option => [option.id, option]));
  const usedOptions = new Map<string, Option>();
  const lines = items.map(item => {
    const found = menu.get(item.itemId);
    if (!found || !found.is_available || !found.is_active) throw new ApplicationError("Một món đã hết hàng hoặc không còn trong thực đơn. Vui lòng tải lại thực đơn.", 409, "item_unavailable");
    const select = (id: string, group: string, allowed: number) => {
      if (!id) return null;
      const option = options.get(id);
      if (!allowed || !option || option.group_type !== group || !option.is_available) throw new ApplicationError("Tùy chọn món không còn hợp lệ. Vui lòng chọn lại.", 409, "option_unavailable");
      usedOptions.set(id, option);
      return option;
    };
    const size = select(item.sizeId, "size", found.allows_size);
    const sugar = select(item.sugarId, "sugar", found.allows_sugar);
    const ice = select(item.iceId, "ice", found.allows_ice);
    const toppings = item.toppingIds.map(id => select(id, "topping", found.allows_toppings)!);
    const unitPrice = found.base_price + [size, sugar, ice, ...toppings].reduce((sum, option) => sum + (option?.price_modifier ?? 0), 0);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new ApplicationError("Giá món không hợp lệ. Vui lòng liên hệ quán.", 409);
    return {
      ...item, name: found.name, unitPrice, subtotal: unitPrice * item.quantity,
      size: size?.name ?? null, sugar: sugar?.name ?? null, ice: ice?.name ?? null,
      toppings: toppings.map(option => ({ name: option.name, price: option.price_modifier })),
    };
  });
  const total = lines.reduce((sum, item) => sum + item.subtotal, 0);
  if (!Number.isSafeInteger(total) || total > 50000000) throw new ApplicationError("Giá trị đơn hàng quá lớn.");
  if (expectedTotal !== total) {
    throw new ApplicationError(
      "Giá trong giỏ vừa thay đổi. Vui lòng xác nhận tổng tiền mới trước khi gửi đơn.",
      409,
      "price_changed",
      { expectedTotal, currentTotal: total },
    );
  }
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  // Revalidate menu versions within the write transaction after competing edits.
  const itemVersions = JSON.stringify([...menu.values()].map(item => ({ id: item.id, version: item.updated_at })));
  const optionVersions = JSON.stringify([...usedOptions.values()].map(option => ({ id: option.id, version: option.updated_at })));
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const orderCode = `LB-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  try {
    const writes = await db.batch([
      db.prepare(
        `INSERT INTO customer_orders (id, order_code, store_id, customer_name, customer_phone, customer_note,
         total_amount, item_count, status, created_at, updated_at, receipt_token_hash, submission_key, submission_hash)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM store_ordering_settings WHERE store_id = ? AND is_ordering_open = 1)
         AND NOT EXISTS (SELECT 1 FROM json_each(?) v
           LEFT JOIN menu_items m ON m.id = json_extract(v.value, '$.id') AND m.store_id = ?
           LEFT JOIN menu_categories c ON c.id = m.category_id AND c.store_id = m.store_id
           WHERE m.id IS NULL OR m.is_available != 1 OR c.is_active IS NOT 1 OR m.updated_at != json_extract(v.value, '$.version'))
         AND NOT EXISTS (SELECT 1 FROM json_each(?) v
           LEFT JOIN menu_options o ON o.id = json_extract(v.value, '$.id') AND o.store_id = ?
           WHERE o.id IS NULL OR o.is_available != 1 OR o.updated_at != json_extract(v.value, '$.version'))`,
      ).bind(id, orderCode, storeId, customerName, customerPhone, customerNote || null, total, count, now, now, credentialHash, key, payloadHash, storeId, itemVersions, storeId, optionVersions, storeId),
      ...lines.map(item => db.prepare(
        `INSERT INTO order_items (id, order_id, item_id, item_name, unit_price, quantity, subtotal, size_label, sugar_level, ice_level, toppings_json, item_note, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM customer_orders WHERE id = ?)`,
      ).bind(crypto.randomUUID(), id, item.itemId, item.name, item.unitPrice, item.quantity, item.subtotal, item.size, item.sugar, item.ice, JSON.stringify(item.toppings), item.note || null, now, id)),
      db.prepare(
        `INSERT INTO order_status_history (id, order_id, from_status, to_status, actor_type, note, created_at)
         SELECT ?, ?, NULL, 'pending', 'customer', 'Khách hàng đã đặt đơn', ? WHERE EXISTS (SELECT 1 FROM customer_orders WHERE id = ?)`,
      ).bind(crypto.randomUUID(), id, now, id),
    ]);
    if (!writes[0].meta.changes) throw new ApplicationError("Thực đơn hoặc trạng thái nhận đơn vừa thay đổi. Vui lòng tải lại.", 409, "menu_changed");
  } catch (error) {
    const recovered = await replay();
    if (recovered) return recovered;
    throw error;
  }
  return result({ id, order_code: orderCode, customer_name: customerName, customer_phone: customerPhone, total_amount: total,
    item_count: count, status: "pending", created_at: now, submission_hash: payloadHash, receipt_token_hash: credentialHash }, false);
}
