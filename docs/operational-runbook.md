# Runbook vận hành pilot

Cập nhật: 2026-10-13. Chưa có diễn tập hoặc deployment được thực hiện trong đợt tài liệu này.
Đọc [database operations](database-operations.md) và [security](security.md). Không coi tài liệu là quyền thao tác hệ thống thật.

## Trước pilot

Ghi người phụ trách, môi trường, app commit, migration head, binding DB, Supabase private evidence bucket, Auth URL/redirect đã kiểm tra, secret inventory (chỉ tên), monitoring và kế hoạch rollback. Theo DEC-016, storage dùng Supabase thay R2; xem [triển khai Free](free-production-deployment.md).
DEC-008/009 đã được chốt. Mỗi release record vẫn phải ghi tải pilot dự kiến, người trực, rollback owner, RPO/RTO được chủ dự án chấp nhận; không sao chép default giả.
Hoàn thành [acceptance matrix](acceptance-matrix.md); không dùng fixture thật lẫn demo.

## Backup/restore drill

1. Chọn source/target rõ ID; target phục hồi phải độc lập, không đè môi trường đang nhận ghi.
2. Backup/export bằng công cụ nền tảng được hỗ trợ cho môi trường đó; lưu ngoài Git với quyền hạn phù hợp.
3. Restore vào target thử; kiểm tra schema/migration/FK, số bản ghi và invariant công/lương/order.
4. Đối chiếu liên kết metadata D1 với object Supabase Storage; backup D1 không tự backup ảnh hoặc tài khoản Auth.
5. Chạy smoke đọc và mutation bằng dữ liệu thử; ghi thời gian, chênh lệch, kết quả và người review.
6. Chỉ kết luận restore-ready khi có biên bản; số hàng bằng nhau chưa đủ chứng minh toàn vẹn.
7. Trước khi mở quyền đọc target phục hồi, chạy lại expiry ảnh/GPS và anonymization PII order; xác minh dữ liệu quá hạn không sống lại từ backup.

## Retention

POST /api/cron/retention dùng bearer secret phía scheduler; không để secret trong URL/log/source.
Trước khi bật: kiểm quyền endpoint, hạn truy cập, batch bounds thực và dữ liệu thử hết hạn.
Theo dõi status, remaining/failures theo response thực; retry có giới hạn và giãn cách, tránh chạy chồng.
Supabase Storage xóa lỗi phải giữ thông tin retry; không xóa event công. Kiểm tra metadata/object sau chạy.
Lịch chính sách: ảnh/GPS tối đa 90 ngày; PII order ẩn danh sau 180 ngày; attendance/correction, payroll snapshot, audit và lịch sử vận hành tối thiểu 3 năm.
Anonymization order phải mask tên, điện thoại và ghi chú PII nhưng giữ số liệu món/giá/trạng thái không định danh; không ghi PII cũ vào log job.
Endpoint tồn tại không chứng minh có scheduler. Không tự gọi cleanup dữ liệu thật khi đang audit.

## Release gate

Trước pilot, đính kèm evidence cho đúng commit/môi trường:

1. Core E2E draft/publish ca → check-in/out → exception → review/correction bởi người khác → finalize payroll.
2. Integrity cho overlap/race, ca qua đêm/tháng, rounding/rate history/snapshot và store isolation.
3. Auth/RBAC/last-owner/receipt/private Storage expiry và retention drill.
4. Mobile 320–390 px, permission denied, keyboard/focus, error/retry.
5. Backup/restore staging ít nhất một lần với đối chiếu D1–Supabase Storage và retention sau restore.

Không mở pilot khi còn blocker bảo mật/toàn vẹn dữ liệu. Waiver phải có owner, lý do, phạm vi, thời hạn và phương án giảm thiểu.

## Provider hoặc storage lỗi

- D1/Storage partial write: xác định event/object đã lưu; không retry như thao tác mới nếu kết quả chưa rõ.
- Auth/D1 lệch trạng thái: dùng operator retry/reconciliation có audit, không tự cấp quyền để “sửa đăng nhập”.
- DB errors/migration failure: dừng rollout, giữ evidence đã che dữ liệu, phục hồi theo kế hoạch bảo toàn giao dịch mới.
- Credential bị lộ: báo owner vận hành và theo dõi thu hồi; không ghi raw secret vào incident.

## Hồ sơ vận hành

Run ID; thời gian; actor; môi trường; commit/schema version; mục tiêu; thao tác; expected/actual; kết quả; ảnh hưởng dữ liệu; rollback; evidence; follow-up.
Không đặt lịch/automation hoặc deploy chỉ vì runbook mô tả các bước.
