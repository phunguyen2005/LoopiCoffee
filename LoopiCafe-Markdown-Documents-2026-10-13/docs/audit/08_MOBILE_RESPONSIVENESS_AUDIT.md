# TÀI LIỆU LỊCH SỬ — không dùng làm đặc tả hiện hành

> Đánh dấu ngày 2026-10-13. Các kết quả và chỉ dẫn bên dưới chỉ thuộc baseline/lượt công việc được mô tả. Không coi là yêu cầu thực thi hoặc trạng thái HEAD hiện tại.
> Đọc [bộ tài liệu chuẩn](../README.md), [hiện trạng source](../implementation-status.md) và [đính chính audit](ERRATA.md).
> Bản nguyên gốc được bảo toàn trong docs/archive/2026-10-13/. Liên kết source đã bỏ line anchors cũ; đường dẫn không còn tồn tại chuyển tới đính chính, không coi đó là bằng chứng source.

---

# BÁO CÁO AUDIT CHUYÊN SÂU: MOBILE RESPONSIVENESS & TOUCH USABILITY
**LoopiCafe Management System**

- **Mã báo cáo:** `AUDIT-MOB-2026-001`
- **Tài liệu tham chiếu:** [`00_COMMON_RULES.md`](00_COMMON_RULES.md), [`AGENTS.md`](../../AGENTS.md) (Mục 7 — UI/UX Nguyên tắc thiết kế và cải thiện)
- **Baseline Git Commit:** `05e7719dc8ae824a833c6d4b3c8fa21c3d3e56c1`
- **Môi trường & Ngôn ngữ phân tích:** TypeScript, Next.js (Vinext), Tailwind CSS, Vanilla CSS; Báo cáo bằng Tiếng Việt; Định danh kỹ thuật bằng Tiếng Anh.
- **Quy chế hoạt động:** **AUDIT ONLY** — Không chỉnh sửa code ứng dụng, dependencies, migrations hay dữ liệu.

---

## 1. Tóm tắt điều hành (Executive Summary)

Đợt audit này tập trung đánh giá mức độ thích ứng trên thiết bị di động (**Mobile Responsiveness**) và khả năng tương tác cảm ứng (**Touch Usability**) của toàn bộ hệ thống quản lý quán cà phê LoopiCafe theo định hướng **Mobile-first**. Phạm vi bao gồm cả luồng khách hàng công khai (**Customer Ordering**) và các phân hệ quản trị vận hành nội bộ (**Staff / Manager / Owner Operations**).

### 1.1. Đánh giá tổng quan
Hệ thống đã có nhận thức và nỗ lực rõ ràng trong việc xây dựng trải nghiệm mobile:
- Đã thiết lập các breakpoint CSS media query tại `980px`, `720px`, `520px`, `350px` trong [`app/globals.css`](../../app/globals.css).
- Cung cấp thanh điều hướng đáy di động ([`.mobile-nav`](../../app/globals.css)), thanh topbar di động ([`.mobile-topbar`](../../app/globals.css)), và các nút hành động nổi ([`.mobile-attendance-cta`](../../app/globals.css), [`.mobile-sticky-primary`](../../app/globals.css)).
- Luồng khách hàng đặt món sử dụng kiến trúc Bottom Sheet / Drawer tiện lợi cho thao tác ngón cái trên điện thoại.
- Luồng chấm công di động hỗ trợ tích hợp camera trước, định vị GPS vệ tinh và luồng giải trình ngoại lệ không bắt buộc GPS tuyệt đối.

### 1.2. Các rủi ro và khuyết tật nghiêm trọng (Key Defects)
Mặc dù có định hướng mobile, quá trình audit phát hiện **10 vấn đề trọng yếu**, trong đó có các lỗi nghiêm trọng làm gián đoạn luồng vận hành thực tế tại quán:
1. **[P0 - MOB-001] Fixed Bottom Overlap:** Các thành phần cố định ở đáy màn hình (`.mobile-nav` cao ~70px kết hợp với `.mobile-sticky-primary` / `.mobile-attendance-cta` cao ~60-80px) tạo thành khối che phủ lên đến **150px - 160px** ở đáy viewport. Trong khi đó, padding bù đáy của các trang (`padding-bottom: 70px`) không đủ, dẫn tới **che khuất hoàn toàn các nút hành động cuối trang** (như "Báo sự cố", "Xin nghỉ", ghi chú bảo mật và textarea giải trình chấm công).
2. **[P1 - MOB-002] Touch Targets dưới chuẩn WCAG 2.5.5:** Rất nhiều nút bấm cốt lõi có kích thước thực tế chỉ từ **15px đến 36px** (dưới ngưỡng tối thiểu khuyến nghị 44×44px / 48×48px), điển hình là nút "+" thêm món trên menu card (36×36px), nút xoá món giỏ hàng (~23×23px), nút tăng giảm số lượng (28×28px), nút duyệt/từ chối yêu cầu và phê duyệt chấm công (~15-18px).
3. **[P1 - MOB-003] Destructive Action Danger Zone:** Tại màn hình quản lý đơn hàng của chủ quán/quản lý, nút **"Huỷ đơn" (destructive)** màu đỏ đặt sát ngay cạnh nút **"Xác nhận" / "Chuẩn bị"** với khoảng cách chỉ 6px, gây nguy cơ cực cao nhân viên bấm nhầm huỷ đơn hàng khi thao tác nhanh bằng một tay.
4. **[P1 - MOB-004] Sticky Column nén nghẹt trên màn hình hẹp:** Trong bảng lương (`.payroll-table`), cột cố định tên nhân viên có `min-width: 248px; position: sticky; left: 0;`. Trên màn hình 320px–375px, cột này chiếm **tới 96% chiều rộng khả dụng**, biến vùng cuộn ngang thành một khe hẹp ~10px, khiến người quản lý hoàn toàn không thể xem được dữ liệu giờ công, tăng ca và tiền lương.
5. **[P2 - MOB-005 & MOB-006] Lỗi cuộn cảm ứng và bẫy cử chỉ:** Lịch tuần thiếu cột nhân viên cố định khi cuộn ngang; bản đồ Leaflet Map trong Cài đặt Geofence bẫy trọn cử chỉ vuốt cuộn dọc trang của người dùng (Scroll Trap).

---

## 2. Ma trận Viewport & Thiết bị kiểm thử (Viewport Matrix)

Audit được thực hiện dựa trên phân tích tương quan layout, CSS Box Model và hành vi giao diện trên các kích thước chuẩn sau:

| Viewport Width | Thiết bị đại diện tiêu biểu | Tỷ lệ & Môi trường | Đánh giá khả năng đáp ứng hiện tại |
| :--- | :--- | :--- | :--- |
| **320px** | iPhone SE (1st gen), Galaxy Fold (màn ngoài hẹp) | Portrait, Cực hẹp (Ultra-narrow) | **NGHIÊM TRỌNG (FAIL)** — Tràn nút bán kính Geofence, nghẹt cột bảng lương, che khuất nút chấm công. |
| **375px** | iPhone SE (2nd/3rd gen), iPhone 6/7/8 | Portrait, Phổ thông nhỏ | **KHÔNG ĐẠT (FAIL)** — Overlap đáy nghiêm trọng, touch target nút thêm món nhỏ, bảng lương bị ép. |
| **390px** | iPhone 12 / 13 / 14 / 15 / 16 tiêu chuẩn | Portrait, Chuẩn thiết kế mobile | **CẦN CẢI THIỆN (MARGINAL)** — Đọc được nội dung nhưng dễ bấm nhầm nút giỏ hàng và nút duyệt công. |
| **430px** | iPhone Pro Max, Samsung Galaxy Ultra | Portrait, Màn hình lớn | **CHẤP NHẬN ĐƯỢC (PASS WITH WARNINGS)** — Không gian thoáng hơn, vẫn còn lỗi overlap đáy trang. |
| **768px** | iPad Mini, Android Tablet dọc | Portrait, Máy tính bảng | **TỐT (PASS)** — Bắt đầu ẩn mobile nav, chuyển layout 2 cột hoặc sidebar thu gọn. |
| **1024px+** | Desktop, Laptop, iPad Pro ngang | Landscape, Màn hình lớn | **TỐT (PASS)** — Layout desktop chuẩn với sidebar cố định bên trái. |

---

## 3. Danh mục Màn hình & Component Inventory

Hệ thống bao gồm các màn hình và component giao diện người dùng sau:

### 3.1. Phân hệ Khách hàng (Customer Public Ordering)
- [`components/order/customer-order-page.tsx`](../../components/order/customer-order-page.tsx): Trang chủ đặt món, danh mục carousel ngang, thanh tìm kiếm, giỏ hàng nổi đáy trang.
- [`components/order/menu-card.tsx`](../../components/order/menu-card.tsx): Card hiển thị món, ảnh thumbnail, mô tả rút gọn, giá bán, nút "+" thêm nhanh.
- [`components/order/item-detail-modal.tsx`](../../components/order/item-detail-modal.tsx): Bottom modal tùy chọn kích cỡ (Size), mức đường, mức đá, ghi chú và nút submit thêm vào giỏ.
- [`components/order/cart-drawer.tsx`](../../components/order/cart-drawer.tsx): Drawer giỏ hàng trượt từ đáy, danh sách món, nút tăng/giảm/xoá, form tên, SĐT, mã bàn, ghi chú đơn.
- [`components/order/order-tracking-view.tsx`](../../components/order/order-tracking-view.tsx): Màn hình theo dõi tiến trình 5 bước của đơn hàng (`PENDING` → `COMPLETED`).
- [`components/order/order-tokens.css`](../../components/order/order-tokens.css): Hệ token màu sắc, typography và animation dành riêng cho trải nghiệm đặt món.

### 3.2. Phân hệ Nhân viên (Staff Operations Flow)
- [`components/operational/today-view.tsx`](../../components/operational/today-view.tsx): Màn hình trọng tâm hàng ngày của nhân viên: ca trực, trạng thái chấm công, checklist ca, lối tắt báo sự cố và xin nghỉ.
- [`components/attendance-capture.tsx`](../../components/attendance-capture.tsx): Giao diện chụp ảnh check-in/out qua webcam/camera, lấy tọa độ GPS, kiểm tra bán kính geofence, form giải trình ngoại lệ.
- [`components/operational/schedule-view.tsx`](../../components/operational/schedule-view.tsx): Xem lịch làm việc theo tuần/tháng, chế độ xem cá nhân và toàn bộ ca làm việc.
- [`components/operational/checklists-view.tsx`](../../components/operational/checklists-view.tsx): Danh sách việc cần làm theo ca (Mở ca, Giữa ca, Đóng ca) kèm trạng thái hoàn thành.
- [`components/operational/issues-view.tsx`](../../components/operational/issues-view.tsx): Báo cáo sự cố thiết bị/vận hành và theo dõi tiến độ xử lý.
- [`components/operational/handovers-view.tsx`](../../components/operational/handovers-view.tsx): Bàn giao ca trực, đối soát tiền mặt quầy thu ngân.
- [`components/operational/requests-view.tsx`](../../components/operational/requests-view.tsx): Tạo và theo dõi yêu cầu xin nghỉ, đổi ca, điều chỉnh giờ công.
- [`components/operational/profile-view.tsx`](../../components/operational/profile-view.tsx): Hồ sơ cá nhân của nhân viên, số điện thoại, thông tin hợp đồng ca.

### 3.3. Phân hệ Quản lý & Chủ quán (Manager / Owner Operations)
- [`components/operational/owner-orders-view.tsx`](../../components/operational/owner-orders-view.tsx): Bảng điều khiển đơn hàng theo thời gian thực (KDS/Order Hub), chuyển trạng thái đơn hàng.
- [`components/operational/attendance-view.tsx`](../../components/operational/attendance-view.tsx): Bảng kiểm tra và phê duyệt công, xử lý ngoại lệ chấm công không ảnh/sai GPS.
- [`components/payroll-reports-view.tsx`](../../components/payroll-reports-view.tsx): Bảng chấm công tổng hợp và báo cáo lương nhân viên, khóa kỳ công.
- [`components/operational/reports-view.tsx`](../../components/operational/reports-view.tsx): Báo cáo doanh thu, sản lượng đồ uống và ca trực.
- [`components/operational/team-view.tsx`](../../components/operational/team-view.tsx): Quản lý danh sách nhân sự, phân quyền, hồ sơ nhân viên.
- [`components/operational/settings-view.tsx`](../../components/operational/settings-view.tsx): Cài đặt quán, cấu hình tọa độ geofence cửa hàng với bản đồ Leaflet tương tác.
- [`components/admin-accounts-view.tsx`](../../components/admin-accounts-view.tsx): Phân quyền tài khoản quản trị hệ thống.

### 3.4. Khung điều hướng & Toàn cục (App Shell & Navigation)
- [`components/app-shell.tsx`](../../components/app-shell.tsx): Bố cục tổng thể, ẩn sidebar trên mobile, hiển thị mobile topbar, mobile bottom navigation, và quick drawer.
- [`app/globals.css`](../../app/globals.css): CSS toàn cục, các biến màu sắc, utilities và media queries.

---

## 4. Bảng kiểm tra Checklist tiêu chuẩn Mobile UX (Audit Checklist)

| Tiêu chuẩn kiểm tra | Trạng thái | Bằng chứng mã nguồn & Đánh giá kỹ thuật |
| :--- | :---: | :--- |
| **Viewport Meta Tag** | **PASS** | `app/layout.tsx` cấu hình chuẩn `width=device-width, initial-scale=1, viewport-fit=cover`. |
| **Safe Area Insets (iOS notch/home bar)** | **FAIL** | [globals.css#L3799](../../app/globals.css) có `env(safe-area-inset-bottom)` cho navigation nhưng padding bù nội dung trang lại bị hardcode hoặc thiếu, gây đè lấp. |
| **Fixed Elements & Overlap** | **FAIL** | [globals.css#L3840-L3872](../../app/globals.css) `.mobile-sticky-primary` và `.mobile-attendance-cta` đè lên nội dung cuối trang do thiếu khoảng đệm bù trừ (MOB-001). |
| **Touch Targets (WCAG 2.5.5 >= 44×44px)** | **FAIL** | Nhiều nút quan trọng có kích thước chỉ 15px - 36px (nút thêm món, nút xoá món giỏ, nút duyệt yêu cầu) (MOB-002). |
| **Khoảng cách an toàn nút Destructive** | **FAIL** | [owner-orders-view.tsx#L1168](../../components/operational/owner-orders-view.tsx) Nút "Huỷ" và "Xác nhận" đặt sát nhau (gap 6px), rất dễ bấm nhầm trên màn hình cảm ứng (MOB-003). |
| **Bảng dữ liệu rộng & Sticky Column** | **FAIL** | [globals.css#L2010](../../app/globals.css) `.payroll-table .sticky-column` chiếm 248px–300px, bóp nghẹt 96% màn hình 320px–375px (MOB-004). |
| **Cuộn lịch biểu (Schedule Grid)** | **FAIL** | [schedule-view.tsx#L504](../../components/operational/schedule-view.tsx) Grid tuần 700px cuộn ngang không có sticky cột nhân viên và thiếu affordance cuộn (MOB-005). |
| **Bẫy cử chỉ bản đồ (Map Gesture Trap)** | **FAIL** | [settings-view.tsx#L400](../../components/operational/settings-view.tsx) Leaflet map bắt trọn cử chỉ vuốt một ngón, gây kẹt trang trên mobile (MOB-006). |
| **Bố cục siêu hẹp 320px (Ultra-narrow)** | **FAIL** | Nút bán kính Geofence, flex container danh sách nhân viên bị nén nghẹt và tràn khung viền (MOB-007). |
| **Thích ứng bàn phím ảo (Virtual Keyboard)** | **FAIL** | [cart-drawer.tsx#L283](../../components/order/cart-drawer.tsx) Drawer và form nhập liệu thiếu xử lý khi bàn phím ảo bật lên, có thể che khuất input (MOB-008). |
| **Hỗ trợ Giảm chuyển động (Reduced Motion)** | **FAIL** | [order-tokens.css#L70](../../components/order/order-tokens.css) và [globals.css](../../app/globals.css) thiếu `@media (prefers-reduced-motion: reduce)` toàn diện (MOB-009). |
| **Phóng to chữ (Dynamic Type / 200% Zoom)** | **FAIL** | Một số container dùng `height` cố định kèm `overflow: hidden`, chữ bị cắt khi phóng to 200% (MOB-010). |
| **Camera & Geolocation Permissions UI** | **PASS** | Giao diện xin cấp quyền có fallback, hiển thị lỗi rõ ràng và hỗ trợ giải trình khi bị từ chối quyền. |

---

## 5. Bảng tổng hợp & Chi tiết các Phát hiện (Findings Detail)

### 5.1. Bảng tóm tắt danh sách Findings
| ID | Mức độ | Độ tin cậy | Module / Màn hình | Tên phát hiện | Effort |
| :--- | :---: | :---: | :--- | :--- | :---: |
| **MOB-001** | **P0** | CONFIRMED | Global Shell / Today View / Attendance | Mobile Fixed Elements / CTA Overlap che khuất nội dung và thao tác cuối trang | Nhỏ (S) |
| **MOB-002** | **P1** | CONFIRMED | Menu Card / Cart Drawer / Requests / Attendance | Touch Targets dưới chuẩn 44×44px WCAG 2.5.5 trên các thao tác tần suất cao | Vừa (M) |
| **MOB-003** | **P1** | CONFIRMED | Owner Orders View / Attendance View | Khoảng cách quá hẹp giữa thao tác huỷ (destructive) và tiếp nhận (constructive) | Nhỏ (S) |
| **MOB-004** | **P1** | CONFIRMED | Payroll Reports View | Cột Sticky Employee chiếm tới 96% Viewport trên màn 320px–375px trong Bảng lương | Vừa (M) |
| **MOB-005** | **P2** | CONFIRMED | Schedule View | Lịch tuần thiếu cột nhân viên cố định và thiếu visual affordance cuộn ngang | Vừa (M) |
| **MOB-006** | **P2** | CONFIRMED | Settings View (Geofence) | Bản đồ Leaflet Map bẫy cử chỉ cuộn trang (Scroll Trap) trên màn hình cảm ứng | Nhỏ (S) |
| **MOB-007** | **P2** | CONFIRMED | Settings / Team / Attendance Capture | Tràn bố cục / nén hẹp button trên màn 320px (Ultra-narrow) | Vừa (M) |
| **MOB-008** | **P2** | CONFIRMED | Cart Drawer / Team Modal | Nguy cơ che khuất do bàn phím ảo (Virtual Keyboard Occlusion) trong Drawer/Modal | Vừa (M) |
| **MOB-009** | **P3** | CONFIRMED | Order Tokens / Global Styles | Thiếu media query `prefers-reduced-motion` cho các animation & transition mobile | Nhỏ (S) |
| **MOB-010** | **P3** | CONFIRMED | Menu Card / Header Components | Thiếu khả năng mở rộng container khi Text Zoom 200% (WCAG 1.4.4 Resize text) | Vừa (M) |

---

### 5.2. Phân tích chi tiết từng Finding

#### MOB-001 | P0 | CONFIRMED | Global Shell / Operational Views
- **Tiêu đề:** Mobile Fixed Elements & Floating CTA Overlap Che Khuất Nội Dung Cuối Trang
- **Vị trí bằng chứng:**
  * [`app/globals.css#L3797-L3808`](../../app/globals.css):
    ```css
    .mobile-nav {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(10px + env(safe-area-inset-bottom, 0px));
      min-height: 70px;
      z-index: 45;
    }
    ```
  * [`app/globals.css#L3840-L3855`](../../app/globals.css):
    ```css
    .mobile-attendance-cta,
    .mobile-sticky-primary {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: calc(90px + env(safe-area-inset-bottom, 0px));
      z-index: 44;
      /* Chiều cao của button container này khoảng 56px - 72px */
    }
    ```
  * [`components/operational/today-view.tsx#L302-L321`](../../components/operational/today-view.tsx):
    Cuối màn hình Today có cụm nút:
    - `"Xin nghỉ / Đổi ca"` (button)
    - `"Báo sự cố quán"` (button)
  * [`components/attendance-capture.tsx#L497-L562`](../../components/attendance-capture.tsx):
    Cuối màn hình Chấm công có:
    - Textarea giải trình ngoại lệ chấm công
    - Ghi chú bảo mật dữ liệu riêng tư nhân sự
  * [`app/globals.css#L3681-L3689`](../../app/globals.css):
    `.employee-today-view` và `.attendance-page-grid` chỉ khai báo `padding-bottom: 70px;` hoặc `padding-bottom: 80px;`.
- **Kỳ vọng:** Khi cuộn xuống hết trang, toàn bộ nội dung, nút hành động và textarea phải hiển thị đầy đủ trên màn hình, không bị bất kỳ thanh điều hướng hoặc nút cố định nào che lấp.
- **Thực tế / Rủi ro:**
  * Chiều cao của `.mobile-nav` là ~70px (tính cả margin là 80px).
  * Chiều cao của `.mobile-attendance-cta` hoặc `.mobile-sticky-primary` nằm nổi bên trên nó tại `bottom: calc(90px + safe-area)` với chiều cao ~60px.
  * Tổng chiều cao vùng bị che phủ cố định ở đáy lên tới **150px - 160px**.
  * Do `padding-bottom` của trang chỉ có **70px**, khoảng **80px - 90px nội dung dưới cùng của trang bị che khuất vĩnh viễn**.
  * Nhân viên không thể nhấn vào nút "Báo sự cố quán" hay "Xin nghỉ / Đổi ca" trên màn hình Today View; không đọc được ghi chú bảo mật và khó thao tác vùng textarea giải trình trên trang chấm công.
- **Nguyên nhân gốc rễ (Root Cause):** Thiếu sự đồng bộ giữa hệ thống token chiều cao của các thanh cố định đáy (`--mobile-nav-height: 80px`, `--mobile-cta-height: 70px`) và thuộc tính `padding-bottom` (hoặc `margin-bottom` của phần tử cuối) trên container trang nội dung.
- **Đề xuất khắc phục (Recommendation):**
  1. Định nghĩa biến CSS trong `:root` và cập nhật trong media query mobile:
     ```css
     :root {
       --mobile-nav-total-height: calc(84px + env(safe-area-inset-bottom, 0px));
       --mobile-sticky-cta-total-height: calc(160px + env(safe-area-inset-bottom, 0px));
     }
     ```
  2. Bổ sung lớp tiện ích đệm đáy cho các màn hình có CTA nổi:
     ```css
     .has-mobile-nav {
       padding-bottom: var(--mobile-nav-total-height) !important;
     }
     .has-mobile-nav-and-cta {
       padding-bottom: var(--mobile-sticky-cta-total-height) !important;
     }
     ```
  3. Áp dụng lớp `has-mobile-nav-and-cta` cho `.employee-today-view` và `.attendance-page-grid`.
- **Mức độ khó (Effort):** Nhỏ (S) — ~0.5 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Kiểm tra trên thiết bị thật / viewport 375px và 390px, cuộn kịch sàn tại màn hình Today View và Chấm công; xác nhận mọi button và text đều lộ rõ bên trên thanh CTA ít nhất 16px.

---

#### MOB-002 | P1 | CONFIRMED | Customer Menu / Cart / Staff Operations
- **Tiêu đề:** Kích Thước Touch Target Dưới Chuẩn WCAG 2.5.5 (44×44px) Trên Các Thao Tác Tần Suất Cao
- **Vị trí bằng chứng:**
  1. [`components/order/menu-card.tsx#L88`](../../components/order/menu-card.tsx):
     ```tsx
     <button
       type="button"
       className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-base transition-transform active:scale-90"
     ...
     ```
     Kích thước: `w-9 h-9` tương đương **36×36px** (thiếu 8px so với chuẩn 44×44px).
  2. [`components/order/cart-drawer.tsx#L214`](../../components/order/cart-drawer.tsx):
     ```tsx
     <button
       type="button"
       onClick={() => onRemoveItem(index)}
       className="p-1 rounded text-red-500 hover:bg-red-50"
       aria-label={`Xoá ${item.name} khỏi giỏ`}
     >
       <Trash2 className="w-3.5 h-3.5" />
     </button>
     ```
     Kích thước: Icon 14px + padding 4px mỗi bên = **22×22px** (chỉ đạt 50% kích thước chuẩn cảm ứng).
  3. [`components/order/cart-drawer.tsx#L227-L248`](../../components/order/cart-drawer.tsx):
     ```tsx
     <button
       type="button"
       onClick={() => onUpdateQuantity(index, item.quantity - 1)}
       className="w-7 h-7 rounded-full flex items-center justify-center ..."
     ...
     <button
       type="button"
       onClick={() => onUpdateQuantity(index, item.quantity + 1)}
       className="w-7 h-7 rounded-full flex items-center justify-center ..."
     ```
     Kích thước: `w-7 h-7` tương đương **28×28px** (vùng chạm cực nhỏ đối với ngón cái).
  4. [`components/operational/requests-view.tsx#L68`](../../components/operational/requests-view.tsx):
     Các nút Duyệt và Từ chối yêu cầu dùng class `.text-link` với font `11px`, không có padding, chiều cao vùng chạm thực tế chỉ khoảng **15px**.
  5. [`components/operational/attendance-view.tsx#L350-L364`](../../components/operational/attendance-view.tsx):
     Nút phê duyệt công có style `padding: 3px 8px; font-size: 0.75rem;`, chiều cao tổng thể chỉ **20px**.
- **Kỳ vọng:** Theo tiêu chuẩn WCAG 2.1 Success Criterion 2.5.5 (Target Size) và Apple iOS Human Interface Guidelines, mọi phần tử tương tác cảm ứng chính phải có vùng chạm tối thiểu **44×44px** (hoặc 48×48px theo Google Material Design).
- **Thực tế / Rủi ro:**
  * Người dùng thường xuyên bấm trượt khi muốn thêm món nhanh từ menu.
  * Trong giỏ hàng, việc điều chỉnh tăng/giảm số lượng bằng các nút 28×28px khiến khách hàng bấm nhầm vào món bên cạnh hoặc bấm trượt ra ngoài.
  * Nút xoá món 22×22px cực kỳ khó bấm, gây ức chế cho khách hàng khi muốn bỏ món không mong muốn.
  * Quản lý thao tác duyệt công trên điện thoại dễ bị ấn trượt, gây chậm trễ quy trình vận hành.
- **Nguyên nhân gốc rễ (Root Cause):** Thiết kế chú trọng vào độ nhỏ gọn về mặt thị giác (visual size) trên desktop/compact card mà không tách biệt giữa "kích thước hiển thị thị giác" và "vùng chạm tương tác" (hit target).
- **Đề xuất khắc phục (Recommendation):**
  1. Mở rộng kích thước visual hoặc sử dụng kỹ thuật pseudo-element `::after` mở rộng vùng bấm vô hình:
     ```css
     .touch-target-44 {
       position: relative;
       min-width: 44px;
       min-height: 44px;
     }
     /* Hoặc giữ nguyên visual nhỏ nhưng mở rộng hit area */
     .touch-target-expanded::after {
       content: '';
       position: absolute;
       top: 50%;
       left: 50%;
       transform: translate(-50%, -50%);
       min-width: 44px;
       min-height: 44px;
     }
     ```
  2. Nâng kích thước nút "+" trên Menu Card từ `w-9 h-9` lên tối thiểu `w-11 h-11` (44×44px).
  3. Nâng các nút tăng giảm số lượng giỏ hàng lên `w-9 h-9` (36px) kết hợp padding bao quanh hoặc `w-10 h-10` (40px) có margin an toàn.
  4. Nâng kích thước nút xoá món Trash từ icon 14px lên icon 18px với vùng đệm nút tối thiểu `p-2.5` (40×40px).
- **Mức độ khó (Effort):** Vừa (M) — ~1 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Kiểm tra trên mobile với chế độ hiển thị Touch Bounds trong DevTools; đảm bảo không có touch target nào dưới 44×44px gây chồng chéo vùng chạm (hitbox overlap).

---

#### MOB-003 | P1 | CONFIRMED | Owner Orders View / Operational Hub
- **Tiêu đề:** Khoảng Cách Quá Hẹp Giữa Thao Tác Huỷ (Destructive) Và Tiếp Nhận Đơn (Constructive)
- **Vị trí bằng chứng:**
  * [`components/operational/owner-orders-view.tsx#L1158-L1225`](../../components/operational/owner-orders-view.tsx):
    ```tsx
    <div className="flex items-center gap-1.5 shrink-0">
      {order.status === "PENDING" && (
        <>
          <button
            type="button"
            onClick={() => handleUpdateStatus(order.id, "CANCELLED")}
            className="px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg min-h-[40px] flex items-center gap-1"
          >
            <XCircle className="w-3.5 h-3.5" />
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => handleUpdateStatus(order.id, "ACCEPTED")}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg min-h-[40px] flex items-center gap-1"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Xác nhận
          </button>
        </>
      )}
    </div>
    ```
- **Kỳ vọng:** Hành động huỷ đơn (irreversible destructive action) phải được tách biệt rõ ràng về mặt không gian với hành động xác nhận đơn (primary constructive action), hoặc phải có bước xác nhận bổ sung (confirmation dialog / sheet).
- **Thực tế / Rủi ro:**
  * Hai nút được đặt cạnh nhau trong cùng một hàng flex với khoảng cách `gap-1.5` (chỉ đúng **6px**).
  * Chiều cao nút `min-h-[40px]` chưa đạt 44px, nhưng chiều ngang của nút "Huỷ" rất hẹp.
  * Khi quán đông khách, nhân viên thu ngân/pha chế thao tác bằng ngón tay cái trên điện thoại dễ dàng bấm nhầm vào nút "Huỷ" màu đỏ thay vì "Xác nhận". Khi bị bấm nhầm, đơn hàng chuyển thẳng sang trạng thái `CANCELLED` mà không có hộp thoại xác nhận nào!
- **Nguyên nhân gốc rễ (Root Cause):** Gom cụm thao tác (action cluster) theo dạng compact trên desktop mà không tính đến sai số tiếp xúc ngón tay (finger tap target radius ~8-10mm) trên thiết bị di động.
- **Đề xuất khắc phục (Recommendation):**
  1. Tách nút "Huỷ" sang menu phụ (dấu 3 chấm `...`) hoặc đặt khoảng cách tối thiểu giữa 2 nút là `16px`.
  2. Bắt buộc hiển thị Bottom Sheet hoặc Modal xác nhận: *"Bạn có chắc chắn muốn huỷ đơn hàng #XYZ không? Thao tác này không thể hoàn tác."* kèm lý do huỷ.
  3. Đặt nút "Xác nhận" làm nút Full-width hoặc chiếm ưu thế thị giác chính trên mobile card.
- **Mức độ khó (Effort):** Nhỏ (S) — ~0.5 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Kiểm tra thao tác chuyển trạng thái đơn hàng trên màn hình cảm ứng di động; đảm bảo việc ấn nút "Huỷ" luôn yêu cầu xác nhận lần hai.

---

#### MOB-004 | P1 | CONFIRMED | Payroll Reports View
- **Tiêu đề:** Cột Sticky Employee Chiếm Tới 96% Chiều Rộng Viewport Trên Màn 320px–375px Trong Bảng Lương
- **Vị trí bằng chứng:**
  * [`app/globals.css#L2010-L2024`](../../app/globals.css):
    ```css
    .payroll-table .sticky-column,
    .payroll-table .employee-cell {
      position: sticky;
      left: 0;
      z-index: 2;
      background: var(--surface);
      min-width: 248px;
      max-width: 300px;
    }
    ```
  * [`components/payroll-reports-view.tsx#L337-L398`](../../components/payroll-reports-view.tsx):
    Bảng lương có nhiều cột: Tên nhân viên (sticky), Vị trí, Tổng giờ làm, Giờ chuẩn, Giờ tăng ca, Thưởng, Khấu trừ, Thực lĩnh, Trạng thái.
- **Kỳ vọng:** Khi cuộn ngang trên thiết bị di động, cột cố định chỉ nên chiếm tối đa 35% - 40% bề ngang màn hình để chừa ít nhất 60% không gian cho các cột số liệu cuộn ngang.
- **Thực tế / Rủi ro:**
  * Trên màn hình `320px` (trừ padding viền của thẻ card 24px + viền = vùng nội dung khả dụng chỉ còn khoảng **260px**): Cột sticky có `min-width: 248px` chiếm **96% chiều rộng**!
  * Vùng cuộn ngang hiển thị các cột số liệu chỉ còn đúng **12px** — gần như bị che phủ hoàn toàn.
  * Trên màn hình `375px`: Cột sticky chiếm tới **70% chiều rộng**, chỉ còn khoảng 100px để cuộn, gây ức chế tột độ khi đọc bảng lương.
- **Nguyên nhân gốc rễ (Root Cause):** Áp dụng kích thước cố định máy tính (`min-width: 248px`) cho cột nhân viên trên cả màn hình di động mà không có media query thu gọn layout.
- **Đề xuất khắc phục (Recommendation):**
  1. Trên màn hình di động (`@media (max-width: 720px)`), giảm `min-width` của cột nhân viên xuống `120px - 140px`:
     - Ẩn avatar lớn, chỉ hiển thị họ tên rút gọn và mã nhân viên nhỏ.
     - Cho phép ellipsis text nếu tên dài.
  2. Bổ sung chế độ xem dạng **Thẻ tóm tắt di động (Card-based view)** cho từng nhân viên trên mobile thay vì ép buộc dùng bảng ngang (Data Table): Mỗi nhân viên là 1 card có thể mở rộng (accordion) để xem chi tiết giờ công và lương.
- **Mức độ khó (Effort):** Vừa (M) — ~1.5 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Kiểm tra trang Báo cáo Lương trên viewport 320px, 375px và 390px; đảm bảo các cột dữ liệu giờ làm, lương thực lĩnh cuộn ngang mượt mà, đọc rõ ràng.

---

#### MOB-005 | P2 | CONFIRMED | Schedule View
- **Tiêu đề:** Lịch Tuần Thiếu Cột Nhân Viên Cố Định Và Thiếu Visual Affordance Cho Vùng Cuộn Ngang
- **Vị trí bằng chứng:**
  * [`components/operational/schedule-view.tsx#L504-L558`](../../components/operational/schedule-view.tsx):
    ```tsx
    <div className="overflow-x-auto pb-4">
      <div className="week-grid" style={{ minWidth: 700 }}>
        {/* Hàng tiêu đề các thứ trong tuần: T2 -> CN */}
        ...
        {/* Danh sách nhân viên và các ca */}
        <div className="week-row flex">
          <div className="week-person w-36 shrink-0">...</div>
          <div className="week-days flex-1 grid grid-cols-7">...</div>
        </div>
      </div>
    </div>
    ```
- **Kỳ vọng:** Khi cuộn ngang một bảng lịch làm việc tuần rộng 700px trên màn hình điện thoại 375px:
  1. Cột tên nhân viên (`.week-person`) phải cố định ở mép trái (`position: sticky; left: 0`) để người dùng luôn biết ca làm này của ai khi cuộn đến thứ Sáu, thứ Bảy, Chủ nhật.
  2. Phải có chỉ báo trực quan (scroll shadow / gradient indicator) để người dùng nhận biết bảng có thể cuộn ngang.
- **Thực tế / Rủi ro:**
  * Cột `.week-person` không có thuộc tính `sticky`. Khi cuộn sang phải để xem lịch cuối tuần, tên nhân viên biến mất khỏi màn hình! Người quản lý không thể biết ô ca làm hiện tại thuộc về nhân viên nào nếu không cuộn ngược lại mép trái.
  * Thiếu hoàn toàn vạch bóng đổ (scroll cue / shadow), người dùng mới lầm tưởng lịch chỉ có từ Thứ Hai đến Thứ Tư.
- **Nguyên nhân gốc rễ (Root Cause):** Component lịch tuần thiết kế theo mô hình bảng đơn giản mà chưa bổ sung CSS sticky header/column cho trục ngang.
- **Đề xuất khắc phục (Recommendation):**
  1. Thêm `sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]` cho cột `.week-person`.
  2. Bổ sung container bóng đổ hiển thị động khi scroll position > 0.
  3. Cung cấp toggle chuyển đổi giữa "Xem theo tuần (Lưới)" và "Xem theo ngày (Danh sách thẻ)" trên mobile.
- **Mức độ khó (Effort):** Vừa (M) — ~1 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Cuộn ngang lịch tuần trên mobile viewport 375px; xác nhận tên nhân viên luôn hiển thị cố định ở lề trái và hiển thị đổ bóng rõ ràng.

---

#### MOB-006 | P2 | CONFIRMED | Settings View (Geofence)
- **Tiêu đề:** Bản Đồ Leaflet Map Cài Đặt Geofence Bắt Cử Chỉ Vuốt Cuộn Trang (Scroll Trap) Trên Mobile
- **Vị trí bằng chứng:**
  * [`components/operational/settings-view.tsx#L400-L425`](../../components/operational/settings-view.tsx):
    Container bản đồ Leaflet Map hiển thị bán kính geofence với chiều cao ~280px–320px chiếm toàn bộ chiều ngang màn hình di động.
- **Kỳ vọng:** Khi người dùng vuốt ngón tay dọc theo trang cài đặt để xem các phần bên dưới, bản đồ không được cướp cử chỉ cuộn trang trừ khi người dùng chủ động kích hoạt tương tác bản đồ.
- **Thực tế / Rủi ro:**
  * Leaflet map mặc định kích hoạt tính năng cảm ứng đa điểm và kéo bản đồ (`dragging: true`, `tap: true`).
  * Khi người dùng vuốt ngón tay từ giữa màn hình (rơi vào vùng bản đồ), toàn bộ cử chỉ vuốt bị bản đồ chặn lại để dịch chuyển tâm bản đồ thay vì cuộn trang xuống.
  * Người dùng bị kẹt ngón tay trong "bẫy cuộn" (Scroll Trap / Gesture Trap), không thể cuộn xuống nút "Lưu cấu hình" ở cuối trang nếu không khéo léo tìm khe hở vài pixel ở mép màn hình.
- **Nguyên nhân gốc rễ (Root Cause):** Khởi tạo bản đồ Leaflet trên web di động mà không vô hiệu hóa `scrollWheelZoom` và không sử dụng cơ chế yêu cầu chạm 2 ngón ("Use two fingers to move the map") hoặc nút kích hoạt chế độ chỉnh sửa vị trí.
- **Đề xuất khắc phục (Recommendation):**
  1. Cấu hình Leaflet Map trên mobile:
     - Tắt dragging mặc định hoặc yêu cầu cử chỉ hai ngón: `dragging: !L.Browser.mobile`.
     - Thêm lớp phủ (overlay) với nút: *"Chạm để tương tác bản đồ"* hoặc *"Khóa di chuyển bản đồ"*.
  2. Cung cấp nút chuyển đổi: *"Chạm để ghim vị trí hiện tại"* thay vì bắt người dùng kéo rê bản đồ trên màn hình nhỏ.
- **Mức độ khó (Effort):** Nhỏ (S) — ~0.5 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Dùng ngón tay vuốt dọc liên tục qua vùng bản đồ trên mobile; kiểm tra trang vẫn cuộn bình thường mà không bị kẹt.

---

#### MOB-007 | P2 | CONFIRMED | Settings / Team / Attendance Capture
- **Tiêu đề:** Tràn Bố Cục Và Nén Hẹp Nút Bấm Trên Màn Hình Siêu Hẹp 320px (Ultra-Narrow Devices)
- **Vị trí bằng chứng:**
  1. [`components/operational/settings-view.tsx#L354-L370`](../../components/operational/settings-view.tsx):
     Cụm nút chọn bán kính Geofence:
     ```tsx
     <div className="grid grid-cols-4 gap-2">
       <button ...>50m</button>
       <button ...>100m ⭐</button>
       <button ...>150m</button>
       <button ...>200m</button>
     </div>
     ```
     Trên 320px, mỗi nút chỉ có chiều rộng ~58px, chữ `"100m ⭐ Khuyên dùng"` bị nén gãy dòng nham nhở hoặc tràn ra khỏi nút.
  2. [`components/operational/team-view.tsx#L183-L199`](../../components/operational/team-view.tsx):
     Cụm nút bộ lọc vai trò và thêm nhân viên dùng `flex items-center gap-2` không có `flex-wrap`, gây tràn thanh cuộn ngang ngoài ý muốn trên 320px.
  3. [`components/attendance-capture.tsx#L527-L541`](../../components/attendance-capture.tsx):
     Cụm 3 nút chọn lý do ngoại lệ chấm công (Hỏng camera, Lỗi GPS, Khác) bị ép trong lưới `grid-cols-3` trên màn hình hẹp khiến text bị co cụm khó đọc.
- **Kỳ vọng:** Mọi lưới nút bấm và cụm bộ lọc phải tự động chuyển thành 2 cột (`grid-cols-2`) hoặc bọc dòng (`flex-wrap`) khi màn hình nhỏ hơn 360px.
- **Thực tế / Rủi ro:** Vỡ giao diện, text đè lên icon, hoặc sinh ra thanh cuộn ngang khó coi trên các thiết bị như iPhone SE thế hệ 1 hoặc màn hình phụ của máy gập.
- **Nguyên nhân gốc rễ (Root Cause):** Sử dụng các lớp lưới cứng (`grid-cols-4`, `grid-cols-3`) mà không có tiền tố responsive cho màn hình siêu nhỏ (`grid-cols-2 xs:grid-cols-4`).
- **Đề xuất khắc phục (Recommendation):**
  - Chuyển `grid-cols-4` sang `grid-cols-2 sm:grid-cols-4`.
  - Bổ sung `flex-wrap` cho tất cả các thanh công cụ và hàng nút tác vụ.
- **Mức độ khó (Effort):** Vừa (M) — ~0.5 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Kiểm tra hiển thị trên thiết bị 320px (DevTools Responsive mode: 320×568); đảm bảo không có thanh cuộn ngang ngoài ý muốn của trang (`body` không bị tràn).

---

#### MOB-008 | P2 | CONFIRMED | Cart Drawer / Operational Modals
- **Tiêu đề:** Nguy Cơ Che Khuất Do Bàn Phím Ảo (Virtual Keyboard Occlusion) Khi Nhập Liệu Trong Drawer
- **Vị trí bằng chứng:**
  * [`components/order/cart-drawer.tsx#L283-L321`](../../components/order/cart-drawer.tsx):
    Form nhập:
    - Họ và tên người nhận
    - Số điện thoại người nhận
    - Số bàn (nếu ngồi tại quán)
    - Ghi chú đơn hàng (textarea)
    Nằm ở nửa dưới của Drawer, ngay phía trên thanh nút thanh toán cố định.
  * [`components/operational/team-view.tsx#L555-L612`](../../components/operational/team-view.tsx):
    Modal thêm/sửa nhân viên với các trường nhập lương, email, số điện thoại.
- **Kỳ vọng:** Khi người dùng chạm vào ô input (focus), bàn phím ảo (Software Keyboard) trên iOS Safari / Android Chrome đẩy lên, ô input phải tự động cuộn vào vùng nhìn thấy an toàn (`scrollIntoView({ block: 'center' })`) và nút hành động không được đè mất trường đang nhập.
- **Thực tế / Rủi ro:**
  * Container Drawer sử dụng `h-full` hoặc `max-h-[90vh]` thay vì đơn vị viewport động `dvh` (`100dvh`).
  * Khi bàn phím ảo xuất hiện trên iOS, chiều cao viewport co lại còn ~50% (~350px).
  * Drawer không phản ứng linh hoạt với `window.visualViewport.height`, dẫn tới việc ô nhập Số bàn hoặc Ghi chú bị che khuất hoàn toàn phía sau bàn phím ảo. Khách hàng phải gõ chữ "mù" mà không thấy mình đang nhập gì.
- **Nguyên nhân gốc rễ (Root Cause):** Chưa ứng dụng các đơn vị viewport hiện đại (`dvh`, `svh`) và thiếu thuộc tính CSS `scroll-margin-bottom: 200px` trên các trường nhập liệu bên trong Modal/Drawer.
- **Đề xuất khắc phục (Recommendation):**
  1. Cập nhật CSS Drawer và Modal:
     ```css
     .cart-drawer-content {
       max-height: 90dvh;
       overflow-y: auto;
       -webkit-overflow-scrolling: touch;
     }
     .cart-drawer-content input,
     .cart-drawer-content textarea {
       scroll-margin-bottom: 120px;
     }
     ```
  2. Bổ sung listener lắng nghe sự kiện `visualViewport.onresize` nếu cần thiết lập khoảng trống dự phòng khi bàn phím xuất hiện.
- **Mức độ khó (Effort):** Vừa (M) — ~1 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Kiểm tra trên Safari iOS và Chrome Android thật; chạm vào ô ghi chú đơn hàng trong giỏ, xác nhận ô textarea cuộn mượt mà lên trên bàn phím ảo.

---

#### MOB-009 | P3 | CONFIRMED | Global Styling / Motion Accessibility
- **Tiêu đề:** Thiếu Hỗ Trợ Toàn Diện Cho `prefers-reduced-motion` Cho Các Hiệu Ứng Chuyển Động
- **Vị trí bằng chứng:**
  * [`components/order/order-tokens.css#L70-L100`](../../components/order/order-tokens.css):
    Định nghĩa nhiều keyframe animation: `slideUp`, `drawerEnter`, `pulseSubtle`, `bounceCart`.
  * Không tìm thấy bất kỳ khai báo `@media (prefers-reduced-motion: reduce)` nào trong file này.
- **Kỳ vọng:** Đáp ứng chuẩn WCAG 2.1 SC 2.3.3 (Animation from Interactions): Các hiệu ứng chuyển động trượt, nảy, zoom phải được tắt hoặc thay thế bằng hiệu ứng mờ dần (opacity fade) khi người dùng bật chế độ giảm chuyển động trong cài đặt thiết bị di động (để phòng tránh chóng mặt, say xe).
- **Thực tế / Rủi ro:** Người dùng có bệnh lý tiền đình hoặc nhạy cảm với chuyển động khi thao tác trên điện thoại có thể gặp cảm giác khó chịu khi các drawer và modal liên tục trượt nảy.
- **Nguyên nhân gốc rễ (Root Cause):** Bỏ qua media query trợ năng chuyển động khi định nghĩa animation CSS.
- **Đề xuất khắc phục (Recommendation):**
  Bổ sung vào [`app/globals.css`](../../app/globals.css) và [`components/order/order-tokens.css`](../../components/order/order-tokens.css):
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
- **Mức độ khó (Effort):** Nhỏ (S) — ~0.25 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Bật "Reduce Motion" trong cài đặt iOS/Android hoặc giả lập trong Chrome DevTools (`Rendering -> Emulate CSS media feature prefers-reduced-motion: reduce`); kiểm tra drawer mở tức thì không giật lag.

---

#### MOB-010 | P3 | CONFIRMED | Typography / Text Scaling Accessibility
- **Tiêu đề:** Rủi Ro Vỡ Bố Cục Khi Phóng To Cỡ Chữ (Dynamic Type / 200% Font Scale)
- **Vị trí bằng chứng:**
  * [`components/order/menu-card.tsx#L52`](../../components/order/menu-card.tsx):
    Thẻ món ăn sử dụng `line-clamp-2` kết hợp container flex bị giới hạn chiều cao cố định của ảnh và nội dung.
  * [`components/app-shell.tsx#L182`](../../components/app-shell.tsx):
    Thanh topbar di động có `h-14` (56px cố định).
- **Kỳ vọng:** Đáp ứng WCAG 2.1 SC 1.4.4 (Resize Text): Giao diện có thể phóng to chữ lên đến 200% mà không làm mất thông tin hoặc vỡ layout nghiêm trọng.
- **Thực tế / Rủi ro:** Khi người lớn tuổi hoặc người thị lực kém cài đặt font chữ lớn trong máy, tên quán và thông tin ca trực trong topbar bị cắt bớt; giá món và tên món ăn trên menu card tràn đè lên nút "+" thêm món.
- **Nguyên nhân gốc rễ (Root Cause):** Sử dụng các thuộc tính chiều cao cố định (`h-14`, `h-16`) thay vì `min-h-*` tự co giãn theo nội dung chữ.
- **Đề xuất khắc phục (Recommendation):**
  - Chuyển các container header từ `h-14` sang `min-h-[56px] py-2`.
  - Cho phép menu card co giãn chiều cao linh hoạt theo cỡ chữ (`min-h` thay vì fixed constraints).
- **Mức độ khó (Effort):** Vừa (M) — ~0.5 ngày công.
- **Kiểm thử hồi quy (Regression Test):** Bật chế độ phóng to font 200% trong trình duyệt; kiểm tra nội dung text không bị đè lấn hoặc cắt mất chữ.

---

## 6. Các khu vực chưa thể kiểm chứng & Giới hạn môi trường (Unverified Areas & Limitations)

1. **Kiểm thử trên thiết bị phần cứng thật (Physical Hardware Testing):**
   - Đợt audit này được thực hiện trong môi trường tĩnh thông qua phân tích mã nguồn và kiểm tra box-model CSS. Chưa chạy trên thiết bị iOS thật để kiểm tra độ trễ 300ms của touch-action, hành vi bàn phím ảo của Safari khi gõ tiếng Việt (Telex) và thanh địa chỉ tự ẩn của Safari di động.
2. **Quyền Camera & Tọa độ GPS thực tế:**
   - Đã xác minh luồng code xử lý lỗi quyền trong [`components/attendance-capture.tsx`](../../components/attendance-capture.tsx), nhưng độ chính xác GPS thực tế phụ thuộc vào phần cứng điện thoại nhân viên và độ che phủ vệ tinh tại cửa hàng.
3. **Hiệu năng cuộn trên điện thoại cấu hình thấp (Low-end Android Performance):**
   - Các hiệu ứng backdrop-blur trong [`app/globals.css`](../../app/globals.css) (`backdrop-filter: blur(12px)`) chưa được đo lường FPS thực tế trên các dòng máy Android giá rẻ; có nguy cơ tụt khung hình khi cuộn trang dài.

---

## 7. Năm Ưu tiên Khắc phục Tiếp theo (Top 5 Remediation Priorities)

Dưới đây là 5 đầu việc ưu tiên cần thực hiện ngay theo thứ tự tác động vận hành:

1. **[ƯU TIÊN 1 - Fix MOB-001] Khắc phục triệt để lỗi Overlap đáy màn hình:**
   - Đồng bộ biến khoảng đệm an toàn `--mobile-bottom-space` bao gồm cả chiều cao thanh điều hướng và nút CTA nổi.
   - Bổ sung đệm đáy tối thiểu **160px** cho Today View và Attendance View.
2. **[ƯU TIÊN 2 - Fix MOB-003] Tách biệt nút Huỷ đơn và Xác nhận đơn:**
   - Bổ sung hộp thoại Bottom Sheet xác nhận trước khi huỷ đơn hàng trên màn hình của Quản lý.
   - Tăng khoảng cách an toàn giữa hai nút tối thiểu 16px để triệt tiêu hoàn toàn rủi ro bấm nhầm.
3. **[ƯU TIÊN 3 - Fix MOB-002] Chuẩn hóa kích thước Touch Targets >= 44×44px:**
   - Tăng kích thước nút "+" trên Menu Card lên `w-11 h-11` (44px).
   - Tăng kích thước nút tăng/giảm và xoá món trong Giỏ hàng để ngón cái thao tác chính xác.
4. **[ƯU TIÊN 4 - Fix MOB-004] Tái cấu trúc Bảng lương trên màn hình hẹp (320px–375px):**
   - Giảm chiều rộng cột cố định nhân viên xuống còn 120px trên mobile.
   - Xây dựng chế độ xem danh thiếp (Card view) thay thế bảng bảng ngang khi chiều rộng < 720px.
5. **[ƯU TIÊN 5 - Fix MOB-006] Vô hiệu hóa bẫy cuộn Leaflet Map:**
   - Tắt tính năng kéo bản đồ một ngón mặc định trên mobile tại màn hình Cài đặt Geofence.
   - Bổ sung nút chuyển đổi chế độ ghim vị trí an toàn.

---

## 8. Kế hoạch Triển khai Khắc phục Dạng Task (Implementation Task Plan)

```
[TASK-MOB-01] Sửa lỗi che khuất chân trang (MOB-001)
├── Files: app/globals.css, components/operational/today-view.tsx, components/attendance-capture.tsx
├── Actions:
│   ├── Thêm biến CSS --mobile-nav-total-height và --mobile-cta-total-height vào :root
│   ├── Tạo utility class .has-mobile-nav và .has-mobile-nav-and-cta
│   └── Gắn class vào container của Today View và Attendance View
└── Acceptance Criteria:
    └── Trên viewport 375px, cuộn hết trang, toàn bộ text và nút cuối cùng lộ rõ bên trên CTA >= 16px.

[TASK-MOB-02] Tách biệt hành động huỷ đơn & Thêm xác nhận (MOB-003)
├── Files: components/operational/owner-orders-view.tsx
├── Actions:
│   ├── Tách nút "Huỷ" và "Xác nhận" ra xa nhau (gap-4)
│   ├── Thêm state confirmCancelOrderId và modal/drawer xác nhận huỷ
│   └── Chỉ chuyển trạng thái CANCELLED khi người dùng bấm xác nhận lần 2
└── Acceptance Criteria:
    └── Không thể vô tình huỷ đơn bằng 1 lần chạm duy nhất; bắt buộc qua bước xác nhận.

[TASK-MOB-03] Mở rộng Touch Targets đạt chuẩn WCAG (MOB-002)
├── Files: components/order/menu-card.tsx, components/order/cart-drawer.tsx, components/operational/requests-view.tsx
├── Actions:
│   ├── Nâng nút thêm món từ w-9 h-9 lên w-11 h-11
│   ├── Nâng nút tăng/giảm số lượng giỏ hàng lên w-9 h-9 với padding bao quanh
│   ├── Nâng nút xoá món giỏ hàng lên vùng chạm 40x40px
│   └── Thêm padding tối thiểu py-2 px-3 cho các nút duyệt yêu cầu
└── Acceptance Criteria:
    └── Mọi phần tử có thể tương tác đều đạt diện tích chạm tối thiểu 44x44px trong DevTools Inspector.

[TASK-MOB-04] Responsive cho Bảng lương & Lịch tuần (MOB-004, MOB-005)
├── Files: app/globals.css, components/payroll-reports-view.tsx, components/operational/schedule-view.tsx
├── Actions:
│   ├── Thêm media query max-width 720px thu nhỏ cột nhân viên xuống 130px trong payroll table
│   ├── Thêm sticky left-0 cho cột nhân viên trong schedule-view
│   └── Thêm scroll cue bóng đổ mờ ở mép phải bảng khi có nội dung cuộn ngang
└── Acceptance Criteria:
    └── Trên màn hình 320px, bảng lương vẫn nhìn thấy các cột số liệu; lịch tuần cuộn ngang không mất tên nhân viên.

[TASK-MOB-05] Xử lý bẫy cuộn bản đồ & Bố cục 320px siêu hẹp (MOB-006, MOB-007, MOB-008)
├── Files: components/operational/settings-view.tsx, components/order/cart-drawer.tsx
├── Actions:
│   ├── Cấu hình Leaflet Map dragging: false trên mobile, thêm nút "Chạm để mở khoá di chuyển bản đồ"
│   ├── Đổi lưới chọn bán kính geofence thành grid-cols-2 sm:grid-cols-4
│   └── Đặt max-height: 90dvh và scroll-margin-bottom cho input trong Cart Drawer
└── Acceptance Criteria:
    └── Vuốt ngón tay qua bản đồ cuộn trang bình thường; 320px không bị vỡ nút; mở bàn phím ảo không che input.
```

---

## 9. Tiêu chuẩn Nghiệm thu Hoàn thành (Definition of Done)

Một bản vá cho các vấn đề Mobile UX chỉ được coi là hoàn tất khi đáp ứng:
1. **Kiểm tra trực quan đa kích thước:** Đã kiểm thử trực tiếp trên các breakpoint mô phỏng `320px`, `375px`, `390px`, `430px` và `768px`.
2. **Không có thanh cuộn ngang trang (No horizontal scroll on body):** `document.body.clientWidth` bằng đúng `window.innerWidth`.
3. **Diện tích chạm chuẩn:** Không còn phần tử bấm tương tác chính nào có diện tích chạm dưới `44×44px`.
4. **Không che khuất nội dung:** Các thanh điều hướng đáy và floating CTA không che lấp bất kỳ nội dung hoặc nút bấm nào khi cuộn kịch sàn.
5. **An toàn thao tác nhạy cảm:** Mọi thao tác xoá/huỷ đơn đều có khoảng cách an toàn và cơ chế xác nhận.
6. **Không làm thay đổi tech stack hay cấu trúc dữ liệu:** Tuyệt đối giữ vững kiến trúc chuẩn của LoopiCafe.
