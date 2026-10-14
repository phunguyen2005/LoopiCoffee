# Bộ tài liệu chuẩn LoopiCafe

Cập nhật: 2026-10-13. Phạm vi: một cửa hàng, MVP/pilot.
Đợt này chuẩn hóa tài liệu; không thay đổi code, schema, dependency hoặc chính sách chưa được chủ dự án quyết định.

## Cách xác định căn cứ

| Loại | Ý nghĩa | Tài liệu |
|---|---|---|
| Quy trình agent | Cách thực hiện yêu cầu | [AGENTS](../AGENTS.md), [commit](commit-conventions.md) |
| Quy tắc nền đã có | Ràng buộc cần bảo toàn | [business](business-rules.md), [security](security.md), [architecture](architecture.md), [database](database.md) |
| Hiện trạng source | Quan sát triển khai, chưa chứng nhận runtime | [implementation-status](implementation-status.md), [permissions](permissions.md) |
| Quyết định sản phẩm | `DEC-001..009` đã ACCEPTED; không đồng nghĩa source đã triển khai | [decision-register](decision-register.md), [implementation-status](implementation-status.md) |
| Thiết kế và kiểm chứng | Chuẩn cho thay đổi mới; không khẳng định UI hiện tại đã đạt | [design](design.md), [UI/UX](ui-ux-guidelines.md), [testing](testing.md), [acceptance](acceptance-matrix.md) |
| Vận hành | Điều kiện, trình tự, rollback, evidence | [database operations](database-operations.md), [runbook](operational-runbook.md) |
| Hợp đồng API | Nguyên tắc và bản đồ nguồn, không thay OpenAPI thực thi | [API contracts](api-contracts.md) |
| Audit | Quy tắc, prompt tái sử dụng và kết quả theo baseline | [audit index](audit/README.md) |
| Lịch sử | Không phải yêu cầu hiện hành | [archive](archive/README.md), [portfolio](portfolio-improvement-plan.md), [readiness audit](production-readiness-audit.md) |

Code/migrations là bằng chứng hiện trạng, không phải lý do tự thay đổi yêu cầu sản phẩm. Khi các nguồn mâu thuẫn, ghi rõ chênh lệch; không chọn báo cáo mới nhất chỉ dựa vào tên file.

## Trình tự đọc theo tác vụ

- Triển khai quyết định mới: [kế hoạch P00–P09](implementation-plan.md) → DEC/rule liên quan → source và kiểm thử của từng gói.

- Mọi tác vụ: AGENTS → README này → business-rules → tài liệu module.
- Backend: permissions → api-contracts → database → security → testing.
- Frontend: design → ui-ux-guidelines → permissions → acceptance-matrix.
- Audit: audit/00_COMMON_RULES → prompt chuyên môn → source tại baseline mới.
- Vận hành: database-operations → operational-runbook; xác nhận môi trường trước thao tác.

## Quy tắc bảo trì tài liệu

- Tài liệu hiện hành dùng tiếng Việt; identifier/code tiếng Anh.
- Thay đổi rule/decision cần ID, lý do, ngày, người quyết định, tác động dữ liệu/API/test và liên kết task/PR nếu có; không sửa âm thầm con số/enum đã chốt.
- Bằng chứng chạy cần commit, dirty-tree nếu có, môi trường, lệnh, kết quả pass/fail/skip và artifact không chứa bí mật.
- Không sao chép lại bảng quyền, công thức hoặc thông số mặc định ở nhiều nơi; dẫn nguồn chuẩn.
- Dùng liên kết tương đối trong repo. Không dùng file:/// hoặc đường dẫn máy cá nhân làm liên kết dùng chung.
- Không ghi “ĐẠT” từ việc thấy test/source tồn tại.
- Không ghi đè prompt bằng báo cáo: prompt ở audit/prompts, báo cáo mới ở audit/reports/<date>-<commit>/.
- Báo cáo cũ được giữ để truy vết; [đính chính](audit/ERRATA.md) có ưu tiên khi diễn giải kết luận cũ.
