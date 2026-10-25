import { ApplicationError } from "../../../platform/http/errors.ts";
import {
  defaultPermissionsForRole,
  permissionCatalog,
  type PermissionKey,
  validateRolePermissions,
} from "../domain/permissions.ts";
import type { ActorRole } from "../domain/access.ts";

export type CustomRoleRecord = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assignedCount: number;
  permissions: PermissionKey[];
  permissionRevision: number;
};

export async function loadRolePermissions(db: D1Database, storeId: string, role: string) {
  if (role === "owner") return { permissions: [...defaultPermissionsForRole(role)], revision: 0, configured: true };
  if (role === "system_admin" || role === "employee") return { permissions: [] as PermissionKey[], revision: 0, configured: true };
  if (role.startsWith("crole_")) {
    const custom = await db.prepare(
      "SELECT id, status FROM custom_roles WHERE id = ? AND store_id = ?",
    ).bind(role, storeId).first<{ id: string; status: string }>();
    if (!custom || custom.status === "archived") {
      return { permissions: [] as PermissionKey[], revision: 0, configured: false };
    }
  }
  const set = await db.prepare(
    "SELECT revision FROM role_permission_sets WHERE store_id = ? AND role = ?",
  ).bind(storeId, role).first<{ revision: number }>();
  if (!set) return { permissions: [] as PermissionKey[], revision: 0, configured: false };
  const rows = await db.prepare(
    "SELECT permission_key FROM role_permissions WHERE store_id = ? AND role = ? ORDER BY permission_key",
  ).bind(storeId, role).all<{ permission_key: PermissionKey }>();
  return { permissions: rows.results.map((row) => row.permission_key), revision: set.revision, configured: true };
}

export async function loadRbacConfiguration(db: D1Database, storeId: string) {
  const roles = await Promise.all(
    (["manager", "team_lead"] as const).map(async (role) => ({
      role,
      ...(await loadRolePermissions(db, storeId, role)),
    })),
  );

  const customRoleRows = await db.prepare(
    `SELECT cr.id, cr.name, cr.description, cr.status, cr.revision, cr.created_by, cr.created_at, cr.updated_at,
            (SELECT COUNT(*) FROM employees e WHERE e.role_id = cr.id AND e.store_id = cr.store_id) AS assigned_count
     FROM custom_roles cr
     WHERE cr.store_id = ?
     ORDER BY cr.created_at ASC`,
  ).bind(storeId).all<{
    id: string;
    name: string;
    description: string | null;
    status: "active" | "archived";
    revision: number;
    created_by: string;
    created_at: string;
    updated_at: string;
    assigned_count: number;
  }>();

  const customRoles: CustomRoleRecord[] = await Promise.all(
    (customRoleRows.results ?? []).map(async (cr) => {
      const perms = await loadRolePermissions(db, storeId, cr.id);
      return {
        id: cr.id,
        name: cr.name,
        description: cr.description,
        status: cr.status,
        revision: cr.revision,
        createdBy: cr.created_by,
        createdAt: cr.created_at,
        updatedAt: cr.updated_at,
        assignedCount: cr.assigned_count,
        permissions: perms.permissions,
        permissionRevision: perms.revision,
      };
    }),
  );

  return { catalog: permissionCatalog, roles, customRoles };
}

export async function createCustomRole(
  db: D1Database,
  actor: { email: string; storeId: string; role: ActorRole },
  data: { name: string; description?: string },
  idempotencyKey: string,
) {
  if (actor.role !== "system_admin") {
    throw new ApplicationError("Chỉ quản trị hệ thống được tạo vai trò tùy chỉnh.", 403, "permission_denied");
  }
  const name = data.name?.trim();
  if (!name || name.length < 2 || name.length > 50) {
    throw new ApplicationError("Tên vai trò phải từ 2 đến 50 ký tự.", 400, "invalid_role_name");
  }
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idempotencyKey)) {
    throw new ApplicationError("Thiếu mã thao tác hợp lệ.", 400, "invalid_idempotency_key");
  }

  const prior = await db.prepare(
    "SELECT metadata FROM audit_events WHERE id = ? AND store_id = ? AND actor_email = ? AND action = 'rbac.custom_role_created'",
  ).bind(idempotencyKey, actor.storeId, actor.email).first<{ metadata: string }>();
  if (prior) {
    const meta = JSON.parse(prior.metadata);
    return { role: meta.role, replayed: true };
  }

  const existing = await db.prepare(
    "SELECT id FROM custom_roles WHERE store_id = ? AND lower(name) = lower(?)",
  ).bind(actor.storeId, name).first<{ id: string }>();
  if (existing) {
    throw new ApplicationError("Tên vai trò đã tồn tại trong cửa hàng.", 409, "role_name_exists");
  }

  const roleId = `crole_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();
  const description = data.description?.trim().slice(0, 200) ?? null;

  const statements = [
    db.prepare(
      `INSERT INTO custom_roles (id, store_id, name, description, status, revision, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?)`,
    ).bind(roleId, actor.storeId, name, description, actor.email, now, now),
    db.prepare(
      `INSERT INTO role_permission_sets (store_id, role, revision, updated_by, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
    ).bind(actor.storeId, roleId, actor.email, now),
    db.prepare(
      `INSERT INTO audit_events (id, store_id, actor_email, entity_type, entity_id, action, metadata, created_at)
       VALUES (?, ?, ?, 'custom_role', ?, 'rbac.custom_role_created', ?, ?)`,
    ).bind(
      idempotencyKey,
      actor.storeId,
      actor.email,
      roleId,
      JSON.stringify({ role: { id: roleId, name, description, status: "active", revision: 0 }, highPriority: true }),
      now,
    ),
  ];

  await db.batch(statements);
  return {
    role: {
      id: roleId,
      name,
      description,
      status: "active" as const,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function updateCustomRole(
  db: D1Database,
  actor: { email: string; storeId: string; role: ActorRole },
  roleId: string,
  data: { name?: string; description?: string },
  expectedRevision: number,
  reason: string,
  idempotencyKey: string,
) {
  if (actor.role !== "system_admin") {
    throw new ApplicationError("Chỉ quản trị hệ thống được cập nhật vai trò tùy chỉnh.", 403, "permission_denied");
  }
  if (!reason || reason.trim().length < 5) {
    throw new ApplicationError("Hãy nhập lý do thay đổi vai trò (tối thiểu 5 ký tự).", 400, "reason_required");
  }
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idempotencyKey)) {
    throw new ApplicationError("Thiếu mã thao tác hợp lệ.", 400, "invalid_idempotency_key");
  }

  const prior = await db.prepare(
    "SELECT metadata FROM audit_events WHERE id = ? AND store_id = ? AND actor_email = ? AND action = 'rbac.custom_role_updated'",
  ).bind(idempotencyKey, actor.storeId, actor.email).first<{ metadata: string }>();
  if (prior) {
    const meta = JSON.parse(prior.metadata);
    return { role: meta.role, replayed: true };
  }

  const role = await db.prepare(
    "SELECT id, name, description, status, revision FROM custom_roles WHERE id = ? AND store_id = ?",
  ).bind(roleId, actor.storeId).first<{ id: string; name: string; description: string | null; status: string; revision: number }>();
  if (!role) {
    throw new ApplicationError("Không tìm thấy vai trò tùy chỉnh.", 404, "role_not_found");
  }
  if (role.status === "archived") {
    throw new ApplicationError("Không thể chỉnh sửa vai trò đã lưu trữ.", 400, "role_archived");
  }
  if (role.revision !== expectedRevision) {
    throw new ApplicationError("Dữ liệu vai trò vừa thay đổi. Hãy tải lại.", 409, "role_conflict");
  }

  const newName = data.name !== undefined ? data.name.trim() : role.name;
  if (!newName || newName.length < 2 || newName.length > 50) {
    throw new ApplicationError("Tên vai trò phải từ 2 đến 50 ký tự.", 400, "invalid_role_name");
  }
  if (newName.toLowerCase() !== role.name.toLowerCase()) {
    const dup = await db.prepare(
      "SELECT id FROM custom_roles WHERE store_id = ? AND lower(name) = lower(?) AND id != ?",
    ).bind(actor.storeId, newName, roleId).first<{ id: string }>();
    if (dup) {
      throw new ApplicationError("Tên vai trò đã tồn tại trong cửa hàng.", 409, "role_name_exists");
    }
  }

  const newDescription = data.description !== undefined ? data.description.trim().slice(0, 200) : role.description;
  const now = new Date().toISOString();
  const nextRevision = expectedRevision + 1;

  const statements = [
    db.prepare(
      `UPDATE custom_roles
       SET name = ?, description = ?, revision = ?, updated_at = ?
       WHERE id = ? AND store_id = ? AND revision = ?`,
    ).bind(newName, newDescription, nextRevision, now, roleId, actor.storeId, expectedRevision),
    db.prepare(
      `INSERT INTO audit_events (id, store_id, actor_email, entity_type, entity_id, action, metadata, created_at)
       VALUES (?, ?, ?, 'custom_role', ?, 'rbac.custom_role_updated', ?, ?)`,
    ).bind(
      idempotencyKey,
      actor.storeId,
      actor.email,
      roleId,
      JSON.stringify({
        previous: { name: role.name, description: role.description, revision: expectedRevision },
        role: { id: roleId, name: newName, description: newDescription, revision: nextRevision },
        reason: reason.trim(),
        highPriority: true,
      }),
      now,
    ),
  ];

  const results = await db.batch(statements);
  if (!results[0]?.meta.changes) {
    throw new ApplicationError("Dữ liệu vai trò vừa thay đổi. Hãy tải lại.", 409, "role_conflict");
  }

  return {
    role: {
      id: roleId,
      name: newName,
      description: newDescription,
      status: "active" as const,
      revision: nextRevision,
    },
  };
}

export async function archiveCustomRole(
  db: D1Database,
  actor: { email: string; storeId: string; role: ActorRole },
  roleId: string,
  expectedRevision: number,
  reason: string,
  idempotencyKey: string,
) {
  if (actor.role !== "system_admin") {
    throw new ApplicationError("Chỉ quản trị hệ thống được lưu trữ vai trò tùy chỉnh.", 403, "permission_denied");
  }
  if (!reason || reason.trim().length < 5) {
    throw new ApplicationError("Hãy nhập lý do lưu trữ vai trò (tối thiểu 5 ký tự).", 400, "reason_required");
  }
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idempotencyKey)) {
    throw new ApplicationError("Thiếu mã thao tác hợp lệ.", 400, "invalid_idempotency_key");
  }

  const prior = await db.prepare(
    "SELECT metadata FROM audit_events WHERE id = ? AND store_id = ? AND actor_email = ? AND action = 'rbac.custom_role_archived'",
  ).bind(idempotencyKey, actor.storeId, actor.email).first<{ metadata: string }>();
  if (prior) {
    const meta = JSON.parse(prior.metadata);
    return { role: meta.role, replayed: true };
  }

  const role = await db.prepare(
    "SELECT id, name, status, revision FROM custom_roles WHERE id = ? AND store_id = ?",
  ).bind(roleId, actor.storeId).first<{ id: string; name: string; status: string; revision: number }>();
  if (!role) {
    throw new ApplicationError("Không tìm thấy vai trò tùy chỉnh.", 404, "role_not_found");
  }
  if (role.status === "archived") {
    return { role: { id: role.id, status: "archived", revision: role.revision }, replayed: true };
  }
  if (role.revision !== expectedRevision) {
    throw new ApplicationError("Dữ liệu vai trò vừa thay đổi. Hãy tải lại.", 409, "role_conflict");
  }

  const assigned = await db.prepare(
    "SELECT COUNT(*) AS count FROM employees WHERE role_id = ? AND store_id = ?",
  ).bind(roleId, actor.storeId).first<{ count: number }>();
  if (assigned && assigned.count > 0) {
    throw new ApplicationError(
      `Không thể lưu trữ vai trò khi còn ${assigned.count} tài khoản đang được gán. Hãy chuyển tài khoản sang vai trò khác trước.`,
      400,
      "role_in_use",
    );
  }

  const now = new Date().toISOString();
  const nextRevision = expectedRevision + 1;

  const statements = [
    db.prepare(
      `UPDATE custom_roles
       SET status = 'archived', revision = ?, updated_at = ?
       WHERE id = ? AND store_id = ? AND revision = ?`,
    ).bind(nextRevision, now, roleId, actor.storeId, expectedRevision),
    db.prepare(
      `INSERT INTO audit_events (id, store_id, actor_email, entity_type, entity_id, action, metadata, created_at)
       VALUES (?, ?, ?, 'custom_role', ?, 'rbac.custom_role_archived', ?, ?)`,
    ).bind(
      idempotencyKey,
      actor.storeId,
      actor.email,
      roleId,
      JSON.stringify({
        role: { id: roleId, name: role.name, status: "archived", revision: nextRevision },
        reason: reason.trim(),
        highPriority: true,
      }),
      now,
    ),
  ];

  const results = await db.batch(statements);
  if (!results[0]?.meta.changes) {
    throw new ApplicationError("Dữ liệu vai trò vừa thay đổi. Hãy tải lại.", 409, "role_conflict");
  }

  return {
    role: {
      id: roleId,
      name: role.name,
      status: "archived" as const,
      revision: nextRevision,
    },
  };
}

export async function replaceRolePermissions(
  db: D1Database,
  actor: { email: string; storeId: string; role: ActorRole },
  role: string,
  requested: readonly string[],
  expectedRevision: number,
  reason: string,
  idempotencyKey: string,
) {
  if (actor.role !== "system_admin") throw new ApplicationError("Chỉ quản trị hệ thống được cấu hình quyền.", 403, "permission_denied");
  if (reason.trim().length < 5) throw new ApplicationError("Hãy nhập lý do thay đổi quyền (tối thiểu 5 ký tự).", 400, "reason_required");

  const isCustom = role !== "manager" && role !== "team_lead";
  if (isCustom) {
    const customRole = await db.prepare(
      "SELECT id, status FROM custom_roles WHERE id = ? AND store_id = ?",
    ).bind(role, actor.storeId).first<{ id: string; status: string }>();
    if (!customRole) {
      throw new ApplicationError("Không tìm thấy vai trò tùy chỉnh.", 404, "role_not_found");
    }
    if (customRole.status === "archived") {
      throw new ApplicationError("Không thể cấu hình quyền cho vai trò đã lưu trữ.", 400, "role_archived");
    }
  }

  let permissions: PermissionKey[];
  try {
    permissions = validateRolePermissions(role, requested, { isCustom });
  } catch (error) {
    const message = error instanceof Error ? error.message : "permission_not_assignable";
    throw new ApplicationError(
      message.startsWith("permission_dependency") ? "Bộ quyền còn thiếu quyền phụ thuộc." : "Bộ quyền có mục không được cấp cho vai trò này.",
      400,
      message.startsWith("permission_dependency") ? "permission_dependency" : "permission_not_assignable",
    );
  }
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idempotencyKey)) {
    throw new ApplicationError("Thiếu mã thao tác hợp lệ.", 400, "invalid_idempotency_key");
  }
  const normalizedReason = reason.trim().slice(0, 300);
  const prior = await db.prepare(
    "SELECT metadata FROM audit_events WHERE id = ? AND store_id = ? AND actor_email = ? AND action = 'rbac.permissions_updated'",
  ).bind(idempotencyKey, actor.storeId, actor.email).first<{ metadata: string }>();
  if (prior) {
    const metadata = JSON.parse(prior.metadata) as { role?: string; permissions?: string[]; previousRevision?: number; revision?: number; reason?: string };
    if (metadata.role === role && metadata.previousRevision === expectedRevision && metadata.reason === normalizedReason &&
        JSON.stringify([...(metadata.permissions ?? [])].sort()) === JSON.stringify([...permissions].sort())) {
      return { role, permissions, revision: metadata.revision ?? expectedRevision + 1, replayed: true };
    }
    throw new ApplicationError("Mã thao tác đã được dùng cho nội dung khác.", 409, "permission_conflict");
  }
  const current = await db.prepare(
    "SELECT revision FROM role_permission_sets WHERE store_id = ? AND role = ?",
  ).bind(actor.storeId, role).first<{ revision: number }>();
  if (!current || current.revision !== expectedRevision) {
    throw new ApplicationError("Cấu hình quyền vừa thay đổi. Hãy tải lại trước khi lưu.", 409, "permission_conflict");
  }
  const now = new Date().toISOString();
  const nextRevision = expectedRevision + 1;
  const commandMarker = `${actor.email}|${crypto.randomUUID()}`;
  const statements = [
    db.prepare(
      "UPDATE role_permission_sets SET revision = ?, updated_by = ?, updated_at = ? WHERE store_id = ? AND role = ? AND revision = ?",
    ).bind(nextRevision, commandMarker, now, actor.storeId, role, expectedRevision),
    db.prepare(`DELETE FROM role_permissions WHERE store_id = ? AND role = ?
      AND EXISTS (SELECT 1 FROM role_permission_sets WHERE store_id = ? AND role = ? AND revision = ? AND updated_by = ?)`)
      .bind(actor.storeId, role, actor.storeId, role, nextRevision, commandMarker),
    ...permissions.map((permission) => db.prepare(
      `INSERT INTO role_permissions (store_id, role, permission_key, created_at)
       SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM role_permission_sets WHERE store_id = ? AND role = ? AND revision = ? AND updated_by = ?)`,
    ).bind(actor.storeId, role, permission, now, actor.storeId, role, nextRevision, commandMarker)),
    db.prepare(`INSERT INTO audit_events (id, store_id, actor_email, entity_type, entity_id, action, metadata, created_at)
      SELECT ?, ?, ?, 'role_permissions', ?, 'rbac.permissions_updated', ?, ?
      WHERE EXISTS (SELECT 1 FROM role_permission_sets WHERE store_id = ? AND role = ? AND revision = ? AND updated_by = ?)`)
      .bind(idempotencyKey, actor.storeId, actor.email, role, JSON.stringify({
        role, permissions, previousRevision: expectedRevision, revision: nextRevision, reason: normalizedReason, highPriority: true,
      }), now, actor.storeId, role, nextRevision, commandMarker),
    db.prepare(`UPDATE role_permission_sets SET updated_by = ?
      WHERE store_id = ? AND role = ? AND revision = ? AND updated_by = ?`)
      .bind(actor.email, actor.storeId, role, nextRevision, commandMarker),
  ];
  const results = await db.batch(statements);
  const updateResult = results[0];
  if (!updateResult?.meta.changes) throw new ApplicationError("Cấu hình quyền vừa thay đổi. Hãy tải lại.", 409, "permission_conflict");
  return { role, permissions, revision: nextRevision };
}

