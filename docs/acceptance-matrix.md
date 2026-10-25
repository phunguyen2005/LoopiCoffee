# Ma trận nghiệm thu

Cập nhật: 2026-10-14. Trạng thái ghi rõ lớp đã chạy; kết quả local không thay thế nghiệm thu provider staging hoặc pilot.
Kết quả cũ giữ tại [archive](archive/2026-10-13/docs/acceptance-matrix.md); không dùng để chứng nhận HEAD hiện tại.

| ID | Rule | Tiêu chí | Lớp kiểm chứng tối thiểu | Trạng thái |
|---|---|---|---|---|
| ACC-01 | SCH-001..005 | Draft không lộ/chấm công; publish đúng ca; không overlap; cut-off 12 giờ | Integration + browser | PASS (Integration) |
| ACC-02 | SCH-004 | Revision cũ, ca trong cut-off/có công/nghỉ/kỳ khóa bị chặn hoặc chuyển adjustment | D1 integration | PASS (Integration) |
| ACC-03 | ATT-001..009 | Check-in/out, server time, ngưỡng 5/15 phút, overtime, retry/lost response, auto-close +4 giờ | Integration + browser | PASS (Integration) |
| ACC-04 | ATT-002, ROLE-002..003 | Sửa công append-only, cấm self-approval, sole-owner audit, missing checkout chưa tính công | Integration + browser | PASS (Integration) |
| ACC-05 | REQ-001..005 | Nghỉ nguyên ca; rút pending; swap atomic apply/rollback; correction tạo kết quả thật | Integration + browser | PASS (Integration) |
| ACC-06 | PAY-001..006 | Floor 15 phút, round 1.000 VND, ca qua tháng, rate history/reopen, legacy block, snapshot | Integration + D1 | PASS (Integration) |
| ACC-07 | OPS-001..005 | Daily/shift checklist, ca đêm, handover receiver/ack/bypass, incident transitions | Integration + browser | PASS (Integration); NOT_RUN (browser) |
| ACC-08 | ORD-001..007 | Giá server, retry, receipt, customer cancel denial, ready cancel reason, spoilage, conflict | Integration + browser | PASS (Integration) |
| ACC-09 | Security, permissions | Role/resource denial, disabled account, owner cuối cùng | Real auth integration + E2E | PASS (Integration) |
| ACC-10 | RET-001..003, Security | Ảnh/GPS 90 ngày, order anonymize 180 ngày, history 3 năm, cleanup retry/restore không mất event | Integration + retention drill | PASS (Integration) |
| ACC-11 | Database | Fresh/upgrade migrations và restore đúng invariant | Emulator + restore drill | PASS (Integration) |
| ACC-12 | Design | Lịch/công trên mobile, focus, keyboard, CTA không bị che | Browser + device | NOT_RUN (Pilot gate) |
| ACC-13 | DEC-009 | Core E2E, integrity, restore drill, Auth/RBAC, mobile, tải/RPO/RTO/người trực/rollback | Operational review | NOT_RUN (Pilot gate) |
| ACC-14 | DEC-010 | Admin dashboard/accounts/roles/audit; OWNER/MANAGER mất account admin; account response không lộ lương | Integration + E2E | PASS (Local integration + E2E) |
| ACC-15 | DEC-010 | Last-owner, self-admin, forbidden grants, stale revision, simultaneous admin writes, revoke next request | Integration | PASS (Local integration) |
| ACC-16 | DEC-010 | Auth–D1 failure/retry, recent re-auth và owner notification/audit | Integration + provider staging | PARTIAL (Local integration; provider staging NOT_RUN) |


## Trạng thái và bằng chứng

NOT_RUN: chưa chạy tại baseline; PASS/FAIL: đã chạy; BLOCKED: không đủ điều kiện; WAIVED: ngoại lệ được chủ dự án chấp nhận có lý do/hạn.
Tách trạng thái từng lớp test; unit PASS không nâng cả hàng lên PASS nếu E2E chưa chạy.
Evidence: ID, commit, dirty diff nếu có, timestamp, env, actor role, dataset, command, expected/actual, pass/fail/skip, log/screenshot/trace đã loại secrets, reviewer.
Lưu dưới docs/verification/<date>-<commit>/ khi thực sự chạy; không tạo log giả.

Evidence DEC-010 local: [2026-10-14 — baseline 6d2f50a](verification/2026-10-14-6d2f50a/rbac-local.md).

## Fixture

Một quán chính, owner/manager/employee A/B; legacy team_lead/system_admin cho regression quyền; invited/suspended/offboarded/password-required.
Store thứ hai chỉ phục vụ kiểm thử scope, không phải tính năng chuỗi.
Có ca hôm nay/qua đêm/qua tháng, ngoại lệ, kỳ khóa, đơn/options, evidence hết hạn.
Dates tương đối ngày chạy; không dùng PII thật. Seed menu không đủ để chạy Auth E2E.

## Gate pilot

Các hành trình cốt lõi trong phạm vi phát hành phải PASS tại commit định phát hành; không có lỗi bảo mật/toàn vẹn dữ liệu nghiêm trọng chưa xử lý.
Các quyết định đã chốt phải được triển khai và có evidence; trạng thái ACCEPTED trong tài liệu không thay PASS. Không có claim production-ready chỉ từ build.
Ngoại lệ cần chủ dự án phê duyệt cụ thể; DOCS-only completion không tương đương pilot acceptance.
