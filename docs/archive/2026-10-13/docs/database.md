# Database — Cloudflare D1 + Drizzle

**Hiện trạng đã xác minh:** schema khai báo nằm tại `db/schema.ts`; migration D1 có phiên bản nằm trong `drizzle/`. Danh sách entity khái niệm dưới đây vẫn không được coi là tên bảng thực tế nếu chưa đối chiếu hai nguồn này. Quy trình vận hành chi tiết xem tại [`database-operations.md`](database-operations.md).

## Nguyên tắc bắt buộc

- D1 là nguồn dữ liệu nghiệp vụ; thay đổi schema qua Drizzle migrations được review.
- Không sửa migration đã áp dụng ở môi trường dùng chung; tạo migration mới.
- Dùng foreign key/unique/check/index phù hợp, kiểm tra hỗ trợ thực tế của D1/SQLite.
- Tách user identity của Supabase khỏi hồ sơ nhân viên; lưu mapping ID và role phía server.
- Tiền dùng đơn vị nguyên nhỏ nhất (VND) hoặc biểu diễn decimal được xác định rõ; không dùng float để tính tiền.
- Dữ liệu thời gian phải có định dạng chuẩn và cách chuyển timezone nhất quán.

## Nhóm dữ liệu cần đối chiếu

| Nhóm | Entity khái niệm |
|---|---|
| Identity | users, roles/memberships, account status |
| Scheduling | shifts, assignments, leave/adjustment requests |
| Attendance | sessions, check events, evidence metadata, review decisions |
| Operations | checklists, checklist completions, incidents, handovers |
| Payroll | hourly rates/history, periods, immutable snapshots, versions |
| Commerce | categories, menu items, orders, order items, status history |
| Governance | audit logs, notifications, retention/deletion records |

## Constraints quan trọng

- Ngăn duplicate active attendance khi không hợp lệ theo chính sách.
- Đảm bảo idempotency cho create order và check-in/out khi retry.
- Lưu order item snapshot (`name`, `unit_price`, `quantity`, `line_total`) để bảo toàn lịch sử.
- Lưu người thao tác, thời gian, old/new state phù hợp cho audit, tránh log PII quá mức.
- Tính nhất quán cho việc khóa kỳ lương và ghi snapshot; ngăn cập nhật bản khóa trái phép.
- Đặt index theo truy vấn thực tế, không tự tạo index hàng loạt.

## Quy trình migration an toàn

1. Đọc schema và migrations hiện hữu, kiểm tra trạng thái môi trường.
2. Thiết kế thay đổi backward-compatible nếu có thể; backup trước thao tác dữ liệu rủi ro.
3. Tạo migration và test trên D1/SQLite emulator với dữ liệu mẫu không nhạy cảm.
4. Kiểm tra constraint, index, foreign key và truy vấn liên quan.
5. Triển khai theo kế hoạch; xác minh sau migration; có phương án khôi phục dữ liệu.

Không chạy reset, migration phá hủy hoặc migration production chỉ dựa trên tài liệu này. Luôn dùng preflight và quy trình môi trường tương ứng trong `database-operations.md`.

## Audit checklist

- [ ] Rà soát thiếu unique/FK/check và orphan records.
- [ ] Kiểm tra truy vấn N+1, full scans và indexes.
- [ ] Kiểm tra concurrency/race condition tại thao tác trạng thái.
- [ ] Kiểm tra mapping Supabase subject → user nội bộ.
- [ ] Kiểm tra retention và xóa dữ liệu/ảnh liên quan.
- [ ] Kiểm tra migration drift giữa local/staging/production.

