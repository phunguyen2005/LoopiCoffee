import { ensureDatabase } from "@/db/runtime";
import { requireApiPermission } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";
import { readOrderBody } from "@/modules/ordering/application/input";
import { importMenuItems } from "@/modules/ordering/application/import-menu";

export const dynamic = "force-dynamic";

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiPermission("menu.manage");
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const body = await readOrderBody(request);
  const result = await importMenuItems(db, auth.actor, body);
  return Response.json(result, { status: 201 });
});
