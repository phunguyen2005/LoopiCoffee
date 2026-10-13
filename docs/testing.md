# Testing Strategy — LoopiCafe

**Stack kiểm thử:** Node Test Runner, SQLite/D1 emulator, Playwright. Không tuyên bố test pass nếu chưa chạy.

## Lệnh hiện có trong repository

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run check
npm run test:e2e
```

`npm run check` chạy type generation/checking, lint, test và production build. `npm run test:e2e` là bước Playwright riêng, không nằm trong `npm run check`; chỉ báo E2E đã pass khi lệnh này thực sự được chạy trên môi trường phù hợp.

## Test pyramid

- **Unit:** pure business rules (time, distance, wage calculations, status transitions, validation).
- **Integration:** use cases + D1 emulator, constraints, migrations, auth/authorization, R2 boundary (test doubles được phép trong test).
- **E2E:** Playwright trên môi trường test, theo role và viewport mobile/desktop; dùng dữ liệu test cô lập.

## Ma trận tối thiểu

| Luồng | Kiểm thử bắt buộc |
|---|---|
| Auth/RBAC | anonymous/STAFF/MANAGER/OWNER, account disabled, IDOR |
| Scheduling | ca trùng, ca qua ngày, thay đổi ca, yêu cầu nghỉ |
| Attendance | check-in/out, duplicate, retry, permission denied, server time |
| Operations | checklist, sự cố, bàn giao, quyền sửa/xem |
| Payroll | làm tròn, rate history, snapshot, lock, export CSV |
| Orders | giá server, món ngừng bán, trạng thái hợp lệ, double-submit, tracking privacy |
| UI/UX | responsive, keyboard, focus, empty/loading/error, form validation |

## Quy tắc test

1. Reproduce lỗi bằng test hoặc bước thủ công có thể lặp lại.
2. Sửa ở phạm vi nhỏ nhất, không bỏ validation để test xanh.
3. Chạy unit → integration → E2E liên quan; chạy toàn bộ suite nếu có thể.
4. Với thay đổi UI: chụp before/after, test màn hình hẹp và hành trình người dùng.
5. Ghi lệnh thực tế, môi trường, số test pass/fail/skip; nêu rõ test không chạy được.

## Security regression

- Truy cập trái quyền và đoán resource ID phải bị chặn ở server.
- Không được đọc ảnh R2 private bằng URL không được cấp quyền.
- Tracking token sai không tiết lộ đơn hàng.
- Race/retry không tạo công/đơn trùng hoặc sửa snapshot đã khóa.

## Definition of Done

- [ ] Thay đổi phù hợp tài liệu và không vượt phạm vi.
- [ ] Có bằng chứng lỗi và bằng chứng đã sửa.
- [ ] Test phù hợp pass; không có regression nghiêm trọng đã biết.
- [ ] UI có states đầy đủ, mobile-friendly và accessible.
- [ ] Migration/config được review nếu có.
- [ ] Báo cáo file thay đổi, test, rủi ro và việc còn lại.

## Mẫu báo cáo

```text
Finding: [severity] mô tả ngắn
Evidence: file:line, steps/test
Root cause: ...
Change: ...
Verification: command + result
Limitations: ...
```

