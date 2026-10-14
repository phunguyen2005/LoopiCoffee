# Prompt audit — Mobile

Áp dụng khi có yêu cầu audit. Đọc [quy tắc chung](../00_COMMON_RULES.md) và [docs index](../../README.md).

## Mục tiêu

Kiểm 320/375/390/430/768px, landscape, zoom, safe area, bàn phím, touch/focus, bảng lịch và payroll. Browser/device evidence cho overlap và hit targets; CSS-only là static. Áp target nội bộ 44px, phân biệt WCAG AA/AAA.

## Thực hiện

1. Ghi baseline commit/dirty tree, môi trường và phạm vi; đọc rule và decision liên quan.
2. Inventory nguồn; trace happy path và negative/concurrency cases cần thiết.
3. Chạy kiểm chứng an toàn khi đủ điều kiện; ghi phần chưa chạy.
4. Findings prefix MOB, dùng đầy đủ template/confidence/priority/status của quy tắc chung.
5. Đề xuất sửa tối thiểu, regression acceptance và dependencies. Tham chiếu finding liên ngành, không nhân bản.

## Output và điểm dừng

Ghi docs/audit/reports/<YYYY-MM-DD>-<short-commit>/08_MOBILE_RESPONSIVENESS_AUDIT.md, không ghi đè prompt.
Không tự fix/deploy/push; báo phạm vi, evidence và giới hạn sau khi hoàn thành.
