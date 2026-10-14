# Ma trận Nghiệm thu và Bằng chứng Sẵn sàng Sản xuất (Acceptance Matrix)

Tài liệu này xác định tiêu chuẩn nghiệm thu độc lập cho toàn bộ các phát hiện từ [production-readiness-audit.md](file:///d:/College/Practice/loopicafe-management-system/docs/production-readiness-audit.md), phân định rõ ràng giữa **Kiểm thử Dịch vụ / Unit (Node.js)**, **Kiểm thử Trình duyệt E2E (Playwright)** và **Diễn tập Vận hành**.

---

## 1. Bảng Ánh xạ Finding — Task — Kịch bản — Bằng chứng Nghiệm thu

| Audit ID | Mức độ | Nhóm / Task | Yêu cầu Nghiệm thu (Criteria) | Loại kiểm thử & File thực thi | Bằng chứng đạt (Evidence) | Trạng thái |
|---|---|---|---|---|---|---|
| **SEC-01** | P0 | ENV01, BE02 | Loại bỏ mã độc hại/chứa secret trong `seed_supabase_cloud.js`; không gọi cloud | Static analysis / `tests/local-safety.test.mjs` | File được vô hiệu hoá; không chứa live credential; test chặn URL remote | **ĐẠT** |
| **SEC-02** | P0 | BE02, QA02 | Không tin cậy raw identity headers (`oai-authenticated-user-email`); bắt buộc session Supabase hợp lệ | Unit & E2E / `tests/identity-security.test.mjs`, `tests/e2e/auth.spec.ts` | Request giả mạo nhận `401 Unauthorized`; profile không bị chiếm quyền | **ĐẠT** |
| **SEC-03** | P0 | BE06, QA04 | Tra cứu đơn hàng bắt buộc receipt secret token (`X-Order-Receipt`); chặn lộ thông tin qua số điện thoại/mã đơn | Unit & E2E / `tests/ordering-system.test.mjs`, `tests/e2e/order.spec.ts` | GET `/api/order/track?phone=...` trả `404`; chỉ mở được đơn khi có đúng receipt token | **ĐẠT** |
| **SEC-04** | P0 | BE06, QA04 | Giá món, phụ thu size, topping tính toán độc lập tại server; từ chối đơn hàng có giá/món giả mạo | Unit & E2E / `tests/ordering-system.test.mjs`, `tests/e2e/order.spec.ts` | Client gửi `price: 1` hoặc món lạ bị server tính lại đúng 92.000đ hoặc từ chối | **ĐẠT** |
| **DATA-01** | P0 | BE01 | Chuỗi migration nhất quán từ 0000 đến 0013; đồng bộ schema, snapshot và `_journal.json` | Contract test / `tests/architecture-boundaries.test.mjs` | Test 17 & 23 pass; `drizzle/meta/0013_snapshot.json` khớp `0013_workforce_guardrails.sql` | **ĐẠT** |
| **SEC-05** | P1 | BE02, FE01, QA02 | Cờ bắt buộc đổi mật khẩu (`must_change_password`) quản lý tại database D1; client không tự xóa qua metadata | Unit & E2E / `tests/identity-security.test.mjs`, `tests/e2e/auth.spec.ts` | Sửa metadata ở Supabase không vượt qua được guard; endpoint đổi mật khẩu xóa cờ sau khi thành công | **ĐẠT** |
| **DATA-02** | P1 | BE03, FE02, QA03 | Chấm công giữ nguyên `recorded_at` gốc bất biến; lịch sử sửa công lưu ở `attendance_corrections` kèm lý do | Unit / `tests/workforce-integrity.test.mjs` | `recorded_at` không đổi; bảng `attendance_corrections` lưu effective time và reason | **ĐẠT** |
| **DATA-03** | P1 | BE04, FE02, QA03 | Truy vấn lịch theo khoảng ngày; tạo ca tuần nguyên khối; phát hiện ca trùng lấn; sửa/hủy ca kiểm tra `revision` | Unit / `tests/workforce-integrity.test.mjs` | Tạo ca trùng trả về conflict; sửa ca sai revision bị từ chối; hủy ca an toàn | **ĐẠT** |
| **DATA-04** | P1 | BE04, QA03 | Nghỉ phép liên kết ca cụ thể (`approved_leave_request_id`); loại khỏi vắng mặt và cắm cờ người thay thế | Unit / `tests/workforce-integrity.test.mjs` | Ca được duyệt nghỉ chuyển trạng thái, không tính vắng mặt, hiển thị coverage flag | **ĐẠT** |
| **PAY-01** | P1 | BE05, FE03, QA03 | Lương cắt theo tháng Việt Nam (`Asia/Ho_Chi_Minh`); bảo toàn giờ công của nhân viên thôi việc (`offboarded`) | Unit / `tests/workforce-integrity.test.mjs` | Ca vắt tháng chia đều 60m-60m; nhân viên offboarded vẫn nhận đủ lương đã làm | **ĐẠT** |
| **PAY-02** | P1 | BE05, FE03, QA03 | Điều chỉnh lương có lý do; khóa kỳ lương bất biến; chặn thêm ca vào kỳ đã khóa qua trigger | Unit / `tests/workforce-integrity.test.mjs` | Trigger `shifts_locked_period_insert` chặn thêm ca; snapshot bất biến; xuất CSV/XLS chuẩn | **ĐẠT** |
| **ORD-01** | P1 | BE06, FE04, QA04 | Chuyển trạng thái đơn có điều kiện (optimistic concurrency); chống đơn trùng qua `Idempotency-Key` | Unit & E2E / `tests/ordering-system.test.mjs`, `tests/e2e/order.spec.ts` | Thử đổi trạng thái đồng thời chỉ 1 bên thắng; retry cùng idempotency key trả về cùng đơn | **ĐẠT** |
| **OPS-01** | P1 | BE07, QA02 | Bảng audit và review-history lọc nghiêm ngặt theo `store_id`; không lộ dữ liệu cửa hàng khác | Unit / `tests/daily-checklists.test.mjs`, `tests/identity-security.test.mjs` | Truy vấn audit chỉ trả về sự kiện thuộc store của actor; store thứ 2 không đọc được | **ĐẠT** |
| **OPS-02** | P2 | BE07, FE05, QA04 | Checklist làm mới theo nửa đêm Việt Nam (00:00 `Asia/Ho_Chi_Minh`); lưu vết thực thi `checklist_executions` | Unit / `tests/daily-checklists.test.mjs` | Ngày đổi lúc 17:00 UTC (00:00 VN); trạng thái hoàn thành tách biệt từng ngày | **ĐẠT** |
| **OPS-03** | P2 | BE07, FE05, QA04 | Sự cố có luồng giải quyết/đóng đầy đủ; bàn giao ca hiển thị nội dung tóm tắt trong danh sách | UI & Unit / `components/operational/` | Form sự cố có nút Tiếp nhận / Đã xử lý / Đóng; danh sách bàn giao hiển thị `summary` | **ĐẠT** |
| **ENV-01** | P0 | ENV02, QA02 | Môi trường xác thực và dữ liệu hoàn toàn local (Supabase Auth, Inbucket SMTP, D1/R2) | Runtime check / `node tooling/local.mjs doctor` | Doctor trả về `localCredentialsConfigured: true`, URL loopback; Inbucket nhận mail | **ĐANG TIẾN HÀNH** |
| **ENV-02** | P0 | ENV03, QA02 | Bộ dữ liệu fixture đầy đủ 5 vai trò, tài khoản vòng đời, 2 cửa hàng, chạy lại an toàn | Provision check / `node tooling/local.mjs provision` | File `accounts.json` chứa đủ 5 vai trò; rerun không nhân đôi dữ liệu | **ĐANG TIẾN HÀNH** |
| **ENV-03** | P1 | ENV04 | Diễn tập sao lưu và khôi phục dữ liệu D1 sang mục tiêu kiểm thử độc lập | Drill runbook / `docs/operational-runbook.md` | Biên bản restore thành công; bảng đối chiếu số lượng bản ghi khớp 100% | **CHỜ THỰC HIỆN** |

---

## 2. Ma trận Phân quyền và Cửa hàng (Role & Store Matrix)

| Vai trò (Role) | Cửa hàng | Đăng nhập & Profile | Xem Lịch & Đi làm | Chấm công | Sửa công & Ngoại lệ | Xếp ca & Duyệt nghỉ | Xem & Chốt Lương | Quản lý Đơn (Kitchen/Cashier) | Quản lý Tài khoản Store | Quản lý Hệ thống Toàn cục |
|---|---|---|---|---|---|---|---|---|---|---|
| **employee** (Staff A, B) | Store 1 | Cho phép | Cho phép | Cho phép | Gửi giải trình | Chỉ xem ca mình | Không | Không | Không | Không |
| **team_lead** | Store 1 | Cho phép | Cho phép | Cho phép | Gửi giải trình | Xếp ca / Xem lịch | Không | Xem đơn / Đổi trạng thái | Không | Không |
| **manager** | Store 1 | Cho phép | Cho phép | Cho phép | Duyệt sửa công | Xếp ca / Duyệt đơn | Xem & Đối soát | Quản lý toàn bộ đơn | Tạo/sửa nhân viên (trừ Owner) | Không |
| **owner** | Store 1 | Cho phép | Cho phép | Cho phép | Toàn quyền duyệt | Toàn quyền lịch | Khóa & Xuất lương | Toàn quyền đơn & Menu | Toàn quyền nhân sự Store | Không |
| **system_admin** | Global | Cho phép | Cho phép | Không bắt buộc | Xem audit toàn cục | Không trực tiếp | Xem đối soát | Xem giám sát | Quản trị tài khoản | Toàn quyền bootstrap |
| **cross-store attacker** | Store 2 | Bị từ chối khi truy cập API / dữ liệu của Store 1 (Trả về 403 Forbidden hoặc 404 Not Found) |

---

## 3. Đặc tả Yêu cầu Fixture cho ENV03 (Fixture Specifications)

Để đảm bảo QA02, QA03, QA04 chạy không có bất kỳ bài test nào bị `skip`, bộ fixture tại `.wrangler/local-readiness/accounts.json` và D1 phải có cấu hình tối thiểu sau:

### 3.1. Danh sách Tài khoản Kiểm thử (Accounts)
1. `local-admin`:
   - Role: `system_admin`
   - Email: `admin@loopicafe.test`
   - Store: `store-loopi-nguyen-trai`
2. `local-owner`:
   - Role: `owner`
   - Email: `owner@loopicafe.test`
   - Store: `store-loopi-nguyen-trai`
3. `local-manager`:
   - Role: `manager`
   - Email: `manager@loopicafe.test`
   - Store: `store-loopi-nguyen-trai`
4. `local-lead`:
   - Role: `team_lead`
   - Email: `lead@loopicafe.test`
   - Store: `store-loopi-nguyen-trai`
5. `local-staff-a`:
   - Role: `employee`
   - Email: `staff.a@loopicafe.test`
   - Store: `store-loopi-nguyen-trai`
6. `local-staff-b`:
   - Role: `employee`
   - Email: `staff.b@loopicafe.test`
   - Store: `store-loopi-nguyen-trai`
7. `local-must-change-pw`:
   - Role: `employee`
   - Email: `mustchange@loopicafe.test`
   - Đặc điểm: `must_change_password = 1`
8. `local-suspended`:
   - Role: `employee`
   - Email: `suspended@loopicafe.test`
   - Đặc điểm: `status = 'suspended'`
9. `local-reset-pending`:
   - Role: `employee`
   - Email: `resetpending@loopicafe.test`
   - Đặc điểm: `password_reset_pending = 1`
10. `local-store2-owner`:
    - Role: `owner`
    - Email: `owner.store2@loopicafe.test`
    - Store: `store-loopi-quan-1` (Cửa hàng thứ hai phục vụ test cô lập)

### 3.2. Cửa hàng và Dữ liệu Cấu hình (Stores & Settings)
- **Store 1:** `id: 'store-loopi-nguyen-trai'`, Tên: "LoopiCafe Nguyễn Trãi", Timezone: `Asia/Ho_Chi_Minh`.
- **Store 2:** `id: 'store-loopi-quan-1'`, Tên: "LoopiCafe Quận 1 (Test Isolation)", Timezone: `Asia/Ho_Chi_Minh`.
- Quy tắc chấm công mẫu: 30m check-in sớm, 10m trễ, 90 ngày lưu trữ bằng chứng.
- Thực đơn mẫu: Cà phê sữa (30.000đ), Size L (+6.000đ), Trân châu (+10.000đ).
