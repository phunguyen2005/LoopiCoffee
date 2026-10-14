import { getApiUser, getVerifiedIdentity } from "@/server/auth";
import { cache } from "react";
import { redirect } from "next/navigation";

export type LoopiUser = {
  email: string;
  displayName: string;
  role: "system_admin" | "owner" | "manager" | "team_lead" | "employee";
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
    };
  }
  if (await getVerifiedIdentity()) redirect("/auth/access");
  redirect("/auth/login");
}

export function requireBusinessUser(user: LoopiUser): LoopiUser {
  if (user.role === "system_admin") redirect("/app");
  return user;
}
