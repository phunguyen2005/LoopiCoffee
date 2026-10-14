# Handoff Report — Specification Survey & Groundwork (M0)

**Tác giả:** `spec_miner_survey_1` (teamwork_preview_spec_miner)  
**Ngày:** 2026-10-13  
**Báo cáo đặc tả chính:** `d:\College\Practice\loopicafe-management-system\.agents\teamwork\spec_miner_survey_1\spec_report.md`  
**Loại Handoff:** Hard Handoff (Hoàn tất khảo sát đặc tả toàn diện)

---

## 1. Observation (Quan sát trực tiếp)

1. **Văn bản Yêu cầu & Tài liệu Chuẩn:**
   - `ORIGINAL_REQUEST.md`: Giao nhiệm vụ triển khai trọn gói các quyết định `DEC-001..009`, phân rã thành các gói `P00..P09`, và bộ tiêu chí nghiệm thu `ACC-01..ACC-13`.
   - `docs/decision-register.md`: Toàn bộ 9 quyết định kỹ thuật nghiệp vụ `DEC-001` đến `DEC-009` đều ở trạng thái `ACCEPTED` vào ngày 2026-10-13.
   - `docs/business-rules.md`: Định nghĩa toàn bộ 25+ quy tắc nghiệp vụ: BR-001..002, ROLE-001..004, SCH-001..005, REQ-001..005, ATT-001..009, OPS-001..005, PAY-001..006, ORD-001..007, RET-001..003, REL-001..002, và ví dụ EX-01..06.
   - `docs/permissions.md`: Định nghĩa ma trận quyền đích bắt buộc cho 5 vai trò (`employee`, `team_lead`, `manager`, `owner`, `system_admin`) và đối soát chênh lệch với source code.
   - `docs/implementation-status.md`: Khẳng định Git HEAD `888495ba3fddf4798b80f9a1cbe4aec65c0991b8` cần thực hiện triển khai (`IMPLEMENTATION_REQUIRED`) cho cả 9 quyết định đã chốt.
   - `docs/implementation-plan.md`: Xác lập 7 điểm cần làm rõ (C01–C07), thứ tự thực hiện tuần tự P00 -> P09, và danh sách các file cần tác động.
   - `docs/acceptance-matrix.md`: Định nghĩa toàn bộ ma trận nghiệm thu ACC-01 đến ACC-13 ở trạng thái ban đầu `NOT_RUN`.

2. **Khảo sát Database Schema & Triggers:**
   - `db/schema.ts` (dòng 18–45): Bảng `employees` có các role `system_admin`, `owner`, `manager`, `team_lead`, `employee`; các trạng thái `invited`, `active`, `suspended`, `offboarded`, `inactive`. Chưa có bảng `employee_rate_history`.
   - `db/schema.ts` (dòng 72–89): Bảng `shifts` có `status` enum `['draft', 'published', 'cancelled', 'completed']`.
   - `db/schema.ts` (dòng 235–243): Bảng `checklist_executions` có khóa chính là `(item_id, business_date)`, chưa có `shift_id` cho checklist ca cụ thể.
   - `db/schema.ts` (dòng 256–264): Bảng `handovers` có `author_email`, `summary`, `manager_attention`, `acknowledged_at`, chưa có `receiver_employee_id` hoặc `next_shift_id`.
   - `drizzle/0011_workforce_integrity.sql` (dòng 61–79): Có 2 triggers `shifts_no_overlap_insert` và `shifts_no_overlap_update` kiểm tra trùng giờ ca cho cùng `employee_email` và `store_id` khi `status IN ('draft', 'published') AND approved_leave_request_id IS NULL`.
   - `drizzle/0013_workforce_guardrails.sql` (dòng 1–8): Có trigger `shifts_locked_period_insert` chặn thêm ca mới vào kỳ lương đã `finalized` hoặc `paid`.

3. **Khảo sát Application Logic Hiện Tại:**
   - `modules/operations/application/decide-request.ts` (dòng 6):
     ```typescript
     if (!["owner", "manager", "team_lead"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền duyệt yêu cầu.", 403, "forbidden");
     ```
     `team_lead` vẫn được duyệt mọi request; chưa kiểm tra `actor.email !== targetRequest.employee_email` (thiếu anti-self-approval).
   - `modules/operations/application/decide-request.ts` (dòng 50–64): Khi duyệt swap, chỉ trả về `status: 'approved'` và `requiresManualAction: true`, chưa thực hiện đổi người nguyên tử giữa 2 ca.
   - `modules/attendance/application/correct-attendance.ts` (dòng 14): Vẫn cho phép `team_lead` sửa công; chưa có self-approval guard; chưa có luồng `sole_owner_self_correction`.
   - `modules/operations/application/manage-shifts.ts` (dòng 38): Tạo ca trực tiếp gán `status: 'published'`; chưa có luồng tạo draft và publish riêng; chưa kiểm tra cut-off 12 giờ.
   - `modules/payroll/application/load-report.ts` (dòng 207, 213): Lấy `hourly_rate` trực tiếp từ bảng nhân viên hoặc snapshot cũ; tính overtime bằng `Math.max(0, approvedMinutes - scheduledMinutes)` (trái với DEC-004 yêu cầu duyệt overtime tường minh); chưa có floor 15 phút và round 1.000 VND (DEC-006).
   - `modules/ordering/application/change-status.ts` (dòng 13): Cho phép hủy đơn ở `ready` nhưng nhận lý do dạng chuỗi tự do (free-text), chưa chuẩn hóa thành enum mã lý do và chưa có báo cáo hao hụt (DEC-007).
   - `modules/attendance/application/expire-evidence.ts`: Đã có job xóa ảnh R2 và GPS D1 quá hạn, nhưng chưa có job tự động ẩn danh hóa PII đơn hàng sau 180 ngày (DEC-008).

---

## 2. Logic Chain (Chuỗi suy luận logic)

1. Từ `ORIGINAL_REQUEST.md`, `docs/decision-register.md` và `docs/implementation-plan.md`, toàn bộ 9 quyết định `DEC-001..009` là nền tảng nghiệp vụ bắt buộc của dự án, được chia thành 10 gói triển khai tuần tự `P00..P09`.
2. Từ quan sát mã nguồn trong `decide-request.ts`, `correct-attendance.ts`, `manage-shifts.ts`, `load-report.ts`, và `change-status.ts`, hệ thống hiện tại chưa cài đặt đầy đủ các cơ chế cưỡng chế của DEC-001 đến DEC-008.
3. Cụ thể:
   - Thiếu Anti-Self-Approval guard ở tầng domain/API cho phép nhân viên tự duyệt request hoặc sửa công của chính mình, vi phạm `ROLE-002`.
   - `team_lead` có quyền hạn vượt quá phạm vi Trưởng ca vận hành (được duyệt nghỉ, sửa công), vi phạm `ROLE-004` và `DEC-001`.
   - Vòng đời lịch làm việc thiếu trạng thái `draft` thực thụ và thiếu ngưỡng chặn sửa/hủy trực tiếp trong vòng 12h, vi phạm `SCH-002`, `SCH-004` và `DEC-002`.
   - Swap yêu cầu cập nhật nguyên tử 2 ca nhưng hiện tại chỉ trả về `requiresManualAction: true`, vi phạm `REQ-003` và `DEC-003`.
   - Tính lương lấy đơn giá trực tiếp từ profile nhân viên, chưa có bảng `employee_rate_history`, chưa có floor 15 phút và round 1.000 VND, vi phạm `DEC-006` và `PAY-001..005`.
   - Bàn giao ca chưa có cơ chế kiểm tra `acknowledge` trước khi check-in, vi phạm `OPS-003` và `DEC-005`.
   - Hủy đơn hàng ở `ready` nhận lý do tự do và chưa ghi nhận báo cáo hao hụt, vi phạm `ORD-007` và `DEC-007`.
   - Thiếu job ẩn danh hóa PII đơn hàng sau 180 ngày, vi phạm `RET-003` và `DEC-008`.
4. Do đó, việc triển khai phải tuân theo lộ trình dependency chặt chẽ:
   - **P00:** Chuẩn hóa golden cases (C01–C07) và fixture trước.
   - **P01:** Thiết lập policy phân quyền và Anti-Self-Approval tại server để làm lá chắn cho mọi mutation.
   - **P02 & P03:** Mở rộng vòng đời lịch (`draft → published`), 12h cut-off, và swap nguyên tử.
   - **P04 & P05:** Chuẩn hóa chấm công (5/15 phút, auto-close +4h), rate history và tính lương snapshot.
   - **P06:** Checklist routine và gate bàn giao ca trước khi check-in.
   - **P07 & P08:** Hủy đơn/hao hụt và retention/anonymization.
   - **P09:** Tích hợp toàn diện đa vai trò và nghiệm thu ACC-01..ACC-13.

---

## 3. Caveats (Các điểm lưu ý & Giới hạn khảo sát)

1. **Khảo sát Read-Only:** Quá trình khảo sát hoàn toàn là đọc mã nguồn, tài liệu và schema (theo đúng vai trò SPECIFICATION MINER). Chưa thực hiện bất kỳ lệnh sửa code, migration, reset DB hay deploy nào.
2. **SQLite Trigger Overlap trong Atomic Swap (C02/P03):** Khi thực hiện tráo đổi nhân viên giữa 2 ca `published` trong một transaction, việc UPDATE lần lượt từng ca có thể kích hoạt trigger `shifts_no_overlap_update` gây abort tạm thời. Đội ngũ backend cần thử nghiệm cơ chế tráo đổi an toàn (ví dụ: dùng trạng thái trung gian hợp lệ hoặc sequence update có kiểm soát) mà không được tắt trigger toàn cục.
3. **Môi trường Local & Docker Auth:** Việc chạy kiểm thử E2E cần Supabase Auth local (Docker container). Cần tuân thủ hướng dẫn trong `docs/database-operations.md`.
4. Không có giả định bổ sung nào ngoài các văn bản tài liệu chính thức đã kiểm chứng.

---

## 4. Conclusion (Kết luận)

Đặc tả kỹ thuật, ràng buộc bất biến, sổ quyết định DEC-001..DEC-009, phân rã gói P00..P09, tiêu chí nghiệm thu ACC-01..ACC-13, danh mục 34 tính năng chi tiết, 24 tình huống biên (edge cases) và 7 điểm làm rõ (C01–C07) đã được khảo sát và ghi nhận toàn diện trong:
- `d:\College\Practice\loopicafe-management-system\.agents\teamwork\spec_miner_survey_1\spec_report.md`

Báo cáo này cung cấp đầy đủ thông số đầu vào cần thiết cho Orchestrator và các agent chuyên trách tiếp theo triển khai tuần tự từng gói công việc.

---

## 5. Verification Method (Phương pháp độc lập kiểm chứng)

Để độc lập kiểm chứng các kết luận trong báo cáo:
1. **Kiểm tra sự tồn tại và nội dung báo cáo đặc tả:**
   - Đọc file: `d:\College\Practice\loopicafe-management-system\.agents\teamwork\spec_miner_survey_1\spec_report.md`
2. **Đối soát mã nguồn tại các file đã chỉ ra:**
   - Xem `modules/operations/application/decide-request.ts` (dòng 6 và dòng 50–64) để xác minh chênh lệch self-approval và swap manual action.
   - Xem `modules/attendance/application/correct-attendance.ts` (dòng 14) để xác minh quyền sửa công của `team_lead`.
   - Xem `modules/operations/application/manage-shifts.ts` (dòng 38) để xác minh việc xuất bản trực tiếp không qua draft.
   - Xem `db/schema.ts` (dòng 235–243 và 256–264) để xác minh cấu trúc checklist và handover.
   - Xem `drizzle/0011_workforce_integrity.sql` và `drizzle/0013_workforce_guardrails.sql` để xác minh các triggers toàn vẹn dữ liệu.
3. **Chạy các lệnh kiểm tra static hiện tại của dự án:**
   - `npm.cmd run check` (typecheck và linting).
   - `node --test tests/workforce-integrity.test.mjs` (kiểm tra suite toàn vẹn lịch/công hiện hữu).
