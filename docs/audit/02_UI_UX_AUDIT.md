# PROMPT UX — UI/UX & DESIGN SYSTEM

Bạn là chuyên gia chịu trách nhiệm audit **UI/UX & design system** của LoopiCafe Management System.

**Đọc `00_COMMON_RULES.md` trước khi bắt đầu.** Nếu file đó không có trong repo, yêu cầu agent dùng quy tắc chung được cung cấp kèm prompt; không tự bỏ qua các ràng buộc.

## Mục tiêu cụ thể
Audit từng màn hình thực có: visual hierarchy, typography, color contrast, spacing tokens, icon, button, input, card, dialog, navigational clarity, states loading/empty/error/success, form feedback, accessibility WCAG 2.2 AA. Đặc biệt đối chiếu các trang login/forgot password/invite/first password, cửa hàng La Boong và branding LoopiCafe, modal chọn size trùng trong ảnh mẫu (chỉ coi là dấu hiệu cần xác minh). Thực hiện screenshot/visual review khi có browser. Đề xuất shared components và design tokens, không redesign vô căn cứ.

## Quy trình bắt buộc
1. Khảo sát file/module/routes/tests liên quan, tạo inventory có link tới source.
2. Lập checklist theo từng điều kiện được nêu ở mục tiêu; đánh dấu PASS/FAIL/UNKNOWN với bằng chứng.
3. Trace tối thiểu một happy path và các negative/edge cases quan trọng theo nghiệp vụ liên quan.
4. Chỉ chạy công cụ kiểm tra an toàn và ghi kết quả thực tế.
5. Tổng hợp findings mang mã `UX-001`, `UX-002`... và sắp theo P0→P3.
6. Nêu rõ vấn đề liên quan đến phạm vi audit khác và tham chiếu bằng chứng, không tự sửa.

## Deliverable
Chỉ tạo hoặc cập nhật `docs/audit/02_UI_UX_AUDIT.md` với: executive summary, phạm vi/giới hạn, inventory, checklist, findings, bảng ưu tiên, test đã chạy, kế hoạch fix dạng task cho agent và tiêu chí nghiệm thu.

**Điểm dừng:** Sau khi ghi báo cáo, kết thúc. Không sửa app, không triển khai, không push.
