import { ensureDatabase } from "@/db/runtime";
import { requireApiPermission } from "@/server/auth";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { integer, readOrderBody, text } from "@/modules/ordering/application/input";
import { auditStatement } from "@/server/audit";

export const dynamic = "force-dynamic";
const fields = {
  name: "name", englishName: "english_name", categoryId: "category_id", description: "description", basePrice: "base_price",
  imageUrl: "image_url", badge: "badge", isAvailable: "is_available", allowsSize: "allows_size", allowsSugar: "allows_sugar",
  allowsIce: "allows_ice", allowsToppings: "allows_toppings", sortOrder: "sort_order",
} as const;

async function parseItem(db: D1Database, storeId: string, body: Record<string, unknown>, create = false) {
  const values: Record<string, string | number | null> = {};
  for (const [field, column] of Object.entries(fields)) {
    let value = body[field];
    if (value === undefined && create) {
      if (["isAvailable", "allowsSize", "allowsSugar", "allowsIce", "allowsToppings"].includes(field)) value = true;
      else if (field === "sortOrder") value = 0;
      else if (field === "imageUrl") value = "/laboong/drinks/default.jpg";
      else if (!["name", "categoryId", "basePrice"].includes(field)) value = null;
    }
    if (value === undefined && !create) continue;
    if (field === "basePrice" || field === "sortOrder") values[column] = integer(value, 0, field === "basePrice" ? 100000000 : 100000, field);
    else if (["isAvailable", "allowsSize", "allowsSugar", "allowsIce", "allowsToppings"].includes(field)) {
      if (typeof value !== "boolean") throw new ApplicationError(`${field} không hợp lệ.`);
      values[column] = value ? 1 : 0;
    } else {
      const required = ["name", "categoryId", "imageUrl"].includes(field);
      const parsed = text(value, field === "imageUrl" ? 2048 : field === "description" ? 1000 : 100, field, required ? 1 : 0);
      if (field === "imageUrl" && !/^\/(?!\/)/.test(parsed) && !/^https:\/\//.test(parsed)) throw new ApplicationError("Ảnh cần đường dẫn nội bộ hoặc HTTPS.");
      values[column] = parsed || null;
    }
  }
  if (values.category_id) {
    const category = await db.prepare("SELECT id FROM menu_categories WHERE id = ? AND store_id = ?").bind(values.category_id, storeId).first();
    if (!category) throw new ApplicationError("Danh mục không thuộc cửa hàng.", 400, "invalid_category");
  }
  if (!Object.keys(values).length) throw new ApplicationError("Chưa có nội dung cần cập nhật.");
  return values;
}

export const GET = apiHandler(async () => {
  const auth = await requireApiPermission("menu.manage");
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const [categories, items, options] = await db.batch([
    db.prepare("SELECT id, name, english_name, sort_order, is_active FROM menu_categories WHERE store_id = ? ORDER BY sort_order").bind(auth.actor.storeId),
    db.prepare("SELECT * FROM menu_items WHERE store_id = ? ORDER BY sort_order").bind(auth.actor.storeId),
    db.prepare("SELECT id, store_id, group_type, name, price_modifier, is_default, is_available, sort_order, updated_at FROM menu_options WHERE store_id = ? ORDER BY sort_order ASC").bind(auth.actor.storeId),
  ]);
  return Response.json({
    categories: categories.results,
    items: items.results,
    options: options.results,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("menu.manage");
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const body = await readOrderBody(request);

  // Dedicated handling for menu option (e.g. Topping)
  if (body.type === "option" || body.groupType === "topping") {
    const name = text(body.name, 100, "tên topping", 1);
    const price = integer(body.priceModifier ?? body.price ?? 0, 0, 100000000, "giá topping");
    const id = `opt-top-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        `INSERT INTO menu_options (id, store_id, group_type, name, price_modifier, is_default, is_available, sort_order, created_at, updated_at)
         VALUES (?, ?, 'topping', ?, ?, 0, 1, 0, ?, ?)`
      ).bind(id, auth.actor.storeId, name, price, now, now),
      auditStatement(db, auth.actor.email, "menu_option", id, "menu.option_created", { name, price }, now),
    ]);
    return Response.json({ success: true, option: { id, name, price_modifier: price, is_available: 1 } }, { status: 201 });
  }

  const values = await parseItem(db, auth.actor.storeId, body, true);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const columns = Object.keys(values);
  await db.batch([
    db.prepare(`INSERT INTO menu_items (id, store_id, ${columns.join(",")}, created_at, updated_at) VALUES (?, ?, ${columns.map(() => "?").join(",")}, ?, ?)`)
      .bind(id, auth.actor.storeId, ...Object.values(values), now, now),
    auditStatement(db, auth.actor.email, "menu_item", id, "menu.created", {}, now),
  ]);
  return Response.json({ success: true, item: { id, ...values } }, { status: 201 });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("menu.manage");
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const body = await readOrderBody(request);

  // Dedicated handling for updating menu option (e.g. Topping stock or price)
  if (body.optionId) {
    const optionId = text(body.optionId, 100, "mã tuỳ chọn", 1);
    const now = new Date().toISOString();
    const updates: string[] = [];
    const bindings: unknown[] = [];
    if (body.name !== undefined) {
      updates.push("name = ?");
      bindings.push(text(body.name, 100, "tên tuỳ chọn", 1));
    }
    if (body.priceModifier !== undefined || body.price !== undefined) {
      updates.push("price_modifier = ?");
      bindings.push(integer(body.priceModifier ?? body.price, 0, 100000000, "giá"));
    }
    if (body.isAvailable !== undefined) {
      updates.push("is_available = ?");
      bindings.push(body.isAvailable ? 1 : 0);
    }
    if (updates.length === 0) {
      throw new ApplicationError("Chưa có thông tin tuỳ chọn cần cập nhật.");
    }
    updates.push("updated_at = ?");
    bindings.push(now);
    bindings.push(optionId);
    bindings.push(auth.actor.storeId);
    const writes = await db.batch([
      db.prepare(`UPDATE menu_options SET ${updates.join(", ")} WHERE id = ? AND store_id = ?`).bind(...bindings),
      auditStatement(db, auth.actor.email, "menu_option", optionId, "menu.option_updated", {}, now, true),
    ]);
    if (!writes[0].meta.changes) {
      throw new ApplicationError("Không tìm thấy tuỳ chọn.", 404);
    }
    return Response.json({ success: true, optionId, updatedAt: now });
  }

  const id = text(body.itemId ?? body.id, 100, "mã món", 1);
  const expectedUpdatedAt = body.expectedUpdatedAt === undefined
    ? null
    : text(body.expectedUpdatedAt, 100, "phiên bản món", 1);
  const values = await parseItem(db, auth.actor.storeId, body);
  const now = new Date().toISOString();
  const writes = await db.batch([
    db.prepare(`UPDATE menu_items SET ${Object.keys(values).map(column => `${column} = ?`).join(",")}, updated_at = ? WHERE id = ? AND store_id = ?${expectedUpdatedAt ? " AND updated_at = ?" : ""}`)
      .bind(...Object.values(values), now, id, auth.actor.storeId, ...(expectedUpdatedAt ? [expectedUpdatedAt] : [])),
    auditStatement(db, auth.actor.email, "menu_item", id, "menu.updated", { fields: Object.keys(values) }, now, true),
  ]);
  if (!writes[0].meta.changes) {
    if (expectedUpdatedAt) throw new ApplicationError("Món vừa được người khác cập nhật. Danh sách sẽ được tải lại.", 409, "menu_conflict");
    throw new ApplicationError("Không tìm thấy món.", 404);
  }
  return Response.json({ success: true, itemId: id, updatedAt: now });
});

export const DELETE = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("menu.manage");
  if (!auth.actor) return auth.response;
  const search = new URL(request.url).searchParams;
  const body = search.get("id") || search.get("itemId") || search.get("optionId") ? {} : await readOrderBody(request);

  // Dedicated handling for deleting a menu option (e.g. Topping)
  const optId = search.get("optionId") || body.optionId;
  if (optId) {
    const id = text(optId, 100, "mã tuỳ chọn", 1);
    const db = await ensureDatabase();
    const writes = await db.batch([
      db.prepare("DELETE FROM menu_options WHERE id = ? AND store_id = ?").bind(id, auth.actor.storeId),
      auditStatement(db, auth.actor.email, "menu_option", id, "menu.option_deleted", {}, new Date().toISOString(), true),
    ]);
    if (!writes[0].meta.changes) throw new ApplicationError("Không tìm thấy tuỳ chọn.", 404);
    return Response.json({ success: true, deletedOptionId: id });
  }

  const id = text(search.get("id") || search.get("itemId") || body.itemId || body.id, 100, "mã món", 1);
  const db = await ensureDatabase();
  const writes = await db.batch([
    db.prepare("DELETE FROM menu_items WHERE id = ? AND store_id = ?").bind(id, auth.actor.storeId),
    auditStatement(db, auth.actor.email, "menu_item", id, "menu.deleted", {}, new Date().toISOString(), true),
  ]);
  if (!writes[0].meta.changes) throw new ApplicationError("Không tìm thấy món.", 404);
  return Response.json({ success: true, deletedId: id });
});
