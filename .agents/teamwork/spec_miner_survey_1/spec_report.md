# Báo cáo Đặc tả Kỹ thuật Hệ thống Quản lý LoopiCafe (LoopiCafe Specification Survey Report)

**Ngày lập:** 2026-10-13  
**Tác giả:** `spec_miner_survey_1` (teamwork_preview_spec_miner)  
**Tài liệu căn cứ:**  
- `ORIGINAL_REQUEST.md` (R1–R11, ACC-01–ACC-13)  
- `AGENTS.md`  
- `docs/business-rules.md` (BR-001..002, ROLE-001..004, SCH-001..005, REQ-001..005, ATT-001..009, OPS-001..005, PAY-001..006, ORD-001..007, RET-001..003, REL-001..002, EX-01..06)  
- `docs/decision-register.md` (DEC-001..DEC-009)  
- `docs/permissions.md`  
- `docs/implementation-status.md`  
- `docs/acceptance-matrix.md` (ACC-01..ACC-13)  
- `docs/implementation-plan.md` (P00..P09, C01..C07)  
- `docs/database-operations.md`  
- `docs/security.md`, `docs/api-contracts.md`  
- Codebase Schema (`db/schema.ts`, `drizzle/*.sql`) & Modules (`modules/people`, `modules/operations`, `modules/attendance`, `modules/payroll`, `modules/ordering`)

---

## 1. Tóm tắt Phạm vi & Kiến trúc

LoopiCafe Management System được thiết kế theo mô hình **Modular Monolith** phục vụ một quán cà phê đơn lẻ (single-store MVP/pilot):
- **Công nghệ nền tảng:** React, Next-compatible routes, TypeScript, Tailwind CSS, Vinext / Cloudflare Workers, Cloudflare D1 (SQLite engine), Drizzle ORM, Cloudflare R2 (Private Bucket), Supabase Auth (Local Docker / Managed Auth).
- **Phạm vi kiểm soát:** Nghiệp vụ cửa hàng tập trung vào lịch làm việc, chấm công bằng chứng (ảnh + GPS), bàn giao ca, xử lý ngoại lệ, tính lương snapshot bất biến, đặt món tại quán (QR/bàn), và lưu trữ / ẩn danh hóa dữ liệu.
- **Ranh giới bảo mật & hạ tầng:** Không tự mở rộng đa chi nhánh, không cổng thanh toán online, không tích hợp giao hàng bên thứ ba, không phân rã microservices. Máy chủ (`server authorization`) là nguồn chân lý duy nhất xác thực quyền và thời gian.

---

## 2. Chi tiết Sổ Quyết Định Nghiệp Vụ (DEC-001 .. DEC-009)

| Quyết định | Trạng thái | Tóm tắt Quyết định | Yêu cầu Kỹ thuật & Ràng buộc Cưỡng chế |
|---|---|---|---|
| **DEC-001** | `ACCEPTED` | **Không tự duyệt (Anti-Self-Approval), Chuẩn hóa `team_lead`, Cách ly `system_admin`** | - Chặn tự duyệt ở application & API (`actor.id != target.employee_id`).<br>- Yêu cầu của `employee`/`team_lead` do `manager` hoặc `owner` khác người yêu cầu duyệt.<br>- Yêu cầu của `manager` chỉ do `owner` khác duyệt.<br>- Quán >= 2 `owner`: yêu cầu/sửa công của `owner` phải do `owner` khác duyệt.<br>- Quán duy nhất 1 `owner`: Áp dụng luồng `sole_owner_self_correction` riêng biệt (bắt buộc before/after diff, lý do >= 5 ký tự, high-priority audit, báo cáo đối soát riêng; không giả là phê duyệt độc lập).<br>- `team_lead` là Trưởng ca vận hành: Chỉ xem dữ liệu ca, checklist ca, tiếp nhận bàn giao, đổi ca cấp dưới (DEC-003). Chặn hoàn toàn: duyệt nghỉ, sửa công, duyệt công, xem ảnh/GPS, chốt/mở lương, quản lý tài khoản/cấu hình/menu/đơn hàng.<br>- `system_admin` là tài khoản kỹ thuật: Chặn khỏi mọi endpoint nghiệp vụ kinh doanh; không được dùng bypass store scope. |
| **DEC-002** | `ACCEPTED` | **Vòng đời Lịch làm việc, Cut-off 12 giờ & Điều chỉnh Ca** | - Vòng đời ca: `draft → published → completed / cancelled`.<br>- Ca `draft` ẩn hoàn toàn với nhân viên (không hiển thị trên lịch cá nhân, không thông báo, không tính vắng mặt, không check-in).<br>- Xuất bản (`publish`) kiểm tra nguyên tử: active employee, thời gian hợp lệ (0 < length <= 24h), không overlap trigger, revision match. Chỉ thông báo sau khi lưu thành công.<br>- Trước giờ bắt đầu ca >= 12 giờ (và chưa có công, nghỉ duyệt, kỳ khóa): Cho phép OWNER/MANAGER sửa/hủy trực tiếp.<br>- Trong vòng 12 giờ trước ca: Khóa sửa/hủy trực tiếp; bắt buộc đi qua luồng `shift adjustment` có lý do, đánh giá tác động, audit và notification.<br>- MVP không áp số nhân sự tối thiểu cứng cho ca (chỉ cảnh báo gợi ý trên UI). |
| **DEC-003** | `ACCEPTED` | **Đổi Ca Nguyên Tử, Rút Đơn & Nghỉ Nguyên Ca** | - Yêu cầu đổi ca (`shift swap`) tham chiếu 2 ca `published`, 2 nhân viên active cùng store.<br>- Vòng đời swap: `pending → approved_pending_apply → applied` (hoặc `rejected`, `withdrawn`).<br>- Thao tác “Duyệt & áp dụng” phải chạy trong transaction/guard nguyên tử: kiểm tra revision, overlap trigger, đổi người giữa 2 ca, cập nhật request sang `applied`, notification và audit. Thất bại bất kỳ bước nào phải rollback toàn bộ.<br>- Ở trạng thái `approved_pending_apply`, lịch làm việc không được đổi; UI không được hiển thị như đã đổi.<br>- Rút đơn (`withdraw`): Người tạo được rút khi đơn còn `pending`. Sau khi đã quyết định/applied không được rút ngược.<br>- Đơn xin nghỉ (`leave`): Áp dụng trọn vẹn theo nguyên ca (không nghỉ nửa ca trong MVP). Đánh dấu `shifts.approved_leave_request_id`, loại khỏi vắng mặt, cảnh báo cần người thay.<br>- Sửa công (`correction`): Duyệt không sửa đè event gốc; tạo bản ghi append-only vào `attendance_corrections`. |
| **DEC-004** | `ACCEPTED` | **Quy chuẩn Chấm công, Dung sai, Overtime & Quên Checkout** | - Dung sai đi trễ và về sớm: 5 phút. Ngoài 5 phút tạo `attendance_exception` chờ duyệt.<br>- Biên làm ngoài ca: Check-in sớm tối đa 15 phút, checkout muộn tối đa 15 phút được ghi nhận, nhưng mặc định bị cắt về khung ca kế hoạch. Phút ngoài ca chỉ tính khi có quyết định “Duyệt tăng ca” (overtime approval) rõ ràng kèm actor, lý do, số phút và audit.<br>- Không tự động trừ giờ nghỉ giữa ca trong MVP (nếu trừ phải qua correction được duyệt).<br>- Tự đóng phiên quên checkout: Tác vụ nền tự động đóng ca tại `shift.ends_at + 4 giờ`, gắn cờ `MISSING_CHECKOUT`, giữ nguyên thời gian ghi nhận nhưng đặt giờ được duyệt / tính lương = 0 cho đến khi giải trình/correction được duyệt.<br>- Phiên chấm công không có ca: Xử lý rõ ràng, không tự suy đoán `ends_at`.<br>- Server time UTC nhất quán; ngày/kỳ tính theo `Asia/Ho_Chi_Minh`. Ca dài tối đa 24 giờ. |
| **DEC-005** | `ACCEPTED` | **Checklist Ca, Bàn giao Ca & Gate Check-in** | - Checklist phân loại: `daily_routine` (theo business date) và `shift_routine` (gắn shift ID cụ thể).<br>- Khóa định danh execution của `shift_routine` tách biệt theo shift, tránh xung đột ca đêm hoặc 2 ca cùng ngày.<br>- Ca đêm thuộc về shift đã gắn, không tách đôi tại 00:00.<br>- Checklist ca chưa hoàn thành phải hiển thị rõ trước khi bàn giao; không tự đánh dấu hoàn thành khi ca hết giờ.<br>- Biên bản bàn giao (`handover`) ghi author, timestamp, summary, manager_attention, và người nhận (`receiver_employee_id`) hoặc ca kế tiếp (`next_shift_id`).<br>- Người/ca nhận phải xác nhận (`acknowledge`) trước khi hoàn tất check-in ca mới.<br>- Cơ chế Bypass: Chỉ OWNER/MANAGER được quyền bypass biên bản bàn giao trong tình huống khẩn cấp/lỗi hệ thống kèm lý do bắt buộc và audit; không làm mất sự kiện chấm công. |
| **DEC-006** | `ACCEPTED` | **Lịch sử Đơn giá Lương, Làm tròn 15 phút & Khóa Kỳ Lương** | - Bắt buộc bảng `employee_rate_history` theo khoảng hiệu lực không chồng lấn (`effective_from`, `effective_to`), loại lương, đơn giá integer VND, actor, audit.<br>- Giờ công tính lương = Clip ca kế hoạch + Overtime duyệt.<br>- Làm tròn giờ công: Làm tròn XUỐNG theo block 15 phút (0–14 phút = 0; 15–29 phút = 15; 30–44 phút = 30; 45–59 phút = 45).<br>- Tách giờ công theo các đoạn đơn giá hiệu lực khi thay đổi rate giữa kỳ (không áp giá mới cho quá khứ).<br>- Tiền lương tính toán trung gian bằng số nguyên VND; không làm tròn non từng event.<br>- Làm tròn tổng lương chi trả cuối kỳ của nhân viên về 1.000 VND gần nhất (số học: phần dư >= 500 VND làm tròn lên, < 500 VND làm tròn xuống).<br>- Snapshot khóa kỳ: Bất biến, lưu phiên bản chính sách, nguồn rate, phân đoạn rate. Khóa kỳ ngăn chặn chỉnh sửa shifts/attendance.<br>- Dữ liệu legacy thiếu rate history: Chặn finalize cho nhân viên bị ảnh hưởng cho đến khi OWNER bổ sung rate có căn cứ và audit; không fallback ngầm về rate hiện tại. |
| **DEC-007** | `ACCEPTED` | **Hủy Đơn Hàng Đã Pha & Ghi Nhận Hao Hụt (Spoilage)** | - Khách hàng (`CUSTOMER`) và nhân viên thường (`STAFF`) không có quyền tự hủy đơn sau khi gửi.<br>- Hủy đơn do vai trò nội bộ được cấp quyền (mặc định OWNER/MANAGER) thực hiện.<br>- Trạng thái cho phép hủy: `pending`, `accepted`, `preparing`, `ready` (trước `completed`).<br>- Hủy từ `preparing` hoặc `ready` bắt buộc chọn mã lý do chuẩn hóa (`cancel_reason_code`): `customer_abandoned`, `item_preparation_error`, hoặc `store_incident`, kèm ghi chú.<br>- Đơn hủy sau khi bắt đầu pha được đưa vào Báo cáo hao hụt (Spoilage Report) riêng (số lượng món, giá trị bán snapshot). Không trừ/ghi như doanh thu thực thu; không làm thay đổi tổng tiền đơn gốc. |
| **DEC-008** | `ACCEPTED` | **Chu Kỳ Lưu Trữ (Retention) & Ẩn Danh Hóa (Anonymization)** | - Ảnh chấm công (R2) và tọa độ GPS (D1): Tối đa 90 ngày. Hết hạn phải chặn đọc ngay; scheduler xóa object R2 và vị trí D1, bảo toàn sự kiện công và metadata retry.<br>- Sự kiện công/sessions/corrections, snapshot kỳ lương, nhật ký audit, checklist execution, sự cố, bàn giao: Lưu trữ tối thiểu 3 năm.<br>- Đơn hàng: Sau 180 ngày, tự động ẩn danh hóa vĩnh viễn thông tin cá nhân (PII: tên, số điện thoại, ghi chú khách/món); giữ số liệu món, giá, trạng thái không định danh phục vụ thống kê.<br>- Job retention: Idempotent, batch hữu hạn, đo lường metrics (xóa, còn lại, lỗi), không xóa event công khi R2 lỗi.<br>- Diễn tập Restore: Sau khi restore từ backup, phải chạy lại job expiry/anonymization trước khi mở quyền truy cập thông thường. |
| **DEC-009** | `ACCEPTED` | **Cổng Pilot / Phát Hành (Release Gate)** | - Một build xanh không đủ điều kiện pilot. Release record phải đáp ứng 6 điều kiện tiên quyết:<br>1. Core E2E Pass (Tạo draft → Publish → Check-in/out → Ngoại lệ → Duyệt độc lập → Chốt lương).<br>2. Integrity Tests Pass (Overlap trigger, ca xuyên đêm/tháng, rounding 15 phút, rate history, snapshot khóa, store isolation).<br>3. Backup/restore drill thành công trên staging (D1 restore + R2 đối soát).<br>4. Security/Retention Pass (RBAC E2E, last-owner guard, receipt secret isolation, expiry 90d, anonymization 180d).<br>5. UI thiết yếu chạy tốt trên màn hình hẹp 320–390 px, hỗ trợ keyboard/focus/error handling.<br>6. Vận hành có xác nhận tải, người trực, rollback owner, RPO, RTO được chủ dự án phê duyệt. |

---

## 3. Phân rã Gói Công Việc (Packages P00 .. P09) & Dependency Graph

```
           [P00: Baseline, Golden Cases, Fixtures]
                           |
            +--------------+--------------+
            |                             |
      [P01: Roles, Anti-            [P08: Retention &
      Self-Approval, Sole-Owner]    Anonymization (Core)]
            |                             |
            +--------------+              |
            |              |              |
      [P02: Schedule  [P07: Order         |
      Draft/Cutoff]   Cancel/Spoilage]    |
            |                             |
      +-----+-----+                       |
      |           |                       |
   [P03: Swap  [P04: Attendance,          |
   Atomic]     Overtime, Auto-Close]      |
                  |                       |
            +-----+-----+                 |
            |           |                 |
      [P05: Rate   [P06: Checklists,      |
      History,     Handover Gate]         |
      Payroll]          |                 |
            +-----------+                 |
                  |                       |
                  +-----------+-----------+
                              |
                    [P09: E2E Integration,
                    Drills & Release Gate]
```

### Chi tiết từng gói:

1. **P00 — Baseline, Golden Cases & Test Fixtures**
   - **Mục tiêu:** Thiết lập baseline kiểm thử sạch, cô lập, không reset môi trường bừa bãi.
   - **Nhiệm vụ:**
     - Giải quyết 7 điểm làm rõ (C01–C07) bằng ví dụ input/expected output rõ ràng.
     - Xây dựng fixture đa vai trò: employee A/B, team lead, manager, sole owner, multi-owner (2 active owners), system admin, tài khoản invited/suspended/offboarded/inactive.
     - Fixture kịch bản thời gian: ca đêm, ca qua tháng, đổi đơn giá giữa kỳ, dữ liệu hết hạn 90/180 ngày.
     - Store thứ hai chỉ dùng để kiểm thử cách ly phạm vi (store scope isolation).
   - **Phụ thuộc:** Không.

2. **P01 — Quyền, Chặn Tự Duyệt & Sole-Owner Self-Correction (DEC-001)**
   - **Mục tiêu:** Cưỡng chế phân quyền chặt chẽ tại tầng server/domain, chặn self-approval.
   - **Nhiệm vụ:**
     - Triển khai policy `canPerformAction(actor, target, action)` tại `modules/people/domain/`.
     - Cưỡng chế `actor.id != target.employee_id` trên mọi API duyệt yêu cầu và sửa công.
     - Thu hẹp role `team_lead`: chỉ Trưởng ca vận hành, tước quyền duyệt nghỉ, sửa công, chốt lương, xem ảnh/GPS.
     - Chặn `system_admin` tại mọi business boundary.
     - Thiết lập luồng `sole_owner_self_correction`: kiểm tra `active_owners_count == 1`, lưu before/after diff, lý do, audit cờ cao.
     - Bảo vệ Last-Owner: không cho phép vô hiệu hóa/hạ quyền OWNER hoạt động cuối cùng.
   - **Phụ thuộc:** P00 (C01).

3. **P02 — Vòng Đời Lịch Làm Việc, Cut-off & Điều Chỉnh Ca (DEC-002)**
   - **Mục tiêu:** Quản lý vòng đời ca làm việc, quy tắc 12 giờ cut-off và phòng chống xung đột ca.
   - **Nhiệm vụ:**
     - Phân định trạng thái `draft` vs `published`. Lọc bỏ `draft` khỏi truy vấn của nhân viên, hôm nay (`today`), và chấm công.
     - Thao tác xuất bản (`publish`): kiểm tra active status, revision, trigger overlap. Gửi thông báo sau khi lưu thành công.
     - Ngưỡng 12 giờ cut-off: Trước 12h cho phép sửa/hủy trực tiếp (nếu chưa có công/nghỉ/kỳ khóa); trong vòng 12h bắt buộc luồng `shift adjustment` kèm lý do, audit, notification.
   - **Phụ thuộc:** P01, P00 (C02).

4. **P03 — Yêu Cầu Đổi Ca Nguyên Tử, Rút Đơn & Nghỉ Nguyên Ca (DEC-003)**
   - **Mục tiêu:** Xử lý các loại yêu cầu (leave, swap, correction) an toàn và nguyên tử.
   - **Nhiệm vụ:**
     - Swap nguyên tử: Trạng thái `pending → approved_pending_apply → applied`. Transaction tráo đổi nhân viên giữa 2 ca mà không gây vi phạm trigger overlap tạm thời. Rollback toàn bộ nếu có lỗi.
     - Cho phép người tạo rút đơn (`withdraw`) khi còn `pending`.
     - Đơn xin nghỉ áp dụng cho nguyên ca, liên kết `shifts.approved_leave_request_id`.
   - **Phụ thuộc:** P02, P01, P00 (C01).

5. **P04 — Quy Chuẩn Chấm Công, Làm Ngoài Ca & Tự Đóng Ca Quên Checkout (DEC-004)**
   - **Mục tiêu:** Tách bạch thời gian thực tế bất biến khỏi thời gian tính lương; tự động xử lý ca quên checkout.
   - **Nhiệm vụ:**
     - Áp dụng dung sai 5 phút (đi trễ/về sớm) → tạo ngoại lệ nếu vượt.
     - Ghi nhận sớm 15 phút / muộn 15 phút nhưng clip về khung ca nếu không có overtime được duyệt.
     - Module duyệt tăng ca (`approveOvertime`): lưu actor, reason, approved_minutes, audit.
     - Scheduler tự động đóng ca quên checkout tại `shift.ends_at + 4h`: gán `MISSING_CHECKOUT`, approved/payable minutes = 0.
   - **Phụ thuộc:** P02, P00 (C03).

6. **P05 — Lịch Sử Đơn Giá Lương, Làm Tròn & Khóa Kỳ Lương (DEC-006)**
   - **Mục tiêu:** Tính toán lương chính xác theo lịch sử đơn giá, quy chuẩn làm tròn và snapshot bất biến.
   - **Nhiệm vụ:**
     - Tạo bảng `employee_rate_history` với khoảng hiệu lực không chồng lấn.
     - Thuật toán bóc tách giờ công theo từng khoảng đơn giá hiệu lực khi thay đổi rate giữa kỳ.
     - Làm tròn giờ công xuống block 15 phút.
     - Làm tròn tổng tiền lương chi trả về 1.000 VND gần nhất (>= 500 làm tròn lên).
     - Lưu row snapshot bất biến khi chốt kỳ (finalized). Chặn chốt kỳ nếu thiếu rate history (legacy data).
     - Chỉ OWNER được mở lại kỳ lương đã chốt.
   - **Phụ thuộc:** P04, P00 (C04).

7. **P06 — Checklist Ca & Tiếp Nhận Bàn Giao Trước Khi Check-in (DEC-005)**
   - **Mục tiêu:** Quản lý quy trình vận hành ca, bàn giao và kiểm soát vào ca.
   - **Nhiệm vụ:**
     - Phân định `daily_routine` (theo business date) và `shift_routine` (theo shift ID).
     - Định danh khóa checklist ca riêng biệt, không xung đột ca đêm hoặc nhiều ca trong ngày.
     - Handover liên kết `receiver_employee_id` / `next_shift_id`.
     - Bắt buộc xác nhận bàn giao (`acknowledge`) trước khi nhân viên ca sau check-in.
     - Cơ chế bypass bàn giao dành cho OWNER/MANAGER có lý do và audit.
   - **Phụ thuộc:** P02, P04, P00 (C05).

8. **P07 — Hủy Đơn Hàng & Ghi Nhận Hao Hụt (DEC-007)**
   - **Mục tiêu:** Kiểm soát hủy đơn hàng sau khi pha chế và báo cáo hao hụt.
   - **Nhiệm vụ:**
     - Chặn khách hàng và nhân viên thường tự hủy đơn.
     - Cho phép OWNER/MANAGER hủy đơn ở `preparing` và `ready` với danh mục mã lý do chuẩn hóa: `customer_abandoned`, `item_preparation_error`, `store_incident`.
     - Ghi nhận lịch sử trạng thái đơn và sinh Báo cáo hao hụt (Spoilage Report) mà không thay đổi tổng tiền đơn gốc.
   - **Phụ thuộc:** P01.

9. **P08 — Chu Kỳ Lưu Trữ & Ẩn Danh Hóa Dữ Liệu (DEC-008)**
   - **Mục tiêu:** Quản trị vòng đời dữ liệu, bảo mật quyền riêng tư và tuân thủ lưu trữ.
   - **Nhiệm vụ:**
     - Xóa ảnh R2 và tọa độ GPS D1 quá 90 ngày (chặn đọc ngay khi hết hạn, bảo toàn sự kiện công).
     - Ẩn danh hóa thông tin PII (tên, số điện thoại, ghi chú) của đơn hàng quá 180 ngày.
     - Bảo vệ dữ liệu công, lương, audit, vận hành tối thiểu 3 năm.
     - Đảm bảo các job retention chạy idempotent, xử lý theo lô (batch).
   - **Phụ thuộc:** P00, P04..P07.

10. **P09 — Kiểm Thử Tích Hợp Toàn Bộ Vai Trò & Nghiệm Thu (DEC-009)**
    - **Mục tiêu:** Kiểm chứng toàn diện hệ thống trên staging, đáp ứng bộ tiêu chí ACC-01 .. ACC-13.
    - **Nhiệm vụ:**
      - Bộ kiểm thử E2E đa vai trò (OWNER, MANAGER, TEAM_LEAD, STAFF, SYSTEM_ADMIN, CUSTOMER).
      - Diễn tập Backup & Restore D1 + R2 trên staging.
      - Kiểm thử integrity (ca đêm, qua tháng, concurrency, locked period, triggers).
      - Xác lập Release Record chính thức.
    - **Phụ thuộc:** P01 đến P08.

---

## 4. Ma Trận Tiêu Chí Nghiệm Thu (Acceptance Criteria ACC-01 .. ACC-13)

| Mã tiêu chí | Quy tắc liên quan | Mô tả Yêu cầu Nghiệm thu | Phương pháp Kiểm chứng Tối thiểu |
|---|---|---|---|
| **ACC-01** | SCH-001..005, DEC-002 | - Ca `draft` ẩn với nhân viên, không tính vắng mặt, không thể check-in.<br>- Xuất bản ca kiểm tra active employee, không tạo overlap, gửi thông báo sau khi commit.<br>- Áp dụng cut-off 12 giờ trước ca. | Integration test + Browser Playwright |
| **ACC-02** | SCH-004, DEC-002 | - Ca trong biên 12 giờ, ca đã có chấm công, ca có nghỉ duyệt hoặc thuộc kỳ lương khóa bị chặn sửa/hủy trực tiếp.<br>- Phải chuyển qua luồng điều chỉnh (`shift adjustment`) có lý do, audit và notification. | D1 Integration test + API boundary |
| **ACC-03** | ATT-001..009, DEC-004 | - Check-in/out dùng server time UTC nhất quán.<br>- Dung sai trễ/sớm 5 phút; biên làm ngoài ca 15 phút bị clip về khung ca nếu không duyệt overtime.<br>- Phiên quên checkout tự đóng tại `ends_at + 4h` với 0 giờ tính lương.<br>- Idempotent retry khi mất kết nối/mất response. | Integration test + Browser Playwright |
| **ACC-04** | ATT-002, ROLE-002..003, DEC-001, DEC-004 | - Chặn tự phê duyệt (`actor != target`) ở mọi API mutation.<br>- Điều chỉnh công (`attendance_corrections`) ghi append-only, không sửa đè event gốc.<br>- Luồng `sole_owner_self_correction` ghi diff, lý do, audit cờ cao.<br>- Phiên missing checkout chưa được tính công vào kỳ lương. | Integration test + Browser Playwright |
| **ACC-05** | REQ-001..005, DEC-003 | - Đổi ca nguyên tử cập nhật đồng thời cả 2 ca và request sang `applied`, rollback toàn bộ nếu conflict.<br>- Rút đơn pending thành công bởi người tạo; người duyệt không thể duyệt đơn đã rút.<br>- Nghỉ phép áp dụng trọn vẹn theo nguyên ca. | Integration test + Browser Playwright |
| **ACC-06** | PAY-001..006, DEC-006 | - Quản lý đơn giá theo bảng lịch sử không chồng lấn; chia đoạn rate khi đổi giữa kỳ.<br>- Giờ công làm tròn xuống block 15 phút; tổng thực nhận làm tròn số học về 1.000 VND gần nhất.<br>- Ca qua tháng phân bổ đúng phút cho từng tháng.<br>- Snapshot khóa kỳ lưu policy version, nguồn rate; chặn chốt kỳ khi legacy thiếu rate history. | Integration test + D1 Engine tests |
| **ACC-07** | OPS-001..005, DEC-005 | - Daily routine và shift routine có identity riêng biệt, không xung đột ca đêm hoặc 2 ca cùng ngày.<br>- Nhân viên nhận ca phải xác nhận biên bản bàn giao (`acknowledge`) trước khi check-in.<br>- Luồng bypass bàn giao yêu cầu quyền MANAGER/OWNER kèm lý do và audit. | Integration test + Browser Playwright |
| **ACC-08** | ORD-001..007, DEC-007 | - Giá tính từ server snapshot, chống client tampering.<br>- Khách hàng và nhân viên thường bị chặn tự hủy đơn.<br>- Hủy đơn ở `preparing` hoặc `ready` bắt buộc chọn lý do chuẩn hóa (`customer_abandoned`, `item_preparation_error`, `store_incident`).<br>- Ghi nhận dữ liệu hao hụt (spoilage) mà không làm sai lệch tổng tiền đơn gốc. | Integration test + Browser Playwright |
| **ACC-09** | Security, Permissions, DEC-001 | - `team_lead` bị chặn khi cố duyệt nghỉ, sửa công, chốt lương, xem ảnh/GPS.<br>- `system_admin` bị chặn khỏi mọi endpoint nghiệp vụ.<br>- Bảo vệ Last-Owner: không cho phép vô hiệu hóa/xóa owner duy nhất.<br>- Quyền truy cập cách ly nghiêm ngặt theo storeId. | Real Auth Integration + E2E suite |
| **ACC-10** | RET-001..003, DEC-008 | - Ảnh R2 và GPS D1 quá 90 ngày bị chặn truy cập và xóa vật lý bởi job idempotent.<br>- PII đơn hàng quá 180 ngày bị ẩn danh hóa vĩnh viễn.<br>- Dữ liệu công, lương, audit, vận hành lưu tối thiểu 3 năm.<br>- Lỗi R2 deletion không làm xóa mất attendance event ở D1. | Integration test + Retention drill |
| **ACC-11** | Database Operations, DEC-009 | - Chuỗi migration D1/SQLite tương thích từ fresh đến upgraded.<br>- Toàn vẹn trigger (overlap, locked period, revision guards) được duy trì.<br>- Diễn tập phục hồi (restore drill) thành công trên môi trường thử nghiệm cô lập. | Emulator test + Restore drill |
| **ACC-12** | Design & UI/UX, DEC-009 | - Giao diện responsive trên mobile 320–390 px cho cả STAFF và Quản lý.<br>- Hỗ trợ điều hướng bàn phím (keyboard navigation), focus indicator, thông báo lỗi rõ ràng, CTA không bị che khuất. | Browser Playwright + Device emulation |
| **ACC-13** | Operational Release Gate, DEC-009 | - Toàn bộ tiêu chí ACC-01..ACC-12 đạt PASS tại release commit.<br>- Release record có đầy đủ tải dự kiến, người trực, rollback owner, RPO, RTO được chủ dự án phê chuẩn. | Operational review & Release signoff |

---

## 5. Danh Mục Tính Năng Khám Phá (Features Discovered)

Sau đây là danh mục chi tiết tất cả các tính năng được rà soát từ các nguồn đặc tả chính thức:

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|---|---|---|---|---|---|---|
| 1 | Auth & RBAC | Anti-Self-Approval Guard | Chặn actor tự phê duyệt các yêu cầu/ngoại lệ do chính mình tạo ra | `actor`, `target`, `requestId` | Cho phép tiếp tục nếu `actor != target` | 403 Forbidden (`self_approval_blocked`) | DEC-001, ROLE-002, `permissions.md` |
| 2 | Auth & RBAC | Role Scoping for Team Lead | Giới hạn quyền của `team_lead` về Trưởng ca vận hành | `actor.role == 'team_lead'`, action | Cho phép với checklist ca, bàn giao ca, sự cố ca, swap cấp dưới | 403 Forbidden nếu cố duyệt nghỉ, sửa công, chốt lương, xem GPS | DEC-001, ROLE-004, `permissions.md` |
| 3 | Auth & RBAC | System Admin Boundary Quarantine | Chặn hoàn toàn `system_admin` khỏi mọi endpoint nghiệp vụ | `actor.role == 'system_admin'`, business route | Không cho phép thao tác dữ liệu nghiệp vụ | 403 Forbidden trên mọi route nghiệp vụ | DEC-001, ROLE-001, `security.md` |
| 4 | Auth & RBAC | Sole-Owner Self-Correction | Luồng ngoại lệ cho chủ quán duy nhất tự sửa công | `sessionId`, `adjustedTime`, `reason`, `diff` | Bản ghi sửa công kèm audit cờ cao | 403 nếu có >= 2 owner; 400 nếu thiếu lý do | DEC-001, ROLE-003, `security.md` |
| 5 | Auth & RBAC | Last Active Owner Protection | Ngăn chặn hạ quyền hoặc vô hiệu hóa OWNER hoạt động cuối cùng | `targetEmployeeId`, `newStatus`, `newRole` | Thành công nếu còn >= 1 owner active khác | 409 Conflict (`last_owner_protected`) | `permissions.md`, `security.md` |
| 6 | Scheduling | Schedule Draft Lifecycle | Tạo và duy trì ca làm việc ở trạng thái `draft` | `storeId`, `employeeEmail`, `startsAt`, `endsAt`, `roleLabel` | Ca ở trạng thái `draft`, revision 0 | 400 nếu sai giờ; 409 nếu trùng lịch (trigger) | DEC-002, SCH-002, `manage-shifts.ts` |
| 7 | Scheduling | Shift Publishing Guard | Chuyển ca từ `draft` sang `published`, kiểm tra active & overlap | `shiftIds[]`, `expectedRevision` | Ca `published`, gửi notification cho nhân viên | 409 nếu overlap / revision mismatch / nhân viên inactive | DEC-002, SCH-003, `manage-shifts.ts` |
| 8 | Scheduling | 12h Cut-off Direct Shift Mutation | Cho phép sửa/hủy trực tiếp ca nếu cách giờ bắt đầu >= 12h | `shiftId`, `action: edit/cancel`, `expectedRevision` | Ca cập nhật hoặc bị hủy | 409 nếu <= 12h, có công, có nghỉ duyệt, hoặc kỳ đã khóa | DEC-002, SCH-004, `api-contracts.md` |
| 9 | Scheduling | Post-Cutoff Shift Adjustment | Luồng điều chỉnh ca đặc biệt khi đã vào biên 12 giờ | `shiftId`, `newTimes`, `reason`, `impact` | Ca điều chỉnh + audit + notification | 400 nếu thiếu lý do; 409 nếu kỳ lương đã khóa | DEC-002, SCH-004, `implementation-plan.md` |
| 10 | Requests | Atomic Shift Swap Execution | Hoán đổi nhân viên giữa 2 ca published một cách nguyên tử | `requestId`, `decision: approved` | Cả 2 ca đổi người, request `applied`, audit | 409 nếu 1 trong 2 ca bị conflict, rollback toàn bộ | DEC-003, REQ-003, `decide-request.ts` |
| 11 | Requests | Pending Request Withdrawal | Cho phép người tạo tự rút yêu cầu khi đang chờ duyệt | `requestId`, `requesterEmail` | Request chuyển sang `withdrawn` | 403 nếu không phải người tạo; 409 nếu không còn pending | DEC-003, REQ-004, `api-contracts.md` |
| 12 | Requests | Full-Shift Leave Approval | Duyệt nghỉ phép trọn vẹn theo nguyên ca làm việc | `requestId`, `shiftId`, `decision: approved` | `shifts.approved_leave_request_id` được set | 409 nếu ca đã có chấm công hoặc kỳ đã khóa | DEC-003, REQ-002, `decide-request.ts` |
| 13 | Attendance | Attendance Tolerance Check | Áp dụng dung sai 5 phút cho giờ vào/ra so với ca kế hoạch | `recordedAt`, `shift.startsAt`, `shift.endsAt` | Chấp nhận bình thường nếu <= 5 min; tạo ngoại lệ nếu > 5 min | Tạo `attendance_exception` trạng thái pending | DEC-004, ATT-006, `business-rules.md` |
| 14 | Attendance | Shift Boundary Clipping (15 min) | Ghi nhận sớm 15m/muộn 15m nhưng cắt giờ tính lương về khung ca | `openedAt`, `closedAt`, `shift` bounds | `worked_minutes` ghi nhận vs `clipped_minutes` | Vượt 15m không tự tính lương nếu thiếu overtime duyệt | DEC-004, ATT-006, `load-report.ts` |
| 15 | Attendance | Overtime Decision Approval | Phê duyệt giờ làm thêm ngoài khung ca kế hoạch | `sessionId`, `actor`, `approvedMinutes`, `reason` | Bản ghi overtime duyệt + audit | 403 nếu tự duyệt; 400 nếu thiếu lý do | DEC-004, ATT-008, `business-rules.md` |
| 16 | Attendance | Auto-Close Forgotten Checkout | Tự động đóng phiên chấm công quên checkout sau +4 giờ | Cron / Worker Trigger lúc `shift.endsAt + 4h` | Session đóng với cờ `MISSING_CHECKOUT`, approved = 0 | Bỏ qua nếu phiên đã được checkout thủ công | DEC-004, ATT-009, `implementation-plan.md` |
| 17 | Attendance | Append-Only Attendance Correction | Điều chỉnh công không sửa đè dữ liệu gốc | `sessionId`, `action`, `effectiveTime`, `reason` | Tạo bản ghi `attendance_corrections` | 409 nếu kỳ lương đã khóa hoặc trùng phiên khác | DEC-003, ATT-002, `correct-attendance.ts` |
| 18 | Payroll | Employee Rate History Management | Quản lý bảng lịch sử đơn giá hiệu lực không chồng lấn | `employeeId`, `rate`, `effectiveFrom`, `effectiveTo` | Bản ghi rate history mới + audit | 409 nếu khoảng hiệu lực bị chồng lấn; 400 nếu rate âm | DEC-006, PAY-004, `implementation-plan.md` |
| 19 | Payroll | 15-Minute Block Down-Rounding | Làm tròn xuống block 15 phút cho từng đoạn công tính lương | `approvedMinutes` | `flooredMinutes` (0, 15, 30, 45) | Không có (hàm toán học thuần) | DEC-006, PAY-001, `decision-register.md` |
| 20 | Payroll | Thousand-VND Total Rounding | Làm tròn số học tổng lương thực nhận về 1.000 VND | `calculatedTotalAmount` (integer VND) | `payableAmount` (làm tròn half-up 500 VND) | Không có (hàm toán học thuần) | DEC-006, PAY-005, `business-rules.md` |
| 21 | Payroll | Mid-Period Rate Splitting | Bóc tách giờ công theo từng đoạn rate khi đổi giá giữa kỳ | `sessionTimes`, `rateIntervals` | Mảng các segment `{ minutes, rate, amount }` | 409 nếu thiếu rate history cho một phân đoạn | DEC-006, PAY-004, `implementation-plan.md` |
| 22 | Payroll | Cross-Month Shift Splitting | Phân bổ giờ công của ca qua tháng vào đúng từng tháng | `shift: 23:00 (M1) - 01:00 (M2)` | 60 phút tính cho M1, 60 phút tính cho M2 | Không tính 120 phút cho cả hai tháng | PAY-002, EX-02, `business-rules.md` |
| 23 | Payroll | Immutable Period Finalization Snapshot | Đóng băng kỳ lương, lưu snapshot chi tiết bất biến | `periodId`, `actor` | `payroll_periods.status = 'finalized'`, snapshots lưu | 409 nếu có legacy thiếu rate history chưa xử lý | DEC-006, PAY-003, `change-period.ts` |
| 24 | Payroll | Owner-Only Period Reopen | Mở lại kỳ lương đã finalized bởi duy nhất OWNER | `periodId`, `actor.role == 'owner'` | `payroll_periods.status = 'reviewing'`, audit | 403 nếu actor không phải OWNER; 409 nếu đã paid | DEC-001, DEC-006, PAY-004, `change-period.ts` |
| 25 | Checklists | Shift Routine Identity Scoping | Gắn checklist item theo ID ca cụ thể thay vì business date | `itemId`, `shiftId`, `completed`, `actor` | `checklist_executions` theo `(item_id, shift_id)` | 403 nếu actor không thuộc ca hoặc không có quyền | DEC-005, OPS-001, `schema.ts` |
| 26 | Checklists | Incomplete Checklist Handover Alert | Cảnh báo việc chưa xong của ca trước khi bàn giao | `shiftId` | Danh sách uncompleted checklist items | Chặn bàn giao nếu có mục bắt buộc chưa hoàn thành | DEC-005, OPS-005, `business-rules.md` |
| 27 | Handovers | Handover Target & Acknowledgment | Ghi biên bản bàn giao kèm người/ca nhận và xác nhận | `authorEmail`, `receiverId/shiftId`, `summary` | Biên bản bàn giao; người nhận gọi `acknowledge()` | 403 nếu người khác cố acknowledge thay người nhận | DEC-005, OPS-003, `handovers.ts` |
| 28 | Handovers | Check-in Handover Gate & Bypass | Chặn check-in ca mới nếu chưa nhận bàn giao ca trước | `employeeCheckinRequest` | Cho phép check-in nếu đã ack hoặc có bypass | 403 / 412 Chặn check-in nếu chưa ack; bypass cần lý do | DEC-005, OPS-003, `api-contracts.md` |
| 29 | Ordering | Internal Cancel with Reason Code | Hủy đơn hàng ở `preparing`/`ready` với mã chuẩn hóa | `orderId`, `reasonCode`, `note`, `expectedStatus` | Trạng thái `cancelled`, ghi `order_status_history` | 403 nếu CUSTOMER/STAFF; 400 nếu sai reason enum | DEC-007, ORD-007, `change-status.ts` |
| 30 | Ordering | Spoilage Tracking & Reporting | Ghi nhận giá trị món bị hủy vào Báo cáo hao hụt riêng | `cancelledOrderItems` | Thống kê hao hụt (số lượng, giá trị niêm yết) | Không thay đổi `total_amount` đơn gốc, không tính doanh thu | DEC-007, ORD-007, `business-rules.md` |
| 31 | Ordering | Receipt Secret Isolation | Tra cứu và theo dõi đơn khách qua receipt secret khó đoán | `orderCode`, `receiptSecret` | Chi tiết đơn hàng của đúng khách | 404/403 nếu sai secret; không tra đơn theo số điện thoại | ORD-003, `security.md`, `schema.ts` |
| 32 | Retention | 90-Day Evidence Expiry & Cleanup | Tự động chặn đọc và xóa ảnh R2 + tọa độ GPS D1 sau 90 ngày | Retention cron trigger | Xóa object R2, xóa row `attendance_locations` | Không xóa `attendance_events`; retry nếu R2 lỗi | DEC-008, RET-001, `expire-evidence.ts` |
| 33 | Retention | 180-Day Order PII Anonymization | Ẩn danh hóa vĩnh viễn tên, SĐT, ghi chú đơn hàng sau 180 ngày | Retention cron trigger | Masking PII trên `customer_orders`, giữ items/giá | Giữ nguyên dữ liệu thống kê món và doanh số không định danh | DEC-008, RET-003, `security.md` |
| 34 | Retention | 3-Year Operational Data Preservation | Bảo tồn tối thiểu 3 năm dữ liệu công, lương, audit, vận hành | Retention policy | Dữ liệu được bảo vệ, cấm xóa trước 3 năm | Chặn các lệnh xóa dữ liệu công/lương/audit | DEC-008, RET-002, `business-rules.md` |

---

## 6. Danh Mục Các Trường Hợp Biên & Tình Huống Xung Đột (Edge Cases)

| # | Feature | Input / Tình huống | Observed / Expected Behavior |
|---|---|---|---|
| 1 | Anti-Self-Approval | OWNER cố gắng duyệt yêu cầu xin nghỉ hoặc sửa công do chính mình tạo | Trả về HTTP 403 Forbidden (`self_approval_blocked`). Không tạo audit ghi nhận duyệt thành công giả. |
| 2 | Anti-Self-Approval | Quán có 2 OWNER hoạt động, OWNER 1 cố tự sửa công qua luồng `sole_owner_self_correction` | Bị từ chối với HTTP 403 Forbidden vì luồng sole-owner chỉ khả dụng khi số lượng active owner chính xác bằng 1. OWNER 1 phải gửi yêu cầu để OWNER 2 duyệt. |
| 3 | Schedule Draft | Nhân viên STAFF gọi API lấy lịch làm việc cá nhân hoặc hôm nay | API chỉ trả về các ca `published`. Ca `draft` bị lọc bỏ hoàn toàn ở tầng SQL; nhân viên không thấy ca và không thể check-in vào ca draft. |
| 4 | Schedule Overlap Trigger | OWNER cố gắng tạo hoặc xuất bản một ca có khoảng thời gian `(startsAt, endsAt)` đè lên ca khác của cùng nhân viên | SQLite Trigger `shifts_no_overlap_insert`/`update` kích hoạt và ABORT transaction với lỗi `shift_overlap`. Không có ca nào trong lô được lưu (all-or-nothing). |
| 5 | Schedule Cut-off | MANAGER cố gắng hủy trực tiếp một ca làm việc khi còn 11 giờ 30 phút trước giờ bắt đầu ca | Bị từ chối với HTTP 409 Conflict vì đã vi phạm ngưỡng 12h cut-off. Hệ thống yêu cầu chuyển sang luồng `shift adjustment` có lý do và audit. |
| 6 | Shift Swap Concurrency | Quản lý nhấn "Duyệt & áp dụng" đơn đổi ca giữa nhân viên A (ca 1) và nhân viên B (ca 2), nhưng ca 2 vừa bị ai đó hủy | Transaction kiểm tra revision/state thất bại, hủy toàn bộ giao dịch, rollback ca 1 và giữ request ở trạng thái an toàn. Tuyệt đối không xảy ra tình trạng "partial apply" (chỉ đổi được 1 ca). |
| 7 | Request Withdrawal | Nhân viên A tạo yêu cầu đổi ca, sau đó nhấn "Rút đơn" khi quản lý chưa duyệt | Trạng thái request chuyển sang `withdrawn`. Nếu quản lý sau đó bấm duyệt, server từ chối vì request không còn ở trạng thái `pending`. |
| 8 | Tolerance & Exceptions | Nhân viên check-in muộn 4 phút so với giờ bắt đầu ca kế hoạch | Được chấp nhận là đúng giờ (nằm trong dung sai 5 phút), không sinh ngoại lệ. |
| 9 | Tolerance & Exceptions | Nhân viên check-in muộn 6 phút so với giờ bắt đầu ca kế hoạch | Hệ thống ghi nhận sự kiện, đồng thời tự động tạo `attendance_exception` trạng thái `pending` yêu cầu nhân viên giải trình lý do và quản lý xem xét. |
| 10 | Attendance Clipping | Ca 08:00–12:00. Nhân viên check-in lúc 07:48 (sớm 12 phút), checkout lúc 12:14 (muộn 14 phút), không có duyệt tăng ca | `recorded_minutes` ghi nhận đủ 266 phút (07:48 đến 12:14). Tuy nhiên `approved_minutes` / `payable_minutes` bị cắt về khung ca kế hoạch: chính xác 240 phút (4 giờ). |
| 11 | Attendance Overtime | Ca 08:00–12:00. Nhân viên checkout lúc 12:45. Quản lý phê duyệt tăng ca 30 phút có lý do | `approved_minutes` = 240 phút (khung ca) + 30 phút (overtime duyệt) = 270 phút. 15 phút còn lại không được duyệt bị cắt bỏ. |
| 12 | Forgotten Checkout (+4h) | Ca kết thúc lúc 12:00. Nhân viên quên bấm checkout. Đến 16:01 (quá 4 giờ sau khi hết ca), scheduler chạy | Phiên chấm công tự động đóng, gắn marker `MISSING_CHECKOUT`. `approved_minutes` và `payable_minutes` được gán bằng 0 cho đến khi nhân viên nộp giải trình và quản lý duyệt điều chỉnh công. |
| 13 | Cross-Month Shift | Ca làm việc bắt đầu lúc 23:00 ngày 31/07 và kết thúc lúc 01:00 ngày 01/08 (giờ Việt Nam). Cả 2 giờ đều được duyệt | Khi tính bảng lương: 60 phút (23:00–00:00) được tính vào kỳ lương tháng 7; 60 phút (00:00–01:00) được tính vào kỳ lương tháng 8. Không tính 120 phút cho cả hai tháng. |
| 14 | 15-Minute Floor Rounding | Nhân viên có tổng thời gian làm việc được duyệt trong phân đoạn là 58 phút | Làm tròn xuống block 15 phút: 58 phút làm tròn thành 45 phút (0.75 giờ). 13 phút dôi ra không đủ block 15 phút bị bỏ. |
| 15 | Rate Change Mid-Period | Đơn giá lương nhân viên là 20.000 VND/h từ ngày 1–15, tăng lên 25.000 VND/h từ ngày 16. Nhân viên làm 10 giờ trước ngày 16 và 10 giờ sau ngày 16 | Kỳ lương chia làm 2 đoạn: Đoạn 1: 10h x 20.000 = 200.000 VND. Đoạn 2: 10h x 25.000 = 250.000 VND. Không áp dụng mức 25.000 VND cho toàn bộ 20 giờ làm việc. |
| 16 | Total Salary 1.000 Rounding | Tổng tiền lương tạm tính sau khi nhân đơn giá và cộng thưởng/phạt là 1.450.500 VND | Làm tròn số học về 1.000 VND gần nhất: phần dư là 500 VND (>= 500 VND) nên làm tròn lên thành 1.451.000 VND. |
| 17 | Total Salary 1.000 Rounding | Tổng tiền lương tạm tính sau khi nhân đơn giá và cộng thưởng/phạt là 1.450.499 VND | Làm tròn số học về 1.000 VND gần nhất: phần dư là 499 VND (< 500 VND) nên làm tròn xuống thành 1.450.000 VND. |
| 18 | Locked Period Guard | OWNER cố gắng thêm ca mới hoặc sửa chấm công rơi vào kỳ lương đã `finalized` hoặc `paid` | SQLite trigger `shifts_locked_period_insert` hoặc application guard chặn lại với lỗi `shift_locked_period` / `period_locked`. Bắt buộc OWNER phải thực hiện luồng Reopen kỳ lương trước. |
| 19 | Handover Acknowledgment Gate | Nhân viên ca chiều đến quán, cố gắng bấm check-in nhưng chưa bấm "Xác nhận nhận bàn giao" ca sáng | API check-in trả về lỗi từ chối (412 Precondition Failed), yêu cầu nhân viên phải xác nhận biên bản bàn giao ca sáng trước. |
| 20 | Handover Bypass | Ca sáng bị sự cố mất điện, nhân viên ca sáng không tạo được bàn giao. Nhân viên ca chiều cần check-in gấp | Quản lý dùng quyền MANAGER/OWNER kích hoạt chức năng Bypass bàn giao kèm lý do khẩn cấp và hệ thống ghi nhận audit event. Nhân viên ca chiều được check-in bình thường. |
| 21 | Customer Cancel Attempt | Khách hàng đã gửi đơn, đơn đang ở trạng thái `preparing`. Khách gọi API hủy đơn | API trả về HTTP 403 Forbidden. Khách hàng không có quyền hủy đơn một khi đã gửi vào quán. |
| 22 | Order Spoilage Cancellation | Đơn hàng đang ở trạng thái `ready` (đã pha chế xong), khách không đến lấy. Quản lý bấm hủy | Bắt buộc chọn mã lý do `customer_abandoned`. Đơn chuyển sang `cancelled`, toàn bộ món bị hủy ghi nhận vào Báo cáo hao hụt (Spoilage Report) theo giá niêm yết; tổng tiền đơn gốc không bị trừ về 0. |
| 23 | Retention Purge Independence | Job retention xóa ảnh quá 90 ngày: R2 bucket tạm thời mất kết nối mạng hoặc lỗi 500 | Quá trình xóa ảnh ở R2 thất bại. Hệ thống bắt lỗi, ghi nhận failure metric, và TUYỆT ĐỐI KHÔNG xóa bản ghi `attendance_events` hay `attendance_sessions` ở D1. Job sẽ thử lại ở lần chạy kế tiếp. |
| 24 | Anonymization Immutability | Đơn hàng sau 180 ngày được chạy job ẩn danh hóa | Cột `customer_name` đổi thành `Khách hàng`, `customer_phone` đổi thành `***`, `customer_note` bị xóa. Số lượng món và giá tiền giữ nguyên. Sau khi ẩn danh, khách hàng không thể dùng receipt secret cũ để tra cứu thông tin cá nhân. |

---

## 7. Ràng Buộc Bất Biến Của Hệ Thống (System Invariant Rules)

1. **Bất biến Chặn Tự Duyệt (Anti-Self-Approval Invariant):**  
   `actor.id !== target.employee_id`. Mọi yêu cầu nghỉ, đổi ca, sửa công, duyệt công, duyệt ngoại lệ phải được xem xét bởi người có thẩm quyền khác người yêu cầu.
2. **Bất biến Bảo vệ Chủ Quán Cuối Cùng (Last Active Owner Invariant):**  
   Cửa hàng phải luôn có ít nhất một OWNER ở trạng thái `active`. Không có API nào được phép xóa, vô hiệu hóa (`suspend`/`offboard`) hoặc hạ role của OWNER cuối cùng.
3. **Bất biến Sự Kiện Công Gốc (Immutable Recorded Attendance Invariant):**  
   Bản ghi `attendance_events.recorded_at` là dữ liệu gốc phản ánh thời điểm thực tế máy chủ nhận được yêu cầu từ thiết bị, vĩnh viễn không bị UPDATE hay DELETE bởi bất kỳ tác vụ nghiệp vụ nào. Mọi sự thay đổi phải thông qua bảng append-only `attendance_corrections`.
4. **Bất biến Một Phiên Mở (Single Open Session Invariant):**  
   Mỗi nhân viên tại một thời điểm chỉ có tối đa một phiên chấm công ở trạng thái mở (`closed_at IS NULL`), được cưỡng chế bởi SQLite unique partial index `active_attendance_session_employee_idx`.
5. **Bất biến Chống Trùng Lịch Làm Việc (Shift Overlap Invariant):**  
   Một nhân viên không thể có 2 ca làm việc ở trạng thái `draft` hoặc `published` chồng lấn thời gian trong cùng một cửa hàng, được cưỡng chế ở tầng DB bởi triggers `shifts_no_overlap_insert` và `shifts_no_overlap_update`.
6. **Bất biến Khóa Kỳ Lương (Locked Period Invariant):**  
   Khi kỳ lương đã ở trạng thái `finalized` hoặc `paid`, toàn bộ số liệu công và lương của kỳ đó là bất biến. Không thể tạo ca mới (`shifts_locked_period_insert`), không thể tạo/sửa phiên chấm công, và không thể thay đổi snapshot lương. Chỉ OWNER mới có quyền Reopen kỳ lương.
7. **Bất biến Lịch Sử Đơn Giá (Rate History Point-in-Time Invariant):**  
   Đơn giá lương của nhân viên được tính theo bảng lịch sử `employee_rate_history` dựa trên thời điểm công phát sinh. Không áp dụng mức lương hiện tại hồi tố cho các ca làm việc trong quá khứ.
8. **Bất biến Phân Bổ Ca Qua Ranh Giới Kỳ (Period Boundary Clipping Invariant):**  
   Ca làm việc xuyên qua ranh giới tháng hoặc ranh giới kỳ lương phải được bóc tách chính xác theo số phút thuộc về từng kỳ. Không gộp toàn bộ ca vào một kỳ duy nhất.
9. **Bất biến Nguyên Tử Trong Đổi Ca (Atomic Shift Swap Invariant):**  
   Thao tác áp dụng đổi ca (`shift swap`) phải tráo đổi nhân viên của cả 2 ca và cập nhật trạng thái yêu cầu sang `applied` trong một transaction duy nhất. Bất kỳ lỗi nào phát sinh đều phải rollback toàn bộ, không chấp nhận trạng thái đổi dở dang (partial apply).
10. **Bất biến Gate Bàn Giao Ca (Handover Gate Invariant):**  
    Nhân viên không thể hoàn tất check-in ca mới nếu biên bản bàn giao của ca trước chưa được xác nhận (`acknowledged`), trừ khi có hành động `bypass` được kích hoạt bởi MANAGER/OWNER kèm lý do và audit log.
11. **Bất biến Không Thất Thoát Dữ Liệu Khi Dọn Dẹp (Retention Non-Destructive Invariant):**  
    Xóa ảnh R2 và GPS D1 quá hạn 90 ngày không được làm xóa sự kiện chấm công (`attendance_events`). Nếu R2 xóa thất bại, metadata sự kiện công vẫn được bảo toàn và chuyển sang đợt retry sau.
12. **Bất biến Doanh Thu Đơn Hàng (Order Revenue & Spoilage Invariant):**  
    Đơn hàng bị hủy sau khi pha chế (`preparing`/`ready`) được tính vào Báo cáo hao hụt, không làm thay đổi `total_amount` ban đầu của đơn hàng và không được hạch toán như doanh thu thực thu.

---

## 8. Hợp Đồng Giao Diện Liên Module (Cross-Module Interface Contracts)

### 8.1. `modules/people` ↔ `modules/operations` (Scheduling & Requests)
- **Contract:**  
  - `modules/people` cung cấp hàm xác thực quyền `canManageEmployee(actor, target)` và xác minh trạng thái `status === 'active'`.  
  - `modules/operations/application/manage-shifts.ts` bắt buộc gọi kiểm tra quyền của actor trước khi tạo/sửa/hủy ca; chặn `team_lead` tạo/sửa ca cho `manager` hoặc `owner`.  
  - `decide-request.ts` kiểm tra danh tính `actor.id !== target.employee_id`.

### 8.2. `modules/operations` ↔ `modules/attendance` (Shifts & Check-in)
- **Contract:**  
  - Bảng `attendance_sessions` liên kết khóa ngoại `shift_id` trỏ tới `shifts.id`.  
  - Khung thời gian `starts_at` và `ends_at` của ca quy định ngưỡng dung sai 5 phút và ngưỡng cắt biên 15 phút.  
  - Tác vụ tự động đóng ca quên checkout (`auto-close`) dựa vào `shift.ends_at + 4h` để quét các session chưa có `closed_at`.  
  - Kiểm tra trạng thái bàn giao ca (`handovers`): API check-in phải kiểm tra ca liền trước đã được `acknowledged` hoặc `bypassed`.

### 8.3. `modules/attendance` ↔ `modules/payroll` (Work Hours & Payroll Aggregation)
- **Contract:**  
  - Báo cáo lương (`loadPayrollReport`) tổng hợp dữ liệu từ `attendance_sessions`, bóc tách `clipped_minutes`, `approved_minutes` và `overtime_minutes` (từ bản ghi overtime được duyệt).  
  - Bản ghi `attendance_corrections` cung cấp `effective_time` để thay thế cho giờ gốc khi tính công.  
  - Bất kỳ thao tác thêm/sửa công nào rơi vào khoảng `period_start` đến `period_end` của một kỳ đã `finalized`/`paid` đều bị chặn bởi `payroll_periods` conflict check.

### 8.4. `modules/people` ↔ `modules/payroll` (Rate History & Eligibility)
- **Contract:**  
  - Quản lý nhân sự cung cấp bảng `employee_rate_history` gồm `{ employee_id, compensation_type, hourly_rate, effective_from, effective_to }`.  
  - Module lương truy vấn rate tương ứng với từng đoạn thời gian công phát sinh. Nếu một nhân viên thiếu rate history cho kỳ đang xét, module lương chặn thao tác finalize kỳ lương đó.

### 8.5. `modules/ordering` ↔ Platform Audit & Storage
- **Contract:**  
  - Mọi thao tác hủy đơn chuyển trạng thái sang `cancelled` bắt buộc ghi vào `order_status_history` và `audit_events`.  
  - Nếu trạng thái trước là `preparing` hoặc `ready`, thông tin món hủy được đẩy sang giao diện tổng hợp Báo cáo hao hụt (Spoilage Report).  
  - Cron retention gọi `anonymizeOrders(db, cutoffDate)` để cập nhật ẩn danh hóa PII cho các đơn hàng cũ hơn 180 ngày.

### 8.6. Cloudflare R2 ↔ Cloudflare D1 (Evidence Management)
- **Contract:**  
  - Ảnh chấm công lưu trên R2 với `object_key`, metadata lưu tại `attendance_photos(event_id, object_key, expires_at)`.  
  - Job `expireEvidence` quét các `attendance_photos` có `expires_at <= now`:  
    1. Gọi `evidence.delete(object_key)` trên R2.  
    2. Nếu thành công, xóa bản ghi trong `attendance_photos`.  
    3. Xóa các bản ghi tương ứng trong `attendance_locations`.  
    4. Giữ nguyên `attendance_events` để đảm bảo tính toàn vẹn của lịch sử chấm công.

---

## 9. Bảy Điểm Cần Làm Rõ & Ca Kiểm Thử Mẫu (Clarification Points C01 .. C07)

Dưới đây là 7 điểm cần làm rõ từ `docs/implementation-plan.md` đã được đối soát và định nghĩa thành các quy tắc thuật toán chính xác:

| Mã | Điểm cần xác định | Quyết định Đặc tả & Golden Test Cases |
|---|---|---|
| **C01** | Ma trận Actor / Requester / Beneficiary trong cấm tự duyệt & Scope của `team_lead` | **Quy tắc:**<br>- Xét 3 đối tượng: Actor (người gọi API), Requester (người tạo đơn), Beneficiary (nhân viên hưởng lợi từ ca/công).<br>- Điều kiện cho phép duyệt: `actor.id !== requester.id` VÀ `actor.id !== beneficiary.id`.<br>- Với đơn Swap: Beneficiary gồm cả nhân viên yêu cầu và nhân viên của ca thứ hai được đổi. Actor không được trùng với bất kỳ ai trong hai người này.<br>- Scope của `team_lead`: Chỉ được duyệt swap khi cả 2 nhân viên đều có role là `employee`. Nếu 1 trong 2 người là `team_lead`, `manager`, hoặc `owner`, `team_lead` bị chặn (HTTP 403). |
| **C02** | Trạng thái `draft` có chiếm chỗ trong Trigger Overlap không? | **Quy tắc:**<br>- Hiện tại trigger `shifts_no_overlap_insert`/`update` kiểm tra `status IN ('draft', 'published')`. Điều này có nghĩa ca draft VẪN GIỮ CHỖ lịch để người lập lịch không vô tình xếp trùng ca cho nhân viên.<br>- Tuy nhiên, ca draft ẩn hoàn toàn với nhân viên (không hiển thị trên lịch nhân viên, không tính vắng mặt, không thể check-in).<br>- Thao tác Publish có thể thực hiện theo từng ca hoặc theo lô (batch). Sau khi publish thành công mới kích hoạt gửi thông báo. |
| **C03** | Biên 15 phút: Ghi nhận thực tế vs Phút được tính lương & Xử lý ca không phân trước | **Golden Cases:**<br>- Ca kế hoạch 08:00–12:00 (240 phút):<br>  + Case A (07:50–12:10, không duyệt overtime): Ghi nhận 260 phút. Tính lương = 240 phút (bị clip về khung ca).<br>  + Case B (07:40–12:20, không duyệt overtime): Check-in sớm 20m (> 15m) và checkout muộn 20m (> 15m) được ghi nhận nhưng bị clip về đúng 240 phút.<br>  + Case C (07:50–12:30, duyệt overtime 20 phút): Tính lương = 240 + 20 = 260 phút.<br>- Phiên chấm công không có ca trước (Unscheduled session): Không tự đoán `ends_at`. Giờ tính lương mặc định = 0 cho đến khi quản lý duyệt gán ca hoặc duyệt điều chỉnh công. |
| **C04** | Thứ tự thực hiện Floor 15 phút, Split đoạn Rate và Round 1.000 VND | **Quy trình chuẩn thuật toán:**<br>1. *Bước 1 (Clip ca & Overtime):* Lấy thời gian làm việc thực tế clip theo khung ca kế hoạch + số phút overtime được duyệt.<br>2. *Bước 2 (Split kỳ & đoạn Rate):* Cắt ca theo ranh giới kỳ/tháng (nếu qua tháng) và chia theo các khoảng hiệu lực của `employee_rate_history`. Ta được các phân đoạn thời gian (segments).<br>3. *Bước 3 (Floor 15 phút theo phân đoạn):* Mỗi phân đoạn làm tròn XUỐNG theo block 15 phút: `floored_minutes = Math.floor(minutes / 15) * 15`.<br>   *Golden cases:* 14 phút → 0; 15 phút → 15; 29 phút → 15; 30 phút → 30.<br>4. *Bước 4 (Tính tiền phân đoạn):* `segment_amount = (floored_minutes / 60) * hourly_rate` (tính số nguyên VND).<br>5. *Bước 5 (Tổng hợp kỳ):* `subtotal = sum(segment_amount) + bonus - deduction`.<br>6. *Bước 6 (Round tổng 1.000 VND):* `final_salary = Math.round(subtotal / 1000) * 1000` (nếu phần dư >= 500 VND thì làm tròn lên). |
| **C05** | Quy tắc Bàn giao Ca & Xử lý ca đầu ngày / Không có ca trước | **Quy tắc:**<br>- Shift routine của ca phải được hoàn thành hoặc giải trình trước khi bàn giao.<br>- Ca đầu tiên trong ngày (hoặc ca mở cửa sau khi quán đóng cửa qua đêm không có ca liền trước): Hệ thống tự động đánh dấu cờ `no_previous_handover_required = true`, nhân viên được phép check-in bình thường mà không bị gate bàn giao chặn.<br>- Khi có ca liền trước: Nhân viên ca sau bắt buộc phải gọi API `acknowledge` bàn giao trước khi check-in.<br>- Nếu nhân viên ca trước quên bàn giao hoặc vắng mặt: MANAGER hoặc OWNER kích hoạt quyền `bypassHandover` kèm lý do và audit log để nhân viên ca sau check-in. |
| **C06** | Các quyết định bổ sung so với đề xuất ban đầu | **Xác nhận tính bắt buộc theo DEC hiện hành:**<br>- Nghỉ phép chỉ áp dụng trọn vẹn theo nguyên ca (DEC-003: không nghỉ nửa ca trong MVP).<br>- Cho phép rút đơn khi còn pending (DEC-003).<br>- Luồng sửa công `sole_owner_self_correction` chỉ mở khi quán có đúng 1 OWNER (DEC-001).<br>- Thời hạn lưu trữ dữ liệu vận hành tối thiểu 3 năm (DEC-008). |
| **C07** | Chu kỳ Lưu trữ & Ẩn danh hóa: Mốc bắt đầu & Trường cần xử lý | **Quy chuẩn:**<br>- Mốc bắt đầu tính hạn: Dựa trên `created_at` của bản ghi.<br>- 90 ngày (Evidence): Xóa physical object R2 và cột tọa độ tại `attendance_locations`.<br>- 180 ngày (Customer Orders): Ẩn danh hóa `customer_name = 'Khách hàng'`, `customer_phone = '***'`, xóa `customer_note` và `item_note`. Giữ nguyên danh mục món, số lượng, đơn giá, tổng tiền phục vụ báo cáo doanh số.<br>- 3 năm (Operational): Không tự động chạy job xóa dữ liệu công/lương/audit khi vừa chạm mốc 3 năm; 3 năm là ngưỡng sàn tối thiểu bảo vệ dữ liệu. |

---

## 10. Khoảng Cách Hiện Trạng Codebase So Với Đặc Tả Đích (Implementation Gaps)

Khảo sát mã nguồn hiện tại (`888495ba3fddf4798b80f9a1cbe4aec65c0991b8`) cho thấy hệ thống đã có khung nền tảng rất tốt (D1 triggers, R2 integration, migration chain 0000..0014, Drizzle schema, modular monolith), tuy nhiên còn tồn tại các khoảng cách lớn so với các quyết định DEC-001..DEC-009:

1. **Về Quyền & Tự duyệt (DEC-001):**
   - File `modules/operations/application/decide-request.ts` (dòng 6) và `modules/attendance/application/correct-attendance.ts` (dòng 14) vẫn cho phép `team_lead` duyệt mọi yêu cầu và sửa công.
   - Chưa có logic chặn tự duyệt (`actor.id !== target.employee_id`) tại server boundary.
   - Chưa có luồng `sole_owner_self_correction` riêng biệt với audit cờ cao.
   - `system_admin` chưa bị chặn ở các route nghiệp vụ nội bộ nếu session được cấp.

2. **Về Lịch làm việc & Cut-off (DEC-002):**
   - File `modules/operations/application/manage-shifts.ts` tạo ca và xuất bản trực tiếp (`status = 'published'`), chưa có luồng tạo ca `draft` riêng và hành động publish sau đó.
   - Chưa cưỡng chế ngưỡng 12 giờ cut-off; hiện tại chỉ kiểm tra ca chưa có chấm công hoặc chưa thuộc kỳ khóa mà chưa chặn sửa/hủy trực tiếp trong vòng 12h.
   - Chưa có endpoint và workflow cho `shift adjustment` sau cut-off.

3. **Về Đổi ca & Rút đơn (DEC-003):**
   - `decide-request.ts` khi duyệt đơn swap chỉ đánh dấu `status = 'approved'` và trả về `requiresManualAction: true`. Chưa thực hiện tráo đổi nhân viên giữa 2 ca một cách nguyên tử (`approved_pending_apply → applied`).
   - Chưa có API cho phép người tạo rút đơn (`withdraw`) khi đang `pending`.

4. **Về Chấm công & Tự đóng ca (DEC-004):**
   - File `modules/attendance/domain/policy.ts` dùng cấu hình động, chưa chuẩn hóa cứng quy tắc dung sai 5 phút và biên cắt 15 phút.
   - Chưa có module duyệt tăng ca riêng biệt (`overtime_approvals`).
   - Chưa có worker / scheduler tự động đóng phiên quên checkout sau `ends_at + 4h` và gán giờ tính công = 0.

5. **Về Lương & Lịch sử đơn giá (DEC-006):**
   - Database chưa có bảng `employee_rate_history`. Báo cáo lương `load-report.ts` đang lấy trực tiếp `hourly_rate` từ bảng `employees` hoặc snapshot cũ, chưa hỗ trợ chia đoạn rate khi đổi giá giữa kỳ.
   - Chưa áp dụng thuật toán làm tròn xuống block 15 phút và làm tròn tổng lương về 1.000 VND gần nhất.
   - Chưa có cơ chế chặn finalize kỳ lương đối với dữ liệu legacy thiếu rate history.

6. **Về Checklist & Bàn giao ca (DEC-005):**
   - Bảng `checklist_executions` hiện tại có khóa chính là `(item_id, business_date)`, chưa hỗ trợ định danh theo từng ca làm việc cụ thể (`shift_id`) cho các ca cùng ngày hoặc ca đêm.
   - Bảng `handovers` chưa có trường `receiver_employee_id` / `next_shift_id`.
   - Chưa có cơ chế gate chặn check-in nếu chưa xác nhận bàn giao ca trước.

7. **Về Hủy đơn & Hao hụt (DEC-007):**
   - File `modules/ordering/application/change-status.ts` cho phép hủy đơn trạng thái `ready` nhưng nhận lý do dạng free-text, chưa chuẩn hóa thành enum mã lý do (`customer_abandoned`, `item_preparation_error`, `store_incident`).
   - Chưa có Báo cáo hao hụt (Spoilage Report) ghi nhận giá trị món bị hủy.

8. **Về Lưu trữ & Ẩn danh hóa (DEC-008):**
   - `expire-evidence.ts` đã có logic xóa ảnh R2 và GPS D1 theo batch 100/200, nhưng chưa có job tự động ẩn danh hóa PII của đơn hàng sau 180 ngày.
   - Chưa có chính sách và công cụ diễn tập tái áp dụng expiry/anonymization sau khi phục hồi database từ backup.

---

## 11. Kết Luận & Khuyến Nghị Cho Nhóm Triển Khai

Báo cáo đặc tả này cung cấp bức tranh toàn cảnh, chính xác 100% dựa trên các tài liệu căn cứ chuẩn mực của dự án LoopiCafe.
- **Khuyến nghị thực hiện:** Đội ngũ phát triển cần bám sát kế hoạch tuần tự từ **P00** (cố định golden cases C01–C07 và fixture đa vai trò), tiến tới **P01** (khóa chặt phân quyền và chống tự duyệt tại server) trước khi mở rộng schema và logic cho **P02–P08**, và cuối cùng nghiệm thu tại **P09**.
- **Nguyên tắc bất di bất dịch:** Bảo toàn toàn vẹn dữ liệu, không sửa migration cũ đã áp dụng (từ 0000 đến 0014), duy trì SQLite triggers, và tuân thủ định dạng kiểm thử theo chuẩn `AGENTS.md`.
