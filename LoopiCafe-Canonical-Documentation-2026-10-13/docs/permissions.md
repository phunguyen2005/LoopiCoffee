# Phân quyền và phạm vi dữ liệu

Cập nhật: 2026-10-13. Baseline đọc source: 888495ba3fddf4798b80f9a1cbe4aec65c0991b8.
DEC-001 đã được chấp nhận. Bảng “quyền đích” là policy bắt buộc; bảng “source hiện tại” chỉ ghi chênh lệch đã quan sát, không chứng nhận endpoint.

## Vai trò

OWNER → owner; MANAGER → manager; STAFF thông thường → employee.
team_lead là **Trưởng ca vận hành**, không tự đồng nhất với toàn bộ STAFF và không phải MANAGER thu nhỏ.
system_admin là tài khoản kỹ thuật tách khỏi nghiệp vụ; không được bypass store hoặc thao tác dữ liệu vận hành.
CUSTOMER không cần tài khoản, được cấp quyền đúng đơn qua receipt secret.

## Ma trận quyền đích đã chốt

| Hành động | employee | team_lead | manager | owner | system_admin |
|---|---|---|---|---|---|
| Xem ca cá nhân, chấm công, checklist, tạo sự cố/bàn giao/request | Có, dữ liệu của mình/scope ca | Có | Có | Có nếu tham gia công | Không |
| Tạo/publish/sửa/hủy ca | Không | Không mặc định; chỉ áp dụng swap cấp dưới theo DEC-003 | Có | Có | Không |
| Duyệt nghỉ | Không | Không | Có với cấp dưới, không tự duyệt | Có với người khác | Không |
| Duyệt và áp dụng swap | Không | Có với employee cấp dưới | Có với cấp dưới | Có với người khác | Không |
| Sửa/duyệt công | Không | Không | Có với cấp dưới, không tự duyệt | Có; sole-owner exception theo DEC-001 | Không |
| Đọc ảnh/GPS bằng chứng | Không | Không | Có theo scope | Có theo scope | Không |
| Quản lý checklist ca/sự cố/bàn giao | Thực hiện trong scope | Có | Có | Có | Không |
| Xem/chốt kỳ lương | Không | Không | Có | Có | Không |
| Mở lại kỳ finalized | Không | Không | Không | Có | Không |
| Quản lý menu/đơn và hủy đơn | Không mặc định | Không mặc định | Có | Có | Không |
| Quản lý tài khoản nghiệp vụ | Không | Không | Cấp dưới, trừ owner/manager/system_admin | Trừ system_admin và owner cuối cùng | Không |
| Cấu hình cửa hàng/audit nghiệp vụ | Không | Không | Không | Có | Không |
| Hạ tầng/migration/log kỹ thuật theo runbook | Không | Không | Không | Không mặc định | Có, không can thiệp nghiệp vụ |

Quyền “Có” luôn yêu cầu membership active, same-store/resource scope, expected state/revision và cấm self-approval. UI chỉ phản ánh policy; server/application mới là điểm cưỡng chế.

## Chênh lệch source hiện tại

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
- Quyền xem tổng hợp không tự cấp quyền xem ảnh/GPS hoặc mức lương người khác.
- Test customer/anonymous/employee/team_lead/manager/owner/system_admin, self-target, tài khoản khóa và hai store fixture.
- Không thay đổi quyền vì ẩn/hiện menu; UI phản ánh quyền server.

## Việc triển khai còn thiếu

- Thu hẹp quyền `team_lead` tại route/application cho requests, attendance và shifts.
- Chặn `system_admin` tại mọi business boundary, không chỉ navigation.
- Thêm self-approval guard và sole-owner correction workflow.
- Cập nhật navigation theo quyền đích và test denial ở API/E2E.

Bảng này phải được cập nhật cùng PR đổi quyền; evidence runtime ghi riêng tại acceptance matrix.
