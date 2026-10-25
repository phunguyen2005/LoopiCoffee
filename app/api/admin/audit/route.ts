import { ensureDatabase } from "@/db/runtime";
import { loadAdminAudit } from "@/modules/people/application/admin-audit";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";

export const GET = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const params = new URL(request.url).searchParams;
  const events = await loadAdminAudit(await ensureDatabase(), auth.actor.storeId, {
    category: params.get("category"),
    q: params.get("q"),
  });
  return Response.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
});
