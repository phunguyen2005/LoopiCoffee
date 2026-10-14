# LoopiCafe — bản đồ công việc

Tài liệu điều hướng, không phải danh sách task đang chạy. Cập nhật: 2026-10-13.

Bản kế hoạch FIX-01..05 cũ được giữ tại [archive](docs/archive/2026-10-13/PROJECT.md); các worker ID, trạng thái IN_PROGRESS và contract trong đó không còn là chỉ dẫn hiện hành.

## Thứ tự ưu tiên

1. Triển khai chênh lệch `DEC-001..009` đã chốt, theo [implementation status](docs/implementation-status.md); ưu tiên quyền/self-approval và integrity ca–công–lương.
2. Đồng bộ schema/API/UI với [nghiệp vụ](docs/business-rules.md), [quyền](docs/permissions.md) và [decision register](docs/decision-register.md) bằng patch nhỏ có migration/test.
3. Hoàn thành evidence cho [acceptance matrix](docs/acceptance-matrix.md), đặc biệt core E2E và restore drill.
4. Cải thiện UI theo [design](docs/design.md), không vượt quyền hoặc hiển thị trạng thái giả.
5. Audit lại theo baseline mới; dùng [quy tắc audit](docs/audit/00_COMMON_RULES.md).

Mỗi task phải có: mục tiêu, phạm vi, rule/decision ID, file liên quan, tiêu chí nghiệm thu, phương pháp kiểm chứng và trạng thái. Không dùng số test cố định làm mục tiêu chất lượng.
