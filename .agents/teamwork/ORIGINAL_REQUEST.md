# Original User Request

## Initial Request — 2026-10-13T16:18:55Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full team (multi-agent implementation across packages P00-P09)

Triển khai các quyết định nghiệp vụ đã chấp thuận (DEC-001..009) cho Hệ thống Quản lý LoopiCafe (kiến trúc modular monolith: React, Cloudflare Workers, D1, Drizzle, R2, Supabase Auth), hoàn thiện luồng từ lịch nháp, bàn giao ca, chấm công, duyệt độc lập, tính lương snapshot đến hủy đơn và lưu trữ/ẩn danh hóa dữ liệu.

Working directory: d:/College/Practice/loopicafe-management-system
Integrity mode: development

Tài liệu tham chiếu chuẩn:
- Quy tắc nghiệp vụ: docs/business-rules.md
- Sổ quyết định: docs/decision-register.md
- Phân quyền: docs/permissions.md
- Hiện trạng: docs/implementation-status.md
- Ma trận nghiệm thu: docs/acceptance-matrix.md
- Kế hoạch triển khai: docs/implementation-plan.md
- Vận hành cơ sở dữ liệu: docs/database-operations.md
- Quy tắc Agent: AGENTS.md

## Requirements

### R1. P00 — Baseline, Golden Cases & Test Fixtures
Xác lập baseline kiểm thử sạch trên môi trường cô lập, xác định các trường hợp mẫu (golden cases) cụ thể cho các điểm C01–C07, bổ sung fixture kiểm thử đa vai trò (employee A/B, team lead, manager, sole owner, multi-owner, system admin, các trạng thái offboarded/suspended, ca đêm/qua tháng, đổi đơn giá giữa kỳ).

### R2. P01 — Quyền, Chặn Tự Duyệt & Sole-Owner Self-Correction (DEC-001)
Chặn tự phê duyệt (self-approval) ở tầng máy chủ (API và domain logic) dựa trên danh tính thực tế của người thực hiện (`actor != target`). Thu hẹp phạm vi quyền của `team_lead` (chỉ phụ trách vận hành ca, không duyệt nghỉ/sửa công/chốt lương). Chặn `system_admin` khỏi mọi endpoint nghiệp vụ kinh doanh. Thiết lập luồng `sole_owner_self_correction` riêng biệt với audit cờ cao và ghi nhận lý do, diff trước/sau khi chỉ có một chủ quán duy nhất.

### R3. P02 — Vòng Đời Lịch Làm Việc, Cut-off & Điều Chỉnh Ca (DEC-002)
Triển khai trạng thái lịch `draft → published → completed/cancelled`. Ca nháp (`draft`) hoàn toàn ẩn với nhân viên và không tính vắng mặt. Áp dụng giới hạn cut-off 12 giờ trước ca làm: ngoài 12 giờ cho phép sửa/hủy trực tiếp; trong vòng 12 giờ bắt buộc luồng điều chỉnh có lý do và audit. Đảm bảo tính toán overlap và kiểm tra xung đột nguyên tử khi xuất bản.

### R4. P03 — Yêu Cầu Đổi Ca Nguyên Tử, Rút Đơn & Nghỉ Nguyên Ca (DEC-003)
Xử lý giao dịch đổi ca (shift swap) nguyên tử qua trạng thái `approved_pending_apply → applied`, cập nhật đồng thời cả hai ca/nhân viên mà không vi phạm database triggers hoặc gây partial apply. Hỗ trợ người tạo rút đơn (`withdraw`) khi đơn còn đang `pending`. Áp dụng đơn xin nghỉ theo nguyên ca.

### R5. P04 — Quy Chuẩn Chấm Công, Làm Ngoài Ca & Tự Đóng Ca Quên Checkout (DEC-004)
Tách biệt bản ghi thời gian thực tế bất biến khỏi thời gian được tính lương. Áp dụng dung sai 5 phút và biên làm ngoài ca 15 phút. Thiết lập tác vụ nền tự động đóng phiên chấm công quên checkout sau +4 giờ kể từ giờ kết thúc ca (mặc định giờ tính lương = 0 cho đến khi giải trình được duyệt). Xử lý rõ ràng các phiên chấm công phát sinh ngoài lịch.

### R6. P05 — Lịch Sử Đơn Giá Lương, Làm Tròn & Khóa Kỳ Lương (DEC-006)
Bổ sung bảng lịch sử đơn giá lương nhân viên `employee_rate_history` theo khoảng hiệu lực không chồng lấn. Thuật toán tính lương bóc tách theo từng khung đơn giá hiệu lực, làm tròn giờ công xuống block 15 phút, làm tròn tổng lương chi trả về 1.000 VND gần nhất. Lưu snapshot khóa kỳ lương bất biến kèm phiên bản chính sách và mã nguồn đơn giá.

### R7. P06 — Checklist Ca & Tiếp Nhận Bàn Giao Trước Khi Check-in (DEC-005)
Tách biệt danh mục kiểm tra định kỳ hàng ngày (daily routine) và theo từng ca cụ thể (shift routine) có khóa định danh riêng biệt (tránh xung đột ca đêm hoặc hai ca cùng ngày). Yêu cầu nhân viên nhận ca phải xác nhận biên bản bàn giao (handover acknowledgment) trước khi check-in, kèm cơ chế bypass có ghi nhận audit.

### R8. P07 — Hủy Đơn Hàng & Ghi Nhận Hao Hụt (DEC-007)
Cho phép các vai trò nội bộ được phân quyền hủy đơn hàng ở trạng thái `preparing` hoặc `ready` với danh mục mã lý do hủy (cancel reason code) chuẩn hóa. Ghi nhận dữ liệu hao hụt vào lịch sử đơn mà không làm sai lệch tổng tiền đơn gốc. Chặn nhân viên thông thường và khách hàng tự hủy đơn đang chuẩn bị.

### R9. P08 — Chu Kỳ Lưu Trữ & Ẩn Danh Hóa Dữ Liệu (DEC-008)
Tự động dọn dẹp ảnh xác thực và dữ liệu GPS sau 90 ngày (bảo toàn sự kiện chấm công). Tự động ẩn danh hóa thông tin định danh cá nhân (PII: tên, số điện thoại, ghi chú) trên đơn hàng sau 180 ngày. Đảm bảo dữ liệu chấm công, tính lương và nhật ký kiểm toán (audit logs) được lưu giữ tối thiểu 3 năm.

### R10. P09 — Kiểm Thử Tích Hợp Toàn Bộ Vai Trò & Nghiệm Thu (DEC-009)
Thực thi kiểm thử E2E đa vai trò (OWNER, MANAGER, TEAM_LEAD, STAFF, SYSTEM_ADMIN, CUSTOMER) bao quát toàn bộ luồng nghiệp vụ. Chạy kiểm thử nâng cấp migration D1/SQLite và diễn tập backup/restore trên môi trường staging cô lập, đáp ứng đầy đủ tiêu chí nghiệm thu ACC-01 đến ACC-13.

### R11. Ràng Buộc Kỹ Thuật & An Toàn Hạ Tầng
Tuyệt đối không chạy deploy production, không đẩy commit/push, không sửa đổi dữ liệu thật, không chạy migration trên môi trường production. Mọi thay đổi tuân thủ nghiêm ngặt kiến trúc Modular Monolith, Cloudflare D1/R2/Workers, Drizzle ORM và Node Test Runner theo AGENTS.md.

## Acceptance Criteria

### Phân quyền & Duyệt độc lập (ACC-04, ACC-09)
- [ ] Mọi API mutation từ chối tự phê duyệt (self-approval) dựa trên danh tính người thực hiện (`actor != target`), trả về lỗi 403 Forbidden và không ghi nhận audit thành công giả.
- [ ] `team_lead` bị chặn khi cố gắng duyệt đơn xin nghỉ, sửa công, duyệt công, xem GPS/ảnh hoặc chốt lương.
- [ ] `system_admin` bị chặn khỏi tất cả endpoint nghiệp vụ kinh doanh.
- [ ] Luồng `sole_owner_self_correction` chỉ khả dụng khi duy nhất 1 owner hoạt động, ghi nhận lý do, diff trước/sau và audit cờ cao.

### Lịch làm việc & Cut-off (ACC-01, ACC-02)
- [ ] Ca nháp (`draft`) không hiển thị cho nhân viên, không tính vào vắng mặt, không cho phép check-in.
- [ ] Xuất bản ca làm việc kiểm tra trạng thái active của nhân viên, không tạo ca chồng lấn (overlap trigger), và chỉ gửi thông báo sau khi lưu thành công.
- [ ] Thay đổi ca làm việc trong biên 12 giờ trước ca bắt buộc phải đi qua luồng điều chỉnh có lý do và audit.

### Đổi ca & Rút đơn (ACC-05)
- [ ] Giao dịch đổi ca cập nhật nguyên tử cả 2 ca và trạng thái request, rollback toàn bộ nếu có bất kỳ xung đột nào (không partial apply).
- [ ] Rút đơn pending thành công bởi người tạo; người duyệt không thể duyệt đơn đã bị rút.
- [ ] Yêu cầu nghỉ phép áp dụng trọn vẹn theo nguyên ca.

### Chấm công & Tự đóng ca (ACC-03, ACC-04)
- [ ] Dữ liệu thời gian chấm công gốc được giữ bất biến; thời gian tính lương tuân theo dung sai 5 phút và biên 15 phút.
- [ ] Phiên quên checkout tự động đóng sau +4 giờ kể từ khi hết ca dự kiến, giờ tính công trả = 0 cho đến khi được giải trình và phê duyệt.
- [ ] Phiên chấm công không có ca được xử lý rõ ràng không suy đoán `ends_at`.

### Lương & Snapshot kỳ lương (ACC-06)
- [ ] Đơn giá lương được quản lý theo lịch sử hiệu lực không chồng chéo; tính công chính xác theo đoạn rate khi thay đổi giữa kỳ.
- [ ] Làm tròn công xuống block 15 phút; làm tròn tổng tiền thực nhận về 1.000 VND gần nhất; không làm tròn non gây sai lệch.
- [ ] Snapshot lương lưu trữ phiên bản chính sách, nguồn rate và chi tiết phân đoạn; khóa kỳ lương ngăn chặn race condition khi chốt.

### Checklist & Bàn giao ca (ACC-07)
- [ ] Daily routine và shift routine có khóa định danh riêng biệt, không bị trùng lặp giữa các ca cùng ngày hoặc ca đêm.
- [ ] Nhân viên nhận ca phải xác nhận biên bản bàn giao trước khi check-in (hoặc có biên bản bypass có audit).

### Hủy đơn hàng (ACC-08)
- [ ] Hủy đơn ở trạng thái `preparing` hoặc `ready` bắt buộc phải có mã lý do từ danh mục chuẩn hóa.
- [ ] Dữ liệu hao hụt được ghi nhận vào lịch sử đơn hàng mà không làm biến đổi tổng tiền đơn gốc.

### Chu kỳ lưu trữ & Ẩn danh hóa (ACC-10, ACC-11)
- [ ] Ảnh chấm công và tọa độ GPS quá 90 ngày được xóa sạch khỏi R2/D1; sự kiện chấm công vẫn được bảo toàn.
- [ ] Thông tin định danh cá nhân (tên, số điện thoại, ghi chú) trên đơn hàng quá 180 ngày được ẩn danh hóa vĩnh viễn.
- [ ] Dữ liệu công, lương, audit được bảo tồn tối thiểu 3 năm.

### Kiểm thử & Toàn vẹn hệ thống (ACC-12, ACC-13)
- [ ] Toàn bộ bộ kiểm thử tự động (`npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run check`) vượt qua không có lỗi.
- [ ] Migration mới tương thích Cloudflare D1/SQLite, không phá vỡ trigger toàn vẹn dữ liệu hiện hữu.
- [ ] Diễn tập sao lưu và phục hồi (backup/restore drill) thành công trên môi trường thử nghiệm cô lập.
