# Biên bản chuẩn hóa tài liệu

Ngày: 2026-10-13. Baseline code: 888495ba3fddf4798b80f9a1cbe4aec65c0991b8.
Phạm vi: 25 Markdown hiện hữu được Git theo dõi, gồm README, PROJECT, AGENTS và docs. Không sửa nguồn đồng bộ sources/.

## Kết quả

- Thiết lập chỉ mục, loại tài liệu và cách giải quyết mâu thuẫn căn cứ.
- Chuẩn hóa nghiệp vụ, quyền, architecture, dữ liệu, bảo mật, kiểm thử và nghiệm thu.
- Thêm design specification, commit conventions, API contract guide và operational runbook.
- Tách 9 prompt audit khỏi đường dẫn báo cáo; giữ liên kết chuyển tiếp 01–04.
- Gắn cảnh báo lịch sử cho 8 báo cáo/kế hoạch cũ và bổ sung ERRATA.
- Lưu nguyên bản 25 file tại archive/2026-10-13; nội dung archive không phải chỉ dẫn hiện hành.
- Ban đầu ghi 9 quyết định OPEN. Ngày 2026-10-13, chủ dự án cung cấp và chấp nhận phương án cho 11 vấn đề thuộc DEC-001..009; decision register và tài liệu chuẩn đã được cập nhật, không sửa code/schema trong lượt chốt policy.

## Kiểm chứng đã thực hiện

1. Đọc source/config chọn lọc để đối chiếu claim; kết quả trong implementation-status.md.
2. Quét 44 Markdown ngoài archive trước khi thêm biên bản này: 489 liên kết nội bộ, không có target thiếu, không còn liên kết file:///. Phép kiểm tra kiểm sự tồn tại đường dẫn, không chứng nhận nội dung hay mọi anchor.
3. Đối chiếu nội dung 25 snapshot gốc với HEAD, chuẩn hóa CRLF/LF khi so sánh: không khác nội dung.
4. git diff --check: không còn lỗi whitespace sau hiệu chỉnh.
5. Kiểm tra diff nguồn TypeScript/TSX/JSON/SQL/YAML: không có thay đổi trong đợt này.

## Kiểm chứng bổ sung khi chốt quyết định

1. Đối chiếu 11 vấn đề với DEC-001..009 và loại bỏ trạng thái OPEN trong tài liệu chuẩn.
2. Đồng bộ business rules, target permissions, database/API/design/security/testing/acceptance/runbook và implementation gap.
3. Quét tham chiếu DEC/OPEN và kiểm tra liên kết Markdown; kết quả của lượt này phải ghi ở bàn giao, không hồi tố thành bằng chứng app runtime.

## Chưa thực hiện

Không chạy unit/integration/E2E, browser/device, cloud, migration, backup/restore hoặc deploy. Không đánh dấu PASS các hàng nghiệm thu ứng dụng. Không commit/push.
Các báo cáo lịch sử giữ nguyên kết luận tại thời điểm cũ, kèm đính chính; không phải toàn bộ finding đã được tái hiện hoặc đóng tại HEAD.

## Bảo trì tiếp theo

Triển khai từng decision bằng patch code/schema nhỏ; mỗi thay đổi cập nhật rule/contract, test và evidence cùng nhau. Không chuyển implementation status sang hoàn thành từ thay đổi tài liệu. Audit mới phải ghi baseline mới; không ghi đè prompt hoặc dùng kết quả lịch sử chứng nhận release.
