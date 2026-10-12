import { ensureDatabase, STORE_ID } from "@/db/runtime";
import { createOrder } from "@/modules/ordering/application/create-order";
import { readOrderBody } from "@/modules/ordering/application/input";
import { limitOrderRequests } from "@/modules/ordering/application/rate-limit";
import { apiHandler } from "@/platform/http/errors";

export const dynamic = "force-dynamic";
export const POST = apiHandler(async (request: Request) => {
  const db = await ensureDatabase();
  await limitOrderRequests(db, STORE_ID, request, "create");
  const result = await createOrder(db, STORE_ID, await readOrderBody(request), request.headers.get("idempotency-key"), request.headers.get("x-order-receipt"));
  return Response.json(result, { status: result.replayed ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
});
