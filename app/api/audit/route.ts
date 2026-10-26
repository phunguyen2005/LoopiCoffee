import { ensureDatabase } from "@/db/runtime";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";

function getVnDayRangeUtc(dateStr: string): { startUtc: string; endUtc: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0 - 7, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 0 - 7, 0, 0, 0));
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

function getVnDateRangeUtc(fromStr: string, toStr: string): { startUtc: string; endUtc: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) return null;
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, fd, 0 - 7, 0, 0, 0));
  const end = new Date(Date.UTC(ty, tm - 1, td + 1, 0 - 7, 0, 0, 0));
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export const GET = apiHandler(async (request?: Request) => {
  const auth = await requireApiUser(["owner"]);
  if (!auth.actor) return auth.response;

  let range: { startUtc: string; endUtc: string } | null = null;
  if (request && typeof request.url === "string") {
    try {
      const url = new URL(request.url);
      const date = url.searchParams.get("date");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (date) {
        range = getVnDayRangeUtc(date);
      } else if (from && to) {
        range = getVnDateRangeUtc(from, to);
      }
    } catch {
      // Ignore URL parse errors
    }
  }

  const db = await ensureDatabase();
  let result;
  if (range) {
    result = await db.prepare(
      `SELECT a.id, a.actor_email, a.entity_type, a.entity_id, a.action, a.metadata, a.created_at,
              e.display_name AS actor_name, e.role AS actor_role
       FROM audit_events a
       LEFT JOIN employees e ON lower(a.actor_email) = lower(e.email) AND (e.store_id = a.store_id OR e.store_id IS NULL)
       WHERE a.store_id = ? AND a.created_at >= ? AND a.created_at < ?
       ORDER BY a.created_at DESC LIMIT 500`,
    ).bind(auth.actor.storeId, range.startUtc, range.endUtc).all();
  } else {
    result = await db.prepare(
      `SELECT a.id, a.actor_email, a.entity_type, a.entity_id, a.action, a.metadata, a.created_at,
              e.display_name AS actor_name, e.role AS actor_role
       FROM audit_events a
       LEFT JOIN employees e ON lower(a.actor_email) = lower(e.email) AND (e.store_id = a.store_id OR e.store_id IS NULL)
       WHERE a.store_id = ?
       ORDER BY a.created_at DESC LIMIT 200`,
    ).bind(auth.actor.storeId).all();
  }

  return Response.json({ events: result.results }, { headers: { "Cache-Control": "private, no-store" } });
});
