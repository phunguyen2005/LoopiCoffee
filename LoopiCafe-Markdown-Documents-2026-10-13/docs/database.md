# Database — D1 và Drizzle

Cập nhật: 2026-10-13. Model: db/schema.ts; migration SQL và metadata: drizzle/.
Luồng apply local: tooling/local.mjs dùng Wrangler D1 migrations. Không suy ra mọi môi trường dùng Drizzle SDK migrator.

## Mô hình nghiệp vụ

| Nhóm | Bảng hiện có tiêu biểu |
|---|---|
| Nhân sự/cấu hình | stores, employees, employee_consents, attendance_rules |
| Ca/yêu cầu | shifts, requests, notifications |
| Công/bằng chứng | attendance_capture_sessions, attendance_sessions, attendance_events, attendance_locations, attendance_photos, attendance_exceptions, attendance_corrections |
| Lương | payroll_periods, payroll_entries, payroll_adjustments |
| Vận hành | checklist_items, checklist_executions, incidents, handovers, audit_events |
| Đặt món | menu_categories, menu_items, menu_options, customer_orders, order_items, order_status_history, store_ordering_settings, order_rate_limits |

## Mô hình đích theo quyết định đã chốt

Các tên dưới đây là contract dữ liệu tối thiểu; migration cụ thể phải được review riêng và không sửa migration đã áp dụng:

- `shifts.status` hỗ trợ `draft`, `published`, `completed`, `cancelled`; draft không được tham gia truy vấn lịch cá nhân/chấm công.
- Requests cần trạng thái `approved_pending_apply`, `applied`, `withdrawn`, liên kết hai shift khi swap và revision/actor cho thao tác áp dụng.
- Attendance cần biểu diễn overtime được duyệt, `MISSING_CHECKOUT`, approved minutes và sole-owner self-correction audit metadata.
- Checklist item/execution cần `routine_type` (`daily_routine`/`shift_routine`) và nullable `shift_id` với constraint phù hợp loại.
- Handover cần `receiver_employee_id` hoặc `next_shift_id`, `acknowledged_by`, `acknowledged_at` và audit cho bypass.
- Bổ sung rate history có employee ID, compensation type/rate integer VND, khoảng hiệu lực nửa mở `[effective_from,effective_to)`, actor/audit và guard chống overlap.
- Order cancellation cần reason code chuẩn hóa và dữ liệu hao hụt truy vết được; PII order cần mốc/anonymization state cho job 180 ngày.
- Retention metadata phải tách expiry của ảnh/GPS, trạng thái xóa/retry và không buộc xóa attendance event.

Quan hệ khái niệm: store → employee/shift; shift → session → event → evidence; period → payroll entry; order → item/status history.
Đây không phải khẳng định mọi liên kết có FK vật lý. Kiểm tra schema và PRAGMA trên chuỗi migrations.

## Bất biến

- Tiền lưu integer VND. Thời lượng lương làm tròn xuống block 15 phút sau clip/approved overtime; tổng lương cuối kỳ theo nhân viên làm tròn số học đến 1.000 VND, dư từ 500 làm tròn lên.
- Timestamp dùng biểu diễn UTC nhất quán; ngày nghiệp vụ Asia/Ho_Chi_Minh. Dùng khoảng nửa mở [start,end) khi chia kỳ.
- Lưu mapping Supabase subject với nhân viên; không coi email mutable là ID ổn định lâu dài.
- Một phiên mở/nhân viên theo policy; event/capture/request key có constraint tương ứng.
- Snapshot đơn/lương giữ lịch sử; correction append-only.
- Rate history cùng loại của một nhân viên không chồng khoảng hiệu lực; legacy thiếu rate chặn finalize thay vì fallback im lặng.
- FK/unique/check bảo vệ invariant thực; không áp mục tiêu “mọi bảng đều phải có CHECK”.
- Index theo query plan và tải thực; không kết luận full scan luôn là lỗi hiệu năng.
- Khóa kỳ và revision phải bảo vệ cả các ghi liên quan, không chỉ nút UI.
- Retention: ảnh/GPS 90 ngày; công/lương/audit/vận hành tối thiểu 3 năm; PII đơn hàng ẩn danh sau 180 ngày. Backup/restore phải chạy lại expiry/anonymization trước khi mở truy cập.

## Migration

Chuỗi source quan sát đến 0014_indexes_and_perf.sql. Đây không phải xác nhận môi trường nào đã áp dụng.
Không sửa/xóa migration đã áp dụng trong môi trường dùng chung. Không tự ghi ledger để che drift.
Test fresh install và upgrade dữ liệu đại diện bằng runner triển khai thực; so cột/type/null/default, unique/FK/check/index/trigger và journal.
Rebuild bảng phải bảo toàn data, FK, index, trigger và có kiểm tra trước/sau.
Xem [database operations](database-operations.md).
