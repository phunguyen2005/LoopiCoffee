# Business Rules — LoopiCafe

> Đây là **quy tắc mục tiêu/câu hỏi xác minh**, không khẳng định đã có trong code. Những điểm còn mở phải xin quyết định từ chủ dự án trước khi đổi logic.

## Vai trò

- OWNER: quản lý toàn bộ cửa hàng; không được xóa/vô hiệu hóa OWNER cuối cùng.
- MANAGER: phân ca, duyệt yêu cầu, kiểm tra vận hành và báo cáo trong phạm vi được cấp.
- STAFF: chỉ thao tác dữ liệu được cấp và dữ liệu của mình.
- CUSTOMER: menu, đặt món, theo dõi đơn bằng thông tin bí mật riêng của đơn.

## Phân ca và yêu cầu

- Xác minh chính sách ca trùng, ca qua ngày, chỉnh sửa ca đã bắt đầu, đổi lịch sau khi chấm công.
- Đơn nghỉ/điều chỉnh cần trạng thái rõ ràng, người duyệt, thời điểm và lý do; ngăn duyệt lặp hoặc tự duyệt nếu chính sách cấm.
- Mọi sửa đổi ảnh hưởng công/lương phải truy vết được.
- **Ý nghĩa nghiệp vụ khi phê duyệt yêu cầu (BIZ-002)**:
  - Yêu cầu nghỉ một ca (`leave`): Khi được phê duyệt, hệ thống tự động cập nhật ca làm việc tương ứng sang trạng thái nghỉ được duyệt (`approved_leave_request_id`), giảm giờ công kế hoạch và không tính vắng mặt.
  - Đề nghị đổi ca (`swap`) và đề nghị sửa chấm công (`correction`): Khi được phê duyệt, hệ thống ghi nhận sự chấp thuận về mặt chủ trương (`approved in principle`) nhưng **không tự động biến đổi dữ liệu ca làm việc hay dữ liệu chấm công gốc**. Thông báo và phản hồi API ghi rõ cảnh báo Quản lý phải chủ động thực hiện điều chỉnh thủ công tương ứng trên màn hình Lịch làm việc (Schedule) hoặc Chấm công (Attendance). Giao diện hiển thị huy hiệu trạng thái phân biệt rõ ràng giữa nghỉ ca đã áp dụng và đề nghị đổi ca/sửa công đang chờ quản lý thao tác.

## Chấm công

- Thời gian check-in/out lấy từ server; không lấy đồng hồ thiết bị làm nguồn chân lý.
- Ảnh và vị trí chỉ thu thập khi người dùng chủ động thao tác và được thông báo mục đích.
- Thiếu quyền camera/location phải có luồng giải trình, không âm thầm giả lập dữ liệu.
- Khoảng cách địa lý chỉ là chỉ báo để quản lý xem xét, không tự khẳng định gian lận.
- Phải quyết định và test: check-in trùng, check-out không có check-in, ca qua ngày, mất mạng, retry, chỉnh sửa thủ công, timezone và DST ngoài vùng hiện tại.
- Có chính sách lưu/xóa ảnh và vị trí, quyền truy cập theo vai trò.

## Checklist, sự cố, bàn giao

- **Checklist (BIZ-003)**: Thao tác checklist gắn với ngày làm việc (Asia/Ho_Chi_Minh business date) thống nhất cho mỗi request, có người hoàn thành, thời điểm và nhật ký kiểm toán (audit log). Execution upsert, audit metadata và response payload luôn dùng chung một giá trị ngày nghiệp vụ, loại bỏ sai lệch qua ranh giới nửa đêm 00:00.
- **Sự cố (BIZ-001)**: Tuân thủ nghiêm ngặt máy trạng thái đơn hướng: `open` → `acknowledged` → `resolved` → `closed`. Nghiêm cấm nhảy cóc trạng thái, hồi quy lùi trạng thái hoặc mở lại sự cố đã đóng. Cập nhật trạng thái và ghi audit log phải thực hiện nguyên tử (atomic) trong cùng một batch; trả về 409 Conflict nếu phát hiện xung đột trạng thái hoặc dữ liệu cũ.
- **Bàn giao ca — Phạm vi và ranh giới vận hành MVP (BIZ-004)**:
  - *Phạm vi MVP hiện tại*: Bàn giao hoạt động ở cấp độ cửa hàng (`store-level`), lưu giữ ghi chú vận hành theo thứ tự thời gian (`created_at DESC`, hiển thị tối đa 30 bản ghi gần nhất). Bất kỳ nhân sự nào đang trong ca làm việc đều có thể tạo bản ghi bàn giao cho cửa hàng.
  - *Dấu vết và toàn vẹn dữ liệu*: Mọi bản ghi bàn giao đều gắn với định danh người tạo (`author_email`), cửa hàng (`store_id`), cờ chú ý của quản lý (`manager_attention`) và ghi nhận audit log nguyên tử (`handover.created`). Dữ liệu bàn giao được bảo toàn vĩnh viễn, không hỗ trợ xóa hoặc ghi đè tùy tiện.
  - *Ranh giới mở rộng (Post-MVP)*: Nếu quy trình vận hành chuỗi hoặc đa ca phức tạp đòi hỏi liên kết trực tiếp với từng ca làm (`shift_id`) hoặc quy trình xác nhận 1-1 bắt buộc giữa người giao và người nhận (`recipient_email`, `acknowledged_at`), hệ thống sẽ nâng cấp schema và API theo lộ trình tương thích ngược (migration bảo toàn toàn bộ dữ liệu bàn giao cấp cửa hàng hiện có).
- Không cho người không có quyền sửa/xóa bằng chứng của người khác.

## Báo cáo công và lương

- Xác định chính sách giờ công, nghỉ giữa ca, làm thêm, làm tròn, ca đêm và thay đổi đơn giá theo thời gian **trước khi triển khai phép tính**.
- Snapshot kỳ lương phải lưu dữ liệu tính toán, thời điểm khóa, người khóa và version; thay đổi dữ liệu nguồn sau khi khóa không được âm thầm sửa kỳ đã chốt.
- CSV cần chống spreadsheet formula injection, xác thực quyền export và ghi nhận phạm vi xuất.
- Không tuyên bố tính lương phù hợp quy định kế toán/pháp luật nếu chưa được xác minh.

## Menu và đơn hàng

- Giá, tên món và tổng tiền của đơn phải được server xác nhận và snapshot tại thời điểm đặt.
- Món ngừng bán không thể được đặt mới; thay đổi menu sau đó không làm thay đổi đơn cũ.
- Luồng chuẩn: `PENDING → ACCEPTED → PREPARING → READY → COMPLETED`.
- Cần xác định quy tắc `CANCELLED`/`REJECTED` và ai có quyền chuyển trạng thái; không tự thêm nếu chưa thống nhất.
- Chặn chuyển trạng thái trái phép, xử lý retry và double-submit để không tạo đơn trùng.

## Các quyết định cần chủ dự án xác nhận

1. Cho phép chấm công ngoài ca hay không?
2. Chính sách check-in muộn, check-out sớm, ca qua ngày và làm tròn công?
3. Ai có quyền chỉnh sửa dữ liệu công và mở lại kỳ lương?
4. Đơn hàng có cho phép hủy/từ chối và trong trạng thái nào?
5. Thời hạn lưu ảnh, vị trí và thông tin khách hàng?

