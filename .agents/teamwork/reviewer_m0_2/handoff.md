# Handoff Report — Quality & Adversarial Review: Milestone M0 (Package P00)

**Reviewer Agent:** `reviewer_m0_2` (teamwork_preview_reviewer)  
**Roles:** `reviewer`, `critic`  
**Parent Conversation ID:** `6e943540-9db4-4898-95f7-1382b16362bf`  
**Working Directory:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\reviewer_m0_2\`  
**Timestamp:** 2026-10-13T17:17:00Z  

---

## Review Summary

**Verdict:** **`APPROVE`**

Tất cả các tiêu chí của Milestone M0 (Package P00 — Baseline, Golden Cases & Test Fixtures) đã được xác minh độc lập, không có lỗi lầm, không có vi phạm tính toàn vẹn (integrity violation), và không làm phát sinh bất kỳ hồi quy (regression) nào trên 161 bài test gốc.

---

## 1. Observation

### 1.1 Kiểm tra tính độc lập và kết quả thực thi lệnh kiểm thử

1. **`npm.cmd test`**:
   - Lệnh thực thi: `npm.cmd test`
   - Mã thoát (exit code): `0`
   - Trích xuất nhật ký thực thi trực tiếp:
     ```
     1..160
     # tests 194
     # suites 9
     # pass 184
     # fail 0
     # cancelled 0
     # skipped 10
     # todo 0
     # duration_ms 8938.4184
     ```
   - Đối chiếu: Trước thay đổi có 161 test cases (`pass 161, fail 0`). Sau thay đổi có 194 test cases (`pass 184, fail 0, skipped 10`). Toàn bộ 161 baseline tests tiếp tục pass 100% không suy giảm. 23 test cases mới được bổ sung trong `tests/workforce-golden-cases.test.mjs` pass sạch sẽ; 10 test cases định hướng tương lai được đánh dấu `t.skip` có lý do rõ ràng.

2. **`npm.cmd run typecheck`**:
   - Lệnh thực thi: `npm.cmd run typecheck` (`npm run types:generate && tsc --noEmit --incremental false`)
   - Mã thoát (exit code): `0`
   - Wrangler sinh type cho `worker-configuration.d.ts` thành công; TypeScript compiler chạy không phát hiện bất kỳ lỗi type nào.

3. **`npm.cmd run lint`**:
   - Lệnh thực thi: `npm.cmd run lint` (`eslint . --ignore-pattern dist --ignore-pattern .next`)
   - Mã thoát (exit code): `0`
   - ESLint không phát hiện lỗi (0 errors) và không có cảnh báo (0 warnings).

4. **`npm.cmd run check`**:
   - Lệnh thực thi: `npm.cmd run check` (typecheck + lint + test + build)
   - Mã thoát (exit code): `0`
   - Quá trình build RSC/SSR qua Vinext (`node tooling/run-local.mjs build`) hoàn tất trong 8.65s với toàn bộ client/server bundles hợp lệ.

### 1.2 Kiểm tra mã nguồn và tệp đối tượng

1. **`tests/helpers/database.mjs`**:
   - Hàm `seedStore` (dòng 45-69): Hỗ trợ overload linh hoạt (nhận chuỗi `id` hoặc đối tượng tham số đầy đủ). Giá trị mặc định chuẩn xác (`id = "store-a"`, `latitude = 10`, `longitude = 106`), bảo toàn tương thích tuyệt đối cho 25 test suite hiện hữu.
   - Hàm `seedEmployee` (dòng 71-109): Duy trì `participatesAttendance` và `payrollEligible` ở mức `undefined` (`NULL` khi insert). Điều này bảo đảm câu truy vấn SQLite `COALESCE(e.participates_attendance, CASE WHEN e.role IN ('owner', 'system_admin') THEN 0 ELSE 1 END)` hoạt động chính xác theo mặc định, không làm xáo trộn thứ tự hay tính đủ điều kiện nhận lương của role `owner` và `system_admin`.
   - Hàm `seedPayrollPeriod` (dòng 201-220): `storeId = "store-a"` và `periodKey = "2026-07"` được khai báo trước `id = \`period-${storeId}-${periodKey}\`` trong quá trình destructuring tham số, triệt tiêu nguy cơ Temporal Dead Zone / ReferenceError trong JavaScript runtime.
   - Bổ sung đầy đủ các seed helper cần thiết: `seedAttendanceRules`, `seedShift`, `seedAttendanceSession`, `seedAttendanceEvent`, `seedRequest`, `seedHandover`. Tất cả thao tác trực tiếp trên in-memory SQLite (`DatabaseSync(":memory:")`) có bật `PRAGMA foreign_keys = ON;` và nạp toàn bộ migration từ `drizzle/*.sql`.

2. **`tests/fixtures/workforce-fixtures.mjs`**:
   - Hằng số `ROLES` (dòng 13-19) và `STATUSES` (dòng 21-27) được `Object.freeze`, ngăn ngừa mutation ngoài ý muốn.
   - Hàm `createWorkforceFixture` (dòng 39-234): Khởi tạo đầy đủ các vai trò: `soleOwner`, `owner1`, `owner2`, `manager`, `teamLead`, `employeeA`, `employeeB`, `systemAdmin`, cùng nhóm vòng đời nhân sự `suspendedStaff`, `offboardedStaff`, `invitedStaff`, `inactiveStaff`.
   - Cung cấp cơ chế chuyển đổi topology chủ quán rõ ràng (`mode: "sole_owner"`, `"multi_owner"`, `"all"`), tạo nền tảng chính xác cho việc kiểm thử DEC-001 (Sole-owner self-correction).
   - Hàm `createMultiStoreFixture` (dòng 240-245): Thiết lập 2 cửa hàng độc lập (`store-alpha` và `store-beta`) với email nhân viên có tiền tố/hậu tố gắn liền store ID, đảm bảo không vi phạm ràng buộc duy nhất `employees_email_lower_idx` trong SQLite.
   - 6 Scenario builders (`buildSwapScenario`, `buildDraftOverlapScenario`, `buildAttendanceClippingScenario`, `buildRateHistoryScenario`, `buildHandoverScenario`, `buildRetentionScenario`) sinh dữ liệu thực tế và các vector kiểm thử chính xác cho các ca mẫu C01 đến C07.

3. **`tests/workforce-golden-cases.test.mjs`**:
   - Cung cấp đầy đủ 7 nhóm kiểm thử từ C01 đến C07 (tổng cộng 693 dòng).
   - C01: Kiểm tra ma trận phân quyền `canManageEmployee` và `canAssignRole` từ `modules/people/domain/access.ts`, ngăn chặn leo thang đặc quyền và bảo vệ ranh giới đa cửa hàng.
   - C02: Kích hoạt và kiểm chứng trực tiếp trigger `shifts_no_overlap_insert` của SQLite; xác nhận ca nháp (`draft`) giữ chỗ và xung đột với ca nháp/ca đã xuất bản; xác nhận ca liền kề chạm biên hợp lệ; xác nhận ca hủy hoặc ca được duyệt nghỉ (`approved_leave_request_id`) giải phóng chỗ; kiểm tra cách ly đa cửa hàng.
   - C03: Kiểm thử các vector cắt biên 15 phút (clipping), ca ngoài lịch (unscheduled) trả về 0 phút công.
   - C04: Kiểm thử thuật toán làm tròn sàn 15 phút (`Math.floor(m / 15) * 15`), làm tròn tiền lương 1.000 VND gần nhất (`Math.round(val / 1000) * 1000`), và kiểm thử tích hợp thực tế với dịch vụ `loadPayrollReport` đối với ca xuyên tháng (cắt tách chính xác 60 phút tháng 7 và 60 phút tháng 8).
   - C05: Kiểm tra biên bản bàn giao ca mở đầu ngày và cập nhật xác nhận bàn giao (`acknowledged_at`).
   - C06: Kiểm thử tích hợp thực tế với `decideRequest` trong `modules/operations/application/decide-request.ts`; kiểm tra cập nhật `approved_leave_request_id`, tăng `revision`, và từ chối 409 khi ca đã có phiên chấm công hoặc kỳ lương đã khóa.
   - C07: Kiểm thử tích hợp thực tế với `expireEvidence` trong `modules/attendance/application/expire-evidence.ts`; kiểm chứng việc xóa ảnh R2 và tọa độ GPS D1 sau 90 ngày, bảo toàn sự kiện chấm công bất biến; kiểm chứng tính an toàn nguyên tử khi R2 thất bại thì không xóa bản ghi D1; kiểm chứng quy tắc bảo tồn dữ liệu tối thiểu 3 năm.

4. **`eslint.config.mjs`**:
   - Thêm `".agents/**"` vào mảng `globalIgnores` (dòng 19), giúp ESLint tập trung vào mã nguồn ứng dụng và bỏ qua các tệp tài liệu/kịch bản công cụ của agent trong thư mục `.agents/`.

---

## 2. Logic Chain

1. **Khả năng tương thích ngược và bảo toàn Baseline**:
   - Quan sát 1.1 và 1.2 cho thấy không có bất kỳ thay đổi nào làm phá vỡ 161 test hiện hữu.
   - Các tham số mở rộng trong `tests/helpers/database.mjs` đều sử dụng default argument hoặc kiểm tra `undefined`, đảm bảo hành vi mặc định giống hệt trạng thái trước khi sửa đổi.
   - Kết quả thực nghiệm: 100% 161 bài test gốc vượt qua ổn định.

2. **Tính toàn vẹn (Integrity Verification) & Kiểm tra hành vi giả mạo (Facade / Mocking)**:
   - Các fixture và test case không sử dụng mock giả lập cơ sở dữ liệu. Tất cả đều chạy trên SQLite engine thực tế (`DatabaseSync(":memory:")`) với toàn bộ 14 file migration (`drizzle/*.sql`) được thực thi thật.
   - Các trigger `shifts_no_overlap_insert`, `shifts_locked_period_insert`, và các ràng buộc khóa ngoại (Foreign Keys) được kiểm tra trực tiếp qua SQLite engine.
   - Các hàm nghiệp vụ thực tế (`canManageEmployee`, `canAssignRole`, `decideRequest`, `expireEvidence`, `loadPayrollReport`) được import trực tiếp từ `modules/` và chạy trên dữ liệu thật, không có hardcoded kết quả.
   - Kết luận: Không có bất kỳ vi phạm tính toàn vẹn nào.

3. **Tính vững chắc của Fixture Đa Vai Trò và Phân Lập Tenant**:
   - `createWorkforceFixture` sinh ra đúng các vai trò quy định trong `PROJECT.md` và `docs/permissions.md`.
   - `createMultiStoreFixture` cô lập hoàn toàn giữa 2 cửa hàng, ngăn ngừa xung đột index email và xung đột dữ liệu ca làm việc.
   - Các builder kịch bản C01–C07 bám sát ma trận nghiệm thu ACC-01 đến ACC-13.

4. **Chiến lược Bật dần (Progressive Enablement)**:
   - Các test case thuộc phạm vi M0 đã được kích hoạt và chạy thành công (23 tests).
   - Các test case thuộc phạm vi các Milestone tiếp theo (M1–M4) như mutation blocking ở API route, tác vụ tự động đóng ca +4h, và migration bảng `employee_rate_history` được giữ ở trạng thái `t.skip` kèm chú thích rõ ràng. Điều này chuẩn bị sẵn sàng khung kiểm thử cho các worker tiếp theo mà không làm nghẽn pipeline kiểm thử hiện tại.

---

## 3. Caveats

1. **Ràng buộc khóa ngoại trên ca nghỉ phép**:
   - Cột `shifts.approved_leave_request_id` có khóa ngoại trỏ tới `requests(id)`. Bất kỳ fixture hoặc test nào gán giá trị này bắt buộc phải tạo bản ghi tương ứng trong bảng `requests` trước.
2. **Các test case được `t.skip`**:
   - Có 10 test cases được đánh dấu `t.skip` trong `tests/workforce-golden-cases.test.mjs`. Đây là thiết kế có chủ đích cho các Milestone M1–M4 và không phải là lỗi. Khi các gói P01–P08 được triển khai, các worker tương ứng cần kích hoạt lại (unskip) các bài test này.

---

## 4. Adversarial Review & Stress-Testing

**Đánh giá rủi ro tổng thể:** **`LOW`**

### Thử nghiệm chịu tải & Góc nhìn đối kháng đã thực hiện:

1. **Challenge 1: Xung đột khóa ngoại khi xóa/hủy ca nghỉ phép**
   - *Giả định:* Liệu việc cập nhật `approved_leave_request_id` có gây lỗi mồ côi (orphaned reference) hoặc lỗi ràng buộc trigger không?
   - *Kiểm chứng:* Test C02-4 và C06-1 đã chứng minh rằng khi `requests` record tồn tại, SQLite trigger `shifts_no_overlap_insert` nhận biết `approved_leave_request_id IS NOT NULL` và giải phóng slot lịch làm việc an toàn, cho phép xếp ca thay thế.

2. **Challenge 2: Nguy cơ rò rỉ tenant (Cross-Store Data Leakage) trong Trigger SQLite**
   - *Giả định:* Trigger `shifts_no_overlap_insert` có thể vô tình chặn ca của nhân viên ở cửa hàng khác nếu thời gian trùng lặp.
   - *Kiểm chứng:* Test C02-5 thực hiện chèn 2 ca có cùng khung giờ vào Store A và Store B. Kết quả: cả hai ca đều được chèn thành công do mệnh đề `s.store_id = NEW.store_id` hoạt động chính xác.

3. **Challenge 3: Tác động của role Owner/Admin lên logic tính lương**
   - *Giả định:* Việc thêm `seedEmployee` với role `owner` hoặc `system_admin` có thể làm hỏng logic payroll report nếu các trường `participatesAttendance` hoặc `payrollEligible` bị ép kiểu thành `1`.
   - *Kiểm chứng:* Worker M0 đã duy trì mặc định `undefined` -> `NULL`, giúp câu lệnh `COALESCE` trong `loadPayrollReport` tự động gán `0` cho owner/admin, bảo đảm danh sách nhân viên tính lương không bị sai lệch.

4. **Challenge 4: Tính nguyên tử khi R2 thất bại trong chu kỳ dọn dẹp bằng chứng**
   - *Giả định:* Nếu dịch vụ lưu trữ R2 gặp sự cố kết nối, bản ghi trong D1 có bị xóa mất dấu vết không?
   - *Kiểm chứng:* Test C07-2 mô phỏng `fakeR2.delete` ném lỗi ngoại lệ. Kết quả: bản ghi ảnh trong D1 được giữ nguyên 100%, bảo đảm không xảy ra tình trạng mất dữ liệu kiểm toán khi R2 bị lỗi.

---

## 5. Conclusion

Milestone M0 (Package P00 — Baseline, Golden Cases & Test Fixtures) đạt tiêu chuẩn chất lượng cao nhất:
- Không có vi phạm tính toàn vẹn (Integrity Violation).
- Không có dummy facade hay hardcoding.
- Hoàn toàn tương thích ngược với 161 baseline tests.
- Các fixture đa vai trò, đa cửa hàng và kịch bản C01–C07 được xây dựng chuẩn mực, sẵn sàng làm nền móng vững chắc cho Milestones M1 đến M5.
- Phê duyệt chính thức: **`APPROVE`**.

---

## 6. Verification Method

Để tái xác minh độc lập báo cáo này, thực thi chuỗi lệnh sau trong terminal PowerShell tại thư mục gốc của dự án:

```powershell
# 1. Chạy toàn bộ bộ kiểm thử đơn vị (184 passed, 0 failed, 10 skipped)
npm.cmd test

# 2. Kiểm tra type TypeScript không có lỗi
npm.cmd run typecheck

# 3. Kiểm tra linter ESLint không có lỗi và cảnh báo
npm.cmd run lint

# 4. Kiểm tra toàn diện toàn dự án (typecheck + lint + test + build)
npm.cmd run check
```

Các tệp kiểm tra chi tiết:
- `tests/helpers/database.mjs`
- `tests/fixtures/workforce-fixtures.mjs`
- `tests/workforce-golden-cases.test.mjs`
- `eslint.config.mjs`
