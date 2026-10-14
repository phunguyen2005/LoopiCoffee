# Kế hoạch triển khai quyết định nghiệp vụ mới

Ngày lập: 2026-10-13. Baseline source: `888495ba3fddf4798b80f9a1cbe4aec65c0991b8`, working tree có tài liệu chưa commit. Trạng thái: **PLANNED**; chưa triển khai code hoặc chạy kiểm thử trong lượt lập kế hoạch.

Nguồn: [quyết định](decision-register.md), [nghiệp vụ](business-rules.md), [quyền](permissions.md), [hiện trạng](implementation-status.md), [nghiệm thu](acceptance-matrix.md). Giữ modular monolith và stack hiện có. Kế hoạch không cấp quyền deploy, migration hoặc cleanup dữ liệu thật.

## 1. Kết quả cần bàn giao

Một luồng xuyên suốt: OWNER/MANAGER lập lịch nháp → xuất bản → nhân viên nhận ca → xác nhận bàn giao phù hợp → chấm công → giải trình/duyệt độc lập → tính công theo policy và đơn giá lịch sử → khóa snapshot lương. Các luồng checklist, sự cố, swap, hủy đơn và retention phải dùng cùng quyền và lịch sử truy vết.

Mỗi gói bàn giao gồm code, migration nếu cần, UI tích hợp, regression tests và evidence. Không gộp mọi migration/backend thành một đợt lớn rồi mới làm UI. Các tên file mới bên dưới là đề xuất, các tên hiện có là điểm sửa đã khảo sát.

## 2. Các điểm cần làm rõ trước phần code phụ thuộc

DEC-001..009 đã ACCEPTED nhưng một số chi tiết chưa đủ để viết thuật toán duy nhất. Bước P00 phải ghi ví dụ và xác nhận cách hiểu; không âm thầm đổi policy đã chốt. Các gói độc lập vẫn có thể tiến hành.

| Mã | Điểm cần xác định | Ảnh hưởng / đầu ra cần có |
|---|---|---|
| C01 | Văn bản cấm tự duyệt dựa trên người tạo; swap còn ảnh hưởng người của ca thứ hai. “Cấp dưới” hiện chưa có quan hệ báo cáo trực tiếp | Ma trận actor/requester/beneficiary cho từng loại request; nêu rõ scope employee của team lead; không chỉ so email người tạo |
| C02 | Draft có giữ chỗ lịch không? Trigger hiện tại chống overlap cả draft và published | Chọn cách giữ overlap hiện có hoặc sửa bằng migration có lý do; định nghĩa publish theo nhóm hay từng ca và adjustment sau cut-off |
| C03 | Biên 15 phút là dung sai ghi nhận hay phút được trả lương? Văn bản đề xuất cắt về khung ca, nhưng tài liệu hiện có thể được hiểu là trả thêm biên | Golden cases cho ca 08:00–12:00, ghi 07:50–12:10 và 07:40–12:20, có/không duyệt tăng ca; định nghĩa ca không phân trước và phiên không có shift |
| C04 | Floor 15 phút theo phiên, ngày, kỳ hay đoạn rate? Qua tháng/đổi rate dễ mất phút hai lần | Golden cases 14/15/29/30 phút, ca 23:50–00:10 qua tháng và đổi rate giữa ca; xác định thứ tự split/round và tiền trung gian trước round tổng |
| C05 | Đề xuất gốc yêu cầu hoàn thành SHIFT_ROUTINE trước bàn giao; docs hiện chỉ yêu cầu hiển thị việc chưa xong. Gate acknowledge còn thiếu quy tắc ca đầu ngày/không có bàn giao trước | Xác định việc bắt buộc, ngoại lệ, receiver khi đổi ca, lúc ghi server time nếu check-in bị gate; tránh vòng chờ và mất công thực tế |
| C06 | Lượt tài liệu trước bổ sung nghỉ nguyên ca/rút pending, sole-owner-only correction, bypass bàn giao, retention vận hành 3 năm; đề xuất gốc chưa nêu đầy đủ các lựa chọn này | Đối chiếu với chủ dự án trước khi biến phần bổ sung thành hành vi bắt buộc; giữ trace nội dung gốc và DEC hiện hành |
| C07 | “Tối thiểu 3 năm” chưa phải lịch xóa ở năm thứ ba; mask còn giữ hậu tố điện thoại chưa chắc đã ẩn danh | Contract mốc bắt đầu retention, trường cần loại bỏ, restore và dữ liệu không định danh được giữ; không tự thêm job xóa công/lương ở mốc 3 năm |

Chỉ phần phụ thuộc câu hỏi mới chờ kết luận. Không yêu cầu duyệt lại stack, phạm vi một quán hoặc các ngưỡng đã được cung cấp rõ ràng.

## 3. Thứ tự và phụ thuộc

| Đợt | Gói | Phụ thuộc | Người chịu trách nhiệm theo chuyên môn | Đầu ra |
|---|---|---|---|---|
| 0 | P00 – baseline, ví dụ nghiệp vụ, fixture | Không | Full-stack + QA | Contract có ví dụ, kết quả baseline, danh sách migration |
| 1 | P01 – quyền và duyệt độc lập | P00/C01 | Backend, frontend, QA | Chặn quyền sai tại server và đồng bộ UI |
| 2 | P02 – lịch nháp/publish/adjustment | P01, C02 | Full-stack + dữ liệu | Vòng đời lịch và cutoff |
| 2 | P03 – request và swap nguyên tử | P02, C01 | Full-stack + dữ liệu | Swap có kết quả applied thật |
| 3 | P04 – công, overtime, auto-close | P02, C03 | Full-stack + vận hành | Giờ ghi nhận/duyệt tách biệt |
| 3 | P05 – rate history và payroll | P04, C04 | Full-stack + dữ liệu | Lương đúng đoạn rate, rounding và snapshot |
| 4 | P06 – checklist/bàn giao theo ca | P02, P04, C05 | Full-stack | Scope ca, acknowledge và check-in gate |
| 5 | P07 – hủy đơn/hao hụt | P01 | Full-stack | Reason enum và báo cáo đơn hủy sau pha |
| 5 | P08 – retention/anonymization | P00, C07; tích hợp lại sau P04–P07 | Backend + vận hành | Jobs hữu hạn, retry, kiểm tra sau restore |
| 6 | P09 – tích hợp và pilot evidence | P01–P08 | QA + vận hành + full-stack | ACC-01..13 có kết quả thật |

P07 và phần độc lập của P08 có thể làm khi luồng ca/công đang triển khai, nếu nguồn lực cho phép. Đây là mô tả chuyên môn phụ trách, không yêu cầu tạo chat/agent mới. Một người có thể thực hiện tuần tự. Schema/migrations phải có một người điều phối để tránh trùng số và xung đột trigger.

## 4. Gói triển khai cụ thể

### P00 — Baseline và contract có thể kiểm thử

- Đọc lại status/diff, API và schema ở thời điểm bắt đầu; ghi commit kèm dirty-tree. Tách lỗi có sẵn khỏi regression của gói mới.
- Chạy local doctor; chuẩn bị Auth/D1/R2 test cô lập theo [database operations](database-operations.md). Không reset môi trường để làm baseline xanh.
- Chốt C01–C07 thành ví dụ input/expected output, cập nhật đúng DEC tương ứng nếu cần; có bảng chuyển trạng thái, lỗi 403/409 và replay.
- Fixture: employee A/B, team lead, manager, hai owner và sole owner, system admin; invited/suspended/offboarded; store thứ hai chỉ để test isolation; ca qua đêm/tháng, rate đổi giữa kỳ, ảnh và order quá hạn.
- File: `tooling/local.mjs`, `tests/helpers/database.mjs`, `tests/e2e/auth.spec.ts`, `docs/api-contracts.md`, `docs/decision-register.md`.
- Đầu ra: baseline check/E2E có pass/fail/skip thật, bảng contract và kế hoạch upgrade dữ liệu. Tất cả phần còn lại bắt đầu ở PLANNED.

### P01 — Quyền, self-approval và sole-owner correction

- Tạo policy chung theo action + actor + target trong `modules/people/domain/`; sử dụng ở API và application, không dựa vào navigation.
- Thu hẹp team lead: không duyệt nghỉ/correction hoặc review công; quyền swap kiểm cả hai nhân viên. Manager không xử lý yêu cầu/công của manager hoặc owner.
- Chặn system admin trên mọi business read/write, kể cả endpoint chỉ gọi `requireApiUser()`; vẫn bảo toàn đường đăng nhập/đổi mật khẩu kỹ thuật cần thiết. Không tạo dashboard hạ tầng mới trong scope này.
- Workflow sole-owner correction riêng: đếm owner active cùng store tại thời điểm ghi, expected revision, before/after, lý do, cờ audit cao; chống race khi bổ sung owner thứ hai.
- File hiện có: `server/auth.ts`, `modules/people/domain/access.ts`, `modules/operations/application/decide-request.ts`, `modules/attendance/application/review-attendance.ts`, `modules/attendance/application/correct-attendance.ts`, `app/api/attendance/review/route.ts`, `components/app-shell.tsx`, `components/operational/requests-view.tsx`, `components/operational/attendance-view.tsx`.
- Nghiệm thu ACC-04/09: API gọi trực tiếp bị từ chối đúng; không ghi business/audit thành công khi bị từ chối; owner cuối cùng được bảo vệ; audit tự sửa công có thể đọc trong UI/đối soát. Test role matrix bằng database thực và Auth E2E.

### P02 — Draft, publish, cut-off và adjustment ca

- Tách action create draft, edit draft, publish, edit/cancel published và adjustment. Cập nhật hôm nay/dashboard/report để draft không bị tính là ca phải đi làm/vắng mặt.
- Dùng server time cho biên 12 giờ; test đúng 12 giờ và hai phía biên. UI nhận khả năng thao tác/lý do khóa từ API.
- Giữ revision/overlap/leave/locked-period guard hiện có; adjustment không được bypass kỳ lương khóa hoặc viết đè lịch sử ca có công. Lưu before/after, lý do và tham chiếu ca gốc.
- Thông báo chỉ sau publish hoặc thay đổi có hiệu lực, cùng transaction phù hợp; retry không gửi lặp.
- File: `modules/operations/application/manage-shifts.ts`, `app/api/shifts/route.ts`, `app/api/today/route.ts`, `app/api/dashboard/route.ts`, `components/operational/schedule-view.tsx`, `db/schema.ts`; migration mới đối chiếu trigger ở `drizzle/0011_workforce_integrity.sql` và `0013_workforce_guardrails.sql`.
- Nghiệm thu ACC-01/02: employee/team lead không đọc draft; draft không check-in/vắng mặt; publish concurrent không tạo overlap; adjustment bảo toàn công và snapshot. UI 320/390px có lỗi conflict rõ và giữ form.

### P03 — Request, withdraw và swap nguyên tử

- Thêm peer shift, revision hai ca, lifecycle và result link; giữ nguyên lịch sử request approved cũ, không suy diễn thành applied.
- Withdraw chỉ requester/pending; hai người duyệt hoặc withdraw/approve đồng thời chỉ một thao tác có hiệu lực.
- Swap thực hiện kiểm cả hai ca/người, quyền, trạng thái, cut-off, overlap, công, nghỉ và khóa lương trước khi áp dụng; recheck trong write guard.
- Thiết kế transaction phù hợp trigger: hai UPDATE đổi người tuần tự có thể gặp overlap tạm thời. Phải có thử nghiệm SQL trên SQLite/D1 để chứng minh chiến lược swap nguyên tử; không tắt overlap toàn cục hoặc commit trạng thái trung gian. Nếu một guard thất bại phải rollback cả hai ca và request, không chỉ kiểm meta.changes sau commit.
- “Duyệt & áp dụng” và “Áp dụng” từ approved_pending_apply dùng cùng workflow; lưu idempotency key/result, audit, notification và liên kết kết quả correction.
- File: `modules/operations/application/create-request.ts`, `decide-request.ts` cùng thư mục, file mới `apply-swap.ts`, `app/api/requests/route.ts`, `components/operational/requests-view.tsx`, `db/schema.ts`, migration mới.
- Nghiệm thu ACC-05: no partial apply khi ca thứ hai conflict hoặc audit lỗi; retry sau mất response trả kết quả cũ; UI chỉ báo applied khi dữ liệu đã đổi; request cũ thiếu thông tin yêu cầu bổ sung thay vì tự đổi lịch.

### P04 — Ngưỡng công, overtime và missing checkout

- Tách recorded time bất biến khỏi effective/approved/payable time; version policy để không áp hồi tố im lặng cho công cũ.
- Áp ngưỡng 5/15 phút theo C03; overtime là quyết định có phạm vi thời gian, actor/lý do và revision, không suy từ tổng công vượt tổng lịch tháng.
- Auto-close job dùng cutoff ends_at +4h và source/system marker. Không tạo event giả như nhân viên đã bấm checkout; giờ approved/payable bằng 0 đến khi correction được duyệt.
- Dùng cùng workflow cho scheduler và test với clock được truyền vào; job chạy lại/lỡ lịch vẫn xử lý đúng thời điểm cutoff. Race checkout thật với job chỉ có một kết quả hợp lệ, không làm mất evidence.
- Phiên không có shift cần kết quả rõ theo C03; không tự đoán ends_at. Không tự trừ break hoặc thêm hệ số overtime.
- File: `modules/attendance/domain/policy.ts`, `app/api/attendance/actions/route.ts`, `modules/attendance/application/correct-attendance.ts`, `review-attendance.ts`, file mới `auto-close-sessions.ts`, `components/attendance-capture.tsx`, `components/operational/attendance-view.tsx`, `db/schema.ts`; boundary scheduler mới sau xác minh entrypoint Worker thực.
- Nghiệm thu ACC-03/04: biên thời gian, clock thiết bị sai, thiếu quyền thiết bị, double-submit, R2/D1 lỗi, cron trễ/chạy lặp, ca qua đêm; missing checkout không vào payroll. Không đổi snapshot kỳ khóa.

### P05 — Đơn giá hiệu lực, rounding và snapshot lương

- Thêm `employee_rate_history` bằng employee ID ổn định, store scope, khoảng hiệu lực không overlap, rate integer VND và audit; không đổi toàn bộ email keys của dự án trong cùng gói.
- Quản trị tài khoản ghi lịch sử khi đổi rate; giao diện cho chọn ngày hiệu lực và hiển thị các đoạn rate. Không backfill giá hôm nay cho quá khứ thiếu chứng cứ.
- Dữ liệu cũ: giữ snapshot khóa; với kỳ chưa khóa thiếu rate, đưa danh sách cần OWNER đối soát và chặn finalize hàng liên quan.
- Hàm domain thuần xử lý clip ca + overtime → split kỳ/rate → rounding theo C04 → cộng/trừ điều chỉnh có lý do → round tổng 1.000 VND. Dùng số nguyên/rational trung gian có kiểm overflow; không round mỗi event gây sai tổng.
- Snapshot lưu version công thức/policy, nguồn rate, các đoạn công và phần chênh lệch làm tròn. Rate/correction/overtime thay đổi phải tăng revision nguồn để chặn race finalize.
- File: `modules/payroll/application/load-report.ts`, `locked-report.ts`, `change-period.ts`, `add-adjustment.ts`, `modules/payroll/contracts/report.ts`, domain mới trong `modules/payroll/domain/`, `app/api/admin/accounts/route.ts`, `components/admin-accounts-view.tsx`, `components/payroll-reports-view.tsx`, `db/schema.ts`.
- Nghiệm thu ACC-06: 14/15/29/30 phút, tổng tiền sát mốc 500 VND, qua tháng/rate boundary, gap/overlap rate, offboarded employee, finalize race, reopen và snapshot cũ. CSV/Excel khớp màn hình và không lộ lương cho STAFF.

### P06 — Checklist ca, receiver và acknowledge

- Daily execution giữ ngày VN; shift execution có identity riêng theo item/shift, không dùng khóa item/business_date hiện tại cho hai ca cùng ngày.
- Gắn người/ca thực hiện bằng ID thực, không dùng trường assignee text làm quyền; bổ sung scope và audit khi complete/reopen.
- Handover có ca nguồn/người hoặc ca nhận, trạng thái acknowledge và action idempotent; kiểm receiver thuộc scope, xử lý receiver đổi do swap.
- Thực thi checklist và check-in gate theo C05; bypass phải có actor/lý do/audit. UI giải thích thiếu bước nào, có đường xử lý khi ca đầu ngày/không có người nhận.
- File: `app/api/checklists/route.ts`, `app/api/handovers/route.ts`, `app/api/attendance/capture-sessions/route.ts`, `app/api/attendance/actions/route.ts`, `components/operational/checklists-view.tsx`, `handovers-view.tsx`, `today-view.tsx` cùng thư mục, `db/schema.ts`; application workflow mới trong modules/operations.
- Nghiệm thu ACC-07/03: hai ca cùng ngày không dùng chung completion; ca đêm không reset; người không nhận bị từ chối ack; ack retry không lặp; handover cũ không bị gán receiver giả hoặc chặn ca mới hàng loạt.

### P07 — Hủy đơn và báo cáo hao hụt

- Giữ state machine hiện có; thêm cancel reason code bắt buộc khi preparing/ready, note và expected status.
- Dùng order/status history làm nguồn báo cáo, tránh tạo kho/kế toán mới. Báo số đơn, món/số lượng và giá trị bán snapshot của món bị hủy; chưa có giá vốn thì không gọi đó là chi phí nguyên liệu thực tế.
- Reason code cũ chưa biết để legacy/unclassified, không đoán nguyên nhân từ free text. Không thêm quyền STAFF xử lý đơn nếu chưa được cấp.
- File: `modules/ordering/application/change-status.ts`, `app/api/owner/orders/[id]/status/route.ts`, `app/api/owner/orders/route.ts`, `components/operational/owner-orders-view.tsx`, report API mới nếu cần, `db/schema.ts`.
- Nghiệm thu ACC-08: chuẩn bị/sẵn sàng hủy với enum hợp lệ; customer/STAFF bị từ chối; completed không hủy; cancel/complete race; retry không đếm hao hụt hai lần; không thay tổng tiền đơn gốc.

### P08 — Retention và anonymization

- Mở rộng `expire-evidence.ts`, không viết lại logic retry R2 đang có. GPS nằm ở D1; ảnh ở R2; test xóa đúng từng nơi và giữ event công.
- Job order 180 ngày xử lý tên/điện thoại/customer note/item note và mọi bản sao PII liên quan đã inventory; giữ snapshot món/giá cần thống kê. Không gọi che một phần số điện thoại là ẩn danh hoàn toàn.
- Sau anonymization, track/export và replay đơn không tái tạo PII; xem tương tác submission hash/receipt trước quyết định giữ/xóa metadata bảo mật.
- Bảo vệ lịch sử tối thiểu 3 năm; không tự xóa toàn bộ khi vừa đủ 3 năm. Có batch bounds, cursor/backlog, retry, audit số lượng không chứa PII.
- File: `modules/attendance/application/expire-evidence.ts`, `app/api/cron/retention/route.ts`, `modules/ordering/application/track-order.ts`, `create-order.ts`, file mới `anonymize-orders.ts`, `db/schema.ts`, `docs/operational-runbook.md`.
- Nghiệm thu ACC-10/11: ngay trước/tại/sau cutoff; R2 thành công D1 lỗi rồi retry; chạy chồng; restore dữ liệu quá hạn phải xử lý trước khi mở đọc. Scheduler được chứng minh đã chạy tại môi trường thử, không suy từ endpoint tồn tại.

### P09 — Tích hợp, kiểm thử vai trò và pilot

- E2E có real Auth và fixture cô lập cho tất cả role. Critical role tests không được skip mà vẫn báo gate PASS.
- Hành trình: OWNER tạo tài khoản/rate → draft/publish → STAFF xem ca/ack/check-in/checklist/check-out → request/correction → MANAGER duyệt → payroll finalize → OWNER reopen → snapshot và audit đối soát.
- Kịch bản riêng: team lead swap nhưng không sửa công; manager self-request bị chặn; system admin không truy cập nghiệp vụ; CUSTOMER đặt/theo dõi và OWNER/MANAGER hủy ready.
- Responsive 320/390/768/1440, keyboard, lỗi mạng/401/403/409, mất response, camera/GPS denied, retry; chụp screenshot/trace tại bước quan trọng.
- Chạy fresh/upgrade migrations và một restore drill staging D1 + metadata/object R2; kiểm policy sau restore. Chỉ thao tác staging khi môi trường/quyền được xác nhận.
- File: `tests/e2e/` (thêm workforce/payroll/operations flows), suites trong `tests/`, `.github/workflows/check.yml`, `playwright.config.ts`, acceptance/runbook.
- Đầu ra: evidence theo commit/dirty diff/môi trường, đủ ACC-01..13; danh sách fail/blocked/waiver; release record có người trực, tải, RPO/RTO, rollback. Không tự deploy từ việc hoàn tất plan.

## 5. Migration và dữ liệu hiện hữu

Hiện thấy chuỗi đến 0014. Đặt số migration tiếp theo sau khi kiểm lại HEAD; không giữ cứng số trong kế hoạch.

| Nhóm migration | Nội dung | Chuyển đổi dữ liệu cũ |
|---|---|---|
| Lịch/request | Lifecycle, audit adjustment, peer shift, revision/apply result | Giữ ca published; request approved cũ không tự thành applied |
| Công | Auto-close marker, overtime approvals, correction/audit metadata | Không tạo checkout người dùng giả, không sửa recorded event |
| Rate/payroll | Rate history, formula version, snapshot bổ sung | Giữ snapshot khóa, đánh dấu thiếu rate cho kỳ mở |
| Checklist/handover | Routine/scope, execution key, receiver/ack | Checklist cũ là daily; nhật ký cũ giữ legacy, không tạo receiver giả |
| Order/retention | Cancel enum, anonymization markers/indexes | Cancel cũ unclassified; không chạy ẩn danh trên dữ liệu thật khi migrate |

- Thực hiện expand schema → backfill có kiểm chứng → chuyển reader/writer/UI → siết constraint; chia migration theo gói và commit schema/metadata/test cùng nhau.
- Kiểm PRAGMA FK/index/trigger và dữ liệu trước/sau trên SQLite thật rồi D1 emulator với runner local thực. Không sửa/xóa 0011/0013 để thay policy.
- Bảo toàn workforce_revision, owner cuối cùng, khóa kỳ, một phiên mở và overlap. Batch có UPDATE 0 dòng không tự rollback: kiểm mọi side effect bằng guard và cơ chế fail nguyên tử đã thử nghiệm.
- Rollback ưu tiên code tương thích schema mở rộng hoặc forward fix. Không restore đè DB đang có giao dịch mới. Bản code cũ không được chạy sau migration state mới nếu không đọc được enum hoặc vô tình mở lại quyền đã thu hồi.

## 6. Kiểm chứng và tracking

Các lệnh dự kiến sử dụng theo scripts thực có: `npm run local:doctor`, `npm run check`, `npm run test:e2e`, `npm run db:preflight -- <absolute-test-database-path>`. Provision/migrate chỉ trên test target đã xác minh theo runbook. Chạy targeted Node suite trong lúc sửa; trước bàn giao gói chạy check và E2E liên quan.

Tận dụng suites `tests/workforce-integrity.test.mjs`, `tests/business-logic-verification.test.mjs`, `tests/identity-security.test.mjs`, `tests/ordering-system.test.mjs`, `tests/daily-checklists.test.mjs`, `tests/incidents-handovers.test.mjs`, `tests/drizzle-migrations-preflight.test.mjs`; bổ sung kịch bản hành vi thật, không chỉ regex đọc source hoặc chép lại thuật toán.

Mỗi task đi qua `PLANNED → IN_PROGRESS → IMPLEMENTED_UNVERIFIED → VERIFIED`, hoặc `BLOCKED` kèm lý do/đầu vào cần. Tất cả P00–P09 hiện là PLANNED. “VERIFIED” chỉ cho phạm vi thực chạy, không tự nâng thành production-ready.

Checklist bàn giao mỗi gói: ID/DEC/ACC; file đổi; migration/backfill; hành vi trước/sau; test pass/fail/skip; link evidence; rủi ro còn lại; tương thích rollback. Cập nhật implementation-status và acceptance sau khi có evidence. Bản tổng hợp/export chỉ đồng bộ khi nội dung nguồn thay đổi, không tạo thêm một sổ task cạnh tranh.

## 7. Bước bắt đầu

Bắt đầu P00 để cố định baseline và các ví dụ C01–C07; tiếp đó P01 khóa quyền tại server và UI. Đây là phạm vi đầu tiên có thể review độc lập trước khi mở rộng schema lịch/công/lương. Kế hoạch được tạo bằng đọc source chọn lọc; chưa chạy app/tests/migration hoặc thao tác cloud trong lượt lập kế hoạch.
