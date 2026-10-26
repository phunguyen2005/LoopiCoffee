# Triển khai gói Free — main là production

Ngày: 2026-10-26. Theo DEC-016: Workers Free + D1 Free + Supabase Free (Auth và Storage private). Không đăng ký R2. Quy mô mục tiêu: một chủ quán, tối đa năm nhân viên; số request và dung lượng vẫn phụ thuộc cách sử dụng, không chỉ số tài khoản.

Đây là cấu hình nguồn và quy trình; không khẳng định tài nguyên cloud đã tạo, schema đã áp dụng hoặc ứng dụng đã chạy production.

## 1. Dịch vụ và giới hạn

- Cloudflare Workers **Free**, D1 **Free**, Images **Free** nếu dùng `IMAGES`; không bật gói Paid. Ứng dụng dùng custom domain đã sở hữu `https://app.phundt.id.vn`; `workers.dev` chỉ là địa chỉ dự phòng. Free có quota và có thể trả lỗi khi hết quota; cần kiểm tra CPU thực tế của SSR trên Workers Free.
- Supabase organization **Free**, không nâng cấp Pro. Auth và private Storage cùng project. Free có 1 GB file storage và quota egress; hết quota có thể gián đoạn. Project ít hoạt động có thể bị pause. Không dùng image transformation trả phí của Supabase.
- Resend Free chỉ có quota gửi email, không cấp domain gửi thư riêng. Nếu chưa sở hữu domain xác minh được, email production vẫn là một hạng mục cần giải quyết; không coi default SMTP của Supabase hay domain test Resend là nghiệm thu gửi thư cho nhân viên.
- Không có SLA trả phí hoặc bảo đảm miễn phí vĩnh viễn. Theo dõi điều khoản/quota của nhà cung cấp. Không bật add-on trả phí để vượt quota.

Nguồn: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [Supabase](https://supabase.com/pricing), [Images](https://developers.cloudflare.com/images/pricing/).

## 2. Supabase Storage private

Trong Supabase project đích: Storage → New bucket:

- Bucket ID: `attendance-evidence`.
- Public bucket: **OFF**.
- File size limit: **3 MiB** (`3145728` bytes).
- Allowed MIME types: `image/svg+xml`. Ảnh hiện được server đóng dấu dưới dạng SVG nhúng JPEG đã validate; không tự đổi định dạng dữ liệu.
- Không thêm policy cho phép `anon` hoặc `authenticated` đọc/ghi trực tiếp bucket này. Nếu project có policies toàn cục/permissive, rà soát và loại bucket bằng chứng khỏi chúng trước khi mở ứng dụng. RLS policies được OR với nhau, bucket private không tự vô hiệu một policy cho phép đọc.
- Chỉ Worker giữ service-role key. API ảnh kiểm quyền `attendance.evidence.read`, store scope, hạn đọc 90 ngày và audit trước khi trả ảnh. Không cấp public URL hoặc signed URL cho browser. Adapter kiểm tra bucket private trước mỗi upload/download/delete.

Service-role key không đặt trong `NEXT_PUBLIC_*`, build config, Git hoặc client bundle. Không tự tạo bucket trong request nghiệp vụ; tạo trước trong dashboard.

Giới hạn 3 MiB mỗi object ngăn file lớn bất thường nhưng không bảo đảm tổng dung lượng dưới 1 GB. Ảnh SVG có base64 lớn hơn JPEG gốc khoảng 1/3. Kiểm tra dung lượng ảnh thực, tần suất chấm công và egress ở Usage; giữ khoảng trống cho các bucket khác. Không giảm retention bằng cách xóa raw attendance events. Khi storage hết quota, upload phải được báo thiếu bằng chứng/chờ duyệt, không báo lưu ảnh thành công.

## 3. Local sau khi đổi storage

Supabase local đã bật Storage trong `tooling/local-auth/supabase/config.toml`. Nếu đang chạy bản cấu hình cũ, dừng/khởi động lại Supabase local theo [database operations](database-operations.md), không reset hoặc xóa volume:

```powershell
npm run local:auth:stop
npm run local:auth:start
npm run local:auth:configure
npm run local:provision
npm run local:storage:verify
```

`local:provision` chỉ gọi URL loopback, tạo bucket private nếu chưa có và từ chối bucket public; dùng dữ liệu thử đã được xác định bởi tooling. Không chạy quy trình local vào tài nguyên cloud.

## 4. Tạo Worker và D1

Cloudflare → Storage & databases → D1 → tạo `loopicafe-production`, ghi database ID. Tạo Worker tên `loopicafe-production`, giữ gói Workers Free. Gắn custom domain `app.phundt.id.vn` vào Worker; Cloudflare tạo DNS và chứng chỉ. Giữ route `custom_domain` trong `wrangler.production.example.jsonc` để lần deploy tiếp theo không ghi đè cấu hình Dashboard. Canonical app URL là `https://app.phundt.id.vn`.

Khi triển khai bằng máy cá nhân, copy `wrangler.production.example.jsonc` thành `wrangler.production.jsonc` và điền D1 ID thật. File cấu hình riêng này được Git ignore; không dùng ID local hoặc cấu hình `tooling/local-runtime/wrangler.jsonc`.

## 5. Build/deploy từ GitHub main

Cloudflare → Compute → Workers & Pages → chọn Worker → Settings → Builds → Connect GitHub, repository `phunguyen2005/LoopiCoffee`, production branch **main**. Không cấu hình nhánh staging/production khác trong Git.

Build settings:

| Trường | Giá trị |
|---|---|
| Root directory | Gốc repository |
| Build command | `npm run build:production` |
| Deploy command | `npx wrangler deploy --config dist/server/wrangler.json` |
| Production branch | `main` |
| Worker name | `loopicafe-production` |

Build environment variables (không chứa service-role key):

| Biến | Giá trị |
|---|---|
| `CLOUDFLARE_D1_DATABASE_ID` | ID thật của D1 production |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key của project |
| `NEXT_PUBLIC_APP_URL` | `https://app.phundt.id.vn` |

Build script tạo config từ example khi chưa có config riêng và đã cung cấp D1 ID. Vite tạo `dist/server/wrangler.json` cho bundle production, đồng bộ ba public settings và `APP_URL` vào runtime vars. Không dùng `npm run build` cho cloud: đó là wrapper chỉ dành cho local. Production đọc public build settings từ môi trường CI hoặc `tooling/production-runtime/.env.production`, không nạp root `.env.local`.

Trong **Worker Settings → Variables and Secrets**, khai báo lại runtime settings:

- Plain variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `APP_URL` được generated config lấy từ public build settings; `SUPABASE_EVIDENCE_BUCKET=attendance-evidence` có sẵn trong template. Không chỉnh runtime URL lệch với bản build.
- Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (chuỗi ngẫu nhiên đủ mạnh).
- Giữ `ALLOW_DEMO_AUTH=false`, `ENABLE_DEMO_SEED=false`, `LOOPI_LOCAL_ONLY=false`, profile `production` theo template.

Build environment và Worker runtime environment là hai nơi cấu hình khác nhau. Secrets ở Worker không tự trở thành biến build. Thay public config phải build lại; không sao chép `.dev.vars` local lên cloud.

Nếu cần chạy từ máy: điền public build settings vào `tooling/production-runtime/.env.production`, chạy `npm run build:production`, rà soát generated config rồi mới deploy bằng lệnh ở bảng. Không để bản build local ghi đè `dist` giữa build production và deploy.

## 6. Schema, tài khoản và Auth

Đọc [database operations](database-operations.md) trước thao tác remote. Với DB đã có dữ liệu phải backup và restore thử trước; fresh DB phải xác nhận đúng ID/đích. Chạy migration runner trên DB thử độc lập trước khi apply production. Việc chỉ có một nhánh Git production không loại yêu cầu kiểm chứng trên tài nguyên thử riêng.

```powershell
npx wrangler d1 migrations list DB --remote --config wrangler.production.jsonc
# Sau khi xác nhận đúng DB, backup và review chuỗi migration:
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
```

Không gộp lệnh remote migration vào mỗi build. Không dùng seed-menu, local fixtures hoặc `/api/seed-users` để tạo dữ liệu production. Khởi tạo/khôi phục Admin và Owner theo [admin runbook](admin-rbac-runbook.md), giữ duy nhất một Admin và một Owner.

Supabase Authentication → URL Configuration: đặt Site URL và allowlist redirect URLs theo canonical Worker URL và các route `/auth/confirm`, `/auth/callback`, `/auth/change-password` thực tế. Cấu hình SMTP riêng nếu cần mời/reset qua email; xác minh email gửi thật, link một lần và callback. Giữ public signup bị vô hiệu theo nghiệp vụ.

## 7. Retention và nghiệm thu

`POST /api/cron/retention` yêu cầu `Authorization: Bearer <CRON_SECRET>`. Có endpoint chưa có nghĩa scheduler đang chạy. Cần scheduler riêng miễn phí có thể gửi bearer header (không đặt secret trong URL); theo dõi `failures` và retry. Không gọi cleanup production chỉ để thử khi chưa xác nhận môi trường/dữ liệu. [Runbook retention](operational-runbook.md).

Ảnh/GPS hết hạn 90 ngày bị chặn đọc ngay; job xóa object qua Supabase và chỉ xóa metadata ảnh sau thành công. Event công vẫn còn; retry/audit cleanup giữ nguyên. Test upload → view theo quyền → hết hạn → xóa lỗi/retry trên tài nguyên thử thật trước pilot, cùng backup/restore, Auth và thiết bị thật theo [acceptance matrix](acceptance-matrix.md).

## 8. Dữ liệu R2 cũ và rollback

Không có bước tự động đọc/copy/xóa R2. Nếu trước đây đã lưu ảnh thật ở R2, dừng rollout thay storage cho đến khi kiểm kê và chuyển object sang bucket private, giữ nguyên key/bytes/hash và hạn lưu, đối chiếu D1 trước khi chuyển cấu hình. Không ký URL R2 công khai để chuyển dữ liệu.

Rollback code sau khi đã có ảnh mới trong Supabase có thể làm ảnh mất khả năng truy cập nếu quay lại code chỉ đọc R2. Phải dùng bản code có adapter Supabase hoặc thực hiện kế hoạch chuyển dữ liệu đã xác minh; không xóa Supabase bucket hoặc R2 để rollback.
