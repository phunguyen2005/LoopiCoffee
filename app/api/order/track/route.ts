import { ensureDatabase, STORE_ID } from "@/db/runtime";
import { trackOrder } from "@/modules/ordering/application/track-order";
import { limitOrderRequests } from "@/modules/ordering/application/rate-limit";
import { apiHandler } from "@/platform/http/errors";

export const dynamic = "force-dynamic";
export const GET = apiHandler(async (request: Request) => {
  const db = await ensureDatabase();
  await limitOrderRequests(db, STORE_ID, request, "track");
  return Response.json(await trackOrder(db, STORE_ID, request.headers.get("x-order-receipt")), {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
});
