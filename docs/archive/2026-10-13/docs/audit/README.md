# LoopiCafe — 9 independent audit prompts

Sử dụng `00_COMMON_RULES.md` cùng với từng file `01`–`09`. Mỗi prompt là một tác vụ riêng cho coding agent trong repo gốc, với output độc lập ở `docs/audit/`.

**Thứ tự khuyến nghị:** Source Code → Business Logic → Security → Database → API → UI/UX → Mobile → Performance → Test Quality. Có thể audit song song với branch/worktree riêng; hợp nhất finding sau cùng.

**Cách dùng:** Cung cấp cho agent nội dung `00_COMMON_RULES.md` và file audit mong muốn. Nếu copy folder này vào repository, yêu cầu agent đọc cả hai file. Quy định mặc định là read-only đối với source và hệ thống thật.

**Lưu ý:** Các screenshot trao đổi trước là bằng chứng định hướng, không chứng minh hành vi runtime. Agent phải xác thực với code và test hiện tại.
