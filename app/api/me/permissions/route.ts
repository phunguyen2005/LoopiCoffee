import { requireApiUser } from "@/server/auth";
import { apiHandler } from "@/platform/http/errors";

export const GET = apiHandler(async () => {
  const auth = await requireApiUser(["system_admin", "owner", "manager", "team_lead", "employee"]);
  if (!auth.actor) return auth.response;
  return Response.json({
    role: auth.actor.role,
    permissions: auth.actor.permissions,
    revision: auth.actor.permissionRevision,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

