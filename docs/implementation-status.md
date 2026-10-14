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

## Hiện trạng đối chiếu các quyết định (DEC-001..DEC-009)

Các quyết định dưới đây được đối chiếu theo source và kiểm thử cục bộ. Trạng thái `PARTIAL` chỉ phần đã có bằng chứng; không suy rộng sang phần nghiệp vụ chưa được mô hình dữ liệu hỗ trợ:

| Quyết định | Gói | Trạng thái | Chứng minh trong code & test |
|---|---|---|---|
| DEC-001 | P01 | **IMPLEMENTED & VERIFIED** | Anti-self-approval trong `access.ts`, `decide-request.ts`, `review-attendance.ts`; Sole-owner self-correction trong `correct-attendance.ts` (kiểm tra `owner_count === 1`, audit highAudit); Quarantine `system_admin` tại `server/auth.ts`. Pass 100% C01-1..C01-5 & C06-4. |
| DEC-002 | P02 | **IMPLEMENTED & VERIFIED** | Draft/Publish flow trong `manage-shifts.ts` và `/api/shifts`; ẩn draft khỏi staff/lead; Cut-off 12h chặn direct edit/cancel, yêu cầu `action: adjust` kèm lý do và audit; SQLite overlap trigger bảo vệ. Pass 100% C02-1..C02-6. |
| DEC-003 | P03 | **IMPLEMENTED & VERIFIED** | Rút pending request bởi chính requester trong `withdraw-request.ts`; Swap nguyên tử cập nhật 2 ca trong `apply-swap.ts` dưới revision guard và trigger; Chặn sửa ca đã có công/kỳ khóa. Pass 100% C06-1..C06-3. |
| DEC-004 | P04 | **IMPLEMENTED & VERIFIED** | Clipping 15 phút biên ca, overtime approval độc lập trong `load-report.ts`; `autoCloseForgottenSessions` đóng phiên quên checkout (+4h) ghi nhận 0 phút công chờ duyệt. Pass 100% C03-1..C03-5. |
| DEC-005 | P06 | **PARTIAL — HANDOVER VERIFIED** | Handover acknowledgment gate tại check-in trong `check-handover-gate.ts` & `/api/attendance/actions`; ca đầu ngày bypass; manager emergency bypass yêu cầu lý do >= 5 ký tự và audit log; `acknowledgeHandover` trong `manage-handovers.ts` & `/api/handovers`. Pass C05-1..C05-3. Checklist hiện vẫn lưu theo `business_date`, chưa có khóa/routine theo ca nên frontend chỉ hiển thị đúng phạm vi “hôm nay”. |
| DEC-006 | P05 | **IMPLEMENTED & VERIFIED** | Migration `0015_employee_rate_history.sql` và trigger chống trùng khoảng hiệu lực; Chia đoạn công theo rate history; Floor 15 phút per session; Round số học 1.000 VND tổng lương; Chặn finalize nếu thiếu rate history (`pay_rate_required`). Pass 100% C04-1..C04-5. |
| DEC-007 | P07 | **IMPLEMENTED & VERIFIED** | Chuẩn hóa reason code enum (`customer_abandoned`, `item_preparation_error`, `store_incident`) khi hủy đơn preparing/ready trong `change-status.ts`; Chặn nhân viên thường hủy đơn; `getSpoilageMetrics` phân tách rõ đơn hao hụt và doanh thu thực. Pass 100% P07-1, P07-2. |
| DEC-008 | P08 | **IMPLEMENTED & VERIFIED** | Hết hạn ảnh/GPS 90 ngày (`expire-evidence.ts`) bảo toàn raw events; Ẩn danh hóa thông tin định danh khách hàng sau 180 ngày (`anonymize-orders.ts`) bảo toàn doanh thu; Bất biến lưu trữ lịch sử vận hành tối thiểu 3 năm. Pass 100% C07-1..C07-5. |
| DEC-009 | P09 | **IMPLEMENTED & VERIFIED (local)** | 202 tests trong suite và 26 Playwright E2E PASS 100% (0 fail, 0 skip) ngày 2026-10-14; typecheck, ESLint và build đều pass. Chưa thay thế evidence staging/hosted theo acceptance matrix. |

## Khắc phục source audit 2026-10-14

Các thay đổi dưới đây đã được triển khai trên working tree sau baseline audit; trạng thái phát hành vẫn phụ thuộc toàn bộ gate trong acceptance matrix:

- Chặn self-approval tại application boundary cho request và review chấm công.
- Khi ghi chấm công lỗi mơ hồ, kiểm tra replay trước khi xóa ảnh; lỗi xóa được lưu thành tác vụ audit có thể retry bởi retention job.
- Tạo đơn yêu cầu `expectedTotal`; khi giá server thay đổi trả `409 price_changed` kèm tổng mới để khách xác nhận lại.
- Tạo bàn giao dùng `idempotencyKey` và payload hash; migration `0016_handover_idempotency.sql` bảo đảm một bản ghi cho cùng actor/store/key.
- Tải menu hủy request cũ, hiển thị lỗi/retry; bật tắt món dùng `expectedUpdatedAt` và trả `409 menu_conflict` khi stale.
- Auth response truyền đủ cache headers do Supabase SSR yêu cầu; API mặc định `private, no-store` nếu route không khai báo cache policy khác.
- Test stress response cũ dùng `LatestRequestGate` từ production thay vì tự chép lại request-id guard.

## Đồng bộ frontend với nghiệp vụ backend 2026-10-14

- Luồng Hôm nay hiển thị và yêu cầu xác nhận bàn giao trước khi chấm vào ca; phản hồi lỗi từ API dẫn người dùng về đúng màn hình xử lý.
- Trạng thái quên checkout được diễn đạt là đang chờ duyệt, không cộng giờ/lương trước khi backend phê duyệt.
- Sự cố và đơn hàng giữ idempotency key khi mất phản hồi để retry không tạo bản ghi trùng; giỏ hàng gửi `expectedTotal` và xử lý xung đột giá từ server.
- Điều hướng và quyền frontend được thu hẹp theo quyền backend: `system_admin` không thao tác nghiệp vụ cửa hàng; `team_lead` chỉ duyệt đổi ca; owner/manager/employee chỉ thấy màn hình phù hợp.
- Checklist được ghi rõ là checklist theo ngày vì schema/API hiện tại chưa hỗ trợ checklist riêng cho từng ca.
- Dialog đặt món có quản lý focus, Escape/Tab, phục hồi focus; control chính đạt tối thiểu 44 px và lỗi form trỏ/focus đến trường không hợp lệ.

