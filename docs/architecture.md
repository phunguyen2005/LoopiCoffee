# Kiến trúc

Cập nhật: 2026-10-13. Quyết định nền: modular monolith cho một cửa hàng; không viết lại framework.

## Luồng dữ liệu

Browser → Vinext route/Worker boundary → verified identity → D1 membership/resource permission → application policy → D1/Supabase Storage private → response → UI.
Supabase Auth cung cấp danh tính; D1 sở hữu dữ liệu nghiệp vụ và quyền ứng dụng. DEC-016 thay R2 bằng Supabase Storage; adapter tại `platform/storage/evidence.ts` giữ upload bất biến, private bucket, download qua API và delete retry. [Triển khai Free](free-production-deployment.md), nhánh production `main`.

| Khu vực | Trách nhiệm |
|---|---|
| app/, app/api/ | Trang, HTTP routing, auth/input và response |
| components/ | Hiển thị, trạng thái tương tác, gọi API |
| modules/*/domain | Quy tắc độc lập framework khi khả thi |
| modules/*/application | Điều phối nghiệp vụ, guard và ghi dữ liệu |
| modules/*/contracts | Kiểu chia sẻ an toàn cho browser |
| platform/http/ | Input bounds, lỗi an toàn, client HTTP/origin |
| server/ | Adapter danh tính, session, audit |
| db/schema.ts, drizzle/ | Model và lịch sử migration |
| tooling/, tests/ | Môi trường cô lập và kiểm chứng |

## Hướng dependency

Domain không import React/Next/HTTP/storage implementation.
Browser không import server/application chứa SQL hoặc secrets.
Routes gọi application workflow; không sao chép policy bảo vệ owner/khóa lương.
Application hiện dùng D1 surface trực tiếp: đây là lựa chọn hiện hữu, không bắt buộc tạo repository interface/DI container.
Raw prepared SQL không tự là lỗi; kiểm tra parameterization, schema parity và test hành vi.

## Ranh giới giao dịch

D1 batch cho các ghi liên quan; UPDATE 0 dòng không tự là exception, side effects phải được gate.
D1 và Supabase (Auth/Storage) không có transaction chung. Cần nhận diện partial failure, retry/compensation và vận hành đối soát.
Không tự thêm queue/outbox chỉ để đạt sơ đồ đẹp; chọn theo nhu cầu độ tin cậy được duyệt.
Đọc báo cáo trước batch finalize cần guard revision để phát hiện nguồn thay đổi.

## Runtime

Giữ Vinext/Cloudflare Workers; kiểm tra package-lock, config Worker và entrypoint thực khi dùng API đặc thù.
Không giả định next dev tương đương Worker preview. Không tin identity header do client tự gửi.
Supabase SQL legacy không phải schema dữ liệu vận hành D1.
Giới hạn CPU/subrequests/cache phụ thuộc gói/cấu hình; dùng tài liệu nền tảng tại ngày kiểm chứng, không hardcode kết luận từ audit cũ.

## Căn cứ hiện trạng và kiểm chứng

[Implementation status](implementation-status.md) ghi source đã đọc; [testing](testing.md) ghi cách xác minh.
Không coi mô tả kiến trúc là bằng chứng runtime, deploy hoặc an toàn production.
