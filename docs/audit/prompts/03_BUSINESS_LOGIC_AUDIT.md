# Prompt audit — Nghiệp vụ

Áp dụng khi có yêu cầu audit. Đọc [quy tắc chung](../00_COMMON_RULES.md) và [docs index](../../README.md).

## Mục tiêu

Trace ca → công → yêu cầu → review → payroll và checklist/bàn giao; kiểm state/revision/retry, ca đêm, tháng, offboarding, rates. Map rule ID và DEC state; DEC-001..009 đã ACCEPTED nhưng có thể chưa triển khai. Không tự coi tài liệu là evidence runtime; kiểm riêng ordering theo phạm vi.

## Thực hiện

1. Ghi baseline commit/dirty tree, môi trường và phạm vi; đọc rule và decision liên quan.
2. Inventory nguồn; trace happy path và negative/concurrency cases cần thiết.
3. Chạy kiểm chứng an toàn khi đủ điều kiện; ghi phần chưa chạy.
4. Findings prefix BIZ, dùng đầy đủ template/confidence/priority/status của quy tắc chung.
5. Đề xuất sửa tối thiểu, regression acceptance và dependencies. Tham chiếu finding liên ngành, không nhân bản.

## Output và điểm dừng

Ghi docs/audit/reports/<YYYY-MM-DD>-<short-commit>/03_BUSINESS_LOGIC_AUDIT.md, không ghi đè prompt.
Không tự fix/deploy/push; báo phạm vi, evidence và giới hạn sau khi hoàn thành.
