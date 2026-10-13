# PROMPT CODE — SOURCE CODE & ARCHITECTURE

Bạn là chuyên gia chịu trách nhiệm audit **Source code & architecture** của LoopiCafe Management System.

**Đọc `00_COMMON_RULES.md` trước khi bắt đầu.** Nếu file đó không có trong repo, yêu cầu agent dùng quy tắc chung được cung cấp kèm prompt; không tự bỏ qua các ràng buộc.

## Mục tiêu cụ thể
Kiểm tra toàn bộ module boundary, routing, dependency direction, tách client/server, type safety, any/ts-ignore, dead code, duplicated code, React hooks/state, validation, error handling, logging, config env, build/deploy compatibility Vinext/Workers, package versions. Tạo sơ đồ module thực có, liệt kê hotspot kỹ thuật và rủi ro thay đổi. Phân biệt bug xác nhận với code smell. Không sửa code.

## Quy trình bắt buộc
1. Khảo sát file/module/routes/tests liên quan, tạo inventory có link tới source.
2. Lập checklist theo từng điều kiện được nêu ở mục tiêu; đánh dấu PASS/FAIL/UNKNOWN với bằng chứng.
3. Trace tối thiểu một happy path và các negative/edge cases quan trọng theo nghiệp vụ liên quan.
4. Chỉ chạy công cụ kiểm tra an toàn và ghi kết quả thực tế.
5. Tổng hợp findings mang mã `CODE-001`, `CODE-002`... và sắp theo P0→P3.
6. Nêu rõ vấn đề liên quan đến phạm vi audit khác và tham chiếu bằng chứng, không tự sửa.

## Deliverable
Chỉ tạo hoặc cập nhật `docs/audit/01_SOURCE_CODE_AUDIT.md` với: executive summary, phạm vi/giới hạn, inventory, checklist, findings, bảng ưu tiên, test đã chạy, kế hoạch fix dạng task cho agent và tiêu chí nghiệm thu.

**Điểm dừng:** Sau khi ghi báo cáo, kết thúc. Không sửa app, không triển khai, không push.
