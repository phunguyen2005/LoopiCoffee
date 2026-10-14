# TÀI LIỆU LỊCH SỬ — không dùng làm đặc tả hiện hành

> Đánh dấu ngày 2026-10-13. Các kết quả và chỉ dẫn bên dưới chỉ thuộc baseline/lượt công việc được mô tả. Không coi là yêu cầu thực thi hoặc trạng thái HEAD hiện tại.
> Đọc [bộ tài liệu chuẩn](../README.md), [hiện trạng source](../implementation-status.md) và [đính chính audit](ERRATA.md).
> Bản nguyên gốc được bảo toàn trong docs/archive/2026-10-13/. Liên kết source đã bỏ line anchors cũ; đường dẫn không còn tồn tại chuyển tới đính chính, không coi đó là bằng chứng source.

---

# BÁO CÁO AUDIT CHUYÊN SÂU: DATABASE D1 & DRIZZLE ORM
**Dự án**: LoopiCafe Management System
**Mã kiểm toán viên**: AGENT 1 — DATABASE AUDITOR
**Mục tiêu**: Toàn diện mảng Schema, Migrations, Constraints, Transactions, Concurrency & Data Integrity
**Quy chuẩn áp dụng**: `AUDIT ONLY` theo [`docs/audit/00_COMMON_RULES.md`](00_COMMON_RULES.md) và [`AGENTS.md`](../../AGENTS.md)
**Git Baseline Commit SHA**: `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1`
**Ngày thực hiện**: 12/10/2026

---

## 1. Executive Summary

Hệ thống lưu trữ của **LoopiCafe Management System** vận hành trên kiến trúc **Cloudflare D1** (SQLite engine phân tán tại edge) kết hợp định nghĩa schema bằng **Drizzle ORM** và quản lý migrations có phiên bản (`0000` đến `0013`).

### Điểm mạnh nổi bật đã xác minh
1. **Kiểm soát concurrency và chống ghi đè phiên bản**: Hệ thống đã triển khai cơ chế optimistic locking rất sáng tạo thông qua trigger SQLite (`attendance_session_revision_guard`, `shifts_locked_period_insert`) kết hợp revision counter cấp cửa hàng (`workforce_revision`) và cấp thực thể (`revision`).
2. **Bảo toàn dữ liệu tài chính & đơn hàng**: Bảng `order_items` snapshot đầy đủ tên món, đơn giá (`unit_price`), số lượng (`quantity`), thành tiền (`subtotal`) và options (kèm JSON toppings); `customer_orders` kiểm tra tính hợp lệ của đơn giá và hash gửi đơn (`submission_hash`, `submission_key`). Bảng lương `payroll_entries` lưu trữ snapshot JSON bất biến (`row_snapshot`, `snapshot_version`).
3. **Tiền tệ nguyên bản (Zero Float Monetary Loss)**: Tất cả các trường tiền tệ (giá bán, phụ thu, lương giờ, thưởng, phạt) đều được lưu dạng `integer` với đơn vị VND nhỏ nhất, hoàn toàn không sử dụng kiểu dữ liệu số thực (`real` / `float`).
4. **Idempotency & Rate Limiting**: Triển khai cơ chế chống gửi lặp bằng `idempotency_key` cho chấm công, `client_request_key` cho yêu cầu đổi/nghỉ ca, và `bucket_key` cho rate limiting đặt món.
5. **Đạt 128/128 test tự động**: Bộ kiểm thử hiện hữu của repository chạy xanh hoàn toàn (`npm.cmd test`).

### Rủi ro và Lỗ hổng nghiêm trọng phát hiện
Bên cạnh các điểm mạnh, quá trình audit chuyên sâu phát hiện **11 vấn đề từ P0 đến P3**:
- **P0 (Critical)**: **Schema Drift** giữa `db/schema.ts` và chuỗi SQL migrations (cột `NOT NULL` trong schema nhưng thực tế `NULLABLE` trong DB do `ALTER TABLE ADD COLUMN` của SQLite); **Thiếu Statement Breakpoints** trong migrations `0011` và `0013` chứa triggers SQL khiến Drizzle Migrator chuẩn không thể thực thi.
- **P1 (High)**: **Email Unique Index Case-Sensitive** cho phép tạo tài khoản trùng email khác chữ hoa/thường, đồng thời khiến **toàn bộ câu lệnh xác thực và API bị Full Table Scan** (`SCAN employees`, `SCAN notifications`) do dùng `lower(email)`; **Thiếu bảng lịch sử mức lương (`Wage History`)** dẫn đến việc mở lại kỳ lương (`reopen`) tính toán lại lương tháng cũ theo mức lương mới nhất của nhân viên; **Thiếu Index `(store_id, created_at)`** trên `customer_orders` gây sắp xếp Temp B-Tree khi chủ quán xem danh sách đơn; **Thiếu Index `expires_at`** trên bảng ảnh và vị trí khiến cron job retention phải quét toàn bộ bảng.
- **P2 (Medium)**: Thiếu **CHECK constraints** mức DB cho domain invariants (khoảng thời gian ca làm việc âm, số tiền âm, trạng thái không hợp lệ); Các thực thể nhân sự không dùng **Foreign Key** vào `employees.id` mà dùng chuỗi email trần (rủi ro orphan records); Rate limit đặt món thực hiện 3 thao tác ghi D1 trên mỗi request tra cứu.
- **P3 (Low)**: Drizzle ORM chưa được tận dụng làm runtime query builder (vẫn dùng raw prepared statements); Các cột thừa `checklist_items.completed` và `completed_at` bị bỏ rơi sau khi tách bảng `checklist_executions`.

---

## 2. Phạm vi, Phương pháp và Giới hạn

### Phạm vi kiểm tra
- Toàn bộ định nghĩa bảng và kiểu dữ liệu: [`db/schema.ts`](../../db/schema.ts)
- Toàn bộ chuỗi migration D1: [`drizzle/`](../../drizzle) (từ `0000_pink_doctor_doom.sql` đến `0013_workforce_guardrails.sql`) và metadata [`drizzle/meta/`](../../drizzle/meta)
- Runtime kết nối và cấu hình D1: [`db/runtime.ts`](../../db/runtime.ts), [`db/index.ts`](../../db/index.ts), [`drizzle.config.ts`](../../drizzle.config.ts)
- Toàn bộ tầng Application/Module truy vấn DB: `modules/attendance/`, `modules/operations/`, `modules/ordering/`, `modules/payroll/`, `modules/people/`
- Toàn bộ route API có tương tác D1: `app/api/**`
- Trình tạo dữ liệu thử nghiệm: [`db/seed.ts`](../../db/seed.ts), [`tooling/schema-preflight.mjs`](../../tooling/schema-preflight.mjs)

### Phương pháp kiểm tra
1. **Đối soát tĩnh (Static AST & Schema Diff)**: Trích xuất metadata từ `db/schema.ts` bằng `drizzle-orm/sqlite-core` và so sánh trực tiếp với catalog SQLite thực tế sau khi chạy tuần tự 14 file SQL migration.
2. **Khảo sát cấu trúc SQLite (PRAGMA Catalog Inspection)**: Sử dụng Node.js `node:sqlite` (`DatabaseSync`) để đọc `PRAGMA table_info`, `PRAGMA foreign_key_list`, `PRAGMA index_list` và kiểm tra toàn vẹn chuỗi khóa ngoại, nullability, defaults.
3. **Phân tích Query Plan (`EXPLAIN QUERY PLAN`)**: Thực thi phân tích chi tiết chi phí truy vấn đối với các câu lệnh thường xuyên gọi (Auth, Dashboard, Order Listing, Retention, Notifications) nhằm phát hiện `SCAN` (Full Table Scan) và `USE TEMP B-TREE`.
4. **Thực nghiệm hành vi bất biến (Empirical Behavioral Verification)**: Viết các kịch bản kiểm thử độc lập trong thư mục scratch cô lập để kiểm chứng:
   - Chèn email trùng lặp khác chữ hoa/thường.
   - Chèn ca làm việc có thời gian kết thúc trước thời gian bắt đầu.
   - Hành vi tính lại lương khi tăng lương và mở lại kỳ lương đã chốt.
   - Hành vi batch D1 khi điều kiện guard thất bại.

### Giới hạn kiểm toán
- **Tuyệt đối AUDIT ONLY**: Không sửa đổi mã nguồn, không chạy migration phá hủy, không ghi dữ liệu lên môi trường production hoặc cloud ngoài.
- **Môi trường giả lập**: Kiểm tra trên môi trường Node.js SQLite (`DatabaseSync`) và Miniflare cục bộ tương thích với Worker Runtime.

---

## 3. Inventory Bảng và Mối Quan Hệ

Hệ thống có tổng cộng **31 bảng**. Chi tiết định nghĩa và quan hệ trong database:

| STT | Tên bảng | File & Dòng định nghĩa | Khóa chính (PK) | Khóa ngoại (FK) | Unique Constraints | Triggers gắn liền |
|---|---|---|---|---|---|---|
| 1 | `stores` | [`db/schema.ts#L4`](../../db/schema.ts) | `id` | Không | Không | Target của 7 revision triggers |
| 2 | `employees` | [`db/schema.ts#L18`](../../db/schema.ts) | `id` | `store_id -> stores.id` | `email` (case-sensitive) | `employee_payroll_revision` |
| 3 | `employee_consents` | [`db/schema.ts#L46`](../../db/schema.ts) | `id` | Không | `(employee_email, notice_version)` | Không |
| 4 | `attendance_rules` | [`db/schema.ts#L53`](../../db/schema.ts) | `id` | `store_id -> stores.id` | `(store_id, version)` | Không |
| 5 | `shifts` | [`db/schema.ts#L71`](../../db/schema.ts) | `id` | `store_id -> stores.id`, `approved_leave_request_id -> requests.id` | Không | `shifts_no_overlap_insert`, `shifts_no_overlap_update`, `shifts_revision_insert`, `shifts_revision_update`, `shifts_locked_period_insert` |
| 6 | `attendance_capture_sessions` | [`db/schema.ts#L89`](../../db/schema.ts) | `id` | `store_id -> stores.id` | Không | Không |
| 7 | `attendance_sessions` | [`db/schema.ts#L100`](../../db/schema.ts) | `id` | `store_id -> stores.id`, `shift_id -> shifts.id`, `rule_version_id -> attendance_rules.id` | `employee_email` (partial: `closed_at IS NULL`) | `attendance_session_revision_guard`, `attendance_revision_insert`, `attendance_revision_update`, `attendance_revision_delete` |
| 8 | `attendance_events` | [`db/schema.ts#L122`](../../db/schema.ts) | `id` | `session_id -> attendance_sessions.id`, `capture_session_id -> attendance_capture_sessions.id` | `idempotency_key`, `capture_session_id`, `(session_id, action)` | Không |
| 9 | `attendance_locations` | [`db/schema.ts#L140`](../../db/schema.ts) | `event_id` | `event_id -> attendance_events.id` | `event_id` (PK) | Không |
| 10 | `attendance_photos` | [`db/schema.ts#L152`](../../db/schema.ts) | `event_id` | `event_id -> attendance_events.id` | `event_id` (PK) | Không |
| 11 | `attendance_exceptions` | [`db/schema.ts#L163`](../../db/schema.ts) | `id` | `event_id -> attendance_events.id` | `event_id` | Không |
| 12 | `payroll_periods` | [`db/schema.ts#L177`](../../db/schema.ts) | `id` | `store_id -> stores.id` | `(store_id, period_start, period_end)` | Target của `shifts_locked_period_insert` |
| 13 | `payroll_entries` | [`db/schema.ts#L193`](../../db/schema.ts) | `id` | `payroll_period_id -> payroll_periods.id` | `(payroll_period_id, employee_email)` | Không |
| 14 | `attendance_action_limits` | [`db/schema.ts#L212`](../../db/schema.ts) | `id` | Không | Không | Không |
| 15 | `checklist_items` | [`db/schema.ts#L219`](../../db/schema.ts) | `id` | `store_id -> stores.id` | Không | Không |
| 16 | `checklist_executions` | [`db/schema.ts#L230`](../../db/schema.ts) | `(item_id, business_date)` | `item_id -> checklist_items.id` | Composite PK | Không |
| 17 | `incidents` | [`db/schema.ts#L239`](../../db/schema.ts) | `id` | `store_id -> stores.id` | Không | Không |
| 18 | `handovers` | [`db/schema.ts#L251`](../../db/schema.ts) | `id` | `store_id -> stores.id` | Không | Không |
| 19 | `requests` | [`db/schema.ts#L261`](../../db/schema.ts) | `id` | `store_id -> stores.id`, `shift_id -> shifts.id` | `(employee_email, client_request_key)` | Không |
| 20 | `notifications` | [`db/schema.ts#L281`](../../db/schema.ts) | `id` | Không | Không | Không |
| 21 | `audit_events` | [`db/schema.ts#L293`](../../db/schema.ts) | `id` | Không (unconstrained `store_id`) | Không | Cổng kiểm soát cho batch writes |
| 22 | `menu_categories` | [`db/schema.ts#L304`](../../db/schema.ts) | `id` | `store_id -> stores.id` | Không | Không |
| 23 | `menu_items` | [`db/schema.ts#L317`](../../db/schema.ts) | `id` | `store_id -> stores.id`, `category_id -> menu_categories.id` | Không | Không |
| 24 | `menu_options` | [`db/schema.ts#L340`](../../db/schema.ts) | `id` | `store_id -> stores.id` | Không | Không |
| 25 | `customer_orders` | [`db/schema.ts#L355`](../../db/schema.ts) | `id` | `store_id -> stores.id` | `order_code`, `(store_id, receipt_token_hash)`, `(store_id, submission_key)` | Không |
| 26 | `order_items` | [`db/schema.ts#L379`](../../db/schema.ts) | `id` | `order_id -> customer_orders.id` | Không | Không |
| 27 | `order_status_history` | [`db/schema.ts#L397`](../../db/schema.ts) | `id` | `order_id -> customer_orders.id` | Không | Không |
| 28 | `store_ordering_settings` | [`db/schema.ts#L410`](../../db/schema.ts) | `id` | `store_id -> stores.id` | `store_id` | Không |
| 29 | `order_rate_limits` | [`db/schema.ts#L421`](../../db/schema.ts) | `bucket_key` | Không | `bucket_key` (PK) | Không |
| 30 | `attendance_corrections` | [`db/schema.ts#L427`](../../db/schema.ts) | `id` | `session_id -> attendance_sessions.id`, `event_id -> attendance_events.id` | Không | `attendance_corrections_immutable_update`, `attendance_corrections_immutable_delete` |
| 31 | `payroll_adjustments` | [`db/schema.ts#L439`](../../db/schema.ts) | `id` | `store_id -> stores.id` | Không | `payroll_adjustments_immutable_update`, `payroll_adjustments_immutable_delete`, `payroll_adjustments_revision` |

---

## 4. Checklist Kiểm Tra Toàn Diện

| Hạng mục kiểm tra | Trạng thái | Bằng chứng thực tế & Đánh giá |
|---|---|---|
| **1. Toàn vẹn chuỗi Migration (0000 -> 0013)** | **PASS** | `_journal.json` chứa đầy đủ 14 entries tương ứng với 14 file `.sql`, mỗi snapshot JSON trỏ đúng `prevId` của snapshot trước ([`tests/architecture-boundaries.test.mjs#L40-L51`](../../tests/architecture-boundaries.test.mjs)). |
| **2. Đồng bộ Schema.ts và SQL Migrations** | **FAIL** | Có 5 cột bị lệch thuộc tính `NOT NULL` và 2 cột bị lệch `DEFAULT` do SQLite `ALTER TABLE ADD COLUMN` ([Chi tiết DB-001](#db-001)). |
| **3. Cú pháp tương thích Drizzle Migrator** | **FAIL** | Migration `0011` và `0013` thiếu `--> statement-breakpoint`, gây lỗi nếu chạy qua migrator tự động ([Chi tiết DB-002](#db-002)). |
| **4. Foreign Keys Enforcement & Cascades** | **FAIL** | 31/32 FK có `ON DELETE NO ACTION`. Thực thể `employees` hoàn toàn không có bảng nào trỏ FK vào; xóa/sửa email gây mồ côi dữ liệu ([Chi tiết DB-008](#db-008)). |
| **5. Phân biệt chữ hoa/thường (Case Sensitivity) của Unique Index** | **FAIL** | `employees_email_idx` không có `COLLATE NOCASE`, cho phép chèn tài khoản trùng email khác chữ hoa/thường ([Chi tiết DB-003](#db-003)). |
| **6. Hiệu năng Index (Full Table Scan Detection)** | **FAIL** | Câu lệnh xác thực tài khoản, đọc thông báo, kiểm tra ca overlap và cron retention đều bị `SCAN` toàn bảng do thiếu index hoặc dùng hàm trên cột index ([Chi tiết DB-003](#db-003), [DB-005](#db-005), [DB-006](#db-006)). |
| **7. Check Constraints & Invariants** | **FAIL** | 28/31 bảng không có CHECK constraints. Ca làm việc có thể kết thúc trước khi bắt đầu; tiền tệ và số lượng có thể nhận giá trị âm ([Chi tiết DB-007](#db-007)). |
| **8. Transaction Atomicity & D1 Batch** | **PASS** | Sử dụng mẫu kiến trúc SQLite gating rất chặt chẽ: `WHERE changes() = 1` kết hợp audit event gating (`WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = commandId)`) ngăn chặn partial writes thành công. |
| **9. Chống Race Conditions & Overlap Ca làm việc** | **PASS** | Trigger `shifts_no_overlap_insert` và `shifts_no_overlap_update` chặn đứng việc xếp trùng ca cùng một thời điểm. Trigger `attendance_session_revision_guard` chặn cập nhật stale revision. |
| **10. Tính nhất quán Chấm công & Phiên mở** | **PASS** | Index cục bộ `active_attendance_session_employee_idx` chặn hoàn toàn việc một nhân viên mở đồng thời 2 phiên check-in khi phiên trước chưa đóng (`closed_at IS NULL`). |
| **11. Bảo toàn lịch sử giá và Snapshot đơn hàng** | **PASS** | `order_items` lưu snapshot đầy đủ `unit_price`, `subtotal`, `toppings_json`. Thay đổi giá thực đơn hay xóa món không làm biến dạng đơn hàng cũ. |
| **12. Khóa kỳ lương & Bảo toàn mức lương lịch sử** | **FAIL** | Kỳ lương đã khóa được bảo vệ tốt, nhưng khi Chủ quán mở lại kỳ lương (`reopen`), hệ thống tính toán lại lương theo `hourly_rate` hiện tại thay vì mức lương lịch sử ([Chi tiết DB-004](#db-004)). |
| **13. Độ chính xác Tiền tệ (Monetary Precision)** | **PASS** | 100% cột tiền tệ được định nghĩa `integer` (VND nguyên bản), không có sai số floating-point. |
| **14. Chuẩn hóa Múi giờ (Asia/Ho_Chi_Minh vs UTC)** | **PASS** | Lưu trữ thống nhất ISO 8601 UTC timestamp ở database, chuyển đổi hiển thị sang GMT+7 tại biên ứng dụng. |
| **15. Bảo vệ Dữ liệu Nhạy cảm (PII & Audit Privacy)** | **PASS** | Bảng `audit_events` chỉ ghi metadata phân loại nghiệp vụ, không ghi mật khẩu, không ghi raw bytes hình ảnh hay tọa độ GPS thô. |

---

## 5. Danh Sách Findings Chi Tiết (DB-001 -> DB-011)

### DB-001
- **Tên Finding**: Lệch thuộc tính `NOT NULL` và `DEFAULT` giữa Drizzle Schema và chuỗi Migrations
- **Mức độ & Độ tin cậy**: `P0 (CRITICAL)` | `CONFIRMED`
- **Module**: `Database / Schema Synchronization`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L15`](../../db/schema.ts), [`db/schema.ts#L83`](../../db/schema.ts), [`db/schema.ts#L94`](../../db/schema.ts), [`db/schema.ts#L132`](../../db/schema.ts), [`db/schema.ts#L157`](../../db/schema.ts), [`db/schema.ts#L227`](../../db/schema.ts), [`db/schema.ts#L248`](../../db/schema.ts)
  - [`drizzle/0001_eager_peter_parker.sql#L83-L98`](../../drizzle/0001_eager_peter_parker.sql)
- **Root cause**: SQLite giới hạn câu lệnh `ALTER TABLE ADD COLUMN`: không được phép thêm cột có ràng buộc `NOT NULL` mà không có giá trị default. Trong migration `0001_eager_peter_parker.sql`, các cột được thêm bằng cú pháp `ALTER TABLE ... ADD <col> text;` (tức `NULLABLE`). Trong khi đó, file `db/schema.ts` lại khai báo `.notNull()`.
- **Evidence (Bằng chứng so sánh qua PRAGMA table_info)**:
  ```
  attendance_capture_sessions.nonce_hash: schema.notNull=true, db.notnull=false
  checklist_items.updated_at:             schema.notNull=true, db.notnull=false
  incidents.updated_at:                   schema.notNull=true, db.notnull=false
  shifts.created_at:                      schema.notNull=true, db.notnull=false
  stores.updated_at:                      schema.notNull=true, db.notnull=false
  attendance_events.photo_status:         schema.hasDefault=false, db.dflt_value='unavailable'
  attendance_photos.sha256:               schema.hasDefault=false, db.dflt_value=''
  ```
- **Expected vs Actual**:
  - *Expected*: Định nghĩa trong `db/schema.ts` và database vật lý phải hoàn toàn khớp nhau về nullability và default value.
  - *Actual*: TypeScript suy luận kiểu dữ liệu là non-null (`string`), nhưng database thực tế chấp nhận giá trị `NULL`.
- **Business impact**: Ứng dụng có thể gặp lỗi `TypeError: Cannot read properties of null` ở runtime khi đọc các cột mà TypeScript cho là luôn có giá trị. Nếu chạy `drizzle-kit generate`, Drizzle sẽ liên tục phát hiện schema drift và cố tạo migration sửa đổi.
- **Proposed remediation**:
  1. Đồng bộ `db/schema.ts`: đối với `attendance_events.photoStatus`, thêm `.default("unavailable")`; đối với `attendance_photos.sha256`, thêm `.default("")`.
  2. Tạo migration bổ sung (migration `0014`) sử dụng kỹ thuật table recreation an toàn của SQLite (`__new_table` copy data) để áp đặt đúng ràng buộc `NOT NULL` cho 5 cột trên, hoặc cập nhật schema tạm thời để phản ánh đúng thực tế nullable cho đến khi có migration chuẩn.
- **Acceptance criteria & Regression test**: Chạy lại script đối soát schema không còn phát hiện bất kỳ dòng `NOTNULL MISMATCH` hay `DEFAULT MISMATCH` nào.

---

### DB-002
- **Tên Finding**: Thiếu ký hiệu phân tách câu lệnh (`--> statement-breakpoint`) trong migrations `0011` và `0013`
- **Mức độ & Độ tin cậy**: `P0 (CRITICAL)` | `CONFIRMED`
- **Module**: `Database / Migrations Engine`
- **File & Dòng liên quan**:
  - [`drizzle/0011_workforce_integrity.sql#L1-L70`](../../drizzle/0011_workforce_integrity.sql)
  - [`drizzle/0013_workforce_guardrails.sql#L1-L9`](../../drizzle/0013_workforce_guardrails.sql)
- **Root cause**: Drizzle ORM không có API khai báo SQLite Triggers trong TypeScript schema, do đó các triggers kiểm soát workforce và ca làm việc được lập trình viên viết trực tiếp bằng tay vào các file migration `0011` và `0013`. Người viết đã không chèn comment `--> statement-breakpoint` giữa các câu lệnh như các file migration chuẩn do Drizzle Kit sinh ra (`0000`, `0001`, `0008`, `0010`, `0012`).
- **Evidence**:
  Kiểm tra nội dung `0011_workforce_integrity.sql`:
  ```sql
  ALTER TABLE stores ADD workforce_revision integer NOT NULL DEFAULT 0;
  ALTER TABLE attendance_sessions ADD revision integer NOT NULL DEFAULT 0;
  ...
  CREATE TRIGGER attendance_session_revision_guard ... BEGIN SELECT RAISE(ABORT, 'attendance_conflict'); END;
  ```
  Không có bất kỳ chuỗi `--> statement-breakpoint` nào trong toàn bộ 70 dòng.
- **Expected vs Actual**:
  - *Expected*: Mọi file migration phải tuân thủ chuẩn của Drizzle Migrator để có thể chạy tự động trong CI/CD hoặc production qua `drizzle-orm/migrator`.
  - *Actual*: Drizzle Migrator đọc cả file `0011` như một câu lệnh duy nhất và báo lỗi; nếu dùng bộ parser cắt theo dấu `;`, câu lệnh trigger sẽ bị cắt đứt ở giữa (`BEGIN SELECT ...;` và `END;`), gây lỗi cú pháp nghiêm trọng.
- **Business impact**: Ngăn cản việc triển khai migration tự động lên môi trường D1 production hoặc staging khi sử dụng Drizzle SDK migration runner.
- **Proposed remediation**: Bổ sung `--> statement-breakpoint` vào giữa các câu lệnh trong `0011_workforce_integrity.sql` và `0013_workforce_guardrails.sql`, đảm bảo toàn bộ block `CREATE TRIGGER ... BEGIN ... END;` nằm trọn vẹn trong một breakpoint duy nhất.
- **Acceptance criteria & Regression test**: Viết test suite giả lập chạy migration bằng `drizzle-orm/migrator` trên SQLite memory database mà không phát sinh lỗi parse.

---

### DB-003
- **Tên Finding**: `employees_email_idx` không có `COLLATE NOCASE` gây Full Table Scan và cho phép tạo tài khoản trùng email
- **Mức độ & Độ tin cậy**: `P1 (HIGH)` | `CONFIRMED`
- **Module**: `Identity & Performance`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L42`](../../db/schema.ts)
  - [`server/auth.ts#L49`](../../server/auth.ts)
  - [`server/audit.ts#L15`](../../server/audit.ts)
  - [`app/api/notifications/route.ts#L12`](../../app/api/notifications/route.ts)
- **Root cause**: Trong SQLite, so sánh chuỗi mặc định là case-sensitive. Unique index `employees_email_idx` được tạo trên `email` mà không có `COLLATE NOCASE`. Do đó, `john@example.com` và `JOHN@EXAMPLE.COM` được coi là 2 giá trị khác nhau. Để giải quyết, tầng application lại bọc hàm `WHERE lower(email) = lower(?)`. Tuy nhiên, trong SQLite, việc áp dụng hàm `lower()` lên cột index sẽ làm vô hiệu hóa B-tree index, buộc SQLite phải scan toàn bộ bảng.
- **Evidence (Kiểm chứng thực nghiệm)**:
  1. *Cho phép chèn email trùng lặp*:
     ```js
     db.sqlite.prepare("INSERT INTO employees ... VALUES (?, 'john@example.com', ...)").run();
     db.sqlite.prepare("INSERT INTO employees ... VALUES (?, 'JOHN@EXAMPLE.COM', ...)").run();
     // Kết quả: SUCCESS: Case-variant duplicate email allowed! Không có lỗi UNIQUE constraint!
     ```
  2. *Query Plan của Auth và Notification*:
     ```
     EXPLAIN QUERY PLAN SELECT id FROM employees WHERE lower(email) = lower(?)
     -> detail: 'SCAN employees' (Full Table Scan!)

     EXPLAIN QUERY PLAN SELECT id FROM notifications WHERE lower(recipient_email) = lower(?)
     -> detail: 'SCAN notifications'
     -> detail: 'USE TEMP B-TREE FOR ORDER BY' (Full Table Scan + In-memory Sort!)
     ```
- **Expected vs Actual**:
  - *Expected*: Email là định danh duy nhất không phân biệt hoa thường. Mọi truy vấn xác thực người dùng phải dùng index point lookup `SEARCH employees USING INDEX`.
  - *Actual*: DB cho phép tạo tài khoản trùng email; mọi request có xác thực đều scan toàn bộ bảng nhân viên.
- **Business impact**:
  - Phá vỡ logic audit log: Tại [`server/audit.ts#L15`](../../server/audit.ts), subquery `(SELECT MIN(store_id) FROM employees WHERE lower(email) = lower(?) HAVING COUNT(*) = 1)` sẽ trả về `NULL` khi có 2 tài khoản trùng email, khiến audit event bị mất gán cửa hàng (`store_id = NULL`) và biến mất khỏi trang quản trị của Chủ quán.
  - Hiệu năng D1 bị suy giảm nghiêm trọng khi số lượng nhân viên và thông báo tăng lên.
- **Proposed remediation**:
  1. Thay đổi định nghĩa cột email trong `db/schema.ts` thành `text("email").notNull()` với unique index biểu thức hoặc `COLLATE NOCASE`: `uniqueIndex("employees_email_nocase_idx").on(sql`lower(${table.email})`)` hoặc đổi schema cột sang `COLLATE NOCASE`.
  2. Chuẩn hóa email luôn chuyển về `.toLowerCase().trim()` trước khi ghi vào database tại tất cả các endpoints.
- **Acceptance criteria & Regression test**: Chạy `EXPLAIN QUERY PLAN` xác nhận SQLite trả về `SEARCH employees USING INDEX` thay vì `SCAN employees`. Kiểm tra cố tình chèn email chữ hoa và chữ thường bị chặn bởi `UNIQUE constraint failed`.

---

### DB-004
- **Tên Finding**: Thiếu lịch sử mức lương (`Wage History`) — Mở lại kỳ lương tính lại theo mức lương hiện tại
- **Mức độ & Độ tin cậy**: `P1 (HIGH)` | `CONFIRMED`
- **Module**: `Payroll / Financial Integrity`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L36`](../../db/schema.ts)
  - [`modules/payroll/application/load-report.ts#L211`](../../modules/payroll/application/load-report.ts)
  - [`modules/payroll/application/change-period.ts#L18`](../../modules/payroll/application/change-period.ts)
- **Root cause**: Bảng `employees` chỉ lưu mức lương hiện tại (`hourly_rate`) dưới dạng một cột mutable đơn lẻ. Khi kỳ lương chuyển sang trạng thái `finalized`, dữ liệu được đóng băng vào `payroll_entries.row_snapshot`. Tuy nhiên, nếu Chủ quán dùng chức năng `reopen` để mở lại kỳ lương, trạng thái quay về `reviewing`, và `loadPayrollReport` sẽ tính lại lương dựa trên `employees.hourly_rate` ở thời điểm hiện tại thay vì mức lương có hiệu lực trong kỳ lương đó.
- **Evidence (Kiểm chứng thực nghiệm)**:
  ```js
  // Tháng 7: Nhân viên làm 8 giờ, mức lương 25.000đ/giờ -> Chốt kỳ lương: 200.000đ
  await changePayrollPeriod(db, owner, "finalize", "2026-07");
  // Ngày 1/8: Nhân viên được nâng lương lên 35.000đ/giờ
  db.sqlite.prepare("UPDATE employees SET hourly_rate = 35000 WHERE id = 'staff'").run();
  // Chủ quán mở lại kỳ tháng 7 để điều chỉnh
  await changePayrollPeriod(db, owner, "reopen", "2026-07");
  const report = await loadPayrollReport(db, { periodKey: "2026-07", ... });
  // Kết quả: report.rows[0].totalSalary nhảy vọt lên 280.000đ!
  ```
- **Expected vs Actual**:
  - *Expected*: Tiền lương của tháng 7 phải được tính theo đơn giá 25.000đ/giờ có hiệu lực trong tháng 7, bất kể sau đó nhân viên được tăng hay giảm lương.
  - *Actual*: Mở lại kỳ lương làm thay đổi toàn bộ số tiền lương dĩ vãng của nhân viên, gây sai lệch số liệu kế toán và ngân sách.
- **Business impact**: Sai lệch số tiền chi trả lương; vi phạm cam kết nghiệp vụ trong `AGENTS.md`: "tính toán minh bạch từ dữ liệu công và mức lương theo hiệu lực; không tự ý sửa dữ liệu của kỳ đã chốt".
- **Proposed remediation**:
  1. Bổ sung bảng `employee_wage_rates` (`id`, `employee_email`, `hourly_rate`, `effective_from`, `effective_to`).
  2. Trong `loadPayrollReport`, tính lương bằng cách join với mức lương có `effective_from <= session_date AND (effective_to IS NULL OR effective_to > session_date)`.
  3. Hoặc khi `reopen`, giữ nguyên snapshot đơn giá đã chốt từ `payroll_entries.row_snapshot` làm base rate thay vì đọc lại bảng `employees`.
- **Acceptance criteria & Regression test**: Test kiểm tra: tạo nhân viên lương 25k -> finalize tháng 7 -> update lương 35k -> reopen tháng 7 -> kiểm tra số tiền tháng 7 vẫn phải là 200.000đ.

---

### DB-005
- **Tên Finding**: Bảng `customer_orders` thiếu Index `(store_id, created_at)` gây quét toàn bộ đơn và Sort Temp B-Tree
- **Mức độ & Độ tin cậy**: `P1 (HIGH)` | `CONFIRMED`
- **Module**: `Ordering / Performance`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L371-L377`](../../db/schema.ts)
  - [`app/api/owner/orders/route.ts#L73-L92`](../../app/api/owner/orders/route.ts)
- **Root cause**: Bảng `customer_orders` chỉ có composite index:
  `index("customer_orders_store_status_idx").on(table.storeId, table.status, table.createdAt)`.
  Khi xem toàn bộ đơn hàng (không lọc status hoặc status="all"), câu lệnh query là:
  `SELECT ... FROM customer_orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 150`.
  Vì `status` nằm ở giữa composite index, SQLite không thể dùng `created_at` trong index này để sort.
- **Evidence (Query Plan thực tế)**:
  ```
  EXPLAIN QUERY PLAN SELECT id FROM customer_orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 150
  -> detail: 'SEARCH customer_orders USING INDEX customer_orders_store_submission_idx (store_id=?)'
  -> detail: 'USE TEMP B-TREE FOR ORDER BY'
  ```
- **Expected vs Actual**:
  - *Expected*: Truy vấn danh sách đơn hàng mới nhất của quán phải đọc trực tiếp từ B-Tree index theo chiều `created_at DESC` không tốn chi phí sort in-memory.
  - *Actual*: SQLite phải load toàn bộ các đơn hàng của quán vào bộ nhớ tạm để thực hiện sort `ORDER BY created_at DESC`.
- **Business impact**: Giao diện quản lý đơn hàng của Chủ quán/Thu ngân thực hiện polling định kỳ mỗi vài giây để cập nhật đơn mới. Việc sort in-memory liên tục sẽ làm D1 bị lag, tăng latency phản hồi và tăng CPU cost của Worker.
- **Proposed remediation**: Thêm index:
  `index("customer_orders_store_created_idx").on(table.storeId, table.createdAt)`.
- **Acceptance criteria & Regression test**: `EXPLAIN QUERY PLAN` trên câu lệnh lấy đơn hàng theo `store_id` trả về `SEARCH customer_orders USING INDEX customer_orders_store_created_idx` mà không có `USE TEMP B-TREE FOR ORDER BY`.

---

### DB-006
- **Tên Finding**: Bảng `attendance_photos` và `attendance_locations` thiếu Index `expires_at` phục vụ Cron Retention
- **Mức độ & Độ tin cậy**: `P1 (HIGH)` | `CONFIRMED`
- **Module**: `Attendance / Storage Retention`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L140-L161`](../../db/schema.ts)
  - [`modules/attendance/application/expire-evidence.ts#L10-L11`](../../modules/attendance/application/expire-evidence.ts), [`#L50-L51`](../../modules/attendance/application/expire-evidence.ts)
- **Root cause**: Hai bảng lưu dữ liệu bằng chứng chỉ có duy nhất Primary Key trên `event_id`, hoàn toàn không có index phụ nào trên cột ngày hết hạn (`expires_at`).
- **Evidence (Query Plan thực tế)**:
  ```
  EXPLAIN QUERY PLAN SELECT event_id FROM attendance_photos WHERE expires_at <= ? OR deleted_at IS NOT NULL ORDER BY expires_at LIMIT 100
  -> detail: 'SCAN attendance_photos'
  -> detail: 'USE TEMP B-TREE FOR ORDER BY'

  EXPLAIN QUERY PLAN SELECT event_id FROM attendance_locations WHERE expires_at <= ? OR deleted_at IS NOT NULL ORDER BY expires_at LIMIT 200
  -> detail: 'SCAN attendance_locations'
  -> detail: 'USE TEMP B-TREE FOR ORDER BY'
  ```
- **Expected vs Actual**:
  - *Expected*: Cron job dọn dẹp ảnh và tọa độ quá hạn 90 ngày phải dùng index range scan để lấy nhanh 100-200 bản ghi cần xóa.
  - *Actual*: Quét toàn bộ bảng (Full Table Scan) và sort toàn bộ ảnh chụp chấm công tích lũy trong lịch sử.
- **Business impact**: Mỗi lần cron chạy sẽ đọc qua toàn bộ dữ liệu ảnh/vị trí của cửa hàng, làm tăng đột biến số lượng D1 read units tính phí và có nguy cơ timeout Worker khi dữ liệu lớn.
- **Proposed remediation**: Thêm index:
  `index("attendance_photos_expires_idx").on(table.expiresAt)` và `index("attendance_locations_expires_idx").on(table.expiresAt)`.
- **Acceptance criteria & Regression test**: `EXPLAIN QUERY PLAN` trên câu lệnh quét retention sử dụng index trực tiếp, không xuất hiện `SCAN` hay `USE TEMP B-TREE`.

---

### DB-007
- **Tên Finding**: Thiếu CHECK Constraints ở mức Database cho Domain Invariants quan trọng
- **Mức độ & Độ tin cậy**: `P2 (MEDIUM)` | `CONFIRMED`
- **Module**: `Database / Data Integrity`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L71-L87`](../../db/schema.ts), [`db/schema.ts#L177-L208`](../../db/schema.ts), [`db/schema.ts#L317-L386`](../../db/schema.ts)
- **Root cause**: Trong số 31 bảng, chỉ có 3 bảng có CHECK constraints. Các bảng cốt lõi khác không có constraint chặn dữ liệu bất thường ở tầng database.
- **Evidence (Kiểm chứng thực nghiệm)**:
  1. *Chèn ca làm việc có thời gian đảo ngược*:
     ```js
     db.sqlite.prepare("INSERT INTO shifts ... VALUES (..., '2026-07-01T10:00:00Z', '2026-07-01T08:00:00Z', ...)").run();
     // Kết quả: SUCCESS: Shift with ends_at < starts_at inserted into DB without error!
     ```
  2. Khi ca có `ends_at < starts_at`, trigger chống trùng ca `shifts_no_overlap_insert` bị vô hiệu hóa vì điều kiện `starts_at < NEW.ends_at` không còn đúng.
  3. Không có constraint kiểm tra: `total_amount >= 0`, `quantity > 0`, `unit_price >= 0`, `hourly_rate >= 0`, `period_end > period_start`.
- **Expected vs Actual**:
  - *Expected*: Database là tuyến phòng thủ dữ liệu cuối cùng, phải tự bảo vệ tính toàn vẹn độc lập với logic application.
  - *Actual*: Dữ liệu sai lệch logic có thể lọt vào database nếu tầng application có lỗ hổng hoặc khi chạy seed/admin script.
- **Business impact**: Rủi ro phát sinh đơn hàng có số tiền âm, ca làm việc bị đảo ngược thời gian làm hỏng thuật toán tính công và báo cáo bảng lương.
- **Proposed remediation**: Bổ sung `check()` constraints trong `db/schema.ts` cho:
  - `shifts`: `check("shifts_time_check", sql`${table.endsAt} > ${table.startsAt}`)`
  - `customer_orders`: `check("orders_total_check", sql`${table.totalAmount} >= 0`)`
  - `order_items`: `check("order_items_positive_check", sql`${table.quantity} > 0 AND ${table.unitPrice} >= 0`)`
  - `payroll_periods`: `check("payroll_periods_range_check", sql`${table.periodEnd} > ${table.periodStart}`)`
- **Acceptance criteria & Regression test**: Test cố tình insert ca làm việc có `ends_at <= starts_at` hoặc đơn hàng có `total_amount < 0` bị SQLite từ chối với lỗi `CHECK constraint failed`.

---

### DB-008
- **Tên Finding**: Thực thể Nhân sự không được tham chiếu bằng Foreign Key (`Orphan Risk` khi đổi Email)
- **Mức độ & Độ tin cậy**: `P2 (MEDIUM)` | `CONFIRMED`
- **Module**: `People & Relational Integrity`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L18-L44`](../../db/schema.ts)
  - [`db/schema.ts#L76`](../../db/schema.ts), [`#L103`](../../db/schema.ts), [`#L126`](../../db/schema.ts), [`#L196`](../../db/schema.ts), [`#L268`](../../db/schema.ts)
- **Root cause**: Bảng `employees` có khóa chính `id`, nhưng không có bất kỳ bảng con nào thiết lập Foreign Key trỏ vào `employees.id`. Toàn bộ hệ thống liên kết nhân viên qua trường văn bản `employee_email`.
- **Evidence**:
  Kiểm tra danh mục khóa ngoại bằng script:
  ```
  Table employees has 1 FKs in DB (employees.store_id -> stores.id)
  Zero foreign keys reference employees(id) or employees(email)!
  ```
- **Expected vs Actual**:
  - *Expected*: Bảng con phải liên kết chặt chẽ với bảng cha thông qua khóa ngoại có tính toàn vẹn tham chiếu (Referential Integrity).
  - *Actual*: Mọi liên kết là chuỗi text tự do, không có foreign key bảo vệ.
- **Business impact**: Không thể hỗ trợ tính năng cập nhật email cho nhân viên (ví dụ khi sửa lỗi chính tả email hoặc nhân viên đổi email); nếu email bị sửa ở bảng `employees`, toàn bộ ca làm, chấm công, bảng lương cũ sẽ bị mồ côi (orphaned).
- **Proposed remediation**:
  Trong giai đoạn MVP, duy trì email làm liên kết nhưng bổ sung `ON UPDATE CASCADE` foreign key từ các bảng nghiệp vụ trỏ tới `employees.email`, hoặc trong kiến trúc dài hạn chuẩn hóa dùng `employee_id` làm khóa ngoại.
- **Acceptance criteria & Regression test**: Kiểm tra tính toàn vẹn tham chiếu không cho phép tạo ca làm việc hay chấm công cho một email không tồn tại trong bảng `employees`.

---

### DB-009
- **Tên Finding**: Rate Limiting thực hiện 3 thao tác ghi D1 trên mỗi request tra cứu đơn hàng của khách
- **Mức độ & Độ tin cậy**: `P2 (MEDIUM)` | `CONFIRMED`
- **Module**: `Ordering / Rate Limiting`
- **File & Dòng liên quan**:
  - [`modules/ordering/application/rate-limit.ts#L11-L17`](../../modules/ordering/application/rate-limit.ts)
  - [`db/schema.ts#L421-L425`](../../db/schema.ts)
- **Root cause**: Hệ thống sử dụng bảng D1 `order_rate_limits` để kiểm soát tần suất request của khách hàng. Mỗi lần khách gọi API tra cứu đơn hàng ([`trackOrder`](../../modules/ordering/application/track-order.ts)), hàm `limitOrderRequests` thực thi một `db.batch` gồm 1 lệnh `DELETE` các bucket cũ và 2 lệnh `INSERT ... ON CONFLICT DO UPDATE`.
- **Evidence**:
  ```ts
  const results = await db.batch([
    db.prepare("DELETE FROM order_rate_limits WHERE expires_at < ?").bind(now),
    ...keys.map(bucketKey => db.prepare(
      `INSERT INTO order_rate_limits (bucket_key, request_count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1 RETURNING request_count`,
    ).bind(bucketKey, (bucket + 2) * 60000)),
  ]);
  ```
- **Expected vs Actual**:
  - *Expected*: Thao tác tra cứu đơn hàng là hành vi đọc thuần túy (Read-only), không nên tạo áp lực ghi liên tục lên database chính.
  - *Actual*: Mỗi lượt xem đơn hàng phát sinh 3 câu lệnh ghi vào Cloudflare D1.
- **Business impact**: Cloudflare D1 đồng bộ các câu lệnh ghi thông qua SQLite coordinator trung tâm. Việc ghi liên tục trên các request tra cứu công khai có thể làm nghẽn hàng đợi ghi của D1, ảnh hưởng đến các thao tác quan trọng hơn như thanh toán hay chấm công.
- **Proposed remediation**:
  - Chuyển cơ chế rate limit sang Cloudflare KV, Workers Cache API, hoặc Workers Rate Limiting binding.
  - Tách lệnh `DELETE` dọn dẹp bucket hết hạn ra khỏi luồng request chính (chạy định kỳ thay vì chạy trên mỗi request).
- **Acceptance criteria & Regression test**: Request tra cứu đơn hàng không thực thi câu lệnh DELETE dọn dẹp trên D1.

---

### DB-010
- **Tên Finding**: Drizzle ORM chưa được sử dụng làm Runtime Query Builder trong Application Code
- **Mức độ & Độ tin cậy**: `P3 (LOW)` | `CONFIRMED`
- **Module**: `Architecture / Data Access Layer`
- **File & Dòng liên quan**:
  - [`db/index.ts#L1-L8`](../../db/index.ts)
  - [`db/runtime.ts#L19-L21`](../../db/runtime.ts)
- **Root cause**: Hàm `getDb()` khởi tạo `drizzle(getDatabaseBinding(), { schema })` có tồn tại trong `db/index.ts`, nhưng không được import hoặc sử dụng bởi bất kỳ API route hay module nào. Tất cả các file trong `app/api/` và `modules/` đều import `ensureDatabase()` trả về raw `D1Database` và gọi `db.prepare("SELECT ...")`.
- **Evidence**:
  Tìm kiếm toàn bộ codebase không có bất kỳ lệnh gọi `getDb()` hay các query builder methods của Drizzle (`db.select()`, `db.insert()`, `db.update()`). Drizzle ORM hiện chỉ đóng vai trò định nghĩa schema và sinh migrations qua Drizzle Kit.
- **Expected vs Actual**:
  - *Expected*: Drizzle ORM cung cấp type-safe queries ở compile-time để bắt lỗi đổi tên cột ngay khi code.
  - *Actual*: Toàn bộ truy vấn là raw SQL text strings với placeholder `?`.
- **Business impact**: Nếu cấu trúc bảng thay đổi, TypeScript không thể cảnh báo các câu lệnh SQL bị sai tên cột, tăng nguy cơ phát sinh runtime SQL errors.
- **Proposed remediation**:
  - Giữ nguyên kiến trúc hiện tại cho giai đoạn audit/ổn định.
  - Lập kế hoạch lộ trình (roadmap) chuyển dần các truy vấn phức tạp sang Drizzle query builder có kiểm soát type an toàn.
- **Acceptance criteria & Regression test**: Typecheck xác nhận không có import `getDb()` bị lỗi mồ côi.

---

### DB-011
- **Tên Finding**: Cột thừa `checklist_items.completed` và `completed_at` bị mất đồng bộ sau khi tách bảng Daily Execution
- **Mức độ & Độ tin cậy**: `P3 (LOW)` | `CONFIRMED`
- **Module**: `Operations / Checklists`
- **File & Dòng liên quan**:
  - [`db/schema.ts#L225-L226`](../../db/schema.ts)
  - [`drizzle/0012_daily_checklists.sql#L1-L16`](../../drizzle/0012_daily_checklists.sql)
  - [`app/api/checklists/route.ts#L64-L79`](../../app/api/checklists/route.ts)
- **Root cause**: Migration `0012` bổ sung bảng `checklist_executions` để theo dõi tiến độ checklist theo ngày nghiệp vụ (`business_date`). Khi người dùng check hoàn thành, hệ thống ghi vào `checklist_executions` mà không cập nhật hai cột `completed` và `completed_at` trên bảng `checklist_items`.
- **Evidence**:
  Tại [`app/api/checklists/route.ts#L66`](../../app/api/checklists/route.ts), chỉ có `INSERT INTO checklist_executions ... ON CONFLICT DO UPDATE`. Hai cột cũ trên `checklist_items` giữ nguyên giá trị khởi tạo ban đầu (`completed = 0, completed_at = NULL`).
- **Expected vs Actual**:
  - *Expected*: Bảng danh mục checklist không nên lưu trạng thái thực thi hàng ngày hoặc nếu lưu thì phải phản ánh đúng dữ liệu.
  - *Actual*: Dữ liệu trên 2 cột cũ bị đóng băng và hoàn toàn không đồng bộ với thực tế.
- **Business impact**: Gây nhầm lẫn cho các truy vấn báo cáo trong tương lai nếu người viết query đọc nhầm từ `checklist_items.completed` thay vì join với `checklist_executions`.
- **Proposed remediation**:
  Đánh dấu `@deprecated` trong `db/schema.ts` cho 2 trường này, và lên kế hoạch tạo migration dọn dẹp các cột dư thừa sau khi đảm bảo không còn code phụ thuộc.
- **Acceptance criteria & Regression test**: Toàn bộ UI và báo cáo checklist chỉ đọc trạng thái hoàn thành từ `checklist_executions`.

---

## 6. Bảng Ưu Tiên Xử Lý (Actionable Priority Matrix)

| Priority | Finding ID | Tên vấn đề | Độ khó (Effort) | Rủi ro hồi quy (Regression Risk) | Đề xuất giải pháp tối thiểu |
|---|---|---|---|---|---|
| **P0** | **DB-001** | Lệch `NOT NULL` và `DEFAULT` giữa Schema và Migrations | Thấp | Rất thấp | Cập nhật `db/schema.ts` thêm `.default()` cho photoStatus & sha256; chuẩn hóa nullable cho 5 cột repair. |
| **P0** | **DB-002** | Thiếu `--> statement-breakpoint` trong migrations 0011 & 0013 | Rất thấp | Rất thấp | Bổ sung comment breakpoint phân tách rõ các block trigger và DDL. |
| **P1** | **DB-003** | `employees_email_idx` không có `COLLATE NOCASE` & Full Table Scan | Trung bình | Thấp | Thêm index biểu thức `lower(email)` và chuẩn hóa email `.toLowerCase()` tại input validation. |
| **P1** | **DB-004** | Thiếu bảng lịch sử mức lương (`Wage History`) | Trung bình | Trung bình | Khóa base rate từ `row_snapshot` khi reopen hoặc bổ sung bảng quản lý hiệu lực mức lương. |
| **P1** | **DB-005** | `customer_orders` thiếu Index `(store_id, created_at)` | Rất thấp | Không | Thêm index `customer_orders_store_created_idx` trong migration mới. |
| **P1** | **DB-006** | `attendance_photos` & `locations` thiếu Index `expires_at` | Rất thấp | Không | Thêm index `expires_at` trên cả 2 bảng phục vụ cron retention. |
| **P2** | **DB-007** | Thiếu CHECK constraints cho domain invariants | Thấp | Thấp | Thêm CHECK constraints cho `ends_at > starts_at` và các trường số tiền dương. |
| **P2** | **DB-008** | Không dùng Foreign Key vào `employees.id` | Cao | Cao | Bổ sung `ON UPDATE CASCADE` cho quan hệ email hoặc refactor dùng employee ID ở phase 2. |
| **P2** | **DB-009** | Rate limit đặt món ghi 3 lần vào D1 trên mỗi request đọc | Trung bình | Thấp | Tách DELETE ra khỏi read flow; cân nhắc dùng KV hoặc in-memory rate limiting. |
| **P3** | **DB-010** | Drizzle ORM chưa làm runtime query builder | Cao | Trung bình | Giữ nguyên raw SQL hiện tại cho MVP; migrate dần từng module theo roadmap. |
| **P3** | **DB-011** | Cột thừa `checklist_items.completed` mất đồng bộ | Thấp | Thấp | Đánh dấu deprecated và loại bỏ khỏi các câu query không cần thiết. |

---

## 7. Các Lệnh Kiểm Tra Đã Chạy và Kết Quả Thực Tế

### Lệnh 1: Kiểm tra trạng thái Git và Baseline
- **Lệnh**: `git status` & `git log -n 5`
- **Kết quả**:
  - Baseline SHA: `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1`
  - Không có file nào ngoài phạm vi audit bị sửa đổi trái phép.

### Lệnh 2: Chạy toàn bộ Test Suite của dự án
- **Lệnh**: `npm.cmd test`
- **Kết quả**:
  - Chạy qua 128 tests trong 5.58 giây.
  - **128 passed, 0 failed, 0 skipped**. Toàn bộ hợp đồng dữ liệu hiện tại đều pass.

### Lệnh 3: So sánh Catalog SQLite vật lý với Drizzle Schema
- **Lệnh**: Thực thi script đối soát AST `scratch/audit_db_drift.mjs` (artifact cục bộ lịch sử; chưa tái xác minh)
- **Kết quả**:
  - Số bảng: 31 bảng trong schema, 31 bảng trong DB sau khi chạy migrations `0000` -> `0013`.
  - Phát hiện 5 lỗi `NOTNULL MISMATCH` và 2 lỗi `DEFAULT MISMATCH`.
  - Trích xuất 15 triggers đang hoạt động trong database SQLite.

### Lệnh 4: Phân tích Query Execution Plans (`EXPLAIN QUERY PLAN`)
- **Lệnh**: Thực thi script `scratch/test_snippets.mjs` (artifact cục bộ lịch sử; chưa tái xác minh)
- **Kết quả**:
  - Query với `lower(email)`: `SCAN employees` (Full Table Scan).
  - Query notifications với `lower(recipient_email)`: `SCAN notifications` + `USE TEMP B-TREE FOR ORDER BY`.
  - Query đơn hàng không lọc status: `SEARCH customer_orders USING INDEX customer_orders_store_submission_idx` + `USE TEMP B-TREE FOR ORDER BY`.
  - Query retention bằng chứng: `SCAN attendance_photos` + `USE TEMP B-TREE FOR ORDER BY`.

### Lệnh 5: Thực nghiệm Kiểm chứng Lỗ hổng Nghiệp vụ
- **Lệnh**: Thực thi `scratch/test_reopened_wage.mjs` (artifact cục bộ lịch sử; chưa tái xác minh) và `scratch/test_shift_interval.mjs` (artifact cục bộ lịch sử; chưa tái xác minh)
- **Kết quả**:
  - Xác nhận mức lương bị tính nhảy vọt từ 200.000đ lên 280.000đ khi mở lại kỳ lương.
  - Xác nhận ca làm việc có thời gian kết thúc trước thời gian bắt đầu được insert thành công vào DB mà không gặp bất kỳ lỗi nào.

---

## 8. Kế Hoạch Đề Xuất Cho Đợt Fix Kế Tiếp (Task Breakdown)

Sau khi báo cáo này được phê duyệt, các task sửa lỗi được khuyến nghị triển khai theo trình tự sau:

1. **Task DB-FIX-01 (P0)**: Thêm `--> statement-breakpoint` cho `0011_workforce_integrity.sql` và `0013_workforce_guardrails.sql`; cập nhật `db/schema.ts` đồng bộ defaults và nullability với migrations.
2. **Task DB-FIX-02 (P1)**: Tạo migration `0014_database_performance_indexes.sql`:
   - Tạo index `customer_orders_store_created_idx` trên `customer_orders(store_id, created_at)`.
   - Tạo index `attendance_photos_expires_idx` trên `attendance_photos(expires_at)`.
   - Tạo index `attendance_locations_expires_idx` trên `attendance_locations(expires_at)`.
   - Tạo index biểu thức `employees_lower_email_idx` trên `employees(lower(email))`.
   - Tạo index biểu thức `notifications_lower_email_idx` trên `notifications(lower(recipient_email), created_at)`.
3. **Task DB-FIX-03 (P1)**: Sửa đổi logic `loadPayrollReport`: Khi kỳ lương được mở lại (`reopen`), ưu tiên lấy `hourlyRate` đã được snapshot trong `payroll_entries.row_snapshot` của kỳ đó nếu tồn tại, không đọc đè `hourly_rate` mới từ bảng `employees`.
4. **Task DB-FIX-04 (P2)**: Tạo migration `0015_domain_check_constraints.sql` bổ sung các CHECK constraints bảo vệ: `ends_at > starts_at`, `total_amount >= 0`, `quantity > 0`.
5. **Task DB-FIX-05 (P2)**: Tách logic dọn dẹp bucket hết hạn trong `limitOrderRequests` ra khỏi request tra cứu đơn hàng để giảm tải ghi cho D1.

---
**Xác nhận kết thúc**: Toàn bộ quá trình kiểm toán được thực hiện theo đúng nguyên tắc **AUDIT ONLY**. Không có file mã nguồn nào của ứng dụng bị sửa đổi. Báo cáo này là cơ sở kỹ thuật chính xác và có đầy đủ bằng chứng để đội ngũ kỹ sư tiến hành khắc phục.
