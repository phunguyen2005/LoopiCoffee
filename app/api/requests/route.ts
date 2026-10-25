import { createRequest } from "@/modules/operations/application/create-request";
import { decideRequest } from "@/modules/operations/application/decide-request";
import { withdrawRequest } from "@/modules/operations/application/withdraw-request";
import { applySwap } from "@/modules/operations/application/apply-swap";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { ensureDatabase } from "@/db/runtime";
import { hasPermission, requireApiUser } from "@/server/auth";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const canReviewLeave = hasPermission(auth.actor, "requests.leave.review");
  const canReviewCorrection = hasPermission(auth.actor, "requests.correction.review");
  const canApplySwap = hasPermission(auth.actor, "requests.swap.apply");
  const visibleTypes = [canReviewLeave ? "leave" : null, canReviewCorrection ? "correction" : null, canApplySwap ? "swap" : null].filter(Boolean) as string[];
  const scope = visibleTypes.length ? `AND (lower(r.employee_email) = lower(?) OR r.type IN (${visibleTypes.map(() => "?").join(",")}))` : "AND lower(r.employee_email) = lower(?)";
  const statement = db.prepare(
    `SELECT r.id, r.employee_email, r.type, r.title, r.reason, r.status,
            r.created_at, r.shift_id, r.starts_at, r.ends_at,
            r.correction_event_id, r.correction_action, r.correction_effective_time,
            COALESCE(e.display_name, r.employee_email) AS employee_name
     FROM requests r LEFT JOIN employees e ON lower(e.email) = lower(r.employee_email)
     WHERE r.store_id = ? ${scope} ORDER BY r.created_at DESC LIMIT 100`,
  );
  const result = await statement.bind(auth.actor.storeId, auth.actor.email, ...visibleTypes).all();
  const correctionEvents = await db.prepare(
    `SELECT 'event:' || e.id AS id, e.id AS event_id, e.action, e.recorded_at, s.id AS session_id, s.revision,
            CASE WHEN e.action = 'check_in' THEN s.opened_at ELSE s.closed_at END AS effective_at
     FROM attendance_events e JOIN attendance_sessions s ON s.id = e.session_id
     WHERE s.store_id = ? AND lower(e.employee_email) = lower(?)
     UNION ALL
     SELECT 'missing-checkout:' || s.id AS id, NULL AS event_id, 'check_out' AS action,
            s.opened_at AS recorded_at, s.id AS session_id, s.revision,
            COALESCE(sh.ends_at, s.closed_at, s.opened_at) AS effective_at
     FROM attendance_sessions s LEFT JOIN shifts sh ON sh.id = s.shift_id
     WHERE s.store_id = ? AND lower(s.employee_email) = lower(?)
       AND s.opened_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM attendance_events e WHERE e.session_id = s.id AND e.action = 'check_out')
     ORDER BY recorded_at DESC LIMIT 60`,
  ).bind(auth.actor.storeId, auth.actor.email, auth.actor.storeId, auth.actor.email).all();
  return Response.json(
    { requests: result.results ?? [], correctionEvents: correctionEvents.results ?? [], actorEmail: auth.actor.email },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { type: "string", title: "string", reason: "string", shiftId: "string", correctionEventId: "string", correctionSessionId: "string", correctionAction: "string", adjustedTime: "string", expectedRevision: "number", idempotencyKey: "string" });
  return Response.json(await createRequest(await ensureDatabase(), auth.actor, body));
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = await readObject(request, { id: "string", requestId: "string", action: "string", decision: "string", shift1Id: "string", shift2Id: "string" });
  const db = await ensureDatabase();
  const reqId = (body.id || body.requestId) as string;

  if (body.action === "withdraw") {
    return Response.json(await withdrawRequest(db, auth.actor, reqId));
  }

  if (body.action === "apply_swap") {
    if (!hasPermission(auth.actor, "requests.swap.apply")) return Response.json({ error: "Bạn không có quyền áp dụng đổi ca.", code: "permission_denied" }, { status: 403 });
    return Response.json(
      await applySwap(db, auth.actor, {
        requestId: reqId,
        shift1Id: body.shift1Id as string,
        shift2Id: body.shift2Id as string,
      })
    );
  }

  if (typeof body.id !== "string" || !body.id || (body.decision !== "approved" && body.decision !== "rejected")) {
    return Response.json({ error: "Quyết định không hợp lệ." }, { status: 400 });
  }
  const target = await db.prepare("SELECT type FROM requests WHERE id = ? AND store_id = ?").bind(body.id, auth.actor.storeId).first<{ type: string }>();
  const permission = target?.type === "correction" ? "requests.correction.review" : target?.type === "swap" ? "requests.swap.apply" : "requests.leave.review";
  if (!hasPermission(auth.actor, permission)) return Response.json({ error: "Bạn không có quyền duyệt yêu cầu này.", code: "permission_denied" }, { status: 403 });
  return Response.json(await decideRequest(db, auth.actor, body.id, body.decision as "approved" | "rejected"));
});
