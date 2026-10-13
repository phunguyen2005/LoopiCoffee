import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";
import { changeOrderStatus } from "@/modules/ordering/application/change-status";
import { readOrderBody } from "@/modules/ordering/application/input";
import { apiHandler } from "@/platform/http/errors";

export const dynamic = "force-dynamic";
export const PATCH = apiHandler(async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const { id } = await props.params;
  return Response.json(await changeOrderStatus(await ensureDatabase(), auth.actor, id, await readOrderBody(request)));
});
