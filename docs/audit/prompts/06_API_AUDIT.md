# Prompt audit — API

Áp dụng khi có yêu cầu audit. Đọc [quy tắc chung](../00_COMMON_RULES.md) và [docs index](../../README.md).

## Mục tiêu

Inventory method/path/roles/request/response/side effects. Trace validation, ownership, trạng thái, error envelope, pagination, cache và replay. Phân biệt revision guard với idempotency; kiểm proxy trust trước đề xuất fallback.

## Thực hiện

1. Ghi baseline commit/dirty tree, môi trường và phạm vi; đọc rule và decision liên quan.
2. Inventory nguồn; trace happy path và negative/concurrency cases cần thiết.
3. Chạy kiểm chứng an toàn khi đủ điều kiện; ghi phần chưa chạy.
4. Findings prefix API, dùng đầy đủ template/confidence/priority/status của quy tắc chung.
5. Đề xuất sửa tối thiểu, regression acceptance và dependencies. Tham chiếu finding liên ngành, không nhân bản.

## Output và điểm dừng

Ghi docs/audit/reports/<YYYY-MM-DD>-<short-commit>/06_API_AUDIT.md, không ghi đè prompt.
Không tự fix/deploy/push; báo phạm vi, evidence và giới hạn sau khi hoàn thành.
