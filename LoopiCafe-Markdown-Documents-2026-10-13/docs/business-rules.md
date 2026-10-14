# Quy tắc nghiệp vụ

Cập nhật: 2026-10-13. Quy tắc nền kế thừa phạm vi dự án; hiện trạng triển khai được tách tại [implementation-status](implementation-status.md).
Các quyết định `DEC-001..009` đã được chấp nhận tại [decision-register](decision-register.md). Quy tắc dưới đây là đích bắt buộc; không suy ra code hiện tại đã đáp ứng nếu chưa có evidence.

## Phạm vi và thuật ngữ

- BR-001: một cửa hàng; phân ca/chấm công là luồng cốt lõi. Checklist, sự cố, bàn giao hỗ trợ vận hành. Lương và đặt món có tiêu chí nghiệm thu riêng.
- BR-002: không thêm chuỗi, payment gateway, giao hàng, kho/kế toán chuyên sâu.
- Ca kế hoạch: thời gian được phân; phiên công: khoảng check-in/out; sự kiện gốc: bằng chứng ghi nhận; điều chỉnh: hiệu chỉnh có truy vết.
- Giờ ghi nhận, giờ được duyệt và giờ trả lương phải phân biệt. Không gọi phiên còn thiếu checkout là công hoàn tất.
- Quyền hành động theo [permissions](permissions.md); CUSTOMER là khách không tài khoản, không phải membership nhân sự.

## Vai trò và nguyên tắc phê duyệt

- ROLE-001: OWNER và MANAGER quản lý nghiệp vụ theo scope; `team_lead` là Trưởng ca vận hành, không phải MANAGER thu nhỏ; `system_admin` là tài khoản kỹ thuật không có quyền nghiệp vụ.
- ROLE-002: không actor nào tự duyệt request của mình. Employee/team lead do manager/owner khác duyệt; manager do owner khác duyệt.
- ROLE-003: sole OWNER chỉ được sửa công của chính mình qua luồng ngoại lệ có before/after, lý do, high-priority audit và báo cáo đối soát; không được giả là phê duyệt độc lập.
- ROLE-004: team lead chỉ xử lý swap của cấp dưới, checklist/bàn giao/sự cố theo ca; không duyệt nghỉ, sửa công, xem ảnh/GPS, chốt lương, quản lý tài khoản/cấu hình/đơn hàng.

## Lịch và yêu cầu

- SCH-001: bắt đầu < kết thúc, tối đa 24 giờ; hỗ trợ ca qua ngày; nhân viên phải thuộc phạm vi được cấp. Ngăn ca chồng nhau, kể cả ghi đồng thời.
- SCH-002: ca có `draft → published → completed/cancelled`. Draft chỉ OWNER/MANAGER thấy, không thông báo, không hiện cho nhân viên và không dùng để chấm công.
- SCH-003: publish phải kiểm tra active membership, overlap và revision. Tạo nhiều ca phải có kết quả rõ; không thông báo thành công toàn bộ nếu chỉ ghi một phần.
- SCH-004: sửa/hủy trực tiếp chỉ khi còn ít nhất 12 giờ trước ca và chưa có công, nghỉ duyệt hoặc kỳ khóa. Sau cut-off phải qua điều chỉnh có lý do, tác động, notification và audit.
- SCH-005: MVP không áp một số người tối thiểu chung; cảnh báo thiếu người không được tự biến thành hard rule chưa cấu hình.
- REQ-001: quyết định yêu cầu chỉ từ pending; lưu người duyệt/thời điểm và audit, tránh duyệt lặp.
- REQ-002: nghỉ một ca có liên kết hợp lệ, khi duyệt phải đánh dấu nghỉ được duyệt, loại khỏi vắng mặt và cảnh báo cần người thay; không tự chọn người thay.
- REQ-003: swap dùng `pending → approved_pending_apply → applied`; “Duyệt & áp dụng” phải nguyên tử cùng đổi người của hai ca, kiểm revision/overlap, notification và audit. Chưa `applied` thì UI không được nói lịch đã đổi.
- REQ-004: xin nghỉ chỉ theo toàn bộ một ca trong MVP. Requester được rút khi còn pending; sau quyết định/applied phải tạo yêu cầu hoặc điều chỉnh mới.
- REQ-005: correction được duyệt tạo bản ghi append-only, không sửa đè event gốc.

## Chấm công

- ATT-001: server là nguồn thời gian chính thức. Lưu UTC nhất quán, tính ngày/tháng theo Asia/Ho_Chi_Minh.
- ATT-002: sự kiện gốc bất biến; sửa công phải lưu effective time, lý do, actor, thời điểm, liên kết nguồn và revision.
- ATT-003: chặn phiên mở trùng và retry gây sự kiện trùng; phản hồi mất sau commit phải có cách truy vấn/retry cùng khóa.
- ATT-004: ảnh/location chỉ lấy sau thao tác chủ động và thông báo mục đích. Thiếu quyền thiết bị có giải trình; không giả lập bằng chứng.
- ATT-005: GPS chỉ cung cấp thông tin; không tự kết luận gian lận hoặc tự loại công chỉ vì khoảng cách/độ chính xác.
- ATT-006: dung sai muộn/sớm là 5 phút; ngoài ngưỡng tạo exception. Biên ghi nhận mặc định là check-in sớm 15 phút/check-out muộn 15 phút; phần vượt biên chưa được tính nếu chưa duyệt tăng ca.
- ATT-007: R2 thành công nhưng D1 thất bại cần cleanup/retry; trạng thái UI phải đúng kết quả lưu thực.
- ATT-008: tăng ca cần số phút, lý do, actor và audit. Không tự trừ nghỉ giữa ca; muốn loại thời gian phải có correction được duyệt.
- ATT-009: quên checkout tự đóng tại giờ kết thúc ca + 4 giờ với `MISSING_CHECKOUT`; giữ giờ ghi nhận nhưng giờ được duyệt/tính lương bằng 0 đến khi correction được duyệt.

## Checklist, sự cố, bàn giao

- OPS-001: checklist gồm `daily_routine` theo business date và `shift_routine` gắn shift. Checklist ca đêm đi theo shift, không tách tại 00:00.
- OPS-002: sự cố hiện hành: open → acknowledged → resolved → closed. Server kiểm tra chuyển trạng thái; update và audit nguyên tử. Mở lại/nhảy bước là thay đổi chính sách cần duyệt.
- OPS-003: bàn giao có tác giả, thời gian, summary, manager_attention và người/ca nhận. Người nhận phải acknowledge trước khi hoàn tất check-in; MANAGER/OWNER chỉ bypass bằng lý do và audit trong tình huống khẩn cấp/lỗi hệ thống.
- OPS-004: bảo toàn lịch sử vận hành; sửa/xóa cần chính sách và truy vết. Không đồng nhất lịch sử bất biến với lưu mọi dữ liệu cá nhân vĩnh viễn.
- OPS-005: checklist ca chưa hoàn thành phải hiện trước bàn giao và không được tự hoàn thành khi ca kết thúc.

## Công và lương

- PAY-001: tổng hợp lương giờ từ giờ được duyệt đã clip theo ca/tăng ca và làm tròn xuống block 15 phút, dùng đơn giá có hiệu lực, cộng/trừ điều chỉnh có lý do. Không tự thêm thuế, bảo hiểm hoặc hệ số luật định.
- PAY-002: cắt khoảng công tại ranh giới kỳ; không tính toàn bộ ca qua tháng vào cả hai tháng. Nhân viên thôi việc không mất công đã làm.
- PAY-003: khóa kỳ lưu snapshot/version, người khóa và thời điểm. Dữ liệu nhân viên thay đổi không được viết lại bản đã khóa.
- PAY-004: mở lại là hành động có quyền/audit; mỗi đoạn công dùng rate history có hiệu lực tại thời điểm phát sinh. Rate đổi giữa kỳ phải chia đoạn, không dùng giá hiện tại cho quá khứ.
- PAY-005: tổng lương cuối kỳ theo nhân viên làm tròn số học đến 1.000 VND, phần dư từ 500 VND làm tròn lên; không làm tròn tiền từng event.
- PAY-006: không chốt khi còn dữ liệu không đủ điều kiện. Legacy thiếu rate history phải được OWNER khôi phục có căn cứ/audit, không fallback im lặng.
- Xuất file phải kiểm tra quyền, chống formula injection và phản ánh đúng phạm vi/kỳ/version.

## Đặt món

- ORD-001: server tính giá từ món/options hợp lệ, lưu snapshot; không tin tổng tiền client.
- ORD-002: retry cùng khóa/cùng payload trả cùng kết quả; khóa cũ với payload khác phải conflict.
- ORD-003: quyền xem đơn khách dựa trên receipt secret khó đoán của một đơn; không tra lịch sử khách chỉ bằng điện thoại.
- ORD-004: luồng chính pending → accepted → preparing → ready → completed. Role nội bộ được cấp quyền có thể chuyển sang cancelled từ pending/accepted/preparing/ready; CUSTOMER không tự hủy sau khi gửi.
- ORD-005: completed nghĩa hoàn tất giao/nhận, không chứng minh tiền đã thu. Không gọi tổng giá trị đơn là doanh thu thực thu khi không có dữ liệu thanh toán.
- ORD-006: giá/món thay đổi trong giỏ phải xử lý conflict và thông tin xác nhận rõ; không ghi đè lịch sử đơn.
- ORD-007: hủy từ preparing/ready bắt buộc reason code `customer_abandoned`, `item_preparation_error` hoặc `store_incident`; ghi status history và đưa vào báo cáo hao hụt riêng, không hạch toán như doanh thu thực thu.

## Lưu trữ và phát hành

- RET-001: ảnh/GPS tối đa 90 ngày; hết hạn chặn đọc và xóa vật lý theo job idempotent, nhưng không xóa attendance event.
- RET-002: công/correction, payroll snapshot, audit, checklist execution, incident và handover lưu tối thiểu 3 năm theo policy append-only/truy vết.
- RET-003: sau 180 ngày, ẩn danh tên, số điện thoại và ghi chú PII của đơn; giữ số liệu không định danh theo thời hạn vận hành công bố.
- REL-001: pilot chỉ mở khi core E2E, integrity, Auth/RBAC, retention, mobile flow và backup/restore staging có evidence PASS tại đúng commit/môi trường.
- REL-002: release record phải có tải dự kiến, người trực, monitoring, rollback owner, RPO/RTO được chủ dự án chấp nhận; không dùng default giả.

## Ví dụ nghiệm thu

| ID | Tình huống | Kết quả cần bảo toàn |
|---|---|---|
| EX-01 | Hai request check-in cùng nhân viên | Không tạo hai phiên mở |
| EX-02 | Ca 31/07 23:00–01/08 01:00 giờ VN, toàn bộ được duyệt | Phân bổ 60 phút mỗi tháng |
| EX-03 | Duyệt swap nhưng chưa cập nhật lịch | Hiển thị chờ thao tác, lịch không được giả vờ đã đổi |
| EX-04 | Đổi tên/đơn giá sau khóa kỳ | Snapshot cũ không đổi |
| EX-05 | Người dùng sửa đồng hồ điện thoại | recorded time vẫn từ server |
| EX-06 | Hai người duyệt cùng yêu cầu | Một quyết định có hiệu lực, không nhân đôi side effects |

Các ví dụ là tiêu chí cần kiểm chứng, không phải kết quả test đã chạy.
