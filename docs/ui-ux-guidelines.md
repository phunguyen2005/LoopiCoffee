# UI/UX Guidelines — LoopiCafe

**Mục tiêu:** nâng cấp giao diện hiện hữu, không redesign toàn bộ khi chưa audit. Mobile-first, thao tác nhanh trong môi trường quán cà phê.

## Nguyên tắc

- Ưu tiên tác vụ theo vai trò, rõ trạng thái, giảm thao tác, không tạo chức năng giả.
- Dùng Tailwind CSS và hệ component hiện có theo phiên bản repo; tái sử dụng tokens/components thay vì CSS rời rạc. Project chưa có cấu hình `shadcn/ui` được xác minh, vì vậy không tự cài hoặc giả định component shadcn đang tồn tại.
- Không thay đổi logic, API, validation hay quyền chỉ để phù hợp thiết kế.
- Thiết kế từ màn hình hẹp trước; đảm bảo tablet/desktop, safe areas và bàn phím di động.
- WCAG 2.2 AA là mục tiêu: tương phản, focus visible, label, keyboard navigation, thông báo lỗi dễ hiểu.

## Điều hướng theo vai trò

| Vai trò | Ưu tiên màn hình đầu | Hành động chính |
|---|---|---|
| STAFF | Ca hôm nay, trạng thái công, checklist | Chấm công, checklist, bàn giao |
| MANAGER | Việc cần duyệt, bất thường, sự cố | Duyệt, xử lý, xem ca |
| OWNER | Tổng quan vận hành, đơn, nhân sự, báo cáo | Quản trị, xem báo cáo |
| CUSTOMER | Danh mục món, tìm món, giỏ hàng | Chọn món, đặt, theo dõi |

## Pattern UI bắt buộc

- Mỗi trang có heading, hành động chính nổi bật, breadcrumbs/back phù hợp.
- Mọi luồng có loading/skeleton, empty, error, success và trạng thái disabled rõ ràng.
- Form có label, validation inline, mô tả lỗi cụ thể; giữ dữ liệu nhập khi lỗi mạng.
- Hành động phá hủy/khó đảo ngược cần xác nhận; tránh double-submit.
- Các hành động có tác động tiền/lương/đơn cần hiển thị dữ liệu trước xác nhận.
- Thời gian hiển thị theo `Asia/Ho_Chi_Minh`, có ngày đầy đủ khi dễ gây nhầm.
- Không chỉ dùng màu để diễn đạt trạng thái; dùng nhãn và biểu tượng phù hợp.
- Touch target khuyến nghị tối thiểu 44×44 CSS px cho tác vụ chính.

## Chấm công và camera/location

- Giải thích tại sao cần ảnh/vị trí trước khi yêu cầu permission.
- Có trạng thái đang lấy vị trí/chụp ảnh/đang gửi và retry an toàn.
- Nếu từ chối quyền, hiển thị luồng giải trình hợp lệ thay vì bế tắc.
- Không tự động bật camera hoặc lấy vị trí khi chưa có hành động chủ động.

## Đặt món khách hàng

- Hiển thị tên, giá, tình trạng món và số lượng rõ ràng.
- Giỏ hàng có subtotal, tổng, sửa số lượng, thông tin liên hệ và xác nhận.
- Thông báo tình trạng đơn rõ ràng; không tiết lộ thông tin khách khác.

## Design tokens (chưa chốt)

- Không tự áp đặt palette/font mới trước khi xem UI hiện tại.
- Audit typography, spacing, radii, contrast, dark mode (nếu có), component states.
- Tạo bảng token từ code hiện hữu, đề xuất thay đổi nhỏ và nhất quán.

## Checklist review từng màn hình

- [ ] 320–390px và 768/1280px không overflow ngang.
- [ ] Dùng một tay dễ dàng; CTA chính dễ tìm.
- [ ] Keyboard/focus/reader labels hoạt động.
- [ ] Error/empty/loading/success rõ ràng.
- [ ] Không có nút chết, mock data hoặc permission chỉ kiểm tra trên UI.
- [ ] Screenshot before/after và test E2E luồng quan trọng.

