# Sổ quyết định nghiệp vụ

Cập nhật: 2026-10-26. Chủ quyết định: chủ dự án. Các quyết định `DEC-001..009` đã được chấp nhận ngày 2026-10-13 từ tài liệu “Đề xuất phương án xử lý cho 11 nghiệp vụ chưa chốt”.

`ACCEPTED` nghĩa là chính sách sản phẩm đã chốt và là căn cứ cho thay đổi mới. Trạng thái này **không** có nghĩa code, schema, migration, UI hoặc test hiện tại đã triển khai xong. Chênh lệch được theo dõi tại [implementation status](implementation-status.md) và chỉ được coi là hoàn thành khi đạt [acceptance matrix](acceptance-matrix.md).

## Tóm tắt

| ID | Trạng thái | Quyết định đã chốt |
|---|---|---|
| DEC-001 | ACCEPTED | Không tự duyệt; role `team_lead` là Trưởng ca vận hành; `system_admin` không có quyền nghiệp vụ |
| DEC-002 | ACCEPTED | Lịch có `draft → published`; cut-off 12 giờ; không ép số người tối thiểu ở MVP |
| DEC-003 | ACCEPTED | Đổi ca áp dụng nguyên tử qua `approved_pending_apply → applied`; nghỉ theo nguyên ca; cho rút đơn pending |
| DEC-004 | ACCEPTED | Dung sai 5 phút; biên làm ngoài ca 15 phút; quên checkout tự đóng sau 4 giờ và chưa tính công |
| DEC-005 | ACCEPTED | Checklist gồm daily/shift routine; bàn giao có người/ca nhận và xác nhận trước check-in |
| DEC-006 | ACCEPTED | Công làm tròn xuống block 15 phút; tổng lương làm tròn nghìn VND; bắt buộc lịch sử đơn giá |
| DEC-007 | ACCEPTED | Có thể hủy đơn `preparing/ready` bởi role nội bộ được cấp quyền, lý do chuẩn hóa, ghi nhận hao hụt |
| DEC-008 | ACCEPTED | Ảnh/GPS 90 ngày; công/lương/audit/vận hành 3 năm; PII đơn hàng ẩn danh sau 180 ngày |
| DEC-009 | ACCEPTED | Pilot phải qua E2E lõi, kiểm tra integrity và một backup/restore drill trên staging |
| DEC-010 | ACCEPTED | Tách quản trị hệ thống khỏi vận hành; System Admin quản lý tài khoản và RBAC |
| DEC-011 | ACCEPTED | Vai trò tùy chỉnh theo cửa hàng, catalog quyền và phân công thay ca |
| DEC-015 | ACCEPTED | Mỗi cửa hàng chỉ có một System Admin và một Owner; lỗi truy cập được khôi phục trên đúng tài khoản hiện có |
| DEC-017 | ACCEPTED | OWNER không phải nhập lý do khi sửa hồ sơ thường hoặc đổi trạng thái nhân viên cấp dưới; giữ lý do cho thay đổi nhạy cảm |

## DEC-001 — Tự duyệt và phạm vi role

**Trạng thái:** ACCEPTED — 2026-10-13.

### Tự duyệt

- Không actor nào được duyệt yêu cầu do chính mình tạo. API/application phải chặn theo actor identity, không chỉ ẩn nút.
- Yêu cầu của `employee` hoặc `team_lead` do `manager` hoặc `owner` khác người yêu cầu duyệt.
- Yêu cầu của `manager` chỉ do `owner` khác người yêu cầu duyệt.
- Nếu có từ hai OWNER hoạt động, yêu cầu hoặc sửa công của OWNER phải do OWNER khác xử lý.
- OWNER duy nhất không được tự duyệt một request thông thường. Khi cần sửa công của chính mình, dùng luồng `sole_owner_self_correction`: bắt buộc lý do, dữ liệu trước/sau, bằng chứng liên quan, cờ high-priority và audit append-only. Luồng này không được giả là phê duyệt độc lập và phải xuất hiện trong báo cáo đối soát.
- Chốt lương vẫn cho `owner` và `manager`; mở lại kỳ đã chốt chỉ cho `owner`. Người chốt không được làm mất dấu các self-correction của chính mình.

### `team_lead`

`team_lead` được chuẩn hóa thành **Trưởng ca vận hành**, không phải MANAGER thu nhỏ.

- Được xem dữ liệu ca cần cho vận hành, xác nhận/checklist theo ca, tiếp nhận bàn giao và chuyển trạng thái sự cố.
- Được duyệt đề nghị đổi ca trong phạm vi nhân viên cấp dưới, nhưng thao tác áp dụng phải tuân DEC-003 và không được đổi ca của `manager`/`owner`.
- Không được duyệt nghỉ, sửa/duyệt công, xem ảnh/GPS bằng chứng, chốt/mở lương, quản lý tài khoản, cấu hình cửa hàng hoặc xử lý đơn hàng mặc định.

### `system_admin`

- Là tài khoản kỹ thuật tách khỏi membership nghiệp vụ thông thường.
- Chỉ phục vụ cấu hình hạ tầng, migration có kiểm soát và log kỹ thuật theo runbook.
- Không được tạo/sửa/hủy ca, chấm công, duyệt yêu cầu, sửa công, xem ảnh/GPS nghiệp vụ, chốt lương, sửa menu hoặc xử lý đơn.
- Không được dùng `system_admin` như bypass store scope. Mọi thao tác break-glass nếu sau này có phải là quyết định mới, thời hạn ngắn và audit độc lập.

## DEC-002 — Vòng đời lịch và cut-off

**Trạng thái:** ACCEPTED — 2026-10-13.

- Ca có vòng đời tối thiểu `draft → published → completed/cancelled`.
- `draft` chỉ OWNER/MANAGER thấy; không gửi thông báo, không hiện trong lịch cá nhân và không dùng để chấm công.
- Publish phải kiểm tra nhân viên active, thời gian hợp lệ, ca chồng lấn và revision; sau thành công mới gửi thông báo.
- OWNER/MANAGER được sửa/hủy trực tiếp khi còn ít nhất 12 giờ trước giờ bắt đầu và ca chưa có công, nghỉ đã duyệt hoặc kỳ lương khóa.
- Trong vòng 12 giờ hoặc sau khi có dữ liệu liên quan, không xóa/hủy trực tiếp. Phải dùng luồng điều chỉnh có lý do, đánh giá tác động, notification và audit.
- MVP không áp một con số nhân sự tối thiểu chung cho mọi ca. UI có thể cảnh báo thiếu người theo lịch, nhưng không được tự bịa quy tắc staffing hoặc chặn publish vì một ngưỡng chưa cấu hình.

## DEC-003 — Đổi ca, nghỉ và rút yêu cầu

**Trạng thái:** ACCEPTED — 2026-10-13.

- Một request đổi ca phải tham chiếu hai ca `published`, hai nhân viên active và cùng store; cả hai ca phải còn đủ điều kiện thay đổi.
- Vòng đời áp dụng: `pending → approved_pending_apply → applied`; từ `pending` có thể sang `rejected` hoặc `withdrawn`.
- Nút “Duyệt & áp dụng” phải chạy một transaction/guard nguyên tử: kiểm tra revision và overlap, đổi người của hai ca, ghi request `applied`, notification và audit. Nếu bất kỳ bước nào thất bại, không phần nào được báo thành công.
- `approved_pending_apply` chỉ có nghĩa đã chấp thuận nguyên tắc; UI không được hiển thị lịch đã đổi cho đến khi trạng thái `applied` và shifts thực sự thay đổi.
- Xin nghỉ MVP áp dụng cho toàn bộ một ca, không hỗ trợ nghỉ một phần ca. Nghỉ được duyệt đánh dấu đúng shift, loại khỏi vắng mặt và cảnh báo cần bố trí người thay; hệ thống không tự chọn người thay.
- Người tạo được rút request khi còn `pending`. Sau `approved_pending_apply`, `applied`, `approved` hoặc `rejected`, không rút ngược; phải tạo yêu cầu/điều chỉnh mới có truy vết.
- Correction request không tự sửa event gốc; khi được duyệt phải tạo correction append-only theo ATT-002.

## DEC-004 — Biên chấm công

**Trạng thái:** ACCEPTED — 2026-10-13.

- Dung sai đi trễ và về sớm là 5 phút. Ngoài ngưỡng, tạo attendance exception để người có quyền xem xét; không tự kết luận gian lận.
- Check-in sớm tối đa 15 phút và checkout muộn tối đa 15 phút có thể ghi nhận trong biên ca. Phần vượt biên mặc định không được tính vào giờ được duyệt nếu chưa có “Duyệt tăng ca”.
- Tăng ca phải có actor, lý do, số phút được duyệt, liên kết ca/phiên công và audit; không suy ra từ thời gian thiết bị.
- Không tự trừ nghỉ giữa ca trong MVP. Nếu cần loại thời gian nghỉ, dùng correction được duyệt có khoảng thời gian và lý do; thay đổi sang break tự động là quyết định mới.
- Phiên chưa checkout được auto-close tại `shift.ends_at + 4 giờ`, gắn `MISSING_CHECKOUT`, giữ giờ ghi nhận nhưng đặt giờ được duyệt/tính lương bằng 0 cho đến khi correction được duyệt.
- Ca kế hoạch dài tối đa 24 giờ; mọi ngày/kỳ tính theo `Asia/Ho_Chi_Minh`, timestamp lưu UTC.

## DEC-005 — Checklist và bàn giao theo ca

**Trạng thái:** ACCEPTED — 2026-10-13.

- Checklist có hai loại: `daily_routine` cho việc chung theo business date và `shift_routine` gắn một shift cụ thể.
- `shift_routine` phải có shift, người/role chịu trách nhiệm và trạng thái thực hiện. Chỉ thành viên ca, Trưởng ca vận hành, MANAGER hoặc OWNER có quyền phù hợp mới được cập nhật.
- Checklist ca chưa hoàn thành phải được hiển thị trước khi bàn giao; không được tự đánh dấu hoàn thành vì ca kết thúc. Sau `shift.ends_at`, checklist ca chỉ còn trong lịch sử và mọi thao tác tạo mới/đánh dấu xong/mở lại cho ca đó phải bị server từ chối.
- Bàn giao phải tham chiếu người nhận (`receiver_employee_id`) hoặc ca kế tiếp (`next_shift_id`), lưu người gửi, thời gian, summary và cờ manager attention.
- Người/ca nhận phải `acknowledge` trước khi hoàn tất check-in ca mới. Nếu thiếu người nhận, lỗi hệ thống hoặc tình huống khẩn cấp, MANAGER/OWNER có thể bypass bằng lý do bắt buộc và audit; không được làm mất sự kiện chấm công đã ghi nhận.
- Ngày của checklist daily dùng business date Việt Nam; checklist ca đêm đi theo shift đã gắn, không tách đôi chỉ vì qua 00:00.

## DEC-006 — Làm tròn và lịch sử đơn giá

**Trạng thái:** ACCEPTED — 2026-10-13.

- Sau khi clip theo khung ca và cộng phần tăng ca đã duyệt, thời lượng được tính lương làm tròn **xuống** theo block 15 phút: 0–14 phút = 0; 15–29 = 15; 30–44 = 30; 45–59 = 45.
- Không làm tròn từng event tiền riêng lẻ. Tiền nội bộ lưu integer VND; tổng lương cuối cùng của một nhân viên trong kỳ được làm tròn số học đến 1.000 VND, phần dư từ 500 VND làm tròn lên.
- Bắt buộc có lịch sử đơn giá hiệu lực, tối thiểu gồm employee, compensation type/rate, `effective_from`, `effective_to`, actor và audit. Khoảng hiệu lực của cùng loại rate không được chồng nhau.
- Mỗi đoạn công dùng rate có hiệu lực tại thời điểm đoạn đó phát sinh; đổi rate giữa kỳ phải chia đoạn, không áp giá hiện tại cho toàn bộ quá khứ.
- Kỳ đã khóa dùng snapshot/version và không tính lại theo rate history mới.
- Dữ liệu legacy thiếu rate lịch sử phải chặn finalize cho hàng bị ảnh hưởng cho đến khi OWNER ghi nhận rate khôi phục có căn cứ và audit; không tự fallback về rate hiện tại.

## DEC-007 — Hủy đơn đã pha và hao hụt

**Trạng thái:** ACCEPTED — 2026-10-13.

- CUSTOMER không có quyền tự hủy đơn sau khi gửi. Mọi hủy do role nội bộ được cấp quyền xử lý đơn thực hiện; mặc định MVP là OWNER/MANAGER, STAFF không tự có quyền này.
- Cho phép hủy từ `pending`, `accepted`, `preparing` và `ready` trước `completed`.
- Hủy từ `preparing` hoặc `ready` bắt buộc reason code: `customer_abandoned`, `item_preparation_error` hoặc `store_incident`, kèm ghi chú khi cần.
- Hủy phải ghi actor, trạng thái trước, reason code, note, timestamp và order status history; dùng expected status/revision để chống ghi đè.
- Đơn hủy sau khi bắt đầu pha được đưa vào báo cáo hao hụt riêng. Không trừ/ghi như doanh thu thực thu và không gọi tổng order value là doanh thu khi chưa có dữ liệu thanh toán.

## DEC-008 — Retention và ẩn danh hóa

**Trạng thái:** ACCEPTED — 2026-10-13.

- Ảnh chấm công và tọa độ GPS: tối đa 90 ngày. Hết hạn phải chặn đọc ngay; scheduler xóa object R2 và dữ liệu vị trí vật lý, giữ event công và metadata tối thiểu cần cho audit/retry.
- Attendance events/sessions/corrections, payroll period/entry snapshot và audit log nghiệp vụ: tối thiểu 3 năm, append-only theo khả năng của loại dữ liệu.
- Checklist execution, incident và handover: tối thiểu 3 năm để truy vết vận hành; sửa/xóa phải theo policy và audit, không log PII thừa.
- Đơn hàng: sau 180 ngày phải ẩn danh hóa tên, số điện thoại và ghi chú có PII; giữ số liệu món/giá/trạng thái không định danh phục vụ thống kê trong thời hạn vận hành đã công bố.
- Job retention phải idempotent, batch hữu hạn, có retry/remaining/failure metrics và không xóa event công khi R2 lỗi.
- Backup không được dùng để né retention. Khi restore để xử lý sự cố, phải chạy lại job expiry/anonymization trước khi mở quyền truy cập thông thường.

## DEC-009 — Cổng pilot/release

**Trạng thái:** ACCEPTED — 2026-10-13.

Một bản build xanh không đủ điều kiện pilot. Trước khi dùng dữ liệu thật, release record phải đạt đủ:

1. **Core E2E:** tạo/publish ca → nhân viên thấy ca → check-in/out → tạo ngoại lệ → người khác có quyền duyệt/correct → chốt bảng lương; chạy trên staging với fixture không chứa PII thật.
2. **Integrity:** kiểm tra overlap/race, ca qua nửa đêm, ca qua tháng, 15-minute rounding, rate history, locked snapshot, idempotency và store/resource isolation.
3. **Backup/restore drill:** ít nhất một lần restore D1 và đối chiếu metadata/object R2 trên staging theo runbook, có biên bản và reviewer.
4. **Security/retention:** real Auth/RBAC E2E, last-owner guard, receipt isolation, private R2 expiry và retention/anonymization drill đạt PASS.
5. **UI thiết yếu:** hành trình STAFF và quản lý chạy được ở 320–390 px; keyboard/focus/error/retry/permission-denied không chặn tác vụ.
6. **Vận hành:** release record ghi tải pilot dự kiến, người trực, rollback owner, monitoring, RPO và RTO được chủ dự án chấp nhận. Các giá trị này thuộc từng môi trường pilot, không được agent tự điền bằng default giả.

Chỉ các hàng acceptance thuộc phạm vi phát hành có evidence PASS tại đúng commit/môi trường mới được mở pilot. Bất kỳ release blocker bảo mật/toàn vẹn dữ liệu nào còn mở đều chặn phát hành; waiver phải có OWNER chấp thuận, lý do và thời hạn.

## DEC-010 — Tách quản trị hệ thống và RBAC cố định

**Trạng thái:** ACCEPTED — 2026-10-14. **Phần vai trò cố định được mở rộng và thay thế bởi DEC-011.**

- Giữ năm role cố định: `system_admin`, `owner`, `manager`, `team_lead`, `employee`; một tài khoản có một role trong một cửa hàng ở v1.
- `system_admin` quản trị danh tính đăng nhập, bộ quyền theo role và audit quản trị; không kế thừa quyền OWNER và không được đọc/thao tác công, lương, ảnh/GPS, menu, đơn hoặc cấu hình nghiệp vụ.
- OWNER/MANAGER quản lý hồ sơ công việc và lương theo scope nhưng không tạo, khóa, reset hoặc đổi role tài khoản đăng nhập.
- OWNER có bộ quyền nghiệp vụ cố định. Chỉ bộ quyền MANAGER và `team_lead` được cấu hình từ catalog trong code; không wildcard, custom role hoặc override theo người.
- Permission không thay thế same-store, cấp bậc, self-approval, trạng thái/revision, khóa kỳ lương hoặc thời hạn bằng chứng.
- Thao tác admin lên OWNER cần xác thực lại trong 5 phút, lý do, audit ưu tiên cao và thông báo cho OWNER active. Không được khóa/hạ role OWNER active cuối cùng; không sửa admin hoặc tự sửa quyền qua API thường.
- Thay đổi quyền dùng revision và ghi nguyên tử; request mới thấy quyền mới không cần đăng nhập lại. Thiếu/lỗi tải bộ quyền phải fail closed.

**Tác động:** thêm `role_permission_sets`, `role_permissions`, `employees.access_revision`, nhật ký thao tác account; tách `/api/admin/accounts` khỏi `/api/team`; thêm khu vực `/app/admin`. Migration triển khai trước ứng dụng, không tự chạy production. Rollback về bản cũ là thay đổi bảo mật vì có thể trả quyền quản trị đăng nhập cho OWNER.

## DEC-011 — Vai trò tùy chỉnh theo cửa hàng và phân công thay ca

**Trạng thái:** ACCEPTED — 2026-10-14. **Thay thế DEC-010 ở phần vai trò cố định; bổ sung chính sách phân công thay ca cho DEC-003.**

### 1. Vai trò tùy chỉnh (Custom Roles)

- System Admin được quyền tạo, đặt tên, mô tả và cấu hình quyền cho các vai trò tùy chỉnh theo từng cửa hàng (`custom_roles`).
- Vai trò mới bắt đầu với 0 quyền nghiệp vụ (zero permissions by default). Quyền được chọn từ danh mục quyền nghiệp vụ chuẩn (`permissionCatalog`); mọi quyền chọn phải thỏa mãn quyền phụ thuộc (`dependsOn`). Không hỗ trợ wildcard (`*`) hoặc tự động cấp toàn quyền.
- Một tài khoản nhân sự có đúng một vai trò tại một thời điểm (vai trò hệ thống hoặc vai trò tùy chỉnh qua `role_id`). Không hỗ trợ ghi đè quyền riêng lẻ theo từng người.
- Giữ nguyên các vai trò hệ thống: `system_admin`, `owner`, `manager`, `team_lead`, `employee`.
- Giới hạn bất khả xâm phạm của Owner và System Admin:
  - Vai trò tùy chỉnh không thể tạo bản sao hoặc giả mạo các đặc quyền của Owner hoặc System Admin.
  - Quản trị tài khoản, phân quyền hệ thống, bảo vệ Owner active cuối cùng (`last-owner guard`), và luồng ngoại lệ Owner tự sửa công (`sole_owner_self_correction`) không nằm trong catalog có thể cấp cho vai trò tùy chỉnh.
- Phạm vi phê duyệt của vai trò tùy chỉnh:
  - Nhân sự mang vai trò tùy chỉnh được cấp quyền tương ứng (ví dụ `requests.leave.review`, `requests.correction.review`, `attendance.review`) có quyền xem xét và phê duyệt các nhân sự khác cùng cửa hàng, bao gồm cả đồng cấp (peer approval).
  - Nghiêm cấm tự duyệt chính mình (`assertNotSelfApproval`): actor không thể là người tạo yêu cầu hoặc người được hưởng lợi trực tiếp.
  - Nghiêm cấm duyệt yêu cầu của Chủ quán (`owner`) hoặc Quản trị viên (`system_admin`).
- Vòng đời vai trò tùy chỉnh:
  - Hỗ trợ tạo, sửa tên/mô tả, sửa tập quyền và lưu trữ (`status: 'archived'`).
  - Chặn lưu trữ vai trò khi còn tài khoản nhân sự đang được gán vai trò đó; quản trị viên bắt buộc phải chuyển các tài khoản sang vai trò khác trước.
  - Thiếu vai trò, vai trò bị lưu trữ hoặc lỗi nạp quyền phải fail-closed (từ chối toàn bộ quyền nghiệp vụ).
  - Mọi thao tác quản trị vai trò có `revision`, mã thao tác (`idempotencyKey`) và nhật ký kiểm toán (`audit_events`).
  - Thay đổi quyền có hiệu lực ngay từ request tiếp theo; UI tự động nạp lại quyền khi đổi trang hoặc khi nhận mã lỗi 403.

### 2. Chính sách phân công thay ca (Cover Shifts)

- Sau khi đơn xin nghỉ nguyên ca được duyệt theo DEC-003, ca làm việc được đánh dấu `approved_leave_request_id` và giữ nguyên lịch sử. Trạng thái nghỉ có hiệu lực tức thì, không phụ thuộc vào việc đã tìm được người thay hay chưa.
- Chủ quán hoặc nhân sự có quyền tạo và xuất bản ca (`shifts.create` & `shifts.publish`) có thể trực tiếp chỉ định người làm thay (cover shift) cho ca đã nghỉ mà không cần nhân viên nghỉ hoặc nhân viên thay xác nhận lại.
- Tạo ca thay mới liên kết với ca gốc thông qua `cover_for_shift_id`. Không sửa đổi chủ sở hữu ban đầu hoặc gỡ dấu nghỉ trên ca gốc.
- Mỗi ca nghỉ chỉ có tối đa một ca thay còn hiệu lực (`status <> 'cancelled'`) tại một thời điểm. Việc phân công, liên kết, audit và thông báo được ghi trong cùng một giao dịch để chống race condition.
- Trạng thái hiển thị trên lịch: “Chưa bố trí” hoặc “Đã bố trí — [Tên người thay]”. Hủy ca thay hợp lệ sẽ tự động đưa ca gốc về trạng thái “Chưa bố trí”.
- Không cho phép tự phân công thay ca cho ca đã kết thúc hoặc ca nằm trong kỳ lương đã khóa. Phân công khi ca đã bắt đầu yêu cầu lý do bắt buộc và audit, không tạo công lùi giờ.

## DEC-015 — Một Admin, một Owner và khôi phục tài khoản đặc quyền

**Trạng thái:** ACCEPTED — 2026-10-25. **Bổ sung DEC-010 ở phần quản trị tài khoản đặc quyền.**

- Trong mỗi cửa hàng MVP chỉ tồn tại một membership `system_admin` và một membership `owner`, không phụ thuộc trạng thái kích hoạt. API/UI thông thường không được tạo Admin thứ hai; chỉ System Admin được gán Owner khi cửa hàng chưa có Owner.
- Owner không được tự tạo hoặc nâng thêm Owner. Ghi tạo/nâng Owner phải có điều kiện nguyên tử để hai request đồng thời vẫn chỉ có một request thành công.
- Owner duy nhất không được hạ vai trò, tạm khóa hoặc offboard. Được phép hoàn tất kích hoạt, gửi lại lời mời và đặt lại mật khẩu trên chính hồ sơ hiện có.
- Khi Supabase Auth và membership D1 lệch định danh, phải đối chiếu email đã xác minh, sửa liên kết trên cùng hồ sơ và ghi audit/change record; không tạo tài khoản đặc quyền thay thế để che lỗi.
- Recovery Admin dùng runbook server-side cùng service role, xác minh môi trường/store/backup và change record độc lập. Không mở endpoint công khai để tạo hoặc sửa `system_admin`.
- Dữ liệu legacy có nhiều Owner phải được giảm về một Owner theo thao tác có lý do và audit, đồng thời luôn giữ ít nhất một Owner active trong quá trình xử lý.

**Lý do:** giảm bề mặt đặc quyền và tránh mất kiểm soát khi tài khoản kích hoạt lỗi. **Tác động:** cập nhật policy server, ghi có điều kiện, UI quản trị, test race/recovery và runbook; không cần migration schema. Triển khai production vẫn cần kiểm tra backup và smoke test Auth/D1 tại đúng môi trường.

## DEC-016 — Storage private trên Supabase Free và production trên main

**Trạng thái:** ACCEPTED — 2026-10-25. **Người quyết định:** chủ dự án trong phiên làm việc; chấp nhận đề xuất chuyển storage và chỉ dùng `main` cho production. Thay quyết định nền R2 private ở phạm vi lưu bằng chứng.

- Chuyển upload/download/delete ảnh bằng chứng sang Supabase Storage private, cùng project Auth. Không yêu cầu đăng ký R2 có khả năng tính phí vượt quota.
- Duy trì Workers Free, D1 Free, Supabase Free; production branch duy nhất `main`. Chấp nhận giới hạn quota/khả năng gián đoạn của Free, không tự bật gói Paid. Không suy từ sáu tài khoản thành bảo đảm dung lượng/CPU đủ hoặc miễn phí vĩnh viễn.
- Giữ quyền `attendance.evidence.read`, resource scope, audit, hash/bytes đóng dấu server, hạn đọc tối đa 90 ngày, xóa vật lý idempotent/retry và event công bất biến. Service-role key chỉ ở server; không có quyền Storage trực tiếp cho browser hoặc public/signed URL.
- Không đổi schema D1. Nếu có object R2 thật, phải kiểm kê/chuyển và đối chiếu key/bytes/hash trước rollout; không tự xóa dữ liệu R2. Local dùng Supabase Storage loopback với bucket private được provision cô lập.
- Tác động: adapter storage, runtime binding, local config, test HTTP/SDK và cleanup, build production riêng. Triển khai/provider thật và migration remote cần evidence riêng theo release gate; đồng bộ source không chứng minh đã deploy.
- Hướng dẫn và giới hạn domain/email/backup: [triển khai Free](free-production-deployment.md).

## DEC-017 — Giảm nhập lý do cho thao tác Owner thông thường

**Trạng thái:** ACCEPTED — 2026-10-26. **Người quyết định:** chủ dự án trong phiên làm việc. Bổ sung DEC-010 và DEC-015 ở phạm vi hồ sơ nhân sự cấp dưới; không nới guard tài khoản Owner.

- OWNER được cập nhật trực tiếp thông tin hồ sơ thông thường và trạng thái `active`, `suspended`, `offboarded` của nhân viên cấp dưới mà không bắt buộc nhập lý do.
- Các mutation này vẫn phải kiểm quyền server, target không phải `owner`/`system_admin`/chính mình, `updated_at` hoặc `access_revision`, xác nhận tác động khi khóa/nghỉ việc, audit actor + before/after và đồng bộ Auth khi có liên kết.
- Vẫn bắt buộc lý do khi đổi vai trò/quyền hoặc mức lương, cấp lại mật khẩu, thao tác lên OWNER, sửa/duyệt công, điều chỉnh lương, sửa ca cận giờ, bypass bàn giao, hủy đơn sau pha và các ngoại lệ khác đã được quyết định riêng.
- Trường lý do trong UI Nhân sự là tùy chọn mặc định, chuyển thành bắt buộc và giải thích tại chỗ khi thay đổi nhạy cảm.

**Lý do:** giảm ma sát cho công việc quản lý nhân sự hằng ngày nhưng vẫn bảo toàn dấu vết và guard cho thay đổi có tác động bảo mật, tài chính hoặc dữ liệu. **Tác động:** cập nhật UI/API/test/tài liệu; không đổi schema hoặc migration. Rollout vẫn cần kiểm chứng tích hợp Auth cho trạng thái tài khoản.

## DEC-018 — Mở rộng toàn quyền quản trị tài khoản, phân quyền RBAC, đổi email, nhiều Chủ quán và xóa tài khoản kèm dữ liệu cho System Admin

**Trạng thái:** ACCEPTED — 2026-10-26. **Người quyết định:** chủ dự án trong phiên làm việc (`/grill-me`). Thay thế phần giới hạn một Owner và guard của DEC-010/DEC-015 đối với `system_admin`, đồng thời mở rộng catalog RBAC.

- **Phạm vi System Admin:** `system_admin` vẫn hoạt động tách biệt tại khu vực Quản trị hệ thống (`/app/admin/*`), không trộn màn hình vận hành hằng ngày nhưng nắm toàn quyền đối với tài khoản và ma trận phân quyền của cửa hàng.
- **Nhiều Chủ quán & gỡ bỏ rào cản thao tác của System Admin:**
  - `system_admin` được phép tạo mới hoặc nâng cấp nhiều tài khoản `owner` trong cùng cửa hàng (bỏ giới hạn `owner_limit` một Owner đối với `system_admin`). Các tài khoản `owner` hiện hữu trong `/app/team` chỉ quản lý từ `manager` trở xuống.
  - Gỡ bỏ yêu cầu xác thực lại 5 phút (`reauthentication_required`), gỡ bỏ bắt buộc nhập lý do (`reason_required` trở thành tùy chọn) và gỡ bỏ rào cản chặn hạ quyền/khóa/xóa `owner` cuối cùng đối với `system_admin`.
- **Đổi địa chỉ email đăng nhập:**
  - Chỉ `system_admin` tại `/app/admin/accounts` được đổi email của bất kỳ tài khoản nào (kể cả `owner` và nhân viên).
  - Khi đổi email, hệ thống cập nhật ngay trên Supabase Auth (`email_confirm: true`) và cập nhật nguyên tử (cascade) địa chỉ email mới trên toàn bộ các bảng dữ liệu liên quan trong D1 (`employees`, `shifts`, `attendance_*`, `payroll_*`, `requests`, `handovers`, `incidents`, `notifications`, `employee_consents`, `employee_rate_history`).
- **Xóa vĩnh viễn tài khoản & dữ liệu kèm mã PIN bảo mật (4–6 ký tự):**
  - `system_admin` có thể thiết lập và đổi **mã PIN bảo mật (4–6 ký tự)** ngay tại `/app/admin/accounts` (lưu băm SHA-256 có salt).
  - Mọi thao tác xóa vĩnh viễn tài khoản (cả `owner` lẫn nhân viên) đều bắt buộc nhập đúng mã PIN bảo mật. Khi xác nhận, hệ thống xóa tài khoản khỏi Supabase Auth + D1 (`employees`) và xóa sạch toàn bộ dữ liệu gắn với tài khoản đó trong D1.
- **Mở khóa toàn bộ Catalog RBAC & Nhật ký quản trị:**
  - Mở khóa toàn bộ 25 quyền trong `permissionCatalog` cho tất cả vai trò hệ thống có thể cấu hình (`manager`, `team_lead`, `employee`) cũng như `custom_roles` tại `/app/admin/roles` (vẫn giữ kiểm tra phụ thuộc quyền `dependsOn`).
  - Toàn bộ thao tác của `system_admin` (tạo tài khoản, đổi vai trò/trạng thái, đổi email, cấp mật khẩu tạm, xóa tài khoản & dữ liệu, thiết lập mã PIN, cập nhật RBAC) đều được ghi vào `audit_events` và hiển thị tại `/app/admin/audit` (tuyệt đối không lộ giá trị mã PIN hoặc mật khẩu).

**Lý do:** trao quyền kiểm soát tối cao và linh hoạt cho Quản trị hệ thống khi vận hành thực tế (hỗ trợ đồng sáng lập/nhiều chủ quán, đổi email nhân sự, dọn dẹp triệt để tài khoản và dữ liệu thử nghiệm/nghỉ việc có bảo vệ bằng PIN). **Tác động:** cập nhật domain RBAC, application services, API `/api/admin/accounts` và `/api/admin/roles`, UI Admin, tài liệu và bộ kiểm thử tự động; giữ nguyên 21 migration và 36 bảng D1.

## Quyết định nền

Single-store MVP, stack hiện hữu, modular monolith, timezone Việt Nam, server authorization, Supabase Storage private (DEC-016 thay R2), Supabase Auth, không thanh toán online/giao hàng/kho chuyên sâu. Không cần xin lại các quyết định này.

## Quy tắc thay đổi quyết định

Mọi thay đổi cần ID; trạng thái `ACCEPTED` hoặc `SUPERSEDED`; nội dung cũ/mới; lý do; người quyết định; ngày; tác động dữ liệu/API/UI/test; migration/rollout; và quyết định thay thế. Không sửa âm thầm một con số hoặc enum trong tài liệu con.
