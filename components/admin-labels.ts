export const adminActionLabels: Record<string, string> = {
  "account.created": "Tạo tài khoản",
  "account.password_reset": "Cấp mật khẩu tạm",
  "account.invite_resent": "Gửi lại lời mời",
  "employee.access_updated": "Đổi vai trò hoặc trạng thái",
  "rbac.permissions_updated": "Cập nhật bộ quyền",
  "rbac.custom_role_created": "Tạo vai trò tùy chỉnh",
  "rbac.custom_role_updated": "Sửa vai trò tùy chỉnh",
  "rbac.custom_role_archived": "Lưu trữ vai trò tùy chỉnh",
};

export function adminActionLabel(action: string) {
  return adminActionLabels[action] ?? action;
}
