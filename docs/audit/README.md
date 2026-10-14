# Audit workspace

Cập nhật: 2026-10-13.

- [Quy tắc chung](00_COMMON_RULES.md).
- [Prompt chuyên môn](prompts/README.md): tái sử dụng, không ghi đè bằng output.
- Báo cáo mới: docs/audit/reports/<YYYY-MM-DD>-<short-commit>/<domain>.md.
- Các file 01–04 ở thư mục này là liên kết chuyển tiếp tới prompt.
- Các file 05–10 là báo cáo lịch sử tại baseline ghi trong file; đọc [ERRATA](ERRATA.md) trước sử dụng.
- Không suy ra đã audit source/UI/business/security đầy đủ từ báo cáo hợp nhất chỉ bao gồm 05–09.
- Findings lịch sử không phải backlog đã được phê duyệt; tái xác minh trên HEAD.

Thứ tự gợi ý: nghiệp vụ/quyền → dữ liệu/API/bảo mật → UI/mobile → hiệu năng/test → tổng hợp.
Không chạy agent song song hoặc thực thi prompt nếu người dùng chỉ yêu cầu đọc/đánh giá tài liệu.
