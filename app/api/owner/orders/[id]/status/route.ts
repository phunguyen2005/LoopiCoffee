import { ensureDatabase } from "@/db/runtime";
import { requireApiPermission } from "@/server/auth";
import { changeOrderStatus, advanceOrderStatusPipeline } from "@/modules/ordering/application/change-status";
import { readOrderBody } from "@/modules/ordering/application/input";
import { apiHandler } from "@/platform/http/errors";

export const dynamic = "force-dynamic";
export const PATCH = apiHandler(async (request: Request, props: { params: Promise<{ id: string }> }) => {
  const body = await readOrderBody(request);
  const auth = await requireApiPermission(body.newStatus === "cancelled" ? "orders.cancel" : "orders.transition");
  if (!auth.actor) return auth.response;
  const { id } = await props.params;
  if (body.autoAdvance) {
    return Response.json(await advanceOrderStatusPipeline(await ensureDatabase(), auth.actor, id, body));
  }
  return Response.json(await changeOrderStatus(await ensureDatabase(), auth.actor, id, body));
});
