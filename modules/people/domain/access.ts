export const actorRoles = ["system_admin", "owner", "manager", "team_lead", "employee"] as const;
export type ActorRole = typeof actorRoles[number];
export const assignableRoles = ["owner", "manager", "team_lead", "employee"] as const;
export type EmployeeStatus = "active" | "invited" | "suspended" | "offboarded" | "inactive";

export function defaultAppPath(role: ActorRole) {
  if (role === "system_admin") return "/app/admin";
  return role === "employee" || role === "team_lead" ? "/app/today" : "/app";
}

export type AccessActor = {
  id: string;
  email: string;
  storeId: string;
  role: ActorRole;
  permissions?: readonly string[];
  roleId?: string | null;
};
export type EmployeeAccess = {
  id: string;
  store_id: string;
  role: ActorRole;
  status: EmployeeStatus;
  role_id?: string | null;
};

export function canManageEmployee(actor: AccessActor, employee: EmployeeAccess) {
  if (actor.storeId !== employee.store_id) return false;
  if (employee.role === "system_admin") return false;
  if (actor.role === "system_admin") return true;
  if (actor.role === "owner") return true;
  if (actor.permissions?.includes("people.update")) {
    return !["owner", "system_admin"].includes(employee.role) && actor.id !== employee.id;
  }
  return actor.role === "manager" && !["owner", "manager", "system_admin"].includes(employee.role);
}

export function canAssignRole(actor: AccessActor, role: ActorRole) {
  if (!assignableRoles.includes(role as typeof assignableRoles[number])) return false;
  if (actor.role === "system_admin") return true;
  if (actor.role === "owner") return role !== "owner";
  return actor.role === "manager" && !["owner", "manager", "system_admin"].includes(role);
}

/**
 * Validates that an actor cannot approve their own requests (DEC-001)
 */
export function assertNotSelfApproval(actor: AccessActor, targetEmailOrId: string, actionDesc = "thao tác") {
  if (
    actor.id === targetEmailOrId ||
    actor.email.trim().toLowerCase() === targetEmailOrId.trim().toLowerCase()
  ) {
    throw new Error(`Bạn không thể tự ${actionDesc} của chính mình.`);
  }
}

/**
 * DEC-001 & DEC-011: Matrix for deciding operational requests (leave, swap, correction)
 */
export function canApproveRequest(
  actor: AccessActor,
  request: {
    type: "leave" | "swap" | "correction" | string;
    requesterEmail: string;
    requesterRole?: ActorRole;
    targetEmail?: string;
    targetRole?: ActorRole;
  }
): boolean {
  // 1. Anti-self-approval: actor cannot be requester or co-beneficiary
  if (actor.email.toLowerCase() === request.requesterEmail.toLowerCase()) return false;
  if (request.targetEmail && actor.email.toLowerCase() === request.targetEmail.toLowerCase()) return false;

  // 2. system_admin cannot approve any operational requests
  if (actor.role === "system_admin") return false;

  // 3. Targets cannot be owner or system_admin unless actor is owner
  if (actor.role !== "owner") {
    if (request.requesterRole && ["owner", "system_admin"].includes(request.requesterRole)) return false;
    if (request.targetRole && ["owner", "system_admin"].includes(request.targetRole)) return false;
  }

  // 4. Custom role or actor with explicit granted permissions
  if (request.type === "leave" && actor.permissions?.includes("requests.leave.review")) {
    return true;
  }
  if (request.type === "swap" && actor.permissions?.includes("requests.swap.apply")) {
    return true;
  }
  if (request.type === "correction" && actor.permissions?.includes("requests.correction.review")) {
    return true;
  }

  // 5. Fallback to system role matrix:
  // team_lead: Operational lead only, can ONLY approve shift swaps between employees
  if (actor.role === "team_lead") {
    if (request.type !== "swap") return false;
    if (request.requesterRole && request.requesterRole !== "employee") return false;
    if (request.targetRole && request.targetRole !== "employee") return false;
    return true;
  }

  // manager: cannot approve requests from another manager or owner
  if (actor.role === "manager") {
    if (request.requesterRole && ["owner", "manager", "system_admin"].includes(request.requesterRole)) return false;
    if (request.targetRole && ["owner", "manager", "system_admin"].includes(request.targetRole)) return false;
    return true;
  }

  // owner: can approve requests from anyone except self
  if (actor.role === "owner") return true;

  return false;
}

/**
 * DEC-001 & DEC-011: Attendance exception review permissions
 */
export function canReviewAttendance(
  actor: AccessActor,
  targetEmployee: { email: string; role?: ActorRole }
): boolean {
  // 1. Anti-self-approval
  if (actor.email.toLowerCase() === targetEmployee.email.toLowerCase()) return false;
  if (actor.role === "system_admin") return false;
  if (targetEmployee.role && ["owner", "system_admin"].includes(targetEmployee.role) && actor.role !== "owner") return false;

  if (actor.role === "owner") return true;

  if (actor.permissions?.includes("attendance.review")) {
    return true;
  }

  if (actor.role === "manager") {
    return !["owner", "manager", "system_admin"].includes(targetEmployee.role ?? "employee");
  }
  return false;
}

/**
 * DEC-001: Sole-owner self-correction eligibility
 */
export function canSelfCorrectAttendance(
  actor: AccessActor,
  activeOwnerCount: number
): boolean {
  return actor.role === "owner" && activeOwnerCount === 1;
}
