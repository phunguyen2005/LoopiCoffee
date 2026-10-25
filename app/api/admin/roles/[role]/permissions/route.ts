import { ensureDatabase } from "@/db/runtime";
import { replaceRolePermissions } from "@/modules/people/application/rbac";
import type { ConfigurableRole } from "@/modules/people/domain/permissions";
import { apiHandler } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { requireApiUser } from "@/server/auth";

export const PUT = apiHandler(async (request: Request, context: { params: Promise<{ role: string }> }) => {
  const auth = await requireApiUser(["system_admin"]);
  if (!auth.actor) return auth.response;
  const { role } = await context.params;
  const isCustom = role.startsWith("crole_");
  if (role !== "manager" && role !== "team_lead" && !isCustom) {
    return Response.json({ error: "Vai trò này có bộ quyền cố định.", code: "permission_not_assignable" }, { status: 400 });
  }
  const body = await readObject(request);
  if (!Array.isArray(body.permissions) || !body.permissions.every((item) => typeof item === "string") ||
      !Number.isInteger(body.expectedRevision) || typeof body.reason !== "string" || typeof body.idempotencyKey !== "string") {
    return Response.json({ error: "Thông tin cập nhật quyền không hợp lệ." }, { status: 400 });
  }
  const result = await replaceRolePermissions(
    await ensureDatabase(),
    auth.actor,
    role,
    body.permissions,
    body.expectedRevision as number,
    body.reason,
    body.idempotencyKey,
  );
  return Response.json(result);
});

