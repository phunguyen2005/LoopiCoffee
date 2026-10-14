# Báo cáo Bàn giao (Handoff Report) — explorer_survey_1

**Loại bàn giao**: Hard Handoff (Hoàn tất khảo sát kiến trúc & hiện trạng toàn bộ gói P00–P09)  
**Tác giả**: `explorer_survey_1` (Teamwork Explorer)  
**Thời điểm**: 2026-10-13T16:31:00Z  
**Mã bối cảnh**: `baseline-codebase-investigation`  
**Báo cáo chi tiết đi kèm**: `d:\College\Practice\loopicafe-management-system\.agents\teamwork\explorer_survey_1\codebase_report.md`

---

## 1. Quan sát Thực tế (Observation)

1. **Kiến trúc và Thư mục Nguồn**:
   - Runtime: Vinext / Cloudflare Workers tại `worker/index.ts` dòng 3 (`import handler from "vinext/server/app-router-entry"`), xử lý mutation cross-origin tại dòng 32 (`rejectCrossOriginMutation`).
   - Binding môi trường: `db/runtime.ts` dòng 8–12 lấy `env.DB` (Cloudflare D1) và `env.EVIDENCE` (Cloudflare R2 bucket).
   - Middleware: `middleware.ts` dòng 1 trỏ về `server/session.ts` (`synchronizeSession`), bảo vệ `/app/:path*` và cấp CSP dynamic nonce.
   - Thư mục nghiệp vụ: Tổ chức chuẩn Modular Monolith trong `modules/` gồm `people`, `operations`, `attendance`, `payroll`, `ordering`.

2. **Xác thực & Phân quyền (DEC-001 / P01)**:
   - `modules/operations/application/decide-request.ts` dòng 6:
     ```typescript
     if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền duyệt yêu cầu.", 403, "forbidden");
     ```
     Hoàn toàn không có kiểm tra `actor.id !== target.id` hoặc `actor.email !== target.email`. `team_lead` được phép duyệt mọi loại yêu cầu (kể cả nghỉ và sửa công).
   - `modules/attendance/application/review-attendance.ts` dòng 6:
     ```typescript
     if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền duyệt công.", 403, "forbidden");
     ```
     Không chặn tự duyệt ngoại lệ công; `team_lead` được duyệt công.
   - `modules/attendance/application/correct-attendance.ts` dòng 14:
     ```typescript
     if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền điều chỉnh chấm công.", 403, "forbidden");
     ```
     Không có luồng riêng cho sole owner; không kiểm tra tự sửa công.
   - `server/auth.ts` dòng 88–90:
     ```typescript
     if (roles && !roles.includes(actor.role)) {
       return { actor: null, response: Response.json({ error: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 }) };
     }
     ```
     Nếu `roles` không được truyền vào, `system_admin` được chấp thuận.

3. **Lịch làm việc & Cut-off (DEC-002 / P02)**:
   - `modules/operations/application/manage-shifts.ts` dòng 38: Lệnh INSERT luôn gán cứng `'published'`. Không có code tạo ca `draft`.
   - `manage-shifts.ts` dòng 61–65: `changeShift` chỉ kiểm tra optimistic lock `revision` và không có chấm công/nghỉ, hoàn toàn không có logic ngưỡng 12 giờ (`starts_at - 12 hours`) và không có luồng `shift adjustment`.
   - `drizzle/0011_workforce_integrity.sql` dòng 61–69 và 71–79: Triggers `shifts_no_overlap_insert` và `shifts_no_overlap_update` chặn overlap trên cả `status IN ('draft', 'published')`.

4. **Đổi ca & Rút đơn (DEC-003 / P03)**:
   - `modules/operations/application/decide-request.ts` dòng 52–54:
     ```typescript
     : decision === "approved" && targetRequest.type === "swap"
       ? "Đề nghị đổi ca đã duyệt nguyên tắc. Quản lý cần chủ động cập nhật lại Lịch làm việc để áp dụng thay đổi."
     ```
     Trả về `requiresManualAction: true`. Không có giao dịch đổi ca nguyên tử (`applied`).
   - `modules/operations/application/create-request.ts` và `app/api/requests/route.ts`: Không có hàm hay endpoint rút đơn (`withdraw`).

5. **Chấm công & Tự đóng ca (DEC-004 / P04)**:
   - `app/api/attendance/actions/route.ts` dòng 286–288:
     ```typescript
     const workedMinutes = activeSession.opened_at
       ? Math.max(0, Math.floor((Date.parse(recordedAt) - Date.parse(activeSession.opened_at)) / 60_000))
       : null;
     ```
     Tính phút thô trực tiếp từ `recordedAt`; không có dung sai 5 phút, không cắt biên 15 phút, không tách recorded/payable time.
   - Không có background task hay scheduler tự động đóng phiên quên checkout sau `ends_at + 4h`.

6. **Lương & Snapshot (DEC-006 / P05)**:
   - `db/schema.ts` dòng 36: `employees` chỉ có cột `hourly_rate: integer("hourly_rate")`. Không có bảng `employee_rate_history`.
   - `modules/payroll/application/load-report.ts` dòng 225:
     ```typescript
     const baseSalary = row.compensation_type === "hourly" ? Math.round((approvedMinutes / 60) * effectiveHourlyRate) : 0;
     ```
     Không làm tròn xuống block 15 phút; không làm tròn tổng lương về 1.000 VND.

7. **Checklist & Bàn giao (DEC-005 / P06)**:
   - `app/api/checklists/route.ts` dòng 14, 69: `checklist_executions` khóa theo `(item_id, business_date)`. Không có `routine_type` hay `shift_id`.
   - `app/api/handovers/route.ts`: Chỉ lưu `author_email`, không có `receiver_email` hay `receiver_shift_id`. Không có endpoint PATCH để acknowledge.
   - `app/api/attendance/capture-sessions/route.ts` dòng 7–48: Không kiểm tra gate xác nhận bàn giao trước khi check-in.

8. **Hủy đơn hàng & Hao hụt (DEC-007 / P07)**:
   - `modules/ordering/application/change-status.ts` dòng 13: `cancelReason` chỉ là chuỗi text tự do. Không có enum `customer_abandoned`, `item_preparation_error`, `store_incident`. Không có báo cáo hao hụt.

9. **Retention & Anonymization (DEC-008 / P08)**:
   - `modules/attendance/application/expire-evidence.ts`: Đã có xóa ảnh/GPS sau 90 ngày.
   - Hoàn toàn chưa có module hoặc logic ẩn danh hóa thông tin PII của đơn hàng sau 180 ngày.

10. **Trạng thái Kiểm thử Hiện tại**:
    - Lệnh: `npm.cmd test`
      Kết quả: `161 pass, 0 fail` (thời gian ~12.1s).
    - Lệnh: `npm.cmd run typecheck`
      Kết quả: `wrangler types` sinh thành công + `tsc --noEmit` thoát mã 0 (0 lỗi).
    - Git HEAD: `888495ba3fddf4798b80f9a1cbe4aec65c0991b8`.

---

## 2. Chuỗi Suy luận Logic (Logic Chain)

1. Từ **Quan sát 2**: `decide-request.ts`, `review-attendance.ts`, và `correct-attendance.ts` không so sánh `actor` với `target`.  
   -> **Suy luận**: Người dùng có role Manager/Owner có thể tự duyệt các quyền lợi/ngoại lệ của chính mình mà không bị máy chủ từ chối -> **Vi phạm nghiêm trọng nguyên tắc DEC-001 / ROLE-002**.

2. Từ **Quan sát 2**: `team_lead` được liệt kê trong danh sách role cho phép sửa công, duyệt công, duyệt request.  
   -> **Suy luận**: `team_lead` đang nắm giữ quyền hạn của Quản lý vận hành -> **Vi phạm DEC-001 / ROLE-004 (cần thu hẹp quyền team_lead)**.

3. Từ **Quan sát 3**: `createShifts` chỉ gán `published`, và `changeShift` không kiểm tra `starts_at - 12h`.  
   -> **Suy luận**: Nhân viên lập tức nhìn thấy ca chưa chốt; quản lý có thể sửa/hủy ca sát giờ làm mà không cần lý do hay audit -> **Vi phạm DEC-002 / SCH-002 và SCH-004**.

4. Từ **Quan sát 4**: `decide-request.ts` chỉ đổi trạng thái sang `approved` và trả về thông báo yêu cầu quản lý tự sửa lịch thủ công.  
   -> **Suy luận**: Đổi ca (swap) chưa có cơ chế thực thi tự động; rủi ro không đồng bộ giữa yêu cầu và lịch thực tế -> **Vi phạm DEC-003 / REQ-003**.

5. Từ **Quan sát 5**: `actions/route.ts` tính `workedMinutes` trực tiếp từ timestamp thực tế, không có scheduler auto-close.  
   -> **Suy luận**: Ca quên checkout bị treo vĩnh viễn, phút tính lương không tuân thủ dung sai 5 phút và biên 15 phút -> **Vi phạm DEC-004 / ATT-006 và ATT-009**.

6. Từ **Quan sát 6**: Không có bảng `employee_rate_history`, tính lương dùng phút thô và `Math.round`.  
   -> **Suy luận**: Khi nhân viên thay đổi lương, công quá khứ bị tính sai mức lương; tiền lương cuối kỳ bị lệch so với chuẩn làm tròn 1.000 VND -> **Vi phạm DEC-006 / PAY-001..005**.

7. Từ **Quan sát 7**: Khóa checklist chỉ theo ngày; bàn giao không có người nhận; check-in không kiểm tra bàn giao.  
   -> **Suy luận**: Ca đêm và ca cùng ngày bị đè dữ liệu checklist; nhân viên mới vào ca có thể check-in mà không nắm tình hình ca trước -> **Vi phạm DEC-005 / OPS-001 và OPS-003**.

8. Từ **Quan sát 8**: Hủy đơn ready/preparing nhận lý do tự do, không có báo cáo hao hụt.  
   -> **Suy luận**: Thiếu dữ liệu phân loại nguyên nhân hủy và thất thoát nguyên liệu -> **Vi phạm DEC-007 / ORD-007**.

9. Từ **Quan sát 9**: Không có mã nguồn nào thực hiện ẩn danh hóa đơn hàng sau 180 ngày.  
   -> **Suy luận**: Thông tin cá nhân (PII) của khách hàng bị lưu trữ quá hạn quy định -> **Vi phạm DEC-008 / RET-003**.

10. Từ **Quan sát 10**: Toàn bộ 161 test hiện hữu đều PASS và typecheck PASS.  
    -> **Suy luận**: Codebase hiện tại có nền tảng ổn định, không có lỗi runtime/build tồn đọng ở baseline, nhưng các tính năng nghiệp vụ của DEC-001..009 đang ở trạng thái **chưa được cài đặt (PLANNED / PARTIAL)**.

---

## 3. Các Điểm Giới hạn / Cảnh báo (Caveats)

1. **Khảo sát ở chế độ Read-only**: Không sửa đổi bất kỳ file mã nguồn ứng dụng nào trong đợt khảo sát này (chỉ tạo báo cáo và nhật ký trong thư mục `.agents/teamwork/explorer_survey_1/`).
2. **Kiểm thử E2E chưa chạy**: Đợt khảo sát đã chạy xác minh toàn bộ 161 Node unit/integration tests và TypeScript typecheck. Chưa chạy Playwright E2E browser do yêu cầu môi trường dev server / headless browser.
3. **Migration D1 / SQLite Constraints**: Cần đặc biệt lưu ý khi triển khai P03 (Atomic Swap) và P02 (Draft shifts): trigger `shifts_no_overlap_insert` và `shifts_no_overlap_update` trong `drizzle/0011_workforce_integrity.sql` sẽ abort bất kỳ thao tác nào gây trùng giờ tạm thời giữa hai ca hoặc đối với ca draft.

---

## 4. Kết luận (Conclusion)

- **Đánh giá tổng quát**: Codebase LoopiCafe có kiến trúc rõ ràng, chuẩn mực theo mô hình Modular Monolith, nền tảng TypeScript sạch (0 lỗi typecheck), và bộ kiểm thử hồi quy cơ sở hoạt động tốt (161/161 tests PASS).
- **Trạng thái thực thi các quyết định DEC-001..009**: Đúng như ghi nhận tại `docs/implementation-status.md`, toàn bộ các yêu cầu mới DEC-001 đến DEC-009 đều ở trạng thái **IMPLEMENTATION_REQUIRED**. Các tính năng cốt lõi (chặn tự duyệt, thu hẹp team_lead, draft schedule, cut-off 12h, atomic swap, auto-close +4h, rate history, làm tròn 15m/1.000 VND, routine type, acknowledge gate, cancel reason enum, anonymize order) đều mới chỉ có khung sơ khai hoặc stub thủ công, chưa được hiện thực hóa ở tầng máy chủ và database.
- **Sẵn sàng triển khai**: Đội ngũ phát triển (các implementer agents) có thể bắt đầu ngay từ **P00/P01** theo đúng lộ trình đã vạch ra trong `docs/implementation-plan.md`.

---

## 5. Phương pháp Kiểm chứng Độc lập (Verification Method)

Người tiếp nhận hoặc reviewer có thể kiểm chứng độc lập các nhận định trên bằng các bước sau:

1. **Kiểm tra Baseline Tests**:
   ```powershell
   npm.cmd test
   ```
   *Kỳ vọng*: 161 tests hoàn thành với 0 fail.
2. **Kiểm tra TypeScript Typecheck**:
   ```powershell
   npm.cmd run typecheck
   ```
   *Kỳ vọng*: Thoát mã 0, không có lỗi kiểu dữ liệu.
3. **Kiểm tra Lỗ hổng Tự duyệt (Self-approval)**:
   Mở file `modules/operations/application/decide-request.ts` (dòng 5–15), `modules/attendance/application/review-attendance.ts` (dòng 5–15), `modules/attendance/application/correct-attendance.ts` (dòng 13–20) để xác nhận sự vắng mặt của điều kiện kiểm tra `actor != target`.
4. **Kiểm tra Thiếu Bảng `employee_rate_history`**:
   Mở `db/schema.ts` tìm kiếm `employee_rate_history` -> kết quả: 0 match.
5. **Kiểm tra Thiếu Logic Anonymize Đơn hàng**:
   Tìm kiếm từ khóa `anonymize` trong thư mục `modules/` -> kết quả: 0 match.
