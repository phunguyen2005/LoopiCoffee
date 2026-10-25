import { getApiUser, getVerifiedIdentity } from "@/server/auth";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { PermissionKey } from "@/modules/people/domain/permissions";

export type LoopiUser = {
  email: string;
  displayName: string;
  role: "system_admin" | "owner" | "manager" | "team_lead" | "employee";
  roleId?: string | null;
  permissions: PermissionKey[];
  permissionRevision: number;
};

const getRequestActor = cache(getApiUser);

export async function getLoopiUser(returnTo: string): Promise<LoopiUser> {
  void returnTo;
  const actor = await getRequestActor();
  if (actor) {
    if (actor.mustChangePassword) redirect("/auth/change-password");
    return {
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
      roleId: actor.roleId ?? null,
      permissions: actor.permissions,
      permissionRevision: actor.permissionRevision,
    };
  }
  if (await getVerifiedIdentity()) redirect("/auth/access");
  redirect("/auth/login");
}

export function requireBusinessUser(user: LoopiUser): LoopiUser {
  if (user.role === "system_admin") redirect("/app");
  return user;
}
