# Security & Privacy — LoopiCafe

> Checklist kiểm soát bắt buộc; chỉ đánh dấu đạt sau khi có bằng chứng code và test.

## Authentication & Authorization

- Verify Supabase session/JWT phía server đúng audience/issuer/signature/expiry theo cấu hình thực tế.
- Không lấy `role`, `userId`, `isOwner` từ client làm căn cứ phân quyền.
- Mỗi endpoint/use case kiểm tra cả quyền theo vai trò **và quyền trên resource** (chống IDOR).
- Nhân viên bị khóa không thể tiếp tục thao tác; không được vô hiệu hóa OWNER cuối cùng.
- Tách public customer routes và authenticated staff routes, không rò dữ liệu nội bộ.

## R2 và dữ liệu nhạy cảm

- Bucket ảnh chấm công private; không lộ key R2 hoặc public object URL.
- Kiểm tra MIME, kích thước, loại tệp và key path khi upload; không tin filename client.
- Chỉ người có quyền được đọc ảnh; URL tạm nếu dùng phải giới hạn thời gian.
- Ảnh, tọa độ, số điện thoại và thông tin nhân sự có thời hạn lưu và cơ chế xóa được xác định.
- Không đưa PII vào logs, analytics, query string hoặc error response khi không cần.

## Public ordering

- Rate limit và chống spam; validation server-side, giới hạn payload.
- Tracking token có entropy đủ mạnh, không đoán được; không dùng order ID tuần tự/số điện thoại như token xác thực.
- Giá, tổng tiền, trạng thái món và chuyển trạng thái đơn do server quyết định.
- Chống tạo đơn lặp khi retry; chống enumeration thông tin đơn.

## Application security

- Validate input/output, chống XSS, injection, CSRF phù hợp mô hình session/cookie, CORS quá rộng.
- Không log secrets, tokens, authorization headers, presigned URLs.
- Bảo vệ exports CSV khỏi formula injection (`=`, `+`, `-`, `@` ở dữ liệu không tin cậy).
- Cấu hình secrets qua environment bindings, không hardcode hoặc commit.
- Audit log cho đổi role, duyệt công, khóa lương, sửa giá, thay đổi đơn quan trọng.

## Quy trình xử lý lỗ hổng

1. Ghi endpoint/file/line, điều kiện khai thác, ảnh hưởng và mức độ.
2. Không thử khai thác phá hoại hoặc dùng dữ liệu thật ngoài quyền được cấp.
3. Ưu tiên Critical/High trước thay đổi thẩm mỹ.
4. Thêm regression test cho lỗi đã sửa; báo cáo phần chưa xác minh.

