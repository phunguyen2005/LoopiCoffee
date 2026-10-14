# Prompt audit — Bảo mật

Áp dụng khi có yêu cầu audit. Đọc [quy tắc chung](../00_COMMON_RULES.md) và [docs index](../../README.md).

## Mục tiêu

Threat model browser/Worker/Auth/D1/R2; session, membership, resource scope, owner guard, public receipts, upload validation, origin, input bounds, logs, retention. Không xuất secrets hoặc khai thác production. Policy ACCEPTED chưa triển khai là gap có bằng chứng source, không tự nâng thành claim runtime nếu chưa tái hiện.

## Thực hiện

1. Ghi baseline commit/dirty tree, môi trường và phạm vi; đọc rule và decision liên quan.
2. Inventory nguồn; trace happy path và negative/concurrency cases cần thiết.
3. Chạy kiểm chứng an toàn khi đủ điều kiện; ghi phần chưa chạy.
4. Findings prefix SEC, dùng đầy đủ template/confidence/priority/status của quy tắc chung.
5. Đề xuất sửa tối thiểu, regression acceptance và dependencies. Tham chiếu finding liên ngành, không nhân bản.

## Output và điểm dừng

Ghi docs/audit/reports/<YYYY-MM-DD>-<short-commit>/04_SECURITY_AUDIT.md, không ghi đè prompt.
Không tự fix/deploy/push; báo phạm vi, evidence và giới hạn sau khi hoàn thành.
