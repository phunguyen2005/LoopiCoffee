# TÀI LIỆU LỊCH SỬ — không dùng làm đặc tả hiện hành

> Đánh dấu ngày 2026-10-13. Các kết quả và chỉ dẫn bên dưới chỉ thuộc baseline/lượt công việc được mô tả. Không coi là yêu cầu thực thi hoặc trạng thái HEAD hiện tại.
> Đọc [bộ tài liệu chuẩn](../README.md), [hiện trạng source](../implementation-status.md) và [đính chính audit](ERRATA.md).
> Bản nguyên gốc được bảo toàn trong docs/archive/2026-10-13/. Liên kết source đã bỏ line anchors cũ; đường dẫn không còn tồn tại chuyển tới đính chính, không coi đó là bằng chứng source.

---

# BÁO CÁO AUDIT CHUYÊN SÂU: API, SERVER ACTIONS & CONTRACTS (AUDIT ONLY)

> **Mã báo cáo:** `AUDIT-06-API`
> **Dự án:** LoopyCafe Management System
> **Chuyên gia thực hiện:** Agent 2 — API Auditor
> **Git Baseline Commit SHA:** `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1`
> **Chế độ:** AUDIT ONLY (Read-only, không can thiệp code ứng dụng, không gửi mutation tới production)
> **Thời điểm hoàn thành:** 12/10/2026

---

## 1. Executive Summary

Báo cáo này cung cấp kết quả kiểm toán kỹ thuật toàn diện cho toàn bộ hệ thống API Route Handlers, Server Contracts, phân quyền RBAC server-side, cơ chế xác thực nguồn gốc, xử lý dữ liệu đầu vào và các luồng chuyển trạng thái nghiệp vụ của dự án **LoopyCafe Management System**.

### Tổng quan hiện trạng:
- **Quy mô API:** 34 file route tại `app/api/`, hiện thực **57 HTTP method handlers** phục vụ 4 nhóm đối tượng người dùng: `OWNER`, `MANAGER`, `STAFF` (`team_lead`/`employee`) và `CUSTOMER` (khách vãng lai).
- **Kiến trúc:** Modular Monolith trên nền tảng Vinext (Cloudflare Workers + D1 Database + R2 Private Storage + Supabase Auth).
- **Tình trạng kiểm thử:** Đã thực thi toàn bộ test suite cục bộ (`npm test`: 128/128 tests PASS), kiểm tra tĩnh kiểu dữ liệu (`npm run typecheck`: PASS) và linting (`npm run lint`: PASS).

### Các điểm sáng kiến trúc & bảo mật đã ghi nhận:
1. **Bảo mật đơn hàng khách vãng lai (Guest Order Security):** Cơ chế capability-token với chuỗi ngẫu nhiên cryptographically secure 256-bit (`X-Order-Receipt`) chỉ lưu mã băm SHA-256 trên server (`receipt_token_hash`). Không cho phép truy vấn đơn bằng số điện thoại, ID tuần tự hay mã đơn hiển thị. Token được lưu tại client fragment URL `#receipt=...` ngăn ngừa rò rỉ qua HTTP Referer header.
2. **Kiểm soát đồng thời & Tính toàn vẹn (Concurrency & Atomicity):** Sử dụng triệt để `db.batch()` của Cloudflare D1 với các điều kiện nguyên tử (`WHERE changes() = 1`, `WHERE status = 'pending'`, kiểm tra `workforce_revision` và `expectedRevision`), loại bỏ triệt để nguy cơ double-spending, duyệt trùng, chốt công đè ca.
3. **Bảo vệ dữ liệu nhạy cảm (Private Evidence):** Ảnh chấm công được đóng dấu server-stamped SVG, lưu trữ trong Cloudflare R2 private bucket. Truy cập qua endpoint `/api/files/[eventId]` có kiểm tra quyền nghiêm ngặt (`owner`/`manager`), thời hạn retention, chống IDOR theo `storeId` và áp dụng CSP Sandbox nghiêm ngặt.
4. **Chống CSV Formula Injection:** Hàm `sanitizeCsvCell` vô hiệu hóa các ký tự điều khiển nguy hiểm (`=`, `+`, `-`, `@`, `\t`, `\r`) trước khi xuất tệp bảng chấm công.

### Bảng tổng hợp phát hiện (Findings Summary):
| Mức độ | Số lượng | Mã phát hiện | Trọng tâm |
| :--- | :---: | :--- | :--- |
| **P0 (Critical)** | **0** | — | Không ghi nhận lỗ hổng nghiêm trọng cho phép RCE, bypass auth hoàn toàn hay rò rỉ dữ liệu diện rộng công khai. |
| **P1 (High)** | **2** | `API-001`, `API-002` | Leo thang đặc quyền ngang giữa các Manager; 14 route handlers thiếu bọc `apiHandler` làm vỡ chuẩn lỗi và tiềm ẩn lộ thông tin lỗi máy chủ. |
| **P2 (Medium)** | **4** | `API-003`, `API-004`, `API-005`, `API-006` | Thiếu `Cache-Control: private, no-store` trên API nhạy cảm; Thiếu phân trang đơn hàng (`LIMIT 150`); Tranh chấp ghi D1 do rate-limit cleanup đồng bộ; Team Lead có thể sửa ca của cấp trên. |
| **P3 (Low)** | **4** | `API-007`, `API-008`, `API-009`, `API-010` | Đơn hàng trạng thái `ready` không thể hủy khi khách bỏ đơn; Origin guard phụ thuộc Worker bỏ quên middleware; Rate limit IP chia sẻ cụm local; Thiếu Referer fallback khi mất Origin. |

---

## 2. Phạm vi, Phương pháp và Giới hạn

### 2.1. Phạm vi kiểm toán
- **Tất cả các route handlers tại `app/api/`:**
  - Quản trị tài khoản & nhân sự: `admin/accounts`, `seed-users`, `profile`, `team`, `consent`, `auth/activate`, `auth/change-password`.
  - Nghiệp vụ ca & vận hành: `shifts`, `requests`, `incidents`, `handovers`, `checklists`, `today`, `dashboard`, `notifications`, `store`, `audit`.
  - Chấm công & Bằng chứng: `attendance/actions`, `attendance/capture-sessions`, `attendance/evidence`, `attendance/review`, `files/[eventId]`.
  - Đơn hàng & Thực đơn: `order/create`, `order/menu`, `order/track`, `owner/menu`, `owner/orders`, `owner/orders/[id]/status`, `owner/store-status`.
  - Báo cáo & Bảng lương: `reports/attendance`, `reports/attendance.csv`, `reports/payroll`, `reports/payroll.xls`, `cron/retention`.
- **Hạ tầng hỗ trợ HTTP & Auth:** `platform/http/input.ts`, `platform/http/errors.ts`, `platform/http/request-origin.ts`, `server/auth.ts`, `server/session.ts`, `server/audit.ts`, `middleware.ts`, `worker/index.ts`.

### 2.2. Phương pháp thực hiện
1. **Phân tích tĩnh mã nguồn (Static Code Analysis):** Đọc đối chiếu từng dòng mã nguồn, xác minh logic RBAC, ownership scope, body bounds, regex validation, sanitization.
2. **Kiểm tra luồng chuyển trạng thái (State Machine Verification):** Kiểm tra đồ thị chuyển đổi trạng thái đơn hàng, sự cố, yêu cầu ca làm việc và kỳ lương.
3. **Đối chiếu ma trận quyền (RBAC Matrix Verification):** So sánh quyền hạn thực tế triển khai với đặc tả nghiệp vụ trong `AGENTS.md`.
4. **Kiểm thử hồi quy an toàn (Safe Test Execution):** Chạy test runner nội bộ của repository trong môi trường sandbox Node.js, không phát sinh request ra mạng ngoài.

### 2.3. Giới hạn kiểm toán
- Không triển khai sửa đổi mã nguồn (tuân thủ nghiêm ngặt nguyên tắc AUDIT ONLY).
- Không gửi request đến các dịch vụ bên ngoài (Supabase Production, Cloudflare Workers Live, Cloudflare R2 Live).
- Đánh giá khả năng chịu tải của D1 dựa trên phân tích mô hình transactional SQLite/D1 đơn luồng ghi (Single Primary Writer).

---

## 3. Danh mục API chi tiết (API Inventory)

Bảng dưới đây thống kê đầy đủ 57 HTTP endpoint handlers được tìm thấy trong hệ thống:

| STT | Phương thức | Đường dẫn API | Đối tượng sử dụng | Cơ chế Auth | Yêu cầu vai trò (RBAC) | Tác động dữ liệu (Side Effects) | Tính lũy nghiệm (Idempotency) | Cơ chế phân trang / Lọc | Mã HTTP trả về | Cache Policy |
| :---: | :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| 1 | `GET` | `/api/admin/accounts` | Web Admin | Cookie Session | `owner`, `manager` | Không | Có | `auditFor` (Limit 20) | 200, 401, 403 | Không thiết lập |
| 2 | `POST` | `/api/admin/accounts` | Web Admin | Cookie Session | `owner`, `manager` | Tạo user Supabase, Insert `employees`, `audit_events` | Không (Unique Email) | Không | 200, 400, 403, 409, 502, 503 | Không thiết lập |
| 3 | `PATCH` | `/api/admin/accounts` | Web Admin | Cookie Session | `owner`, `manager` | Update `employees`, Supabase user, Insert `audit_events` | Có | Không | 200, 400, 403, 404, 409, 502, 503 | Không thiết lập |
| 4 | `POST` | `/api/attendance/actions` | Mobile/Web Staff | Cookie Session | Authenticated Staff | Lưu R2 photo, Insert `attendance_events`, `sessions`, `locations` | Có (`idempotencyKey`) | Không | 200, 400, 409, 412, 422, 503 | Không thiết lập |
| 5 | `POST` | `/api/attendance/capture-sessions` | Mobile/Web Staff | Cookie Session | Staff có consent | Insert `attendance_capture_sessions`, `action_limits` | Không (New Token) | Không | 200, 400, 412, 429, 503 | Không thiết lập |
| 6 | `POST` | `/api/attendance/evidence` | Legacy Client | Không | Không | Không (Deprecated) | Có | Không | 410 | Không thiết lập |
| 7 | `GET` | `/api/attendance/review` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Không | Có | `historyFor` (Limit 60/20) | 200, 401, 403 | Không thiết lập |
| 8 | `PATCH` | `/api/attendance/review` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Update `attendance_exceptions`, `sessions`, insert corrections | Có (`expectedRevision`) | Không | 200, 400, 403, 404, 409 | Không thiết lập |
| 9 | `GET` | `/api/audit` | Web Owner | Cookie Session | `owner` | Không | Có | Limit 200 | 200, 401, 403 | Không thiết lập |
| 10 | `POST` | `/api/auth/activate` | Web Staff | Supabase Token | Authenticated Employee | Update `employees.auth_user_id`, `status='active'` | Có | Không | 200, 401, 403 | Không thiết lập |
| 11 | `POST` | `/api/auth/change-password` | Web Staff | Supabase Token | Authenticated User | Update Supabase user, Update `must_change_password=0` | Có | Không | 200, 400, 401, 403 | Không thiết lập |
| 12 | `GET` | `/api/checklists` | Web Staff/Manager | Cookie Session | All Active Staff | Không | Có | Theo `businessDate` | 200, 401 | Không thiết lập |
| 13 | `POST` | `/api/checklists` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Insert `checklist_items`, `audit_events` | Không | Không | 200, 400, 401, 403 | Không thiết lập |
| 14 | `PATCH` | `/api/checklists` | Web Staff | Cookie Session | All Active Staff | Upsert `checklist_executions`, `audit_events` | Có | Không | 200, 400, 401, 404 | Không thiết lập |
| 15 | `GET` | `/api/consent` | Web Staff | Cookie Session | All Active Staff | Không | Có | Không | 200, 401 | Không thiết lập |
| 16 | `POST` | `/api/consent` | Web Staff | Cookie Session | All Active Staff | Insert `employee_consents`, `audit_events` | Có (`INSERT OR IGNORE`) | Không | 200, 401 | Không thiết lập |
| 17 | `GET` | `/api/cron/retention` | Scheduled Cron | Bearer Secret | System Service | Xóa/Soft-delete data hết hạn D1, xóa object R2 | Có | Không | 200, 401, 503 | Không thiết lập |
| 18 | `POST` | `/api/cron/retention` | Scheduled Cron | Bearer Secret | System Service | Xóa/Soft-delete data hết hạn D1, xóa object R2 | Có | Không | 200, 401, 503 | Không thiết lập |
| 19 | `GET` | `/api/dashboard` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Không | Có | Giới hạn ca 5/250 | 200, 401, 403 | Không thiết lập |
| 20 | `GET` | `/api/files/[eventId]` | Web Manager | Cookie Session | `owner`, `manager` | Insert audit log xem ảnh | Có | Theo `eventId` | 200, 401, 403, 404 | `private, no-store, max-age=0` |
| 21 | `GET` | `/api/handovers` | Web Staff/Manager | Cookie Session | All Active Staff | Không | Có | Limit 30 | 200, 401 | Không thiết lập |
| 22 | `POST` | `/api/handovers` | Web Staff | Cookie Session | All Active Staff | Insert `handovers`, `audit_events` | Không | Không | 200, 400, 401 | Không thiết lập |
| 23 | `GET` | `/api/incidents` | Web Staff/Manager | Cookie Session | All Active Staff | Không | Có | Limit 100 | 200, 401 | Không thiết lập |
| 24 | `POST` | `/api/incidents` | Web Staff | Cookie Session | All Active Staff | Insert `incidents`, `notifications`, `audit_events` | Không | Không | 200, 400, 401 | Không thiết lập |
| 25 | `PATCH` | `/api/incidents` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Update `incidents.status`, insert `audit_events` | Có | Không | 200, 400, 401, 403, 404, 409 | Không thiết lập |
| 26 | `GET` | `/api/notifications` | Web Staff | Cookie Session | All Active Staff (Own) | Không | Có | Limit 100 | 200, 401 | Không thiết lập |
| 27 | `PATCH` | `/api/notifications` | Web Staff | Cookie Session | All Active Staff (Own) | Update `notifications.read_at` | Có | Không | 200, 400, 401 | Không thiết lập |
| 28 | `GET` | `/api/order/menu` | Public Customer | Không (Public) | Anonymous | Không | Có | Sắp xếp theo `sort_order` | 200 | `force-dynamic` |
| 29 | `POST` | `/api/order/create` | Public Customer | Header Secret | Anonymous (`cf-connecting-ip`) | Insert `customer_orders`, `items`, `history`, `limits` | Có (`Idempotency-Key`) | Giới hạn 30 món/đơn | 200, 201, 400, 409, 413, 415, 429 | `private, no-store` |
| 30 | `GET` | `/api/order/track` | Public Customer | Header Token | Anonymous (Receipt Token) | Update `order_rate_limits` | Có | Không | 200, 404, 429 | `private, no-store, no-referrer` |
| 31 | `GET` | `/api/owner/menu` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Không | Có | Sắp xếp theo `sort_order` | 200, 401, 403 | `private, no-store` |
| 32 | `POST` | `/api/owner/menu` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Insert `menu_items`, `audit_events` | Không | Không | 201, 400, 401, 403 | Không thiết lập |
| 33 | `PATCH` | `/api/owner/menu` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Update `menu_items`, `audit_events` | Có | Không | 200, 400, 401, 403, 404 | Không thiết lập |
| 34 | `DELETE` | `/api/owner/menu` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Delete `menu_items`, insert `audit_events` | Có | Không | 200, 400, 401, 403, 404 | Không thiết lập |
| 35 | `GET` | `/api/owner/orders` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Không | Có | `status`, `q`, `date` (Hard limit 150) | 200, 400, 401, 403 | Không thiết lập |
| 36 | `PATCH` | `/api/owner/orders/[id]/status` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Update `customer_orders`, insert `history` | Có (`expectedStatus`) | Không | 200, 400, 401, 403, 409 | Không thiết lập |
| 37 | `GET` | `/api/owner/store-status` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Không | Có | Không | 200, 401, 403 | `private, no-store` |
| 38 | `PATCH` | `/api/owner/store-status` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Upsert `store_ordering_settings`, `audit_events` | Có | Không | 200, 400, 401, 403 | Không thiết lập |
| 39 | `GET` | `/api/profile` | Web Staff | Cookie Session | All Active Staff | Không | Có | Không | 200, 401 | Không thiết lập |
| 40 | `PATCH` | `/api/profile` | Web Staff | Cookie Session | All Active Staff | Update `employees.display_name`, Supabase user | Có | Không | 200, 400, 401 | Không thiết lập |
| 41 | `GET` | `/api/reports/attendance` | Web Staff/Manager | Cookie Session | All Staff (Masked cho nhân viên) | Không | Có | `period` | 200, 400, 401 | Không thiết lập |
| 42 | `GET` | `/api/reports/attendance.csv` | Web Staff/Manager | Cookie Session | All Staff (Masked cho nhân viên) | Không | Có | `period` | 200, 401 | `private, no-store` |
| 43 | `POST` | `/api/reports/payroll` | Web Owner/Mgr | Cookie Session | `owner`, `manager` (`owner` cho reopen) | Snapshot `payroll_entries`, upsert periods, adjustments | Có (`idempotency`) | `period` | 200, 400, 401, 403, 409 | Không thiết lập |
| 44 | `GET` | `/api/reports/payroll.xls` | Web Owner/Mgr | Cookie Session | `owner`, `manager` | Không | Có | `period` | 200, 401, 403 | `private, no-store` |
| 45 | `GET` | `/api/requests` | Web Staff/Manager | Cookie Session | Staff (Own), Manager (Store) | Không | Có | Limit 100 | 200, 401 | Không thiết lập |
| 46 | `POST` | `/api/requests` | Web Staff | Cookie Session | All Active Staff | Insert `requests`, `audit_events` | Có (`client_request_key`) | Không | 200, 400, 401, 404, 409 | Không thiết lập |
| 47 | `PATCH` | `/api/requests` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Update `requests`, `shifts`, insert `notifications` | Có (`status='pending'`) | Không | 200, 400, 401, 403, 409 | Không thiết lập |
| 48 | `POST` | `/api/seed-users` | Local Tester | Bearer Secret | Dev/Local Only | Seed test accounts Supabase & D1 | Có | Không | 200, 400, 401, 403, 404, 502, 503 | Không thiết lập |
| 49 | `GET` | `/api/shifts` | Web Staff/Manager | Cookie Session | Staff (Own), Manager (Store) | Không | Có | `from`, `to`, `offset` (500/page) | 200, 400, 401 | Không thiết lập |
| 50 | `POST` | `/api/shifts` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Insert `shifts`, `notifications`, `audit_events` | Không (Batch 31 ca) | Không | 200, 400, 401, 403, 404, 409 | Không thiết lập |
| 51 | `PATCH` | `/api/shifts` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Update `shifts`, `notifications`, `audit_events` | Có (`expectedRevision`) | Không | 200, 400, 401, 403, 409 | Không thiết lập |
| 52 | `GET` | `/api/store` | Web Staff/Manager | Cookie Session | All Active Staff | Không | Có | Không | 200, 401 | Không thiết lập |
| 53 | `PATCH` | `/api/store` | Web Owner | Cookie Session | `owner` | Update `stores`, archive/insert `attendance_rules` | Có | Không | 200, 400, 401, 403 | Không thiết lập |
| 54 | `GET` | `/api/team` | Web Manager | Cookie Session | `owner`, `manager`, `team_lead` | Không | Có | `display_name ASC` | 200, 401, 403 | Không thiết lập |
| 55 | `POST` | `/api/team` | Legacy Client | Cookie Session | `owner` | Không | Có | Không | 410 | Không thiết lập |
| 56 | `PATCH` | `/api/team` | Web Owner | Cookie Session | `owner` | Update `employees`, insert `audit_events` | Có | Không | 200, 400, 401, 403, 404, 409 | Không thiết lập |
| 57 | `GET` | `/api/today` | Web Staff | Cookie Session | All Active Staff (Own) | Không | Có | Không | 200, 401 | Không thiết lập |

---

## 4. Checklist kiểm tra chi tiết (Audit Checklist)

### 4.1. Server-side RBAC & IDOR
- [x] **PASS — Kiểm tra xác thực tại Server:** Mọi endpoint nội bộ đều gọi `requireApiUser()` hoặc `getVerifiedIdentity()` tại server ([server/auth.ts#L81](../../server/auth.ts)). Không dựa vào client-side role hay ẩn nút.
- [x] **PASS — Ngăn ngừa IDOR đa cửa hàng:** Mọi truy vấn đọc/ghi đều ràng buộc với `auth.actor.storeId` lấy từ hồ sơ nhân viên trong database ([server/auth.ts#L72](../../server/auth.ts)), không cho phép truyền `storeId` từ client body/query để thao túng cửa hàng khác.
- [x] **PASS — Bảo vệ Owner cuối cùng:** Logic tại `modules/people/application/update-access.ts#L33-L44` kiểm tra điều kiện `EXISTS` đảm bảo luôn còn ít nhất 1 tài khoản `owner` có `status = 'active'`. Nếu thao tác làm mất Owner cuối cùng, câu lệnh cập nhật bị rollback và trả về mã lỗi 409 `access_conflict`.
- [x] **PASS — Chặn tự vô hiệu hóa tài khoản:** [modules/people/application/update-access.ts#L25-L27](../../modules/people/application/update-access.ts) ngăn cản người dùng tự đổi `status != 'active'` cho chính mình (`self_deactivation`).
- [ ] **FAIL — Phân quyền ngang Manager (Peer Manager Protection):** [modules/people/domain/access.ts#L13](../../modules/people/domain/access.ts) cho phép Manager sửa thông tin, tạm khóa, đổi vai trò và reset mật khẩu của một Manager khác. *(Xem chi tiết: `API-001`)*.
- [ ] **FAIL — Phân cấp quyền ca làm việc của Team Lead:** [modules/operations/application/manage-shifts.ts#L53-L57](../../modules/operations/application/manage-shifts.ts) cho phép Team Lead sửa hoặc hủy ca làm của Manager và Owner. *(Xem chi tiết: `API-006`)*.

### 4.2. API Contracts & Giới hạn Input (Body Bounds & Validation)
- [x] **PASS — Giới hạn kích thước Body (Body Size Bounds):**
  - Mặc định các endpoint JSON thông thường bị chặn nếu vượt quá 64 KiB (`DEFAULT_JSON_MAX_BYTES = 65_536` tại [platform/http/input.ts#L5](../../platform/http/input.ts)).
  - Endpoint đặt món giới hạn nghiêm ngặt ở mức 32 KiB (`length > 32768` tại [modules/ordering/application/input.ts#L49](../../modules/ordering/application/input.ts)).
  - Riêng endpoint chấm công có ảnh đính kèm cho phép tối đa 3 MiB (`ATTENDANCE_ACTION_MAX_BYTES = 3_145_728` tại [platform/http/input.ts#L6](../../platform/http/input.ts)).
  - Mọi trường hợp vượt ngưỡng đều trả về HTTP 413 `body_too_large`.
- [x] **PASS — Từ chối payload sai định dạng:** `readObject` và `readOrderBody` kiểm tra chặt chẽ `content-type: application/json`, parse stream nhị phân an toàn với `TextDecoder("utf-8", { fatal: true })`, trả về 400 `invalid_json` hoặc `invalid_body` khi payload rỗng hoặc là JSON Array không hợp lệ.
- [x] **PASS — Tính lại giá bán tại Server (Server Price Recalculation):** Trong `createOrder` ([modules/ordering/application/create-order.ts#L80-L88](../../modules/ordering/application/create-order.ts)), toàn bộ đơn giá món, kích cỡ, topping và tổng tiền được tính toán lại 100% từ bảng `menu_items` và `menu_options` trên cơ sở dữ liệu. Không tin cậy bất kỳ trường đơn giá nào do client gửi lên.
- [ ] **FAIL — Bọc Error Handler thống nhất (`apiHandler`):** Có tới 14 route handlers không sử dụng middleware bọc `apiHandler`, dẫn đến việc các lỗi ngoại lệ không được chuyển đổi sang chuẩn JSON `{ error, code, requestId }` và có thể trả về lỗi 500 mặc định của framework. *(Xem chi tiết: `API-002`)*.

### 4.3. Chuyển trạng thái nghiệp vụ (State Transitions)
- [x] **PASS — Tính toàn vẹn đơn hàng:** Kiểm tra snapshot version thực đơn và trạng thái mở cửa của quán ngay trong write transaction ([modules/ordering/application/create-order.ts#L103-L110](../../modules/ordering/application/create-order.ts)). Chống việc đặt món khi quán vừa tắt nhận đơn hoặc đổi giá.
- [x] **PASS — Máy trạng thái đơn hàng (Order State Machine):** Chuyển trạng thái đơn hàng tuân theo đồ thị: `pending -> [accepted, cancelled]`, `accepted -> [preparing, cancelled]`, `preparing -> [ready, cancelled]`, `ready -> [completed]`. Có lưu vết chi tiết người thao tác vào `order_status_history`.
- [x] **PASS — Máy trạng thái sự cố (Incident State Machine):** Unidirectional chuyển tiếp nghiêm ngặt: `open -> acknowledged -> resolved -> closed` ([app/api/incidents/route.ts#L69-L74](../../app/api/incidents/route.ts)), ngăn chặn hoàn toàn việc nhảy trạng thái hoặc mở lại sự cố đã đóng mà không qua quy trình.
- [x] **PASS — Tính bất biến của kỳ lương đã chốt (Payroll Immutability):** Bảng lương khi `finalized` sẽ khóa toàn bộ phiên công, không cho phép thêm ca mới, không cho phép điều chỉnh giờ công ([modules/attendance/application/correct-attendance.ts#L50](../../modules/attendance/application/correct-attendance.ts)) hay thêm phụ cấp/khấu trừ ([modules/payroll/application/add-adjustment.ts#L22](../../modules/payroll/application/add-adjustment.ts)). Chỉ duy nhất `owner` mới có quyền `reopen` kỳ lương ([modules/payroll/application/change-period.ts#L15](../../modules/payroll/application/change-period.ts)).
- [ ] **FAIL — Khả năng hủy đơn khi khách bỏ lấy tại quầy (`ready` -> `cancelled`):** Đồ thị trạng thái đơn hàng hiện chặn không cho hủy đơn khi đơn đã ở trạng thái `ready` ([modules/ordering/application/change-status.ts#L5](../../modules/ordering/application/change-status.ts)). *(Xem chi tiết: `API-007`)*.

### 4.4. Bảo mật đơn hàng khách vãng lai (Guest Order Security)
- [x] **PASS — Không thể đoán ID đơn hàng (Anti-enumeration):** Order tracking chỉ chấp nhận `X-Order-Receipt` token bí mật gồm 64 ký tự hex ngẫu nhiên ([modules/ordering/application/input.ts#L31-L36](../../modules/ordering/application/input.ts)). Không thể tra cứu đơn thông qua số điện thoại, ID tuần tự hay mã đơn hiển thị `order_code`.
- [x] **PASS — Bảo vệ bí mật trên URL:** Token đặt món được lưu giữ ở URL Fragment `#receipt=...` ([components/order/order-tracking-view.tsx#L58](../../components/order/order-tracking-view.tsx)), ngăn ngừa tuyệt đối việc gửi token lên header HTTP Referer hoặc lưu vào nhật ký web proxy.
- [x] **PASS — Tỷ lệ giới hạn (Rate Limiting):** Có giới hạn tần suất tạo đơn (10 đơn/phút theo IP, 300 đơn/phút toàn quán) và tra cứu đơn (120 lần/phút theo IP, 5000 lần/phút toàn quán) tại [modules/ordering/application/rate-limit.ts#L9](../../modules/ordering/application/rate-limit.ts).
- [ ] **FAIL — Hiệu năng dọn dẹp Rate-limit trong D1:** Câu lệnh `DELETE FROM order_rate_limits WHERE expires_at < ?` chạy đồng bộ trên từng request tra cứu đơn gây tải ghi không cần thiết lên D1. *(Xem chi tiết: `API-005`)*.

### 4.5. Bảo vệ Nguồn gốc, CORS, CSRF & Cache Policy
- [x] **PASS — Chặn CSRF Cross-Origin Mutation:** [platform/http/request-origin.ts#L2-L13](../../platform/http/request-origin.ts) từ chối toàn bộ mutation (POST, PATCH, DELETE) có `origin !== url.origin` hoặc `sec-fetch-site === 'cross-site'`.
- [x] **PASS — Sandbox CSP cho ảnh chấm công:** [app/api/files/[eventId]/route.ts#L34](../../app/api/files/[eventId]/route.ts) áp dụng CSP chặt chẽ `default-src 'none'; sandbox` ngăn ngừa mã độc thực thi từ file ảnh SVG.
- [ ] **FAIL — Thiếu header `Cache-Control` riêng tư:** Đa số các endpoint trả về dữ liệu cá nhân (PII), thông tin lương, nhật ký kiểm toán không khai báo `Cache-Control: private, no-store`. *(Xem chi tiết: `API-003`)*.
- [ ] **FAIL — Thiếu kiểm tra nguồn gốc tại middleware:** `middleware.ts` bỏ qua các đường dẫn `/api/:path*`, khiến việc bảo vệ CSRF phụ thuộc hoàn toàn vào Cloudflare Worker fetch pipeline và không hoạt động trong các môi trường Next.js độc lập. *(Xem chi tiết: `API-008`)*.

---

## 5. Danh sách phát hiện chi tiết (Findings API-001 -> API-010)

```
================================================================================
FINDING ID: API-001 | Priority: P1 | Confidence: CONFIRMED
MÔ TẢ: Leo thang đặc quyền ngang giữa các Quản lý (Manager Horizontal Privilege Escalation)
================================================================================
```
- **Tập tin liên quan:**
  - [`modules/people/domain/access.ts#L9-L14`](../../modules/people/domain/access.ts)
  - [`app/api/admin/accounts/route.ts#L258-L364`](../../app/api/admin/accounts/route.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  Trong hàm kiểm tra quyền quản lý nhân viên:
  ```ts
  export function canManageEmployee(actor: AccessActor, employee: EmployeeAccess) {
    if (actor.storeId !== employee.store_id) return false;
    if (employee.role === "system_admin") return false;
    if (actor.role === "owner") return true;
    return actor.role === "manager" && employee.role !== "owner";
  }
  ```
  Điều kiện `employee.role !== "owner"` vô tình cho phép `actor` có vai trò `manager` thao tác trên một tài khoản khác cũng có vai trò `manager`.
- **Evidence (Bằng chứng):**
  1. Trong `PATCH /api/admin/accounts`:
     - Nếu Manager A gửi request với `id` của Manager B và `action: "reset_password"`, hàm `resetPassword()` sẽ được thực thi, tạo mật khẩu tạm mới và trả về cho Manager A ([app/api/admin/accounts/route.ts#L355-L363](../../app/api/admin/accounts/route.ts)). Manager A có thể chiếm đoạt hoàn toàn tài khoản của Manager B.
     - Nếu Manager A gửi `action: "update_status"` với `status: "suspended"`, Manager B sẽ bị đình chỉ và tài khoản Supabase bị ban 100 năm (`ban_duration: '876000h'`) ([app/api/admin/accounts/route.ts#L330-L343](../../app/api/admin/accounts/route.ts)).
     - Nếu Manager A gửi `action: "change_role"` với `role: "employee"`, Manager B sẽ bị giáng chức thành nhân viên thông thường.
  2. Trong `POST /api/admin/accounts`:
     - Manager có thể tự ý tạo thêm tài khoản mới với vai trò `role: "manager"` mà không cần sự đồng thuận của Owner.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng (theo AGENTS.md Mục 4):* Chỉ Owner mới có toàn quyền trên đội ngũ nhân sự và phân bổ quyền Manager. Quản lý chỉ được quản lý nhân viên cấp dưới (`team_lead`, `employee`), tuyệt đối không được sửa đổi, vô hiệu hóa hay cấp lại mật khẩu của tài khoản Quản lý đồng cấp.
  - *Thực tế:* Manager có thể can thiệp toàn bộ vòng đời tài khoản của Manager khác.
- **Business Impact (Tác động nghiệp vụ):**
  Một tài khoản Quản lý bị lộ thông tin hoặc có hành vi gian lận nội bộ có thể vô hiệu hóa các Quản lý khác, chiếm đoạt quyền truy cập hoặc tự tạo tài khoản Quản lý dự phòng để che giấu vi phạm.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Sửa đổi `canManageEmployee` và `canAssignRole` trong `modules/people/domain/access.ts`:
  ```ts
  export function canManageEmployee(actor: AccessActor, employee: EmployeeAccess) {
    if (actor.storeId !== employee.store_id) return false;
    if (employee.role === "system_admin") return false;
    if (actor.role === "owner") return true;
    // Manager chỉ được quản lý nhân viên cấp dưới, không được quản lý Owner hoặc Manager khác
    return actor.role === "manager" && !["owner", "manager"].includes(employee.role);
  }

  export function canAssignRole(actor: AccessActor, role: ActorRole) {
    return assignableRoles.includes(role as typeof assignableRoles[number]) &&
      (actor.role === "owner" || (actor.role === "manager" && !["owner", "manager"].includes(role)));
  }
  ```
  Và tại `POST /api/admin/accounts/route.ts#L100`, bổ sung:
  ```ts
  if (auth.actor.role === "manager" && (role === "owner" || role === "manager")) {
    return Response.json({ error: "Quản lý chỉ có quyền cấp tài khoản nhân viên." }, { status: 403 });
  }
  ```
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Unit test: Manager gọi `reset_password`, `update_status`, `change_role` nhắm vào tài khoản Manager khác phải nhận HTTP 403.
  - Integration test: Manager gọi `POST /api/admin/accounts` với `role: "manager"` phải nhận HTTP 403.

---

```
================================================================================
FINDING ID: API-002 | Priority: P1 | Confidence: CONFIRMED
MÔ TẢ: Thiếu wrapper `apiHandler` tại 14 Route Handlers làm phá vỡ Envelope lỗi chuẩn và nguy cơ rò rỉ thông tin
================================================================================
```
- **Tập tin liên quan:**
  - [`app/api/reports/attendance/route.ts#L5`](../../app/api/reports/attendance/route.ts)
  - [`app/api/reports/attendance.csv/route.ts#L5`](../../app/api/reports/attendance.csv/route.ts)
  - [`app/api/reports/payroll.xls/route.ts#L5`](../../app/api/reports/payroll.xls/route.ts)
  - [`app/api/dashboard/route.ts#L5`](../../app/api/dashboard/route.ts)
  - [`app/api/today/route.ts#L5`](../../app/api/today/route.ts)
  - [`app/api/audit/route.ts#L4`](../../app/api/audit/route.ts)
  - [`app/api/files/[eventId]/route.ts#L5`](../../app/api/files/[eventId]/route.ts)
  - [`app/api/consent/route.ts#L4-L13`](../../app/api/consent/route.ts) (Cả GET và POST)
  - [`app/api/checklists/route.ts#L7`](../../app/api/checklists/route.ts) (Phương thức GET)
  - [`app/api/profile/route.ts#L7`](../../app/api/profile/route.ts) (Phương thức GET)
  - [`app/api/requests/route.ts#L8`](../../app/api/requests/route.ts) (Phương thức GET)
  - [`app/api/store/route.ts#L7`](../../app/api/store/route.ts) (Phương thức GET)
  - [`app/api/team/route.ts#L29`](../../app/api/team/route.ts) (Phương thức POST)
- **Root Cause (Nguyên nhân gốc rễ):**
  Trong kiến trúc dự án, `platform/http/errors.ts` cung cấp `apiHandler` nhằm chuẩn hóa việc bắt các ngoại lệ `ApplicationError` để trả về JSON chuẩn `{ error, code }` kèm HTTP status tương ứng, đồng thời gom mọi lỗi không mong muốn thành HTTP 500 `{ error, requestId }` kèm mã định danh ẩn vết lỗi máy chủ.
  Tuy nhiên, có 14 handler function được khai báo thô dưới dạng `export async function GET/POST(...)` mà không bọc qua `apiHandler`.
- **Evidence (Bằng chứng):**
  Trong `app/api/reports/attendance/route.ts`:
  ```ts
  export async function GET(request: Request) {
    const auth = await requireApiUser();
    if (!auth.actor) return auth.response;
    const url = new URL(request.url);
    const db = await ensureDatabase();
    const report = await loadPayrollReport(db, { ... });
  ...
  ```
  Nếu hàm `loadPayrollReport` ném `ApplicationError("Kỳ lương không hợp lệ.")` (hoặc lỗi kết nối D1 Database / SQLite xảy ra), lỗi không được `apiHandler` bắt. Next.js / Vinext sẽ xử lý bằng trình bắt lỗi runtime mặc định:
  1. Trả về cấu trúc JSON phi chuẩn (chứa `{ digest: "..." }`) hoặc HTML Error Page 500.
  2. Bỏ qua việc gán `requestId` để tra vết sự cố.
  3. Trong môi trường phát triển hoặc chạy dev server, có thể để lộ thông tin stack trace và cấu trúc câu lệnh SQL.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* 100% các endpoint trong hệ thống phải có cấu trúc phản hồi lỗi đồng nhất: `{ error: string, code?: string, requestId?: string }`.
  - *Thực tế:* 14 endpoint có hành vi bắt lỗi không đồng nhất, làm gãy hợp đồng API của frontend client và có thể rò rỉ chi tiết lỗi máy chủ.
- **Business Impact (Tác động nghiệp vụ):**
  Làm gián đoạn trải nghiệm người dùng trên thiết bị di động khi gặp lỗi mạng/DB (giao diện không hiển thị được thông báo lỗi thân thiện vì định dạng response sai chuẩn).
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Bọc tất cả các hàm handler trên bằng `apiHandler(async (...) => { ... })`.
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Viết test kiểm tra: Mock ném `ApplicationError` hoặc `DatabaseError` trong các route `GET /api/reports/attendance`, `GET /api/dashboard`, `GET /api/today` phải luôn nhận được HTTP response JSON hợp lệ có thuộc tính `error` và không bao giờ trả về HTML.

---

```
================================================================================
FINDING ID: API-003 | Priority: P2 | Confidence: CONFIRMED
MÔ TẢ: Thiếu Header `Cache-Control: private, no-store` trên các Endpoint nhạy cảm (PII & Operational Data)
================================================================================
```
- **Tập tin liên quan:**
  - [`app/api/admin/accounts/route.ts#L12`](../../app/api/admin/accounts/route.ts)
  - [`app/api/reports/attendance/route.ts#L19`](../../app/api/reports/attendance/route.ts)
  - [`app/api/owner/orders/route.ts#L184`](../../app/api/owner/orders/route.ts)
  - [`app/api/attendance/review/route.ts#L76`](../../app/api/attendance/review/route.ts)
  - [`app/api/dashboard/route.ts#L85`](../../app/api/dashboard/route.ts)
  - [`app/api/today/route.ts#L78`](../../app/api/today/route.ts)
  - [`app/api/profile/route.ts#L11`](../../app/api/profile/route.ts)
  - [`app/api/audit/route.ts#L12`](../../app/api/audit/route.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  Trong toàn bộ 34 route files, chỉ có 7 endpoint khai báo rõ ràng header `Cache-Control: private, no-store`. Các endpoint GET còn lại trả về phản hồi qua `Response.json(...)` mà không kèm theo chỉ thị bộ nhớ đệm.
- **Evidence (Bằng chứng):**
  Endpoint `GET /api/admin/accounts` trả về toàn bộ danh sách nhân viên gồm họ tên, email, số điện thoại, mức lương giờ, lương tháng và trạng thái đăng nhập.
  Endpoint `GET /api/owner/orders` trả về danh sách khách hàng gồm tên, số điện thoại và ghi chú cá nhân.
  Do không có `Cache-Control: private, no-store`, trình duyệt người dùng hoặc các proxy trung gian có thể tự động lưu cache response vào disk cache cục bộ.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Theo AGENTS.md Mục 4: "Ảnh, vị trí, số điện thoại và dữ liệu nhân sự là dữ liệu nhạy cảm... không để lộ." Mọi API trả về dữ liệu nội bộ nhân sự, chấm công và thông tin khách hàng phải buộc trình duyệt không được lưu cache trên đĩa cứng hoặc chia sẻ.
  - *Thực tế:* Trình duyệt lưu giữ dữ liệu PII và bảng lương trong bộ nhớ tạm mà không bị hủy khi người dùng đăng xuất.
- **Business Impact (Tác động nghiệp vụ):**
  Nếu nhân viên hoặc quản lý sử dụng chung máy tính bảng / máy POS tại quầy cà phê rồi đăng xuất, người tiếp theo có thể xem lại dữ liệu nhân sự và lịch sử đơn hàng thông qua bộ nhớ đệm trình duyệt hoặc nút Back.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Bổ sung header `{ headers: { "Cache-Control": "private, no-store" } }` vào tất cả các phản hồi JSON của các route quản trị và nội bộ. Hoặc thiết lập mặc định trong `apiHandler` nếu handler không tự truyền header.
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Kiểm tra tự động bằng script: Mọi request GET tới các route `/api/admin/*`, `/api/reports/*`, `/api/owner/orders`, `/api/profile`, `/api/audit` phải có header `Cache-Control` chứa chuỗi `no-store`.

---

```
================================================================================
FINDING ID: API-004 | Priority: P2 | Confidence: CONFIRMED
MÔ TẢ: Endpoint Danh sách Đơn hàng `GET /api/owner/orders` thiếu cơ chế Phân trang (Hard LIMIT 150)
================================================================================
```
- **Tập tin liên quan:**
  - [`app/api/owner/orders/route.ts#L92-L108`](../../app/api/owner/orders/route.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  Câu truy vấn chính trong route:
  ```ts
  query += ` ORDER BY created_at DESC LIMIT 150`;
  ```
  Handler hoàn toàn không tiếp nhận các tham số phân trang như `offset`, `page`, hay `cursor`, đồng thời không trả về metadata thông báo còn dữ liệu phía sau hay không (`hasMore`, `nextOffset`).
- **Evidence (Bằng chứng):**
  Trong một ngày bán hàng đông đúc hoặc khi quản lý lọc đơn theo khoảng thời gian dài (ví dụ: cả tháng qua `startDate` và `endDate`), số lượng đơn hàng thực tế có thể lên đến hàng trăm đơn.
  Endpoint vẫn tính toán chính xác tổng số đơn trong `countsResult` (ví dụ: 350 đơn), nhưng mảng `orders` bị cắt cụt ở mức 150 đơn đầu tiên. Quản lý hoàn toàn không có cách nào để cuộn trang hoặc xem tiếp 200 đơn hàng còn lại từ giao diện quản trị.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Danh sách đơn hàng phải hỗ trợ phân trang (Pagination qua `offset`/`cursor`) để người dùng có thể duyệt toàn bộ lịch sử đơn.
  - *Thực tế:* Bị giới hạn cứng 150 đơn, gây thất thoát thông tin hiển thị mà không có cảnh báo.
- **Business Impact (Tác động nghiệp vụ):**
  Quản lý và Chủ quán không thể đối soát những đơn hàng cũ hơn đơn thứ 150 trong các ngày cao điểm hoặc trong kỳ báo cáo tuần/tháng.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Bổ sung tham số `offset` và `limit` (mặc định limit = 50, tối đa 150):
  ```ts
  const offset = Math.max(0, Number(searchParams.get("offset") || 0));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset);
  ```
  Trả về `hasMore: orders.length > limit` và `nextOffset`.
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Test truyền `?offset=150` và xác nhận lấy được dữ liệu của trang tiếp theo mà không bị kẹt ở 150 bản ghi đầu tiên.

---

```
================================================================================
FINDING ID: API-005 | Priority: P2 | Confidence: PROBABLE
MÔ TẢ: Xung đột Ghi (Write Contention) trên Cloudflare D1 do Dọn dẹp Rate-limit Đồng bộ trong luồng Polling Đơn
================================================================================
```
- **Tập tin liên quan:**
  - [`modules/ordering/application/rate-limit.ts#L11-L17`](../../modules/ordering/application/rate-limit.ts)
  - [`app/api/order/track/route.ts#L9`](../../app/api/order/track/route.ts)
  - [`components/order/order-tracking-view.tsx#L49`](../../components/order/order-tracking-view.tsx)
- **Root Cause (Nguyên nhân gốc rễ):**
  Trong hàm `limitOrderRequests`, mỗi khi có một request kiểm tra đơn hàng (`action === "track"`), hệ thống thực hiện một batch ghi vào D1:
  ```ts
  const results = await db.batch([
    db.prepare("DELETE FROM order_rate_limits WHERE expires_at < ?").bind(now),
    ...keys.map(bucketKey => db.prepare(
      `INSERT INTO order_rate_limits (bucket_key, request_count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1 RETURNING request_count`,
    ).bind(bucketKey, (bucket + 2) * 60000)),
  ]);
  ```
- **Evidence (Bằng chứng):**
  Frontend khách hàng (`OrderTrackingView`) thiết lập cơ chế polling tự động mỗi 5 giây (`setTimeout(load, 5000)`).
  Giả sử có 60 khách hàng đang mở màn hình theo dõi đơn hàng đồng thời trong giờ cao điểm:
  Tần suất request gọi vào `/api/order/track` là: $60 \times (60 / 5) = 720\text{ requests/phút}$ (tức 12 requests/giây).
  Mỗi request này biến một thao tác đọc (Read) thành một Write Transaction trên D1 với 1 lệnh `DELETE` và 2 lệnh `INSERT ... ON CONFLICT`.
  Vì Cloudflare D1 sử dụng kiến trúc SQLite Single-Writer, các write transactions bị tuần tự hóa (serialized), gây ra hiện tượng xếp hàng khóa (Lock Queueing) và tăng đáng kể độ trễ phản hồi (latency spikes) cho toàn bộ hệ thống, bao gồm cả việc tạo đơn và chấm công.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Thao tác đọc theo dõi trạng thái đơn hàng không nên tạo áp lực khóa ghi liên tục lên cơ sở dữ liệu chính D1.
  - *Thực tế:* Thao tác theo dõi đơn gây ra hàng trăm lệnh ghi `DELETE` và `INSERT` mỗi phút vào bảng `order_rate_limits`.
- **Business Impact (Tác động nghiệp vụ):**
  Nguy cơ nghẽn cơ sở dữ liệu D1 khi lượng khách đặt và theo dõi đơn tăng cao cùng lúc, dẫn tới lỗi timeout hoặc chậm chạp cho các nghiệp vụ quầy và chấm công nhân viên.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  1. Loại bỏ lệnh `DELETE` khỏi luồng trực tiếp của từng request; chuyển tác vụ dọn dẹp bảng `order_rate_limits` sang worker cron định kỳ (`/api/cron/retention`) hoặc dọn dẹp theo xác suất ngẫu nhiên (`if (Math.random() < 0.02)`).
  2. Xem xét sử dụng Cloudflare Workers Cache API hoặc In-Memory Rate Limiting cho thao tác đọc `track` thay vì ghi trực tiếp vào D1.
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Benchmark mô phỏng 100 requests đồng thời tới `/api/order/track` và đo lường tỷ lệ lock wait của D1.

---

```
================================================================================
FINDING ID: API-006 | Priority: P2 | Confidence: CONFIRMED
MÔ TẢ: Trưởng ca (Team Lead) có thể Chỉnh sửa hoặc Hủy ca làm của Quản lý và Chủ quán
================================================================================
```
- **Tập tin liên quan:**
  - [`app/api/shifts/route.ts#L38-L44`](../../app/api/shifts/route.ts)
  - [`modules/operations/application/manage-shifts.ts#L7-L9`](../../modules/operations/application/manage-shifts.ts)
  - [`modules/operations/application/manage-shifts.ts#L53-L57`](../../modules/operations/application/manage-shifts.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  Trong `manage-shifts.ts`, hàm phân quyền:
  ```ts
  function authorize(actor: AccessActor) {
    if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền quản lý ca.", 403, "forbidden");
  }
  ```
  Và trong câu lệnh `changeShift`:
  ```sql
  UPDATE shifts SET status = ?, starts_at = ...
  WHERE id = ? AND store_id = ? AND revision = ? ...
  ```
  Câu lệnh chỉ kiểm tra `store_id` và `revision`, hoàn toàn không kiểm tra vai trò của nhân viên được phân ca đó (`employee_email` thuộc ca có vai trò gì).
- **Evidence (Bằng chứng):**
  Một nhân viên giữ vai trò `team_lead` có thể gửi request `PATCH /api/shifts` với `action: "cancel"` hoặc `action: "edit"` nhắm vào ID ca làm việc của `manager` hoặc `owner`. Câu lệnh SQL sẽ thực thi thành công, hủy ca hoặc đổi giờ làm việc của cấp trên.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Theo AGENTS.md Mục 4, việc phân ca là nhiệm vụ của `MANAGER` và `OWNER`. Nếu trao quyền hỗ trợ cho `team_lead`, Team Lead chỉ được phép điều chỉnh ca của nhân viên (`employee`), không được quyền can thiệp vào lịch trực của Manager hoặc Owner.
  - *Thực tế:* Team Lead có quyền hạn ngang hàng Manager đối với việc sửa và hủy ca làm.
- **Business Impact (Tác động nghiệp vụ):**
  Vi phạm nguyên tắc phân quyền và thứ bậc quản lý trong vận hành cửa hàng.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Trong `changeShift`, trước khi cập nhật, kiểm tra vai trò của nhân viên sở hữu ca:
  ```ts
  const targetShift = await db.prepare(
    `SELECT s.id, e.role FROM shifts s
     LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
     WHERE s.id = ? AND s.store_id = ?`
  ).bind(input.id, actor.storeId).first<{ id: string; role: string }>();

  if (actor.role === "team_lead" && ["owner", "manager"].includes(targetShift?.role || "")) {
    throw new ApplicationError("Trưởng ca không có quyền thay đổi ca của Quản lý hoặc Chủ quán.", 403, "forbidden");
  }
  ```
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Test case: Actor có vai trò `team_lead` thực hiện đổi/hủy ca của `manager` phải nhận lỗi 403 `forbidden`.

---

```
================================================================================
FINDING ID: API-007 | Priority: P3 | Confidence: CONFIRMED
MÔ TẢ: Máy trạng thái Đơn hàng thiếu nhánh Hủy (`cancelled`) từ trạng thái `ready` khi Khách không đến nhận
================================================================================
```
- **Tập tin liên quan:**
  - [`modules/ordering/application/change-status.ts#L4-L6`](../../modules/ordering/application/change-status.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  Cấu hình chuyển đổi trạng thái:
  ```ts
  const transitions: Record<string, string[]> = {
    pending: ["accepted", "cancelled"],
    accepted: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["completed"],
    completed: [],
    cancelled: [],
  };
  ```
- **Evidence (Bằng chứng):**
  Khi đồ uống đã pha xong và chuyển sang `ready` (sẵn sàng tại quầy), nếu khách hàng gọi điện báo hủy hoặc sau nhiều giờ khách không đến lấy đồ:
  Quản lý chỉ có 1 lựa chọn duy nhất là bấm `completed` (Hoàn tất) để dọn dẹp đơn trên màn hình quầy.
  Điều này dẫn đến việc đơn hàng bị tính là doanh thu hoàn tất hợp lệ, gây sai lệch thống kê kế toán, số liệu tồn kho nguyên vật liệu và báo cáo doanh thu thực thu.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Nghiệp vụ bán lẻ F&B cần hỗ trợ trạng thái hủy đơn hoặc đánh dấu bỏ đơn ("unclaimed/waste") kèm lý do khi đồ đã làm xong nhưng không giao được cho khách.
  - *Thực tế:* Đơn `ready` bị khóa cứng chỉ được chuyển sang `completed`.
- **Business Impact (Tác động nghiệp vụ):**
  Sai lệch số liệu báo cáo doanh số và hiệu suất quầy pha chế.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Cho phép chuyển từ `ready -> ["completed", "cancelled"]` với điều kiện bắt buộc nhập `cancelReason` (ví dụ: "Khách không đến nhận đồ").
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Test case: Chuyển đơn từ `ready` sang `cancelled` kèm lý do hợp lệ thành công và ghi nhận vào lịch sử đơn.

---

```
================================================================================
FINDING ID: API-008 | Priority: P2 | Confidence: CONFIRMED
MÔ TẢ: Cơ chế bảo vệ Origin Guard phụ thuộc Worker fetch pipeline, bị bỏ qua ở Next.js Middleware cục bộ
================================================================================
```
- **Tập tin liên quan:**
  - [`platform/http/request-origin.ts#L2-L13`](../../platform/http/request-origin.ts)
  - [`worker/index.ts#L32-L33`](../../worker/index.ts)
  - [`middleware.ts#L1-L3`](../../middleware.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  `rejectCrossOriginMutation` chỉ được gọi tại `worker/index.ts`. Trong khi đó, `middleware.ts` chỉ có matcher:
  ```ts
  export const config = { matcher: ["/app/:path*", "/auth/login"] };
  ```
  Tất cả các route `/api/:path*` đều nằm ngoài tầm kiểm soát của Next.js Middleware.
- **Evidence (Bằng chứng):**
  Khi chạy trên môi trường Node.js thông thường (`next dev` hoặc container không chạy qua Cloudflare Worker entry point), `worker/index.ts` không được kích hoạt.
  Ngoại trừ duy nhất route `POST /api/auth/change-password` có tự kiểm tra `origin`, toàn bộ 33 route handlers còn lại hoàn toàn không được kiểm tra `Origin` hay CSRF khi chạy ở môi trường phát triển Next.js thông thường.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Cơ chế phòng vệ CSRF/Origin Mutation phải mang tính phòng thủ chiều sâu (Defense-in-depth), hoạt động nhất quán ở cả tầng Worker và tầng Application/Middleware.
  - *Thực tế:* Cơ chế này bị vô hiệu hóa hoàn toàn nếu ứng dụng chạy ngoài Cloudflare Worker wrapper.
- **Business Impact (Tác động nghiệp vụ):**
  Rủi ro bảo mật tiềm ẩn khi kiểm thử trên môi trường staging hoặc các bản build preview không dùng worker runtime.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Tích hợp kiểm tra `rejectCrossOriginMutation(request)` vào ngay bên trong `apiHandler` tại `platform/http/errors.ts` để mọi API đều tự động được bảo vệ độc lập với runtime.
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Test case: Gọi thẳng handler qua Node.js Request với Origin lạ nhận HTTP 403 ngay cả khi không thông qua Worker.

---

```
================================================================================
FINDING ID: API-009 | Priority: P3 | Confidence: CONFIRMED
MÔ TẢ: Rate Limiter Đơn hàng chia sẻ chung Bucket `"local"` khi chạy ngoài Cloudflare CDN
================================================================================
```
- **Tập tin liên quan:**
  - [`modules/ordering/application/rate-limit.ts#L7`](../../modules/ordering/application/rate-limit.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  Đoạn mã xác định IP client:
  ```ts
  const client = request.headers.get("cf-connecting-ip")?.slice(0, 64) || "local";
  ```
- **Evidence (Bằng chứng):**
  Trong môi trường kiểm thử nội bộ hoặc triển khai không qua Cloudflare proxy, header `cf-connecting-ip` không tồn tại, khiến tất cả người dùng và các luồng kiểm thử đều bị gán định danh `"local"`.
  Khi một kiểm thử viên hoặc kịch bản tự động gửi 10 đơn trong 1 phút, toàn bộ người dùng khác trong mạng thử nghiệm sẽ bị chặn với mã lỗi HTTP 429 `rate_limited`.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Nếu không có `cf-connecting-ip`, hệ thống nên đọc dự phòng `x-forwarded-for` hoặc địa chỉ IP cục bộ để phân tách các client khác nhau trong quá trình thử nghiệm.
  - *Thực tế:* Toàn bộ traffic không có header Cloudflare bị dồn vào 1 bucket duy nhất.
- **Business Impact (Tác động nghiệp vụ):**
  Gây nghẽn giả tạo trong quá trình kiểm thử QA và đánh giá trải nghiệm người dùng trên môi trường local/staging.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Bổ sung fallback:
  ```ts
  const client = request.headers.get("cf-connecting-ip")?.slice(0, 64)
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local";
  ```
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Xác nhận hai client khác IP trong môi trường test không làm cạn rate limit của nhau.

---

```
================================================================================
FINDING ID: API-010 | Priority: P3 | Confidence: CONFIRMED
MÔ TẢ: `rejectCrossOriginMutation` từ chối Yêu cầu Hợp lệ khi Trình duyệt không gửi Header `Origin`
================================================================================
```
- **Tập tin liên quan:**
  - [`platform/http/request-origin.ts#L8-L11`](../../platform/http/request-origin.ts)
- **Root Cause (Nguyên nhân gốc rễ):**
  Logic kiểm tra:
  ```ts
  const origin = request.headers.get("origin");
  if (origin !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Nguồn yêu cầu không hợp lệ.", code: "invalid_origin" }, { status: 403 });
  }
  ```
- **Evidence (Bằng chứng):**
  Trong một số tình huống chuẩn của trình duyệt (ví dụ: một số WebViews nhúng trên thiết bị di động cũ, hoặc điều hướng form submit cùng nguồn), header `Origin` có thể không được gửi kèm.
  Khi `origin` là `null`, phép so sánh `null !== url.origin` luôn đánh giá là `true`, dẫn đến việc yêu cầu bị chặn 403 `invalid_origin`.
- **Expected vs Actual Behavior:**
  - *Kỳ vọng:* Theo đặc tả bảo mật CSRF của OWASP, nếu header `Origin` vắng mặt trên request cùng nguồn, hệ thống cần kiểm tra giá trị của header `Referer` để xác minh tên miền trước khi quyết định từ chối.
  - *Thực tế:* Yêu cầu bị từ chối ngay lập tức nếu thiếu `Origin`.
- **Business Impact (Tác động nghiệp vụ):**
  Một số thiết bị di động đời cũ hoặc ứng dụng Webview tích hợp có thể gặp lỗi 403 khi thực hiện thao tác gửi đơn hoặc cập nhật hồ sơ.
- **Proposed Remediation (Đề xuất khắc phục tối thiểu):**
  Kiểm tra thêm `Referer` làm dự phòng:
  ```ts
  const origin = request.headers.get("origin")
    || (request.headers.get("referer") ? new URL(request.headers.get("referer")!).origin : null);
  if (origin !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") { ... }
  ```
- **Acceptance Criteria & Test hồi quy cần bổ sung:**
  - Test request cùng nguồn không có header `Origin` nhưng có `Referer` hợp lệ không bị chặn 403.

---

## 6. Bảng ưu tiên xử lý (Remediation Roadmap)

Dưới đây là lộ trình khắc phục được sắp xếp theo mức độ ưu tiên từ cao xuống thấp:

| Thứ tự | Mã Finding | Mức độ | Module ảnh hưởng | Độ khó (Effort) | Hướng dẫn khắc phục tóm tắt |
| :---: | :---: | :---: | :--- | :---: | :--- |
| **1** | `API-001` | **P1 (High)** | `modules/people/domain/access.ts`<br>`app/api/admin/accounts/route.ts` | **Thấp (1h)** | Sửa `canManageEmployee` và `canAssignRole` chặn Manager thao tác trên tài khoản có vai trò Manager; chặn Manager tạo tài khoản Manager mới trong `POST /api/admin/accounts`. |
| **2** | `API-002` | **P1 (High)** | 14 files trong `app/api/` | **Trung bình (2h)** | Bọc tất cả 14 function handler thô bằng `apiHandler(async (...) => { ... })` để chuẩn hóa envelope lỗi và bắt ngoại lệ tập trung. |
| **3** | `API-003` | **P2 (Medium)** | `app/api/admin/accounts`<br>`app/api/reports/*`<br>`app/api/owner/orders` | **Thấp (1h)** | Bổ sung header `Cache-Control: private, no-store` vào toàn bộ các API trả về dữ liệu PII và vận hành nội bộ. |
| **4** | `API-006` | **P2 (Medium)** | `modules/operations/application/manage-shifts.ts` | **Thấp (1h)** | Bổ sung kiểm tra vai trò người sở hữu ca trong `changeShift`: Team Lead không được sửa hoặc hủy ca của Manager và Owner. |
| **5** | `API-004` | **P2 (Medium)** | `app/api/owner/orders/route.ts` | **Trung bình (2h)** | Hỗ trợ tham số `offset` và `limit` trong `GET /api/owner/orders`, trả về metadata `hasMore` và `nextOffset`. |
| **6** | `API-005` | **P2 (Medium)** | `modules/ordering/application/rate-limit.ts` | **Trung bình (2h)** | Bỏ câu lệnh `DELETE` khỏi luồng trực tiếp của từng lượt tra cứu đơn; chuyển việc dọn dẹp sang tác vụ cron hoặc dọn dẹp theo xác suất. |
| **7** | `API-008` | **P2 (Medium)** | `platform/http/errors.ts`<br>`platform/http/request-origin.ts` | **Thấp (1h)** | Đưa `rejectCrossOriginMutation` vào bên trong `apiHandler` để bảo vệ đa tầng ngay cả khi chạy ngoài Worker runtime. |
| **8** | `API-007` | **P3 (Low)** | `modules/ordering/application/change-status.ts` | **Thấp (30m)** | Bổ sung nhánh `ready -> cancelled` có kèm lý do hủy đơn bắt buộc khi khách không đến lấy đồ. |
| **9** | `API-010` | **P3 (Low)** | `platform/http/request-origin.ts` | **Thấp (30m)** | Bổ sung fallback kiểm tra `Referer` khi header `Origin` bị khuyết thiếu trên request cùng nguồn. |
| **10** | `API-009` | **P3 (Low)** | `modules/ordering/application/rate-limit.ts` | **Thấp (30m)** | Hỗ trợ đọc `x-forwarded-for` khi thiếu `cf-connecting-ip` để tránh đụng độ bucket rate-limit trên môi trường local. |

---

## 7. Các lệnh kiểm tra đã chạy và kết quả thực tế

Trong quá trình kiểm toán, toàn bộ các lệnh kiểm tra an toàn sau đây đã được thực thi và xác nhận kết quả:

### 7.1. Chạy Bộ kiểm thử Tự động (Node Test Runner)
- **Lệnh thực thi:** `cmd /c npm test`
- **Kết quả thực tế:**
  ```text
  1..128
  # tests 128
  # suites 0
  # pass 128
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 6639.4082
  ```
  - Toàn bộ 128 bài test đều **PASS**, bao gồm các bài test trọng yếu về bảo mật:
    - `ok 104 - SEC-003: canManageEmployee and canAssignRole disallow system_admin privilege escalation`
    - `ok 105 - SEC-004: sanitizeCsvCell neutralizes dangerous formula prefix characters`
    - `ok 106 - SEC-005: expireEvidence records store_id in audit events and isolates by store`
    - `ok 107 - SEC-006: Identity cache adheres to 10s SLA and invalidateIdentityCache functions correctly`
    - `ok 108 - SEC-008: readObject enforces bounded limits and safe type validation`
    - `ok 109 - SEC-002: platform origin guard does not exempt /api/seed-users in production mode`
    - `ok 110 - SEC-002: /api/seed-users route handler production and loopback protection`
    - `ok 117 - review decisions are pending-only and both endpoints must be approved`
    - `ok 118 - locked payroll blocks corrections; changed source revision blocks stale finalization`
    - `ok 119 - weekly shifts are all-or-nothing, adjacent shifts valid, overlapping concurrent writes rejected`
    - `ok 120 - shift edits and cancellations enforce revision, role and attendance guard`
    - `ok 122 - payroll adjustments are reasoned/idempotent, survive snapshots and are not doubled after reopen`

### 7.2. Kiểm tra Kiểm kiểu Tĩnh (TypeScript Typecheck)
- **Lệnh thực thi:** `cmd /c npm run typecheck`
- **Kết quả thực tế:**
  - Tạo kiểu runtime Workers qua `wrangler types worker-configuration.d.ts` thành công.
  - Trình biên dịch `tsc --noEmit --incremental false` hoàn thành với mã thoát `0` (Không có lỗi type).

### 7.3. Kiểm tra Mã nguồn (ESLint)
- **Lệnh thực thi:** `cmd /c npm run lint`
- **Kết quả thực tế:**
  - Lệnh thoát với mã `0` (Không có lỗi vi phạm cú pháp hoặc quy tắc linting trong thư mục dự án).

---

## 8. Kết luận

Hệ thống API và Server Contracts của **LoopyCafe Management System** thể hiện tư duy thiết kế bài bản, chú trọng tính toàn vẹn dữ liệu, kiểm soát đồng thời mạnh mẽ và bảo mật cao đối với luồng khách vãng lai (Guest Order Capability Security).

Các rủi ro phát hiện (`API-001` và `API-002`) là những lỗ hổng logic phân quyền ngang và thiếu sót bao bọc middleware chuẩn, hoàn toàn có thể được khắc phục nhanh chóng thông qua các patch nhỏ theo lộ trình ưu tiên tại Mục 6 mà không cần thay đổi kiến trúc tổng thể hay phá vỡ tính tương thích ngược của sản phẩm.
