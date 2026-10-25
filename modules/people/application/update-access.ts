import { canAssignRole, canManageEmployee, type AccessActor, type ActorRole, type EmployeeStatus } from "../domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export async function updateEmployeeAccess(
  db: D1Database,
  actor: AccessActor,
  employeeId: string,
  change: { role?: ActorRole; roleId?: string | null; status?: EmployeeStatus; expectedRevision?: number; reason?: string },
) {
  const employee = await db.prepare(
    "SELECT id, store_id, role, role_id, status, auth_user_id, access_revision FROM employees WHERE id = ? AND store_id = ?",
  ).bind(employeeId, actor.storeId).first<{
    id: string; store_id: string; role: ActorRole; role_id: string | null; status: EmployeeStatus; auth_user_id: string | null; access_revision: number;
  }>();
  if (!employee) throw new ApplicationError("Không tìm thấy nhân viên.", 404, "employee_not_found");
  if (change.status !== undefined && !["active", "invited", "suspended", "offboarded", "inactive"].includes(change.status)) {
    throw new ApplicationError("Trạng thái không hợp lệ.");
  }
  const role = change.role ?? employee.role;
  let roleId = change.roleId !== undefined ? change.roleId : employee.role_id;
  if (role === "owner" || role === "system_admin") {
    roleId = null;
  } else if (roleId) {
    const custom = await db.prepare(
      "SELECT id, status FROM custom_roles WHERE id = ? AND store_id = ?",
    ).bind(roleId, actor.storeId).first<{ id: string; status: string }>();
    if (!custom || custom.status !== "active") {
      throw new ApplicationError("Vai trò tùy chỉnh không tồn tại hoặc đã lưu trữ.", 400, "invalid_role_id");
    }
  }

  const status = change.status ?? employee.status;
  if (actor.id === employeeId && status !== "active") {
    throw new ApplicationError("Bạn không thể tự vô hiệu hóa tài khoản.", 409, "self_deactivation");
  }
  if (change.expectedRevision !== undefined && change.expectedRevision !== employee.access_revision) {
    throw new ApplicationError("Tài khoản vừa được cập nhật. Hãy tải lại.", 409, "account_conflict");
  }
  if (!canManageEmployee(actor, employee) || (change.role !== undefined && !canAssignRole(actor, change.role))) {
    throw new ApplicationError("Bạn không có quyền thay đổi tài khoản này.", 403, "forbidden");
  }
  const promotesToOwner = role === "owner" && employee.role !== "owner";
  if (promotesToOwner) {
    const existingOwner = await db.prepare(
      "SELECT id FROM employees WHERE store_id = ? AND role = 'owner' AND id <> ? LIMIT 1",
    ).bind(actor.storeId, employeeId).first<{ id: string }>();
    if (existingOwner) {
      throw new ApplicationError(
        "Cửa hàng đã có tài khoản Chủ quán. Hãy khôi phục tài khoản đó thay vì tạo thêm.",
        409,
        "owner_limit",
      );
    }
  }
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(
      `UPDATE employees SET role = ?, role_id = ?, status = ?, access_revision = access_revision + 1, updated_at = ?
       WHERE id = ? AND store_id = ? AND role = ? AND status = ? AND access_revision = ?
         AND (? != 'owner' OR role = 'owner' OR NOT EXISTS (SELECT 1 FROM employees existing_owner
           WHERE existing_owner.store_id = employees.store_id AND existing_owner.role = 'owner'
             AND existing_owner.id != employees.id))
         AND (role != 'owner' OR (? = 'owner' AND ? IN ('active', 'invited'))
           OR EXISTS (SELECT 1 FROM employees other
             WHERE other.store_id = employees.store_id AND other.role = 'owner'
               AND other.status = 'active' AND other.id != employees.id))`,
    ).bind(role, roleId, status, now, employeeId, actor.storeId, employee.role, employee.status, employee.access_revision, role, role, status),
    auditStatement(db, actor.email, "employee", employeeId, "employee.access_updated", {
      previousRole: employee.role, previousRoleId: employee.role_id, previousStatus: employee.status,
      role, roleId, status,
      reason: change.reason?.trim().slice(0, 300) || undefined,
      highPriority: actor.role === "system_admin" && (employee.role === "owner" || role === "owner"),
    }, now, true),
  ]);
  if (!results[0].meta.changes) {
    if (promotesToOwner) {
      const existingOwner = await db.prepare(
        "SELECT id FROM employees WHERE store_id = ? AND role = 'owner' AND id <> ? LIMIT 1",
      ).bind(actor.storeId, employeeId).first<{ id: string }>();
      if (existingOwner) {
        throw new ApplicationError(
          "Cửa hàng đã có tài khoản Chủ quán. Hãy khôi phục tài khoản đó thay vì tạo thêm.",
          409,
          "owner_limit",
        );
      }
    }
    throw new ApplicationError("Không thể thay đổi Chủ quán cuối cùng hoặc tài khoản vừa được cập nhật. Hãy tải lại.", 409, "access_conflict");
  }
  return { ...employee, role, role_id: roleId, status, access_revision: employee.access_revision + 1 };
}
