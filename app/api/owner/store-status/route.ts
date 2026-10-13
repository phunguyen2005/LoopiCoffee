import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { readOrderBody, text } from "@/modules/ordering/application/input";
import { auditStatement } from "@/server/audit";

export const dynamic = "force-dynamic";
export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const settings = await db.prepare("SELECT is_ordering_open, announcement, opening_hours_notice FROM store_ordering_settings WHERE store_id = ?")
    .bind(auth.actor.storeId).first<{ is_ordering_open: number; announcement: string | null; opening_hours_notice: string | null }>();
  return Response.json({ isOrderingOpen: Boolean(settings?.is_ordering_open), announcement: settings?.announcement ?? "", openingHoursNotice: settings?.opening_hours_notice ?? "08:00 - 22:30" }, { headers: { "Cache-Control": "private, no-store" } });
});
export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const body = await readOrderBody(request);
  if (body.isOrderingOpen !== undefined && typeof body.isOrderingOpen !== "boolean") throw new ApplicationError("Trạng thái quán không hợp lệ.");
  const open = body.isOrderingOpen === undefined ? null : body.isOrderingOpen ? 1 : 0;
  const announcement = body.announcement === undefined ? null : text(body.announcement, 500, "thông báo");
  const hours = body.openingHoursNotice === undefined ? null : text(body.openingHoursNotice, 100, "giờ mở cửa");
  if (open === null && announcement === null && hours === null) throw new ApplicationError("Chưa có thay đổi.");
  const db = await ensureDatabase();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO store_ordering_settings (id, store_id, is_ordering_open, announcement, opening_hours_notice, updated_at)
      VALUES (?, ?, COALESCE(?, 0), COALESCE(?, ''), COALESCE(?, '08:00 - 22:30'), ?)
      ON CONFLICT(store_id) DO UPDATE SET is_ordering_open = COALESCE(?, is_ordering_open), announcement = COALESCE(?, announcement),
      opening_hours_notice = COALESCE(?, opening_hours_notice), updated_at = excluded.updated_at`)
      .bind(`settings-${auth.actor.storeId}`, auth.actor.storeId, open, announcement, hours, now, open, announcement, hours),
    auditStatement(db, auth.actor.email, "store", auth.actor.storeId, "ordering.settings_updated", {}, now),
  ]);
  return Response.json({ success: true, updatedAt: now });
});
