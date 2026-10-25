# LoopyCafe Management System

Web app mobile-first quản lý vận hành một quán cà phê: phân ca, chấm công, xử lý yêu cầu, checklist, sự cố, bàn giao, tổng hợp công/lương giờ và đặt món không cần tài khoản.

**Trạng thái:** MVP/pilot đang kiểm chứng. Tài liệu hoặc build thành công không chứng nhận production-ready.

## Bắt đầu đọc

- [AGENTS](AGENTS.md): quy trình dành cho coding agents.
- [Bộ tài liệu chuẩn](docs/README.md): căn cứ hiện hành, quyết định đã chốt, khoảng cách triển khai và lịch sử.
- [Nghiệp vụ](docs/business-rules.md), [phân quyền](docs/permissions.md), [thiết kế](docs/design.md).
- [Kiến trúc](docs/architecture.md), [kiểm thử](docs/testing.md), [nghiệm thu](docs/acceptance-matrix.md).
- [Quy chuẩn commit](docs/commit-conventions.md).

## Công nghệ

React, Next.js-compatible routing, TypeScript, Tailwind CSS; Vinext chạy trên Cloudflare Workers.
D1 lưu dữ liệu nghiệp vụ, Drizzle khai báo schema/migrations, R2 private lưu bằng chứng và Supabase Auth xác thực.
Phiên bản chính xác nằm trong package.json/package-lock.json. Không coi đây là deployment Next.js Node mặc định.

## Chạy cục bộ

Yêu cầu Node >=22.13, npm và Docker cho Supabase Auth local. Cài dependency có thể tải từ Internet.
Theo [hướng dẫn môi trường và dữ liệu](docs/database-operations.md) để kiểm tra đích local trước provisioning.

```bash
npm ci
npm run local:doctor
npm run local:auth:start
npm run local:auth:configure
npm run local:provision
npm run dev
```

Doctor ban đầu có thể báo thiếu Auth/config; chạy lại sau cấu hình. Các lệnh auth/provision tạo dữ liệu thử cục bộ, không phải bước khởi tạo production.
Ứng dụng local dùng http://127.0.0.1:4173. Thông tin tài khoản test nằm trong file ignored do provision tạo; không đưa credential vào Git hoặc báo cáo.
Startup không tự cấp OWNER cho người đăng nhập đầu tiên.

## Kiểm chứng

```bash
npm run check
npm run test:e2e
```

check gồm typecheck, lint, Node tests và build; E2E chạy riêng và cần fixture/runtime phù hợp.
Chưa có kết quả chạy mới trong đợt chuẩn hóa tài liệu này. Xem [hiện trạng đối chiếu source](docs/implementation-status.md).

## Dữ liệu và giới hạn

Thời gian chính thức từ server; ngày nghiệp vụ Asia/Ho_Chi_Minh. Camera/location chỉ lấy sau thao tác chủ động; ảnh/GPS không chứng minh tuyệt đối việc có mặt.
Thiếu bằng chứng có luồng giải trình. Ảnh riêng tư có kiểm tra quyền và thời hạn truy cập; cần vận hành scheduler để xóa thực tế.
Đặt món và hoàn tất giao món không đồng nghĩa đã xác minh thanh toán.
Không dùng dữ liệu nhân viên/khách thật trong demo hoặc test.
