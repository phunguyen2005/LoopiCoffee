# Handoff Report — explorer_m0_1

**Milestone:** M0 (P00 Baseline, Golden Cases & Test Fixtures)  
**Tác vụ:** Multi-Role Fixtures & Database Seed Helpers Design  
**Tài liệu phân tích chi tiết:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_1\fixtures_plan.md`

---

## 1. Observation

1. **Test Runner & Cấu hình kiểm thử:**
   - File `package.json:12` định nghĩa lệnh test: `"test": "node --experimental-strip-types --test tests/*.test.mjs"`.
   - Lệnh kiểm thử trên môi trường Windows thông qua PowerShell yêu cầu gọi `npm.cmd test`.
   - Kết quả chạy baseline ngày 2026-10-13: `# tests 161`, `# suites 1`, `# pass 161`, `# fail 0`, thời gian 13.07 giây. 100% tests hiện tại đều đạt.

2. **Hạ tầng Test Database hiện tại:**
   - File `tests/helpers/database.mjs` (dòng 1–54) cung cấp:
     - `createDatabase({ migrations = true } = {})`: khởi tạo SQLite in-memory (`DatabaseSync(":memory:")`), nạp tự động toàn bộ migration từ thư mục `drizzle/` (`0000_pink_doctor_doom.sql` đến `0014_indexes_and_perf.sql`), mô phỏng các phương thức D1: `prepare`, `bind`, `first`, `all`, `run`, `batch`, `failOn`.
     - `seedStore(db, id = "store-a")`: chèn bản ghi đơn giản vào bảng `stores`.
     - `seedEmployee(db, { id = "owner-a", storeId = "store-a", role = "owner", status = "active" } = {})`: chèn bản ghi đơn giản vào bảng `employees`.
   - Có 20+ file test (như `tests/workforce-integrity.test.mjs`, `tests/adversarial-p1-remediation.test.mjs`, `tests/business-logic-verification.test.mjs`, v.v.) đang import trực tiếp `createDatabase, seedStore, seedEmployee` từ `./helpers/database.mjs`.

3. **Cấu trúc Dữ liệu & Bất Biến trong Cơ sở dữ liệu:**
   - Bảng `employees` trong `db/schema.ts:18-45` định nghĩa:
     - `role`: enum `"system_admin" | "owner" | "manager" | "team_lead" | "employee"`.
     - `status`: enum `"invited" | "active" | "suspended" | "offboarded" | "inactive"` (mặc định `"invited"`).
     - Các cột liên quan: `auth_user_id`, `must_change_password`, `hourly_rate`, `compensation_type`, `payroll_eligible`, `participates_attendance`.
   - Trigger SQLite trong `drizzle/0011_workforce_integrity.sql:61-79`:
     - `shifts_no_overlap_insert` và `shifts_no_overlap_update` kiểm tra `WHEN NEW.status IN ('draft', 'published') AND NEW.approved_leave_request_id IS NULL`. Cả ca `draft` lẫn `published` đều chiếm chỗ lịch để tránh trùng ca.
   - Bảng `shifts` trong `db/schema.ts:72-89`: `status` gồm `"draft" | "published" | "cancelled" | "completed"`.
   - Bảng `requests` trong `db/schema.ts`: hỗ trợ `type` (`leave`, `swap`, `correction`), `status` (`pending`, `approved`, `rejected`, `withdrawn`, `applied`, `approved_pending_apply`).
   - Bảng `handovers` trong `db/schema.ts`: ghi nhận bàn giao ca (`author_email`, `acknowledged_at`, `summary`).

4. **Hiện trạng Fixtures:**
   - Thư mục `tests/fixtures/` chưa tồn tại trong repo.
   - Các file test hiện tại tự viết các câu lệnh `db.sqlite.prepare("INSERT INTO attendance_sessions ...").run(...)` và `db.sqlite.prepare("INSERT INTO attendance_events ...").run(...)` riêng lẻ (ví dụ: `workforce-integrity.test.mjs:17-24`, `adversarial-m4-isolation.test.mjs:25-41`).

---

## 2. Logic Chain

1. **Từ Quan sát 1 & 2:** `tests/helpers/database.mjs` là hòn đá tảng của toàn bộ hệ thống test hiện hữu. Nếu thay đổi chữ ký hàm `seedStore` hoặc `seedEmployee` làm mất tính tương thích ngược, 20+ file test với 161 test cases sẽ bị vỡ. Do đó:
   - Các hàm hiện có trong `database.mjs` phải giữ nguyên 100% tham số mặc định và cấu trúc dữ liệu trả về.
   - Các seed helpers mở rộng (`seedShift`, `seedAttendanceSession`, `seedAttendanceEvent`, `seedAttendanceRules`, `seedPayrollPeriod`, `seedRequest`, `seedHandover`, `seedEmployeeRateHistory`) phải được bổ sung theo nguyên tắc cộng dồn (additive-only).

2. **Từ Quan sát 1 & 4:** Pattern phát hiện test của Node.js là `tests/*.test.mjs`. Khi tạo thư mục `tests/fixtures/` và file `tests/fixtures/workforce-fixtures.mjs`, file này sẽ nằm trong thư mục con và không có hậu tố `.test.mjs`. Do đó, Node test runner sẽ không cố gắng chạy file fixture như một test file, loại bỏ hoàn toàn nguy cơ false-positive hoặc lỗi không có test cases.

3. **Từ Quan sát 3 và Tài liệu Đặc tả (DEC-001..007, C01..C07):**
   - Nghiệp vụ LoopiCafe có sự phân nhánh rất sâu giữa `sole_owner` (cho phép luồng `sole_owner_self_correction` vì không có ai khác để duyệt) và `multi_owner` (chặn tuyệt đối `sole_owner_self_correction`, bắt buộc Owner 2 duyệt cho Owner 1).
   - `team_lead` bị thu hẹp quyền (chỉ duyệt swap giữa 2 `employee`, bị chặn duyệt nghỉ, sửa công, duyệt công, xem GPS/ảnh, chốt lương).
   - `system_admin` là tài khoản kỹ thuật bị cách ly hoàn toàn khỏi nghiệp vụ kinh doanh.
   - Các trạng thái `suspended`, `offboarded`, `invited` cần được khởi tạo sẵn sàng để kiểm thử chặn truy cập, bảo toàn lịch sử công trong bảng lương, và chặn check-in.
   - Vì vậy, một hàm fixture đơn lẻ `createWorkforceFixture(db, { mode: 'sole_owner' | 'multi_owner' })` là giải pháp tối ưu, tập trung toàn bộ 7 nhóm vai trò và 4 trạng thái vòng đời vào một nơi duy nhất.

4. **Từ Quan sát 3 về Tenant Boundary:**
   - Việc tạo thêm helper `createMultiStoreFixture(db)` tự động thiết lập `store-alpha` và `store-beta` với các tập ID hoàn toàn độc lập giúp các test case kiểm tra cách ly dữ liệu và chống rò rỉ quyền mà không cần tự cấu hình thủ công.

---

## 3. Caveats

1. **Chưa có Migration 0015 cho `employee_rate_history`:**
   - Hiện tại head migration là `0014_indexes_and_perf.sql`. Bảng `employee_rate_history` thuộc phạm vi gói P05 (Milestone M3). Trong thiết kế của `seedEmployeeRateHistory`, helper kiểm tra sự tồn tại của bảng trước khi chèn, hoặc sẵn sàng hoạt động ngay khi migration 0015 được thêm vào.
2. **System Admin Store ID:**
   - Trong `db/schema.ts`, trường `employees.store_id` có ràng buộc khóa ngoại `REFERENCES stores(id)`. Do đó, tài khoản `system_admin` trong fixture test vẫn phải liên kết tạm với một store ID hợp lệ để thỏa mãn FOREIGN KEY constraint của SQLite, nhưng trong tầng application/domain, `system_admin` bị chặn khỏi mọi route nghiệp vụ dựa trên role của mình.
3. **Giới hạn điều tra (Read-Only Investigation):**
   - Không thực hiện sửa đổi mã nguồn codebase bên ngoài thư mục `.agents/teamwork/explorer_m0_1/`. Tất cả các đoạn mã được đề xuất là bản thiết kế hoàn chỉnh sẵn sàng cho Implementer.

---

## 4. Conclusion

1. **Tính khả thi và độ an toàn:** Thiết kế bộ fixture `tests/fixtures/workforce-fixtures.mjs` và mở rộng `tests/helpers/database.mjs` đáp ứng 100% yêu cầu Milestone M0 (P00), đảm bảo tính cô lập, sạch sẽ, không gây ảnh hưởng đến 161 tests hiện có.
2. **Khả năng tái sử dụng cao:**
   - `workforce-fixtures.mjs` cung cấp 7 tác nhân chuẩn (`employeeA`, `employeeB`, `teamLead`, `manager`, `soleOwner`, `multiOwner1/2`, `systemAdmin`).
   - Cung cấp 4 trạng thái vòng đời (`active`, `suspended`, `offboarded`, `invited`).
   - Cung cấp 2 mô hình quán (`sole_owner` và `multi_owner`).
   - Cung cấp mô hình đa store (`createMultiStoreFixture`).
   - Cung cấp 6 scenario builders chuyên dụng hỗ trợ trực tiếp các trường hợp mẫu C01–C07 cho `explorer_m0_2`.
3. **Tài liệu bàn giao:** File thiết kế hoàn chỉnh chi tiết mã nguồn và hợp đồng API đã được lưu tại:  
   `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_1\fixtures_plan.md`.

---

## 5. Verification Method

Người nhận bàn giao (Reviewer, Implementer, hoặc Auditor) có thể xác minh độc lập báo cáo này theo các bước sau:

1. **Kiểm tra Baseline hiện tại:**
   ```powershell
   npm.cmd test
   ```
   *Tiêu chí đạt:* Toàn bộ 161 test cases vượt qua không lỗi (`161 pass, 0 fail`).

2. **Kiểm tra File Phân tích & Thiết kế:**
   Xem file `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_m0_1\fixtures_plan.md`.
   - Xác nhận sự hiện diện của 7 nhóm actor trong Mục 2.
   - Xác nhận 4 trạng thái vòng đời trong Mục 3.
   - Xác nhận thiết kế API của `tests/fixtures/workforce-fixtures.mjs` trong Mục 5.
   - Xác nhận chữ ký tương thích ngược của các hàm trong Mục 6.

3. **Điều kiện Vô hiệu hóa (Invalidation Conditions):**
   - Kết luận này sẽ bị vô hiệu hóa nếu việc thêm file `tests/fixtures/workforce-fixtures.mjs` khiến lệnh `npm.cmd test` bị fail hoặc cố thực thi file fixture này như một bài test.
   - Kết luận này sẽ bị vô hiệu hóa nếu việc mở rộng `seedStore` hoặc `seedEmployee` làm gãy bất kỳ bài test nào trong số 161 tests hiện hành.
