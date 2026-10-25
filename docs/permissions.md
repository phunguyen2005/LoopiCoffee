# Phân quyền và phạm vi dữ liệu

Cập nhật: 2026-10-25. Baseline triển khai: working tree chưa commit.
DEC-010, DEC-014 và DEC-015 thay DEC-001 ở phần quản trị tài khoản, vai trò tùy chỉnh và cấp quyền chức năng. Permission catalog trong `modules/people/domain/permissions.ts` là nguồn dùng chung; DB chỉ lưu tập quyền được cấp.

## Vai trò

OWNER → owner; MANAGER → manager; STAFF thông thường → employee; vai trò tùy chỉnh theo cửa hàng → `custom_roles` (`employees.role_id`).
team_lead là **Trưởng ca vận hành**, không tự đồng nhất với toàn bộ STAFF và không phải MANAGER thu nhỏ.
system_admin là tài khoản kỹ thuật tách khỏi nghiệp vụ; không được bypass store hoặc thao tác dữ liệu vận hành.
CUSTOMER không cần tài khoản, được cấp quyền đúng đơn qua receipt secret.

## Ma trận quyền đích đã chốt

| Hành động | employee | team_lead | manager | custom_role (DEC-014) | owner | system_admin |
|---|---|---|---|---|---|---|
| Xem ca cá nhân, chấm công, checklist, tạo sự cố/bàn giao/request | Có, dữ liệu của mình/scope ca | Có | Có | Có nếu tham gia công | Có nếu tham gia công | Không |
| Tạo/publish/sửa/hủy ca & bố trí người thay | Không | Không mặc định; chỉ áp dụng swap cấp dưới theo DEC-003 | Có | Theo quyền `shifts.*` được cấp | Có | Không |
| Duyệt nghỉ | Không | Không | Có với cấp dưới, không tự duyệt | Có với người khác cùng store (trừ Owner/Admin) khi có `requests.leave.review` | Có với người khác | Không |
| Duyệt và áp dụng swap | Không | Có với employee cấp dưới | Có với cấp dưới | Có với người khác cùng store (trừ Owner/Admin) khi có `requests.swap.review/apply` | Có với người khác | Không |
| Sửa/duyệt công | Không | Không | Có với cấp dưới, không tự duyệt | Có với người khác cùng store (trừ Owner/Admin) khi có `attendance.review/correct` | Có; sole-owner exception theo DEC-001 | Không |
| Đọc ảnh/GPS bằng chứng | Không | Không | Có theo scope | Khi có `attendance.evidence.read` | Có theo scope | Không |
| Quản lý checklist ca/sự cố/bàn giao | Thực hiện trong scope | Có | Có | Khi có `checklists.manage` / `incidents.transition` / `handovers.manage` | Có | Không |
| Xem/chốt kỳ lương | Không | Không | Có | Khi có `payroll.read` / `payroll.finalize` | Có | Không |
| Mở lại kỳ finalized | Không | Không | Không | Không (chỉ OWNER) | Có | Không |
| Quản lý menu/đơn và hủy đơn | Không mặc định | Không mặc định | Có | Khi có `menu.manage` / `orders.*` | Có | Không |
| Quản lý tài khoản đăng nhập | Không | Không | Không | Không | Không | Có, trừ admin; OWNER theo guard DEC-010 |
| Quản lý hồ sơ công việc/lương | Không | Theo scope thực hiện | Cấp dưới khi có `people.update` | Cùng store (trừ Owner/Admin/chính mình) khi có `people.update` | Có | Không |
| Cấu hình role-permission & custom role | Không | Không | Không | Không | Chỉ đọc đối soát | Có với manager/team_lead và custom roles trong catalog |
| Xem audit tài khoản/quyền đã lọc | Không | Không | Không | Không | Có | Có |
| Cấu hình cửa hàng/audit nghiệp vụ | Không | Không | Không | Không | Có | Không |
| Hạ tầng/migration/log kỹ thuật theo runbook | Không | Không | Không | Không | Không mặc định | Có, không can thiệp nghiệp vụ |

Quyền “Có” luôn yêu cầu membership active, same-store/resource scope, expected state/revision và cấm self-approval. UI chỉ phản ánh policy; server/application mới là điểm cưỡng chế.

## Catalog RBAC & Vai trò tùy chỉnh (DEC-010 & DEC-014)

- MANAGER có thể được cấu hình từ toàn bộ catalog nghiệp vụ: dashboard, people, shifts, review requests, attendance/evidence, payroll/export, operations, menu/orders.
- `team_lead` chỉ có thể được cấu hình `requests.swap.apply`, `checklists.manage`, `incidents.transition`, `handovers.manage`.
- Vai trò tùy chỉnh (`custom_roles`) theo cửa hàng bắt đầu với 0 quyền nghiệp vụ; `system_admin` được chọn từ toàn bộ catalog nghiệp vụ (phải thỏa mãn dependencies, không có wildcard). Khi được cấp quyền duyệt/cập nhật, vai trò tùy chỉnh được phép thao tác với nhân sự khác trong cùng cửa hàng (kể cả đồng cấp), nhưng tuyệt đối không được tự duyệt chính mình và không được thao tác lên `owner` hoặc `system_admin`.
- Quyền thao tác kéo theo quyền đọc theo dependencies trong catalog; server từ chối tập thiếu phụ thuộc. Chặn lưu trữ (`archive`) vai trò tùy chỉnh khi còn tài khoản được gán; thiếu hoặc lưu trữ vai trò phải fail-closed.
- OWNER cố định toàn bộ quyền nghiệp vụ; employee giữ luồng cá nhân; `system_admin` chỉ dùng API quản trị riêng.

## Baseline source trước DEC-010

| Hành động | employee | team_lead | manager | owner | Nguồn |
|---|---|---|---|---|---|
| Tạo/sửa/hủy ca | Không | Có, chặn target manager/owner | Có | Có | modules/operations/application/manage-shifts.ts |
| Duyệt yêu cầu | Không | Có mọi loại | Có | Có | modules/operations/application/decide-request.ts |
| Sửa công | Không | Có, trái quyền đích | Có | Có | modules/attendance/application/correct-attendance.ts |
| Đọc ảnh bằng chứng | Không | Không | Có | Có | app/api/files/[eventId]/route.ts |
| Chốt kỳ lương | Không | Không | Có | Có | modules/payroll/application/change-period.ts |
| Mở lại kỳ finalized | Không | Không | Không | Có | modules/payroll/application/change-period.ts |
| Đổi trạng thái đơn | Không | Không | Có | Có | modules/ordering/application/change-status.ts |
| Quản lý tài khoản qua domain policy | Không | Không | Cấp dưới, trừ owner/manager/system_admin | Trừ system_admin | modules/people/domain/access.ts |

Source hiện tại chưa triển khai đầy đủ cấm self-approval, role target, draft schedule và các state mới. Chính sách domain không thay thế kiểm tra route/action; đọc cả hai lớp trước thay đổi.

## Bất biến quyền

- Actor lấy từ session được xác minh và membership server; không từ request body.
- Chặn self-approval theo actor ID/email chuẩn hóa; sole-owner self-correction là endpoint/workflow riêng có high-priority audit.
- Resource khác phạm vi trả lỗi không tiết lộ dữ liệu; chọn 403/404 nhất quán.
- Không vô hiệu hóa/hạ quyền OWNER hoạt động cuối cùng.
- Mỗi cửa hàng chỉ có một `system_admin` và một `owner`; Owner không được gán thêm Owner. Tạo/nâng Owner dùng ghi có điều kiện nguyên tử; recovery sửa đúng tài khoản hiện có.
- Quyền xem tổng hợp không tự cấp quyền xem ảnh/GPS hoặc mức lương người khác.
- Test customer/anonymous/employee/team_lead/manager/owner/system_admin, self-target, tài khoản khóa và hai store fixture.
- Không thay đổi quyền vì ẩn/hiện menu; UI phản ánh quyền server.

## Bản đồ enforcement DEC-010

| Nhóm | HTTP/API | Application/scope |
|---|---|---|
| Tài khoản | `/api/admin/accounts` | revision, idempotency, last-owner, recent re-auth, Auth–D1 status |
| Hồ sơ nhân sự | `/api/team` | `people.read/update`, cấp dưới, rate history; chỉ OWNER đổi trạng thái nhân viên khác, có revision/lý do và không áp dụng cho owner/system_admin |
| Lịch/yêu cầu | `/api/shifts`, `/api/requests` | permission theo action + self-approval/cấp bậc/revision |
| Công/bằng chứng | `/api/attendance/review`, `/api/files/*` | review/correct/evidence tách riêng + scope |
| Lương/export | `/api/reports/*` | read/finalize/export tách riêng; reopen vẫn OWNER-only |
| Vận hành | checklist/incidents/handovers | permission quản lý + membership/scope hiện hành |
| Menu/đơn | owner menu/orders APIs | manage/read/transition/cancel tách riêng + state guard |

Các endpoint legacy đổi role/status/lương phải không còn đường vòng. UI chỉ là phản ánh; 403 hoặc focus tab phải buộc tải lại permissions.

Bảng này phải được cập nhật cùng PR đổi quyền; evidence runtime ghi riêng tại acceptance matrix.
