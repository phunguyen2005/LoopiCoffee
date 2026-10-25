# Prompt audit — UI/UX

Áp dụng khi có yêu cầu audit. Đọc [quy tắc chung](../00_COMMON_RULES.md) và [docs index](../../README.md).

## Mục tiêu

Đánh giá xem mỗi màn hình có giúp đúng người dùng hoàn thành đúng công việc hay không. Dùng [hệ thống thiết kế](../../design.md) cho quy tắc chung và [hướng dẫn màn hình](../../ui-ux-guidelines.md) cho nội dung, hành động và kết quả mong đợi.

## Thực hiện

1. Ghi baseline, môi trường, vai trò và các màn hình được rà soát.
2. Với từng màn hình, kiểm mục đích, thông tin ưu tiên, hành động chính, kết quả sau thao tác và các trạng thái tải/trống/lỗi.
3. Kiểm sự nhất quán của phân cấp, màu, khoảng cách, thành phần, điều hướng, nội dung và khả năng tiếp cận.
4. Thử hành trình chính và hành trình phục hồi; nếu không có trình duyệt, ghi `NOT_ASSESSED` cho trải nghiệm runtime.
5. Findings dùng prefix UX và mẫu trong quy tắc chung; tham chiếu finding đã có thay vì nhân bản.

## Output và điểm dừng

Ghi docs/audit/reports/<YYYY-MM-DD>-<short-commit>/02_UI_UX_AUDIT.md, không ghi đè prompt.
Không tự sửa, deploy hoặc push; báo rõ phạm vi, bằng chứng và giới hạn.
