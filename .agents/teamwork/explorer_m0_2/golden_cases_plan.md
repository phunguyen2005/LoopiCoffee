# Kế Hoạch & Thiết Kế Bộ Kiểm Thử Golden Cases C01–C07 (`tests/workforce-golden-cases.test.mjs`)

**Milestone:** M0 (P00) — Baseline, Golden Cases & Test Fixtures  
**Người thực hiện:** `explorer_m0_2` (teamwork_preview_explorer)  
**Ngày lập:** 2026-10-13  
**Tài liệu căn cứ:**  
- `ORIGINAL_REQUEST.md` (R1, ACC-01 .. ACC-13)  
- `AGENTS.md` (Quy tắc kiểm thử, kiến trúc Modular Monolith)  
- `.agents/teamwork/orchestrator/PROJECT.md`  
- `.agents/teamwork/spec_miner_survey_1/spec_report.md` (Section 9: C01–C07)  
- `docs/business-rules.md`, `docs/decision-register.md` (DEC-001..DEC-009)  
- `docs/implementation-plan.md`, `docs/permissions.md`, `docs/acceptance-matrix.md`  
- Existing tests: `tests/*.test.mjs`, `tests/helpers/database.mjs`

---

## 1. Tổng Quan & Mục Tiêu Của Milestone M0

Mục tiêu cốt lõi của gói **P00 (Milestone M0)** là thiết lập baseline kiểm thử sạch, cô lập, loại bỏ hoàn toàn các giả định mập mờ trong đặc tả bằng cách xác lập **7 Điểm Làm Rõ (Clarification Points C01–C07)** thành các **Trường Hợp Mẫu (Golden Cases)** có thể thực thi tự động (`executable test suite`).

File kiểm thử mục tiêu: `tests/workforce-golden-cases.test.mjs`.

### Nguyên tắc thiết kế bộ test:
1. **Tuân thủ Node Test Runner:** Sử dụng `node:test` (`test`, `describe`) và `node:assert/strict` (`assert`), chạy qua lệnh chuẩn:
   ```bash
   node --experimental-strip-types --test tests/workforce-golden-cases.test.mjs
   ```
2. **Cô lập bộ nhớ hoàn toàn (In-Memory SQLite):** Mỗi test suite hoặc test case sử dụng `createDatabase()` với SQLite in-memory (`:memory:`), chạy toàn bộ chuỗi migration D1 hiện có (`drizzle/*.sql` từ 0000 đến 0014) và dọn dẹp bằng `t.after(() => db.close())`.
3. **Phối hợp cùng Fixture Đa Vai Trò (explorer_m0_1):** Sử dụng các fixtures chuẩn hóa từ `tests/fixtures/workforce-fixtures.mjs` (nhân viên A/B, team lead, manager, sole owner, multi-owner, system admin, các trạng thái offboarded/suspended).
4. **Chiến lược chuyển tiếp Milestone (Zero-Regression & Progressive Enablement):**
   - Các trường hợp kiểm thử tính toàn vẹn của database triggers và domain logic hiện hữu (ví dụ: draft slot trong trigger overlap ở C02, phân bổ ca qua tháng ở C04, xóa evidence ở C07, bất biến dữ liệu công ở C06) được kích hoạt **chạy PASS ngay tại M0**.
   - Các trường hợp kiểm thử phụ thuộc vào application logic sẽ được triển khai ở M1–M4 (ví dụ: anti-self-approval ở P01, bảng rate history ở P05, gate check-in bàn giao ở P06) được thiết kế code hoàn chỉnh, bọc trong cấu trúc chuẩn xác và đánh dấu `t.skip("Sẽ kích hoạt trong Milestone M1/P01...")` để **100% test suite hiện tại (161 tests) giữ trạng thái XANH**, đồng thời sẵn sàng unskip ngay khi các gói P01–P08 hoàn thành.

---

## 2. Chi Tiết 7 Điểm Làm Rõ (Golden Cases C01 .. C07)

---

### 2.1. C01: Ma Trận Chặn Tự Duyệt (Self-Approval Matrix) & Giới Hạn Quyền `team_lead`

#### Căn cứ quy tắc:
- **Quyết định:** DEC-001, ACC-04, ACC-09.
- **Quy tắc nghiệp vụ:** ROLE-002, ROLE-004, BR-001, BR-002.
- **Bất biến:** `actor.id !== requester.id` VÀ `actor.id !== beneficiary.id`.

#### Định nghĩa ma trận đối tượng:
1. **Actor (`actor`):** Người dùng đang thực hiện cuộc gọi API/thao tác duyệt (`actor.id`, `actor.email`, `actor.role`).
2. **Requester (`requester`):** Người khởi tạo yêu cầu (`employee_email` / `created_by`).
3. **Beneficiary (`beneficiary`):** Nhân viên hưởng lợi hoặc bị tác động trực tiếp bởi yêu cầu:
   - Với yêu cầu xin nghỉ (`leave`): `beneficiary = requester`.
   - Với yêu cầu sửa công (`correction`): `beneficiary` là nhân viên sở hữu phiên chấm công được sửa.
   - Với yêu cầu đổi ca (`swap`): `beneficiaries = [requester, peer_employee]` (cả người yêu cầu và người giữ ca thứ hai được đổi).
   - Với duyệt tăng ca (`overtime`): `beneficiary` là nhân viên làm ca đó.
   - Với duyệt ngoại lệ chấm công (`reviewAttendance`): `beneficiary` là nhân viên phát sinh sự kiện.

#### Giới hạn vai trò (Role Scoping):
- **`employee`:** Chặn toàn bộ thao tác duyệt (HTTP 403 `forbidden`).
- **`system_admin`:** Chặn toàn bộ các endpoint nghiệp vụ kinh doanh (HTTP 403 `forbidden`).
- **`team_lead` (Trưởng ca vận hành):**
  - Bị CHẶN khi duyệt đơn xin nghỉ (`leave`) -> HTTP 403 `forbidden`.
  - Bị CHẶN khi duyệt sửa công (`correction`) -> HTTP 403 `forbidden`.
  - Bị CHẶN khi review ngoại lệ chấm công -> HTTP 403 `forbidden`.
  - Bị CHẶN khi duyệt overtime -> HTTP 403 `forbidden`.
  - Bị CHẶN khi xem ảnh/GPS của nhân viên -> HTTP 403 `forbidden`.
  - **CHỈ ĐƯỢC DUYỆT ĐỔI CA (`swap`)** khi và chỉ khi CẢ HAI nhân viên đổi ca đều có role là `employee`. Nếu 1 trong 2 người là `team_lead`, `manager`, hoặc `owner`, `team_lead` bị chặn (HTTP 403 `forbidden`).
- **`manager`:**
  - Được duyệt yêu cầu của `employee` và `team_lead` (miễn là actor != requester và actor != beneficiary).
  - Không được duyệt yêu cầu của `manager` khác hoặc `owner` (phải do `owner` duyệt).
  - Không được tự duyệt yêu cầu của chính mình.
- **`owner`:**
  - Quán có >= 2 active owners: Owner A không được tự duyệt yêu cầu/sửa công của Owner A; Owner B phải duyệt.
  - Quán có đúng 1 active owner: Áp dụng luồng `sole_owner_self_correction` riêng biệt (xem C06).

#### Bảng Test Cases C01:
| Case ID | Loại yêu cầu | Requester | Beneficiary | Actor | Kết quả mong đợi | Mã lỗi / Ghi chú |
|---|---|---|---|---|---|---|
| `C01-T01` | `leave` | Staff A | Staff A | Staff A | **Từ chối (403)** | `self_approval_blocked`: Tự duyệt đơn xin nghỉ của chính mình |
| `C01-T02` | `leave` | Manager M1 | Manager M1 | Manager M1 | **Từ chối (403)** | `self_approval_blocked`: Quản lý tự duyệt nghỉ của chính mình |
| `C01-T03` | `swap` | Staff A | Staff A & Manager M1 | Manager M1 | **Từ chối (403)** | `self_approval_blocked`: Actor là beneficiary trong đơn đổi ca |
| `C01-T04` | `swap` | Staff A | Staff A & Staff B | Team Lead TL1 | **Thành công (200)** | Hợp lệ: Cả 2 nhân viên là regular employee, TL1 độc lập |
| `C01-T05` | `swap` | Staff A | Staff A & Team Lead TL2 | Team Lead TL1 | **Từ chối (403)** | `forbidden`: Team lead không có quyền duyệt swap cho đồng cấp TL2 |
| `C01-T06` | `leave` | Staff A | Staff A | Team Lead TL1 | **Từ chối (403)** | `forbidden`: Team lead bị tước quyền duyệt nghỉ |
| `C01-T07` | `correction` | Staff A | Staff A | Team Lead TL1 | **Từ chối (403)** | `forbidden`: Team lead bị tước quyền duyệt sửa công |
| `C01-T08` | `exception` | Staff A | Staff A | Team Lead TL1 | **Từ chối (403)** | `forbidden`: Team lead bị tước quyền review chấm công |
| `C01-T09` | `leave` | Staff A | Staff A | System Admin | **Từ chối (403)** | `forbidden`: System Admin bị cách ly khỏi nghiệp vụ |
| `C01-T10` | `correction` | Owner O1 | Owner O1 | Owner O1 (quán 2 owners) | **Từ chối (403)** | `self_approval_blocked`: Quán có 2 chủ, O1 không được tự duyệt |
| `C01-T11` | `correction` | Owner O1 | Owner O1 | Owner O2 (quán 2 owners) | **Thành công (200)** | Hợp lệ: Owner thứ hai duyệt độc lập |

#### Code mẫu kiểm thử (Executable Specification):
```javascript
test("C01: Self-approval matrix (actor != requester, actor != beneficiary) & team_lead scope", async (t) => {
  const { db, store, owner1, owner2, manager, lead, staffA, staffB } = setupMultiRoleStore(t);

  // C01-T01: Nhân viên tự duyệt đơn nghỉ của mình -> 403
  const leaveReqStaff = await createTestRequest(db, staffA, { type: "leave", title: "Nghỉ phép", shiftId: "shift-a" });
  await assert.rejects(
    decideRequest(db, staffA, leaveReqStaff.id, "approved"),
    (err) => err.status === 403 && (err.code === "self_approval_blocked" || err.code === "forbidden")
  );

  // C01-T03: Quản lý là đối tượng thụ hưởng (beneficiary) trong đơn swap do nhân viên tạo -> 403
  const swapReq = await createTestRequest(db, staffA, {
    type: "swap",
    title: "Đổi ca với quản lý",
    shiftId: "shift-staff-a",
    peerShiftId: "shift-mgr",
    targetEmployeeEmail: manager.email,
  });
  await assert.rejects(
    decideRequest(db, manager, swapReq.id, "approved"),
    (err) => err.status === 403 && (err.code === "self_approval_blocked" || err.code === "forbidden")
  );

  // C01-T04: Team Lead duyệt swap giữa Staff A và Staff B -> Thành công
  const staffSwapReq = await createTestRequest(db, staffA, {
    type: "swap",
    title: "Đổi ca giữa 2 nhân viên",
    shiftId: "shift-staff-a",
    peerShiftId: "shift-staff-b",
    targetEmployeeEmail: staffB.email,
  });
  const leadDecision = await decideRequest(db, lead, staffSwapReq.id, "approved");
  assert.equal(leadDecision.status, "approved");

  // C01-T06: Team Lead cố duyệt đơn nghỉ phép -> 403
  await assert.rejects(
    decideRequest(db, lead, leaveReqStaff.id, "approved"),
    (err) => err.status === 403
  );

  // C01-T10: Quán 2 owners - Owner 1 tự sửa công -> 403
  await assert.rejects(
    correctAttendance(db, owner1, { sessionId: "owner1-sess", action: "check_out", adjustedTime: "2026-07-03T09:00:00Z", reason: "Tự sửa" }),
    (err) => err.status === 403
  );

  // C01-T11: Owner 2 duyệt sửa công cho Owner 1 -> 200
  const o2Correction = await correctAttendance(db, owner2, { sessionId: "owner1-sess", action: "check_out", adjustedTime: "2026-07-03T09:00:00Z", reason: "Owner 2 đối soát" });
  assert.ok(o2Correction);
});
```

---

### 2.2. C02: Trạng Thái Shift Draft Có Giữ Chỗ Trong SQLite Overlap Trigger Không?

#### Căn cứ quy tắc:
- **Quyết định:** DEC-002, ACC-01.
- **Quy tắc nghiệp vụ:** SCH-001..003.
- **Database Trigger Hiện Hữu:** `shifts_no_overlap_insert` và `shifts_no_overlap_update` tại `drizzle/0011_workforce_integrity.sql`:
  ```sql
  CREATE TRIGGER shifts_no_overlap_insert BEFORE INSERT ON shifts
  WHEN NEW.status IN ('draft', 'published') AND NEW.approved_leave_request_id IS NULL
  BEGIN
    SELECT RAISE(ABORT, 'shift_overlap') WHERE EXISTS (
      SELECT 1 FROM shifts s WHERE lower(s.employee_email) = lower(NEW.employee_email)
        AND s.store_id = NEW.store_id AND s.status IN ('draft', 'published') AND s.approved_leave_request_id IS NULL
        AND s.starts_at < NEW.ends_at AND s.ends_at > NEW.starts_at
    );
  END;
  ```

#### Kết luận phân tích & Golden Rules:
1. **Draft VẪN GIỮ CHỖ LỊCH (Slot Holding):** Trigger SQLite cưỡng chế cả `'draft'` và `'published'`. Do đó, người quản lý không thể vô tình xếp 2 ca nháp đè nhau hoặc xếp ca nháp đè lên ca đã xuất bản của cùng một nhân viên.
2. **Ẩn hoàn toàn với nhân viên (Staff Invisibility):** Khi nhân viên gọi API lấy lịch làm việc, truy vấn `/api/today` hoặc màn hình chấm công: SQL bắt buộc phải lọc `status = 'published'`. Ca nháp hoàn toàn vô hình, không tính vắng mặt, không gửi notification, và không cho phép check-in.
3. **Ca kề nhau (Adjacent Shifts):** Ca 08:00–12:00 và 12:00–16:00 KHÔNG coi là overlap (`starts_at < NEW.ends_at AND ends_at > NEW.starts_at` đánh giá false tại điểm tiếp giáp).
4. **Giải phóng chỗ khi Cancel hoặc Có Nghỉ Phép:** Nếu ca có `status = 'cancelled'` hoặc `approved_leave_request_id IS NOT NULL`, slot được giải phóng, cho phép xếp ca mới vào cùng khung giờ.
5. **Cách ly cửa hàng (Store Scope Isolation):** Cùng nhân viên xếp ca ở Store A và Store B không kích hoạt trigger (vì trigger lọc `s.store_id = NEW.store_id`).

#### Bảng Test Cases C02:
| Case ID | Hành động | Ca hiện có | Ca mới thêm / sửa | Kết quả mong đợi |
|---|---|---|---|---|
| `C02-T01` | Insert Draft Overlap | Draft (08:00–12:00) | Draft (10:00–14:00) | **ABORT:** `shift_overlap` |
| `C02-T02` | Insert Published Overlap Draft | Draft (08:00–12:00) | Published (09:00–11:00) | **ABORT:** `shift_overlap` |
| `C02-T03` | Insert Draft Overlap Published | Published (08:00–12:00) | Draft (11:00–15:00) | **ABORT:** `shift_overlap` |
| `C02-T04` | Insert Adjacent Shifts | Draft (08:00–12:00) | Draft (12:00–16:00) | **THÀNH CÔNG:** Không overlap |
| `C02-T05` | Insert Overlap Cancelled Shift | Cancelled (08:00–12:00) | Draft (08:00–12:00) | **THÀNH CÔNG:** Slot đã nhả |
| `C02-T06` | Insert Overlap Approved Leave | Published + Leave (08:00–12:00) | Published (08:00–12:00) | **THÀNH CÔNG:** Slot đã nhả để xếp người thay |
| `C02-T07` | Employee Visibility Query | 1 Draft + 1 Published | Query bởi Employee | **CHỈ TRẢ VỀ 1 CA:** Ca published |
| `C02-T08` | Check-in Attempt on Draft | Draft (08:00–12:00) | Check-in lúc 08:00 | **TỪ CHỐI:** Không tìm thấy ca published |

#### Code mẫu kiểm thử (Executable Specification):
```javascript
test("C02: Shift draft holding slot in SQLite overlap trigger & employee invisibility", (t) => {
  const db = createDatabase();
  t.after(() => db.close());
  seedStore(db);
  const staff = seedEmployee(db, { id: "staff-c02", role: "employee" });

  const insertShift = (id, status, startsAt, endsAt, leaveReq = null) => {
    db.sqlite.prepare(
      `INSERT INTO shifts (id, store_id, employee_email, starts_at, ends_at, role_label, status, approved_leave_request_id, created_at, updated_at)
       VALUES (?, 'store-a', ?, ?, ?, 'Barista', ?, ?, '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z')`
    ).run(id, staff.email, startsAt, endsAt, status, leaveReq);
  };

  // C02-T01: Ca draft 1 giữ chỗ -> Ca draft 2 chồng lấn bị trigger abort
  insertShift("shift-d1", "draft", "2026-07-03T01:00:00Z", "2026-07-03T05:00:00Z");
  assert.throws(
    () => insertShift("shift-d2", "draft", "2026-07-03T03:00:00Z", "2026-07-03T07:00:00Z"),
    /shift_overlap/
  );

  // C02-T02: Ca draft giữ chỗ ngăn ca published chồng lấn
  assert.throws(
    () => insertShift("shift-p1", "published", "2026-07-03T02:00:00Z", "2026-07-03T04:00:00Z"),
    /shift_overlap/
  );

  // C02-T04: Ca kề sát nhau thành công
  insertShift("shift-adjacent", "draft", "2026-07-03T05:00:00Z", "2026-07-03T09:00:00Z");
  assert.equal(db.sqlite.prepare("SELECT count(*) as n FROM shifts").get().n, 2);

  // C02-T06: Ca có approved_leave_request_id giải phóng slot
  db.sqlite.prepare("UPDATE shifts SET approved_leave_request_id = 'leave-1' WHERE id = 'shift-d1'").run();
  insertShift("shift-replacement", "published", "2026-07-03T01:00:00Z", "2026-07-03T05:00:00Z");
  assert.equal(db.sqlite.prepare("SELECT count(*) as n FROM shifts").get().n, 3);
});
```

---

### 2.3. C03: Biên 15 Phút — Ghi Nhận Thực Tế vs Phút Được Tính Lương & Ca Không Phân Trước

#### Căn cứ quy tắc:
- **Quyết định:** DEC-004, ACC-03.
- **Quy tắc nghiệp vụ:** ATT-001..009.
- **Bất biến:**
  - `attendance_events.recorded_at` là dữ liệu gốc bất biến.
  - `attendance_sessions.worked_minutes` phản ánh tổng thời gian thực tế có mặt.
  - `payable_minutes` (phút tính lương) mặc định bị cắt (clip) về khung ca kế hoạch nếu không có quyết định duyệt overtime có thẩm quyền.

#### 4 Trường hợp mẫu kinh điển (Golden Cases):
Giả sử ca kế hoạch: **08:00 – 12:00** (khung kế hoạch: 240 phút = 4.0 giờ).
Dung sai check-in/out: 5 phút. Biên cắt ghi nhận: 15 phút.

1. **Case A (Vào sớm 10m, Ra muộn 10m, Không duyệt overtime):**
   - Chấm công: Check-in lúc `07:50`, Check-out lúc `12:10`.
   - `recorded_minutes` = 260 phút (từ 07:50 đến 12:10).
   - `payable_minutes` = **240 phút** (bị clip về khung ca kế hoạch 08:00–12:00).
   - Ghi chú: Không sinh exception vì 10m nằm trong biên ghi nhận 15m; 20m ngoài ca không tính lương vì không có đơn overtime.
2. **Case B (Vào sớm 20m, Ra muộn 20m, Không duyệt overtime):**
   - Chấm công: Check-in lúc `07:40`, Check-out lúc `12:20`.
   - `recorded_minutes` = 280 phút.
   - `payable_minutes` = **240 phút** (bị clip về khung ca 08:00–12:00).
   - Ghi chú: Có mặt sớm 20m (> 15m biên) và ra muộn 20m (> 15m biên) được hệ thống ghi nhận trung thực nhưng không tự động trả lương.
3. **Case C (Vào sớm 10m, Ra muộn 30m, Được duyệt Overtime 20 phút):**
   - Chấm công: Check-in lúc `07:50`, Check-out lúc `12:30`.
   - Quản lý duyệt: Quyết định tăng ca 20 phút (lý do: "Khách đông cuối ca").
   - `recorded_minutes` = 280 phút.
   - `payable_minutes` = **260 phút** (240 phút ca kế hoạch + 20 phút overtime được duyệt).
   - Ghi chú: 10 phút vào sớm (07:50–08:00) và 10 phút ra muộn chưa duyệt (12:20–12:30) bị clip bỏ.
4. **Case D (Phiên Chấm Công Không Có Ca - Unscheduled Session):**
   - Nhân viên check-in 09:00, check-out 13:00 mà không được xếp ca trước (`shift_id IS NULL`).
   - `recorded_minutes` = 240 phút.
   - `payable_minutes` = **0 phút** (trạng thái `review_required` / `pending`).
   - Ghi chú: Hệ thống TUYỆT ĐỐI KHÔNG tự đoán `ends_at`. Giờ tính lương bằng 0 cho đến khi quản lý duyệt gán ca hoặc duyệt đơn điều chỉnh công.
5. **Case E (Quên Checkout Quá 4 Giờ - Auto-Close +4h):**
   - Ca kế hoạch 08:00–12:00. Nhân viên check-in 08:00, quên checkout.
   - Tại `16:01` (quá `ends_at + 4h`), scheduler tự động đóng phiên với cờ `MISSING_CHECKOUT`.
   - `payable_minutes` = **0 phút**. Không được đưa vào báo cáo lương tính tiền cho đến khi có giải trình được duyệt.

#### Bảng Tổng Hợp So Sánh C03:
| Kịch bản | Giờ vào ra thực tế | Giờ ca kế hoạch | Overtime duyệt | `recorded_minutes` | `payable_minutes` | Ghi chú xử lý |
|---|---|---|---|---|---|---|
| **Case A** | 07:50 – 12:10 | 08:00 – 12:00 | Không | 260 | **240** | Clip về khung ca |
| **Case B** | 07:40 – 12:20 | 08:00 – 12:00 | Không | 280 | **240** | Clip về khung ca |
| **Case C** | 07:50 – 12:30 | 08:00 – 12:00 | 20 phút | 280 | **260** | Khung ca + Overtime |
| **Case D** | 09:00 – 13:00 | *Không có ca* | Không | 240 | **0** | Chờ gán ca / correction |
| **Case E** | 08:00 – *Quên ra* | 08:00 – 12:00 | Không | *NULL/Open* | **0** | Auto-close +4h cờ MISSING |

---

### 2.4. C04: Thứ Tự Thực Hiện Floor 15 Phút, Split Đoạn Rate & Round 1.000 VND

#### Căn cứ quy tắc:
- **Quyết định:** DEC-006, ACC-06.
- **Quy tắc nghiệp vụ:** PAY-001..006, EX-01..03.

#### Quy trình chuẩn thuật toán 6 bước:
```
[1. Clip Ca & Overtime]
       ↓
[2. Split Kỳ & Đoạn Rate History]
       ↓
[3. Floor 15m Theo Từng Phân Đoạn (Math.floor(min / 15) * 15)]
       ↓
[4. Tính Tiền Phân Đoạn Nguyên VND ((floored_min / 60) * rate)]
       ↓
[5. Tổng Hợp Kỳ (Subtotal = Sum(Segments) + Thưởng - Phạt)]
       ↓
[6. Round Số Học Tổng Lương Về 1.000 VND Gần Nhất (Math.round(Subtotal / 1000) * 1000)]
```

#### Quy tắc làm tròn từng bước:
1. **Bước 3 — Floor 15 phút (theo từng phân đoạn):**
   - 0 đến 14 phút -> **0 phút** (0.00h)
   - 15 đến 29 phút -> **15 phút** (0.25h)
   - 30 đến 44 phút -> **30 phút** (0.50h)
   - 45 đến 59 phút -> **45 phút** (0.75h)
2. **Bước 4 — Tiền phân đoạn:**
   - Tính toán với số nguyên VND: `Math.round((floored_minutes / 60) * hourly_rate)`.
   - TUYỆT ĐỐI KHÔNG làm tròn về 1.000 VND ở từng phân đoạn (tránh sai lệch cộng dồn).
3. **Bước 6 — Làm tròn tổng kỳ về 1.000 VND gần nhất:**
   - Thuật toán số học chuẩn (Half-Up tại 500 VND):
     - `phần dư < 500 VND` -> Làm tròn XUỐNG.
     - `phần dư >= 500 VND` -> Làm tròn LÊN.

#### Bảng Test Cases C04:
| Case ID | Đầu vào tính toán | Chi tiết phân đoạn / Phép tính | Kết quả mong đợi | Ghi chú kiểm chứng |
|---|---|---|---|---|
| `C04-T01` | Phân đoạn 14 phút @ 20.000/h | `floor(14/15)*15 = 0m` -> 0 * 20.000 | **0 VND** | Dưới 15m làm tròn về 0 |
| `C04-T02` | Phân đoạn 15 phút @ 20.000/h | `floor(15/15)*15 = 15m` -> 0.25h * 20.000 | **5.000 VND** | Vừa đủ 1 block 15m |
| `C04-T03` | Phân đoạn 29 phút @ 20.000/h | `floor(29/15)*15 = 15m` -> 0.25h * 20.000 | **5.000 VND** | Dư 14m bị floor xuống |
| `C04-T04` | Phân đoạn 30 phút @ 20.000/h | `floor(30/15)*15 = 30m` -> 0.50h * 20.000 | **10.000 VND** | Đúng 2 block 15m |
| `C04-T05` | Đổi rate giữa kỳ (Ngày 1–15: 20k; Ngày 16–30: 25k). Làm 10h trước, 10h sau | Đoạn 1: 10h * 20.000 = 200.000 VND<br>Đoạn 2: 10h * 25.000 = 250.000 VND | **450.000 VND** | Không được áp mức 25k cho cả kỳ (500k là SAI) |
| `C04-T06` | Ca qua đêm đổi rate lúc 00:00 (23:00–02:00). Rate cũ: 20k; Rate mới: 24k | Đoạn 1 (23–00): 60m @ 20k = 20.000<br>Đoạn 2 (00–02): 120m @ 24k = 48.000 | **68.000 VND** | Tách đúng đoạn rate tại nửa đêm |
| `C04-T07` | Ca qua tháng (23:00 31/07 – 01:00 01/08) | Tháng 7: 60m (23:00–00:00)<br>Tháng 8: 60m (00:00–01:00) | T7: **60m**, T8: **60m** | Mỗi tháng nhận đúng 60m, không gộp 120m |
| `C04-T08` | Round tổng: Subtotal = 1.450.499 VND | Phần dư 499 VND (< 500) -> Làm tròn xuống | **1.450.000 VND** | Kiểm tra ngưỡng sát 500 VND |
| `C04-T09` | Round tổng: Subtotal = 1.450.500 VND | Phần dư 500 VND (>= 500) -> Làm tròn lên | **1.451.000 VND** | Ngưỡng chính xác 500 VND |
| `C04-T10` | Round tổng: Subtotal = 1.450.501 VND | Phần dư 501 VND (>= 500) -> Làm tròn lên | **1.451.000 VND** | Làm tròn lên |
| `C04-T11` | Chặn finalize khi thiếu rate history | Nhân viên có công trong kỳ nhưng không có dòng rate nào hiệu lực | **REJECT (409/400):** `pay_rate_required` | Không fallback ngầm về rate hiện tại |

---

### 2.5. C05: Quy Tắc Bàn Giao Ca (Handover Gate), Ca Đầu Ngày & Luồng Bypass

#### Căn cứ quy tắc:
- **Quyết định:** DEC-005, ACC-07.
- **Quy tắc nghiệp vụ:** OPS-001..005.

#### Phân tích cơ chế Check-in Gate:
Khi nhân viên ca sau đến quán và thực hiện thao tác Check-in:
1. **Kiểm tra ca liền trước (Preceding Shift Check):**
   - Hệ thống quét ca làm việc của cửa hàng trong chu kỳ vận hành.
   - **Kịch bản Ca đầu tiên trong ngày (First Shift / Opening):** Nếu ca bắt đầu sau giờ đóng cửa qua đêm của quán và không có ca nào liền trước trong vòng 4 giờ -> Hệ thống tự động đánh dấu `no_previous_handover_required = true`. Nhân viên được check-in bình thường.
2. **Kịch bản Ca nối tiếp (Continuation Shift):**
   - Nếu có ca liền trước, hệ thống kiểm tra biên bản bàn giao (`handovers`):
     - Đã có biên bản bàn giao VÀ nhân viên ca sau đã bấm xác nhận (`acknowledged_at IS NOT NULL`) -> **Cho phép check-in**.
     - Chưa có bàn giao HOẶC nhân viên ca sau chưa xác nhận -> **CHẶN CHECK-IN (HTTP 412 Precondition Failed - `handover_unacknowledged`)**.
3. **Kịch bản Luồng Bypass Khẩn Cấp (Emergency Manager Bypass):**
   - Trong trường hợp nhân viên ca trước gặp sự cố, mất điện, hoặc quên bàn giao:
   - Quản lý (`MANAGER`) hoặc Chủ quán (`OWNER`) có thể gọi hành động `bypassHandover(shiftId, { reason, actor })`.
   - Ràng buộc:
     - Lý do bắt buộc độ dài tối thiểu `>= 10 ký tự`.
     - Chỉ role `manager` hoặc `owner` được thực hiện (nhân viên thường cố bypass -> HTTP 403).
     - Hệ thống ghi audit log `handover.bypassed` kèm lý do.
     - Sau khi bypass, nhân viên ca sau được unblock để check-in bình thường mà không làm mất sự kiện công.

#### Bảng Test Cases C05:
| Case ID | Tình huống | Dữ liệu ca & bàn giao | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| `C05-T01` | Ca mở cửa đầu ngày | Ca 07:00–12:00 (không có ca trước từ đêm qua) | Nhân viên check-in lúc 06:55 | **THÀNH CÔNG (200):** `no_previous_handover_required` |
| `C05-T02` | Ca chiều chưa xác nhận bàn giao | Ca sáng (07:00–12:00) tạo bàn giao lúc 11:55; Ca chiều chưa ack | Nhân viên ca chiều check-in lúc 11:58 | **TỪ CHỐI (412):** `handover_unacknowledged` |
| `C05-T03` | Xác nhận bàn giao hợp lệ | Ca chiều gọi `/api/handovers/acknowledge` | Nhân viên ca chiều check-in sau đó | **THÀNH CÔNG (200)** |
| `C05-T04` | Người lạ cố xác nhận bàn giao | Staff C không thuộc ca nhận cố gọi acknowledge | Staff C gọi acknowledge | **TỪ CHỐI (403):** `forbidden` |
| `C05-T05` | Manager Bypass hợp lệ | Ca sáng quên bàn giao; Manager gọi `bypassHandover` (lý do: "Ca sáng quên...") | Nhân viên ca chiều check-in | **THÀNH CÔNG (200):** Audit ghi `handover.bypassed` |
| `C05-T06` | Bypass thiếu lý do hoặc role thấp | Nhân viên thường gọi bypass hoặc lý do < 10 ký tự | Thao tác bypass | **TỪ CHỐI (400 / 403)** |

---

### 2.6. C06: Nghỉ Phép Nguyên Ca, Rút Đơn & Luồng Sole-Owner Self-Correction

#### Căn cứ quy tắc:
- **Quyết định:** DEC-001, DEC-003, ACC-04, ACC-05.
- **Quy tắc nghiệp vụ:** REQ-001..005, ROLE-003.

#### Phân tích 3 cơ chế:
1. **Nghỉ phép nguyên ca (Full-Shift Leave):**
   - Đơn xin nghỉ phép gắn với `shift_id`.
   - Khi được duyệt: Cập nhật `shifts.approved_leave_request_id = request.id`.
   - Giờ kế hoạch của nhân viên được trừ về 0 (loại khỏi vắng mặt không phép).
   - Nếu ca đã có chấm công (`attendance_sessions` tồn tại) -> Chặn duyệt (HTTP 409 `request_conflict`).
   - Nếu ca thuộc kỳ lương đã khóa -> Chặn duyệt (HTTP 409).
2. **Rút đơn khi đang Pending (Request Withdrawal):**
   - Chỉ người tạo (`requester`) mới được quyền rút đơn (`actor.email === request.employee_email`).
   - Đơn phải đang ở trạng thái `pending`.
   - Sau khi rút, `status = 'withdrawn'`.
   - Quản lý không thể duyệt đơn đã bị rút (HTTP 409 `request_conflict`).
   - Người khác cố rút đơn -> HTTP 403 `forbidden`.
3. **Quy tắc Sole-Owner Self-Correction:**
   - Khi quán chỉ có **DUY NHẤT 1 OWNER ACTIVE**:
     - Cho phép chủ quán tự điều chỉnh công của chính mình qua luồng riêng biệt `sole_owner_self_correction`.
     - Không cho phép giả mạo là "phê duyệt độc lập" (không dùng endpoint approve thông thường).
     - Bắt buộc ghi nhận:
       - Lý do hợp lệ (độ dài >= 5 ký tự).
       - Diff trước và sau (`before`, `after`).
       - Audit log gắn cờ cao (`action = 'attendance.sole_owner_self_correction'`).
       - Dữ liệu ghi append-only vào `attendance_corrections`, giữ nguyên `attendance_events.recorded_at`.
   - Khi quán có **>= 2 OWNERS ACTIVE**:
     - Luồng sole-owner BỊ KHÓA HOÀN TOÀN (HTTP 403 `multiple_owners_exist`).
     - Owner 1 phải tạo yêu cầu để Owner 2 duyệt độc lập.

#### Bảng Test Cases C06:
| Case ID | Tính năng | Đầu vào | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| `C06-T01` | Full-Shift Leave | Ca S1 (08:00–12:00); Request type `leave` | Manager duyệt approved | `shifts.approved_leave_request_id = req.id`; Scheduled = 0 |
| `C06-T02` | Leave on Worked Shift | Ca S1 đã có session chấm công | Manager duyệt approved | **TỪ CHỐI (409):** `request_conflict` |
| `C06-T03` | Leave on Locked Period | Ca S1 nằm trong kỳ tháng 7 đã finalized | Manager duyệt approved | **TỪ CHỐI (409):** `request_conflict` |
| `C06-T04` | Withdraw Pending Request | Request R1 `pending` do Staff A tạo | Staff A gọi `withdraw` | Request sang `withdrawn`. Manager sau đó duyệt -> 409 |
| `C06-T05` | Unauthorized Withdraw | Request R1 do Staff A tạo | Staff B gọi `withdraw` | **TỪ CHỐI (403):** `forbidden` |
| `C06-T06` | Multi-Owner Self-Correction | Quán có 2 Owners (O1, O2). O1 tự sửa công | O1 gọi `sole_owner_self_correction` | **TỪ CHỐI (403):** `multiple_owners_exist` |
| `C06-T07` | Sole-Owner Self-Correction | Quán có đúng 1 Owner (O1). O1 tự sửa công có lý do | O1 gọi `sole_owner_self_correction` | **THÀNH CÔNG (200):** Lưu diff, audit cờ cao |
| `C06-T08` | Sole-Owner Short Reason | Quán có 1 Owner. Lý do rỗng hoặc < 5 ký tự | O1 gọi self-correction | **TỪ CHỐI (400):** `invalid_reason` |

---

### 2.7. C07: Chu Kỳ Lưu Trữ 90 Ngày vs Ẩn Danh Hóa 180 Ngày vs Bảo Tồn 3 Năm

#### Căn cứ quy tắc:
- **Quyết định:** DEC-008, ACC-10.
- **Quy tắc nghiệp vụ:** RET-001..003.

#### Phân tích 3 mốc thời gian:
1. **Mốc bắt đầu tính hạn:** Dựa trên `created_at` (thời điểm ghi nhận bản ghi).
2. **Mốc 90 ngày — Xóa bằng chứng nhạy cảm (Evidence Purge):**
   - Áp dụng cho: Ảnh chấm công (Cloudflare R2) và Tọa độ GPS (`attendance_locations` trong D1).
   - Thao tác:
     1. Xóa object trên Cloudflare R2: `evidence.delete(object_key)`.
     2. Nếu R2 xóa thành công, xóa bản ghi `attendance_photos` trong D1.
     3. Xóa bản ghi `attendance_locations` tương ứng trong D1.
     4. **BẢO TỒN NGUYÊN VẸN `attendance_events`:** ID, Session ID, Action, Timestamp, Verification kết quả được giữ lại 100%.
     5. **Tính độc lập khi R2 lỗi:** Nếu R2 mất mạng/trả lỗi 500, TUYỆT ĐỐI KHÔNG xóa D1. Ghi nhận failure metric để scheduler thử lại ở lượt sau.
3. **Mốc 180 ngày — Ẩn danh hóa thông tin đơn hàng (Order PII Anonymization):**
   - Áp dụng cho: `customer_orders` cũ hơn 180 ngày.
   - Thao tác:
     - `customer_name` -> `'Khách hàng'`.
     - `customer_phone` -> `'***'`.
     - `customer_note` -> `NULL` / xóa trắng.
     - `item_note` trong order items -> `NULL` / xóa trắng.
     - **BẢO TỒN DOANH SỐ:** Danh mục món, số lượng, đơn giá, phụ thu, `total_amount`, và trạng thái đơn hàng giữ nguyên vẹn để phục vụ báo cáo doanh thu tài chính.
4. **Mốc 3 năm — Bảo tồn dữ liệu vận hành tối thiểu (3-Year Preservation):**
   - Áp dụng cho: `attendance_events`, `attendance_sessions`, `attendance_corrections`, `payroll_periods`, `payroll_entries`, `audit_events`, `checklist_executions`, `incidents`, `handovers`.
   - **Quy tắc sàn (Minimum Floor Invariant):** 3 năm là ngưỡng sàn tối thiểu bảo vệ dữ liệu. Hệ thống TUYỆT ĐỐI KHÔNG cài đặt bất kỳ cron job tự động xóa dữ liệu vận hành khi vừa chạm mốc 3 năm.

#### Bảng Test Cases C07:
| Case ID | Phạm vi dữ liệu | Tuổi dữ liệu | Thao tác kiểm thử | Kết quả mong đợi |
|---|---|---|---|---|
| `C07-T01` | Evidence (Ảnh + GPS) | 91 ngày (quá hạn 90d) | Chạy `expireEvidence` với Mock R2 | R2 object bị xóa; `attendance_photos` và `attendance_locations` bị xóa; `attendance_events` **NGUYÊN VẸN** |
| `C07-T02` | Evidence (Ảnh + GPS) | 89 ngày (chưa đến hạn) | Chạy `expireEvidence` | Không xóa R2, không xóa D1 |
| `C07-T03` | Evidence lỗi R2 | 91 ngày; R2 throw Error | Chạy `expireEvidence` | Bắt lỗi an toàn, `attendance_photos` và `locations` **KHÔNG BỊ XÓA** ở D1 |
| `C07-T04` | Order PII | 181 ngày (quá hạn 180d) | Chạy `anonymizeOrders` | Tên = 'Khách hàng', SĐT = '***', Note = null; `total_amount` và món **NGUYÊN VẸN** |
| `C07-T05` | Order PII | 179 ngày (chưa đến hạn) | Chạy `anonymizeOrders` | Tên, SĐT, Note được giữ nguyên vẹn |
| `C07-T06` | Dữ liệu công & lương | 3 năm + 10 ngày | Chạy toàn bộ retention crons | Dữ liệu công, lương, audit log **KHÔNG BỊ XÓA** |

---

## 3. Kiến Trúc Bộ Kiểm Thử `tests/workforce-golden-cases.test.mjs`

### 3.1. Cấu trúc Suite và Bố cục File

File test được chia thành 7 khối `describe` hoặc cụm `test` tương ứng với C01 đến C07:

```
tests/workforce-golden-cases.test.mjs
├── Helper imports (node:test, node:assert/strict, database, fixtures)
├── Fixture setup helpers (multi-role store, timeline generators)
│
├── describe("C01: Self-Approval Matrix & Role Scoping")
│   ├── test("C01-1: Requester cannot self-approve leave request")
│   ├── test("C01-2: Beneficiary cannot approve swap request")
│   ├── test("C01-3: Team lead can only approve swap between employees")
│   ├── test("C01-4: Team lead is blocked from leave, corrections, and review")
│   └── test("C01-5: System admin is blocked from business mutations")
│
├── describe("C02: Shift Draft Slot Reservation & Trigger Overlap")
│   ├── test("C02-1: Draft shift reserves slot against draft and published shifts")
│   ├── test("C02-2: Adjacent shifts succeed without conflict")
│   ├── test("C02-3: Cancelled and approved-leave shifts release slot")
│   └── test("C02-4: Draft shifts are strictly omitted from employee queries and check-in")
│
├── describe("C03: 15-Minute Attendance Clipping & Unscheduled Sessions")
│   ├── test("C03-1 (Case A): 07:50-12:10 without overtime clips to 240m")
│   ├── test("C03-2 (Case B): 07:40-12:20 without overtime clips to 240m")
│   ├── test("C03-3 (Case C): 07:50-12:30 with 20m approved overtime yields 260m")
│   ├── test("C03-4 (Case D): Unscheduled session yields 0 payable minutes")
│   └── test("C03-5 (Case E): Forgotten checkout auto-closes at ends_at + 4h with 0 payable minutes")
│
├── describe("C04: Payroll Rounding & Rate History Splitting")
│   ├── test("C04-1: 15-minute floor rounding steps (14m->0, 15m->15, 29m->15, 30m->30)")
│   ├── test("C04-2: Mid-period rate change splits worked hours by effective intervals")
│   ├── test("C04-3: Cross-midnight and cross-month shift splitting")
│   ├── test("C04-4: Total salary arithmetic rounding to nearest 1.000 VND (half-up at 500)")
│   └── test("C04-5: Missing rate history in legacy data blocks period finalization")
│
├── describe("C05: Handover Acknowledgment Gate & Bypass Flow")
│   ├── test("C05-1: First shift of the day check-in bypasses handover gate")
│   ├── test("C05-2: Continuation shift check-in blocked when handover unacknowledged")
│   ├── test("C05-3: Valid handover acknowledgment permits check-in")
│   └── test("C05-4: Manager emergency bypass unblocks check-in with audit log")
│
├── describe("C06: Full-Shift Leave, Request Withdrawal & Sole-Owner Self-Correction")
│   ├── test("C06-1: Full-shift leave links shift and resets scheduled minutes")
│   ├── test("C06-2: Leave approval rejected if shift has attendance or locked period")
│   ├── test("C06-3: Requester can withdraw pending request; manager cannot approve withdrawn")
│   ├── test("C06-4: Multi-owner store blocks self-correction")
│   └── test("C06-5: Sole-owner self-correction succeeds with diff and high audit flag")
│
└── describe("C07: Retention Lifecycles & 3-Year Preservation Invariant")
    ├── test("C07-1: 90-day evidence expiry removes R2 photo and D1 GPS, preserves event")
    ├── test("C07-2: R2 failure aborts D1 deletion and preserves raw evidence")
    ├── test("C07-3: 180-day order anonymization masks PII while preserving revenue")
    └── test("C07-4: 3-year preservation invariant retains operational history without auto-purge")
```

### 3.2. Chiến Lược Thực Thi Trong Milestone M0 (P00 Execution Strategy)

Để đảm bảo việc bổ sung `tests/workforce-golden-cases.test.mjs` **không làm gãy bất kỳ bài kiểm tra nào trong số 161 tests hiện có** (`npm test` phải luôn Exit 0):
1. **Phần A — Chạy Thực Tế Ngay (Active Baseline Tests):**
   - Các kiểm thử đánh giá schema và triggers hiện hữu:
     - C02: Kiểm tra trigger SQLite `shifts_no_overlap_insert`/`update` với trạng thái draft, adjacent, leave, cancelled.
     - C04: Thuật toán toán học thuần (floor 15m, round 1.000 VND, phân bổ ca qua tháng trong `load-report.ts`).
     - C06: Bất biến dữ liệu công gốc và trigger chống sửa đổi `attendance_corrections`.
     - C07: Hàm `expireEvidence()` với mock R2 xóa ảnh sau 90 ngày và giữ nguyên `attendance_events`.
2. **Phần B — Đánh Dấu Skip Có Chủ Đích (Targeted Progressive Enablement):**
   - Các kiểm thử đánh giá tính năng mới thuộc các gói P01–P08:
     - C01 (Anti-self-approval trên mutation endpoints): Đánh dấu `t.skip("Sẽ kích hoạt trong Milestone M1/P01 khi access policy hoàn thành")`.
     - C03 (Auto-close +4h scheduler & clipping 15m trên API): Đánh dấu `t.skip("Sẽ kích hoạt trong Milestone M3/P04")`.
     - C04 (Bảng employee_rate_history & migration 0015): Đánh dấu `t.skip("Sẽ kích hoạt trong Milestone M3/P05")`.
     - C05 (Handover check-in gate & bypass API): Đánh dấu `t.skip("Sẽ kích hoạt trong Milestone M4/P06")`.
     - C07 (180-day order PII anonymization job): Đánh dấu `t.skip("Sẽ kích hoạt trong Milestone M4/P08")`.
   - Lợi ích: File test phản ánh 100% hợp đồng nghiệp vụ chuẩn mực ngay từ M0. Khi các subagent tiếp theo triển khai từng gói P01–P08, họ chỉ cần bỏ `t.skip` và xác nhận test chuyển sang PASS mà không phải viết lại test spec.

---

## 4. Danh Mục Kiểm Tra Dành Cho Reviewer & Auditor (Checklist)

| Mục kiểm tra | Tiêu chí đạt | Trạng thái M0 |
|---|---|---|
| **Độ phủ Golden Cases** | Đủ 7 điểm C01, C02, C03, C04, C05, C06, C07 | Đạt (Đầy đủ ví dụ & asserts) |
| **Tính tương thích Runner** | Chạy bằng `node --experimental-strip-types --test` | Đạt |
| **Cô lập môi trường** | Sử dụng in-memory SQLite, không phụ thuộc database ngoài | Đạt |
| **Không sửa code production** | Không chỉnh sửa bất kỳ file nào trong `app/`, `modules/`, `db/` ở M0 | Đạt (Chỉ phân tích & lập kế hoạch) |
| **Định dạng tài liệu** | Viết bằng tiếng Việt, code/identifiers bằng tiếng Anh theo AGENTS.md | Đạt |
