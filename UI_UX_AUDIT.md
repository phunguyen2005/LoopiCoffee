# Audit UI/UX mobile-first — LoopyCafe

> Báo cáo lịch sử tại baseline bên dưới, không phải đặc tả giao diện hiện hành. Dùng [hệ thống thiết kế](docs/design.md) và [hướng dẫn màn hình](docs/ui-ux-guidelines.md) khi thiết kế hoặc chỉnh sửa UI.

**Ngày:** 2026-10-14 (Asia/Ho_Chi_Minh)  
**Baseline:** `888495ba3fddf4798b80f9a1cbe4aec65c0991b8` + working tree đang dirty; xem `git status --short` tại thời điểm audit.  
**Phạm vi:** audit-only, không sửa app/config/data, không đăng nhập, không gửi mutation, không deploy. File này là báo cáo được yêu cầu; các tài liệu và thay đổi sẵn có được giữ nguyên.

## Tóm tắt và giới hạn bằng chứng

Đã đọc chỉ mục tài liệu, business rules, security, permissions, decision register, implementation status, design/UI guidelines, audit rules; rà source các route và màn hình công khai, auth, nhân viên, vận hành/quản lý, đơn hàng, báo cáo và admin. Trace luồng nhân viên từ `/app/schedule` → `/app/handovers` → `/app/attendance` → `/app/checklists` → `/app/issues` → check-out qua UI, API và dữ liệu trả về. `ACCEPTED` là **quy tắc đích**, không có nghĩa UI/API hiện đã triển khai. Các đề xuất dưới đây chỉ nhằm đáp ứng `DEC-001..009` và rule đã chốt; không đề xuất thay đổi nghiệp vụ.

Đã quan sát trình duyệt Chromium headless trên **local server đã mở ở `127.0.0.1:4173`** cho `/auth/login` và `/order` tại 320×844, 390×844, 768×844, 1440×844 CSS px. Ở 12 lượt truy cập (gồm `/` chuyển về login), `document.documentElement.scrollWidth === innerWidth`. Trang đặt món có nút header “Tra cứu đơn” và “Xem giỏ hàng” 40×40 px ở 320/390; tại 768/1440, nút tra cứu cao 42 px và giỏ cao 40 px. Đây là **đo runtime của server đang mở**, chưa xác nhận build ấy khớp toàn bộ working tree dirty. Không chạy E2E authenticated, không chụp màn hình có dữ liệu người dùng, không kiểm tra bàn phím ảo/thiết bị thật, zoom 200%, contrast computed, camera/GPS thật. Nội bộ tại bốn viewport là **source/CSS review, runtime NOT_ASSESSED**. Local Auth ở `54321` chưa được xác nhận sẵn sàng; không đọc fixture credential hay khởi tạo dịch vụ vì audit-only.

Độ tin cậy: **CONFIRMED** = source hoặc đo runtime đủ cho mệnh đề được nêu; **PROBABLE** = suy luận hợp lý cần browser; **NEEDS_VERIFICATION** = chưa đủ điều kiện. Severity đo tác động, priority đo thứ tự xử lý. Tất cả finding có status **OPEN** tại baseline; không suy ra release gate đã pass/fail từ source.

**Kết quả:** 10 findings (5 HIGH, 5 MEDIUM); 6 mục P1, 4 mục P2. Trọng tâm là khoảng cách UI của luồng nhân viên so với `DEC-005`, nhãn chấm công, quyền điều hướng và trợ năng của trang đặt món.

## Inventory và ma trận rà soát

| Khu vực | Route/source chính | Navigation / async / form | Responsive 320/390/768/1440 |
|---|---|---|---|
| Auth, public | `app/auth/*`, `app/page.tsx`, `app/order/page.tsx`, `components/order/*` | Login và menu có trạng thái tải/lỗi; menu, giỏ, tra cứu đơn có form | Đã đo login/order: không tràn ngang; touch target header thiếu chuẩn nội bộ; modal và bàn phím chưa thử |
| Nhân viên: ca, hôm nay | `components/operational/schedule-view.tsx`, `today-view.tsx`, `app/api/today/route.ts` | Danh sách là mặc định; có loading/error/retry, empty. Bước bàn giao nhận chưa có | CSS có nav đáy, padding, media 350/720/980; chưa đo DOM authenticated |
| Nhân viên: công, checklist, bàn giao, sự cố | `attendance-capture.tsx`, `checklists-view.tsx`, `handovers-view.tsx`, `issues-view.tsx` và API cùng tên | Camera/GPS có exception form; checklist/incident/handover có loading/empty/error nhưng thiếu ngữ cảnh ca và xác nhận nhận bàn giao | Có CTA cố định và vùng đệm; chưa kiểm occlusion với bàn phím/điện thoại thật |
| Quản lý/chủ quán | `components/operational/{dashboard,team,attendance,requests,reports,settings,owner-orders}-view.tsx`, `components/payroll-reports-view.tsx`, `components/admin-accounts-view.tsx` | Nhiều màn hình đã có skeleton/error/empty và retry; quyền menu còn lệch policy; bảng lương có vùng cuộn riêng | Source CSS có breakpoint/bảng cuộn; chưa đo bốn viewport sau đăng nhập |
| System | `components/system-views.tsx`, `app/error.tsx`, `app/not-found.tsx` | Notification/audit có trạng thái riêng | Chưa đo runtime authenticated |

**Bằng chứng tích cực cần giữ:** `components/operational/shared.tsx:52-88` có `AsyncStatePanel` với `role="alert"`/`status` và retry; `schedule-view.tsx:48-112` hủy request cũ khi đổi tuần; `app-shell.tsx:161-209` có Escape/focus trap/restore cho drawer; `attendance-capture.tsx:154-234,464-540` xin quyền sau thao tác và có đường giải trình; `order-tracking-view.tsx:70-71` giữ dữ liệu cũ với cảnh báo khi refresh lỗi. Đây là bằng chứng source, không phải nghiệm thu thiết bị.

## Luồng nhân viên đối chiếu rule đã chốt

| Bước nghiệp vụ | UI/API hiện quan sát | Kết luận |
|---|---|---|
| Xem ca | `/app/schedule` mặc định danh sách, có loading/error/empty; `/api/today` chọn ca theo giờ gần nhất | Có điểm vào, nhưng ca qua ngày chỉ hiện giờ ở nhiều vị trí; xem UX-006 |
| **Nhận** bàn giao | `/app/handovers` chỉ tạo/list journal theo cửa hàng; không có người/ca nhận và nút acknowledge | `DEC-005`/OPS-003 **IMPLEMENTATION_REQUIRED**; UX-001 |
| Chấm vào | Today ưu tiên CTA check-in trước bàn giao; attendance API không gate acknowledgement | Khoảng cách triển khai đã chốt; UX-001. Camera/GPS exception có UI, nhưng lost response cần rõ hơn; UX-005 |
| Checklist | `/api/checklists` dùng business date và item toàn cửa hàng, UI ghi “checklist ca” | Thiếu daily/shift distinction của `DEC-005`; UX-003 |
| Báo sự cố | Form và trạng thái open → acknowledged → resolved → closed có UI; POST chưa có retry key | Có đường báo sự cố, nhưng mất response có thể gửi trùng; UX-007 |
| Kết thúc ca | Today coi có `closed_at` là hoàn tất; không phân biệt `MISSING_CHECKOUT`/approved minutes | Nhãn có thể khẳng định sai; UX-002 |

## Findings

### UX-001 — Thiếu bước nhận bàn giao trước check-in

**Domain:** employee flow/navigation · **Severity:** HIGH · **Priority:** P1 · **Confidence:** CONFIRMED (source gap) · **Status:** OPEN · **Rule:** DEC-005, OPS-003.  
**File/bằng chứng:** `components/operational/today-view.tsx:70-86,182-228` đặt check-in ở bước 1 và bàn giao ở bước 3, xác định `hasHandover` từ bản do chính người dùng tạo. `components/operational/handovers-view.tsx:8-84` chỉ có form gửi và danh sách. `app/api/handovers/route.ts:7-47` chỉ GET/POST, chưa có receiver/next-shift/ack API; `app/api/attendance/actions/route.ts:162-188,269-401` không kiểm acknowledgement.  
**Tái hiện bằng source:** Theo CTA từ Today khi chưa chấm vào; đường đầu tiên là `/app/attendance`, không có bước nhận bàn giao.  
**Kỳ vọng / thực tế / tác động:** Người/ca nhận phải xác nhận trước khi hoàn tất check-in, bypass khẩn cấp bởi MANAGER/OWNER có lý do và audit. Hiện nhân viên có thể bỏ qua ngữ cảnh bàn giao, không biết việc tồn và lưu ý ca trước.  
**Đề xuất tối thiểu:** Triển khai receiver/shift và ack theo DEC-005 ở data/API trước; Today hiển thị “Bàn giao cần nhận” và CTA ack trước check-in, có hướng dẫn khi bị gate/bypass. **Dependency:** migration/workflow DEC-005, quyền server. **Effort:** L–XL. **Regression acceptance:** employee A gửi, employee B nhận rồi check-in; chưa nhận bị chặn có hướng dẫn; manager bypass có lý do/audit; ca đêm. **Giới hạn:** chưa tái hiện authenticated browser.

### UX-002 — Trạng thái “hoàn tất” và giờ tháng có thể khẳng định quá mức

**Domain:** employee status/content · **Severity:** HIGH · **Priority:** P1 · **Confidence:** CONFIRMED (mapping source), tác động dữ liệu thực NEEDS_VERIFICATION · **Status:** OPEN · **Rule:** ATT-009, PAY-001/002, DEC-004.  
**File/bằng chứng:** `components/operational/today-view.tsx:68-75,100-132,141-170,218-226` dùng `closed_at` để hiện “Đã hoàn tất ca”, `monthStats.sessionCount` thành “Số ca hoàn tất”, `workedMinutes` thành “Tổng giờ tích lũy”, dù type có `attendance.status` nhưng không dùng. `app/api/today/route.ts:22-62,78-88` đếm mọi session tháng và cộng `worked_minutes`, không lọc trạng thái duyệt/ca đóng.  
**Tái hiện bằng source:** Cho `/api/today` trả session mở hoặc `MISSING_CHECKOUT`; UI vẫn dùng tổng session làm số ca hoàn tất, có `closed_at` thì báo hoàn tất.  
**Kỳ vọng / thực tế / tác động:** Tách giờ ghi nhận, giờ được duyệt và giờ trả lương; ca quên checkout không được gọi hoàn tất bình thường. Hiện copy dễ khiến nhân viên hiểu công đã duyệt/tính lương.  
**Đề xuất tối thiểu:** Dùng status/approved minutes từ server, nhãn “đã ghi nhận”, “chờ duyệt”, “quên chấm ra — chưa tính công” đúng trường hợp; chỉ gọi hoàn tất khi đủ điều kiện. **Dependency:** contract auto-close/approved minutes DEC-004. **Effort:** M. **Regression acceptance:** phiên mở, checkout thường, exception pending, missing checkout, correction approved và ca qua tháng hiển thị khác nhau. **Giới hạn:** chưa có fixture runtime cho trạng thái auto-close.

### UX-003 — Checklist “ca” thực tế là danh sách theo ngày của cả cửa hàng

**Domain:** employee checklist · **Severity:** HIGH · **Priority:** P1 · **Confidence:** CONFIRMED (source gap) · **Status:** OPEN · **Rule:** DEC-005, OPS-001/005.  
**File/bằng chứng:** `app/api/checklists/route.ts:8-16,76-118` join execution bằng `business_date`, không có routine type/shift id; `app/api/today/route.ts:44-48` cộng toàn bộ item cửa hàng; `components/operational/checklists-view.tsx:113-170` ghi “Checklist mở ca & vận hành”, item theo nhãn assignee tự do; `today-view.tsx:71-74,166-170` coi `total=0` là complete và hiện `100%`.  
**Tái hiện bằng source:** Xem Today khi không có item hoặc khi ca đêm qua 00:00; tiến độ dựa business date chứ không theo shift.  
**Kỳ vọng / thực tế / tác động:** Phân biệt việc trong ngày/việc của ca; ca đêm giữ một checklist, việc ca chưa xong hiển thị trước bàn giao. Hiện “100%” khi chưa có việc dễ hiểu sai, và tiến độ có thể đổi lúc qua ngày.  
**Đề xuất tối thiểu:** Sau khi triển khai daily/shift routine theo DEC-005, tách nhóm và tiến độ; empty là “chưa có checklist”, không là 100%. **Dependency:** schema/API DEC-005. **Effort:** L. **Regression acceptance:** 2 ca cùng ngày không dùng chung shift routine; ca 23:00–01:00 không reset lúc 00:00; empty không báo đạt 100%.

### UX-004 — Navigation hiển thị quyền nghiệp vụ trái ma trận đã chốt

**Domain:** role/navigation · **Severity:** HIGH · **Priority:** P1 · **Confidence:** CONFIRMED (UI source) · **Status:** OPEN · **Rule:** DEC-001, ROLE-004, permissions.  
**File/bằng chứng:** `components/app-shell.tsx:64-83,115,220-240` cho `system_admin` vào dashboard, nhân sự, duyệt công, lịch, đơn, báo cáo, checklist…; `team_lead` thấy “Duyệt chấm công”, lịch quản lý và yêu cầu. `app/app/schedule/page.tsx:6`, `app/app/requests/page.tsx:6` đặt canManage/canApprove cho mọi role không phải employee. `app/app/attendance/review/page.tsx:7` chỉ chặn employee.  
**Tái hiện bằng source:** Render AppShell với hai role trên và đọc menu/CTA; có hành động nghiệp vụ không được policy đích cấp.  
**Kỳ vọng / thực tế / tác động:** `system_admin` không có quyền business; team lead chỉ scope Trưởng ca. Menu hiện tại hứa khả năng sai, gây lỗi/nhầm vai trò; source còn có route/action cần hardening, nhưng finding này chỉ đánh giá UI.  
**Đề xuất tối thiểu:** Dùng capability/scope từ server để dựng menu/CTA, tách team lead operational actions, ẩn business menu với system admin; đồng bộ server guards trong gói DEC-001. **Dependency:** auth/RBAC implementation. **Effort:** M–L. **Regression acceptance:** ma trận 5 role, direct URL và API denial, self-approval, trạng thái inactive. **Giới hạn:** không khẳng định exploit chỉ từ menu.

### UX-005 — Mất phản hồi chấm công chưa có trạng thái “đang đối chiếu kết quả”

**Domain:** attendance error/retry · **Severity:** MEDIUM · **Priority:** P1 · **Confidence:** CONFIRMED (UI branch), duplicate outcome NEEDS_VERIFICATION · **Status:** OPEN · **Rule:** ATT-003, design attendance contract.  
**File/bằng chứng:** `components/attendance-capture.tsx:198-239` giữ idempotency key khi `confirmSubmit` lỗi và có “Gửi lại lần chấm này” tại `:527-540`, nhưng cùng lúc có “Thử lại” gọi `reset()` (`:284-299`) tạo key mới ở lần bắt đầu sau (`:135-149`). Không có bước GET đối chiếu event trước khi mở thao tác mới. API `app/api/attendance/actions/route.ts:64-89,401-410` có replay key nên đường gửi lại cùng key tốt hơn.  
**Tái hiện bằng source:** POST đã commit nhưng response mất; UI sang error và hiện cả resend lẫn reset.  
**Kỳ vọng / thực tế / tác động:** Cho biết “đang kiểm tra kết quả”, giữ key, truy vấn trạng thái; không mời tạo lần chấm mới khi kết quả chưa rõ. Chọn reset có thể khiến nhân viên thử thao tác mới và nhận conflict/không biết giờ nào được lưu.  
**Đề xuất tối thiểu:** Trong lỗi mạng không rõ kết quả, đối chiếu bằng idempotency key/session; ưu tiên retry cùng key, chỉ reset sau kết quả xác định hoặc hết hiệu lực có hướng dẫn. **Dependency:** API lookup/replay contract. **Effort:** M. **Regression acceptance:** cắt response sau commit, retry cùng key chỉ một event; lỗi trước commit; session hết hạn; camera/GPS bị từ chối.

### UX-006 — Ca qua ngày thiếu ngày kết thúc tại điểm quyết định

**Domain:** schedule/readability · **Severity:** MEDIUM · **Priority:** P2 · **Confidence:** CONFIRMED (render source) · **Status:** OPEN · **Rule:** SCH-001, design language.  
**File/bằng chứng:** `components/operational/schedule-view.tsx:572-628` (list card) hiển thị một ngày từ `starts_at` và chỉ `formatTime(starts_at) — formatTime(ends_at)`; `components/operational/today-view.tsx:107,222` và `components/app-shell.tsx:424-427,510-520` cũng chỉ hiển thị hai giờ.  
**Tái hiện bằng source:** Ca 23:00–01:00 được render “23:00 — 01:00” cạnh một ngày, không nói 01:00 thuộc ngày kế.  
**Kỳ vọng / thực tế / tác động:** Ngày đầu/cuối rõ khi ca qua ngày để nhân viên không nhầm thời điểm chấm ra, checklist và bàn giao.  
**Đề xuất tối thiểu:** Dùng format ngày giờ VN có “ngày hôm sau” hoặc ngày kết thúc đầy đủ ở card/detail/drawer. **Dependency:** none. **Effort:** S. **Regression acceptance:** ca thường/qua ngày/qua tháng ở 320 và 390 px, zoom 200% không cắt ý.

### UX-007 — Báo sự cố mất phản hồi có thể mời gửi trùng

**Domain:** incident form/retry · **Severity:** MEDIUM · **Priority:** P2 · **Confidence:** PROBABLE (outcome cần test mất response) · **Status:** OPEN · **Rule:** OPS-004, UI guideline double-submit/lost response.  
**File/bằng chứng:** `components/operational/issues-view.tsx:47-73` POST title/category/severity, lỗi giữ form và báo “kiểm tra danh sách trước khi gửi lại” nhưng không có lookup/khóa gửi lại; `app/api/incidents/route.ts:18-66` tạo ID mới mỗi POST, không nhận idempotency key.  
**Tái hiện đề nghị:** Chặn response sau server commit rồi bấm gửi lại; dự kiến hai bản open nếu cả hai POST được nhận.  
**Kỳ vọng / thực tế / tác động:** Nhân viên được xác nhận kết quả, tránh hai sự cố giống nhau và hai luồng xử lý.  
**Đề xuất tối thiểu:** Gắn client request key + server replay; UI hiện “đang kiểm tra kết quả” và tìm lại trước khi retry. **Dependency:** API incident. **Effort:** M. **Regression acceptance:** lost response, double tap, retry sau reload trả một incident; form giữ nội dung khi lỗi thật.

### UX-008 — Thẻ món và sheet đặt món thiếu đường keyboard/dialog nhất quán

**Domain:** accessibility/customer · **Severity:** HIGH · **Priority:** P1 · **Confidence:** CONFIRMED (source semantics) · **Status:** OPEN · **Rule:** design accessibility target.  
**File/bằng chứng:** `components/order/menu-card.tsx:41-48` mở chi tiết bằng `onClick` trên `div` không có `tabIndex`, role hay keyboard handler (nút thêm riêng tại `:74-88` có thể focus). `components/order/item-detail-modal.tsx:109-122` và `components/order/cart-drawer.tsx:119-138` dựng overlay/panel bằng `div` không có `role="dialog"`, `aria-modal`, focus entry/trap/restore hoặc Escape handler; đối chiếu `components/confirm-dialog.tsx:30-69` đã có pattern đúng.  
**Tái hiện bằng source:** Tab qua menu card không focus được vùng thẻ; mở item sheet/giỏ không có dialog semantics.  
**Kỳ vọng / thực tế / tác động:** Tất cả đường mở món và sheet thao tác được bằng bàn phím, screen reader nhận tên dialog, focus không chạy ra nền.  
**Đề xuất tối thiểu:** Làm card thành button/link semantics hoặc bỏ click trên `div` và giữ một CTA có tên rõ; áp dụng pattern dialog hiện có cho item/cart/receipt lookup. **Dependency:** none. **Effort:** M. **Regression acceptance:** Tab/Enter/Space, Escape, focus trap/restore, screen reader name ở 320/390/768/1440.

### UX-009 — Touch target header menu dưới chuẩn 44 px của dự án

**Domain:** responsive/accessibility/customer · **Severity:** MEDIUM · **Priority:** P2 · **Confidence:** CONFIRMED (runtime local) · **Status:** OPEN · **Rule:** `docs/design.md` chuẩn nội bộ 44×44 px.  
**File/bằng chứng:** Đo Chromium local `/order`: ở 320/390, “Tra cứu đơn” và “Xem giỏ hàng” đều 40×40 CSS px; ở 768/1440 nút giỏ 44×40 và tra cứu 130×42. Source: `components/order/customer-order-page.tsx:284-301`; giỏ có nút đóng `components/order/cart-drawer.tsx:144-149` 32×32 theo class.  
**Tái hiện:** Mở `/order` và đo `getBoundingClientRect()` của button đang hiển thị ở bốn viewport.  
**Kỳ vọng / thực tế / tác động:** Hành động chính đạt 44×44 CSS px theo chuẩn nội bộ, hit areas không chồng. Các nút header đang nhỏ hơn, khó chạm chính xác trên điện thoại. Không gọi đây là vi phạm WCAG 2.2 AA tự động vì 44 px là chuẩn dự án.  
**Đề xuất tối thiểu:** Tăng hit box thực lên ít nhất 44×44, giữ khoảng cách an toàn; kiểm tra thêm close/quantity controls trong giỏ. **Dependency:** none. **Effort:** S. **Regression acceptance:** đo box/hit test ở 320/390/768/1440 và zoom 200%.

### UX-010 — Lỗi validation ở giỏ chỉ báo chung, chưa đưa focus đến trường sai

**Domain:** customer form · **Severity:** MEDIUM · **Priority:** P2 · **Confidence:** CONFIRMED (source branch) · **Status:** OPEN · **Rule:** design input/form contract.  
**File/bằng chứng:** `components/order/cart-drawer.tsx:52-78` validate name/phone rồi `setErrorMessage`; `:261-320` hiện lỗi ở một banner trước các field, không gắn `aria-invalid`/`aria-describedby`, không focus field cần sửa. Server conflict giá/món trả lỗi chung ở `:93-110`; nội dung giỏ giữ được.  
**Tái hiện bằng source:** Nhập tên một ký tự hoặc số sai rồi gửi; lỗi xuất hiện chung, input không được nhận focus/error liên kết.  
**Kỳ vọng / thực tế / tác động:** Lỗi inline tại field, focus field đầu tiên lỗi, screen reader đọc thông điệp khi quay lại field; conflict giá/món cần chỉ item bị ảnh hưởng và bước xác nhận lại theo ORD-006.  
**Đề xuất tối thiểu:** Field error ids + `aria-invalid`/`aria-describedby`, focus vào field lỗi; giữ dữ liệu và nêu item cần xác nhận khi API trả conflict. **Dependency:** API conflict detail cho phần giá/món. **Effort:** S–M. **Regression acceptance:** tên/số điện thoại sai, menu đổi lúc gửi, keyboard/reader và drawer dưới bàn phím ảo.

## Responsive và kiểm chứng tiếp theo

| Viewport | Đã đo trực tiếp | Nguồn chưa đủ để kết luận |
|---|---|---|
| 320×844 | `/auth/login`, `/order`: không tràn ngang; header order 40 px | Staff Today/attendance/nav, modal khi bàn phím mở, text zoom, ca đêm |
| 390×844 | Như 320 | Staff flow, CTA + nav occlusion, camera/GPS |
| 768×844 | `/auth/login`, `/order`: không tràn ngang; order header height 40/42 px | Tablet layout nội bộ, bảng lịch/lương |
| 1440×844 | `/auth/login`, `/order`: không tràn ngang; main order 1152 px | Desktop authenticated, dialog focus và contrast |

`app/globals.css:2797-2805,3910-3956` có padding cho bottom nav/CTA; `:3974-3991` dùng font nav 8.5px tại ≤350 px. Cần đo **đọc được/zoom**, không tự coi breakpoint CSS là PASS. `tests/e2e/mobile-layout-occlusion.spec.ts:9-14` chỉ khai báo 320/375/390/430; phần staff test ở `:256,346,379` chạy 375 và có nhánh fallback CSS khi fixture vắng, nên không chứng minh 320/390/768/1440 staff flow. Không chạy suite này trong audit; các assertion nguồn chỉ là inventory test.

**Ưu tiên thực hiện theo policy đã ACCEPTED:** (1) DEC-005 receiver/ack gate + checklist daily/shift, (2) sửa nhãn công/ca và role navigation theo DEC-004/001, (3) đảm bảo lost-response chấm công/sự cố, (4) keyboard/dialog và touch targets, (5) ngày ca đêm và validation. Trước nghiệm thu, chạy E2E authenticated trên fixture cô lập cho employee/team lead/manager/owner/system_admin ở 320/390/768/1440, gồm loading/empty/error, mạng mất sau commit, camera/GPS denied, keyboard, zoom 200%, safe area và ca 23:00–01:00. Đo kết quả thực tế và lưu artifact cùng commit/môi trường; audit hiện tại **chưa xác minh** các tiêu chí đó.
