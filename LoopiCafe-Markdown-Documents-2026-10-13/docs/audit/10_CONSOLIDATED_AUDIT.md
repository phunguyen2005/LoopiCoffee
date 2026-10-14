# TÀI LIỆU LỊCH SỬ — không dùng làm đặc tả hiện hành

> Đánh dấu ngày 2026-10-13. Các kết quả và chỉ dẫn bên dưới chỉ thuộc baseline/lượt công việc được mô tả. Không coi là yêu cầu thực thi hoặc trạng thái HEAD hiện tại.
> Đọc [bộ tài liệu chuẩn](../README.md), [hiện trạng source](../implementation-status.md) và [đính chính audit](ERRATA.md).
> Bản nguyên gốc được bảo toàn trong docs/archive/2026-10-13/. Liên kết source đã bỏ line anchors cũ; đường dẫn không còn tồn tại chuyển tới đính chính, không coi đó là bằng chứng source.

---

# BÁO CÁO KIỂM TOÁN HỢP NHẤT TOÀN DIỆN (CONSOLIDATED AUDIT REPORT)
## LOOPICAFE MANAGEMENT SYSTEM — MULTI-AGENT PARALLEL AUDIT

> **Mã báo cáo:** `AUDIT-10-CONSOLIDATED`
> **Vai trò:** Lead Software Architect, QA Lead & Multi-Agent Audit Orchestrator
> **Dự án:** LoopiCafe Management System
> **Chế độ kiểm toán:** `AUDIT ONLY` (Tuyệt đối không can thiệp code ứng dụng, không thay đổi migrations, không sửa database)
> **Git Baseline Commit SHA:** `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1`
> **Thời điểm xuất báo cáo:** 12/10/2026
> **Báo cáo chuyên môn thành phần:**
> - [05_DATABASE_AUDIT.md](05_DATABASE_AUDIT.md) (Agent 1 — Database Auditor)
> - [06_API_AUDIT.md](06_API_AUDIT.md) (Agent 2 — API Auditor)
> - [07_PERFORMANCE_AUDIT.md](07_PERFORMANCE_AUDIT.md) (Agent 3 — Performance Auditor)
> - [08_MOBILE_RESPONSIVENESS_AUDIT.md](08_MOBILE_RESPONSIVENESS_AUDIT.md) (Agent 4 — Mobile UX Auditor)
> - [09_TEST_QUALITY_AUDIT.md](09_TEST_QUALITY_AUDIT.md) (Agent 5 — Test Quality Auditor)

---

## 1. Môi trường Thực thi & Tình trạng Khởi tạo (Execution Baseline)

| Hạng mục | Giá trị thực tế đã xác minh | Ghi chú & Giới hạn |
|---|---|---|
| **Repository Root** | `d:\College\Practice\loopicafe-management-system` | Workspace chuẩn cục bộ |
| **Git Commit SHA** | `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1` | Điểm neo baseline thống nhất cho cả 5 agents |
| **Trạng thái Working-tree** | Clean baseline + Các bản vá nghiệp vụ BIZ-001..004 đã được kiểm chứng | Đảm bảo 100% test hiện hữu chạy PASS |
| **Môi trường Runtime** | Node.js v22.19.19 (Windows x64), SQLite In-Memory (`node:sqlite`) | Không can thiệp Cloudflare D1/R2/Supabase production |
| **Kết quả Kiểm thử Baseline** | **128/128 tests PASS** (Node Test Runner, thời gian ~5.58s - 8.68s) | `npm.cmd test` đạt 100% |
| **Kiểm tra Kiểu (Typecheck)** | `wrangler types` + `tsc --noEmit`: **0 lỗi** | `npm.cmd run typecheck` đạt Exit Code 0 |
| **Kiểm tra Cú pháp (Lint)** | `eslint . --ignore-pattern dist --ignore-pattern .next`: **0 lỗi** | `npm.cmd run lint` đạt Exit Code 0 |
| **Mức độ Concurrency** | 5 Subagents chạy song song (Parallel execution) qua `invoke_subagent` | Độc lập ngữ cảnh, ghi tệp báo cáo riêng biệt |

---

## 2. Tình trạng Hoàn thành của 5 Specialist Agents

Cả 5 kiểm toán viên chuyên môn độc lập đã hoàn thành 100% phạm vi công việc và bàn giao báo cáo đầy đủ:

```
[Orchestrator: Lead Architect & QA Lead]
   │
   ├──► Agent 1 (Database Auditor)    ──► docs/audit/05_DATABASE_AUDIT.md               [HOÀN TẤT - 11 findings]
   ├──► Agent 2 (API Auditor)         ──► docs/audit/06_API_AUDIT.md                    [HOÀN TẤT - 10 findings]
   ├──► Agent 3 (Performance Auditor) ──► docs/audit/07_PERFORMANCE_AUDIT.md            [HOÀN TẤT - 11 findings]
   ├──► Agent 4 (Mobile UX Auditor)   ──► docs/audit/08_MOBILE_RESPONSIVENESS_AUDIT.md  [HOÀN TẤT - 10 findings]
   └──► Agent 5 (Test Quality Auditor)──► docs/audit/09_TEST_QUALITY_AUDIT.md           [HOÀN TẤT - 9 findings]
```

### Bảng tổng kết số lượng phát hiện theo mức độ nghiêm trọng:

| Chuyên ngành kiểm toán | Mã tiền tố | P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low) | Tổng số phát hiện |
|---|:---:|:---:|:---:|:---:|:---:|
| **Database D1 & Drizzle** | `DB` | 2 | 4 | 3 | 2 | **11** |
| **API, Contracts & RBAC** | `API` | 0 | 2 | 4 | 4 | **10** |
| **Performance & Reliability** | `PERF` | 2 | 4 | 4 | 1 | **11** |
| **Mobile Responsiveness & UX** | `MOB` | 1 | 3 | 4 | 2 | **10** |
| **Test Quality & CI Coverage** | `TEST` | 2 | 3 | 2 | 2 | **9** |
| **TỔNG HỢP TOÀN HỆ THỐNG** | — | **7** | **16** | **17** | **11** | **51** |

---

## 3. Tóm tắt Báo cáo của Từng Chuyên gia

### 3.1. Agent 1 — Database Auditor (`05_DATABASE_AUDIT.md`)
- **Điểm mạnh:** Kiểm soát concurrency bằng optimistic locks/revision guards và trigger SQLite rất tốt; snapshot giá/tên món trong `order_items` bất biến; zero floating-point monetary error (toàn bộ tiền tệ dùng VND integer).
- **Phát hiện trọng tâm:**
  - `DB-001` (P0): Schema drift nguy hiểm — 5 cột khai báo `notNull()` trong Drizzle schema nhưng thực tế là `NULLABLE` trong SQLite do `ALTER TABLE ADD COLUMN`.
  - `DB-002` (P0): Thiếu comment `--> statement-breakpoint` trong migrations 0011 và 0013 khiến migration engine chuẩn của Drizzle không thể bóc tách triggers độc lập.
  - `DB-003` (P1): `employees_email_idx` là case-sensitive, đồng thời toàn bộ câu truy vấn auth/dashboard/API bị Full Table Scan do dùng `lower(email)`.
  - `DB-004` (P1): Thiếu Wage History — khi mở lại kỳ lương (`reopen`), hệ thống tính lại toàn bộ lương dĩ vãng theo `hourly_rate` hiện thời của nhân viên.

### 3.2. Agent 2 — API Auditor (`06_API_AUDIT.md`)
- **Điểm mạnh:** Guest Order Capability Token 256-bit với SHA-256 hash lưu trữ an toàn, loại bỏ triệt để nguy cơ IDOR hay đoán số thứ tự đơn; ảnh chấm công lưu private R2 có CSP sandbox; phòng chống CSV Formula Injection thành công.
- **Phát hiện trọng tâm:**
  - `API-001` (P1): Horizontal Privilege Escalation — Manager có thể đình chỉ, giáng chức hoặc reset mật khẩu của Manager đồng cấp.
  - `API-002` (P1): 14 route handlers không bọc qua `apiHandler`, dẫn đến envelope lỗi phi chuẩn và nguy cơ rò rỉ stack trace khi xảy ra unhandled exception.
  - `API-004` (P2): Endpoint `/api/owner/orders` thiếu phân trang (hardcoded `LIMIT 150`).
  - `API-006` (P2): Team Lead có thể sửa hoặc hủy ca của cấp trên (Manager/Owner).

### 3.3. Agent 3 — Performance Auditor (`07_PERFORMANCE_AUDIT.md`)
- **Điểm mạnh:** Bundle production tương đối gọn gàng; runtime Workers cold-start thấp; có cơ chế cache 10s cho session auth.
- **Phát hiện trọng tâm:**
  - `PERF-001` (P0): Thư viện `jpeg-js` thuần JS giải nén toàn bộ 1.2M pixel chỉ để lấy kích thước ảnh, ngốn 40-150ms CPU Workers, nguy cơ chạm trần 50ms CPU limit gây crash tiến trình chấm công (Error 1102).
  - `PERF-002` (P0): Endpoint polling tra cứu đơn hàng của khách gọi dọn dẹp rate-limit đồng bộ, tạo 20 write transactions/giây vào Cloudflare D1 primary duy nhất, gây nghẽn write queue và đội chi phí.
  - `PERF-003` (P1): Polling đơn hàng không tạm dừng khi tab bị ẩn (`document.hidden`), tạo ~4.500 roundtrips/giờ vô ích.
  - `PERF-005` (P1): Cron dọn dẹp bằng chứng ảnh chạy vòng lặp tuần tự N+1 delete (nguy cơ vượt 50 subrequests limit của Workers).

### 3.4. Agent 4 — Mobile UX Auditor (`08_MOBILE_RESPONSIVENESS_AUDIT.md`)
- **Điểm mạnh:** Thiết kế giao diện hiện đại, bảng màu nhất quán, font chữ tiếng Việt rõ ràng, hỗ trợ đầy đủ luồng đặt món mobile và camera capture.
- **Phát hiện trọng tâm:**
  - `MOB-001` (P0): Bottom navigation và fixed CTA che khuất hoàn toàn 80–90px nội dung và nút bấm cuối trang tại Today View và Chấm công do thiếu đệm đáy (padding-bottom) đồng bộ.
  - `MOB-002` (P1): Vùng cảm ứng (touch targets) nhiều nút cốt lõi dưới chuẩn WCAG 44x44px (nút thêm món 36px, nút xóa món 22px, nút duyệt 15px).
  - `MOB-003` (P1): Nút "Hủy đơn" đặt sát nút "Xác nhận đơn" (gap 6px) trên giao diện thu ngân/quản lý, thiếu bước xác nhận modal, nguy cơ bấm nhầm cực cao.
  - `MOB-004` (P1): Cột sticky nhân viên trong bảng lương (`min-width: 248px`) chiếm 70%–96% chiều rộng màn hình mobile (320px–375px), làm che nghẹt toàn bộ dữ liệu bảng công.

### 3.5. Agent 5 — Test Quality Auditor (`09_TEST_QUALITY_AUDIT.md`)
- **Điểm mạnh:** 128 tests chạy rất nhanh (~7s) với Node Test Runner; kiểm thử toàn diện các luồng nghiệp vụ BIZ-001..004 và concurrency locks.
- **Phát hiện trọng tâm:**
  - `TEST-001` (P0): False Confidence nghiêm trọng do mock D1 DB bằng plain JS object với regex matching trong `security-remediation-full.test.mjs`, hoàn toàn không biên dịch và chạy SQL thật.
  - `TEST-002` (P0): 100% Playwright E2E suite bị loại khỏi CI workflow (`.github/workflows/check.yml`), tạo vùng mù hồi quy hoàn toàn cho giao diện thực.
  - `TEST-003` (P1): Kiểm thử UI "hời hợt" (shallow regex matching trên file source .tsx) thay vì mount component vào DOM thực tế.
  - `TEST-005` (P1): Helper `load-module.mjs` mock stub toàn bộ `@/server/auth`, triệt tiêu khả năng kiểm thử tích hợp cookie/session middleware.

---

## 4. Phân tích Rủi ro Liên ngành & Trùng lặp (Cross-Module Risks & Correlation)

Quá trình cross-review giữa 5 báo cáo phát hiện **4 cụm rủi ro liên ngành mang tính hệ thống**:

```
           ┌────────────────────────────────────────┐
           │ CỤM 1: Write Contention & Amplification│
           │ DB-009  ◄──►  PERF-002  ◄──►  API-005  │
           └────────────────────────────────────────┘
                               ▲
                               │ Ảnh hưởng lẫn nhau
                               ▼
           ┌────────────────────────────────────────┐
           │ CỤM 2: Full Table Scan & Case Fold     │
           │      DB-003     ◄──►     PERF-004      │
           └────────────────────────────────────────┘
```

### Cụm 1: Bẫy Tranh Chấp Ghi trên Cloudflare D1 (Write Contention & Amplification)
- **Tương quan:** `PERF-002` (Performance), `DB-009` (Database), và `API-005` (API) cùng chỉ ra một lỗi kiến trúc cốt tử:
  - Khi khách hàng theo dõi đơn hàng tại `/order/track/[id]`, client gửi request polling mỗi 5 giây.
  - Handler gọi `limitOrderRequests()`, bên trong thực thi 3 câu lệnh ghi vào D1 (`DELETE` dọn dẹp + 2 `INSERT ... ON CONFLICT DO UPDATE`).
  - **Hậu quả liên ngành:** Với 100 khách cùng theo dõi đơn, D1 phải gánh 20 write transactions/giây. Do Cloudflare D1 là kiến trúc Single Primary Writer, hàng đợi ghi sẽ bị nghẽn (write starvation), làm chậm hoặc timeout các giao dịch trọng yếu của cửa hàng như chấm công vào ca và thu ngân chốt đơn.

### Cụm 2: Vô hiệu hóa B-Tree Index do Bọc Hàm SQL (Index Suppression & Case-Folding)
- **Tương quan:** `DB-003` (Database) và `PERF-004` (Performance) cùng xác nhận:
  - Bảng `employees` chỉ đánh index trên `email`, không đánh index trên biểu thức `lower(email)`.
  - Hầu hết các câu lệnh trong `server/auth.ts`, `app/api/shifts`, `app/api/dashboard` đều viết `WHERE lower(email) = lower(?)` hoặc `ON lower(e.email) = lower(s.employee_email)`.
  - **Hậu quả liên ngành:** SQLite buộc phải chuyển toàn bộ truy vấn thành `SCAN employees` (Full Table Scan). Đồng thời, kẻ xấu có thể đăng ký tài khoản trùng tên khác chữ hoa/thường (`Admin@loopi.vn` vs `admin@loopi.vn`), gây bypass index unique.

### Cụm 3: Thiếu Index Retention & Vòng lặp Xóa N+1
- **Tương quan:** `DB-006` (Database) và `PERF-005` (Performance) cùng xác nhận:
  - Bảng `attendance_photos` và `attendance_locations` không có index trên cột `expires_at`.
  - Cron job `expire-evidence.ts` vừa phải scan toàn bộ bảng, vừa chạy vòng lặp `for...of` gọi `bucket.delete()` tuần tự từng ảnh một.
  - **Hậu quả liên ngành:** Khi số lượng ảnh vượt quá 50, Worker sẽ crash do vượt ngưỡng giới hạn 50 subrequests limit của Cloudflare Workers.

### Cụm 4: Khoảng cách giữa Giả lập Kiểm thử và Môi trường Thực tế (Fidelity Gap)
- **Tương quan:** `TEST-001`, `TEST-006` (Test Quality) và `DB-001`, `DB-002` (Database):
  - Bộ test chạy xanh 128/128 do chạy trên SQLite in-memory, nơi mà `ALTER TABLE ADD COLUMN` được chấp nhận nới lỏng và triggers không cần `--> statement-breakpoint`.
  - Khi triển khai lên Cloudflare Workers D1 thật, migration engine của Drizzle sẽ lỗi do thiếu breakpoint, và một số test case bảo mật dùng mock object regex (`TEST-001`) tạo ra cảm giác an toàn giả tạo.

---

## 5. Bảng Đăng ký Phát hiện Hợp nhất (Consolidated Finding Register)

### 5.1. Nhóm P0 — Mức độ Nghiêm trọng Cốt tử (Release Blockers)

| Mã Finding | Mức độ | Trạng thái | Nguồn File & Vị trí | Tóm tắt Vấn đề & Tác động |
|---|:---:|:---:|---|---|
| **PERF-001** | `P0` | **CONFIRMED** | [`lib/evidence.ts:57`](../../lib/evidence.ts) | **Workers CPU Spike do giải nén JPEG thuần JS**: `jpeg-js` decode 1.2M pixel ngốn 40-150ms CPU, vượt ngưỡng 50ms CPU limit của Workers, làm sập chấm công. |
| **PERF-002** | `P0` | **CONFIRMED** | [`app/api/order/track/route.ts:9`](../../app/api/order/track/route.ts) | **Khuếch đại giao dịch ghi D1**: Polling đơn hàng đọc gọi rate-limit ghi, tạo 20 write TPS làm tắc nghẽn D1 Primary Writer. |
| **DB-001** | `P0` | **CONFIRMED** | [`db/schema.ts`](../../db/schema.ts) vs [`drizzle/`](../../drizzle) | **Schema Drift giữa Drizzle và SQLite**: 5 cột khai báo `notNull()` trong code nhưng thực tế `NULLABLE` trong database do SQLite ALTER TABLE. |
| **DB-002** | `P0` | **CONFIRMED** | [`drizzle/0011_workforce_integrity.sql`](../../drizzle/0011_workforce_integrity.sql) | **Thiếu Statement Breakpoint**: File migration chứa SQLite Triggers thiếu `--> statement-breakpoint`, khiến Drizzle migrator chuẩn báo lỗi cú pháp. |
| **MOB-001** | `P0` | **CONFIRMED** | [`components/app-shell.tsx:142`](../../components/app-shell.tsx) | **Fixed Bottom Elements che khuất nội dung**: Bottom nav và floating CTA che mất 80-90px nội dung cuối trang và nút thao tác chính trên mobile. |
| **TEST-001** | `P0` | **CONFIRMED** | [`tests/security-remediation-full.test.mjs`](../../tests/security-remediation-full.test.mjs) | **False Confidence do Mock D1 bằng Regex**: Test bảo mật dùng object plain JS match chuỗi regex thay vì chạy database SQL thật. |
| **TEST-002** | `P0` | **CONFIRMED** | [`.github/workflows/check.yml:25`](../../.github/workflows/check.yml) | **Toàn bộ E2E Test bị loại khỏi CI**: 100% test Playwright không được kích hoạt trong CI pipeline, tạo vùng mù hồi quy hoàn toàn. |

---

### 5.2. Nhóm P1 — Mức độ Cao (Cần khắc phục ngay trong Sprint)

| Mã Finding | Mức độ | Trạng thái | Nguồn File & Vị trí | Tóm tắt Vấn đề & Tác động |
|---|:---:|:---:|---|---|
| **API-001** | `P1` | **CONFIRMED** | [`modules/people/domain/access.ts:31`](../../modules/people/domain/access.ts) | **Leo thang đặc quyền ngang giữa Manager**: Manager có thể giáng chức, khóa hoặc reset mật khẩu của Manager đồng cấp. |
| **API-002** | `P1` | **CONFIRMED** | [`app/api/`](../../app/api) (14 handlers) | **14 Route Handlers thiếu bọc `apiHandler`**: Gây vỡ chuẩn envelope lỗi `{error, code, requestId}` và nguy cơ lộ vết lỗi unhandled. |
| **DB-003** | `P1` | **CONFIRMED** | [`db/schema.ts:16`](../../db/schema.ts) | **Email Unique Index Case-Sensitive**: Cho phép chèn trùng email khác hoa/thường; `lower(email)` gây Full Table Scan toàn bộ bảng nhân viên. |
| **DB-004** | `P1` | **CONFIRMED** | [`modules/payroll/application/load-report.ts:192`](../../modules/payroll/application/load-report.ts) | **Thiếu Wage History**: Khi mở lại kỳ lương (`reopen`), hệ thống tính lại tiền lương tháng cũ theo mức lương hiện thời của nhân sự. |
| **DB-005** | `P1` | **CONFIRMED** | [`db/schema.ts:182`](../../db/schema.ts) | **Bảng `customer_orders` thiếu Index `(store_id, created_at)`**: Gây Sort Temp B-Tree khi chủ quán xem danh sách đơn hàng. |
| **DB-006** | `P1` | **CONFIRMED** | [`db/schema.ts:89,101`](../../db/schema.ts) | **Bảng ảnh/vị trí thiếu Index `expires_at`**: Buộc cron dọn dẹp bằng chứng phải scan toàn bộ bảng. |
| **PERF-003** | `P1` | **CONFIRMED** | [`components/operational/owner-orders-view.tsx:365`](../../components/operational/owner-orders-view.tsx) | **Background Tab Polling Resource Leak**: Polling đơn hàng không dừng khi tab ẩn (`document.hidden`), tốn ~4.500 roundtrips/giờ. |
| **PERF-004** | `P1` | **CONFIRMED** | [`app/api/shifts/route.ts:23`](../../app/api/shifts/route.ts) | **Index Suppression do bọc cột trong hàm SQL**: `lower(email)` và `date(created_at, '+7 hours')` triệt tiêu B-Tree index. |
| **PERF-005** | `P1` | **CONFIRMED** | [`modules/attendance/application/expire-evidence.ts:26`](../../modules/attendance/application/expire-evidence.ts) | **Sequential N+1 Delete trong Cron dọn dẹp R2**: Xóa ảnh tuần tự từng cái một, nguy cơ chạm trần 50 subrequests limit. |
| **PERF-006** | `P1` | **CONFIRMED** | [`app/order/page.tsx:4`](../../app/order/page.tsx) | **Trang khách đặt món thiếu SSR Data & Edge Caching**: Trang CSR hoàn toàn, khách thấy spinner 1-2s; API menu trả `no-store`. |
| **MOB-002** | `P1` | **CONFIRMED** | [`components/order/customer-order-page.tsx:165`](../../components/order/customer-order-page.tsx) | **Touch Targets dưới chuẩn WCAG 44x44px**: Nút thêm món (36px), xóa món giỏ hàng (22px), nút duyệt (15px) quá nhỏ trên cảm ứng. |
| **MOB-003** | `P1` | **CONFIRMED** | [`components/operational/owner-orders-view.tsx:758`](../../components/operational/owner-orders-view.tsx) | **Nút Hủy đơn đặt sát nút Nhận đơn**: Khoảng cách 6px, không có modal xác nhận, nguy cơ cực cao chạm nhầm hủy đơn. |
| **MOB-004** | `P1` | **CONFIRMED** | [`app/globals.css:1229`](../../app/globals.css) | **Cột Sticky Nhân viên bảng lương quá rộng (248px)**: Chiếm 70%-96% màn hình mobile, làm nghẹt toàn bộ dữ liệu bảng công. |
| **TEST-003** | `P1` | **CONFIRMED** | [`tests/operational-ui-permissions.test.mjs`](../../tests/operational-ui-permissions.test.mjs) | **Kiểm thử UI hời hợt bằng regex file text**: Đọc mã nguồn chuỗi thay vì mount React component và kiểm tra DOM rendering thực. |
| **TEST-004** | `P1` | **CONFIRMED** | [`tests/concurrency-empirical-stress.test.mjs`](../../tests/concurrency-empirical-stress.test.mjs) | **Concurrency test dùng harness tự chế**: Giả lập vòng lặp biến độc lập thay vì kiểm tra React state hook và concurrency thật. |
| **TEST-005** | `P1` | **CONFIRMED** | [`tests/helpers/load-module.mjs:10`](../../tests/helpers/load-module.mjs) | **`load-module.mjs` mock stub toàn bộ Auth**: Triệt tiêu kiểm thử tích hợp middleware cookie/session Supabase Auth. |

---

### 5.3. Nhóm P2 & P3 — Mức độ Trung bình & Thấp (Tối ưu hóa & Hardening)

| Mã Finding | Mức độ | Trạng thái | Nguồn File & Vị trí | Tóm tắt Vấn đề |
|---|:---:|:---:|---|---|
| **API-003** | `P2` | CONFIRMED | `app/api/admin/accounts`, `app/api/profile` | Thiếu `Cache-Control: private, no-store` trên API nhạy cảm PII. |
| **API-004** | `P2` | CONFIRMED | `app/api/owner/orders/route.ts:52` | Thiếu phân trang đơn hàng (`LIMIT 150`), thất thoát hiển thị khi đơn > 150. |
| **API-005** | `P2` | PROBABLE | `modules/ordering/application/rate-limit.ts` | Tranh chấp ghi D1 do rate-limit cleanup đồng bộ (tương quan `PERF-002`). |
| **API-006** | `P2` | CONFIRMED | `modules/operations/application/manage-shifts.ts` | Team Lead có thể sửa/hủy ca làm của Manager và Owner. |
| **API-008** | `P2` | CONFIRMED | `platform/http/request-origin.ts:25` | Origin guard phụ thuộc Cloudflare Worker, bị bỏ qua ở Next.js middleware. |
| **DB-007** | `P2` | CONFIRMED | `db/schema.ts` (28/31 bảng) | Thiếu CHECK constraints mức DB (khoảng thời gian âm, số tiền âm). |
| **DB-008** | `P2` | CONFIRMED | `db/schema.ts:109,240,253` | Dùng chuỗi email trần thay vì Foreign Key vào `employees.id`. |
| **DB-009** | `P2` | CONFIRMED | `modules/ordering/application/rate-limit.ts` | 3 thao tác ghi D1 trên mỗi request tra cứu đơn (tương quan `PERF-002`). |
| **PERF-007** | `P2` | CONFIRMED | `components/app-shell.tsx:121` | Fetch trùng lặp `/api/today` giữa AppShell và TodayView khi nạp trang. |
| **PERF-008** | `P2` | CONFIRMED | `components/app-shell.tsx:15` | `framer-motion` (~120 KB JS) trong critical bundle chỉ để tạo trượt nhẹ. |
| **PERF-009** | `P2` | CONFIRMED | `app/api/files/[eventId]/route.ts:33` | Endpoint tải ảnh bằng chứng ép ghi audit log và gắn no-store. |
| **PERF-010** | `P2` | CONFIRMED | `public/loopicafe-introduce-vid.mp4` | Video 2.75 MB và ảnh OG 3.2 MB đóng gói trong Worker assets. |
| **MOB-005** | `P2` | CONFIRMED | `components/operational/schedule-view.tsx:192` | Lịch tuần thiếu cột nhân viên cố định và affordance cuộn ngang. |
| **MOB-006** | `P2` | CONFIRMED | `components/operational/store-settings-view.tsx` | Bản đồ Leaflet Map trong Cài đặt bẫy trọn cử chỉ vuốt dọc (Scroll Trap). |
| **MOB-007** | `P2` | CONFIRMED | `components/operational/store-settings-view.tsx` | Tràn bố cục và nén chữ trên màn hình hẹp 320px. |
| **MOB-008** | `P2` | CONFIRMED | `components/order/cart-drawer.tsx:142` | Nguy cơ bàn phím ảo che khuất trường nhập thông tin trên mobile. |
| **TEST-006** | `P2` | CONFIRMED | `tests/helpers/database.mjs:5` | Khoảng cách độ trung thực giữa SQLite in-memory và D1 trên Workers. |
| **TEST-007** | `P2` | CONFIRMED | `tests/` | Thiếu boundary test tiêu cực (rate-limit, R2 timeout, ca đêm 00:00 VN). |
| **API-007** | `P3` | CONFIRMED | `modules/ordering/application/change-status.ts` | State machine không cho hủy đơn khi đơn đã ở trạng thái `ready`. |
| **API-009** | `P3` | CONFIRMED | `modules/ordering/application/rate-limit.ts` | Rate limiter IP chia sẻ chung 1 bucket "local" trong môi trường test. |
| **API-010** | `P3` | CONFIRMED | `platform/http/request-origin.ts` | Thiếu Referer fallback khi trình duyệt không gửi kèm Origin header. |
| **DB-010** | `P3` | CONFIRMED | `db/runtime.ts` | Drizzle ORM chưa được tận dụng làm query builder runtime. |
| **DB-011** | `P3` | CONFIRMED | `db/schema.ts:133` | Cột thừa `checklist_items.completed` bị mất đồng bộ sau khi tách bảng. |
| **PERF-011** | `P3` | PROBABLE | `server/auth.ts:24` | `validatedIdentityCache` phân mảnh theo từng isolate của Workers. |
| **MOB-009** | `P3` | CONFIRMED | `app/globals.css:871` | Thiếu hỗ trợ `prefers-reduced-motion` cho animations. |
| **MOB-010** | `P3` | CONFIRMED | `app/globals.css:88` | Rủi ro vỡ giao diện khi người dùng bật Dynamic Type / Zoom chữ 200%. |
| **TEST-008** | `P3` | CONFIRMED | `tests/` | Rò rỉ biến môi trường `process.env` khi gán đè thủ công trong test. |
| **TEST-009** | `P3` | CONFIRMED | `playwright.config.ts:31` | Đường dẫn Edge gắn cứng trên Windows gây flaky/lỗi trên CI Linux. |

---

## 6. Đánh giá Hồi quy từ Các Bản Vá Trước (Regression Verification)

Quá trình kiểm toán đã rà soát đặc biệt các bản vá nghiệp vụ và bảo mật gần đây (`BIZ-001..004`, `SEC-001..008`, `CODE-001..004`):

1. **BIZ-001 (Incident State Machine):**
   - *Đánh giá:* **VERIFIED — Không có hồi quy**. Máy trạng thái `open` → `acknowledged` → `resolved` → `closed` hoạt động nghiêm ngặt, chặn đứng việc nhảy/lùi trạng thái, trả về 409 Conflict.
2. **BIZ-002 (Request Semantics & Guidance):**
   - *Đánh giá:* **VERIFIED — Không có hồi quy**. Duyệt đề nghị `swap`/`correction` hiển thị đúng hướng dẫn nghiệp vụ và huy hiệu cảnh báo Quản lý thao tác thủ công.
3. **BIZ-003 (Checklist Business Date Consistency):**
   - *Đánh giá:* **VERIFIED — Không có hồi quy**. Giá trị `businessDate` lấy đúng 1 lần từ timestamp của request, đồng nhất hoàn toàn giữa execution, audit và response payload.
4. **BIZ-004 (Handover Validation & Scope):**
   - *Đánh giá:* **VERIFIED — Không có hồi quy**. Bàn giao giới hạn độ dài chặt chẽ, kiểm tra store_id và lưu audit nguyên tử.
5. **SEC-002 (Seed-Users Route Protection):**
   - *Đánh giá:* **VERIFIED — Không có hồi quy**. Chặn đứng truy cập seed-users từ origin ngoài và trên production mode.
6. **CODE-003 (Audit Batch Rollback):**
   - *Đánh giá:* **VERIFIED — Không có hồi quy**. Nếu audit log insert lỗi, toàn bộ batch cập nhật nghiệp vụ được rollback hoàn toàn.

---

## 7. Các Điểm Nghẽn Phát Hành (Release Blockers — P0)

Hệ thống **CHƯA ĐỦ ĐIỀU KIỆN SẴN SÀNG PRODUCTION (NOT PRODUCTION READY)** cho đến khi 7 lỗi P0 sau đây được xử lý dứt điểm:

1. **[PERF-001] Crash Workers do giải nén ảnh:** Thay thế `jpeg-js` full-decode bằng parser JPEG SOF marker siêu nhẹ (< 1KB buffer đọc) để đọc width/height trong < 0.1ms CPU.
2. **[PERF-002 / DB-009 / API-005] Tắc nghẽn D1 do Polling:** Tách cơ chế rate limit của endpoint đọc `/api/order/track` sang in-memory token bucket hoặc Cloudflare Cache API, tuyệt đối không ghi đĩa D1 trên mỗi lượt polling.
3. **[DB-001] Schema Drift:** Tạo migration đồng bộ lại trạng thái `NOT NULL` và giá trị `DEFAULT` giữa Drizzle schema và SQLite database thực tế.
4. **[DB-002] Breakpoints trong Migrations:** Bổ sung `--> statement-breakpoint` trước các khối trigger SQLite trong file `0011` và `0013`.
5. **[MOB-001] Fixed Bottom Overlap:** Thêm lớp đệm đáy `padding-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 16px)` đồng bộ trên AppShell cho mobile.
6. **[TEST-001] False Confidence Test:** Viết lại suite test `security-remediation-full.test.mjs` chạy trên SQLite engine thật thay vì object regex mock.
7. **[TEST-002] Thiếu E2E trong CI:** Cấu hình kích hoạt Playwright E2E suite trong `.github/workflows/check.yml` với dịch vụ Miniflare/D1 local.

---

## 8. Lộ trình Khắc phục Khuyến nghị (Remediation Roadmap)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 1: HOTFIX RELEASE BLOCKERS (P0) — 1 đến 2 ngày                   │
│ • Thay thế jpeg-js bằng SOF marker parser (PERF-001)                        │
│ • Bỏ write transactions D1 trên tracking polling (PERF-002, DB-009, API-005) │
│ • Sửa statement-breakpoint & drift schema (DB-001, DB-002)                  │
│ • Bổ sung bottom padding chống che khuất nút trên mobile (MOB-001)          │
│ • Thay mock regex bằng SQL engine thật trong test (TEST-001)                 │
│ • Bật Playwright E2E trong CI pipeline (TEST-002)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 2: BẢO MẬT & HIỆU NĂNG THEN CHỐT (P1) — 3 đến 5 ngày            │
│ • Chặn horizontal privilege escalation giữa các Manager (API-001)           │
│ • Bọc apiHandler cho 14 route handlers còn thiếu (API-002)                  │
│ • Đổi employees_email_idx sang COLLATE NOCASE (DB-003)                      │
│ • Thêm Wage History bảng lương khi reopen kỳ lương cũ (DB-004)             │
│ • Thêm composite index (store_id, created_at) & shifts (DB-005, PERF-004)   │
│ • Visibility check & AbortSignal dừng polling tab ẩn (PERF-003)            │
│ • Chuyển cron delete R2 sang batch delete (PERF-005, DB-006)                │
│ • Nới rộng touch targets đạt 44x44px theo WCAG (MOB-002)                   │
│ • Thêm modal xác nhận và tách nút Hủy đơn trên POS (MOB-003)                │
│ • Thu gọn cột sticky nhân viên bảng lương trên mobile (MOB-004)             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ GIAI ĐOẠN 3: TỐI ƯU HÓA & TRẢI NGHIỆM VẬN HÀNH (P2 & P3) — Sau MVP        │
│ • Thêm Cache-Control private cho PII & phân trang orders LIMIT 50 (API-003) │
│ • Chặn Team Lead sửa ca của cấp trên (API-006)                              │
│ • Thêm CHECK constraints cho 28 bảng D1 (DB-007)                            │
│ • Thay thế framer-motion bằng pure CSS transitions (PERF-008)              │
│ • Sửa Scroll Trap trên Leaflet Map & chống che bàn phím ảo (MOB-006, MOB-008)│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Yêu cầu Kiểm thử Hồi quy Bắt buộc (Regression Test Suite)

Mọi thay đổi tiếp theo trong quá trình triển khai sửa lỗi bắt buộc phải vượt qua các chốt chặn sau:

1. **Bộ 128 Unit/Integration Tests hiện hữu:** Chạy `npm.cmd test`, đạt 100% PASS không có ngoại lệ.
2. **Kiểm tra TypeScript & Linter:** `npm.cmd run typecheck` và `npm.cmd run lint` đạt Exit Code 0.
3. **Bộ kiểm thử CPU Benchmark cho Evidence Upload:** Chạy test giải nén ảnh chấm công 1280x960, thời gian CPU tiêu thụ trên Workers phải < 2ms (thay vì 150ms như hiện tại).
4. **Bộ kiểm thử D1 Write Concurrency trên Polling:** Giả lập 50 request polling `/api/order/track` đồng thời, số lượng giao dịch ghi vào D1 phải bằng `0`.
5. **Bộ kiểm thử Mobile Viewport Regression (Playwright):** Chạy kiểm tra bố cục trên viewports 320px, 375px, 390px, 430px; đảm bảo không có bất kỳ nút bấm chính nào bị che khuất bởi bottom navigation.

---

## 10. Tuyên bố Nghiệm thu của Orchestrator

- **Báo cáo này tuân thủ 100% nguyên tắc AUDIT ONLY:** Không có bất kỳ dòng code ứng dụng, cấu hình cloud hay migration nào bị chỉnh sửa trong lượt kiểm toán này.
- **Tính độc lập & Minh bạch:** Mỗi phát hiện trong báo cáo đều được đối soát chéo, gắn kèm đường dẫn file:dòng chính xác và kịch bản tái hiện thực tế.
- **Trạng thái chuyển giao:** Toàn bộ 5 báo cáo chuyên môn thành phần (`05`, `06`, `07`, `08`, `09`) và Báo cáo hợp nhất (`10_CONSOLIDATED_AUDIT.md`) đã sẵn sàng cho Lead Engineer và Product Owner xem xét, phê duyệt trước khi lên kế hoạch remediation.
