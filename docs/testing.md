# Chiến lược kiểm thử

Cập nhật: 2026-10-13. Stack giữ Node Test Runner, SQLite/D1 emulator và Playwright.

## Lệnh thực có

| Lệnh | Phạm vi |
|---|---|
| npm test | tests/*.test.mjs; xem từng suite để biết SQLite, mock hay source assertions |
| npm run typecheck | Generate Workers types + TypeScript |
| npm run lint | ESLint |
| npm run build | Vinext/Worker build qua local wrapper |
| npm run check | typecheck → lint → test → build |
| npm run test:e2e | Playwright riêng, không nằm trong check |

Không chạy mutation test trước khi xác minh local isolation/config. Môi trường theo [database operations](database-operations.md).
CI hiện có bước Playwright và seed-menu; điều này không chứng minh auth E2E đã chạy không skip. Lưu số pass/fail/skip theo suite.

## Các lớp bằng chứng

- Static/source: phát hiện pattern/boundary; không chứng minh DOM hoặc hành vi runtime.
- Unit: production policy với inputs/outputs và dependencies cô lập.
- Integration: application/route + schema thật; test guard, constraints, rollback và state.
- Emulator: migrations và workflow trên D1/Worker binding thực ở local.
- E2E: app qua browser, API thật trong môi trường test; mock camera/GPS có nhãn, auth đầy đủ có fixture thật.
- Thiết bị/vận hành: permission prompt, keyboard iOS/Android, backup/restore, scheduler và provider failure.

Mock hợp lệ tại external boundary; không viết lại thuật toán rồi coi là test implementation.
Đừng xóa source assertions hữu ích chỉ vì bổ sung E2E; đặt tên đúng loại kiểm chứng.

## Bộ kịch bản trọng yếu

| Miền | Kịch bản |
|---|---|
| Auth/quyền | session hết hạn, khóa nhân viên, resource khác store, self-approval, role target mới, system_admin denial, sole-owner correction audit, owner cuối cùng |
| Ca | draft không lộ/chấm công, publish, adjacent/overlap, ca đêm, stale revision, cut-off 12 giờ, hủy sau công/nghỉ/kỳ khóa |
| Yêu cầu | duyệt trùng, rút pending, nghỉ nguyên ca, swap atomic apply/rollback, correction append-only |
| Công | server time, ngưỡng 5/15 phút, overtime, auto-close +4 giờ, approved minutes=0 khi missing checkout, duplicate/retry/lost response, R2/D1 partial failure |
| Lương | floor block 15 phút, round tổng 1.000 VND, chia tháng VN, rate đổi giữa kỳ/overlap/missing legacy, reopen, correction race, snapshot/version/export |
| Vận hành | daily/shift checklist, ca đêm, checklist chỉ tính ca được giao và khóa mutation sau `shift.ends_at`, handover receiver/ack/bypass, incident transition/audit rollback |
| Đặt món | giả giá, stale menu, receipt isolation, customer cancel denial, preparing/ready reason code, spoilage report, simultaneous status |
| Retention | ảnh/GPS 90 ngày, event còn nguyên, order PII 180 ngày, operational history 3 năm, retry và restore reprocessing |
| UI | narrow viewport, bàn phím/focus, trạng thái async, stale response, không che CTA |
| Dữ liệu | fresh/upgrade migration bằng runner thật, ledger parity, restore và retention retry |

Core E2E cho pilot phải có hành trình draft/publish ca → nhân viên thấy ca → handover/checklist gate → check-in/out → ngoại lệ → người khác có quyền duyệt/correct → chốt lương; không chỉ login và đặt món.
Ca đêm cần kiểm tra checklist shift đi theo ca, chia tháng và business date Việt Nam.

## Báo cáo và gate

Ghi commit/dirty tree, môi trường, lệnh, exit code, test pass/fail/skip, artifact và giới hạn.
Không ấn định số 128 tests hoặc tỷ lệ coverage tùy ý làm Definition of Done.
Docs-only: kiểm tra liên kết, trạng thái, tính nhất quán và diff; không bắt buộc chạy app suite nếu không thay app.
Code: targeted regression phù hợp và check trước bàn giao; thay UI/auth/data cần lớp tích hợp/E2E liên quan.
Test bị skip hoặc chưa chạy là NOT_RUN/BLOCKED; không tính PASS. Tiêu chí phát hành theo [acceptance](acceptance-matrix.md).
