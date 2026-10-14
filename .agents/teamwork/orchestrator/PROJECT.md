# Project: LoopiCafe Management System (Decisions DEC-001..009, Packages P00-P09)

## Architecture
- **Paradigm**: Modular Monolith on Cloudflare Workers (Vinext), SQLite/D1 via Drizzle ORM, R2 private storage for evidence, Supabase Auth.
- **Layers**:
  - `app/api/*`: HTTP Route Handlers with runtime schema validation, auth token verification, error translation.
  - `modules/<module>/application/*`: Application Services coordinating transactions, enforcing business rules and policies.
  - `modules/<module>/domain/*`: Pure domain entities, business invariant logic, calculations, and policy rules.
  - `db/schema.ts` & `drizzle/*`: SQLite tables, relations, and database triggers enforcing physical data integrity.
- **Data Flow**:
  - Client / Device → API Route Handler → Access & Anti-Self-Approval Guard (`modules/people/domain/access.ts`) → Application Service (D1 Transaction) → Drizzle / SQLite Triggers → Audit Log (`audit_events`).
- **Module Boundaries**:
  - `modules/people`: Employee identity, roles (`owner`, `manager`, `team_lead`, `employee`, `system_admin`), status, and rate history (`employee_rate_history`).
  - `modules/operations`: Shift schedule lifecycle (`draft`, `published`, `cancelled`, `completed`), 12h cut-offs, shift adjustments, requests (leave, swap, withdraw), checklists, and handovers.
  - `modules/attendance`: Attendance sessions, immutable event stream, tolerance (5m), clipping (15m), overtime approval, missing checkout auto-close (+4h), and append-only corrections.
  - `modules/payroll`: Pay period status lifecycle, 15m block floor, rate interval splitting, 1.000 VND rounding, immutable finalization snapshots, owner-only reopen.
  - `modules/ordering`: Order lifecycle, receipt secret isolation, status transitions, internal cancellation with reason code enum, and spoilage reporting.
  - `modules/retention`: 90-day photo/GPS cleanup, 180-day order PII anonymization, 3-year operational data preservation.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Baseline Fixtures & Golden Cases | Multi-role fixtures (employee A/B, lead, mgr, sole/multi owner, admin, offboarded/suspended) and tests for C01-C07 | M0 (P00) | survey / P00 |
| 2 | Anti-Self-Approval Guard | Chặn actor tự phê duyệt các yêu cầu/ngoại lệ do chính mình tạo ra (`actor != target`) ở mọi API mutation | M1 (P01) | DEC-001 / ACC-04, ACC-09 |
| 3 | Role Scoping for Team Lead | Giới hạn quyền của `team_lead` (chỉ phụ trách vận hành ca; chặn duyệt nghỉ, sửa công, duyệt công, xem GPS/ảnh, chốt lương) | M1 (P01) | DEC-001 / ACC-09 |
| 4 | System Admin Boundary Quarantine | Chặn hoàn toàn `system_admin` khỏi mọi endpoint nghiệp vụ kinh doanh | M1 (P01) | DEC-001 / ACC-09 |
| 5 | Sole-Owner Self-Correction | Luồng riêng biệt cho chủ quán duy nhất tự sửa công kèm lý do, diff trước/sau, audit cờ cao | M1 (P01) | DEC-001 / ACC-04 |
| 6 | Last Active Owner Protection | Ngăn chặn hạ quyền hoặc vô hiệu hóa OWNER hoạt động cuối cùng của cửa hàng | M1 (P01) | DEC-001 / ACC-09 |
| 7 | Schedule Draft Lifecycle | Vòng đời ca làm việc: tạo và duy trì ca ở trạng thái `draft`, ẩn với nhân viên, không tính vắng mặt, không cho check-in | M2 (P02) | DEC-002 / ACC-01 |
| 8 | Shift Publishing Guard | Xuất bản ca `draft → published`, kiểm tra active employee, không tạo ca chồng lấn (overlap trigger), gửi thông báo sau khi lưu | M2 (P02) | DEC-002 / ACC-01 |
| 9 | 12h Cut-off Direct Shift Mutation | Ngưỡng 12 giờ trước ca: ngoài 12h cho phép sửa/hủy trực tiếp; trong vòng 12h chặn sửa/hủy trực tiếp | M2 (P02) | DEC-002 / ACC-01, ACC-02 |
| 10 | Post-Cutoff Shift Adjustment | Luồng điều chỉnh ca đặc biệt khi đã vào biên 12 giờ có lý do, tác động và audit | M2 (P02) | DEC-002 / ACC-02 |
| 11 | Atomic Shift Swap Execution | Giao dịch đổi ca nguyên tử (`approved_pending_apply → applied`), cập nhật đồng thời cả 2 ca và request, không partial apply | M2 (P03) | DEC-003 / ACC-05 |
| 12 | Pending Request Withdrawal | Cho phép người tạo tự rút yêu cầu (`withdrawn`) khi đang `pending`; người duyệt không thể duyệt đơn đã rút | M2 (P03) | DEC-003 / ACC-05 |
| 13 | Full-Shift Leave Approval | Áp dụng đơn xin nghỉ phép trọn vẹn theo nguyên ca làm việc (`approved_leave_request_id`) | M2 (P03) | DEC-003 / ACC-05 |
| 14 | Attendance Tolerance Check (5 min) | Dung sai 5 phút cho giờ vào/ra so với kế hoạch; quá 5 phút sinh ngoại lệ pending | M3 (P04) | DEC-004 / ACC-03 |
| 15 | Shift Boundary Clipping (15 min) | Biên làm ngoài ca 15 phút bị clip về khung ca nếu không có quyết định duyệt overtime | M3 (P04) | DEC-004 / ACC-03 |
| 16 | Overtime Decision Approval | Quyết định phê duyệt giờ làm thêm ngoài ca có thẩm quyền, lý do và audit | M3 (P04) | DEC-004 / ACC-03 |
| 17 | Auto-Close Forgotten Checkout | Tác vụ tự động đóng phiên quên checkout sau `ends_at + 4h`, giờ tính công trả = 0 cho đến khi giải trình được duyệt | M3 (P04) | DEC-004 / ACC-03, ACC-04 |
| 18 | Append-Only Attendance Correction | Bản ghi thời gian thực tế bất biến; mọi điều chỉnh qua bảng append-only `attendance_corrections` | M3 (P04) | DEC-004 / ACC-04 |
| 19 | Unscheduled Attendance Handling | Phiên chấm công không có ca được xử lý rõ ràng, không suy đoán `ends_at`, giờ tính công = 0 chờ duyệt | M3 (P04) | DEC-004 / ACC-03 |
| 20 | Employee Rate History Management | Quản lý bảng lịch sử đơn giá `employee_rate_history` theo khoảng hiệu lực không chồng lấn | M3 (P05) | DEC-006 / ACC-06 |
| 21 | Mid-Period Rate Splitting | Bóc tách giờ công theo từng khung đơn giá hiệu lực khi thay đổi rate giữa kỳ | M3 (P05) | DEC-006 / ACC-06 |
| 22 | 15-Minute Block Down-Rounding | Làm tròn xuống block 15 phút cho từng phân đoạn công tính lương (`Math.floor(min / 15) * 15`) | M3 (P05) | DEC-006 / ACC-06 |
| 23 | Thousand-VND Total Rounding | Làm tròn số học tổng lương thực nhận về 1.000 VND gần nhất (`Math.round(val / 1000) * 1000`) | M3 (P05) | DEC-006 / ACC-06 |
| 24 | Cross-Month Shift Splitting | Phân bổ chính xác số phút ca xuyên tháng vào đúng từng tháng | M3 (P05) | DEC-006 / ACC-06 |
| 25 | Immutable Period Snapshot & Lock | Snapshot khóa kỳ lưu policy version, nguồn rate, chi tiết phân đoạn; chặn thêm ca / sửa công vào kỳ đã khóa | M3 (P05) | DEC-006 / ACC-06 |
| 26 | Owner-Only Period Reopen | Mở lại kỳ lương đã finalized bởi duy nhất OWNER | M3 (P05) | DEC-006 / ACC-06 |
| 27 | Shift Routine Identity Scoping | Tách biệt daily routine và shift routine có khóa định danh theo từng ca (`item_id, shift_id`) | M4 (P06) | DEC-005 / ACC-07 |
| 28 | Incomplete Checklist Handover Alert | Cảnh báo việc chưa xong của ca trước khi bàn giao | M4 (P06) | DEC-005 / ACC-07 |
| 29 | Handover Target & Acknowledgment | Ghi nhận biên bản bàn giao kèm ca/người nhận; người nhận gọi `acknowledge` | M4 (P06) | DEC-005 / ACC-07 |
| 30 | Check-in Handover Gate & Bypass | Chặn check-in ca mới nếu chưa nhận bàn giao ca trước; luồng bypass cần quyền MANAGER/OWNER, lý do, audit | M4 (P06) | DEC-005 / ACC-07 |
| 31 | Internal Cancel with Reason Code | Hủy đơn hàng ở `preparing`/`ready` bắt buộc chọn mã chuẩn hóa (`customer_abandoned`, `item_preparation_error`, `store_incident`) | M4 (P07) | DEC-007 / ACC-08 |
| 32 | Spoilage Tracking & Reporting | Ghi nhận dữ liệu hao hụt vào lịch sử đơn mà không làm biến đổi tổng tiền đơn gốc | M4 (P07) | DEC-007 / ACC-08 |
| 33 | Customer & Staff Cancel Block | Chặn khách hàng và nhân viên thường tự hủy đơn đang chuẩn bị/sẵn sàng | M4 (P07) | DEC-007 / ACC-08 |
| 34 | Receipt Secret Isolation | Tra cứu đơn hàng chỉ qua receipt secret khó đoán, không lộ thông tin qua số điện thoại | M4 (P07) | DEC-007 / ACC-08 |
| 35 | 90-Day Evidence Expiry & Cleanup | Tự động xóa ảnh R2 và tọa độ GPS D1 sau 90 ngày; sự kiện chấm công vẫn được bảo toàn | M4 (P08) | DEC-008 / ACC-10 |
| 36 | 180-Day Order PII Anonymization | Ẩn danh hóa vĩnh viễn tên, SĐT, ghi chú đơn hàng sau 180 ngày; giữ nguyên dữ liệu doanh số/món | M4 (P08) | DEC-008 / ACC-10 |
| 37 | 3-Year Operational Preservation | Bảo tồn tối thiểu 3 năm dữ liệu công, lương, audit, vận hành | M4 (P08) | DEC-008 / ACC-10 |
| 38 | Full Multi-Role Integration & Disaster Recovery | E2E kiểm thử toàn bộ vai trò (OWNER, MGR, LEAD, STAFF, ADMIN, CUST), D1 backup/restore drill, ACC-01..13 pass | M5 (P09) | DEC-009 / ACC-11..13 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Baseline, Golden Cases & Test Fixtures | Package P00: Multi-role fixtures, golden cases C01-C07, test database helpers | none | PLANNED |
| M1 | Permissions, Self-Approval Blocking & Sole-Owner Self-Correction | Package P01 (DEC-001): Server-side anti-self-approval, team_lead scoping, system_admin quarantine, sole_owner_self_correction | M0 | PLANNED |
| M2 | Workforce Scheduling, Cut-off & Atomic Shift Swaps | Packages P02 & P03 (DEC-002, DEC-003): Draft lifecycle, publishing guard, 12h cut-off & shift adjustments, atomic swap, request withdrawal, full-shift leave | M1 | PLANNED |
| M3 | Time Tracking Standards, Wage Rate History & Payroll Lock | Packages P04 & P05 (DEC-004, DEC-006): Tolerance 5m, clipping 15m, auto-close +4h, rate history table & migration, floor 15m, round 1.000 VND, period snapshot lock | M2 | PLANNED |
| M4 | Operations, Order Spoilage & Data Retention | Packages P06, P07 & P08 (DEC-005, DEC-007, DEC-008): Shift routine checklists, handover ack gate & bypass, cancel reason codes & spoilage, 90d evidence purge, 180d PII anonymization | M3 | PLANNED |
| M5 | Multi-Role Integration & Final Acceptance Verification | Package P09 (DEC-009): 100% E2E test suite pass (Tiers 1-4), backup/restore drill, Tier 5 adversarial hardening | M1, M2, M3, M4, TEST_READY | PLANNED |

### Parallel Track: E2E Testing Track
- **Scope**: Requirement-driven opaque-box test suite for all 13 Acceptance Criteria (ACC-01 through ACC-13).
- **Structure**:
  - Test runner & infrastructure (`tests/e2e/runner.mjs`, test helpers).
  - Tier 1: Feature Coverage (>=5 test cases per feature area).
  - Tier 2: Boundary & Corner Cases (>=5 test cases per feature area).
  - Tier 3: Cross-Feature Interactions (pairwise combinations).
  - Tier 4: Real-World Multi-Role Workload Scenarios.
- **Output**: Publishes `TEST_READY.md` upon completion.

---

## Interface Contracts

### `modules/people` ↔ `modules/operations` (RBAC & Scheduling)
- `canManageEmployee(actor: EmployeeSession, target: EmployeeSession): boolean`
  - Returns true if actor is owner, or manager managing lower roles.
  - Returns false if actor is team_lead or employee attempting management actions.
- `assertNotSelfApproval(actorId: string, targetEmployeeId: string, actionName: string): void`
  - Throws `ApplicationError(403, "self_approval_blocked")` if `actorId === targetEmployeeId`.
- `assertSoleOwner(storeId: string, db: D1Database): Promise<void>`
  - Throws `ApplicationError(403, "not_sole_owner")` if active owner count != 1.

### `modules/operations` ↔ `modules/attendance` (Shifts & Check-in)
- `getShiftForCheckin(storeId: string, employeeEmail: string, timestamp: Date): Promise<Shift>`
  - Must return only `status = 'published'` shifts.
  - Draft shifts are excluded (`status = 'draft'` returns null).
- `assertHandoverAcknowledged(storeId: string, shiftId: string, employeeId: string): Promise<boolean>`
  - Checks if preceding shift handover is acknowledged or has manager bypass.
  - Returns false / throws 412 if unacknowledged.

### `modules/attendance` ↔ `modules/payroll` (Work Hours & Pay Aggregation)
- `calculatePayableWorkHours(session: AttendanceSession, shift: Shift, overtimeApproval?: OvertimeApproval): PayableHours`
  - Applies 5m tolerance, 15m clipping window.
  - Adds explicit approved overtime minutes.
  - Missing checkout (+4h auto-closed) returns 0 payable minutes.
- `splitSessionByRateIntervals(sessionMinutes: number, sessionRange: DateRange, rateHistory: RateHistory[]): RateSegment[]`
  - Splits session minutes into active rate windows without overlap.
  - Each segment: `floored_minutes = Math.floor(minutes / 15) * 15`.

### `modules/payroll` ↔ Database (Period Lock)
- `assertPeriodNotLocked(storeId: string, date: Date, db: D1Database): Promise<void>`
  - Checks if date falls into a `finalized` or `paid` period.
  - Throws 409 if locked. Enforced also by SQLite trigger `shifts_locked_period_insert`.

### `modules/ordering` ↔ Audit & Reporting
- `cancelOrderInternal(orderId: string, actor: Actor, reasonCode: CancelReasonCode, note?: string): Promise<CancelResult>`
  - Reason code must be one of `['customer_abandoned', 'item_preparation_error', 'store_incident']`.
  - Records spoilage amount into `order_spoilage_records` without modifying original order `total_amount`.

### Retention Service ↔ D1 & R2
- `purgeExpiredEvidence(db: D1Database, r2: R2Bucket, cutoffDate: Date): Promise<PurgeSummary>`
  - Deletes photo from R2 first. On success, removes D1 `attendance_photos` and `attendance_locations`.
  - Preserves immutable `attendance_events`.
- `anonymizeCustomerOrders(db: D1Database, cutoffDate: Date): Promise<number>`
  - Masks `customer_name = 'Khách hàng'`, `customer_phone = '***'`, clears `customer_note`.
  - Preserves items, quantities, prices for sales reporting.

---

## Code Layout
- `db/schema.ts`: Drizzle ORM table definitions (stores, employees, shifts, requests, attendance_sessions, etc.).
- `drizzle/*.sql`: Incremental D1 migrations (Head is 0014; new migration for rate history & enhancements is `0015`).
- `modules/people/domain/access.ts`: Policy rules, role definitions, anti-self-approval guards, sole-owner checks.
- `modules/operations/application/manage-shifts.ts`: Draft lifecycle, publish batch, 12h cutoff enforcement, shift adjustment.
- `modules/operations/application/decide-request.ts`: Atomic shift swap, leave approval, withdrawal handling.
- `modules/attendance/application/check-in.ts` & `check-out.ts`: Check-in/out logic, tolerance, clipping, handover gate.
- `modules/attendance/application/auto-close-forgotten.ts`: 4h post-shift auto-closure task.
- `modules/payroll/application/load-report.ts` & `change-period.ts`: 15m floor rounding, 1000 VND total rounding, rate history splitting, immutable snapshot finalize.
- `modules/ordering/application/change-status.ts`: Order cancellation with reason codes and spoilage logging.
- `modules/retention/application/anonymize-orders.ts`: 180-day PII anonymization.
- `tests/fixtures/workforce-fixtures.mjs`: Central multi-role fixtures and golden cases C01-C07.
- `tests/e2e/*`: Dual-track E2E test runner and acceptance test suites (Tiers 1-4).
