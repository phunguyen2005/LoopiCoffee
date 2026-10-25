# Hiện trạng đối chiếu source

## Cập nhật storage — 2026-10-26

DEC-016: runtime đã thay R2 bằng adapter Supabase Storage private; schema D1, object keys, hash, quyền đọc, expiry và cleanup retry giữ nguyên. Local bật Storage và provision bucket loopback; build production riêng loại R2 và dùng `main`. Hướng dẫn tại [triển khai Free](free-production-deployment.md); [evidence local](verification/2026-10-26-supabase-storage.md) ghi 302 tests PASS, typecheck/lint/build và private Storage drill local. Chưa có bằng chứng upload/download/delete trên Supabase cloud, rollout cloud hoặc chuyển dữ liệu R2 thật. Các mốc dưới đây giữ nguyên baseline lịch sử.

Ngày đọc: 2026-10-13. Git HEAD: 888495ba3fddf4798b80f9a1cbe4aec65c0991b8.
Working tree sạch lúc khảo sát trước sửa docs. Phương pháp: đọc source/config chọn lọc; KHÔNG chạy app tests, browser, cloud hoặc migration trong đợt này.

| Quan sát | Nguồn | Giới hạn |
|---|---|---|
| Migration source đến 0014, có index đơn/retention và unique lower(email) | drizzle/0014_indexes_and_perf.sql | Chưa chứng minh môi trường đã apply |
| Manager domain policy chặn target manager/owner/system_admin | modules/people/domain/access.ts | Cần trace từng route và runtime test |
| Team lead tạo/sửa/hủy ca bị chặn target manager/owner | modules/operations/application/manage-shifts.ts | Không chứng nhận mọi edge case/quyền |
| Tạo ca xuất bản trực tiếp; 1–31 ca/request, ca >0 và <=24h | manage-shifts.ts | Đây là limit implementation, không quy tắc lao động đã duyệt |
| Leave có tác động ca; correction có dữ liệu cấu trúc được duyệt và áp dụng append-only; swap vẫn trả requiresManualAction | modules/operations/application/decide-request.ts | Correction legacy thiếu event/session/time/revision phải gửi lại; swap chưa có applied lifecycle |
| Finalize theo `payroll.finalize`; reopen chỉ OWNER và kỳ finalized | modules/payroll/application/change-period.ts | UI/API tách quyền xem, chốt, mở lại và export |
| Báo cáo dùng rate history theo đúng đoạn công; snapshot cho kỳ khóa | modules/payroll/application/load-report.ts | Khoảng rate bị hở chặn finalize, không fallback về rate hiện tại |
| Hủy đơn `preparing/ready` bắt buộc reason code chuẩn hóa; báo cáo hao hụt tách riêng | modules/ordering/application/change-status.ts, components/operational/owner-orders-view.tsx | Giá trị hao hụt hiển thị là giá bán lẻ snapshot, không phải chi phí nguyên liệu hay doanh thu thực thu |
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
| DEC-004 | P04 | **PARTIAL** | `load-report.ts` đã clip phiên có liên kết ca về khung ca và không còn suy tăng ca từ chênh lệch tổng tháng; `autoCloseForgottenSessions` giữ phiên quên checkout ở 0 phút chờ duyệt. Schema/API hiện chưa có bản ghi tăng ca được duyệt gồm phút + lý do + actor, nên chưa thể xác nhận đầy đủ ATT-008/PAY-001. |
| DEC-005 | P06 | **PARTIAL — HANDOVER VERIFIED** | Handover acknowledgment gate tại check-in trong `check-handover-gate.ts` & `/api/attendance/actions`; ca đầu ngày bypass; manager emergency bypass yêu cầu lý do >= 5 ký tự và audit log; `acknowledgeHandover` trong `manage-handovers.ts` & `/api/handovers`. Pass C05-1..C05-3. Checklist hiện vẫn lưu theo `business_date`, chưa có khóa/routine theo ca nên frontend chỉ hiển thị đúng phạm vi “hôm nay”. |
| DEC-006 | P05 | **IMPLEMENTED & VERIFIED (local)** | Migration `0015_employee_rate_history.sql` và trigger chống overlap; payroll chia cả phiên công tại ranh giới rate, floor 15 phút trước khi phân đoạn, không fallback khi khoảng rate bị hở, chỉ round tổng cuối kỳ 1.000 VND. OWNER có luồng khôi phục rate lịch sử kèm căn cứ/audit; snapshot khóa giữ nguyên. Regression `tests/payroll-pay001-pay006.test.mjs` bao phủ clip kỳ/ca, rate boundary/gap, round tổng, quyền UI và formula injection. |
| DEC-007 | P07 | **IMPLEMENTED & VERIFIED (local)** | Chuẩn hóa reason code enum (`customer_abandoned`, `item_preparation_error`, `store_incident`) khi hủy đơn preparing/ready trong `change-status.ts`; hủy pending/accepted không bị tính hao hụt; màn hình đơn có tab Báo cáo hao hụt riêng theo mã lý do. Số tiền là giá bán lẻ snapshot, không gọi là doanh thu thực thu hoặc chi phí nguyên liệu. Regression đặt món PASS local ngày 2026-10-17. |
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
- Checklist hỗ trợ `daily_routine` theo business date và `shift_routine` gắn ca; ca qua 00:00 dùng business date từ thời điểm bắt đầu ca.
- Dialog đặt món có quản lý focus, Escape/Tab, phục hồi focus; control chính đạt tối thiểu 44 px và lỗi form trỏ/focus đến trường không hợp lệ.

## Checklist, bàn giao và sự cố theo ca — working tree 2026-10-17

- Migration `0019_ops_shift_workflow.sql` bổ sung scope checklist theo ca và liên kết bàn giao với ca gửi, người/ca nhận, người xác nhận; không sửa migration cũ.
- Màn hình Bàn giao hiển thị checklist `shift_routine` chưa hoàn thành ngay trước form, không tự hoàn thành; form yêu cầu summary, ca/người nhận và cờ `manager_attention` do người giao chủ động chọn.
- Danh sách/số lượng checklist hoạt động chỉ lấy ca đang diễn ra hoặc ca sắp tới được giao; ca đã kết thúc không còn xuất hiện trong danh sách hoạt động. API từ chối tạo mới, đánh dấu hoàn thành hoặc mở lại checklist ca sau `shift.ends_at` bằng `409 shift_ended`; lịch sử vẫn được giữ để tra cứu.
- Acknowledge chỉ chấp nhận đúng người hoặc nhân sự của ca nhận. Check-in chỉ bị chặn bởi bàn giao nhắm đúng người/ca; MANAGER/OWNER bypass vẫn cần lý do và audit.
- Sự cố giữ state machine `open → acknowledged → resolved → closed`; update và audit cùng D1 batch, UI chỉ hiện hành động bước kế tiếp và tải lại khi xung đột.
- Typecheck, migration/schema parity, test checklist ca đêm, handover recipient/gate/bypass và incident transition/rollback đã PASS local. Browser E2E và migration staging/production chưa chạy.

## RBAC và khu vực quản trị — working tree 2026-10-14

- **IMPLEMENTED & VERIFIED (local)** cho DEC-010 trên baseline `6d2f50a`; working tree còn dirty, chưa commit, chưa deploy và chưa chạy migration production.
- Schema/migration đã có role permission sets, account revision và operation status; policy tải quyền theo từng request và permission-aware actor từ chối an toàn khi thiếu cấu hình.
- `/api/admin/accounts` đã tách khỏi `/api/team`; khu vực admin có dashboard/accounts/roles/audit, còn OWNER chỉ đọc roles/audit. Response và audit quản trị tài khoản không chứa lương, công, ảnh hoặc GPS.
- Race revision, retry idempotency, thu hồi quyền ở lần tải kế tiếp và bảo vệ OWNER cuối cùng (kể cả hai cập nhật đồng thời) đã PASS trong integration test.
- `npm run check` PASS (typecheck, lint, 209 tests và build), test RBAC PASS 6/6, `npm run local:migrate` PASS trên D1 local và Playwright PASS 27/27 (0 fail, 0 skip). Xem [evidence local](verification/2026-10-14-6d2f50a/rbac-local.md).
- Chưa kiểm thử lỗi thật giữa Supabase Auth và D1 hoặc nghiệm thu staging; các mục đó giữ trạng thái chưa xác minh và không được suy thành production-ready.

## Cập nhật trạng thái nhân viên và phạm vi xếp lịch (2026-10-25)

- OWNER có thể chuyển nhân viên cấp dưới giữa `active`, `suspended` và `offboarded` tại màn hình Nhân sự; mutation bắt buộc lý do và `access_revision`, được ghi audit và đồng bộ trạng thái khóa với Supabase Auth khi tài khoản đã liên kết.
- Danh sách chọn người khi xếp lịch chỉ trả tài khoản `active` có tham gia chấm công. API tạo ca, xuất bản ca nháp, đổi ca và bố trí người thay vẫn kiểm tra trạng thái phía server để chặn lách giao diện.
- Khóa hoặc nghỉ việc không xóa ca, công hay dữ liệu lương cũ; lịch sử đã phát sinh tiếp tục được giữ để đối soát.

## Khắc phục 4 gói tính năng (A, B, C, D) — working tree 2026-10-16 (Baseline `6d2f50a`)

| Gói | Nội dung | Trạng thái | Chứng minh trong Code & Test |
|---|---|---|---|
| **Gói A** | Tái hiện & sửa quản trị tài khoản, thống kê Admin (`/api/admin/summary`), xử lý email mời & mật khẩu tạm trong memory | **IMPLEMENTED & VERIFIED (local)** | UI Admin (`components/app-shell.tsx`, `components/admin-dashboard-view.tsx`) hiển thị 3 metric từ `/api/admin/summary` (Tài khoản hoạt động, Chờ kích hoạt, Thao tác lỗi) có loading/error/retry và không gọi API vận hành; `accounts/route.ts` phân loại lỗi Auth/D1 (`app_url_missing`, `auth_config_missing`, `email_provider_rejected`, `rate_limit_exceeded`, `account_conflict`, `account_persistence_failed`), rollback Auth khi D1 lỗi, giữ nguyên `idempotencyKey` khi retry cùng payload, replay idempotency trả `{ passwordRetrievable: false }` kèm nút cấp lại mật khẩu tạm mới, modal copy mật khẩu 1 lần trong bộ nhớ. Pass 9/9 `tests/rbac-system-admin.test.mjs`. *(Lưu ý: SMTP gửi email ra ngoài thật ghi nhận "đã triển khai cấu hình tùy chọn, chưa xác minh dịch vụ thật")*. |
| **Gói B** | Vai trò tùy chỉnh (Custom Roles) theo DEC-010 & DEC-014 | **IMPLEMENTED & VERIFIED (local)** | Migration `0018_custom_roles_and_cover_shifts.sql` tạo bảng `custom_roles` và cột `role_id`; API `/api/admin/roles` (khởi tạo 0 quyền, bắt buộc dependencies, chặn archive khi còn tài khoản `role_in_use`, fail-closed khi thiếu/archive); đồng bộ quyền hiệu lực xuyên suốt backend & UI (menu, `/app`, lịch, yêu cầu, công, lương/export) và tải lại qua `/api/me/permissions`; tập trung target guard (`access.ts`, `decide-request.ts`, `review-attendance.ts`, `correct-attendance.ts`, `apply-swap.ts`, `manage-shifts.ts`) cho phép peer-approval cùng store (kể cả đồng cấp) nhưng chặn tự duyệt và chặn target `owner`/`system_admin`. Pass 9/9 `tests/rbac-system-admin.test.mjs`. |
| **Gói C** | Hủy ca (cut-off 12h theo DEC-002), Duyệt nghỉ & Bố trí người thay | **IMPLEMENTED & VERIFIED (local)** | Kiểm chứng các mốc `12h - 1s`, đúng `12h`, `12h + 1s`, ca qua đêm và timezone `Asia/Ho_Chi_Minh`; `manage-shifts.ts` phân tách nguyên nhân conflict (`shift_conflict`, `invalid_shift_status`, `shift_has_approved_leave`, `shift_has_attendance`, `shift_locked_period`, `cutoff_lock_active`); UI kiểm tra quyền riêng từng hành động (`canCreate`, `canPublish`, `canAdjust`, `canCancel`, `canAssignCover`) và có nút tải lại khi 409 revision cũ; tạo đơn nghỉ gửi notification nguyên tử cho approvers active (gồm Owner & custom roles); đồng nhất trạng thái `"Nghỉ đã duyệt"` trên lịch tuần/danh sách/Hôm nay/Tổng quan, thay nút `"Đổi ca"` bằng `"Xem đơn nghỉ"`, tự làm mới khi focus/30s; `assignCoverShift` tạo ca thay liên kết `cover_for_shift_id`, yêu cầu `shifts.create` + `shifts.publish`, lọc nhân sự active chấm công không trùng lịch, chống gán trùng và về `"Chưa bố trí"` khi hủy ca thay. Pass 8/8 `tests/package-c-shifts-leave-cover.test.mjs`. |
| **Gói D** | Camera/GPS độc lập & Cảnh báo Dashboard | **IMPLEMENTED & VERIFIED (local)** | `attendance-capture.tsx` giữ nguyên mã lỗi API khởi tạo, tách rời khởi tạo Camera & GPS song song (GPS lỗi không tắt camera), kiểm tra khung hình video trước khi chụp, phân loại lỗi Web API, đếm ngược phiên 60s kèm chặn gửi bằng chứng hết hạn ở cả bước chụp và bước xem lại ảnh, hủy lượt khởi tạo cũ (`attemptIdRef`) khi đổi hành động/đóng/reset; `dashboard-view.tsx` gom cảnh báo ca chưa check-in gọn trên một khối (số lượng, tên, giờ ca, số phút trễ, liên kết chi tiết, 1 nhãn cảnh báo, nền dịu tương phản cao), đối chiếu theo `shift_id` + lịch sử phiên công với ngưỡng 5 phút giờ server và hiển thị mốc `serverTime` cập nhật. Pass 8/8 `tests/package-d-camera-dashboard.test.mjs`. *(Lưu ý: Thiết bị camera vật lý thật ghi nhận "đã triển khai, chưa xác minh trên thiết bị thật")*. |

## Chấm công và xử lý ngoại lệ — working tree 2026-10-17

- `REQ-005`: yêu cầu correction mới lưu event/session/action/effective time/expected revision; duyệt hợp lệ cập nhật phiên và ghi `attendance_corrections` append-only với `source_request_id` + `revision`. Sự kiện `attendance_events.recorded_at` không đổi. Yêu cầu legacy thiếu dữ liệu cấu trúc bị chặn và phải gửi lại.
- `ATT-009`: auto-close vẫn chốt tại `shift.ends_at + 4 giờ`, giờ được duyệt/tính lương là 0; chạy lặp không tạo thêm ngoại lệ `MISSING_CHECKOUT`. Correction được duyệt có thể bổ sung checkout không cần tạo raw event giả.
- `ATT-004..007`: Thiết lập geofence được khóa server-side trong khoảng 50–200m và UI ghi rõ chỉ dùng tham khảo; mặc định local seed là 15 phút check-in sớm, 5 phút đi muộn/về sớm, auto-close 240 phút, retention ảnh/GPS 90 ngày.
- Bằng chứng local: typecheck và lint PASS; toàn bộ 235 test thuộc 20 suite PASS (0 fail, 0 skip), gồm schema parity, migration, handover, dashboard, auto-close và correction request; production build PASS. Browser E2E đã thử nhưng bị chặn trước luồng nghiệp vụ vì form đăng nhập giữ `data-auth-ready=false`; chưa xác minh camera/GPS thiết bị thật hoặc scheduler/hosted.

## Auth recovery và giới hạn một Admin/Owner — working tree 2026-10-25

- **IMPLEMENTED & VERIFIED (local)** cho DEC-015: cửa hàng chính có đúng một `system_admin` và một `owner`; API thường không tạo Admin, Owner không gán thêm Owner, còn tạo/nâng Owner từ Admin bị chặn bằng điều kiện ghi nguyên tử khi đã có Owner.
- Provision local và endpoint seed cục bộ liên kết lại `auth_user_id` theo đúng người dùng Supabase. Luồng đăng nhập local chỉ tự relink theo email đã xác minh khi bật `LOOPI_LOCAL_ONLY`; môi trường khác vẫn fail-closed và dùng runbook recovery.
- UI Admin vô hiệu hóa Owner thứ hai, bảo vệ Owner duy nhất khỏi hạ role/khóa/offboard và hướng sang gửi lại lời mời hoặc cấp mật khẩu tạm trên đúng tài khoản.
- Kiểm chứng ngày 2026-10-25: test RBAC/bảo mật/workforce 53/53 PASS; Auth Playwright 12/12 PASS gồm đăng nhập Admin/Owner, refresh/logout, quyền API, chặn API Owner thứ hai và trạng thái UI; lint các file thay đổi PASS; Docker daemon, Supabase Auth, SMTP local và app 4173 đều healthy.
- Full TypeScript check còn bị chặn bởi lỗi có sẵn, ngoài phạm vi DEC-015: `components/operational/owner-orders-view.tsx` chưa định nghĩa `normalizeMenuText` tại ba vị trí sử dụng (6 diagnostics). Chưa deploy hoặc xác minh recovery trên production/Supabase hosted.
