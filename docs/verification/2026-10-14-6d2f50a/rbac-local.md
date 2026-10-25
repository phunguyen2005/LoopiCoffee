# Evidence RBAC và quản trị hệ thống — local

- Thời điểm: 2026-10-14, Asia/Saigon.
- Baseline: `6d2f50a`; working tree dirty với thay đổi DEC-010, chưa commit.
- Môi trường: Windows, D1 local/Wrangler, Supabase local configuration, Chromium Playwright.
- Dataset: seed local có đủ `system_admin`, `owner`, `manager`, `team_lead`, `employee`; không dùng dữ liệu production.

## Kết quả

| Lệnh/lớp | Kết quả | Skip | Phạm vi |
|---|---:|---:|---|
| `npm run check` | PASS: typecheck, lint, 209/209 test và production build | 0 | Toàn bộ suite sau khi bổ sung các ca race DEC-010 |
| `node --test --experimental-strip-types tests/rbac-system-admin.test.mjs` | PASS 6/6 | 0 | Catalog/dependency, revision, idempotency, concurrent RBAC write, revoke-next-load, last-owner và concurrent owner demotion |
| `npm run local:migrate` | PASS | 0 | Upgrade D1 local qua migration `0017`; migration fresh cũng được suite migration dựng và đối chiếu schema |
| `npm run test:e2e` | PASS 27/27 | 0 | Login/redirect, page/API access của năm role, CSRF, mobile 320–430 px và regression đặt món |

## Kết luận và giới hạn

- ACC-14 và ACC-15 đạt tại local trên working tree này.
- ACC-16 chỉ đạt phần policy/retry/audit local. Chưa gây lỗi thật giữa Supabase Auth và D1, chưa kiểm re-auth theo thời gian thật trên staging và chưa xác nhận thông báo với provider.
- Không chạy deploy, migration production, reset database dùng chung, thay secret hoặc gửi thông báo ngoài hệ thống.
- Khi phát hành phải chạy migration trước, kiểm seed và admin active, sau đó deploy ứng dụng đồng bộ theo `docs/admin-rbac-runbook.md`.
