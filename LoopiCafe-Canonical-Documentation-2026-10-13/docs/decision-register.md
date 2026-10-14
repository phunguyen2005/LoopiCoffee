# Sổ quyết định nghiệp vụ

Cập nhật: 2026-10-13. Chủ quyết định: chủ dự án. Các quyết định `DEC-001..009` đã được chấp nhận ngày 2026-10-13 từ tài liệu “Đề xuất phương án xử lý cho 11 nghiệp vụ chưa chốt”.

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
- Checklist ca chưa hoàn thành phải được hiển thị trước khi bàn giao; không được tự đánh dấu hoàn thành vì ca kết thúc.
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

## Quyết định nền

Single-store MVP, stack hiện hữu, modular monolith, timezone Việt Nam, server authorization, R2 private, Supabase Auth, không thanh toán online/giao hàng/kho chuyên sâu. Không cần xin lại các quyết định này.

## Quy tắc thay đổi quyết định

Mọi thay đổi cần ID; trạng thái `ACCEPTED` hoặc `SUPERSEDED`; nội dung cũ/mới; lý do; người quyết định; ngày; tác động dữ liệu/API/UI/test; migration/rollout; và quyết định thay thế. Không sửa âm thầm một con số hoặc enum trong tài liệu con.
