# DEC-016 — kiểm chứng chuyển private evidence storage

Ngày 2026-10-26, Windows/Node 22, baseline `38c3d51` + working tree của thay đổi này. Không coi kết quả là cloud deployment hoặc nghiệm thu phát hành.

## Phạm vi

Adapter Supabase SDK thật với bucket private; upload `upsert:false`, giới hạn object 3 MiB, download bằng service role và proxy qua API có quyền/expiry/audit, delete idempotent. Không đổi schema D1 hoặc format/key/hash của ảnh đóng dấu. Production build tách khỏi local và không có R2 bindings; `main` là nhánh production.

## Đã chạy

| Kiểm chứng | Kết quả | Giới hạn |
|---|---|---|
| `node --experimental-strip-types --test tests/supabase-evidence-storage.test.mjs tests/evidence-cleanup-recovery.test.mjs tests/evidence.test.mjs` | 16 PASS, 0 fail/skip | SDK thật, HTTP provider boundary được giả lập; cleanup/recovery dùng SQLite thật |
| `npm test` | 302 PASS, 0 fail/skip, 27 suites | Regression local; các suite có cả DB thật và source/mock assertions, không suy ra browser/provider coverage |
| `npm run typecheck` | PASS | Kiểu TypeScript và generated Workers types |
| `npm run lint` | PASS, 0 errors, 15 warnings có sẵn | Không sửa cảnh báo ngoài phạm vi |
| `npm run build:production` với fixture config/public HTTPS settings | PASS | D1 ID/public URL/key chỉ là fixture; không kết nối cloud hoặc deploy. Generated config: không R2, có ASSETS/IMAGES, public build/runtime URL đồng bộ, không chứa service-role secret |
| `npm run build` | PASS | Build local sau production fixture build; dist hiện là local, không dùng nó để deploy production |
| `npm run local:auth:stop`, `npm run local:auth:start` | PASS | Restart local project có backup; bật Storage/PostgREST, không reset volume |
| `npm run local:provision` | PASS | Local D1 không còn migration chờ; tạo private bucket local, cập nhật fixtures local, không cloud |
| `npm run local:storage:verify` | PASS | Supabase Docker Storage/Auth thật, chỉ loopback; test bucket/user/object riêng được xóa sau kiểm chứng |

Local Storage drill xác minh bytes roundtrip, cấm overwrite, anon/authenticated không đọc/ghi trực tiếp, authenticated delete không ảnh hưởng object, xóa lặp an toàn và download object đã xóa trả missing. Không có ảnh chấm công thật hoặc secrets trong artifact kiểm chứng. `git diff --check` không có lỗi whitespace.

## Chưa xác minh

Supabase cloud bucket/policies/quota, Workers Free CPU thực tế, secrets/SMTP/redirect cloud, scheduler chạy thật, cloud backup/restore, browser và thiết bị thật ở phiên bản này. Không apply migration remote, chuyển object R2 thật hoặc thay đổi subscription. Free quota và inactivity pause vẫn áp dụng; xem [hướng dẫn](../free-production-deployment.md).
