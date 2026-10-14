# Báo Cáo Khảo Sát Database Schema, Migrations, Triggers và Hạ Tầng Testing

**Tác giả**: `explorer_survey_2` (Teamwork Explorer Agent)  
**Thời điểm khảo sát**: 2026-10-13  
**Môi trường**: Windows / Node >=22.13.0 / Cloudflare D1 / Drizzle ORM / Node Test Runner / Playwright  
**Mục tiêu**: Điều tra toàn diện hiện trạng database schema, migrations, triggers, kiểm tra baseline test pass/fail và độ phủ cho các gói P00–P09 cùng tiêu chí nghiệm thu ACC-01..13.

---

## 1. Tổng Quan Khảo Sát (Executive Summary)

1. **Baseline Testing hiện tại xanh 100% (PASS)**:
   - `npm.cmd test`: **161/161 tests PASS** (25 test files, thời gian chạy ~10.3s). Không có lỗi, không có test bị bỏ qua (0 fail, 0 skipped).
   - `npm.cmd run typecheck`: **PASS** (exit code 0, sinh types Cloudflare Worker và kiểm tra TypeScript không lỗi).
   - `npm.cmd run lint`: **PASS** (exit code 0, ESLint core-web-vitals & typescript sạch).
   - `npm.cmd run build`: **PASS** (exit code 0, Vinext build thành công client/SSR/worker bundles).
   - Toàn bộ lệnh tổng hợp `npm.cmd run check` hoàn toàn sạch trên baseline hiện tại.

2. **Database Schema & Migrations sạch, đồng bộ 0 drift**:
   - D1/SQLite hiện có **31 bảng vật lý** và **15 database triggers** được định nghĩa qua 15 migrations (`drizzle/0000` đến `0014`).
   - Catalog SQLite khớp 100% với Drizzle ORM models tại `db/schema.ts` (kiểm chứng bởi `tests/drizzle-migrations-preflight.test.mjs` và `tests/architecture-boundaries.test.mjs`).
   - Drizzle metadata journal (`drizzle/meta/_journal.json`) và snapshots (0000 đến 0014) hoàn toàn nhất quán.

3. **Khoảng cách nghiệp vụ đối với DEC-001..009 (P00–P09)**:
   - Mặc dù baseline test hiện tại xanh, đây là **test baseline cho schema và logic cũ**.
   - Hầu hết các quyết định nghiệp vụ mới trong DEC-001..009 **chưa có schema hoặc code tương ứng**:
     - Bảng `employee_rate_history` (P05/DEC-006) **hoàn toàn chưa tồn tại** trong `db/schema.ts` hoặc migrations.
     - Cơ chế chặn self-approval (`actor != target`) ở server mutation endpoints (P01/DEC-001) **chưa được áp dụng**.
     - Vai trò `team_lead` vẫn đang được phép duyệt nghỉ, review chấm công và sửa công trong các application services.
     - Vòng đời ca làm việc (P02/DEC-002) chưa hỗ trợ trạng thái `draft` đúng nghĩa (ca nháp bị ẩn, không tính vắng mặt) và chưa có kiểm tra cut-off 12 giờ.
     - Đổi ca nguyên tử (P03/DEC-003) hiện chỉ trả `requiresManualAction: true`, chưa áp dụng đồng thời hai ca/nhân viên qua giao dịch nguyên tử `approved_pending_apply -> applied`.
     - Tự đóng phiên quên checkout +4 giờ (P04/DEC-004), checklist theo ca `shift_routine` (P06/DEC-005), danh mục mã lý do hủy đơn (P07/DEC-007) và ẩn danh hóa PII 180 ngày (P08/DEC-008) chưa được triển khai.
   - Về hạ tầng fixture: Chưa có bộ test fixture đa vai trò độc lập cho các trường hợp mẫu C01–C07 (sole-owner vs multi-owner, ca đêm, đổi rate giữa kỳ, ca nháp).

---

## 2. Hạ Tầng Testing & Kết Quả Baseline Thực Tế

### 2.1. Cấu hình Test Runner & Scripts (`package.json`)

Hệ thống tuân thủ nghiêm ngặt quy tắc trong `AGENTS.md` và `docs/testing.md`, sử dụng **Node Test Runner** gốc (không dùng Jest/Vitest) kết hợp với **Node:SQLite DatabaseSync** và **Miniflare** cho môi trường Workers/D1:

| Script | Lệnh thực thi | Mục đích | Kết quả kiểm chứng thực tế |
|---|---|---|---|
| `npm test` | `node --experimental-strip-types --test tests/*.test.mjs` | Chạy toàn bộ 25 suites unit/integration test trong `tests/` | **PASS**: 161 tests, 161 pass, 0 fail, 0 skipped, duration 10.3s |
| `npm run typecheck` | `npm run types:generate && tsc --noEmit --incremental false` | Sinh Worker bindings types (`wrangler types`) & kiểm tra TypeScript | **PASS**: exit code 0, 0 errors |
| `npm run lint` | `eslint . --ignore-pattern dist --ignore-pattern .next` | Kiểm tra linter Next.js & TypeScript | **PASS**: exit code 0, 0 warnings/errors |
| `npm run build` | `node tooling/run-local.mjs build` | Build ứng dụng Vinext cho Cloudflare Worker | **PASS**: exit code 0 (SSR, Client, Worker bundle sạch) |
| `npm run check` | `npm run typecheck && npm run lint && npm test && npm run build` | Pipeline kiểm tra toàn diện chất lượng mã nguồn | **PASS**: 100% các bước thành công |
| `npm run test:e2e` | `playwright test` | Chạy 3 test specs trong `tests/e2e/` bằng Chromium | Đòi hỏi local readiness accounts và Supabase Auth local (Docker:54321). Nếu thiếu, test sẽ skip đúng quy chuẩn. |

### 2.2. Cơ chế Cô Lập Kiểm Thử (`tests/helpers/`)

1. **`tests/helpers/database.mjs`**:
   - Sử dụng `new DatabaseSync(":memory:")` (tính năng chuẩn của Node >=22.13).
   - Kích hoạt `PRAGMA foreign_keys = ON`.
   - Tự động đọc và nạp toàn bộ các file `.sql` trong thư mục `drizzle/` theo thứ tự chữ cái, mô phỏng D1 chính xác bằng SQLite in-memory.
   - Giả lập D1 query execution: hỗ trợ `prepare()`, `bind()`, `first()`, `all()`, `run()`, `batch()` với transaction `BEGIN...COMMIT/ROLLBACK`.
   - Cung cấp cơ chế `failOn(regex)` để inject database failure có chủ đích, kiểm tra rollback atomicity và audit error handling.

2. **`tests/helpers/load-module.mjs`**:
   - Tải và thực thi trực tiếp các route Next.js API / Workers mà không cần chạy server HTTP.
   - Sử dụng `stripTypeScriptTypes()` từ `node:module`.
   - Thay thế các dependency bên ngoài (`@/db/runtime`, `@/server/auth`, `@/platform/http/errors`) bằng mock/spy độc lập qua một registry toàn cục duy nhất theo UUID (`__route_test_<uuid>`), đảm bảo các test song song không ảnh hưởng lẫn nhau.

3. **`tests/d1-contract.test.mjs`**:
   - Sử dụng `miniflare` để xác minh tương thích binding D1 thực thụ với Cloudflare Worker compatibility date `2026-05-22`.
   - Chứng minh D1 batch bảo toàn `changes()` guards và tự động rollback toàn bộ transaction nếu một statement trong batch thất bại.

---

## 3. Cấu Trúc Database Schema, Migrations & Triggers

### 3.1. Danh mục 31 Bảng Vật Lý Hiện Có

Dữ liệu được xác nhận qua `drizzle-migrations-preflight.test.mjs` và `db/schema.ts`:

1. **Quản trị cơ sở & Nhân sự**:
   - `stores`: Cửa hàng, tọa độ geofence, múi giờ, `workforce_revision` (dùng cho optimistic concurrency).
   - `employees`: Nhân sự, email (unique lower index), chức vụ, lương, vai trò (`system_admin`, `owner`, `manager`, `team_lead`, `employee`), cờ bảo mật (`must_change_password`, `password_version`, `password_reset_pending`).
   - `employee_consents`: Chấp thuận điều khoản GPS/camera theo phiên bản notice.

2. **Lịch làm việc & Chấm công**:
   - `attendance_rules`: Cấu hình quy tắc chấm công (dung sai, retention days).
   - `shifts`: Ca làm việc (`status`: `draft`, `published`, `cancelled`, `completed`), `revision`, khóa liên kết nghỉ phép `approved_leave_request_id`.
   - `attendance_capture_sessions`: Phiên chụp ảnh chấm công kèm nonce hash chống replay.
   - `attendance_sessions`: Phiên làm việc thực tế, `opened_at`, `closed_at`, `worked_minutes`, `status`, `revision`.
   - `attendance_events`: Sự kiện check-in/out, idempotency key, kết quả xác thực.
   - `attendance_locations`: Tọa độ GPS của sự kiện, độ chính xác, khoảng cách tới quán, hạn lưu trữ `expires_at`.
   - `attendance_photos`: Metadata ảnh chụp R2 (object_key, SHA-256, hạn lưu trữ `expires_at`).
   - `attendance_exceptions`: Ngoại lệ chấm công (quá giờ, sai vị trí) kèm lý do giải trình và trạng thái duyệt.
   - `attendance_action_limits`: Rate limit thao tác check-in/out.
   - `attendance_corrections`: Bản ghi điều chỉnh công append-only bất biến.

3. **Lương & Quyết toán**:
   - `payroll_periods`: Kỳ lương (`reviewing`, `finalized`, `paid`), người/thời điểm chốt hoặc mở lại.
   - `payroll_entries`: Dòng chi tiết lương nhân viên theo kỳ, snapshot bất biến (`row_snapshot`, `snapshot_version`).
   - `payroll_adjustments`: Điều chỉnh lương (thưởng/phạt) có lý do và audit, append-only bất biến.

4. **Vận hành cửa hàng**:
   - `checklist_items`: Danh mục đầu việc kiểm tra định kỳ hàng ngày.
   - `checklist_executions`: Lịch sử thực thi checklist theo ngày kinh doanh `(item_id, business_date)`.
   - `incidents`: Sự cố vận hành (`open` -> `acknowledged` -> `resolved` -> `closed`).
   - `handovers`: Sổ giao ban ca / bàn giao giữa các ca.
   - `requests`: Đơn yêu cầu (`leave`, `swap`, `correction`), `client_request_key`, trạng thái (`pending`, `approved`, `rejected`).
   - `notifications`: Thông báo trong ứng dụng cho nhân sự.
   - `audit_events`: Nhật ký kiểm toán mọi mutation (bắt buộc có `store_id`, `actor_email`, `entity_type`, `action`).

5. **Menu & Đặt món**:
   - `menu_categories`: Danh mục món ăn/uống.
   - `menu_items`: Món ăn, giá gốc, hình ảnh, cờ tùy chọn size/đường/đá/topping.
   - `menu_options`: Tùy chọn món và giá cộng thêm.
   - `customer_orders`: Đơn hàng của khách (`order_code`, `status`, `total_amount`, `receipt_token_hash`, `submission_key`).
   - `order_items`: Chi tiết từng món trong đơn kèm snapshot giá và topping.
   - `order_status_history`: Lịch sử trạng thái đơn hàng.
   - `store_ordering_settings`: Cấu hình mở/đóng nhận đơn của quán.
   - `order_rate_limits`: Rate limit chống spam đặt món.

### 3.2. Chuỗi 15 Migrations Hiện Có (`drizzle/`)

Hệ thống đang ở Migration Head **0014**:
- `0000_pink_doctor_doom.sql`: Khởi tạo 17 bảng cơ sở đầu tiên.
- `0001_eager_peter_parker.sql`: Bổ sung các cột quan trọng cho shifts, sessions, events, requests.
- `0002_lovely_slayback.sql`: Thêm unique index trên `employees(email)`.
- `0003_shallow_ben_urich.sql`: Thêm bảng `employee_consents`.
- `0004_free_runaways.sql`: Thêm bảng `attendance_action_limits`.
- `0005_faulty_morg.sql`: Thêm bảng `attendance_capture_sessions` và indexes.
- `0006_repair_application_columns.sql`: Khắc phục schema drift (job_title, phone, start_date, geofence_radius).
- `0007_payroll_snapshots.sql`: Thêm cột `row_snapshot` và `snapshot_version` vào `payroll_entries`.
- `0008_ordering_system.sql`: Thêm toàn bộ module ordering (7 bảng).
- `0009_identity_security.sql`: Thêm cờ bảo mật mật khẩu nhân viên và `store_id` vào `audit_events`.
- `0010_order_security.sql`: Thêm mã hóa hash biên nhận đặt món (`receipt_token_hash`) và `order_rate_limits`.
- `0011_workforce_integrity.sql`: Bổ sung concurrency revisions, bảng `attendance_corrections`, `payroll_adjustments` và 14 triggers.
- `0012_daily_checklists.sql`: Tách riêng `checklist_executions` với composite PK `(item_id, business_date)`.
- `0013_workforce_guardrails.sql`: Thêm trigger 15 (`shifts_locked_period_insert`).
- `0014_indexes_and_perf.sql`: Tối ưu hiệu năng, thêm index `customer_orders(store_id, created_at)`, `attendance_photos(expires_at)`, `attendance_locations(expires_at)`, `employees(lower(email))`.

### 3.3. Danh Mục 15 Database Triggers Đang Hoạt Động

Toàn bộ 15 triggers này được bảo đảm bởi SQLite engine:

| STT | Tên Trigger | Bảng mục tiêu | Sự kiện / Điều kiện | Hành vi & Ràng buộc toàn vẹn |
|---|---|---|---|---|
| 1 | `attendance_session_revision_guard` | `attendance_sessions` | BEFORE UPDATE | Hủy thao tác với mã `attendance_conflict` nếu `NEW.revision <> OLD.revision + 1`. |
| 2 | `attendance_corrections_immutable_update` | `attendance_corrections` | BEFORE UPDATE | Chặn mọi UPDATE, bắn lỗi `immutable_attendance_correction`. |
| 3 | `attendance_corrections_immutable_delete` | `attendance_corrections` | BEFORE DELETE | Chặn mọi DELETE, bắn lỗi `immutable_attendance_correction`. |
| 4 | `payroll_adjustments_immutable_update` | `payroll_adjustments` | BEFORE UPDATE | Chặn mọi UPDATE, bắn lỗi `immutable_payroll_adjustment`. |
| 5 | `payroll_adjustments_immutable_delete` | `payroll_adjustments` | BEFORE DELETE | Chặn mọi DELETE, bắn lỗi `immutable_payroll_adjustment`. |
| 6 | `shifts_no_overlap_insert` | `shifts` | BEFORE INSERT | Kiểm tra `status IN ('draft', 'published')`. Bắn lỗi `shift_overlap` nếu ca mới trùng khoảng giờ với ca khác của cùng nhân viên. |
| 7 | `shifts_no_overlap_update` | `shifts` | BEFORE UPDATE | Chặn cập nhật giờ/nhân viên nếu tạo ra ca trùng lặp (`shift_overlap`). |
| 8 | `attendance_revision_insert` | `attendance_sessions` | AFTER INSERT | Tự động tăng `stores.workforce_revision = workforce_revision + 1`. |
| 9 | `attendance_revision_update` | `attendance_sessions` | AFTER UPDATE | Tự động tăng `stores.workforce_revision`. |
| 10 | `attendance_revision_delete` | `attendance_sessions` | AFTER DELETE | Tự động tăng `stores.workforce_revision`. |
| 11 | `employee_payroll_revision` | `employees` | AFTER UPDATE | Tăng `stores.workforce_revision` khi thay đổi lương/trạng thái/thông tin nhân sự. |
| 12 | `shifts_revision_insert` | `shifts` | AFTER INSERT | Tự động tăng `stores.workforce_revision`. |
| 13 | `shifts_revision_update` | `shifts` | AFTER UPDATE | Tự động tăng `stores.workforce_revision`. |
| 14 | `payroll_adjustments_revision` | `payroll_adjustments` | AFTER INSERT | Tự động tăng `stores.workforce_revision`. |
| 15 | `shifts_locked_period_insert` | `shifts` | BEFORE INSERT | Chặn chèn ca làm việc mới (`shift_locked_period`) nếu ca đó nằm trong kỳ lương đã chốt/thanh toán (`finalized` hoặc `paid`). |

---

## 4. Khảo Sát Test Fixtures Hiện Có & Điểm Thiếu Hụt

### 4.1. Hiện Trạng Fixtures

1. **`tests/helpers/database.mjs`**:
   - `seedStore(db, id = 'store-a')`: Tạo store thử nghiệm cơ bản.
   - `seedEmployee(db, { id, storeId, role, status })`: Tạo nhân viên đơn lẻ (mặc định lương 25.000 VND).
   - *Hạn chế*: Chưa có hàm tạo nhanh multi-owner, sole-owner, hoặc cấu hình ma trận nhân viên đầy đủ cho kiểm thử vai trò chéo.

2. **`tooling/local.mjs` (`provision`)**:
   - Tạo 10 tài khoản fixture cục bộ trong Supabase Auth và D1 SQLite:
     - `local-admin`: system_admin
     - `local-owner`: owner (cửa hàng chính)
     - `local-manager`: manager (cửa hàng chính)
     - `local-lead`: team_lead (cửa hàng chính)
     - `local-staff-a`: employee (cửa hàng chính)
     - `local-staff-b`: employee (cửa hàng chính)
     - `local-must-change-pw`: employee có cờ đổi mật khẩu
     - `local-suspended`: employee trạng thái khóa
     - `local-reset-pending`: employee đang chờ reset mật khẩu
     - `local-store2-owner`: owner của cửa hàng thứ hai (dùng để test cách ly đa cửa hàng)
   - *Hạn chế*: Dùng cho môi trường Docker/Playwright local preview, không được tự động nạp trong bộ test unit/integration chuẩn `npm test`.

3. **`db/seed.ts`**:
   - Dùng cho demo data (`seedDemoDatabase()`): nạp tài khoản Linh (owner), Minh (manager), An, Bảo, Vy (barista) và lịch xoay vòng 30 ngày.

### 4.2. Khoảng Cách Cần Bổ Sung Cho P00 & C01–C07

Theo yêu cầu **R1 (P00)** trong `ORIGINAL_REQUEST.md`, hệ thống cần một fixture chuẩn hóa tập trung trong `tests/helpers/` phục vụ các kịch bản vàng (Golden Cases):

| Điểm | Chủ đề Golden Case | Hiện trạng trong test | Yêu cầu bổ sung trong P00 |
|---|---|---|---|
| **C01** | Ma trận duyệt độc lập & Self-approval | Đã test quyền manager không sửa owner; chưa test `actor != target` | Fixture cặp `staff_a` & `staff_b`, `team_lead`, `manager`, `owner_1` & `owner_2`, và trường hợp `sole_owner` duy nhất. Kiểm tra 403 Forbidden khi tự duyệt. |
| **C02** | Vòng đời ca & Giữ chỗ lịch draft | Đã test overlap giữa các ca published | Fixture ca draft (ẩn khỏi nhân viên, không tính vắng mặt, không check-in); ca sát mốc cut-off 12h (11h59 vs 12h01) có kèm adjustment. |
| **C03** | Dung sai 5 phút & Biên 15 phút | Đã test tính phút cơ bản | Fixture ca 08:00–12:00, quẹt lúc 07:55 vs 07:40, 12:10 vs 12:20; ca quên checkout tự đóng sau +4h có approved_minutes = 0. |
| **C04** | Làm tròn floor 15 phút & Đổi rate giữa kỳ | Đã test cắt ca qua tháng | Fixture nhân viên đổi đơn giá giữa kỳ (ví dụ ngày 15 đổi từ 25k lên 30k), các mốc phút 14/15/29/30 phút, làm tròn tổng về 1.000 VND gần nhất. |
| **C05** | Shift routine & Handover acknowledgment | Đã test checklist daily | Fixture ca đêm 22:00–06:00, 2 ca cùng ngày; biên bản bàn giao có người nhận chỉ định; gate chặn check-in trước khi ack hoặc bypass có audit. |
| **C06** | Hủy đơn có lý do & Hao hụt | Đã test chuyển status đơn hàng cơ bản | Fixture đơn hàng ở trạng thái `preparing` và `ready` bị hủy kèm mã lý do chuẩn hóa; kiểm tra dữ liệu hao hụt ghi nhận mà không sửa tổng tiền đơn gốc. |
| **C07** | Retention 90 ngày / 180 ngày / 3 năm | Đã test expire ảnh/GPS đơn lẻ | Fixture dữ liệu ảnh/GPS >90 ngày, đơn hàng >180 ngày (tên, SĐT, ghi chú), dữ liệu công/lương/audit 3 năm. |

---

## 5. Phân Tích Độ Phủ & Khoảng Cách Theo Gói (P00–P09) & Tiêu Chí Nghiệm Thu (ACC-01..13)

### 5.1. Bảng Phân Tích Từng Gói Nghiệp Vụ (P00–P09)

| Gói | Yêu cầu cốt lõi (Theo DEC) | Hiện trạng trong Code & Schema | Đánh giá / Khoảng cách kỹ thuật cần làm |
|---|---|---|---|
| **P00** | Baseline sạch, Golden Cases C01–C07, Fixtures đa vai trò | Baseline `npm test` & `check` xanh; chưa có bộ Golden Cases C01–C07 chuyên biệt | **CẦN LÀM**: Bổ sung file fixture và golden case suite xác nhận các mốc biên C01–C07 trước khi sửa domain. |
| **P01** (DEC-001) | Chặn self-approval ở server (`actor != target`), thu hẹp `team_lead`, chặn `system_admin`, luồng `sole_owner_self_correction` | `team_lead` vẫn có trong danh sách cho phép ở `review-attendance.ts`, `decide-request.ts`, `manage-shifts.ts`; chưa có guard `actor != target`; chưa có luồng sole-owner riêng | **CẦN LÀM**: Sửa `access.ts`, các route mutation kiểm tra danh tính thực của actor vs target; thêm logic đếm active owner cho sole-owner audit. |
| **P02** (DEC-002) | Vòng đời ca `draft -> published`, ẩn ca draft, cut-off 12h yêu cầu lý do điều chỉnh | `manage-shifts.ts` tạo ca là insert thẳng `published`; chưa có workflow cut-off 12h | **CẦN LÀM**: Hỗ trợ tạo/sửa draft; ẩn draft khỏi API nhân viên; thêm kiểm tra khoảng cách thời gian hiện tại vs `starts_at` (12h) để yêu cầu lý do/adjustment. |
| **P03** (DEC-003) | Đổi ca nguyên tử `approved_pending_apply -> applied`, rút đơn pending, nghỉ phép nguyên ca | `decide-request.ts` chỉ trả về thông báo manual action; bảng `requests` chỉ có 1 `shift_id` | **CẦN LÀM**: Migration thêm `peer_shift_id` hoặc target shift vào `requests`; tạo hàm `apply-swap.ts` thực thi transaction cập nhật nguyên tử cả 2 ca; thêm hành động `withdraw`. |
| **P04** (DEC-004) | Dung sai 5 phút, biên 15 phút, tự đóng phiên quên checkout sau +4h (approved minutes = 0) | Chưa có logic tách recorded vs payable time với dung sai; chưa có background task / job auto-close | **CẦN LÀM**: Cập nhật `policy.ts`; viết `auto-close-sessions.ts` quét các session open quá `ends_at + 4h` đóng với worked/approved = 0. |
| **P05** (DEC-006) | Bảng `employee_rate_history`, tính lương theo khoảng hiệu lực, floor 15 phút, round 1.000 VND, snapshot kỳ | Bảng `employee_rate_history` **chưa tồn tại**; `load-report.ts` chỉ nhân phút / 60 với 1 rate duy nhất | **CẦN LÀM**: Migration tạo bảng `employee_rate_history`; cập nhật thuật toán bóc tách đoạn rate, floor 15 phút, round 1.000 VND; trigger tăng revision. |
| **P06** (DEC-005) | Tách `daily_routine` vs `shift_routine` (khóa item_id + shift_id), biên bản bàn giao bắt buộc ack trước check-in | `checklist_executions` chỉ có khóa theo `(item_id, business_date)`; `handovers` chưa liên kết ca nhận và gate check-in | **CẦN LÀM**: Migration cập nhật checklist & handovers schema; cài đặt gate kiểm tra ack trong API `capture-sessions`/check-in kèm bypass audit. |
| **P07** (DEC-007) | Hủy đơn `preparing`/`ready` bắt buộc reason code enum; ghi nhận hao hụt không đổi tổng tiền | `change-status.ts` chỉ nhận cancelReason là free text; chưa có enum hay thống kê hao hụt | **CẦN LÀM**: Định nghĩa enum reason code chuẩn hóa; lưu thông tin hao hụt vào status history; chặn khách/staff tự hủy đơn đang làm. |
| **P08** (DEC-008) | Xóa ảnh/GPS >90 ngày, ẩn danh PII đơn hàng >180 ngày, bảo tồn dữ liệu công/lương >=3 năm | `expire-evidence.ts` chỉ xóa ảnh/GPS; chưa có chức năng ẩn danh đơn hàng `customer_orders` | **CẦN LÀM**: Viết `anonymize-orders.ts` che PII trên đơn >180 ngày (tên, SĐT, ghi chú); thiết lập lịch retention định kỳ. |
| **P09** (DEC-009) | E2E integration đa vai trò, nghiệm thu ACC-01..13, backup/restore drill | Bộ test E2E hiện chỉ có 3 file cơ bản; các test hành trình nghiệp vụ liên hoàn chưa có | **CẦN LÀM**: Mở rộng `tests/e2e/` bao quát luồng từ tạo lịch -> chấm công -> ngoại lệ -> duyệt -> chốt lương. |

---

### 5.2. Ma Trận Nghiệm Thu ACC-01 Đến ACC-13 Đối Chiếu Hiện Trạng

| Mã Tiêu Chí | Nội dung tiêu chí | Hiện trạng kiểm chứng trong tests/ | Kết luận Baseline |
|---|---|---|---|
| **ACC-01** | Ca draft ẩn/không chấm công; publish đúng ca; không overlap; cut-off 12h | Đã test trigger chống overlap ca (`workforce-integrity.test.mjs:150`). Chưa test ẩn draft và cut-off 12h. | **PARTIAL** (Đã có trigger overlap, thiếu logic draft & cut-off) |
| **ACC-02** | Revision cũ, ca trong cut-off/có công/nghỉ/kỳ khóa bị chặn hoặc chuyển adjustment | Đã test locked period trigger (`shifts_locked_period_insert`) và revision guard. Chưa có adjustment flow. | **PARTIAL** (Đã có database guard, thiếu application flow) |
| **ACC-03** | Chấm công server time, ngưỡng 5/15 phút, overtime, retry/idempotency, auto-close +4h | Đã test idempotency key, verify JPEG, tính khoảng cách GPS. Chưa test ngưỡng 5/15 min và auto-close +4h. | **PARTIAL** |
| **ACC-04** | Sửa công append-only, cấm self-approval, sole-owner audit, missing checkout chưa tính công | Đã test `attendance_corrections` append-only trigger. Chưa có guard self-approval và sole-owner flow. | **PARTIAL** (DB trigger xanh, thiếu server RBAC guard) |
| **ACC-05** | Nghỉ nguyên ca; rút pending; swap atomic apply/rollback; correction tạo kết quả thật | Đã test duyệt đơn nghỉ cập nhật shift (`workforce-integrity.test.mjs:152`). Chưa có atomic swap và withdraw. | **PARTIAL** |
| **ACC-06** | Floor 15 phút, round 1.000 VND, ca qua tháng, rate history/reopen, snapshot lương | Đã test cắt ca qua tháng và chặn thiếu rate. Chưa có `employee_rate_history`, floor 15m, round 1.000 VND. | **PARTIAL** |
| **ACC-07** | Daily/shift checklist, ca đêm, handover receiver/ack/bypass, incident transitions | Đã test incident state machine (`business-logic-verification.test.mjs:18`) và daily checklist. Chưa có shift routine và handover gate. | **PARTIAL** |
| **ACC-08** | Giá server, retry, receipt token hash, chặn khách hủy, lý do hủy chuẩn hóa, hao hụt | Đã test giá server, tùy chọn, hash token biên nhận. Chưa có lý do hủy chuẩn hóa và báo cáo hao hụt. | **PARTIAL** |
| **ACC-09** | Role denial, chặn `system_admin`, disabled account, bảo vệ owner cuối cùng | Đã test `canManageEmployee` từ chối system_admin. Chưa thu hẹp `team_lead` và chưa chặn system_admin ở business routes. | **PARTIAL** |
| **ACC-10** | Ảnh/GPS 90 ngày, order anonymize 180 ngày, history 3 năm, cleanup retry/restore | Đã test `expireEvidence` xóa ảnh/GPS theo store. Chưa có logic ẩn danh PII đơn hàng 180 ngày. | **PARTIAL** |
| **ACC-11** | Fresh/upgrade migrations và restore đúng invariant | Đã test 15 migrations trên SQLite trong-memory; 31 bảng và 15 triggers khớp 100% không drift. | **PASS** (trên emulator / local preflight) |
| **ACC-12** | Giao diện mobile 320/390px, focus, keyboard, CTA không bị che | Đã test mobile layout occlusion trong `tests/e2e/mobile-layout-occlusion.spec.ts`. | **PASS** (về layout tĩnh) |
| **ACC-13** | Core E2E, diễn tập phục hồi, Auth/RBAC, tải và rollback | Chưa thực hiện diễn tập E2E đa vai trò toàn diện trên môi trường tích hợp. | **NOT_RUN** |

---

## 6. Khuyến Nghị Kỹ Thuật Cho Các Bước Triển Khai Tiếp Theo

Dựa trên kết quả khảo sát hạ tầng database và kiểm thử, kiến nghị các bước triển khai tiếp theo như sau:

1. **Bước 1 — Hoàn thiện P00 (Baseline & Fixture Foundation)**:
   - Giữ nguyên toàn bộ 25 suites test hiện tại đang PASS.
   - Bổ sung helper `seedRoleMatrix(db)` trong `tests/helpers/database.mjs` tạo đầy đủ các vai trò: `owner_1`, `owner_2`, `manager`, `team_lead`, `staff_a`, `staff_b`, `system_admin`, `suspended`, `offboarded`.
   - Viết bộ test Golden Cases `tests/golden-cases-c01-c07.test.mjs` mô tả rõ ràng input/expected output cho các điểm C01–C07.

2. **Bước 2 — Quản trị Migration Head và Trigger Compatibility**:
   - Khi tạo migration mới cho P03 (`requests`), P05 (`employee_rate_history`), P06 (`checklists`/`handovers`), migration tiếp theo phải được đánh số **`0015_...`**.
   - Bắt buộc cập nhật đồng bộ `db/schema.ts`, sinh snapshot qua Drizzle Kit, và kiểm tra tính liên tục của `drizzle/meta/_journal.json`.
   - Lưu ý đặc biệt với trigger `shifts_no_overlap_insert`/`update`: Khi triển khai swap ca nguyên tử ở P03, việc cập nhật hai ca cùng lúc có thể bị trigger bắt lỗi overlap tạm thời nếu cập nhật tuần tự. Cần giải pháp hoán đổi nguyên tử thông qua trạng thái trung gian hợp lệ hoặc câu lệnh UPDATE có điều kiện thích hợp.

3. **Bước 3 — Triển khai P01 (Bảo mật Server & Chặn Self-Approval)**:
   - Sửa `modules/people/domain/access.ts`: thêm hàm `assertNotSelfApproval(actor, target)` bắn lỗi 403 Forbidden.
   - Cập nhật các routes `app/api/attendance/review`, `app/api/attendance/corrections`, `app/api/requests` để chặn `team_lead` khỏi các quyền duyệt nhạy cảm và chặn mọi hành vi tự duyệt.
   - Thêm luồng `sole_owner_self_correction`: kiểm tra `SELECT COUNT(*) FROM employees WHERE role = 'owner' AND status = 'active'` = 1. Nếu đúng 1 owner, cho phép kèm audit mức độ cao (flag `high_priority_audit`, ghi diff trước/sau).

4. **Bước 4 — Triển khai tuần tự P02 -> P08 và đóng gói bằng P09**:
   - Sau mỗi gói thay đổi, bắt buộc chạy lại `npm test`, `npm run typecheck` và `npm run check` để đảm bảo không phát sinh regression.
   - Không được sửa đổi các migration cũ đã áp dụng (`0000` đến `0014`).
