import { ApplicationError } from "../../../platform/http/errors.ts";
import { integer, object, text } from "./input.ts";
import { auditStatement } from "../../../server/audit.ts";

export interface ImportMenuItemInput {
  name: string;
  englishName?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  basePrice: number;
  description?: string | null;
  badge?: string | null;
  imageUrl?: string | null;
  allowsSize?: boolean;
  allowsSugar?: boolean;
  allowsIce?: boolean;
  allowsToppings?: boolean;
  isAvailable?: boolean;
  sortOrder?: number;
}

export async function importMenuItems(
  db: D1Database,
  actor: { storeId: string; email: string; role: string; permissions?: readonly string[] },
  raw: unknown,
) {
  const body = object(raw);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ApplicationError("Danh sách món cần nhập không được rỗng.", 400, "empty_import_list");
  }
  if (body.items.length > 500) {
    throw new ApplicationError("Mỗi lần nhập tối đa 500 món để đảm bảo an toàn hệ thống.", 400, "import_limit_exceeded");
  }

  const createMissingCategories =
    body.createMissingCategories !== false && body.autoCreateCategories !== false;
  const fallbackCatId = typeof body.fallbackCategoryId === "string" && body.fallbackCategoryId.trim()
    ? text(body.fallbackCategoryId, 100, "danh mục mặc định", 1)
    : null;

  // 1. Fetch existing categories for store
  const existingCategories = await db
    .prepare("SELECT id, name FROM menu_categories WHERE store_id = ?")
    .bind(actor.storeId)
    .all<{ id: string; name: string }>();

  const categoryMap = new Map<string, string>(); // normalized name -> id
  const validCategoryIds = new Set<string>();

  for (const cat of existingCategories.results || []) {
    categoryMap.set(cat.name.trim().toLowerCase(), cat.id);
    validCategoryIds.add(cat.id);
  }

  if (fallbackCatId && !validCategoryIds.has(fallbackCatId)) {
    throw new ApplicationError("Danh mục mặc định không thuộc cửa hàng này.", 400, "invalid_fallback_category");
  }

  const now = new Date().toISOString();
  const createdCategoryNames: string[] = [];
  const categoryInsertStatements: D1PreparedStatement[] = [];

  // 2. Identify and create any missing categories if requested
  const itemsToProcess = body.items as Record<string, unknown>[];
  for (const it of itemsToProcess) {
    const rawCatName = typeof it.categoryName === "string" ? it.categoryName.trim() : "";
    const rawCatId = typeof it.categoryId === "string" ? it.categoryId.trim() : "";

    if (rawCatId && validCategoryIds.has(rawCatId)) {
      continue;
    }

    if (rawCatName) {
      const norm = rawCatName.toLowerCase();
      if (!categoryMap.has(norm)) {
        if (createMissingCategories) {
          const newId = crypto.randomUUID();
          categoryMap.set(norm, newId);
          validCategoryIds.add(newId);
          createdCategoryNames.push(rawCatName);
          categoryInsertStatements.push(
            db
              .prepare(
                "INSERT INTO menu_categories (id, store_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
              )
              .bind(newId, actor.storeId, rawCatName, now, now),
          );
        }
      }
    }
  }

  if (categoryInsertStatements.length > 0) {
    await db.batch(categoryInsertStatements);
  }

  // 3. Fallback category determination if some item still lacks category
  let defaultStoreCategoryId: string | null = fallbackCatId;
  if (!defaultStoreCategoryId && existingCategories.results?.length) {
    defaultStoreCategoryId = existingCategories.results[0].id;
  }
  if (!defaultStoreCategoryId && validCategoryIds.size > 0) {
    defaultStoreCategoryId = Array.from(validCategoryIds)[0];
  }

  // If store had 0 categories and none were created
  if (!defaultStoreCategoryId) {
    const defId = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO menu_categories (id, store_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(defId, actor.storeId, "Đồ uống", now, now)
      .run();
    defaultStoreCategoryId = defId;
    validCategoryIds.add(defId);
    categoryMap.set("do uong", defId);
    categoryMap.set("đồ uống", defId);
  }

  // 4. Fetch existing menu items to support updating existing items (Upsert)
  const existingItemsResult = await db
    .prepare("SELECT id, name, category_id, base_price FROM menu_items WHERE store_id = ?")
    .bind(actor.storeId)
    .all<{ id: string; name: string; category_id: string; base_price: number }>();

  const existingItemMap = new Map<string, { id: string; name: string; category_id: string; base_price: number }>();
  for (const it of existingItemsResult.results || []) {
    existingItemMap.set(it.name.trim().toLowerCase(), it);
  }

  // 5. Validate and construct insert or update statements for menu items
  const itemMutationStatements: D1PreparedStatement[] = [];
  const processedItems: Array<{ id: string; name: string; basePrice: number; categoryId: string; isUpdated: boolean }> = [];
  let createdItemsCount = 0;
  let updatedItemsCount = 0;

  for (let idx = 0; idx < itemsToProcess.length; idx++) {
    const item = itemsToProcess[idx];
    const name = text(item.name, 100, `tên món (dòng ${idx + 1})`, 1);
    const basePrice = integer(item.basePrice, 0, 100000000, `giá món ${name}`);

    // Determine category
    let finalCategoryId: string | null = null;
    const itemCatId = typeof item.categoryId === "string" ? item.categoryId.trim() : "";
    const itemCatName = typeof item.categoryName === "string" ? item.categoryName.trim().toLowerCase() : "";

    if (itemCatId && validCategoryIds.has(itemCatId)) {
      finalCategoryId = itemCatId;
    } else if (itemCatName && categoryMap.has(itemCatName)) {
      finalCategoryId = categoryMap.get(itemCatName)!;
    } else if (defaultStoreCategoryId) {
      finalCategoryId = defaultStoreCategoryId;
    } else {
      throw new ApplicationError(`Món "${name}" không thể xác định danh mục.`, 400, "missing_category");
    }

    const englishName = typeof item.englishName === "string" && item.englishName.trim()
      ? text(item.englishName, 100, "tên tiếng Anh")
      : null;
    const description = typeof item.description === "string" && item.description.trim()
      ? text(item.description, 1000, "mô tả")
      : null;
    const badge = typeof item.badge === "string" && item.badge.trim()
      ? text(item.badge, 50, "nhãn")
      : null;
    const imageUrl = typeof item.imageUrl === "string" && item.imageUrl.trim()
      ? text(item.imageUrl, 2048, "ảnh")
      : "/laboong/drinks/default.jpg";
    const isAvailable = item.isAvailable === false || item.isAvailable === 0 ? 0 : 1;
    const allowsSize = item.allowsSize === false || item.allowsSize === 0 ? 0 : 1;
    const allowsSugar = item.allowsSugar === false || item.allowsSugar === 0 ? 0 : 1;
    const allowsIce = item.allowsIce === false || item.allowsIce === 0 ? 0 : 1;
    const allowsToppings = item.allowsToppings === false || item.allowsToppings === 0 ? 0 : 1;
    const sortOrder = typeof item.sortOrder === "number" && !isNaN(item.sortOrder)
      ? integer(item.sortOrder, 0, 100000, "thứ tự")
      : idx;

    const normName = name.trim().toLowerCase();
    const existing = existingItemMap.get(normName);

    if (existing) {
      // Update existing item (especially price and metadata)
      itemMutationStatements.push(
        db
          .prepare(
            `UPDATE menu_items SET
              category_id = ?,
              base_price = ?,
              english_name = COALESCE(?, english_name),
              description = COALESCE(?, description),
              badge = COALESCE(?, badge),
              allows_size = ?,
              allows_sugar = ?,
              allows_ice = ?,
              allows_toppings = ?,
              is_available = ?,
              updated_at = ?
            WHERE id = ? AND store_id = ?`,
          )
          .bind(
            finalCategoryId,
            basePrice,
            englishName,
            description,
            badge,
            allowsSize,
            allowsSugar,
            allowsIce,
            allowsToppings,
            isAvailable,
            now,
            existing.id,
            actor.storeId,
          ),
      );
      updatedItemsCount++;
      processedItems.push({ id: existing.id, name, basePrice, categoryId: finalCategoryId, isUpdated: true });
    } else {
      // Insert new item
      const id = crypto.randomUUID();
      itemMutationStatements.push(
        db
          .prepare(
            `INSERT INTO menu_items (
              id, store_id, category_id, name, english_name, description, base_price,
              image_url, badge, is_available, allows_size, allows_sugar, allows_ice,
              allows_toppings, sort_order, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            actor.storeId,
            finalCategoryId,
            name,
            englishName,
            description,
            basePrice,
            imageUrl,
            badge,
            isAvailable,
            allowsSize,
            allowsSugar,
            allowsIce,
            allowsToppings,
            sortOrder,
            now,
            now,
          ),
      );
      createdItemsCount++;
      processedItems.push({ id, name, basePrice, categoryId: finalCategoryId, isUpdated: false });
    }
  }

  // Chunk D1 batch in chunks of 50 to avoid D1 limits
  const CHUNK_SIZE = 50;
  for (let i = 0; i < itemMutationStatements.length; i += CHUNK_SIZE) {
    const chunk = itemMutationStatements.slice(i, i + CHUNK_SIZE);
    await db.batch(chunk);
  }

  // Audit statement
  await auditStatement(
    db,
    actor.email,
    "menu_item",
    "batch_import",
    "menu.imported",
    {
      importedCount: processedItems.length,
      createdCount: createdItemsCount,
      updatedCount: updatedItemsCount,
      createdCategoriesCount: createdCategoryNames.length,
      createdCategoryNames,
    },
    now,
    false,
    crypto.randomUUID(),
    actor.storeId,
  ).run();

  return {
    success: true,
    createdItems: createdItemsCount,
    updatedItems: updatedItemsCount,
    importedCount: processedItems.length,
    createdCategories: createdCategoryNames.length,
    createdCategoryNames,
    items: processedItems,
  };
}
