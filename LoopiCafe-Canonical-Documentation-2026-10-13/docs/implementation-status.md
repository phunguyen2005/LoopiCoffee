# Hiện trạng đối chiếu source

Ngày đọc: 2026-10-13. Git HEAD: 888495ba3fddf4798b80f9a1cbe4aec65c0991b8.
Working tree sạch lúc khảo sát trước sửa docs. Phương pháp: đọc source/config chọn lọc; KHÔNG chạy app tests, browser, cloud hoặc migration trong đợt này.

| Quan sát | Nguồn | Giới hạn |
|---|---|---|
| Migration source đến 0014, có index đơn/retention và unique lower(email) | drizzle/0014_indexes_and_perf.sql | Chưa chứng minh môi trường đã apply |
| Manager domain policy chặn target manager/owner/system_admin | modules/people/domain/access.ts | Cần trace từng route và runtime test |
| Team lead tạo/sửa/hủy ca bị chặn target manager/owner | modules/operations/application/manage-shifts.ts | Không chứng nhận mọi edge case/quyền |
| Tạo ca xuất bản trực tiếp; 1–31 ca/request, ca >0 và <=24h | manage-shifts.ts | Đây là limit implementation, không quy tắc lao động đã duyệt |
| Leave có tác động ca; swap/correction trả requiresManualAction | modules/operations/application/decide-request.ts | Chưa có claim applied lifecycle |
| Finalize cho owner/manager; reopen owner và finalized | modules/payroll/application/change-period.ts | Xem DEC-001 và ACC-06 |
| Báo cáo dùng snapshot rate khi có, fallback rate hiện tại | modules/payroll/application/load-report.ts | Chưa thay thế rate history; legacy/mid-period theo DEC-006 |
| Ready order có nhánh cancelled kèm lý do free-text | modules/ordering/application/change-status.ts | DEC-007 đã chốt reason enum và spoilage report; source chưa đồng bộ |
| CI có install Chromium, seed-menu và test:e2e | .github/workflows/check.yml | Chưa có bằng chứng auth E2E không skip |
| Playwright mặc định Chromium; retries CI=2 | playwright.config.ts | Chưa chạy browser |
| Local migration gọi Wrangler d1 migrations apply --local | tooling/local.mjs | Không suy ra runner của deployment thật |
| Token UI nội bộ và đặt món riêng | app/globals.css, components/order/order-tokens.css | Chưa đo contrast/render |

Audit 05–10 dùng baseline 05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1. Không tự đóng finding cũ chỉ vì nhìn thấy patch; cần evidence chạy theo [acceptance matrix](acceptance-matrix.md).
Danh sách này không phải inventory đầy đủ của mọi tính năng.

## Chênh lệch với quyết định đã chốt ngày 2026-10-13

Các mục dưới là `IMPLEMENTATION_REQUIRED`, không phải finding đã tái hiện bằng runtime test:

| Quyết định | Source hiện tại quan sát | Khoảng cách phải triển khai |
|---|---|---|
| DEC-001 | team_lead còn duyệt mọi request và sửa công; chưa có self-approval guard riêng | Thu hẹp role, chặn self-approval, sole-owner correction audit, chặn system_admin business actions |
| DEC-002 | Tạo ca publish trực tiếp | Thêm draft/publish và cut-off 12 giờ với adjustment flow |
| DEC-003 | Swap/correction mới trả manual action | Thêm withdraw, approved_pending_apply/applied và swap transaction nguyên tử |
| DEC-004 | Rule hiện dùng cấu hình/default; chưa có contract 5/15 phút và auto-close +4 giờ đầy đủ | Thêm overtime approval, missing-checkout zero approved minutes và scheduler/guard |
| DEC-005 | Checklist theo ngày; handover là store journal không receiver | Thêm routine type/shift link, receiver/next shift, acknowledge và audited bypass |
| DEC-006 | Có snapshot/fallback rate hiện tại, chưa có rate history đầy đủ | Thêm rate history, block legacy thiếu rate, floor 15 phút và round tổng 1.000 VND |
| DEC-007 | Source cho hủy ready với free-text reason | Chuẩn hóa reason enum, customer denial rõ và spoilage reporting |
| DEC-008 | Có evidence expiry/retention endpoint một phần | Bổ sung 3-year policies, order anonymization 180 ngày và restore reprocessing |
| DEC-009 | CI/test tồn tại nhưng acceptance baseline vẫn NOT_RUN | Thu evidence core E2E, integrity, Auth/RBAC, mobile và restore drill tại release commit |

Không được sửa bảng này thành “đã triển khai” nếu chỉ đổi Markdown. Mỗi dòng cần code/schema/test/evidence tương ứng.
