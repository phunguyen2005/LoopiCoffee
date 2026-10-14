# Design specification — LoopiCafe

Cập nhật: 2026-10-13. Chuẩn thiết kế cho thay đổi mới, không chứng nhận toàn bộ UI hiện tại.
Quyền/nghiệp vụ lấy từ [permissions](permissions.md) và [business-rules](business-rules.md).

## Mục tiêu

Nhân viên tìm ca và chấm công nhanh trên điện thoại; quản lý phát hiện thiếu người, công bất thường và yêu cầu chờ xử lý; owner đối soát vận hành.
LoopiCafe là phần mềm; La Boong là nhận diện quán demo. Không thay tên phần mềm bằng tên demo trên toàn hệ thống.

## Kiến trúc thông tin

| Người dùng | Điểm vào | Nội dung ưu tiên |
|---|---|---|
| Nhân viên | Hôm nay | Ca hiện tại/tiếp theo, trạng thái công, hành động chính, checklist, yêu cầu |
| Quản lý | Tổng quan vận hành | Ca thiếu người, ngoại lệ, yêu cầu pending, sự cố/bàn giao |
| Chủ quán | Tổng quan và báo cáo | Ngày/kỳ, dữ liệu mới nhất, công/lương, nhân sự/cấu hình |
| Khách | Menu | Tìm món, options, giỏ, xác nhận, theo dõi đúng đơn |

Điều hướng phải có active state, deep link và back hợp lý. Không tạo nút nếu chưa có hành động/API thực.
Không tự thêm quyền cho màn hình chỉ vì vai trò có tên quản lý.

## Ngôn ngữ giao diện

Tiếng Việt rõ ràng. Thời gian hiển thị giờ VN, ngày đầy đủ khi ca qua ngày. Nhãn phân biệt:
“Đã ghi nhận”, “Chờ duyệt”, “Đã duyệt, chờ điều chỉnh”, “Đã áp dụng”, “Đã khóa”.
Chỉ dùng “Đã áp dụng” khi dữ liệu thực sự thay đổi và truy vết được.
“Không có ca” khác “Không tải được lịch”; giữ dữ liệu cũ có nhãn lần cập nhật cuối khi refresh lỗi.

## Tokens từ source

Nguồn nội bộ: app/globals.css. Nguồn đặt món: components/order/order-tokens.css.
Bảng là inventory tại baseline 888495b; kiểm tra CSS/computed style trước sửa.

| Vai trò | Token nội bộ | Giá trị quan sát |
|---|---|---|
| Nền | --cream | #fffaf4 |
| Bề mặt | --paper | #ffffff |
| Chữ | --ink | #332a2b |
| Chữ phụ | --muted | #635657 |
| Thương hiệu | --burgundy | #6f2939 |
| Viền | --line | #eee3df |
| Thành công | --status-success | #2e7d32 |
| Cảnh báo | --status-warning | #a65300 |
| Lỗi | --status-danger | #a83d4c |
| Font thân | --font-sans | Segoe UI, system-ui, fallback |
| Khoảng nav | --bottom-nav-height | 80px |
| Nav và CTA | --bottom-nav-with-cta-height | 154px |

Đặt món có palette olive/cream/terracotta và radius 8/14/20/28px. Giữ phạm vi thương hiệu, không ép đồng nhất màu nếu chưa có quyết định redesign.
Không suy ra mọi cặp màu đạt contrast từ bảng token. Đo theo foreground/background thực.
Tái sử dụng spacing/type/radius trong component hiện có; nếu cần token mới, định nghĩa semantic role và trạng thái trước khi thêm.
shadcn/ui chưa được xác minh là hệ component cài sẵn; không tự thêm vào docs như đã có.

## Hợp đồng component

| Component | Bắt buộc |
|---|---|
| Button/action | Label rõ, pending, disabled reason khi cần, chống gửi lặp |
| Input/form | Label, hint, lỗi inline, giữ dữ liệu khi lỗi, focus field lỗi |
| Dialog/sheet | Accessible name, focus vào/giữ trong/khôi phục, Escape theo trạng thái an toàn |
| Status badge | Text + màu; không chỉ icon |
| Table/list | Heading, filter, empty/error, pagination khi bị giới hạn, không mất ngữ cảnh cuộn |
| Toast/banner | Toast cho phản hồi ngắn; lỗi kéo dài dùng text/banner có retry |
| Camera capture | Chủ động mở, progress từng bước, timeout/retry/giải trình, dừng camera khi đóng |

## Lịch ca mobile

Màn hình hẹp ưu tiên ngày/danh sách; lưới tuần có thể cuộn ngang trong vùng riêng, giữ tên/ngày theo ngữ cảnh.
Chi tiết ca: ngày bắt đầu/kết thúc, người, vị trí, trạng thái, phiên bản và ngoại lệ liên quan.
OWNER/MANAGER cần tách chế độ Nháp và Đã xuất bản. Draft không hiện cho nhân viên; publish phải có preview, kiểm overlap và thông báo kết quả từng ca.
Sửa/hủy: hiển thị mốc cut-off 12 giờ, tác động trước xác nhận và luồng điều chỉnh khi đã khóa trực tiếp; lỗi 409 phải tải state mới và giải thích, không âm thầm ghi đè.
Ca nghỉ đã duyệt cần nhãn thiếu người thay; không hiển thị đã có coverage nếu chưa bố trí.
Swap phải phân biệt `Chờ duyệt`, `Đã duyệt, chờ áp dụng`, `Đã áp dụng`; CTA “Duyệt & áp dụng” chỉ báo thành công sau khi hai ca đổi thật.

## Chấm công và công/lương

Hành động chính phản ánh state server, không dựa riêng đồng hồ đếm frontend.
Khi mất response: “Đang kiểm tra kết quả”, giữ idempotency key; không mời tạo thao tác mới ngay.
Review hiển thị thời gian gốc/hiệu lực/lý do riêng. Payroll phải phân biệt số liệu dự kiến, được duyệt và snapshot khóa.
Attendance UI hiển thị dung sai 5 phút, biên 15 phút, overtime được duyệt và `Quên chấm ra — chưa tính công`; không hiển thị auto-close như ca hoàn tất bình thường.
Mobile report dùng summary/detail hoặc bảng cuộn có cột cố định hợp lý; không ép cột tên chiếm gần hết viewport.

## Checklist, bàn giao và đơn hàng

- Checklist tách rõ “Việc trong ngày” và “Việc của ca này”; checklist ca chưa xong hiện trong bước bàn giao.
- Bàn giao hiển thị người/ca nhận, trạng thái chờ xác nhận/đã nhận và lý do bypass. Check-in bị gate phải có hướng dẫn liên hệ quản lý, không để màn hình chết.
- Hủy đơn preparing/ready dùng dialog xác nhận, reason code bắt buộc và cảnh báo sẽ ghi vào báo cáo hao hụt; CUSTOMER không thấy CTA tự hủy sau khi gửi.
- Báo cáo lương giải thích floor 15 phút, rate theo ngày hiệu lực và làm tròn tổng 1.000 VND; không chỉ hiển thị con số cuối.

## Responsive và accessibility

- Kiểm tra 320, 375/390, 430, 768, 1024, 1440 CSS px; thêm landscape và zoom 200%.
- Không overflow ngang toàn trang; vùng bảng có cuộn chủ đích được phép.
- Chuẩn nội bộ: target hành động chính >=44×44 CSS px, không chồng hit area.
- WCAG 2.2 AA là mục tiêu. SC 2.5.8: 24×24 có ngoại lệ; SC 2.5.5: 44×44 thuộc AAA. Không nhầm chuẩn nội bộ với claim compliance.
- Keyboard, visible focus, label, contrast, reduced motion và thông báo trạng thái phải được kiểm tra.
- Safe-area và CTA/nav phải được tính chung; không dùng một padding cố định cho mọi trang.
- Bàn phím ảo cần test thật; dvh không tự chứng minh input luôn nhìn thấy.
- Không tự bật camera/location, không dùng animation che lỗi hoặc trì hoãn tác vụ.

## Design review

Ghi vấn đề, luồng, quyền, states, component/token ảnh hưởng; chụp trước/sau khi có browser.
Nghiệm thu hành động và nội dung đọc được, không chỉ screenshot đẹp.
Nguồn chuẩn: [W3C target minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [target enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).
