# Runbook quản trị hệ thống và RBAC

Cập nhật: 2026-10-25. Áp dụng DEC-010 và DEC-015. Không dùng các bước này để tự chạy production khi chưa có phê duyệt và backup phù hợp.

## Bootstrap và recovery admin

1. Xác nhận đúng môi trường, store, backup và không có migration đang chạy.
2. Tạo/khôi phục người dùng bằng Supabase Admin API từ server/runbook riêng; service role không xuất hiện ở browser, log hoặc tài liệu evidence.
3. Trong D1, chỉ tạo membership `system_admin` active khi store chưa có Admin, cùng `auth_user_id`; không nâng OWNER qua endpoint công khai và không dùng UI account thông thường để tạo admin.
4. Đăng nhập, xác nhận `/app/admin` tải được nhưng API công/lương/menu/đơn trả `permission_denied`.
5. Ghi người thực hiện, lý do, thời gian, môi trường và kết quả vào security change record bên ngoài audit do chính admin có thể tác động.

Môi trường local có fixture `admin@loopicafe.com` khi demo seed được bật rõ ràng. Fixture này không phải bootstrap production.

## Recovery tài khoản Admin/Owner

1. Xác nhận đúng môi trường và store; kiểm tra D1 theo email chuẩn hóa, role, status, `auth_user_id` và audit trước khi đổi dữ liệu. Không tạo Admin/Owner thứ hai.
2. Đối chiếu người dùng Supabase bằng email đã xác minh. Nếu provider user còn tồn tại nhưng ID lệch, liên kết lại đúng hồ sơ theo runbook server-side và ghi change record; tự động relink chỉ được dùng ở local fixture.
3. Với Owner `invited`, gửi lại lời mời trên chính tài khoản. Với Owner `active` quên mật khẩu, cấp mật khẩu tạm một lần và bắt buộc đổi sau đăng nhập. Không gửi hoặc ghi log mật khẩu qua kênh không được phép.
4. Nếu Admin mất quyền truy cập, dùng service role được giữ trong secret manager để reset/relink đúng Admin hiện có; cần người thực hiện và người đối soát khác nhau trong change record dù hệ thống chỉ có một tài khoản Admin.
5. Sau recovery, đăng nhập thử Admin và Owner, xác nhận landing page, quyền API, refresh/logout, rồi đối chiếu D1–Auth và audit. Thu hồi mọi mật khẩu tạm ngay sau khi đổi.

Phòng ngừa: lưu credential/recovery material trong password manager có kiểm soát, không dùng chung mật khẩu; cảnh báo khi Auth ID lệch hoặc tài khoản đặc quyền chuyển khỏi `active`; kiểm tra khôi phục định kỳ trên staging. Khi Supabase MFA được triển khai, ưu tiên MFA cho hai tài khoản đặc quyền nhưng phải có quy trình recovery được thử trước.

## Triển khai

1. Apply migration mới trên môi trường cô lập; kiểm tra `role_permission_sets` có đúng manager/team_lead cho store và permission seed khớp catalog.
2. Xác nhận có ít nhất một admin active và một OWNER active trước khi bật application mới.
3. Triển khai application đồng bộ; smoke test admin, owner read-only, manager permissions và business denial của admin.
4. Thử thu hồi/cấp lại một quyền manager; request tiếp theo phải thay đổi hành vi mà không đăng nhập lại.
5. Chỉ ghi nghiệm thu khi migration fresh/upgrade, integration và E2E không skip đều PASS tại cùng commit/môi trường.

## Auth–D1 partial failure

- D1 là nguồn role/status áp dụng cho ứng dụng. Operation `failed` phải hiện trên admin dashboard; retry dùng cùng idempotency key và payload sau khi đối chiếu trạng thái.
- Nếu D1 đã đổi nhưng Supabase lỗi, truy cập ứng dụng vẫn theo D1. Retry hoàn tất metadata/ban state ở provider; không tạo thao tác account mới chỉ để che operation cũ.
- Không log mật khẩu tạm. Sau reset, người nhận phải đổi mật khẩu; mọi credential hiển thị chỉ một lần qua kênh được phép.

## Khôi phục bộ quyền

- Đọc revision/audit trước khi thay đổi. Khôi phục bằng full permission set qua API với `expectedRevision` hiện tại và lý do tham chiếu incident/change record.
- Không sửa thẳng `role_permissions` nếu application còn hoạt động. Khi buộc sửa offline, giữ transaction, tăng revision, ghi audit tương đương và kiểm tra dependencies/catalog trước khi mở lại dịch vụ.
- Không rollback application về bản không hiểu RBAC khi chưa đánh giá việc OWNER có thể lấy lại quyền quản trị đăng nhập.
