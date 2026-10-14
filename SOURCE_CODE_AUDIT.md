# LoopiCafe — Source Code Quality & Architecture Audit

Ngày: **2026-10-14**, múi giờ Asia/Saigon. Run ID: `2026-10-14-888495b-source`.

## Executive Summary

Codebase có nền tảng modular monolith hợp lý: domain tách khỏi framework, application workflows dùng D1 trực tiếp, truy vấn parameterized, nhiều mutation dùng batch/guard, có snapshot đơn/lương và kiểm thử rollback. **Chưa đủ bằng chứng nghiệm thu pilot.** Test xanh hiện tại vẫn cùng tồn tại với lỗi ở xử lý partial failure, contract giỏ hàng và quyền phê duyệt.

Audit ghi nhận **8 findings: 3 P1/High, 5 P2/Medium; không có P0 được xác lập**. Đây là số findings trong phạm vi khảo sát, không phải thống kê mọi lỗi của repository. CODE-007 xác nhận thiếu xử lý header tại adapter nhưng chưa chứng minh cache làm lộ session. Các lỗi còn lại được phân biệt rõ giữa tái hiện application, callback cô lập và quan sát source.

Năm rủi ro kỹ thuật ưu tiên:

1. **CODE-002:** khi kết quả D1 không rõ ràng, compensation có thể xóa ảnh đã được DB tham chiếu; khi cleanup R2 lỗi, có thể để ảnh mồ côi không được retention biết đến.
2. **CODE-001:** manager vẫn có thể tự duyệt request của mình; đã thuộc P01, cần dùng evidence này cho regression của P01.
3. **CODE-003:** khách thấy giá cũ trong giỏ nhưng đơn được lưu với giá mới mà chưa xác nhận chênh lệch.
4. **CODE-006:** bật/tắt món liên tiếp có thể khiến UI và server khác trạng thái dù cả hai request thành công.
5. **CODE-004:** gửi lại bàn giao sau mất phản hồi tạo thêm bản ghi, chưa có identity cho một lần gửi.

Rủi ro kiến trúc tập trung ở các boundary cụ thể, không phải lựa chọn stack: route chấm công ôm cả orchestration D1–R2; `OwnerOrdersView` gom nhiều workflow với cách xử lý lỗi khác nhau; một số test async mô phỏng lại logic thay vì chạy component thật. Không đề xuất microservices, repository layer đại trà hoặc thay ORM/framework.

### Baseline và quyền ghi

- HEAD đầu/cuối audit: `888495ba3fddf4798b80f9a1cbe4aec65c0991b8`.
- Working tree **dirty trước khi bắt đầu**: 32 tracked files modified; nhiều file/thư mục untracked. SHA HEAD không đại diện đầy đủ nội dung được đọc.
- Các tracked file ngoài tài liệu đang đổi: `app/globals.css`, `components/loopy-sticker.tsx`, `components/operational/dashboard-view.tsx`, `eslint.config.mjs`, `package.json`, `package-lock.json`, `tests/helpers/database.mjs`. Phần còn lại là AGENTS/PROJECT/README và tài liệu.
- Untracked liên quan audit: `docs/README.md`, `docs/decision-register.md`, `docs/permissions.md`, `docs/implementation-plan.md`, `docs/implementation-status.md`, `docs/audit/prompts/`, `tests/fixtures/`, `tests/workforce-golden-cases.test.mjs`. Ngoài ra có `.agents/`, các bản xuất tài liệu, `UI_UX_AUDIT.md`, `ORIGINAL_REQUEST.md`, `characters/` và ảnh mascot. Không sửa hoặc dọn các mục này.
- Người dùng cho biết agent khác đang triển khai P00–P09. Tài liệu plan vẫn ghi PLANNED; fixture/golden tests mới có trong dirty tree. Không suy diễn trạng thái hoàn thành từ tài liệu hay tên test.
- Audit chỉ tạo **file này**, theo vị trí người dùng yêu cầu; không ghi đè báo cáo lịch sử hoặc prompt. Không sửa app/config/schema/migration/test; không deploy, push, provision, reset DB, gửi thông báo hay gọi cloud nghiệp vụ.
- Số dòng trong findings thuộc nội dung làm việc tại thời điểm audit. Fingerprint các file chính ở cuối báo cáo giúp agent triển khai nhận biết baseline đã thay đổi.

### Phạm vi và giới hạn

Đã đọc các căn cứ: [docs index](docs/README.md), [business rules](docs/business-rules.md), [decision register](docs/decision-register.md), [permissions](docs/permissions.md), [implementation status](docs/implementation-status.md), [acceptance matrix](docs/acceptance-matrix.md), [architecture](docs/architecture.md), [security](docs/security.md), [database](docs/database.md), [testing](docs/testing.md), [P00–P09](docs/implementation-plan.md), [audit rules](docs/audit/00_COMMON_RULES.md), [source prompt](docs/audit/prompts/01_SOURCE_CODE_AUDIT.md).

Đã inventory toàn bộ TS/TSX dưới `app`, `components`, `modules`, `platform`, `server`, `lib`, `db`, `worker`; đọc sâu source chọn lọc ở auth, order, attendance, schedule/request, payroll, incidents/handovers, retention và UI liên quan. Không tuyên bố line-by-line review toàn repository. `sources/` và các bản export không được dùng như lệnh thực thi.

Các phép tái hiện dùng SQLite `:memory:`, migrations đọc từ source, helper hiện hữu, mock Auth/R2 tại boundary; không dùng dữ liệu thật. Bộ test có một D1 contract test qua Miniflare cô lập. Không chạy browser, app build, real Supabase Auth, R2 thật, hosted Workers/CDN, scheduler, upgrade/restore drill hoặc benchmark tải pilot. Callback UI chạy từ AST source không tương đương React lifecycle/DOM E2E.

## Architecture Assessment

### Inventory và hướng dependency

| Khu vực | TS/TSX | Trách nhiệm quan sát |
|---|---:|---|
| `app/` | 69 | Pages và 36 route files, auth/HTTP/input, một số workflow còn nằm trực tiếp trong routes |
| `components/` | 39 | UI nội bộ, đặt món, state tương tác và gọi API |
| `modules/` | 25 | people, operations, attendance, payroll, ordering; domain/application/contracts |
| `platform/` | 4 | HTTP input, error envelope, client, origin guard |
| `server/` | 3 | Identity, session, audit |
| `lib/` | 6 | Adapter Supabase, evidence, time/geolocation và compatibility exports |
| `db/` | 4 | Schema, binding runtime, seed, Drizzle adapter |
| `worker/` | 1 | Worker ingress và Vinext handler |
| **Tổng** | **151** | Không gồm tests/config/build-generated files |

Graph import/export tĩnh resolve được trong các thư mục trên **không phát hiện cycle**. Đây không phải chứng minh không có cycle qua dynamic import, dependency ngoài hoặc bundler. Các architecture tests về domain/contracts và client/server đều chạy qua trong suite.

Hướng chính: UI → HTTP routes → verified identity/membership → application → D1/R2. Domain không thấy import React/HTTP/storage implementation. Các application dùng policy của `people/domain/access.ts` là hợp lý. `operations/application/manage-shifts.ts:2` lấy `attendanceTime` từ application sửa công là coupling nhỏ: khi sửa P02/P04 có thể đưa parser thời gian sang vị trí dùng chung thích hợp và giữ compatibility export; không phải lý do mở refactor riêng.

`lib/payroll-report.ts` là compatibility surface, không tự coi là service trùng lặp. Raw D1 SQL tại application phù hợp [quyết định kiến trúc](docs/architecture.md); không yêu cầu chuyển toàn bộ sang Drizzle queries. Không thấy bằng chứng đủ mạnh để kết luận có secret/server implementation đi vào browser bundle; chưa chạy bundle analysis.

### Separation of concerns và complexity

| Hotspot | Dòng | Branch nodes theo AST | Nhận xét có căn cứ |
|---|---:|---:|---|
| `components/operational/owner-orders-view.tsx` | 2.171 | 149 | Orders/polling, menu, pricing, store settings, modal forms trong cùng file; hai đường fetch menu và xử lý lỗi lệch nhau — CODE-005/006 |
| `components/admin-accounts-view.tsx` | 1.452 | 64 | Nhiều form/action tài khoản; tách theo workflow khi P01/P05 cần chỉnh, không viết lại toàn bộ |
| `app/api/attendance/actions/route.ts` | 459 | 44 | Parse, auth, evidence generation/upload, policy, SQL batch, compensation và response cùng handler — CODE-002 |
| `app/api/admin/accounts/route.ts` | 392 | 52 | Validation, D1 mutation, provider operation; cần bảo toàn thứ tự fail-safe khi P01/P05 chỉnh |

Branch nodes chỉ đếm `if`, conditional expression, case, catch và một số loop trên file, **không phải cyclomatic/cognitive complexity chuẩn**. Độ dài tự nó không được nâng thành P1. Đề xuất tách nhỏ gắn với sửa lỗi cụ thể, giữ component và API consumers hiện tại.

### TypeScript, DB và runtime

- `strict: true`; compiler không phát hiện implicit type errors. AST ghi nhận **0 explicit `any`, 25 non-null assertions, 113 `as` assertions** trong 151 file. Các con số không chứng minh runtime input an toàn. `readJson<T>` vẫn là assertion; CODE-007 cho thấy adapter có thể typecheck nhưng bỏ qua một phần contract.
- `readObject` kiểm shape/type/size; ordering có parser riêng với giới hạn và Content-Type khác. Không hợp nhất tùy tiện: phải giữ 3 MiB attendance, 64 KiB thông thường, 32 KiB ordering và consumers. Giá server có safe-integer guard; vấn đề CODE-003 là thiếu đối chiếu giá đã hiển thị, không phải tin giá client.
- Các query khảo sát dùng placeholders; menu update map column qua allowlist. `owner/orders` lấy items theo tập order IDs bằng `json_each`, không phải một truy vấn cho mỗi order. Chưa chứng minh N+1 nghiêm trọng hoặc index dư cần xóa.
- Suite schema/journal/preflight qua trên SQLite; migration source đến `0014_indexes_and_perf.sql`, có index order theo store/date, evidence expiry và unique lower(email). Không chứng minh shared/staging DB đã apply, hoặc upgrade thực đã thành công.
- Payroll có period clipping, source revision guard khi finalize và locked snapshot. Rate history/rounding mới vẫn thuộc P05. Không sửa snapshot hay migration cũ để đáp ứng rule mới.
- [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) rollback khi statement thất bại; UPDATE 0 rows cần guard riêng. Các workflow request, payroll, incident đã dùng `changes()`/audit command gate. Điều đó không tạo transaction chung D1–R2 (CODE-002).
- Lockfile: Vinext `0.0.50`, React `19.2.6`, Next `16.4.0`, Drizzle `0.45.2`, Wrangler `4.92.0`, TypeScript `5.9.3`, Supabase SSR `0.12.4`, supabase-js `2.111.0`. Không suy từ range trong package.json.
- Worker entry thực: `worker/index.ts`; `vite.config.ts` có Cloudflare plugin và `nodejs_compat`. Việc thấy `Buffer`/`process.env` không đủ kết luận không tương thích Workers. Node filesystem/path imports tìm thấy ở tooling/config được phân biệt với request runtime. Chưa build để chứng nhận runtime toàn app.
- Không thấy shadcn/ui được khai báo như dependency hiện hữu; không đánh giá code theo giả định đã có bộ component này.

## Detailed Findings

Quy ước: Severity giữ nhãn P0–P3 theo yêu cầu, kèm CRITICAL/HIGH/MEDIUM/LOW; Priority là thứ tự xử lý độc lập. Confidence gồm High/Medium/Low và trạng thái bằng chứng theo audit rules. `OPEN` nghĩa finding còn ở baseline; không phủ nhận agent khác đang sửa gói tương ứng. Effort S khoảng nửa–một ngày, M một–ba ngày, L nhiều ngày; chỉ là ước lượng triển khai + regression local, chưa gồm chờ staging/policy.

### CODE-001 — Request approval chưa kiểm actor so với requester

- **Severity:** P1 — HIGH. **Priority:** P1. **Category:** Authorization / business correctness.
- **Confidence:** High — CONFIRMED bằng application chạy với SQLite. **Status:** OPEN; đã có owner công việc P01 trong plan.
- **Files/dòng:** [decide-request](modules/operations/application/decide-request.ts) **5–29**; [request route](app/api/requests/route.ts) **35–43**; related policy gap tại [review-attendance](modules/attendance/application/review-attendance.ts) **5–18** và [correct-attendance](modules/attendance/application/correct-attendance.ts) **13–29**.
- **Rule:** ROLE-002, DEC-001, ACC-04/09.
- **Mô tả/evidence:** route kiểm role owner/manager/team_lead; application SELECT không lấy requester identity/role và UPDATE chỉ kiểm scope/pending/leave guards. Không có predicate khác requester. Guard pending ngăn hai quyết định, nhưng không thực thi duyệt độc lập.
- **Tái hiện:** tạo manager active và request correction pending do chính manager tạo bằng `seedEmployee`/`seedRequest`; gọi production `decideRequest(db, actor, 'self', 'approved')`. **Actual:** `{updated:true,status:'approved',requiresManualAction:true}`. **Expected:** 403/forbidden, không đổi request/audit/notification. Không khẳng định correction đã tự động áp dụng vào công: response hiện nói cần manual action.
- **Impact:** phá tính độc lập của phê duyệt. Related attendance/team_lead được đọc source, chưa tái hiện mọi role/beneficiary bằng real Auth.
- **Fix nhỏ nhất:** dùng policy actor/requester/beneficiary đã xác định ở P00/C01, enforce trong application và write guard; route/UI dùng cùng kết quả quyền. Giữ sole-owner correction là flow riêng.
- **Effort:** M trong P01, không tạo nhiệm vụ sửa riêng. **Overlap P00–P09:** **Yes — P01 trực tiếp**, P03 tích hợp swap.
- **Regression:** self request owner/manager/lead bị chặn; manager không duyệt manager/owner; actor khác được cấp quyền thành công; audit/side effects bằng 0 khi denied; chạy lại với real Auth tại P09.

### CODE-002 — Compensation D1–R2 xóa trước khi xác định commit, và bỏ mất cleanup thất bại

- **Severity:** P1 — HIGH. **Priority:** P1. **Category:** Data integrity / partial failure / retention.
- **Confidence:** High — CONFIRMED cho hai nhánh fault injection; xác suất và error mode provider thật NEEDS_VERIFICATION. **Status:** OPEN.
- **Files/dòng:** [attendance action](app/api/attendance/actions/route.ts) **224–236, 399–410**; [retention](modules/attendance/application/expire-evidence.ts) **5–12, 33–48**.
- **Rule:** ATT-003/007, RET-001, DEC-008.
- **Mô tả/evidence:** sau lỗi `db.batch`, route xóa object R2 trước truy vấn replay. Nếu transaction thực đã commit nhưng caller không nhận acknowledgment, replay thấy event và trả `evidenceStored:true` sau khi object đã bị xóa. Nếu batch chưa commit và R2 delete thất bại, `.catch(() => {})` nuốt lỗi, không có cleanup record. Retention chỉ duyệt `attendance_photos`, nên không tự tìm được object thiếu row.
- **Tái hiện:** chạy route thật qua `loadModule`, SQLite migrations thật, R2 Map giả lập, JPEG hợp lệ. (a) wrapper `db.batch` commit rồi throw; (b) wrapper throw trước ghi và `R2.delete` throw. **Actual:** (a) HTTP 200, 1 event, 1 photo row, **0 object**, `evidenceStored:true`; (b) HTTP 500, **0 event/0 photo row nhưng 1 object**. Appendix A chứa script chạy lại.
- **Expected:** không xóa object khi kết quả commit chưa rõ; nếu rollback thật và cleanup lỗi, vẫn có cách đối soát/retry với key đã lưu an toàn.
- **Impact:** mất bằng chứng có tham chiếu, phản hồi sai trạng thái lưu; hoặc giữ ảnh/GPS trong SVG mồ côi ngoài luồng expiry hiện tại. Không tuyên bố đã xảy ra trên R2 thật hoặc ảnh công khai.
- **Fix nhỏ nhất:** reconcile theo idempotency key/event/object reference trước compensation; nếu trạng thái vẫn không rõ thì giữ object để đối soát. Cleanup failure cần metadata bền vững hoặc job đối soát object có scope, không chỉ log volatile. Bảo toàn event gốc và không xóa ảnh của replay thắng race. Có thể đưa orchestration này vào application workflow khi sửa, route giữ HTTP boundary.
- **Effort:** M. **Overlap P00–P09:** **Yes — P04 có R2/D1 failure và lost response; P08 có cleanup/retry**. Gắn hai fault cases này vào các gói hiện có, không giao song song file route cho agent khác.
- **Regression:** rollback thông thường xóa object riêng của lần thất bại; commit-ack ambiguity giữ object được tham chiếu; cleanup lỗi được tìm lại; retry cùng key không thêm event; D1/Worker emulator rồi failure drill staging.

### CODE-003 — Contract checkout thiếu giá/version khách đã xác nhận

- **Severity:** P1 — HIGH. **Priority:** P1 cho pilot có đặt món. **Category:** API contract / money correctness.
- **Confidence:** High — CONFIRMED bằng production `createOrder` + SQLite. **Status:** OPEN.
- **Files/dòng:** [cart](components/order/cart-drawer.tsx) **79–85, 106–115**; [createOrder](modules/ordering/application/create-order.ts) **24–44, 59–93, 98–128**; [public menu](app/api/order/menu/route.ts) **23–30**.
- **Rule:** ORD-001/006, ACC-08.
- **Mô tả/evidence:** cart gửi IDs/options/quantity, không có expected quote/version/amount. Menu response cũng không có item version. Server tính từ menu hiện tại và chỉ kiểm version từ lúc server đọc đến lúc ghi; không kiểm menu khách thấy trước đó.
- **Tái hiện:** fixture item 45.000đ; giả lập giá khách đã thấy là 45.000đ; đổi DB lên 55.000đ và updated_at; gửi payload đúng contract cart (một item, quantity 1). **Actual:** `success:true`, order `totalAmount:55000`, 1 row mới. **Expected:** conflict báo thay đổi, giữ giỏ và yêu cầu khách xác nhận lại trước tạo đơn. Đây là tổng giá trị đơn, không phải khoản tiền đã thu.
- **Impact:** khách đồng ý mức giá này nhưng cửa hàng nhận mức giá khác; tăng tranh chấp và xử lý thủ công. Server không tin giá client là đúng, nhưng còn thiếu bước xác nhận giá đổi.
- **Fix nhỏ nhất:** thêm expected quote/version cho món/options hoặc giá dự kiến chỉ để so sánh; server vẫn tính canonical price và từ chối mismatch. UI hiển thị giá mới và chỉ tạo attempt mới sau xác nhận. Giữ replay trước validation giá hiện tại để retry đơn đã commit vẫn trả đúng snapshot cũ.
- **Effort:** M. **Overlap P00–P09:** **No về implementation trực tiếp** — P07 tập trung cancellation/spoilage; ACC-08/P09 có tiêu chí giá nhưng chưa có task sửa checkout này. Bổ sung hạng mục vào luồng ordering hiện có sau trao đổi ownership, không coi P07 mặc nhiên xử lý.
- **Regression:** đổi base price, topping price, option availability trước submit và trong transaction; giá không đổi thành công; old-key replay trả snapshot cũ; same-key changed payload conflict; UI giữ giỏ khi 409.

### CODE-004 — Tạo bàn giao chưa idempotent khi retry

- **Severity:** P2 — MEDIUM. **Priority:** P2, hoàn tất cùng P06 trước nghiệm thu handover. **Category:** Retry / API integrity.
- **Confidence:** High — CONFIRMED với route thật + SQLite. **Status:** OPEN.
- **Files/dòng:** [handover route](app/api/handovers/route.ts) **19–47**; [handover UI](components/operational/handovers-view.tsx) **36–59**.
- **Rule:** quy trình mutation/retry của AGENTS, OPS-003/004; không giả định hai nội dung giống nhau luôn là cùng một handover.
- **Evidence/reproduction:** gửi POST hai lần cùng actor/body như trường hợp response đầu bị mất. Route mỗi lần tạo `crypto.randomUUID()` mới. **Actual:** HTTP `[200,200]`, 2 handover rows. UI `saveLock` chỉ ngăn gửi đồng thời tại một component, không nhận diện retry sau mạng lỗi.
- **Expected/impact:** một user intent có cùng command key trả cùng kết quả; hiện có thể tạo hai nhật ký/audit gây nhầm việc ca sau cần xử lý. Chưa có acknowledge workflow để đánh giá tác động tiếp theo.
- **Fix:** client giữ command key tới khi xác nhận; server unique key theo actor/store với payload hash, replay cùng kết quả, changed payload 409. Không deduplicate theo nội dung summary vì hai lần bàn giao độc lập có thể giống nhau.
- **Effort:** S–M. **Overlap P00–P09:** **Yes, một phần — P06** đang thay handover và yêu cầu action idempotent; phải ghi rõ CREATE cũng được bao phủ, không chỉ ACK.
- **Regression:** mất response rồi retry, double-submit, reload giữ attempt, cùng key khác payload và khác store; chỉ một row/audit cho cùng command.

### CODE-005 — Hai đường tải menu quản lý cùng nuốt lỗi, loading không được bật

- **Severity:** P2 — MEDIUM. **Priority:** P2. **Category:** Frontend state / duplication / error contract.
- **Confidence:** High — CONFIRMED source và callback trích từ AST; DOM chưa chạy. **Status:** OPEN.
- **Files/dòng:** [owner view](components/operational/owner-orders-view.tsx) **184, 328–344, 422–439, 1267–1275, 1326–1331**.
- **Evidence:** `fetchMenu` bỏ qua HTTP non-OK, catch trống; effect khi đổi tab lặp lại fetch với `.catch(() => {})`. `loadingMenu` khởi tạo false, chỉ thấy setter false, không có setter true. Orders tab đã có error/request guard nhưng menu/pricing chưa có trạng thái tương đương.
- **Tái hiện:** thực thi callback `fetchMenu` lấy từ source AST, `fetch` trả 503. **Actual:** `items:[]`, `categories:[]`, `loading:false`, không có error setter được gọi/tham chiếu. Source effect cho kết quả tương tự; refresh sau mutation có thể thất bại âm thầm.
- **Expected/impact:** phân biệt menu rỗng với lỗi tải; người quản lý biết dữ liệu cũ và có retry. Hiện lỗi có thể trông như menu rỗng hoặc cập nhật chưa áp dụng, dẫn tới thao tác thừa.
- **Fix nhỏ nhất:** một loader menu dùng chung, loading/error/last-success rõ, reject non-OK qua HTTP client, giữ dữ liệu cũ có nhãn; signal/request sequence cho refresh cạnh tranh. Có thể tách menu panel khi sửa, không bắt buộc redesign cả owner page.
- **Effort:** S. **Overlap P00–P09:** **No trực tiếp** — P07 có chạm cùng file nhưng không giao sửa menu loader. Cần phối hợp file ownership; P09 dùng case này cho UI verification.
- **Regression:** 401/403/500, JSON lỗi, mạng lỗi, retry, refresh sau save và switching tabs; phải kiểm bằng component/browser trước đóng finding.

### CODE-006 — Toggle availability không serialize hoặc kiểm version

- **Severity:** P2 — MEDIUM. **Priority:** P2. **Category:** Frontend/backend concurrency.
- **Confidence:** High — CONFIRMED callback production với responses đảo thứ tự; chưa chạy browser/network thực. **Status:** OPEN.
- **Files/dòng:** [owner view](components/operational/owner-orders-view.tsx) **507–532, 1417–1429**; [menu PATCH](app/api/owner/menu/route.ts) **71–86**.
- **Evidence:** switch không có disabled/pending theo item; optimistic set ngay rồi gửi absolute boolean. Server UPDATE theo id/store, không expected revision. Nhánh success không reconcile bằng server state.
- **Tái hiện:** ban đầu available=true; bấm tắt (request A=false), rồi bật (B=true). Cho server xử lý B trước, A sau; cả hai 200. Callback được lấy bằng TypeScript AST, không viết lại thuật toán. **Actual:** `ui:true`, `server:false`, `bothRequestsSucceeded:true`.
- **Expected/impact:** thứ tự intent cuối hoặc conflict được phản ánh rõ; hiện quản lý thấy món đang bán nhưng khách không đặt được. Đây là trạng thái bán món, không phải quản lý kho chuyên sâu.
- **Fix nhỏ nhất:** pending lock per item và disable switch tới khi reconcile; reload state khi response mơ hồ. Nếu hỗ trợ nhiều người quản lý chỉnh cùng món, dùng expected revision/version phía server và 409; không chỉ thêm request ID ở client vì không đổi thứ tự commit server.
- **Effort:** S cho một client, M nếu thêm version contract. **Overlap P00–P09:** **No trực tiếp**; cùng file P07 nên cần phối hợp, không refactor cạnh tranh.
- **Regression:** hai lần toggle nhanh, request đảo thứ tự, lost response, hai actor chỉnh cùng item; UI phải khớp lần đọc canonical sau completion/error.

### CODE-007 — Supabase SSR adapter bỏ headers đi kèm cookie refresh

- **Severity:** P2 — MEDIUM. **Priority:** P2; kiểm trước production. **Category:** Runtime adapter / auth response caching.
- **Confidence:** High — CONFIRMED cho thiếu xử lý contract; **Medium — PROBABLE cho tác động cache**, chưa xác nhận lộ session. **Status:** OPEN.
- **Files/dòng:** [session adapter](server/session.ts) **22–30**; [server client](lib/supabase/server.ts) **23–31**; [auth callback](app/auth/callback/route.ts) **20–30**. Installed dependency evidence: `node_modules/@supabase/ssr/src/types.ts:31–59`, `cookies.ts:632–658` (tái tạo bằng lockfile, không link node_modules trong docs dùng chung).
- **Evidence:** SSR 0.12.4 gọi `setAll(cookies, headers)` với Cache-Control/Expires/Pragma khi ghi auth cookies; cả hai adapter chỉ nhận/thực thi cookies. Callback trả redirects riêng. [Supabase advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) giải thích yêu cầu tránh cache response chứa cookie refresh.
- **Verification:** đối chiếu source thư viện đã cài, adapter và middleware matcher. Chưa ép refresh thật và đo final response qua Vinext/CDN. `app/app/layout.tsx` dùng force-dynamic; framework hoặc ingress có thể bổ sung no-store, nên **không kết luận response thực chắc chắn bị cache**.
- **Impact:** custom adapter mất lớp bảo vệ contract của thư viện; nếu deployment cache response chứa cookies, tác động có thể nghiêm trọng. Chưa có evidence cho điều kiện đó nên không gán P0/P1.
- **Fix:** middleware propagate headers từ callback; với Server Components chỉ ghi cookie không đủ để set final headers, cần đảm bảo auth route/redirect response boundary no-store và test response cuối. Không sửa cache của public menu như một biện pháp thay thế.
- **Effort:** S–M. **Overlap P00–P09:** **No fix trực tiếp**; P00/P09 có Auth verification để kiểm điều kiện thực.
- **Regression:** refresh success, expired session redirect, code exchange và logout: final response có policy cache phù hợp và cookies còn nguyên; test qua Worker preview, sau đó ingress staging.

### CODE-008 — Test async UI chạy bản sao harness, không chứng minh component hiện hữu

- **Severity:** P2 — MEDIUM. **Priority:** P2. **Category:** Testability / maintainability / verification quality.
- **Confidence:** High — CONFIRMED từ test source và import graph. **Status:** OPEN.
- **Files/dòng:** [concurrency suite](tests/concurrency-empirical-stress.test.mjs) **12–65, 67–101, 214–256**; [golden cases](tests/workforce-golden-cases.test.mjs) **295–389**.
- **Evidence:** `createOrdersPollingHarness` và `createScheduleHarness` tự định nghĩa state/async flow; test không import/render `OwnerOrdersView`/schedule component. Golden clipping/rounding cases có giá trị như specification, nhưng một số case tự tính expected algorithm hoặc dùng fixture thay vì application policy. Không gọi các cases đó là payroll runtime coverage.
- **Verification:** đọc helper và import list; suite thực chạy PASS. Không làm mutation vào component để thử phá test trong audit-only. Nếu bỏ guard ở component thì harness không tự đổi theo — đây là quan sát cấu trúc test, không phải mutation test đã chạy.
- **Impact:** dễ có confidence sai về stale responses, unmount, effect cleanup; refactor production làm test vẫn xanh. 184 PASS không đồng nghĩa rule P00–P09 được thực thi, đặc biệt 10 tests còn skip.
- **Fix nhỏ nhất:** giữ specification tests với nhãn rõ; bổ sung test render component/hook dùng chung thực sự hoặc Playwright network interception kiểm đúng UI. Không tạo hook mới chỉ để test harness riêng. Đưa golden cases sang gọi production policy khi P04/P05 triển khai.
- **Effort:** M. **Overlap P00–P09:** **Yes — P00/P04/P05/P09** đã có fixtures, golden cases và behavioral/E2E requirement. Bổ sung acceptance cho các gói này, không giao sửa logic nghiệp vụ từ audit.
- **Regression:** test phải fail khi bỏ request guard ở production (kiểm riêng trong lượt triển khai được phép), kiểm debounce/poll/visibility/unmount thật; báo tách specification, unit, integration và E2E.

## Technical Debt Backlog

| Thứ tự | Finding | Tác động / khả năng gặp | Chi phí | Điểm nhận việc và điều kiện |
|---:|---|---|---|---|
| 1 | CODE-002 | Bằng chứng công/retention; xảy ra khi failure kép hoặc kết quả commit mơ hồ, chưa đo tần suất thật | M | Bổ sung regression vào P04 + P08, một owner orchestration |
| 2 | CODE-001 | Quyền duyệt; tái hiện deterministic trên request tự tạo | M | P01 đang được giao; không tạo nhánh sửa trùng |
| 3 | CODE-003 | Tổng tiền chưa được khách xác nhận; gặp khi đổi giá trong lúc khách giữ giỏ | M | Bổ sung task checkout contract; phối hợp ordering owner/P07 |
| 4 | CODE-006 | Menu UI/server lệch; double-toggle + request reorder | S–M | Sửa menu mutation riêng khi file P07 đã được điều phối |
| 5 | CODE-004 | Trùng nhật ký; retry sau mất response | S–M | P06: đưa CREATE vào idempotency acceptance |
| 6 | CODE-005 | Không phân biệt rỗng/lỗi; gặp ngay khi fetch menu lỗi | S | Gom loader tại menu panel, không refactor cả dashboard |
| 7 | CODE-007 | Thiếu adapter cache guard; tác động deployment chưa biết | S–M | Đo final headers trước, sửa boundary sau đối chiếu runtime |
| 8 | CODE-008 | Bỏ sót regression khi code UI/policy đổi | M | P09 và golden cases từng package; tránh đếm spec PASS như E2E |

Các cải thiện có thể trì hoãn: chia các view dài theo workflow sau khi task liên quan ổn định; di chuyển parser thời gian khỏi application chéo; chuẩn hóa response types dùng chung sau khi contract P00 được chốt. Chưa có bằng chứng để yêu cầu thay toàn bộ email keys, thêm DI framework, xóa hàng loạt export hoặc tối ưu index theo phỏng đoán.

## Recommendations

### 1. Must fix before pilot

- CODE-001/P01 và CODE-002/P04/P08 trong phạm vi vận hành công thực tế.
- CODE-003 nếu pilot mở đặt món; CODE-006 để trạng thái bán món đáng tin; CODE-004 trong handover workflow được nghiệm thu.
- Hoàn tất các rule P01–P08 thuộc phạm vi phát hành và evidence P09; báo cáo này không cấp waiver cho phần chưa triển khai.
- Kiểm tra final auth headers của CODE-007 trước mở môi trường có cache/ingress; nếu tái hiện cache sai thì nâng ưu tiên theo impact thực.

### 2. Should fix before production

- CODE-005 và CODE-008, với error/retry/keyboard/mobile tests trên UI thật.
- Hoàn thiện auth adapter CODE-007 theo final-response contract, thay vì trông chờ implicit framework behavior.
- D1/R2 failure drill, real Auth role matrix, fresh/upgrade migration và backup/restore drill theo ACC-09..13. Không coi SQLite batch fault injection thay thế provider drill.

### 3. Can defer

Refactor hotspot theo task nhỏ; dùng parser/time contract dùng chung; giảm assertions tại các API consumers có lỗi thực. Giữ stack và component hiện tại. Không ưu tiên microservices, rewrite toàn monolith, hoặc giảm độ an toàn validation/audit để cải thiện số liệu performance.

### 4. Already covered by ongoing implementation plan

| Gói | Source đối chiếu / khoảng cách | Cách dùng báo cáo |
|---|---|---|
| P00 | Fixtures/golden tests untracked, 10 cases skip; C01–C07 trong plan vẫn cần contract rõ | CODE-008; không tự xem test fixture là quyết định mới |
| P01 | `decide-request` chỉ kiểm role/pending, không self; attendance policy còn team_lead | CODE-001 là evidence bổ sung cho cùng task |
| P02 | `manage-shifts` vẫn insert published trực tiếp, edit guard chưa có cut-off 12h | Giữ theo gói draft/publish; không nhân bản thành task audit mới |
| P03 | `decide-request` còn `requiresManualAction`, chưa atomic applied lifecycle | Plan đã nhận; không mô tả approved là lịch đã đổi |
| P04 | Policy/công/scheduler đích chưa đủ; attendance route có compensation lỗi | CODE-002 bổ sung ambiguous commit test |
| P05 | `load-report` chưa có rate-history pipeline theo DEC-006; có locked snapshot hiện hữu | Giữ snapshot, chuyển spec cases sang implementation tests khi triển khai |
| P06 | Handover là store journal, chưa receiver/ack; checklist execution theo business date | CODE-004 CREATE retry bổ sung cùng gói |
| P07 | `change-status` vẫn dùng free-text cancelReason | Không đánh đồng với CODE-003/005/006: cùng module/file không có nghĩa đã được giao sửa |
| P08 | Evidence cleanup dựa DB rows; chưa order anonymization theo DEC-008 | CODE-002 orphan cleanup; giữ bounded retry và event gốc |
| P09 | CI có E2E steps nhưng audit chưa chạy browser/real Auth/drill | CODE-008 và toàn bộ verification limits là đầu vào gate |

Các dòng P02–P08 ở đây là đối chiếu source/plan, không phải mọi gap đều đã runtime-reproduce. Không tự chốt C01–C07 hoặc đổi decision register từ kết quả audit.

## Verification Summary

Môi trường: Windows/PowerShell; Node **v22.19.0**, npm **10.9.3**; dependency đã có sẵn. Không install/upgrade. Lệnh dưới thực chạy trong workspace, trừ những hàng ghi SKIPPED.

| Kiểm chứng / lệnh | Trạng thái | Kết quả thực và giới hạn |
|---|---|---|
| `git rev-parse HEAD`, `git status --short`, `git diff --stat` | PASS | Ghi dirty baseline trước audit; cuối lượt chỉ thêm báo cáo này vào danh sách trạng thái |
| `node --version`, `npm.cmd --version` | PASS | Versions ở trên |
| AST inventory chạy `node --input-type=module` từ stdin | PASS | 151 files, 36 routes, 0 static cycles trong graph resolve được; metrics không phải coverage |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | PASS | Exit 0; không regenerate Workers types hoặc emit build artifacts |
| `npm.cmd run lint` | PASS | Exit 0, không có lint diagnostics |
| `node --experimental-strip-types --test tests/*.test.mjs` | PASS với SKIPPED | Exit 0; **194 tests, 9 suites, 184 pass, 0 fail, 10 skipped, 0 cancelled/todo**, khoảng 17,99 giây theo runner. TAP có 160 top-level entries; không dùng 160 làm tổng test |
| SQLite + actual function/route reproductions qua Node stdin | PASS cho tái hiện lỗi | Self-approval thành công; handover 2 rows; stale cart 45k→55k; hai nhánh D1/R2 như CODE-002 |
| AST-extracted production menu callbacks qua Node stdin | PASS cho tái hiện lỗi | Fetch 503 không error state; reordered toggle UI=true/server=false. Không phải React/browser test |
| D1 `batch` contract test trong full suite | PASS | Miniflare cô lập, thay đổi và rollback với fixture nhỏ; không toàn app trên Workers |
| Tra official D1/Supabase docs, đọc installed SSR source | PASS | D1 transaction contract và SSR header contract; changelog Markdown qua web tool lỗi content-type, đọc lại bằng HTTP GET thành công |
| `npm run typecheck` nguyên script | SKIPPED | Script gọi `wrangler types` ghi generated file; đã chạy compiler trực tiếp để giữ audit-only |
| `npm run build`, `npm run check` | SKIPPED | Không ghi/chạy build pipeline trong workspace agent khác đang làm; không được báo check/build PASS |
| Clean `npm ci` Linux / dependency audit | SKIPPED | Không thay dependency tree; chưa chứng nhận clean Linux install |
| Playwright, mobile/keyboard, real Auth, R2/Workers/CDN thực | SKIPPED | Chưa có evidence runtime các lớp này trong audit |
| Migration staging/production, upgrade/backup/restore, scheduler/load drill | SKIPPED | Ngoài read-only scope; không đụng database/cloud thật |

10 tests skip thuộc workforce golden cases: C01-4/5/6, C03-5, C04-4/5, C05-3, C06-3/4, C07-3. Liên quan self-approval/team lead/system_admin, auto-close, rate history/legacy, handover gate, withdrawal/sole-owner và anonymization. Các kết quả source/spec khác không thay PASS cho các cases này.

Log `request.failed` xuất hiện trong suite fault injection là output của nhánh lỗi chủ động, không đồng nghĩa suite thất bại. Không thu hồi các kết luận tốt đã được test bảo vệ: incident update/audit rollback, bounded input, receipt isolation, order replay, schema parity, overlap guards và locked payroll có tests chạy qua; vẫn phải giữ giới hạn mocks/local.

### Đối chiếu audit lịch sử

Không copy số test/findings cũ. Các lỗi cũ về attendance JSON 64 KiB, incident update/audit tách transaction, malformed incident/handover input và dependency CLI Windows trực tiếp đã có source/test mới tại baseline này. Suite liên quan chạy qua. Không nâng điều đó thành Linux clean-install hoặc hosted verification. Lỗi fetch orders đã có error/request guard; CODE-005 là **menu/pricing**, không phải lặp lại kết luận “orders nuốt lỗi”. Handover idempotency và SSR adapter vẫn cần xử lý như mô tả mới.

## Appendix A — Reproduce D1/R2 failures, không ghi filesystem hoặc gọi provider

Chạy tại root repository với dependencies hiện có. Script dùng helper test và route production, SQLite `:memory:`, R2 Map, JPEG giả lập. Những exception trong script là fault injection có chủ đích. Không sửa file test, không chạy migration vào DB đang dùng.

```powershell
@'
import { createDatabase, seedStore, seedEmployee, seedAttendanceRules } from './tests/helpers/database.mjs';
import { loadModule } from './tests/helpers/load-module.mjs';
import { apiHandler } from './platform/http/errors.ts';
import { readObject } from './platform/http/input.ts';
import { auditStatement } from './server/audit.ts';
import * as evidenceLib from './lib/evidence.ts';
import * as attendanceLib from './lib/attendance.ts';
import { evaluateShiftWindow } from './modules/attendance/domain/policy.ts';
import jpeg from 'jpeg-js';
for (const mode of ['commit_then_throw', 'rollback_and_delete_failure']) {
  const db = createDatabase();
  seedStore(db, { attendanceEnabled: true }); seedAttendanceRules(db);
  const actor = seedEmployee(db, { id: 'employee-a', role: 'employee' });
  const token = 'audit-capture-token';
  const hash = await evidenceLib.sha256Hex(new TextEncoder().encode(token));
  db.sqlite.prepare(`INSERT INTO attendance_capture_sessions
    (id,employee_email,store_id,action,nonce_hash,issued_at,expires_at)
    VALUES ('cap',?,'store-a','check_in',?,?,?)`).run(
      actor.email, hash, new Date().toISOString(), new Date(Date.now()+60000).toISOString());
  const objects = new Map(); const originalBatch = db.batch.bind(db);
  db.batch = async statements => {
    if (mode === 'commit_then_throw') await originalBatch(statements);
    throw new Error('injected boundary failure');
  };
  const loaded = await loadModule('../../app/api/attendance/actions/route.ts', {
    '@/db/runtime': { ensureDatabase: async () => db, getBindings: () => ({ evidence: {
      put: async (key, bytes) => objects.set(key, bytes),
      delete: async key => {
        if (mode === 'rollback_and_delete_failure') throw new Error('injected R2 failure');
        objects.delete(key);
      },
    } }) },
    '@/server/auth': { requireApiUser: async () => ({ actor }), auditStatement },
    '@/platform/http/errors': { apiHandler }, '@/platform/http/input': { readObject },
    '@/lib/evidence': evidenceLib, '@/lib/attendance': attendanceLib,
    '@/modules/attendance/domain/policy': { evaluateShiftWindow },
  });
  const photo = 'data:image/jpeg;base64,' + jpeg.encode({
    data: Buffer.alloc(300*300*4,180), width:300, height:300,
  },80).data.toString('base64');
  const response = await loaded.module.POST(new Request('http://localhost/api/attendance/actions', {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
      captureSessionId:'cap', captureToken:token, idempotencyKey:'audit-key', action:'check_in',
      photo, location:{latitude:10,longitude:106,accuracy:5,timestamp:Date.now()},
      exceptionReason:'Audit isolated fixture',
    }),
  }));
  const result = await response.json();
  console.log({ mode, status:response.status, evidenceStored:result.evidenceStored,
    eventRows:db.sqlite.prepare('SELECT COUNT(*) n FROM attendance_events').get().n,
    photoRows:db.sqlite.prepare('SELECT COUNT(*) n FROM attendance_photos').get().n,
    objectCount:objects.size });
  loaded.dispose(); db.close();
}
'@ | node --experimental-strip-types --input-type=module
```

Output quan sát của cùng phép fault injection trong lượt audit:

```text
commit_then_throw: status=200, evidenceStored=true, eventRows=1, photoRows=1, objectCount=0
rollback_and_delete_failure: status=500, eventRows=0, photoRows=0, objectCount=1
```

## Appendix B — Fingerprints và nguồn nền tảng

SHA-256 của bytes UTF-8 đọc trong lượt audit; kiểm lại trước áp dụng line references nếu agent triển khai đã sửa file.

| File | SHA-256 |
|---|---|
| `app/api/attendance/actions/route.ts` | `1869fbadd30ddf2d79a8fe95b0f4f9aa26eb06e8afe86a98659b058838916ed8` |
| `modules/operations/application/decide-request.ts` | `923016501fabde65cd9182cee9d237ea1655b15a2a51a1a6da03e85a11d901ed` |
| `modules/ordering/application/create-order.ts` | `15ba17950be65424e8f341d5962a13b668f898c3b2f572ad3dc617da761956c7` |
| `components/order/cart-drawer.tsx` | `1fb87ac1c4fc065dbc924465db50eaf1bc5761be862201cab1ece03c0b2066fa` |
| `app/api/handovers/route.ts` | `feb76511d89e3651bec269af32688f5db39d3a438a3fc6b726b6c3d215bf28f0` |
| `components/operational/owner-orders-view.tsx` | `b7ca764475a273750090779ae0c7a1f1662f41ae210ce327ac54e580b3f263dd` |
| `app/api/owner/menu/route.ts` | `7412fef543fd585474c5a0e8a7befc66ede7a72b0600770ce60951129600dc74` |
| `server/session.ts` | `a501b7c5d74b3e4a73bbaa4c71d8ee323ca25f3c2a2a4619014c6d6dab6e0212` |
| `lib/supabase/server.ts` | `9c4b32090411ba6cb26256770ed3c2158cd84a76ec19e38b280930e56c34f99d` |

Nguồn chính thức đã tra trong lượt audit: [Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Supabase changelog](https://supabase.com/changelog.md). Kết luận adapter dựa thêm trên đúng source package đã cài, không chỉ tài liệu web. Không áp giả định Postgres/RLS lên dữ liệu nghiệp vụ D1.
