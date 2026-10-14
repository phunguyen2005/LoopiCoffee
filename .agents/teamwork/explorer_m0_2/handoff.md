# Báo Cáo Bàn Giao (Handoff Report) — explorer_m0_2

**Nhiệm vụ:** Phân tích & thiết kế bộ kiểm thử Golden Cases C01–C07 (`tests/workforce-golden-cases.test.mjs`) cho Milestone M0 (Package P00).  
**Thời điểm hoàn tất:** 2026-10-13T16:45:00Z  
**Thư mục làm việc:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_2\`  
**Người nhận (Parent):** `6e943540-9db4-4898-95f7-1382b16362bf`

---

## 1. Observation (Quan Sát Thực Tế)

1. **Quy chuẩn kiểm thử của dự án:**
   - File `package.json` (dòng 12) định nghĩa lệnh test:
     `"test": "node --experimental-strip-types --test tests/*.test.mjs"`
   - Toàn bộ 161 tests hiện có đang chạy thành công thông qua Node Test Runner tích hợp sẵn.
   - Thư mục `tests/helpers/database.mjs` (dòng 1–42) cung cấp helper `createDatabase({ migrations = true })` sử dụng `node:sqlite` in-memory database (`:memory:`) và nạp tuần tự toàn bộ migration từ `drizzle/*.sql` (từ `0000_pink_doctor_doom.sql` đến `0014_indexes_and_perf.sql`).
2. **Hiện trạng xử lý quyền & duyệt yêu cầu (DEC-001 / C01):**
   - File `modules/operations/application/decide-request.ts` (dòng 6):
     `if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền duyệt yêu cầu.", 403, "forbidden");`
     -> `team_lead` hiện đang có quyền duyệt mọi loại yêu cầu (kể cả nghỉ phép); chưa có logic kiểm tra `actor.id !== requester.id` hay `actor.id !== beneficiary.id`.
   - File `modules/attendance/application/correct-attendance.ts` (dòng 14):
     `if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền điều chỉnh chấm công.", 403);`
     -> Cho phép `team_lead` sửa công và chưa chặn tự sửa công đối với chủ quán khi quán có >= 2 owners.
3. **Hiện trạng Trigger Overlap & Trạng thái Draft (DEC-002 / C02):**
   - File `drizzle/0011_workforce_integrity.sql` (dòng 61–79):
     `CREATE TRIGGER shifts_no_overlap_insert BEFORE INSERT ON shifts`
     `WHEN NEW.status IN ('draft', 'published') AND NEW.approved_leave_request_id IS NULL`
     `BEGIN`
     `  SELECT RAISE(ABORT, 'shift_overlap') WHERE EXISTS (`
     `    SELECT 1 FROM shifts s WHERE lower(s.employee_email) = lower(NEW.employee_email)`
     `      AND s.store_id = NEW.store_id AND s.status IN ('draft', 'published') AND s.approved_leave_request_id IS NULL`
     `      AND s.starts_at < NEW.ends_at AND s.ends_at > NEW.starts_at`
     `  );`
     `END;`
     -> Trigger SQLite ĐÃ HỖ TRỢ và cưỡng chế giữ chỗ lịch cho cả trạng thái `'draft'` và `'published'`.
4. **Hiện trạng tính giờ công & clipping (DEC-004 / C03):**
   - File `modules/payroll/application/load-report.ts` (dòng 97–98):
     `session_data AS (SELECT s.*, CAST(MAX(0, (julianday(MIN(s.closed_at, p.end_at)) - julianday(MAX(s.opened_at, p.start_at))) * 1440 + 0.000001) AS INTEGER) AS clipped_minutes FROM attendance_sessions s CROSS JOIN period_window p)`
     -> Hiện tại chỉ clip theo khung kỳ lương `period_window`, chưa clip về khung ca kế hoạch của nhân viên (`shift.starts_at`, `shift.ends_at`).
5. **Hiện trạng làm tròn lương & lịch sử đơn giá (DEC-006 / C04):**
   - Bảng `employee_rate_history` chưa có trong schema D1 (chuỗi migration dừng ở 0014).
   - `load-report.ts` đang lấy trực tiếp `hourly_rate` từ bảng `employees`, chưa hỗ trợ bóc tách giờ công theo các đoạn rate hiệu lực khi đổi giá giữa kỳ, chưa làm tròn xuống block 15 phút cho từng đoạn công, và chưa làm tròn tổng tiền lương về 1.000 VND gần nhất.
6. **Hiện trạng Bàn giao & Check-in (DEC-005 / C05):**
   - Bảng `handovers` (tại `0000_pink_doctor_doom.sql` và `0001_eager_peter_parker.sql`) có `author_email`, `summary`, `manager_attention`, `acknowledged_at`.
   - File `app/api/attendance/actions/route.ts` (dòng 90–120) chưa có bước kiểm tra ràng buộc biên bản bàn giao của ca trước trước khi cho phép check-in.
7. **Hiện trạng Lưu trữ & Ẩn danh hóa (DEC-008 / C07):**
   - File `modules/attendance/application/expire-evidence.ts` (dòng 1–136): Đã triển khai hoàn chỉnh logic xóa ảnh trên R2, xóa row `attendance_photos` và `attendance_locations`, bảo toàn `attendance_events`, xử lý retry an toàn khi R2 trả lỗi.
   - Chưa có file/job tự động ẩn danh hóa PII của đơn hàng sau 180 ngày.

---

## 2. Logic Chain (Chuỗi Lập Luận)

1. Từ **Quan sát 1**, bộ test `tests/workforce-golden-cases.test.mjs` bắt buộc phải tương thích với lệnh `node --experimental-strip-types --test tests/*.test.mjs` và không được gây hồi quy (zero regression) cho 161 test cases đang chạy.
2. Từ **Quan sát 2** và yêu cầu **C01**, điều kiện cấm tự duyệt phải bao hàm cả người tạo (`requester`) và người thụ hưởng (`beneficiary`). Trong giao dịch đổi ca (`swap`), cả hai nhân viên tham gia đổi ca đều là `beneficiary`. Do đó, kiểm tra `actor.id !== requester.id` là chưa đủ mà bắt buộc phải kiểm tra `actor.id !== peer_employee.id`. Đồng thời, quyền của `team_lead` phải bị chặn khỏi các hành động quản lý nhân sự (nghỉ, sửa công, chốt lương, duyệt công) và chỉ được duyệt đổi ca khi cả 2 nhân viên đều là `employee`.
3. Từ **Quan sát 3** và yêu cầu **C02**, SQLite trigger hiện tại đã ngăn chặn overlap cho cả `draft` và `published`. Vì vậy, không cần sửa đổi trigger ở tầng DB; thay vào đó, ca draft chỉ cần được lọc bỏ ở tầng truy vấn hiển thị cho nhân viên (`status = 'published'`) và chặn check-in.
4. Từ **Quan sát 4** và yêu cầu **C03**, sự khác biệt giữa `recorded_minutes` (thời gian thực tế từ thiết bị) và `payable_minutes` (thời gian tính lương) là cốt lõi: 15 phút biên sớm/muộn chỉ là biên chấp nhận ghi nhận, mặc định bị cắt về khung ca kế hoạch trừ khi có bản ghi phê duyệt tăng ca rõ ràng. Với ca không phân trước (`shift_id IS NULL`), hệ thống không được suy đoán giờ kết thúc, gán mặc định payable = 0.
5. Từ **Quan sát 5** và yêu cầu **C04**, việc làm tròn 15 phút phải thực hiện **theo từng phân đoạn** (sau khi đã split theo tháng và theo khoảng hiệu lực của `employee_rate_history`) để tránh tính trùng hoặc làm sai lệch đơn giá. Tổng tiền lương cuối kỳ mới được làm tròn số học về 1.000 VND gần nhất (ngưỡng 500 VND).
6. Từ **Quan sát 6** và yêu cầu **C05**, check-in gate phải có ngoại lệ tự động cho ca đầu ngày (`no_previous_handover_required = true`) để tránh vòng lặp bị chặn; đồng thời cơ chế bypass của Manager/Owner cần lý do >= 10 ký tự và ghi audit để đảm bảo vận hành linh hoạt trong tình huống khẩn cấp.
7. Từ **Quan sát 7** và yêu cầu **C07**, mốc tính hạn là `created_at`. Việc xóa bằng chứng (90d) không được làm mất sự kiện chấm công (`attendance_events`); ẩn danh hóa đơn hàng (180d) phải giữ nguyên doanh số/món; và ngưỡng 3 năm là sàn bảo tồn tối thiểu, cấm cài đặt job tự động xóa dữ liệu vận hành.
8. Kết hợp toàn bộ lập luận trên, việc thiết kế file `tests/workforce-golden-cases.test.mjs` theo chiến lược:
   - Các bài test đánh giá DB triggers, domain math, attendance immutability, evidence expiry được kích hoạt chạy PASS ngay tại M0.
   - Các bài test kiểm chứng mutation API mới (P01–P08) được viết đầy đủ assert và tạm thời bọc trong `t.skip("Sẽ kích hoạt trong Milestone...")` để bảo đảm `npm test` luôn xanh 100%.

---

## 3. Caveats (Ràng Buộc & Điểm Cần Lưu Ý)

1. **Phụ thuộc Fixture:** Thiết kế trong `golden_cases_plan.md` giả định bộ helper fixture đa vai trò `tests/fixtures/workforce-fixtures.mjs` (đang do `explorer_m0_1` thiết kế) sẽ cung cấp các hàm tạo store và employee theo đúng interface chuẩn (`setupMultiRoleStore`, `createTestRequest`). Nếu interface của `explorer_m0_1` có khác biệt về tên hàm, file test chỉ cần điều chỉnh tên import mà không thay đổi logic kiểm thử.
2. **Phạm vi M0 (Read-Only Investigation):** Không có file code hay test nào trong `tests/` hoặc `modules/` bị chỉnh sửa trong lượt này. Toàn bộ thiết kế đã được ghi thành tài liệu chi tiết tại `golden_cases_plan.md`.
3. **Chuyển tiếp sang M1–M4:** Các subagent triển khai P01–P08 có trách nhiệm gỡ bỏ `t.skip` tương ứng cho từng nhóm test khi tính năng tương ứng được đưa vào codebase.

---

## 4. Conclusion (Kết Luận Đánh Giá)

1. **Đã làm rõ 100% 7 điểm C01–C07:**
   - C01: Ma trận cấm tự duyệt dựa trên `[Actor, Requester, Beneficiary]` và giới hạn chặt chẽ vai trò `team_lead`.
   - C02: Ca draft giữ chỗ trong SQLite trigger overlap nhưng ẩn hoàn toàn với nhân viên và chặn check-in.
   - C03: Định nghĩa 4 golden cases cho biên 15 phút (Case A, B, C, D) và tự đóng ca quên checkout (+4h).
   - C04: Quy trình chuẩn thuật toán 6 bước cho floor 15m, rate history split và round 1.000 VND.
   - C05: Gate xác nhận bàn giao trước check-in, tự động bỏ qua cho ca đầu ngày, và luồng Manager bypass có audit.
   - C06: Nghỉ phép nguyên ca, rút đơn khi pending, và luồng `sole_owner_self_correction` chỉ mở khi có đúng 1 owner.
   - C07: Chu kỳ 90 ngày (xóa R2/GPS, giữ event), 180 ngày (ẩn danh PII, giữ doanh số), và sàn bảo tồn tối thiểu 3 năm.
2. **Đã ban hành tài liệu thiết kế chi tiết:** File `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_2\golden_cases_plan.md` đã hoàn thành, cung cấp đầy đủ bảng ma trận input/expected output, mã lỗi, và mã nguồn JavaScript mẫu cho `tests/workforce-golden-cases.test.mjs`.

---

## 5. Verification Method (Phương Pháp Tự Xác Minh Độc Lập)

Người nhận hoặc Reviewer có thể kiểm chứng lại toàn bộ các nhận định trên bằng các bước sau:

1. **Kiểm tra sự tồn tại và tính đầy đủ của tài liệu thiết kế:**
   ```bash
   cat .agents/teamwork/explorer_m0_2/golden_cases_plan.md
   ```
   *Điều kiện đạt:* Có đủ 7 mục C01–C07 với bảng test cases, input, expected output, và code mẫu.
2. **Kiểm tra Trigger Overlap hiện hữu cho trạng thái Draft (C02):**
   ```bash
   rg -n "shifts_no_overlap_insert" drizzle/0011_workforce_integrity.sql
   ```
   *Điều kiện đạt:* Trigger chứa `WHEN NEW.status IN ('draft', 'published')`.
3. **Kiểm tra baseline hiện tại của toàn bộ bộ test dự án:**
   ```bash
   npm.cmd test
   ```
   *Điều kiện đạt:* Toàn bộ 161 tests hiện có chạy PASS không có lỗi.
4. **Kiểm chứng các module hiện hữu được đối chiếu:**
   - Kiểm tra `modules/operations/application/decide-request.ts` dòng 6 (`team_lead` hiện vẫn nằm trong mảng quyền).
   - Kiểm tra `modules/attendance/application/expire-evidence.ts` (xóa ảnh R2, xóa GPS D1, giữ nguyên `attendance_events`).
