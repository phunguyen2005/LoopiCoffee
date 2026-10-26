import type { ActorRole } from "./access.ts";

export const permissionKeys = [
  "dashboard.read",
  "people.read",
  "people.update",
  "shifts.read_team",
  "shifts.create",
  "shifts.publish",
  "shifts.adjust",
  "shifts.cancel",
  "requests.leave.review",
  "requests.correction.review",
  "requests.swap.apply",
  "attendance.review",
  "attendance.correct",
  "attendance.evidence.read",
  "payroll.read",
  "payroll.finalize",
  "reports.export",
  "checklists.manage",
  "incidents.transition",
  "handovers.manage",
  "menu.manage",
  "orders.read",
  "orders.transition",
  "orders.cancel",
  "ordering.availability.manage",
] as const;

export type PermissionKey = typeof permissionKeys[number];

export function hasGrantedPermission(
  actor: { role: ActorRole; permissions?: readonly string[]; roleId?: string | null },
  permission: PermissionKey,
) {
  if (actor.role === "owner") return true;
  if (actor.role === "system_admin") return false;
  if (actor.permissions) return actor.permissions.includes(permission);
  if (actor.role === "employee") return false;
  return defaultPermissionsForRole(actor.role).includes(permission);
}
export type ConfigurableRole = "manager" | "team_lead" | "employee";

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  description: string;
  group: "overview" | "workforce" | "attendance" | "payroll" | "operations" | "ordering";
  assignableTo: readonly ConfigurableRole[];
  dependsOn?: readonly PermissionKey[];
};

const allConfigurableRoles: readonly ConfigurableRole[] = ["manager", "team_lead", "employee"];

export const permissionCatalog: readonly PermissionDefinition[] = [
  { key: "dashboard.read", label: "Xem tổng quan", description: "Xem số liệu vận hành tổng hợp của cửa hàng.", group: "overview", assignableTo: allConfigurableRoles },
  { key: "people.read", label: "Xem nhân sự", description: "Xem hồ sơ công việc của nhân sự cùng cửa hàng.", group: "workforce", assignableTo: allConfigurableRoles },
  { key: "people.update", label: "Cập nhật hồ sơ nhân sự", description: "Cập nhật hồ sơ công việc và thiết lập tham gia công/lương của cấp dưới.", group: "workforce", assignableTo: allConfigurableRoles, dependsOn: ["people.read"] },
  { key: "shifts.read_team", label: "Xem lịch đội ngũ", description: "Xem lịch của nhân sự cùng cửa hàng.", group: "workforce", assignableTo: allConfigurableRoles },
  { key: "shifts.create", label: "Tạo ca", description: "Tạo ca nháp hoặc ca đã xuất bản.", group: "workforce", assignableTo: allConfigurableRoles, dependsOn: ["shifts.read_team"] },
  { key: "shifts.publish", label: "Xuất bản ca", description: "Xuất bản ca nháp sau khi kiểm tra điều kiện.", group: "workforce", assignableTo: allConfigurableRoles, dependsOn: ["shifts.read_team"] },
  { key: "shifts.adjust", label: "Điều chỉnh ca", description: "Điều chỉnh ca có lý do và audit.", group: "workforce", assignableTo: allConfigurableRoles, dependsOn: ["shifts.read_team"] },
  { key: "shifts.cancel", label: "Hủy ca", description: "Hủy ca khi đáp ứng điều kiện nghiệp vụ.", group: "workforce", assignableTo: allConfigurableRoles, dependsOn: ["shifts.read_team"] },
  { key: "requests.leave.review", label: "Duyệt nghỉ", description: "Duyệt hoặc từ chối yêu cầu nghỉ của cấp dưới.", group: "workforce", assignableTo: allConfigurableRoles, dependsOn: ["people.read"] },
  { key: "requests.correction.review", label: "Duyệt yêu cầu sửa công", description: "Duyệt yêu cầu correction của cấp dưới.", group: "attendance", assignableTo: allConfigurableRoles, dependsOn: ["people.read"] },
  { key: "requests.swap.apply", label: "Duyệt và áp dụng đổi ca", description: "Áp dụng đổi ca nguyên tử trong phạm vi được phép.", group: "workforce", assignableTo: allConfigurableRoles },
  { key: "attendance.review", label: "Duyệt ngoại lệ chấm công", description: "Duyệt hoặc từ chối ngoại lệ chấm công của cấp dưới.", group: "attendance", assignableTo: allConfigurableRoles, dependsOn: ["people.read"] },
  { key: "attendance.correct", label: "Sửa công", description: "Tạo correction append-only cho cấp dưới.", group: "attendance", assignableTo: allConfigurableRoles, dependsOn: ["attendance.review"] },
  { key: "attendance.evidence.read", label: "Xem ảnh và GPS", description: "Xem bằng chứng chấm công chưa hết hạn của cấp dưới.", group: "attendance", assignableTo: allConfigurableRoles, dependsOn: ["attendance.review"] },
  { key: "payroll.read", label: "Xem báo cáo công và lương", description: "Xem báo cáo công và dữ liệu lương trong phạm vi cửa hàng.", group: "payroll", assignableTo: allConfigurableRoles },
  { key: "payroll.finalize", label: "Chốt kỳ lương", description: "Chốt snapshot kỳ lương khi đủ điều kiện.", group: "payroll", assignableTo: allConfigurableRoles, dependsOn: ["payroll.read"] },
  { key: "reports.export", label: "Xuất báo cáo", description: "Xuất báo cáo công hoặc lương đã được bảo vệ.", group: "payroll", assignableTo: allConfigurableRoles, dependsOn: ["payroll.read"] },
  { key: "checklists.manage", label: "Quản lý checklist", description: "Theo dõi và cập nhật checklist vận hành trong phạm vi.", group: "operations", assignableTo: allConfigurableRoles },
  { key: "incidents.transition", label: "Xử lý sự cố", description: "Chuyển trạng thái sự cố theo vòng đời hợp lệ.", group: "operations", assignableTo: allConfigurableRoles },
  { key: "handovers.manage", label: "Quản lý bàn giao", description: "Tạo, tiếp nhận và xác nhận bàn giao theo ca.", group: "operations", assignableTo: allConfigurableRoles },
  { key: "menu.manage", label: "Quản lý menu", description: "Tạo, sửa và bật/tắt món cùng lựa chọn.", group: "ordering", assignableTo: allConfigurableRoles },
  { key: "orders.read", label: "Xem đơn hàng", description: "Xem đơn đặt món của cửa hàng.", group: "ordering", assignableTo: allConfigurableRoles },
  { key: "orders.transition", label: "Cập nhật trạng thái đơn", description: "Chuyển đơn theo vòng đời hợp lệ.", group: "ordering", assignableTo: allConfigurableRoles, dependsOn: ["orders.read"] },
  { key: "orders.cancel", label: "Hủy đơn", description: "Hủy đơn với reason code bắt buộc khi đã pha.", group: "ordering", assignableTo: allConfigurableRoles, dependsOn: ["orders.read"] },
  { key: "ordering.availability.manage", label: "Mở hoặc tạm dừng nhận đơn", description: "Điều chỉnh trạng thái nhận đơn của cửa hàng.", group: "ordering", assignableTo: allConfigurableRoles, dependsOn: ["orders.read"] },
];

const managerDefaults = permissionKeys;
const teamLeadDefaults: readonly PermissionKey[] = [
  "requests.swap.apply",
  "checklists.manage",
  "incidents.transition",
  "handovers.manage",
];

export function defaultPermissionsForRole(role: ActorRole): readonly PermissionKey[] {
  if (role === "owner") return permissionKeys;
  if (role === "manager") return managerDefaults;
  if (role === "team_lead") return teamLeadDefaults;
  return [];
}

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === "string" && permissionKeys.includes(value as PermissionKey);
}

export function validateRolePermissions(
  role: ConfigurableRole | string,
  requested: readonly string[],
  options?: { isCustom?: boolean },
) {
  const unique = [...new Set(requested)];
  const definitions = new Map(permissionCatalog.map((item) => [item.key, item]));
  const isCustom = options?.isCustom || (role !== "manager" && role !== "team_lead" && role !== "employee");
  for (const permission of unique) {
    const definition = definitions.get(permission as PermissionKey);
    if (!definition) {
      throw new Error(`permission_not_assignable:${permission}`);
    }
    if (!isCustom && !definition.assignableTo.includes(role as ConfigurableRole)) {
      throw new Error(`permission_not_assignable:${permission}`);
    }
  }
  const selected = new Set(unique);
  for (const permission of unique) {
    for (const dependency of definitions.get(permission as PermissionKey)?.dependsOn ?? []) {
      if (!selected.has(dependency)) throw new Error(`permission_dependency:${permission}:${dependency}`);
    }
  }
  return unique as PermissionKey[];
}

