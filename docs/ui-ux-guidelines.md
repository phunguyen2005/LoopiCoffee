# Hướng dẫn màn hình UI/UX — LoopyCafe

Cập nhật: 2026-10-17. Đọc cùng [hệ thống thiết kế](design.md). Quyền cụ thể lấy từ [phân quyền](permissions.md); nghiệp vụ lấy từ [quy tắc nghiệp vụ](business-rules.md).

## Cách thiết kế một màn hình

Trước khi thiết kế, trả lời năm câu hỏi:

1. Người dùng vào đây để hoàn thành việc gì?
2. Thông tin nào giúp họ quyết định nhanh nhất?
3. Hành động chính là gì?
4. Sau thao tác, người dùng nhìn thấy kết quả hoặc bước tiếp theo nào?
5. Màn hình nói gì khi đang tải, trống hoặc có lỗi?

Nếu một nội dung không phục vụ năm câu hỏi trên, chuyển nó xuống phần phụ hoặc bỏ khỏi màn hình.

## 1. Đăng nhập và truy cập

| Màn hình | Người dùng nhìn thấy | Người dùng có thể làm | Sau thao tác |
|---|---|---|---|
| Đăng nhập | Logo, lời chào ngắn, email, mật khẩu, hỗ trợ quên mật khẩu | Đăng nhập, hiện/ẩn mật khẩu, mở luồng khôi phục | Vào đúng khu vực được phép hoặc nhận lỗi cụ thể ngay tại trường liên quan |
| Quên/đổi mật khẩu | Bước hiện tại, yêu cầu mật khẩu, hướng dẫn ngắn | Gửi yêu cầu, đặt mật khẩu mới, quay lại | Xác nhận đã gửi/đã đổi và chỉ rõ bước tiếp theo |
| Không có quyền | Trang hoặc hành động không thể truy cập và lý do dễ hiểu | Quay lại, về trang phù hợp hoặc đăng nhập lại | Không để người dùng mắc kẹt |

Mobile dùng form một cột, nút chính toàn chiều rộng khi phù hợp và không để bàn phím che lỗi hoặc nút tiếp tục.

## 2. Hôm nay và chấm công

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Hôm nay | Ca hiện tại hoặc sắp tới, thời gian, vị trí, trạng thái chấm công, việc cần làm trước ca | Tiếp tục bước cần làm ngay | Không có ca khác với không tải được ca; ca nghỉ đã duyệt phải ghi rõ trạng thái bố trí người thay |
| Chấm công | Ca đang thao tác, tiến trình camera/vị trí, ảnh xem lại và thời hạn phiên | Chấm vào hoặc chấm ra | Hiện “Đã ghi nhận” khi chắc chắn; nếu mất phản hồi, hiện “Đang kiểm tra kết quả” và không mời gửi lại ngay |
| Bị chặn bởi bàn giao | Bàn giao cần xác nhận, người gửi, ca liên quan và hướng xử lý | Mở bàn giao để xác nhận | Sau xác nhận quay lại đúng bước chấm công; trường hợp khẩn cấp chỉ hiện cho người có quyền |

Không gọi phiên quên chấm ra là hoàn tất. Dùng nhãn “Quên chấm ra — chưa tính công” cho đến khi được xử lý.

## 3. Lịch và yêu cầu

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Lịch của tôi | Danh sách ca theo ngày, ca hiện tại/sắp tới, nghỉ đã duyệt và người thay nếu có | Xem chi tiết ca hoặc tạo yêu cầu phù hợp | Ca qua ngày hiện đủ ngày bắt đầu và kết thúc; mobile ưu tiên danh sách thay vì lưới rộng |
| Quản lý lịch | Ngày/tuần đang xem, ca nháp và đã xuất bản, thiếu người, trùng lịch | Tạo hoặc điều chỉnh ca | Trước khi lưu phải cho thấy tác động; khi dữ liệu đã đổi, yêu cầu tải lại thay vì ghi đè |
| Yêu cầu | Loại yêu cầu, ca liên quan, trạng thái và mốc cập nhật | Tạo yêu cầu hoặc xử lý yêu cầu đang chờ | Phân biệt “Chờ duyệt”, “Đã duyệt, chờ áp dụng” và “Đã áp dụng”; nêu bước tiếp theo sau mỗi trạng thái |

Trên mobile, bộ lọc ngày và trạng thái phải gọn, dễ chạm và không đẩy danh sách chính xuống quá xa.

## 4. Checklist, bàn giao và sự cố

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Checklist | “Việc trong ngày” tách khỏi “Việc của ca này”, tiến độ và người liên quan; số lượng ca chỉ tính ca đang diễn ra hoặc ca sắp tới được giao | Đánh dấu việc đã hoàn thành | Cập nhật tiến độ ngay; khi lỗi giữ trạng thái trước đó và cho phép thử lại; sau khi ca kết thúc, mục ca cũ chỉ còn trong lịch sử và không thể thay đổi |
| Bàn giao | Nội dung bàn giao, người/ca nhận, việc ca chưa xong, trạng thái xác nhận | Gửi bàn giao hoặc xác nhận đã nhận | Người gửi thấy trạng thái “Chờ xác nhận” hoặc “Đã nhận”; không tự đánh dấu checklist là hoàn thành |
| Sự cố | Mức độ, mô tả, người phụ trách và bước xử lý hiện tại | Báo sự cố hoặc thực hiện bước kế tiếp | Chỉ hiện hành động hợp lệ tiếp theo; nếu trạng thái đã đổi, tải lại và giải thích |

Form tại khu vực này phải đủ nhanh để dùng trong ca: trường bắt buộc ít, nút chính dễ chạm và dữ liệu đã nhập không mất khi có lỗi.

## 5. Tổng quan và thông báo

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Tổng quan vận hành | Cảnh báo cần xử lý, ca thiếu người, chấm công bất thường, yêu cầu và sự cố đang mở | Mở việc ưu tiên cao nhất | Mỗi cảnh báo dẫn đến đúng màn hình xử lý; không dùng số liệu trang trí không có hành động |
| Thông báo | Nội dung, thời điểm, trạng thái đã đọc và đối tượng liên quan | Mở nội dung liên quan | Trở lại danh sách vẫn giữ vị trí; thông báo lỗi thời phải nói rõ trạng thái mới |

Trên điện thoại, hiển thị cảnh báo theo mức ưu tiên trong một luồng dọc. Không xếp nhiều thẻ số liệu ngang nhau khiến hành động chính bị chìm.

## 6. Công, lương và duyệt công

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Công của tôi | Kỳ đang xem, giờ ghi nhận, giờ được duyệt, ngoại lệ và trạng thái | Mở chi tiết hoặc gửi yêu cầu điều chỉnh | Giải thích rõ số liệu nào tạm tính và số liệu nào đã duyệt |
| Duyệt công | Người/ca cần xử lý, thời gian gốc, thời gian đề nghị, lý do và bằng chứng được phép xem | Duyệt hoặc từ chối | Xác nhận trạng thái mới; không cho tự duyệt và không làm mờ sự khác nhau giữa dữ liệu gốc và dữ liệu điều chỉnh |
| Báo cáo lương | Kỳ lương, tổng giờ, mức áp dụng, điều chỉnh và trạng thái khóa | Xem chi tiết, chốt hoặc xuất báo cáo khi có quyền | Trước khi chốt nêu rõ tác động; sau khi khóa phải hiện nhãn “Đã khóa” và hạn chế sửa |

Mobile hiển thị số tổng trước, danh sách chi tiết sau. Tránh bảng rộng; cho phép mở từng nhân sự hoặc từng ngày để xem thêm.

## 7. Nhân sự và cửa hàng

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Nhân sự | Tên, vai trò, trạng thái làm việc và thông tin cần cho vận hành | Xem hoặc cập nhật hồ sơ trong phạm vi cho phép | Sau lưu, hiển thị dữ liệu mới và người dùng vẫn ở đúng nhân sự đang xem |
| Cấu hình cửa hàng | Thông tin cửa hàng, giờ hoạt động và thiết lập đang có hiệu lực | Cập nhật một nhóm thiết lập | Tóm tắt thay đổi trước khi lưu; lỗi ở nhóm nào hiển thị ngay tại nhóm đó |
| Hồ sơ cá nhân | Thông tin cá nhân và tùy chọn tài khoản | Cập nhật hồ sơ hoặc đổi mật khẩu | Xác nhận thay đổi; tách đăng xuất khỏi các hành động chỉnh sửa thông thường |

Không đưa dữ liệu nhạy cảm vào thẻ danh sách nếu người dùng chỉ cần nhận diện nhân sự.

## 8. Đơn hàng và menu khách

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Menu khách | Danh mục, món còn bán, giá, lựa chọn và giỏ hiện tại | Thêm món hoặc mở giỏ | Cập nhật giỏ rõ ràng; món hết bán không được tạo cảm giác vẫn có thể đặt |
| Xác nhận đơn | Món, lựa chọn, số lượng, tổng tiền và thông tin nhận đơn | Gửi đơn | Nếu giá thay đổi, hiển thị tổng mới để khách xác nhận lại; sau khi gửi chuyển sang theo dõi đơn |
| Theo dõi đơn | Mã đơn, trạng thái, thời gian cập nhật và hướng dẫn nhận món | Theo dõi tiến trình | Lỗi tải không được biến thành mất đơn; cho phép thử lại và giữ mã đơn |
| Quản lý đơn | Đơn theo trạng thái, thời gian chờ, món và thông tin nhận diện khách | Thực hiện bước xử lý tiếp theo | Chỉ hiện bước hợp lệ; hủy đơn đang chuẩn bị phải yêu cầu lý do và cảnh báo tác động hao hụt |
| Quản lý menu | Món, giá, trạng thái đang bán và lần cập nhật | Bật/tắt bán hoặc chỉnh món | Khi dữ liệu đã thay đổi ở nơi khác, yêu cầu tải lại trước khi tiếp tục |

Menu khách ưu tiên ảnh, tên, giá và nút thêm món. Giỏ trên mobile luôn dễ mở nhưng không che nội dung hoặc nút xác nhận.

## 9. Quản trị hệ thống

| Màn hình | Người dùng nhìn thấy | Hành động chính | Kết quả và ngoại lệ |
|---|---|---|---|
| Tổng quan quản trị | Tài khoản hoạt động, chờ kích hoạt và thao tác cần xử lý | Mở nhóm cần quản trị | Số liệu phải dẫn đến danh sách liên quan; lỗi tải có retry rõ ràng |
| Tài khoản | Danh tính đăng nhập, vai trò và trạng thái kích hoạt | Tạo, mời, khóa hoặc khôi phục tài khoản theo quyền | Nêu rõ tác động trước xác nhận; thông tin nhạy cảm chỉ hiện khi thật sự cần và có cảnh báo sao chép an toàn |
| Vai trò | Tên vai trò, mô tả ngắn, số người đang dùng và nhóm quyền | Tạo hoặc chỉnh vai trò | Cho biết thay đổi có hiệu lực ở đâu; không cho lưu trữ vai trò đang được dùng mà không hướng dẫn chuyển người |
| Nhật ký | Ai đã làm gì, thời điểm, đối tượng và kết quả | Lọc và xem chi tiết | Bộ lọc dễ xóa; chi tiết dài mở riêng thay vì ép vào bảng mobile |

Khu vực quản trị phải có phong cách chung của LoopyCafe nhưng tách rõ khỏi nghiệp vụ cửa hàng, tránh tạo cảm giác quản trị viên có thể thao tác vận hành.

## 10. Nguyên tắc giọng văn và cá nhân hóa (Loopy Voice & Tone)

LoopyCafe mang lại cảm giác ấm áp, gần gũi, đáng yêu như người bạn đồng hành quán cà phê, nhưng vẫn giữ trọn sự chuẩn xác, rõ ràng và hiệu quả vận hành.

### 10.1. Trụ cột giọng văn
1. **Dễ thương, ấm áp & nhân văn (Cute & Welcoming):** Sử dụng các xưng hô và lối diễn đạt tự nhiên như "nhà mình", "ở quán", "nè", "nhé", "ơi". Tránh giọng điệu cơ học khô cứng kiểu phần mềm quản trị thông thường.
2. **Chuẩn xác và rõ ràng cho vận hành (Clear & Unambiguous):** Các nhãn nút bấm hành động, lỗi hệ thống, dữ liệu bảng lương, cảnh báo bảo mật phải ngắn gọn, chính xác tuyệt đối. Không hy sinh tính dễ hiểu nghiệp vụ vì sự ngộ nghĩnh.
3. **Cá nhân hóa theo ngữ cảnh (Context-Aware):** Lời chào và thông báo phản ánh đúng vai trò (Chủ quán, Quản lý, Nhân viên, Khách hàng), thời điểm trong ngày (sáng, trưa, tối) và dữ liệu thực tế của hệ thống.
4. **Trạng thái trống có chỉ dẫn (Thoughtful Empty States):** Giải thích rõ lý do mục đó chưa có dữ liệu và gợi ý bước hành động tiếp theo, bắt đầu bằng thông điệp thân thiện.

### 10.2. Bảng chuyển đổi giọng văn tiêu biểu
| Hiện tại (Khô cứng) | Chuẩn hóa LoopyCafe | Ngữ cảnh áp dụng |
|---|---|---|
| Tổng quan cửa hàng | Hôm nay ở quán thế nào? | Trang chủ điều hành Dashboard của Quản lý / Chủ quán |
| Nhân sự đang trực quầy | Ai đang ở quán nhỉ? | Danh sách nhân viên đang check-in có mặt |
| Hôm nay chưa có ca làm việc | Hôm nay quán chưa có ca nào được xếp | Khi lịch ca ngày hiện tại trống |
| Đội ngũ nhân sự | Nhà mình có những ai? | Quản lý danh sách thành viên cửa hàng |
| Chưa có dữ liệu | Chỗ này vẫn còn trống nè! | Empty state chung cho bảng/danh sách chưa phát sinh dữ liệu |
| Chấm công thành công | Check-in xong rồi! Chúc bạn một ca thật vui. | Xác nhận hoàn tất vào ca chụp ảnh |
| Không có thông báo | Mọi thứ đang yên ắng, chưa có thông báo mới. | Hộp thư thông báo khi không có tin chưa đọc |
| Yêu cầu nghỉ đã duyệt | Đơn nghỉ của bạn được duyệt rồi! | Thông báo / Thẻ trạng thái duyệt phép của nhân viên |

## 11. Trước khi hoàn tất

Trả lời lại năm câu hỏi ở đầu tài liệu bằng màn hình thực tế, không bằng mô tả dự kiến. Sau đó kiểm toàn bộ tiêu chí tại [checklist của hệ thống thiết kế](design.md#11-checklist-trước-khi-duyệt).

