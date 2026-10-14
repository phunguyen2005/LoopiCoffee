import { createRequest } from "@/modules/operations/application/create-request";
import { decideRequest } from "@/modules/operations/application/decide-request";
import { withdrawRequest } from "@/modules/operations/application/withdraw-request";
import { applySwap } from "@/modules/operations/application/apply-swap";
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
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { id: "string" });
  const db = await ensureDatabase();

  if (body.action === "withdraw") {
    return Response.json(await withdrawRequest(db, auth.actor, body.id as string));
  }

  // Management actions require elevated role
  if (!["owner", "manager", "team_lead"].includes(auth.actor.role)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (body.action === "apply_swap") {
    return Response.json(
      await applySwap(db, auth.actor, {
        requestId: body.id as string,
        shift1Id: body.shift1Id as string,
        shift2Id: body.shift2Id as string,
      })
    );
  }

  if (typeof body.id !== "string" || !body.id || (body.decision !== "approved" && body.decision !== "rejected")) {
    return Response.json({ error: "Quyết định không hợp lệ." }, { status: 400 });
  }
  return Response.json(await decideRequest(db, auth.actor, body.id, body.decision as "approved" | "rejected"));
});
