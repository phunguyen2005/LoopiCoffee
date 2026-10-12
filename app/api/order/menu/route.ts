import { ensureDatabase, STORE_ID } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async () => {
    const db = await ensureDatabase();

    const [settingsResult, storeResult, categoriesResult, itemsResult, optionsResult] = await db.batch([
      db.prepare(
        `SELECT is_ordering_open, announcement, opening_hours_notice FROM store_ordering_settings WHERE store_id = ? LIMIT 1`,
      ).bind(STORE_ID),
      db.prepare(
        `SELECT id, name, address FROM stores WHERE id = ? LIMIT 1`,
      ).bind(STORE_ID),
      db.prepare(
        `SELECT id, name, english_name, sort_order, is_active FROM menu_categories WHERE store_id = ? AND is_active = 1 ORDER BY sort_order ASC`,
      ).bind(STORE_ID),
      db.prepare(
        `SELECT id, category_id, name, english_name, description, base_price, image_url, badge, is_available, allows_size, allows_sugar, allows_ice, allows_toppings, sort_order
         FROM menu_items WHERE store_id = ? AND EXISTS (SELECT 1 FROM menu_categories c WHERE c.id = menu_items.category_id AND c.store_id = menu_items.store_id AND c.is_active = 1) ORDER BY sort_order ASC`,
      ).bind(STORE_ID),
      db.prepare(
        `SELECT id, group_type, name, price_modifier, is_default, is_available, sort_order
         FROM menu_options WHERE store_id = ? AND is_available = 1 ORDER BY sort_order ASC`,
      ).bind(STORE_ID),
    ]);

    const settings = settingsResult.results[0] as {
      is_ordering_open?: number;
      announcement?: string;
      opening_hours_notice?: string;
    } | undefined;

    const store = storeResult.results[0] as {
      id?: string;
      name?: string;
      address?: string;
    } | undefined;

    return Response.json({
      store: {
        id: store?.id ?? STORE_ID,
        name: store?.name ?? "La Boong - Trà Ô Long Làng La Boong",
        address: store?.address ?? "Chi nhánh Trung Tâm",
        isOrderingOpen: Boolean(settings?.is_ordering_open),
        announcement: settings?.announcement ?? "Chào mừng bạn đến với La Boong!",
        openingHoursNotice: settings?.opening_hours_notice ?? "08:00 - 22:30",
      },
      categories: categoriesResult.results ?? [],
      items: itemsResult.results ?? [],
      options: optionsResult.results ?? [],
    });
});
