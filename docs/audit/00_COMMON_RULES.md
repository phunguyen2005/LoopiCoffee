# LoopiCafe — Quy tắc chung cho mọi audit agent

## Bối cảnh
- MVP một cửa hàng; vai trò OWNER, MANAGER, STAFF, CUSTOMER (khách đặt món không cần tài khoản).
- Stack cố định: React, Next.js, TypeScript, Tailwind CSS, shadcn/ui, Vinext, Cloudflare Workers, D1, Drizzle, R2 private, Supabase Auth.
- Kiến trúc modular monolith; múi giờ Asia/Ho_Chi_Minh.
- Giao tiếp và báo cáo tiếng Việt; tên biến/code/database tiếng Anh.

## Ràng buộc bắt buộc
1. AUDIT ONLY: không sửa code, dependencies, migrations, dữ liệu, env, thiết lập cloud hay deployment. Chỉ được tạo báo cáo trong `docs/audit/`.
2. Đọc cấu trúc repo, README, AGENTS.md và tài liệu dự án trước; không suy đoán file hoặc tính năng tồn tại.
3. Đưa bằng chứng bằng đường dẫn file:dòng, kết quả test/trace hoặc screenshot thực tế. Không đưa dữ liệu bí mật vào báo cáo.
4. Phân loại CONFIRMED / PROBABLE / NEEDS VERIFICATION; nếu không đủ dữ liệu ghi NOT ASSESSED.
5. Đánh số phát hiện theo prefix của mảng; ghi mức độ P0/P1/P2/P3, tác động, cách tái hiện, nguyên nhân, hướng sửa, mức độ khó, test hồi quy.
6. Không được dùng UI ẩn nút làm bằng chứng đủ cho phân quyền server. Không coi mock/static placeholder là chức năng hoàn chỉnh.
7. Chỉ chạy lệnh read-only hoặc test trong môi trường cô lập sau khi xác minh không gây ghi dữ liệu hoặc dịch vụ ngoài; nếu rủi ro thì dừng và ghi blocker.
8. Không đề xuất thay tech stack, microservices hay multi-store. Không tự triển khai fix.
9. Giữ mỗi phát hiện trong báo cáo chuyên môn; nếu liên ngành, tham chiếu finding ID thay vì nhân bản.

## Mẫu finding
`ID | Priority | Confidence | Module | Evidence (file:line/test/screenshot) | Expected | Actual/Risk | Root cause | Recommendation | Effort | Regression test`

## Kết thúc
Báo cáo gồm: phạm vi thực sự đã xem, phương pháp, inventory, findings theo mức độ, phần chưa kiểm chứng, 5 ưu tiên tiếp theo, lệnh test + kết quả (nếu có). Không tự đánh giá 10/10 khi thiếu bằng chứng.
