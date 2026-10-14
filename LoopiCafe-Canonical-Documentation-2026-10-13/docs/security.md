# Bảo mật và dữ liệu riêng tư

Cập nhật: 2026-10-13. Đây là yêu cầu kiểm soát; đạt hay chưa phải có evidence.

## Danh tính và quyền

Xác minh session/token Supabase tại server theo cấu hình provider. Membership D1 quyết định quyền ứng dụng.
Không tin raw identity headers từ client, role/user/store tự khai, hoặc metadata người dùng có thể sửa để áp đặt quyền.
Kiểm tra active status và resource scope; bảo vệ owner cuối cùng. Cờ bắt buộc đổi mật khẩu phải do server quản lý.
Chặn self-approval tại server. `team_lead` chỉ có quyền Trưởng ca vận hành theo DEC-001; `system_admin` không có quyền business data và không được dùng làm bypass store.
Sole-owner self-correction là ngoại lệ tách riêng, bắt buộc before/after, lý do, high-priority append-only audit và xuất hiện trong đối soát.
Chính sách cache identity phải nêu độ trễ thu hồi được chấp nhận; không thay provider lookup bằng JWT-only mà bỏ kiểm tra vòng đời tài khoản.

## HTTP và dữ liệu

Validate type, size, range, enum, timestamp; parameterize SQL; chống mass assignment.
Bảo vệ mutation theo mô hình cookie/origin/CSRF thực. Thiếu Origin không tự được phép; fallback phải validate và có test.
Chỉ tin proxy headers khi ingress đáng tin cậy; không dùng x-forwarded-for tùy ý làm căn cứ bảo mật.
Lỗi trả message/code an toàn và request ID phù hợp; không trả SQL/token/stack nội bộ.
Rate limit public/auth theo boundary thực, không bỏ chống abuse chỉ để đạt số DB writes = 0.
API dữ liệu nhạy cảm mặc định private/no-store; thay cache cần review quyền, expiry và logout trên thiết bị dùng chung.

## Ảnh, vị trí và retention

R2 private; retrieval kiểm tra quyền và hạn lưu trước trả nội dung, kể cả phản hồi 304.
Upload kiểm tra bytes/type/size/dimensions/cấu trúc theo threat model; thay decoder phải bảo toàn kiểm tra ảnh malformed/truncated.
Không log ảnh, tọa độ chính xác, token, signed URL, password hoặc PII không cần thiết.
Chỉ lấy camera/GPS sau thao tác; có thông báo và luồng giải trình.
Ảnh và tọa độ chấm công có hạn tối đa 90 ngày. Hết hạn phải chặn đọc ngay, kể cả khi object chưa được job xóa vật lý.
Expired access và physical deletion khác nhau; scheduler phải được vận hành và giám sát.
Không xóa event công chỉ vì ảnh/GPS hết hạn; bảo toàn retry metadata khi R2 deletion lỗi.
Attendance/correction, payroll snapshot, audit và lịch sử vận hành lưu tối thiểu 3 năm. Sau 180 ngày phải ẩn danh tên, điện thoại và ghi chú PII của customer order; không log giá trị trước/sau khi mask.
Restore từ backup phải áp lại expiry/anonymization trước khi cấp quyền truy cập thông thường; backup không được dùng để né retention.

## Đơn hàng và export

Receipt secret chỉ cấp quyền một đơn; không phone-only history. Server sở hữu giá và chuyển trạng thái.
CUSTOMER không tự hủy sau khi gửi. Hủy preparing/ready chỉ qua role xử lý đơn được cấp quyền, reason code chuẩn hóa và audit/status history.
CSV/Excel output phải chống công thức từ input không tin cậy; kiểm tra đúng quyền và dữ liệu export.

## Secrets và sự cố

Secret dùng binding/ignored env; không đưa dữ liệu thật vào fixture.
Nếu phát hiện credential đã bị lộ: loại khỏi source không đồng nghĩa thu hồi. Báo người vận hành, giới hạn tác động, theo dõi thu hồi/rotation và lịch sử theo quyền được cấp.
Không khai thác production hoặc tự rotate trong tác vụ audit.
Kiểm chứng trước khi ghi “an toàn”; không khẳng định tuân thủ pháp luật chỉ từ checklist.
