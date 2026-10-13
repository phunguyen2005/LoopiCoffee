import { canAssignRole, canManageEmployee, type AccessActor, type ActorRole, type EmployeeStatus } from "../domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export async function updateEmployeeAccess(
  db: D1Database,
  actor: AccessActor,
  employeeId: string,
  change: { role?: ActorRole; status?: EmployeeStatus },
) {
  const employee = await db.prepare(
    "SELECT id, store_id, role, status, auth_user_id FROM employees WHERE id = ? AND store_id = ?",
  ).bind(employeeId, actor.storeId).first<{
    id: string; store_id: string; role: ActorRole; status: EmployeeStatus; auth_user_id: string | null;
  }>();
  if (!employee) throw new ApplicationError("Không tìm thấy nhân viên.", 404, "employee_not_found");
  if (change.status !== undefined && !["active", "invited", "suspended", "offboarded", "inactive"].includes(change.status)) {
    throw new ApplicationError("Trạng thái không hợp lệ.");
  }
  const role = change.role ?? employee.role;
  const status = change.status ?? employee.status;
  if (actor.id === employeeId && status !== "active") {
    throw new ApplicationError("Bạn không thể tự vô hiệu hóa tài khoản.", 409, "self_deactivation");
  }
  if (!canManageEmployee(actor, employee) || (change.role !== undefined && !canAssignRole(actor, change.role))) {
    throw new ApplicationError("Bạn không có quyền thay đổi tài khoản này.", 403, "forbidden");
  }
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(
      `UPDATE employees SET role = ?, status = ?, updated_at = ?
       WHERE id = ? AND store_id = ? AND role = ? AND status = ?
         AND (role != 'owner' OR status != 'active' OR (? = 'owner' AND ? = 'active')
           OR EXISTS (SELECT 1 FROM employees other
             WHERE other.store_id = employees.store_id AND other.role = 'owner'
               AND other.status = 'active' AND other.id != employees.id))`,
    ).bind(role, status, now, employeeId, actor.storeId, employee.role, employee.status, role, status),
    auditStatement(db, actor.email, "employee", employeeId, "employee.access_updated", {
      previousRole: employee.role, previousStatus: employee.status, role, status,
    }, now, true),
  ]);
  if (!results[0].meta.changes) {
    throw new ApplicationError("Không thể thay đổi Chủ quán cuối cùng hoặc tài khoản vừa được cập nhật. Hãy tải lại.", 409, "access_conflict");
  }
  return { ...employee, role, status };
}
