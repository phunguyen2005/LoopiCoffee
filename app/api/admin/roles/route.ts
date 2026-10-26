import { ensureDatabase } from "@/db/runtime";
import {
  archiveCustomRole,
  createCustomRole,
  loadRbacConfiguration,
  updateCustomRole,
} from "@/modules/people/application/rbac";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { requireApiUser } from "@/server/auth";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const configuration = await loadRbacConfiguration(await ensureDatabase(), auth.actor.storeId);
  return Response.json({ ...configuration, editable: auth.actor.role === "system_admin" }, {
    headers: { "Cache-Control": "private, no-store" },
  });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, {
    name: "string",
    description: "string",
    idempotencyKey: "string",
  }) as { name?: string; description?: string; idempotencyKey?: string };

  if (!body.name || !body.idempotencyKey) {
    throw new ApplicationError("Thiếu tên vai trò hoặc mã thao tác.", 400, "invalid_input");
  }

  const db = await ensureDatabase();
  const result = await createCustomRole(
    db,
    auth.actor,
    { name: body.name, description: body.description },
    body.idempotencyKey,
  );
  return Response.json(result, { status: 201 });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const body = await readObject(request, {
    roleId: "string",
    action: "string",
    name: "string",
    description: "string",
    expectedRevision: "number",
    reason: "string?",
    idempotencyKey: "string",
  }) as {
    roleId?: string;
    action?: "update" | "archive";
    name?: string;
    description?: string;
    expectedRevision?: number;
    reason?: string;
    idempotencyKey?: string;
  };

  if (!body.roleId || !body.action || typeof body.expectedRevision !== "number" || !body.idempotencyKey) {
    throw new ApplicationError("Thông tin cập nhật vai trò không hợp lệ.", 400, "invalid_input");
  }

  const db = await ensureDatabase();
  if (body.action === "archive") {
    const result = await archiveCustomRole(
      db,
      auth.actor,
      body.roleId,
      body.expectedRevision,
      body.reason,
      body.idempotencyKey,
    );
    return Response.json(result);
  }

  if (body.action === "update") {
    const result = await updateCustomRole(
      db,
      auth.actor,
      body.roleId,
      { name: body.name, description: body.description },
      body.expectedRevision,
      body.reason,
      body.idempotencyKey,
    );
    return Response.json(result);
  }

  throw new ApplicationError("Hành động không hợp lệ.", 400, "invalid_action");
});


