# Prompt audit — Mobile-first

Áp dụng khi có yêu cầu audit. Đọc [quy tắc chung](../00_COMMON_RULES.md) và [docs index](../../README.md).

## Mục tiêu

Đánh giá liệu hành trình quan trọng có thật sự được thiết kế cho điện thoại trước hay chỉ là giao diện desktop thu nhỏ. Quy tắc chuẩn nằm tại [hệ thống thiết kế](../../design.md); không lặp lại trong báo cáo.

## Thực hiện

1. Ghi baseline, thiết bị hoặc viewport, hướng màn hình, mức zoom và hành trình được thử.
2. Bắt đầu ở 375 px; kiểm thứ tự nội dung, thao tác một tay, vùng chạm, bàn phím, thanh cố định và cuộn ngang.
3. Kiểm 320, 390, 430, 768 px, landscape và zoom 200%; sau đó xác nhận tablet/desktop không mất chức năng.
4. Ưu tiên lịch, báo cáo, form, hộp thoại và luồng camera/vị trí vì dễ hỏng trên màn hình nhỏ.
5. Findings dùng prefix MOB và mẫu trong quy tắc chung. Chỉ đánh dấu runtime đã kiểm khi có bằng chứng từ trình duyệt hoặc thiết bị.

## Output và điểm dừng

Ghi docs/audit/reports/<YYYY-MM-DD>-<short-commit>/08_MOBILE_RESPONSIVENESS_AUDIT.md, không ghi đè prompt.
Không tự sửa, deploy hoặc push; báo rõ phạm vi, bằng chứng và giới hạn.
