# Prompt audit — UI/UX

Áp dụng khi có yêu cầu audit. Đọc [quy tắc chung](../00_COMMON_RULES.md) và [docs index](../../README.md).

## Mục tiêu

Đối chiếu design.md và ui-ux-guidelines.md: navigation, hierarchy, tokens, form/dialog, async states, accessibility. Phân biệt LoopiCafe software và La Boong demo. Nếu không có browser, đánh dấu runtime NOT_ASSESSED.

## Thực hiện

1. Ghi baseline commit/dirty tree, môi trường và phạm vi; đọc rule và decision liên quan.
2. Inventory nguồn; trace happy path và negative/concurrency cases cần thiết.
3. Chạy kiểm chứng an toàn khi đủ điều kiện; ghi phần chưa chạy.
4. Findings prefix UX, dùng đầy đủ template/confidence/priority/status của quy tắc chung.
5. Đề xuất sửa tối thiểu, regression acceptance và dependencies. Tham chiếu finding liên ngành, không nhân bản.

## Output và điểm dừng

Ghi docs/audit/reports/<YYYY-MM-DD>-<short-commit>/02_UI_UX_AUDIT.md, không ghi đè prompt.
Không tự fix/deploy/push; báo phạm vi, evidence và giới hạn sau khi hoàn thành.
