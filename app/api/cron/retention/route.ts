import { getBindings } from "@/db/runtime";
import { expireEvidence } from "@/modules/attendance/application/expire-evidence";
import { apiHandler } from "@/platform/http/errors";

export const GET = apiHandler(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Retention cleanup is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { db, evidence } = getBindings();
  const result = await expireEvidence(db, evidence);
  return Response.json(result, { status: result.failures ? 503 : 200 });
});

export const POST = GET;
