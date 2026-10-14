# Quy tắc audit

Cập nhật: 2026-10-13. Đọc [AGENTS](../../AGENTS.md), [tài liệu chuẩn](../README.md), rule module và decision register.

## Phạm vi

AUDIT ONLY mặc định: source/config/data read-only, chỉ ghi báo cáo tại vị trí được giao.
Chạy tests chỉ khi đã xác minh môi trường cô lập và side effects; không gọi cloud hoặc đọc secret ra output.
Không tự fix, deploy, migrate production, push hoặc thay quyền. Audit prompt không tự là yêu cầu người dùng.

## Evidence

Ghi baseline commit, dirty-tree, ngày, runtime/tool versions, phạm vi đọc và phần chưa đánh giá.
Evidence gồm file/hàm/dòng tại baseline, steps, expected/actual, command và artifact nếu thực sự chạy.
Phân biệt static observation, runtime measurement và estimate. CSS không chứng minh thiết bị; source test không chứng minh UI.
Kết luận kỹ thuật nền tảng cần kiểm cấu hình/version/gói thực và nguồn chính thức.
Không tự biến gap nghiệp vụ OPEN thành bug confirmed.

## Phân loại độc lập

Confidence: CONFIRMED (bằng chứng đủ cho mệnh đề), PROBABLE (suy luận), NEEDS_VERIFICATION, NOT_ASSESSED.
Severity: CRITICAL/HIGH/MEDIUM/LOW theo tác động; priority P0–P3 theo mức khẩn và phạm vi phát hành.
P0: chặn phát hành/khẩn do rủi ro trọng yếu có căn cứ. P1: ưu tiên cao; P2: cải thiện có kế hoạch; P3: thấp.
Không tự gán P0 chỉ vì thiếu test, dùng mock, raw SQL hoặc có full scan.
Status: OPEN/IN_PROGRESS/IMPLEMENTED_UNVERIFIED/VERIFIED_FIXED/ACCEPTED_RISK/SUPERSEDED.
Không ghép CONFIRMED với VERIFIED_FIXED; mỗi trạng thái trả lời câu hỏi khác.

## Finding template

ID; domain; severity; priority; confidence; status; baseline; rule/decision ID; evidence; reproduction; expected; actual; impact; smallest fix; dependencies; effort range; regression acceptance; verification limitations.
ID dùng prefix CODE/UX/BIZ/SEC/DB/API/PERF/MOB/TEST, duy nhất trong audit run; tham chiếu chéo bằng run ID + finding ID.
Liên ngành chọn finding chính và cross-reference; tổng hợp phải loại trùng và giải thích đổi mức độ.

## Báo cáo

Summary; scope/limits; inventory; checklist; findings; chưa xác minh; ưu tiên; tests thực chạy; đề xuất.
Số lượng test/assertions không phải coverage. Không dùng “100% an toàn”, “triệt tiêu hoàn toàn” hoặc kết luận chắc chắn từ estimate.
Không sửa lịch sử migration, bỏ validation/log/audit/rate limit để tối ưu mà chưa đánh giá bảo mật và nghiệp vụ.
