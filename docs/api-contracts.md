# Hợp đồng API và bản đồ nguồn

Cập nhật: 2026-10-13. Đây là chuẩn review và bản đồ truy vết, không phải OpenAPI đã được kiểm chứng.
Đọc route tại baseline mới trước tạo client; không copy payload từ báo cáo lịch sử.

## Nguyên tắc

- Input runtime validation: type, bounds, enum, ngày giờ, whitelist fields.
- Actor/store từ verified identity/membership; target resource kiểm tra scope.
- Mutation trạng thái kiểm tra expected state/revision; ghi audit/notification cùng transaction phù hợp.
- Idempotency khác optimistic concurrency: revision tránh stale write; không tự bảo đảm retry trả cùng response.
- Mỗi action khai báo: auth/role, request, response, errors, side effects, replay và giới hạn.
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
| Checklist | Routine type; shift routine yêu cầu shift/scope; update lưu actor và business date/shift |
| Bàn giao | POST yêu cầu UUID `idempotencyKey`; cùng key/cùng payload trả bản ghi cũ, khác payload trả `409 idempotency_conflict`; receiver hoặc next shift; acknowledge idempotent; check-in bị gate trừ bypass có role/lý do/audit |
| Lương | Dùng rate history theo khoảng hiệu lực, floor 15 phút, round total 1.000 VND; finalize trả conflict khi thiếu rate |
| Đơn | Create yêu cầu `expectedTotal`; tổng hiện tại khác trả `409 price_changed` kèm `currentTotal`; cancel trước completed; preparing/ready cần reason code enum; history và spoilage side effect trong cùng guard |
| Retention | Batch idempotent cho expiry 90 ngày, anonymization order 180 ngày và record count/failure/remaining không lộ PII |

## Mẫu contract cho thay đổi

Method/path; operation; rule/decision ID; actor/target/self-approval scope; input schema; expected revision/state; success result; errors; idempotency key/payload conflict; transaction boundary; external partial failure; cache/rate limit; audit/notification; tests.
Không đổi API/schema chỉ bằng việc ghi mẫu này. Contract chi tiết phải cùng PR với implementation/tests tương ứng.
