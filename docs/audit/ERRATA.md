# Đính chính cách sử dụng audit lịch sử

Ngày: 2026-10-13. Áp dụng báo cáo 05–10 baseline 05e7719.
Giữ nguyên nội dung gốc để truy vết; các kết luận dưới đây phải được đọc cùng báo cáo. Đây không phải xác nhận fix runtime.

| Nhóm | Cần hiệu chỉnh khi sử dụng |
|---|---|
| PERF-001 | Ngưỡng Workers 50ms Free/Standard không dùng làm tiền đề chung. Kiểm gói/config và CPU thực. Không thay full validation bằng parser header mà thiếu kiểm malformed/truncated |
| PERF-002 / DB-009 / API-005 | Số request giả định không chứng minh nghẽn D1. Tách write count, row writes, latency và load test; không bỏ rate limit để đạt zero writes |
| PERF-005 | Phân biệt internal-service subrequests và giới hạn chung. Concurrency không tự giảm số request; giữ retry metadata khi delete thất bại |
| PERF-009 | Cache ảnh và bỏ audit view cần review quyền/expiry/logout/retention; không áp dụng như tối ưu vô điều kiện |
| PERF-011 | JWT verification cục bộ không tự thay thế revocation/membership policy |
| DB-002 | Thiếu breakpoint chỉ là blocker khi runner thực bị ảnh hưởng; local hiện dùng Wrangler. Không tự sửa migration đã áp dụng |
| DB-001/DB-007 | Drift/constraint cần xác minh invariant và dữ liệu; không gán P0 chỉ vì model khác metadata hoặc bảng không có CHECK |
| API-001/006/007 | Chốt policy quyền/hủy đơn; source HEAD đã khác baseline. Không kết luận lỗi hiện tại từ báo cáo cũ |
| API-009 | x-forwarded-for fallback chỉ tin khi proxy boundary xác thực |
| MOB | Static CSS không chứng minh runtime clipping/keyboard failure. 44px là chuẩn UX nội bộ/SC 2.5.5 AAA, không phải toàn bộ AA |
| TEST | Mock/source tests có vai trò riêng; thiếu E2E là gap evidence, không tự là incident P0. CI/Playwright hiện đã khác baseline |
| Tổng hợp | Phân biệt hoàn thành báo cáo và hoàn tất kiểm chứng; tổng số findings không phải số lỗi độc lập |

Nguồn chính thức để tái kiểm: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), [WCAG minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [WCAG enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

Các mốc 1–2 ngày, <2ms, <1s hoặc zero writes trong báo cáo cũ là mục tiêu/ước lượng chưa có benchmark chấp nhận; không dùng như cam kết.
