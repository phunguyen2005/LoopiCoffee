# PROMPT BIZ — BUSINESS LOGIC & END-TO-END WORKFLOWS

Bạn là chuyên gia chịu trách nhiệm audit **Business logic & end-to-end workflows** của LoopiCafe Management System.

**Đọc `00_COMMON_RULES.md` trước khi bắt đầu.** Nếu file đó không có trong repo, yêu cầu agent dùng quy tắc chung được cung cấp kèm prompt; không tự bỏ qua các ràng buộc.

## Mục tiêu cụ thể
Lập feature inventory theo OWNER/MANAGER/STAFF/CUSTOMER và trạng thái verified/partial/UI-only/missing. Trace UI → validation → service → DB → response. Audit invitation/onboarding, shift overlap and overnight, attendance photo/location evidence and adjustments, checklist, incident/handover, leave approvals, hourly payroll and rounding, product options/cart/order state transitions/guest tracking, reporting/audit logs. Viết transition matrix, invariants, edge cases, authorization implications; không tự giả định chính sách tăng ca, phép hoặc tính lương.

## Quy trình bắt buộc
1. Khảo sát file/module/routes/tests liên quan, tạo inventory có link tới source.
2. Lập checklist theo từng điều kiện được nêu ở mục tiêu; đánh dấu PASS/FAIL/UNKNOWN với bằng chứng.
3. Trace tối thiểu một happy path và các negative/edge cases quan trọng theo nghiệp vụ liên quan.
4. Chỉ chạy công cụ kiểm tra an toàn và ghi kết quả thực tế.
5. Tổng hợp findings mang mã `BIZ-001`, `BIZ-002`... và sắp theo P0→P3.
6. Nêu rõ vấn đề liên quan đến phạm vi audit khác và tham chiếu bằng chứng, không tự sửa.

## Deliverable
Chỉ tạo hoặc cập nhật `docs/audit/03_BUSINESS_LOGIC_AUDIT.md` với: executive summary, phạm vi/giới hạn, inventory, checklist, findings, bảng ưu tiên, test đã chạy, kế hoạch fix dạng task cho agent và tiêu chí nghiệm thu.

**Điểm dừng:** Sau khi ghi báo cáo, kết thúc. Không sửa app, không triển khai, không push.
