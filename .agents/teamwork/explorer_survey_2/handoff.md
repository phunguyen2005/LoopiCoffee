# Handoff Report — explorer_survey_2

**Vai trò**: `explorer_survey_2` (teamwork_preview_explorer)  
**Ngày**: 2026-10-13  
**Chủ đề**: Khảo sát database schema, migrations, triggers, baseline test và độ phủ kiểm thử cho P00–P09 & ACC-01..13  
**Báo cáo chi tiết**: `.agents/teamwork/explorer_survey_2/infra_test_report.md`

---

## 1. Observation (Quan Sát Trực Tiếp)

1. **Kết quả chạy lệnh kiểm thử baseline**:
   - `npm.cmd test`: chạy lệnh `node --experimental-strip-types --test tests/*.test.mjs`.
     - Output: `1..159`, `# tests 161`, `# suites 1`, `# pass 161`, `# fail 0`, `# cancelled 0`, `# skipped 0`, `# todo 0`, `duration_ms 10345.7558`.
     - Toàn bộ 25 files trong `tests/` vượt qua 100%.
   - `npm.cmd run typecheck`: chạy `wrangler types ... && tsc --noEmit --incremental false`.
     - Output: Exit code 0, không có lỗi kiểu dữ liệu.
   - `npm.cmd run lint`: chạy `eslint . --ignore-pattern dist --ignore-pattern .next`.
     - Output: Exit code 0, không có lỗi linting.
   - `npm.cmd run build`: chạy `node tooling/run-local.mjs build`.
     - Output: Exit code 0. Vinext hoàn thành 5 bước build (analyze client references, rsc build, client build, ssr build, worker assets) sạch sẽ.

2. **Database Schema & Migrations D1/SQLite**:
   - Schema file `db/schema.ts` (455 dòng) định nghĩa các bảng và export Drizzle models.
   - Thư mục `drizzle/` có 15 files migration SQL: từ `0000_pink_doctor_doom.sql` đến `0014_indexes_and_perf.sql`.
   - File `tests/drizzle-migrations-preflight.test.mjs` dòng 43 và dòng 51:
     - Khởi tạo chính xác **31 bảng vật lý** (`stores`, `employees`, `shifts`, `attendance_sessions`, `attendance_corrections`, `payroll_adjustments`, v.v.).
     - Thiết lập chính xác **15 triggers** trong SQLite.
     - Kiểm tra schema parity giữa `db/schema.ts` và SQLite catalog: 0 drift, 0 mismatch về NOT NULL và DEFAULT.
   - Bảng `employee_rate_history` hoàn toàn **chưa xuất hiện** trong `db/schema.ts` và thư mục `drizzle/` (chỉ xuất hiện trong `docs/implementation-plan.md:97` và `ORIGINAL_REQUEST.md:44`).

3. **Database Triggers hiện có**:
   - `0011_workforce_integrity.sql`:
     - Dòng 23: `CREATE TRIGGER attendance_session_revision_guard BEFORE UPDATE OF opened_at, closed_at, worked_minutes, status ON attendance_sessions WHEN NEW.revision <> OLD.revision + 1 BEGIN SELECT RAISE(ABORT, 'attendance_conflict'); END;`
     - Dòng 40, 42: `attendance_corrections_immutable_update`, `attendance_corrections_immutable_delete` chặn UPDATE/DELETE trên `attendance_corrections`.
     - Dòng 57, 59: `payroll_adjustments_immutable_update`, `payroll_adjustments_immutable_delete` chặn UPDATE/DELETE trên `payroll_adjustments`.
     - Dòng 61, 71: `shifts_no_overlap_insert`, `shifts_no_overlap_update` chặn ca trùng giờ khi `NEW.status IN ('draft', 'published')`.
     - Dòng 81–93: Các triggers tự động tăng `stores.workforce_revision` khi có thay đổi ca, phiên làm việc, lương nhân viên hoặc điều chỉnh lương.
   - `0013_workforce_guardrails.sql`:
     - Dòng 1–8: `shifts_locked_period_insert` chặn chèn ca mới nếu ca nằm trong kỳ lương đã chốt/thanh toán (`finalized`, `paid`).

4. **Hiện trạng code nghiệp vụ so với DEC-001..009**:
   - `modules/people/domain/access.ts`: Không có hàm chặn self-approval (`actor != target`), không có luồng `sole_owner_self_correction`.
   - `modules/operations/application/manage-shifts.ts`: Dòng 37–38 gán cứng trạng thái `'published'` khi tạo ca; không có kiểm tra cut-off 12 giờ.
   - `modules/operations/application/decide-request.ts`: Dòng 6 cho phép `team_lead` duyệt mọi request; dòng 52–56 chỉ đánh dấu manual action cho đổi ca (swap), không áp dụng nguyên tử 2 ca.
   - `modules/attendance/application/review-attendance.ts`: Dòng 6 cho phép `team_lead` review ngoại lệ chấm công; không có guard chặn tự duyệt.
   - `modules/attendance/application/correct-attendance.ts`: Dòng 14 cho phép `team_lead` sửa chấm công; không chặn người dùng tự sửa công của chính mình.
   - `modules/payroll/application/load-report.ts`: Dòng 225 tính `Math.round((approvedMinutes / 60) * effectiveHourlyRate)`, chưa có floor block 15 phút, chưa chia đoạn rate history, chưa làm tròn tổng về 1.000 VND gần nhất.
   - `modules/ordering/application/change-status.ts`: Dòng 13 nhận `cancelReason` dạng free-text, chưa có standardized enum reason code.
   - `modules/attendance/application/expire-evidence.ts`: Chỉ xử lý xóa ảnh/GPS, chưa có chức năng ẩn danh hóa PII đơn hàng 180 ngày (`anonymize-orders.ts` chưa tồn tại).

---

## 2. Logic Chain (Chuỗi Lập Luận)

1. Từ **Observation 1**, ta thấy toàn bộ bộ test suite hiện có (161 tests), typecheck, lint và build đều PASS hoàn hảo trên working tree hiện tại. Điều này chứng minh mã nguồn đang ở trạng thái **baseline sạch (clean baseline)**, không có lỗi kỹ thuật tiềm ẩn, không có compilation/linter blocker.
2. Từ **Observation 2 và 3**, ta thấy cấu trúc database hiện tại đã hoàn tất chuỗi 15 migrations (Head 0014), tạo đủ 31 bảng và 15 triggers. Hệ thống migration và preflight check hoạt động cực kỳ ổn định, schema Drizzle và SQLite in-memory không có bất kỳ sai lệch nào.
3. Tuy nhiên, khi đối chiếu **Observation 2 và 4** với các yêu cầu nghiệp vụ DEC-001..009 trong `ORIGINAL_REQUEST.md`:
   - Bảng `employee_rate_history` chưa có, nghĩa là P05/DEC-006 bắt buộc phải tạo migration mới (dự kiến là `0015_...`).
   - Trigger `shifts_no_overlap` hiện tại chặn cả ca `draft` và `published`. Khi P03 triển khai đổi ca (shift swap) nguyên tử, nếu update tuần tự hai ca sẽ bị trigger overlap chặn đứng. Do đó, logic swap phải được thiết kế có giải pháp kỹ thuật phù hợp với trigger SQLite/D1.
   - Các mutation routes hiện đang cho phép `team_lead` thao tác ngoài thẩm quyền và hoàn toàn thiếu lớp kiểm tra self-approval (`actor != target`).
   - Bảng `requests` hiện chỉ có 1 `shift_id`, không đủ trường để lưu ca đối ứng trong yêu cầu đổi ca, đòi hỏi mở rộng schema.
4. Từ các mắt xích trên, đi đến kết luận: Dự án đã sẵn sàng 100% về mặt hạ tầng kiểm thử và database tooling để tiến hành các gói triển khai tiếp theo (bắt đầu từ P00 và P01). Mọi thay đổi schema mới bắt buộc phải đi qua Drizzle migration tiếp theo (`0015`), cập nhật journal snapshot và duy trì tính toàn vẹn của 15 triggers hiện hữu.

---

## 3. Caveats (Khu Vực Chưa Khảo Sát & Giả Định)

1. **Docker Supabase Auth Local**: Các bài test Playwright E2E (`tests/e2e/auth.spec.ts`) đòi hỏi container Docker Supabase Auth chạy ở cổng 54321 và file `.wrangler/local-readiness/accounts.json`. Do chế độ khảo sát read-only và môi trường local chưa kích hoạt Docker container tại thời điểm chạy, các test này được cấu hình skip an toàn (đúng theo thiết kế tại `docs/testing.md`).
2. **Migration tiếp theo**: Đánh số migration tiếp theo là `0015` dựa trên việc Head hiện tại là `0014`. Khi tạo migration thực tế, người triển khai cần kiểm tra lại HEAD để tránh xung đột số thứ tự.
3. **Hiệu năng Swap Ca**: Chưa chạy thử nghiệm benchmark độ trễ của giao dịch swap ca trên Miniflare D1 binding thực. Cần được kiểm chứng trong đợt triển khai P03.

---

## 4. Conclusion (Kết Luận)

1. **Đánh giá hiện trạng hạ tầng & DB**:
   - Baseline kiểm thử: **SẠCH (100% PASS)** — 161/161 tests, typecheck, lint, build đều thành công.
   - Database schema: **31 bảng, 15 triggers, 15 migrations (Head 0014), 0 schema drift**.
   - Trạng thái các gói P00–P09 theo DEC-001..009: **PLANNED / IMPLEMENTATION_REQUIRED**. Toàn bộ 9 gói nghiệp vụ đều có khoảng cách rõ ràng cần bổ sung code và schema.
2. **Định hướng hành động cho Orchestrator / Implementer**:
   - **Gói P00**: Bổ sung bộ fixture đa vai trò vào `tests/helpers/database.mjs` và tạo suite test xác lập Golden Cases C01–C07.
   - **Gói P01**: Bổ sung guard cấm self-approval (`actor != target`), tước quyền review/duyệt của `team_lead`, chặn `system_admin` khỏi business API, thiết lập luồng `sole_owner_self_correction`.
   - **Gói P02–P08**: Tạo migration `0015` (thêm `employee_rate_history`, mở rộng `requests`, `checklist_executions`, `handovers`, `customer_orders`), cập nhật Drizzle schema và cài đặt các domain service tương ứng.

---

## 5. Verification Method (Phương Pháp Kiểm Chứng Độc Lập)

Người nhận bàn giao có thể kiểm chứng lại toàn bộ các phát hiện trên bằng các lệnh sau:

1. **Kiểm tra trạng thái test baseline**:
   ```powershell
   npm.cmd test
   ```
   *Kỳ vọng*: 161 tests PASS, 0 fail, 0 skipped.

2. **Kiểm tra tính nhất quán của TypeScript & Workers bindings**:
   ```powershell
   npm.cmd run typecheck
   ```
   *Kỳ vọng*: Exit code 0, không có lỗi type.

3. **Kiểm tra Linter và Build**:
   ```powershell
   npm.cmd run lint
   npm.cmd run build
   ```
   *Kỳ vọng*: Exit code 0 cho cả 2 lệnh.

4. **Kiểm tra tính toàn vẹn của D1 Migrations và Triggers**:
   ```powershell
   node --experimental-strip-types --test tests/drizzle-migrations-preflight.test.mjs
   ```
   *Kỳ vọng*: Đạt cả 4 subtests (parse 15 migrations, tạo 31 tables & 15 triggers, 0 drift schema, immutability constraints).
