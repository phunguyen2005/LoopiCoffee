export const actorRoles = ["system_admin", "owner", "manager", "team_lead", "employee"] as const;
export type ActorRole = typeof actorRoles[number];
export const assignableRoles = ["owner", "manager", "team_lead", "employee"] as const;
export type EmployeeStatus = "active" | "invited" | "suspended" | "offboarded" | "inactive";

export type AccessActor = { id: string; email: string; storeId: string; role: ActorRole };
export type EmployeeAccess = { id: string; store_id: string; role: ActorRole; status: EmployeeStatus };

export function canManageEmployee(actor: AccessActor, employee: EmployeeAccess) {
  if (actor.storeId !== employee.store_id) return false;
  if (employee.role === "system_admin") return false;
  if (actor.role === "owner") return true;
  return actor.role === "manager" && !["owner", "manager", "system_admin"].includes(employee.role);
}

export function canAssignRole(actor: AccessActor, role: ActorRole) {
  return assignableRoles.includes(role as typeof assignableRoles[number]) &&
    (actor.role === "owner" || (actor.role === "manager" && !["owner", "manager", "system_admin"].includes(role)));
}
