# UI/UX review checklist

Cập nhật: 2026-10-13. [Design specification](design.md) là nguồn chuẩn cho tokens, component và responsive; không lặp palette ở đây.

## Trước thay đổi

- Xác định người dùng/tác vụ, màn hình, API và quyền.
- Đọc component/CSS thực; không redesign thương hiệu vì sở thích.
- Xác định states và tiêu chí đo trước sửa.

## Kiểm tra từng luồng

- Loading ban đầu và background refresh được phân biệt.
- Empty không bị dùng thay lỗi API; có retry và dữ liệu cũ khi phù hợp.
- Form có label/inline validation, giữ dữ liệu khi thất bại.
- Double submit/lost response không tạo dữ liệu trùng.
- Hành động khó đảo ngược có xác nhận đúng tác động.
- Session hết hạn có hướng phục hồi; không báo lưu thành công giả.
- Permission camera/location bị từ chối không gây ngõ cụt.
- Text trạng thái công/nghỉ/đổi ca đúng dữ liệu server.
- Bottom nav/CTA/bàn phím không che input/nút cuối.
- Keyboard/focus/dialog, zoom/reduced motion, target và contrast được kiểm tra.
- Lịch tuần và báo cáo giữ ngữ cảnh khi cuộn.
- Không có nút chết, mock production hoặc quyền chỉ kiểm tra ở frontend.

Ghi viewport/browser/device, thao tác và bằng chứng. Phân tích CSS chỉ là STATIC, không đánh dấu runtime PASS.
