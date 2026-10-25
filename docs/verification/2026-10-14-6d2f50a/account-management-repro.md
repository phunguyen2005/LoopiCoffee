# Bằng chứng tái hiện và kiểm tra luồng Quản trị tài khoản & Ca làm việc

- Thời điểm ghi nhận: 2026-10-14, Asia/Ho_Chi_Minh.
- Môi trường: Local dev (Windows, Wrangler/D1 local, Supabase CLI local tại `http://127.0.0.1:54321`, Inbucket test mailbox tại `http://127.0.0.1:54324`, Next app tại `http://127.0.0.1:4173`).
- Tài khoản theo vai trò:
  - System Admin: `admin@loopicafe.test`
  - Chủ quán (Owner): `owner@loopicafe.test`
  - Quản lý (Manager): `manager@loopicafe.test`
  - Trưởng ca (Team Lead): `lead@loopicafe.test`
  - Nhân viên (Employee): `staff.a@loopicafe.test`, `staff.b@loopicafe.test`

---

## 1. Tái hiện lỗi: Ba ô thống kê của System Admin tải mãi

### Hiện trạng trong code
Trong `components/app-shell.tsx`:
- Dữ liệu vận hành (`/api/dashboard`) chỉ được nạp khi `!isStaff && !isTechnicalAdmin`.
- Khi `user.role === 'system_admin'` (`isTechnicalAdmin = true`), `ownerMetrics` được giữ ở giá trị khởi tạo `null`.
- Khối hiển thị `mobile-quick-panel` kiểm tra `{isStaff ? (...) : (...)}`. Do `isTechnicalAdmin` không phải `isStaff`, nhánh `else` được render với các ô vận hành ("Đang trực quầy", "Cần duyệt", "Mở ca") và giá trị fallback là `"Đang tải…"`.
- Do không có request nào nạp dữ liệu cho `system_admin`, 3 ô này vĩnh viễn hiển thị "Đang tải…".

### Phương án sửa
- Khi `isTechnicalAdmin = true`, gọi API `/api/admin/summary`.
- Hiển thị 3 chỉ số quản trị hệ thống tương ứng:
  1. **Tài khoản hoạt động**: `accounts.active` -> liên kết đến `/app/admin/accounts`.
  2. **Chờ kích hoạt**: `accounts.invited` -> liên kết đến `/app/admin/accounts`.
  3. **Thao tác lỗi**: `failedOperations.count` -> liên kết đến `/app/admin/audit`.
- Cung cấp trạng thái loading/error/retry rõ ràng; không nạp dữ liệu vận hành hoặc công/checklist của quán.

---

## 2. Kiểm tra hai hành trình tạo tài khoản

### Hành trình A: Tạo bằng lời mời (Invitation Email)
- **Luồng thực thi**:
  1. System Admin gửi POST `/api/admin/accounts` với `{ email, displayName, role, activationMethod: "invite", idempotencyKey }`.
  2. Hệ thống kiểm tra `NEXT_PUBLIC_APP_URL`. Nếu thiếu, trả lỗi 503 `app_url_missing`.
  3. Gọi Supabase Auth Admin: `supabase.auth.admin.inviteUserByEmail`.
  4. Nếu Supabase Auth thành công: tạo dòng nhân sự `status = 'invited'` trong D1, ghi audit `account.created` và notification trong cùng transaction batch.
  5. Nếu Supabase Auth lỗi:
     - Rate limit (tần suất gửi quá nhanh / 429): trả mã lỗi `auth_rate_limit`.
     - Email đã tồn tại trong Auth (422 / already registered): trả mã lỗi `auth_conflict`.
     - Nhà cung cấp từ chối / lỗi mạng: trả mã lỗi `auth_provider_failed`.
- **Thực tế môi trường**:
  - Local Supabase chuyển hướng email đến Inbucket local port 54324. Thư kiểm thử nhận bình thường trong hộp thư test.
  - Cấu hình SMTP gửi ra Internet thật: chưa thiết lập; ghi rõ **“chưa xác minh”** đối với email thực tế ngoài Internet.

### Hành trình B: Tạo / Reset bằng mật khẩu tạm (Temporary Password)
- **Luồng thực thi**:
  1. System Admin gửi POST `/api/admin/accounts` (hoặc PATCH với `action: "reset_password"`) và `activationMethod: "temporary_password"`.
  2. Mật khẩu tạm (16 ký tự an toàn) được tạo ngẫu nhiên trên server.
  3. Gọi Supabase Auth Admin tạo user / cập nhật mật khẩu với `email_confirm: true`.
  4. D1 lưu thông tin nhân sự với cờ `must_change_password = 1`.
  5. API trả về `{ account, temporaryPassword }`.
- **Xử lý khi Retry / Mất phản hồi**:
  - Mật khẩu tạm không bao giờ được lưu dưới dạng bản rõ (plaintext) trong DB, log hoặc audit.
  - Khi request được gửi lại với cùng `idempotencyKey` sau khi đã hoàn tất, server phát hiện `status = 'completed'` và trả về `{ updated: true, replayed: true, passwordRetrievable: false }`.
  - UI hiển thị cảnh báo: Mật khẩu tạm một lần không thể khôi phục lại vì an toàn thông tin; cung cấp nút cấp lại mật khẩu tạm mới ngay trên giao diện nếu quản trị viên cần.
  - Sau khi nhận response thành công, UI hiển thị hộp thoại chuyên biệt (modal) chứa thông tin tài khoản, mật khẩu tạm, nút sao chép (kèm trạng thái phản hồi "Đã sao chép!") và nút đóng. Mật khẩu chỉ lưu trong React memory state trong phiên, không ghi localStorage/sessionStorage.

---

## 3. Phân tích lỗi Owner không hủy được ca còn ≥ 12 giờ

### Dữ liệu và điều kiện kiểm chứng
- Giờ bắt đầu ca: `starts_at` (UTC ISO string).
- Giờ server hiện tại: `nowMs = Date.now()` (UTC).
- Kiểm tra cut-off trong code (`manage-shifts.ts`):
  `const isWithin12Hours = existingShift.status === "published" && (shiftStartMs - nowMs < 12 * 60 * 60 * 1000);`
  -> Với ca còn `>= 12 giờ` (`shiftStartMs - nowMs >= 12h`), biểu thức là `false`, do đó **không** kích hoạt lỗi `cutoff_lock_active`.

### Nguyên nhân thực tế gây lỗi hủy ca
Khi cut-off không vi phạm, câu lệnh SQL UPDATE sau được thực thi:
```sql
UPDATE shifts SET status = 'cancelled', revision = revision + 1
WHERE id = ? AND store_id = ? AND revision = ?
  AND status IN ('draft', 'published')
  AND approved_leave_request_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM attendance_sessions a WHERE a.shift_id = shifts.id)
  AND NOT EXISTS (
    SELECT 1 FROM payroll_periods p
    WHERE p.store_id = shifts.store_id AND p.status IN ('finalized', 'paid')
      AND p.period_start < shifts.ends_at AND p.period_end > shifts.starts_at
  )
```
Nếu bất kỳ điều kiện nào sau đây bị vi phạm, `changes === 0`:
1. `revision !== expectedRevision`: Lệch phiên bản do người khác đã cập nhật ca hoặc thao tác đồng thời.
2. `approved_leave_request_id IS NOT NULL`: Ca đã có đơn xin nghỉ được phê duyệt.
3. Đã có phiên chấm công liên kết (`attendance_sessions`).
4. Ca rơi vào kỳ lương đã chốt (`finalized`) hoặc đã trả (`paid`).
5. Trạng thái ca không phải `draft` hoặc `published` (ví dụ ca đã bị hủy trước đó).

**Kết luận**: Code trước đây gộp toàn bộ các trường hợp `changes === 0` thành một thông báo chung: *"Ca vừa thay đổi, đã có chấm công/nghỉ được duyệt hoặc thuộc kỳ lương đã khóa."* Điều này khiến người dùng lầm tưởng bị lỗi cut-off. Giải pháp là phân tách tường minh từng nguyên nhân xung đột để trả về mã lỗi và thông điệp chính xác.
