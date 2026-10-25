# Hợp đồng API và bản đồ nguồn

Cập nhật: 2026-10-13. Đây là chuẩn review và bản đồ truy vết, không phải OpenAPI đã được kiểm chứng.
Đọc route tại baseline mới trước tạo client; không copy payload từ báo cáo lịch sử.

## Nguyên tắc

- Input runtime validation: type, bounds, enum, ngày giờ, whitelist fields.
- Actor/store từ verified identity/membership; target resource kiểm tra scope.
- Mutation trạng thái kiểm tra expected state/revision; ghi audit/notification cùng transaction phù hợp.
- Idempotency khác optimistic concurrency: revision tránh stale write; không tự bảo đảm retry trả cùng response.
- Mỗi action khai báo: auth/role, request, response, errors, side effects, replay và giới hạn.

## Hợp đồng quản trị và RBAC (DEC-010)

| Endpoint | Contract |
|---|---|
| `GET /api/me/permissions` | role, permissions hiệu lực, revision; `private, no-store` |
| `GET /api/admin/roles` | catalog và sets; admin/owner đọc, chỉ admin sửa |
| `PUT /api/admin/roles/{role}/permissions` | full set, `expectedRevision`, reason; chỉ manager/team_lead và catalog cho phép |
| `/api/admin/accounts` | chỉ identity, role, status, login/activation; không trả job/pay/attendance/evidence |
| `/api/team` | hồ sơ nghiệp vụ và rate history; OWNER có action riêng để tạm khóa, cho hoạt động lại hoặc đánh dấu nghỉ việc đối với tài khoản cấp dưới, kèm revision và lý do |
| `GET /api/admin/audit` | whitelist sự kiện quản trị và metadata đã lọc |

Mã lỗi chuẩn: `permission_denied`, `permission_conflict`, `permission_not_assignable`, `last_owner_protected`, `reauthentication_required`, `account_conflict`, `operation_pending`. Account mutation yêu cầu idempotency key; retry cùng key/cùng payload tiếp tục hoặc replay, payload khác trả conflict.
- Error an toàn gồm error và code/requestId phù hợp; không đưa stack/SQL/secret ra client.
- 400/422 input; 401 chưa xác thực; 403 thiếu quyền; 404 không tồn tại/không được tiết lộ; 409 conflict; 413 quá lớn; 429 rate limit; 503 tạm lỗi.
- Dữ liệu nhạy cảm dùng policy private/no-store; không suy ra response cache từ handler đơn lẻ nếu còn global headers.
- Pagination phải có giới hạn và cách nhận biết còn dữ liệu; sort ổn định.
- Self-approval phải bị chặn ở application boundary; sole-owner self-correction là operation riêng, không dùng chung action duyệt request.
- State mới chỉ được trả thành công sau khi dữ liệu liên quan đã đổi nguyên tử; `approved_pending_apply` không được trả như `applied`.

## Nguồn theo workflow

| Workflow | HTTP boundary | Policy/application |
|---|---|---|
| Ca | app/api/shifts/route.ts | modules/operations/application/manage-shifts.ts |
| Yêu cầu | app/api/requests/route.ts | modules/operations/application/decide-request.ts |
| Công | app/api/attendance/actions/route.ts | modules/attendance/ |
| Sửa/review công | app/api/attendance/review/route.ts | modules/attendance/application/correct-attendance.ts |
| Lương | app/api/reports/payroll/route.ts | modules/payroll/application/change-period.ts |
| Nhân sự | app/api/admin/accounts/route.ts, app/api/team/route.ts | modules/people/ |
| Đặt/theo dõi đơn | app/api/order/ | modules/ordering/application/ |
| Đổi trạng thái đơn | app/api/owner/orders/[id]/status/route.ts | modules/ordering/application/change-status.ts |

## Contract bắt buộc cho quyết định đã chốt

| Workflow | Contract đích |
|---|---|
| Lịch | Draft/create/update riêng với publish; employee GET loại draft; mutation sau cut-off 12 giờ yêu cầu adjustment reason và audit |
| Request | `withdraw` chỉ từ pending; swap có hai shift/revision và action apply nguyên tử; self-target trả 403 |
| Công | Rule 5/15 phút, overtime approval, auto-close +4 giờ, missing checkout chưa có approved minutes; sole-owner correction có high-priority audit |

Correction request mới phải gửi `correctionSessionId`, `correctionAction`, `adjustedTime`, `expectedRevision` và `correctionEventId` khi sửa một raw event có sẵn. Trường hợp quên checkout cho phép `correctionEventId` trống nhưng bắt buộc action `check_out`. Khi duyệt, server kiểm tra store/resource/revision/kỳ lương/overlap, ghi correction append-only liên kết `source_request_id`, tăng revision và chỉ sau đó chuyển request sang `applied`.
| Checklist | Routine type; shift routine yêu cầu shift/scope; danh sách hoạt động chỉ lấy ca đang diễn ra hoặc ca sắp tới được giao; update lưu actor và business date/shift; create/update checklist ca sau `shift.ends_at` trả `409 shift_ended` |
| Bàn giao | POST yêu cầu UUID `idempotencyKey`; cùng key/cùng payload trả bản ghi cũ, khác payload trả `409 idempotency_conflict`; receiver hoặc next shift; acknowledge idempotent; check-in bị gate trừ bypass có role/lý do/audit |
| Lương | Dùng rate history theo khoảng hiệu lực, floor 15 phút, round total 1.000 VND; finalize trả conflict khi thiếu rate |
| Đơn | Create yêu cầu `expectedTotal`; tổng hiện tại khác trả `409 price_changed` kèm `currentTotal`; cancel từ pending/accepted không bắt buộc reason code; preparing/ready bắt buộc một reason code enum; history và trạng thái đơn ghi cùng batch guard. `GET /api/owner/orders` trả `spoilage` + `wastageReport` tách riêng, dùng thời điểm huỷ theo giờ Việt Nam; `estimatedRetailValue` là giá bán lẻ snapshot, không phải doanh thu thực thu/chi phí nguyên liệu. |
| Retention | Batch idempotent cho expiry 90 ngày, anonymization order 180 ngày và record count/failure/remaining không lộ PII |

## Mẫu contract cho thay đổi

Method/path; operation; rule/decision ID; actor/target/self-approval scope; input schema; expected revision/state; success result; errors; idempotency key/payload conflict; transaction boundary; external partial failure; cache/rate limit; audit/notification; tests.
Không đổi API/schema chỉ bằng việc ghi mẫu này. Contract chi tiết phải cùng PR với implementation/tests tương ứng.
