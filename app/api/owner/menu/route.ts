import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { integer, readOrderBody, text } from "@/modules/ordering/application/input";
import { auditStatement } from "@/server/audit";

export const dynamic = "force-dynamic";
const roles = ["owner", "manager"] as const;
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
  const auth = await requireApiUser([...roles]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const [categories, items] = await db.batch([
    db.prepare("SELECT id, name, english_name, sort_order, is_active FROM menu_categories WHERE store_id = ? ORDER BY sort_order").bind(auth.actor.storeId),
    db.prepare("SELECT * FROM menu_items WHERE store_id = ? ORDER BY sort_order").bind(auth.actor.storeId),
  ]);
  return Response.json({ categories: categories.results, items: items.results }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser([...roles]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const values = await parseItem(db, auth.actor.storeId, await readOrderBody(request), true);
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
  const auth = await requireApiUser([...roles]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const body = await readOrderBody(request);
  const id = text(body.itemId ?? body.id, 100, "mã món", 1);
  const values = await parseItem(db, auth.actor.storeId, body);
  const now = new Date().toISOString();
  const writes = await db.batch([
    db.prepare(`UPDATE menu_items SET ${Object.keys(values).map(column => `${column} = ?`).join(",")}, updated_at = ? WHERE id = ? AND store_id = ?`)
      .bind(...Object.values(values), now, id, auth.actor.storeId),
    auditStatement(db, auth.actor.email, "menu_item", id, "menu.updated", { fields: Object.keys(values) }, now, true),
  ]);
  if (!writes[0].meta.changes) throw new ApplicationError("Không tìm thấy món.", 404);
  return Response.json({ success: true, itemId: id, updatedAt: now });
});

export const DELETE = apiHandler(async (request: Request) => {
  const auth = await requireApiUser([...roles]);
  if (!auth.actor) return auth.response;
  const search = new URL(request.url).searchParams;
  const body = search.get("id") || search.get("itemId") ? {} : await readOrderBody(request);
  const id = text(search.get("id") || search.get("itemId") || body.itemId || body.id, 100, "mã món", 1);
  const db = await ensureDatabase();
  const writes = await db.batch([
    db.prepare("DELETE FROM menu_items WHERE id = ? AND store_id = ?").bind(id, auth.actor.storeId),
    auditStatement(db, auth.actor.email, "menu_item", id, "menu.deleted", {}, new Date().toISOString(), true),
  ]);
  if (!writes[0].meta.changes) throw new ApplicationError("Không tìm thấy món.", 404);
  return Response.json({ success: true, deletedId: id });
});
