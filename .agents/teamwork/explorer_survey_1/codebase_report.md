# Báo cáo Khảo sát Kiến trúc và Hiện trạng Codebase (P00–P09)

**Người thực hiện**: `explorer_survey_1` (Teamwork Explorer)  
**Thời điểm khảo sát**: 2026-10-13T16:30:00Z  
**Git Baseline**: Commit `888495ba3fddf4798b80f9a1cbe4aec65c0991b8` (`feat: harden operations and improve mobile workflows`)  
**Tài liệu đối chiếu**:
- `AGENTS.md`
- `docs/business-rules.md` (DEC-001..009, BR-001..RET-003)
- `docs/implementation-status.md`
- `docs/implementation-plan.md` (P00–P09)
- `docs/permissions.md`
- `docs/acceptance-matrix.md` (ACC-01..13)

---

## 1. Tổng quan Kiến trúc Hệ thống

### 1.1. Kiến trúc Tổng thể & Công nghệ
- **Mô hình**: Modular Monolith phục vụ 1 cửa hàng cafe (pilot/MVP).
- **Runtime & Hosting**: Cloudflare Workers thông qua Vinext (`vinext/server/app-router-entry` tại `worker/index.ts`). Tương thích Next.js 16.4.0 App Router (`app/` directory).
- **Frontend**: React 19.2.6, Tailwind CSS 4.2.1, Lucide React 0.468.0, Framer Motion 12.43.0, Leaflet 1.9.4.
- **Cơ sở dữ liệu & ORM**: Cloudflare D1 (SQLite) quản lý bằng Drizzle ORM 0.45.2 (`db/schema.ts`, `drizzle/0000..0014`).
- **Lưu trữ Blob/Ảnh**: Cloudflare R2 private bucket (`EVIDENCE` binding) lưu ảnh chấm công SVG đóng dấu máy chủ.
- **Xác thực**: Supabase Auth (`@supabase/ssr` 0.12.4, `@supabase/supabase-js` 2.111.0) kết hợp cache token SLA 10s tại máy chủ (`server/auth.ts`) và middleware đồng bộ cookie (`middleware.ts` -> `server/session.ts`).
- **Kiểm thử**: Node Test Runner (`node --experimental-strip-types --test tests/*.test.mjs`), Playwright 1.58.2 (`playwright.config.ts`), in-memory SQLite (`node:sqlite` DatabaseSync) tại `tests/helpers/database.mjs`.

### 1.2. Cấu trúc Thư mục và Điểm vào (Entry Points)
```
loopicafe-management-system/
├── worker/
│   └── index.ts                 # Worker entrypoint: fetch handler, vinext app-router, image optimization, origin guard
├── middleware.ts                # Next.js middleware export từ server/session.ts (bảo vệ /app, nonce CSP)
├── server/
│   ├── auth.ts                  # getApiUser, requireApiUser, cache danh tính, consent version, token SHA-256
│   ├── session.ts               # synchronizeSession, Supabase SSR client, Dynamic CSP nonce
│   └── audit.ts                 # auditStatement (ghi log bất biến vào audit_events)
├── platform/
│   ├── http/errors.ts           # apiHandler, ApplicationError
│   ├── http/input.ts            # readObject (giới hạn byte, parse an toàn)
│   └── http/request-origin.ts   # rejectCrossOriginMutation
├── db/
│   ├── runtime.ts               # getBindings (D1 DB, R2 EVIDENCE), STORE_ID, CONSENT_VERSION
│   ├── schema.ts                # Toàn bộ Drizzle SQLite table definitions
│   └── seed.ts                  # Seed script ban đầu
├── drizzle/                     # 15 migration files (0000_...sql đến 0014_indexes_and_perf.sql)
├── modules/                     # Domain & Application Service layers
│   ├── people/                  # Domain access, update-access, auth flows
│   ├── operations/              # Business day, manage-shifts, create-request, decide-request
│   ├── attendance/              # Attendance policy, review, correct, expire-evidence, load-photo
│   ├── payroll/                 # Period resolution, load-report, locked-report, change-period, add-adjustment
│   └── ordering/                # Input validation, rate-limit, change-status, create-order, track-order
├── app/
│   ├── api/                     # Next.js Route Handlers (REST endpoints)
│   └── (app routes, pages)      # Giao diện người dùng Next.js
├── components/                  # React UI components (operational views, order views, UI primitives)
└── tests/                       # Unit & integration test suites
```

---

## 2. Kết quả Khảo sát Chi tiết theo 8 Trọng tâm Nghiệp vụ

### 2.1. Xác thực & Phân quyền (Auth & Permissions — DEC-001 / P01)
- **Hiện trạng quan sát**:
  - `server/auth.ts`: `requireApiUser(roles)` kiểm tra role nếu danh sách roles được truyền vào.
  - `modules/people/domain/access.ts`: Hàm `canManageEmployee` và `canAssignRole` chỉ cho phép OWNER quản lý mọi người (trừ system_admin), MANAGER quản lý employee (chặn target là owner, manager, system_admin).
  - `modules/people/application/update-access.ts`: Chặn tự vô hiệu hóa tài khoản (`actor.id === employeeId && status !== 'active'`) và chặn xóa/hạ quyền Owner hoạt động cuối cùng (`EXISTS (SELECT 1 FROM employees other WHERE other.role = 'owner'...)`).
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Thiếu hoàn toàn Server-Side Self-Approval Guard**: Tại `modules/operations/application/decide-request.ts`, `modules/attendance/application/review-attendance.ts`, và `modules/attendance/application/correct-attendance.ts`, code không hề kiểm tra `actor.id !== target.id` hoặc `actor.email !== target.email`. Người có quyền Manager/Owner có thể tự duyệt đơn xin nghỉ, tự duyệt ngoại lệ chấm công, hoặc tự sửa giờ công của chính mình.
  2. **Quyền của `team_lead` bị cấp quá rộng**: Trong `decide-request.ts`, `review-attendance.ts`, và `correct-attendance.ts`, danh sách role được phép là `["owner", "manager", "team_lead"]`. Theo DEC-001 / ROLE-004, `team_lead` chỉ là Trưởng ca vận hành, **tuyệt đối không được duyệt nghỉ, không được sửa công, không được duyệt ngoại lệ công, không được chốt lương**.
  3. **`system_admin` chưa bị chặn ở các Endpoint Nghiệp vụ**: Nhiều route gọi `requireApiUser()` không truyền tham số `roles` (ví dụ: `app/api/checklists/route.ts`, `app/api/today/route.ts`, `app/api/shifts/route.ts`, `app/api/attendance/actions/route.ts`). Nếu tài khoản có role `system_admin` đăng nhập, họ vẫn vượt qua được các API nghiệp vụ này.
  4. **Chưa có luồng `sole_owner_self_correction`**: Khi cửa hàng chỉ có 1 Owner duy nhất, việc tự sửa công của chính mình phải đi qua workflow riêng biệt: kiểm tra đếm số Owner active = 1, ghi cờ audit ưu tiên cao (high-priority flag), bắt buộc lý do và diff trước/sau. Hiện tại code chỉ chạy chung luồng thông thường.

---

### 2.2. Vòng đời Lịch làm việc & Cut-off (Shift Scheduling & Cut-offs — DEC-002 / P02)
- **Hiện trạng quan sát**:
  - `db/schema.ts` & `shifts`: Trạng thái ca gồm `draft`, `published`, `cancelled`, `completed`.
  - `modules/operations/application/manage-shifts.ts`:
    - `createShifts`: Luôn insert ca với `status: 'published'` và tạo ngay thông báo `shift_published`. Chưa hỗ trợ tạo ca `draft`.
    - `changeShift`: Cho phép sửa hoặc hủy ca đã xuất bản dựa trên `revision` và kiểm tra không có `attendance_sessions` liên kết.
  - `drizzle/0011_workforce_integrity.sql`: Database trigger `shifts_no_overlap_insert` và `shifts_no_overlap_update` chặn mọi ca trùng giờ của cùng một nhân viên có `status IN ('draft', 'published')`.
  - `drizzle/0013_workforce_guardrails.sql`: Trigger `shifts_locked_period_insert` chặn thêm ca trong kỳ lương đã khóa (`finalized`/`paid`).
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Chưa có Vòng đời Draft**: Thiếu endpoint và luồng ứng dụng để lưu ca nháp (draft), ẩn hoàn toàn với nhân viên (không check-in, không tính vắng mặt), và hành động xuất bản (`publish`) theo lô kèm kiểm tra atomic.
  2. **Chưa có Ngưỡng Cut-off 12 giờ**: Trong `changeShift`, ca có thể được sửa/hủy trực tiếp sát giờ làm (miễn là chưa có session chấm công). Không có logic kiểm tra `starts_at - 12 hours`.
  3. **Thiếu Luồng Điều chỉnh Ca (Shift Adjustment)**: Khi trong vòng 12 giờ trước ca, mọi thay đổi phải bắt buộc đi qua luồng điều chỉnh có lý do, ghi nhận audit và lưu vết trước/sau thay vì UPDATE đè.
  4. **Xung đột Trigger giữa Draft và Published**: Trigger `shifts_no_overlap_insert` hiện tại chặn overlap trên cả `draft` và `published`. Nếu một ca nháp được tạo, nó sẽ chặn ca làm việc thực tế, vi phạm nguyên tắc "nháp không giữ chỗ cứng hoặc làm ảnh hưởng ca thật".

---

### 2.3. Đổi ca Nguyên tử & Đơn vị Xin nghỉ (Shift Swaps & Leave — DEC-003 / P03)
- **Hiện trạng quan sát**:
  - `db/schema.ts` & `requests`: Hỗ trợ loại `leave`, `swap`, `correction`.
  - `modules/operations/application/create-request.ts`: Tạo yêu cầu có khóa chống trùng `client_request_key`. Đơn xin nghỉ yêu cầu `shiftId`.
  - `modules/operations/application/decide-request.ts`:
    - Với `leave`: Cập nhật `shifts.approved_leave_request_id = requests.id` để đánh dấu ca đã duyệt nghỉ.
    - Với `swap`: Chỉ đổi trạng thái `requests.status = 'approved'`, sau đó trả về flag `requiresManualAction: true` và chuỗi hướng dẫn: *"Đề nghị đổi ca đã duyệt nguyên tắc. Quản lý cần chủ động cập nhật lại Lịch làm việc để áp dụng thay đổi."*
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Đổi ca (Swap) Chưa có Giao dịch Nguyên tử**: Không có trạng thái `approved_pending_apply → applied`. Đơn đổi ca hiện tại không lưu ca đối ứng (peer shift) hay nhân viên đối ứng (peer employee). Không có transaction cập nhật đồng thời cả hai ca trên D1.
  2. **Thiếu Chức năng Rút đơn (`withdraw`)**: Khi yêu cầu còn ở trạng thái `pending`, người tạo không có API hay nút bấm để rút đơn.
  3. **Khả năng xung đột trigger khi Swap**: Khi cập nhật tuần tự 2 dòng shifts để hoán đổi 2 nhân viên trong cùng một khung giờ, lệnh UPDATE thứ nhất sẽ ngay lập tức vi phạm trigger `shifts_no_overlap_update` nếu không có cơ chế giao dịch hoặc chuyển trạng thái trung gian thích hợp.

---

### 2.4. Quy chuẩn Chấm công & Tự đóng ca (Time Tracking & Auto-close — DEC-004 / P04)
- **Hiện trạng quan sát**:
  - `app/api/attendance/capture-sessions/route.ts`: Phiên chụp ảnh hợp lệ trong 60 giây, kiểm tra rate limit (8 lần/phút) và lưu hash nonce.
  - `app/api/attendance/actions/route.ts`: Check-in/check-out chụp ảnh SVG đóng dấu kèm tọa độ GPS gửi lên R2 và D1. Giữ nguyên tắc một nhân viên chỉ có một phiên mở (`active_attendance_session_employee_idx`).
  - Tính giờ làm hiện tại:
    ```typescript
    const workedMinutes = activeSession.opened_at
      ? Math.max(0, Math.floor((Date.parse(recordedAt) - Date.parse(activeSession.opened_at)) / 60_000))
      : null;
    ```
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Không tách biệt Giờ ghi nhận và Giờ tính lương**: Code tính phút làm việc trực tiếp từ thời điểm bấm máy thực tế (`recordedAt`), không có cấu trúc dữ liệu hay trường lưu trữ tách biệt giữa `recorded_time`, `effective_time`, `approved_minutes`, và `payable_minutes`.
  2. **Chưa áp dụng Dung sai 5 phút và Biên ngoài ca 15 phút**: Chưa có logic cắt giờ về khung ca kế hoạch (clip to schedule) nếu check-in sớm trong vòng 15 phút hoặc check-out muộn trong vòng 15 phút.
  3. **Chưa có Phê duyệt Tăng ca (Overtime Approval)**: Phút làm việc vượt khung ca chưa được quản lý bằng thực thể phê duyệt tăng ca riêng biệt có actor, lý do và số phút được duyệt.
  4. **Thiếu Job Tự động Đóng ca Quên Checkout (+4h)**: Phiên chấm công quên checkout hiện tại bị treo mở (`closed_at IS NULL`) vĩnh viễn. Không có cron job/scheduler tự động đóng phiên tại `ends_at + 4h` với trạng thái `MISSING_CHECKOUT` và gán phút tính lương = 0 cho đến khi giải trình được duyệt.

---

### 2.5. Lịch sử Đơn giá Lương & Khóa Kỳ Lương (Wages & Payroll — DEC-006 / P05)
- **Hiện trạng quan sát**:
  - `db/schema.ts`: Bảng `employees` chỉ có 1 cột đơn giá duy nhất: `hourly_rate integer`.
  - `modules/payroll/application/load-report.ts`: Lấy đơn giá hiện tại của nhân viên (`row.hourly_rate`), fallback từ `row_snapshot` nếu kỳ đã khóa.
    ```typescript
    const baseSalary = row.compensation_type === "hourly" ? Math.round((approvedMinutes / 60) * effectiveHourlyRate) : 0;
    ```
  - `modules/payroll/application/change-period.ts`: Chốt kỳ lương có kiểm tra khóa lạc quan qua `workforce_revision` của store; lưu JSON snapshot vào `payroll_entries.row_snapshot`.
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Thiếu Bảng Lịch sử Đơn giá (`employee_rate_history`)**: Mọi thay đổi lương trong `app/api/admin/accounts/route.ts` đều ghi đè trực tiếp lên `employees.hourly_rate`. Không có bảng lịch sử theo khoảng hiệu lực `[effective_from, effective_to)`. Khi đổi giá giữa kỳ hoặc tính lương cho ca trong quá khứ, toàn bộ giờ công đều bị tính theo đơn giá mới nhất.
  2. **Chưa Làm tròn Giờ công xuống Block 15 phút**: Thuật toán hiện tại dùng `approvedMinutes / 60` trực tiếp. Quy tắc PAY-001 yêu cầu làm tròn xuống block 15 phút (`Math.floor(minutes / 15) * 15`).
  3. **Chưa Làm tròn Tổng tiền về 1.000 VND**: Thuật toán hiện tại dùng `Math.round(...)` ra số nguyên VND. Quy tắc PAY-005 yêu cầu làm tròn số học tổng thực nhận về 1.000 VND gần nhất (dư từ 500 VND làm tròn lên).
  4. **Snapshot Kỳ lương Thiếu Metadata Chính sách**: Snapshot hiện tại chưa lưu phiên bản công thức tính, mã nguồn đơn giá (rate source ID) và chi tiết phân đoạn giờ công theo từng mức giá.

---

### 2.6. Checklist & Biên bản Bàn giao Ca (Checklists & Handover — DEC-005 / P06)
- **Hiện trạng quan sát**:
  - `db/schema.ts` & `app/api/checklists/route.ts`: Bảng `checklist_executions` có khóa chính là `(item_id, business_date)`.
  - `db/schema.ts` & `app/api/handovers/route.ts`: Bảng `handovers` có `author_email`, `summary`, `manager_attention`, `acknowledged_at`.
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Checklist Chưa Phân loại và Chưa Gắn với Ca**: Khóa chính `(item_id, business_date)` khiến tất cả các ca trong cùng một ngày dùng chung một bản ghi hoàn thành. Nếu ca sáng làm xong, ca chiều mở lên sẽ thấy đã hoàn thành sẵn! Ca đêm qua 00:00 bị nhảy sang business_date mới. Thiếu phân định giữa `daily_routine` (theo ngày) và `shift_routine` (gắn với `shift_id`).
  2. **Bàn giao Ca Chưa Gắn Người/Ca Nhận**: Bảng `handovers` chỉ lưu người viết (`author_email`), không có thông tin ca nhận hoặc người nhận (`receiver_email`, `receiver_shift_id`).
  3. **Chưa có API Xác nhận Bàn giao (`acknowledge`)**: Cột `acknowledged_at` có trong DB nhưng không có endpoint nào cho phép nhân viên nhận ca xác nhận biên bản bàn giao.
  4. **Chưa có Cơ chế Check-in Gate**: Trong `app/api/attendance/capture-sessions/route.ts` và `actions/route.ts`, không có điều kiện kiểm tra bắt buộc nhân viên phải xác nhận bàn giao trước khi check-in, và không có luồng bypass khẩn cấp cho Quản lý.

---

### 2.7. Hủy Đơn hàng & Ghi nhận Hao hụt (Order Cancellation & Waste — DEC-007 / P07)
- **Hiện trạng quan sát**:
  - `modules/ordering/application/change-status.ts`: Chuyển trạng thái đơn qua máy trạng thái: `pending -> accepted -> preparing -> ready -> completed / cancelled`.
  - Hủy đơn kiểm tra `actor.role IN ('owner', 'manager')`, yêu cầu `cancelReason` là chuỗi tự do (tối thiểu 3 ký tự).
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Lý do Hủy là Free-text, Thiếu Reason Enum Chuẩn hóa**: Khi hủy đơn ở trạng thái `preparing` hoặc `ready`, DEC-007 / ORD-007 bắt buộc phải chọn mã lý do chuẩn hóa: `customer_abandoned`, `item_preparation_error`, hoặc `store_incident`.
  2. **Chưa có Báo cáo Hao hụt (Spoilage Report)**: Chưa có endpoint hay module tính toán thống kê số lượng món, giá trị bán snapshot của các món bị hủy sau chế biến để đối soát thất thoát.

---

### 2.8. Chu kỳ Lưu trữ & Ẩn danh hóa Dữ liệu (Retention & Anonymization — DEC-008 / P08)
- **Hiện trạng quan sát**:
  - `modules/attendance/application/expire-evidence.ts` & `app/api/cron/retention/route.ts`: Xóa ảnh chấm công trên R2 và xóa tọa độ GPS trên D1 sau 90 ngày (`expires_at <= now`).
- **Chênh lệch & Lỗ hổng so với Quy tắc Nghiệp vụ**:
  1. **Hoàn toàn Chưa có Ẩn danh hóa Đơn hàng sau 180 ngày**: Đơn hàng quá 180 ngày vẫn lưu đầy đủ `customer_name`, `customer_phone`, `customer_note`, `item_note`. Không có module hay cron task ẩn danh hóa dữ liệu PII này.
  2. **Chưa có Chính sách Bảo tồn 3 năm**: Chưa có ràng buộc cứng hoặc script kiểm tra để đảm bảo dữ liệu công, lịch sử lương và audit log không bị xóa nhầm trước thời hạn 3 năm.

---

### 2.9. Kiểm thử Baseline & Ma trận Nghiệm thu (Testing Baseline — P00 / P09 / DEC-009)
- **Hiện trạng kiểm thử đã xác minh**:
  - `npm.cmd test`: Chạy 161 unit & integration test cases (`tests/*.test.mjs`) -> **161 PASS, 0 FAIL** (thời gian ~12.1 giây).
  - `npm.cmd run typecheck`: Wrangler types generation + TypeScript compiler (`tsc --noEmit`) -> **PASS, 0 Type Errors**.
- **Chênh lệch so với Nghiệm thu**:
  - Trong `docs/acceptance-matrix.md`, tất cả 13 tiêu chí ACC-01 đến ACC-13 đều đang ở trạng thái `NOT_RUN` đối với các quyết định mới DEC-001..009.
  - Các fixture thử nghiệm đa vai trò (Employee A/B, Team Lead, Manager, Sole Owner, Multi-Owner, System Admin, suspended/offboarded) chưa được chuẩn hóa tập trung thành một bộ fixture chuẩn có thể tái sử dụng cho toàn bộ các suite mới.

---

## 3. Bảng Tổng hợp Hiện trạng Thực thi theo Gói P00–P09

| Gói | Nội dung Trọng tâm | Trạng thái Code Hiện tại | Đánh giá Mức độ Hoàn thiện | Điểm Nghẽn / Sai khác Chính |
|---|---|---|---|---|
| **P00** | Baseline & Fixtures | Code test có sẵn chạy PASS; chưa có golden fixtures đa vai trò chuẩn | **PARTIAL** (50%) | 161 tests pass nhưng chưa có fixture đa vai trò cho self-approval & rate history |
| **P01** | Quyền, Chặn Tự duyệt & Sole-Owner | Chặn tự deactive, chặn sửa owner cuối; chưa chặn self-approval | **PARTIAL** (30%) | Thiếu `actor != target`, `team_lead` thừa quyền duyệt/sửa công, `system_admin` chưa chặn |
| **P02** | Lịch Nháp, Cut-off 12h, Adjustment | Chỉ có tạo ca published trực tiếp; trigger DB chặn overlap cả draft | **PARTIAL** (35%) | Chưa có draft lifecycle, thiếu cut-off 12h, thiếu adjustment flow có lý do |
| **P03** | Swap Nguyên tử, Rút đơn, Nghỉ | Leave có liên kết ca; swap chỉ trả `requiresManualAction` | **PARTIAL** (25%) | Swap chưa tự động/nguyên tử; thiếu chức năng rút đơn pending; nguy cơ overlap trigger |
| **P04** | Ngưỡng công, Overtime, Auto-close +4h | Có check-in/out SVG+GPS; tính raw minutes từ recorded time | **PARTIAL** (40%) | Chưa clip 5/15 phút; thiếu auto-close +4h cho ca quên checkout; thiếu overtime entity |
| **P05** | Rate History, Rounding 15m/1k, Snapshot | Có snapshot JSON và workforce_revision guard; chỉ có 1 rate duy nhất | **PARTIAL** (45%) | Thiếu `employee_rate_history`; chưa làm tròn 15 phút; chưa làm tròn tổng 1.000 VND |
| **P06** | Checklist theo ca, Receiver, Handover Gate | Có checklist theo ngày và handover ghi nhận text; chưa có receiver | **PARTIAL** (30%) | Checklist bị đè giữa các ca cùng ngày; thiếu ack handover; chưa có gate check-in |
| **P07** | Hủy đơn Chuẩn hóa, Báo cáo Hao hụt | Có state machine và hủy đơn; lý do hủy là free text | **PARTIAL** (50%) | Thiếu reason enum (`customer_abandoned`, etc.); thiếu báo cáo hao hụt (spoilage) |
| **P08** | Retention 90d/3y, Anonymize 180d | Đã có xóa ảnh/GPS sau 90 ngày (`expire-evidence.ts`) | **PARTIAL** (35%) | Hoàn toàn chưa có anonymize đơn hàng 180 ngày; thiếu policy bảo vệ 3 năm |
| **P09** | Tích hợp E2E & Nghiệm thu | E2E config có sẵn; acceptance matrix đang đánh dấu NOT_RUN | **NOT_RUN** (10%) | Cần chạy và ghi nhận evidence thực tế cho ACC-01..13 sau khi triển khai P01–P08 |

---

## 4. Danh mục File Cần Chú ý khi Triển khai

1. **Phân quyền & Kiểm tra Tự duyệt (P01)**:
   - `server/auth.ts`: Bổ sung kiểm tra chặn `system_admin` khỏi các route nghiệp vụ.
   - `modules/people/domain/access.ts`: Bổ sung ma trận quyền chi tiết (`canApproveRequest`, `canReviewAttendance`, `canCorrectAttendance`, `isSoleOwner`).
   - `modules/operations/application/decide-request.ts`: Thêm guard `actor.id !== target.id` / `actor.email !== target.email`; loại bỏ `team_lead` khỏi quyền duyệt nghỉ.
   - `modules/attendance/application/review-attendance.ts` & `correct-attendance.ts`: Chặn tự duyệt/tự sửa; tách riêng luồng sole-owner self-correction.
2. **Lịch làm việc & Cut-off (P02)**:
   - `modules/operations/application/manage-shifts.ts`: Bổ sung tham số `status: 'draft' | 'published'`, hàm `publishShifts`, kiểm tra ngưỡng 12h trước ca, luồng `adjustShift`.
   - `drizzle/0011_workforce_integrity.sql` / Migration mới: Điều chỉnh hoặc làm rõ hành vi trigger overlap đối với ca draft.
3. **Đổi ca & Yêu cầu (P03)**:
   - `modules/operations/application/create-request.ts`: Thêm trường `peerShiftId`, `peerEmployeeEmail`.
   - File mới `modules/operations/application/apply-swap.ts` & `withdraw-request.ts`: Xử lý giao dịch hoán đổi 2 nhân viên nguyên tử và rút đơn.
4. **Chấm công & Tự đóng ca (P04)**:
   - `modules/attendance/domain/policy.ts`: Thêm logic tách recorded time, tính payable time với dung sai 5 phút và biên 15 phút.
   - File mới `modules/attendance/application/auto-close-sessions.ts`: Quét các phiên mở quá `ends_at + 4h` để đóng với `MISSING_CHECKOUT` và payable = 0.
5. **Đơn giá Lương & Làm tròn (P05)**:
   - `db/schema.ts` & Migration mới: Tạo bảng `employee_rate_history (id, employee_id, hourly_rate, effective_from, effective_to)`.
   - `modules/payroll/application/load-report.ts`: Tách tính lương theo từng phân đoạn rate có hiệu lực, làm tròn giờ công xuống block 15 phút, làm tròn tổng tiền về 1.000 VND.
6. **Checklist & Bàn giao Ca (P06)**:
   - `db/schema.ts` & Migration mới: Thêm `routine_type` (`daily` vs `shift`), `shift_id` vào checklist; thêm `receiver_email`, `receiver_shift_id` vào `handovers`.
   - `app/api/handovers/route.ts`: Thêm PATCH endpoint để acknowledge.
   - `app/api/attendance/capture-sessions/route.ts`: Bổ sung gate kiểm tra acknowledge bàn giao trước khi cấp capture session (kèm cơ chế bypass).
7. **Hủy đơn & Hao hụt (P07)**:
   - `modules/ordering/application/change-status.ts`: Ép kiểu `cancelReason` theo enum `["customer_abandoned", "item_preparation_error", "store_incident"]` khi hủy ở trạng thái `preparing`/`ready`.
   - Endpoint/báo cáo hao hụt đơn hủy.
8. **Retention & Anonymization (P08)**:
   - File mới `modules/ordering/application/anonymize-orders.ts`: Xóa tên, số điện thoại, ghi chú của đơn quá 180 ngày.
   - `app/api/cron/retention/route.ts`: Tích hợp thêm task anonymize đơn hàng.
