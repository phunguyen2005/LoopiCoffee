import { createRequest } from "@/modules/operations/application/create-request";
import { decideRequest } from "@/modules/operations/application/decide-request";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const scope = auth.actor.role === "employee" ? "AND r.employee_email = ?" : "";
  const statement = db.prepare(
    `SELECT r.id, r.employee_email, r.type, r.title, r.reason, r.status,
            r.created_at, r.shift_id, r.starts_at, r.ends_at, COALESCE(e.display_name, r.employee_email) AS employee_name
     FROM requests r LEFT JOIN employees e ON lower(e.email) = lower(r.employee_email)
     WHERE r.store_id = ? ${scope} ORDER BY r.created_at DESC LIMIT 100`,
  );
  const result = auth.actor.role === "employee"
    ? await statement.bind(auth.actor.storeId, auth.actor.email).all()
    : await statement.bind(auth.actor.storeId).all();
  return Response.json(
    { requests: result.results, actorEmail: auth.actor.email },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { type: "string", title: "string", reason: "string", shiftId: "string", idempotencyKey: "string" });
  return Response.json(await createRequest(await ensureDatabase(), auth.actor, body));
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["owner", "manager", "team_lead"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { id: "string", decision: "string" });
  if (typeof body.id !== "string" || !body.id || (body.decision !== "approved" && body.decision !== "rejected")) {
    return Response.json({ error: "Quyết định không hợp lệ." }, { status: 400 });
  }
  return Response.json(await decideRequest(await ensureDatabase(), auth.actor, body.id, body.decision));
});
