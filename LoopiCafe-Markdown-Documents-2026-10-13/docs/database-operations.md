# Vận hành database và môi trường local

Cập nhật: 2026-10-13. Runbook này không cấp quyền thao tác production.

## Local verification

Yêu cầu Node >=22.13, npm; Docker cho Supabase Auth local. Đọc tooling/local-environment.mjs và tooling/local.mjs trước lần chạy đầu hoặc khi config thay đổi.
Đích dữ liệu thử phải nằm trong thư mục local readiness được tooling xác định và có marker LOCAL_TEST_ENVIRONMENT. Không dùng DB thật hoặc tự nhận thư mục lạ.

1. npm ci — tải dependency, không phải kiểm thử offline.
2. npm run local:doctor — kiểm tra tình trạng; thiếu auth/config ban đầu có thể được báo lỗi.
3. npm run local:auth:start — khởi động Auth local, có thể tải container.
4. npm run local:auth:configure — lưu credential vào ignored file; tooling hiện cũng gọi build. Xác minh exit/result build riêng.
5. npm run local:provision — áp migration và tạo/cập nhật fixture D1/Auth local; có ghi dữ liệu, chỉ dùng môi trường thử.
6. npm run local:doctor, npm run dev — xác minh local rồi mở ứng dụng.
7. npm run check rồi npm run test:e2e — xem [testing](testing.md).

npm run local:migrate chỉ apply D1 local qua Wrangler, không provision nhân sự/Auth.
node tooling/local.mjs seed-menu tạo menu test và migrate local; không thay thế fixture Auth.
Không hiển thị hoặc commit accounts.json, .dev.vars, token hay password.
Không mở Docker daemon không xác thực ra mạng công cộng; kiểm tra cấu hình kết nối Docker/WSL trong tooling với người vận hành.
Không tự reset nếu provisioning lỗi; xác định phase lỗi và đối soát trước retry.

## Preflight dữ liệu hiện có

npm run db:preflight -- <absolute-database-path> là kiểm tra local read-only; chọn bản sao phục hồi khi có dữ liệu thật.
Đọc ledger và đối chiếu toàn bộ schema, không chỉ cột. Runtime-created DB cũ có thể đã có cột 0006; không replay ALTER mù.
Chuỗi hiện có đến 0014. Kiểm tra duplicate email khác hoa/thường trước unique index lower(email).
Không giả lập lịch sử migration hoặc sửa migration đã áp dụng để làm test xanh.

## Rollout môi trường dùng chung

Chỉ thực hiện khi có quyền cho môi trường đích:
1. Ghi database ID, Worker/config version, migration head và người thực hiện.
2. Backup/export bằng cơ chế nền tảng được hỗ trợ; không đưa dữ liệu vào repository.
3. Khôi phục bản backup vào đích thử độc lập và kiểm tra dữ liệu quan trọng.
4. Chạy chuỗi migration với runner thực trên bản sao; kiểm tra FK/constraint/index/trigger, công và snapshot.
5. Chọn thời điểm chuyển đổi; áp schema tương thích trước code phụ thuộc.
6. Smoke auth, lịch, chấm công, sửa công, lương, đơn hàng và retention; lưu evidence.
7. Nếu lỗi, dừng rollout. Rollback code chỉ khi tương thích schema; không khôi phục đè làm mất giao dịch mới.

Scheduler/backup/restore theo [operational runbook](operational-runbook.md); không suy ra đã cấu hình từ việc có endpoint.
