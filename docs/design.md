# Hệ thống thiết kế UI/UX — LoopyCafe

Cập nhật: 2026-10-17. Đây là nguồn chuẩn cho quy tắc giao diện dùng chung. Cấu trúc và nội dung từng màn hình nằm tại [hướng dẫn màn hình](ui-ux-guidelines.md).

## 1. Định hướng

- Ưu tiên công việc đang diễn ra trong quán hơn thông tin tham khảo.
- Thiết kế cho điện thoại trước; tablet và desktop chỉ mở rộng không gian.
- Mỗi màn hình có một mục tiêu chính và một hành động chính.
- Giao diện ngắn gọn, ấm áp, rõ trạng thái và dễ dùng khi đang bận.
- Chỉ hiển thị hành động người dùng thực sự được phép thực hiện.

LoopyCafe là tên phần mềm. La Boong là nhận diện của cửa hàng demo; không thay thế hai tên cho nhau.

## 2. Mobile-first

- Nội dung quan trọng nhất nằm ở đầu màn hình.
- Hành động chính nằm trong vùng dễ chạm bằng một tay và không bị thanh điều hướng che.
- Vùng chạm tối thiểu 44 × 44 px; các vùng chạm liền nhau cách ít nhất 8 px.
- Nội dung dùng một cột trên điện thoại. Chỉ tách cột khi màn hình rộng hơn và việc so sánh có ích.
- Không cho phép cuộn ngang toàn trang. Danh mục ngắn có thể cuộn ngang khi luôn nhìn thấy mục đang chọn.
- Thay bảng rộng bằng thẻ, danh sách hoặc phần tóm tắt có thể mở chi tiết.
- Form chỉ hỏi thông tin cần thiết, dùng nhãn luôn nhìn thấy và bàn phím phù hợp với dữ liệu.
- Khi bàn phím mở, trường đang nhập và nút tiếp tục vẫn phải nhìn thấy.
- Responsive phải giữ đủ nội dung, hành động và trạng thái; không chỉ thu nhỏ giao diện desktop.

## 3. Phân cấp nội dung

Thứ tự mặc định của một màn hình:

1. Tiêu đề và ngữ cảnh hiện tại.
2. Trạng thái hoặc cảnh báo cần xử lý ngay.
3. Hành động chính.
4. Nội dung phục vụ quyết định.
5. Hành động phụ và thông tin mở rộng.

Tiêu đề trang ngắn và duy nhất. Tiêu đề phần mô tả một nhóm nội dung. Con số, tiền và thời gian cần dễ quét và căn thẳng khi đặt cạnh nhau.

- Tiêu đề dùng Trebuchet MS; nội dung dùng Segoe UI hoặc font hệ thống tương đương.
- Thang chữ chính: 32 px cho tiêu đề nổi bật, 24 px cho tiêu đề trang, 20 px cho tiêu đề phần, 16 px cho nội dung và 14 px cho chú thích.
- Nội dung dùng độ đậm thường; nhãn và tiêu đề dùng độ đậm vừa hoặc đậm. Không dùng quá nhiều cỡ hoặc độ đậm trên cùng màn hình.
- Dòng nội dung có khoảng cách thoáng; đoạn dài không vượt quá chiều rộng đọc thoải mái.

## 4. Màu sắc và phong cách

### Khu vực vận hành LoopyCafe

| Vai trò | Màu chuẩn | Cách dùng |
|---|---|---|
| Nền | Cream `#FFFAF4` | Nền trang |
| Bề mặt | White `#FFFFFF` | Thẻ, form, hộp thoại |
| Thương hiệu | Burgundy `#6F2939` | Hành động chính, mục đang chọn |
| Chữ chính | Ink `#332A2B` | Nội dung cần đọc |
| Chữ phụ | Muted `#635657` | Mô tả và metadata |
| Thành công | Green `#2E7D32` | Hoàn tất hoặc hợp lệ |
| Cảnh báo | Amber `#A65300` | Cần chú ý hoặc chờ xử lý |
| Lỗi | Red `#A83D4C` | Lỗi hoặc hành động nguy hiểm |

### Menu khách La Boong

Dùng Olive làm màu chính, Cream làm nền và Terracotta cho hành động đặt món. Không mang palette này sang khu vực vận hành nếu không có quyết định đổi nhận diện.

Màu không được là dấu hiệu duy nhất. Mọi trạng thái phải có nhãn chữ; icon chỉ hỗ trợ nhận biết. Giữ tương phản chữ dễ đọc, tối thiểu theo WCAG 2.2 AA.

## 5. Khoảng cách và bề mặt

- Dùng nhịp 4/8 px; ưu tiên các khoảng 8, 12, 16, 24 và 32 px.
- Khoảng cách trong cùng nhóm nhỏ hơn khoảng cách giữa hai nhóm.
- Dùng bo góc 8 px cho chi tiết nhỏ, 12 px cho nút và trường nhập, 16 px cho thẻ, 20 px cho hộp thoại.
- Thẻ cùng cấp có padding, bo góc, viền và bóng thống nhất.
- Dùng bóng nhẹ để phân lớp, không dùng hiệu ứng trang trí làm mờ nội dung.
- Nội dung dài có chiều rộng đọc thoải mái trên tablet và desktop; không kéo chữ tràn toàn màn hình.

## 6. Thành phần dùng chung

| Thành phần | Quy tắc |
|---|---|
| Nút | Nhãn bắt đầu bằng động từ; mỗi màn hình chỉ có một nút chính nổi bật; có trạng thái đang xử lý và vô hiệu hóa rõ ràng. |
| Trường nhập | Có nhãn cố định; hướng dẫn ngắn khi cần; lỗi đặt ngay dưới trường và chỉ cách sửa. |
| Thẻ | Gom một đối tượng hoặc một quyết định; toàn thẻ chỉ bấm được khi hành vi đó rõ ràng. |
| Nhãn trạng thái | Luôn có chữ; cùng một trạng thái dùng cùng màu và cách gọi ở mọi màn hình. |
| Hộp thoại | Dùng cho quyết định ngắn cần tập trung; nêu rõ tác động, có đóng/quay lại và không làm mất dữ liệu chưa lưu. |
| Danh sách | Ưu tiên trên mobile; đặt thông tin quan trọng và hành động thường dùng lên trước. |
| Bảng | Chỉ dùng khi người dùng cần so sánh nhiều hàng/cột; trên mobile chuyển thành tóm tắt và chi tiết. |
| Icon | Dùng một phong cách vector nhất quán; có nhãn khi ý nghĩa không hiển nhiên; không dùng emoji làm icon chức năng. |

## 7. Điều hướng

- Điều hướng chính giữ nguyên vị trí và cách gọi giữa các màn hình.
- Mobile chỉ giữ tối đa năm điểm đến quan trọng; phần còn lại đặt trong menu phụ.
- Mục hiện tại luôn được đánh dấu rõ bằng màu và chữ.
- Nút quay lại đưa người dùng về đúng ngữ cảnh trước đó, giữ bộ lọc và vị trí cuộn khi phù hợp.
- Không trộn tab, thanh dưới và menu bên cho cùng một cấp điều hướng.
- Chức năng chưa có quyền phải được ẩn hoặc giải thích rõ; không để nút bấm dẫn đến ngõ cụt.

## 8. Phản hồi và trạng thái

Mọi màn hình có dữ liệu phải thiết kế đủ năm trạng thái:

| Trạng thái | Cách thể hiện |
|---|---|
| Đang tải | Giữ bố cục ổn định; cho biết nội dung nào đang được tải. |
| Không có dữ liệu | Giải thích ngắn và đưa hành động tiếp theo khi có. |
| Lỗi | Nói điều gì không thực hiện được và cách thử lại; không thay lỗi bằng trạng thái trống. |
| Thành công | Xác nhận kết quả và cho biết bước tiếp theo hoặc trạng thái mới. |
| Dữ liệu đã cũ | Giữ nội dung gần nhất, ghi thời điểm cập nhật và cho phép tải lại. |

Khi đang gửi, khóa hành động lặp và vẫn cho người dùng biết hệ thống đang xử lý. Nếu kết quả chưa chắc chắn, hiển thị “Đang kiểm tra kết quả”, không báo thành công hoặc mời gửi lại ngay.

## 9. Nội dung và trạng thái nghiệp vụ

- Dùng tiếng Việt trực tiếp, thân thiện và nhất quán.
- Thời gian dùng múi giờ Việt Nam; ca qua ngày phải hiện cả ngày bắt đầu và ngày kết thúc.
- Phân biệt rõ: “Đã ghi nhận”, “Chờ duyệt”, “Đã duyệt, chờ áp dụng”, “Đã áp dụng” và “Đã khóa”.
- Chỉ dùng “Đã áp dụng” khi thay đổi đã thực sự có hiệu lực.
- “Không có dữ liệu” khác với “Không tải được dữ liệu”.
- Hành động nguy hiểm phải nêu rõ tác động trước khi xác nhận; không đặt cạnh nút chính theo cách dễ bấm nhầm.

## 10. Khả năng tiếp cận và chuyển động

- Giao diện dùng được bằng bàn phím; thứ tự focus đi theo thứ tự nhìn.
- Focus luôn nhìn thấy và không bị header, thanh dưới hoặc hộp nổi che.
- Ảnh có ý nghĩa có mô tả; nút chỉ có icon phải có tên rõ ràng.
- Không phụ thuộc vào hover, thao tác vuốt hoặc kéo thả để hoàn thành việc quan trọng.
- Hỗ trợ phóng to 200% mà không mất nội dung hoặc hành động.
- Chuyển động chỉ giải thích thay đổi trạng thái, diễn ra nhanh và tôn trọng lựa chọn giảm chuyển động.
- Camera và vị trí chỉ mở sau thao tác chủ động; khi bị từ chối phải có hướng xử lý tiếp.

## 11. Checklist trước khi duyệt

- Mục đích, thông tin quan trọng và hành động chính có rõ trong vài giây đầu không?
- Màn hình 375 px có dùng được bằng một tay, không cuộn ngang và không bị che nội dung không?
- Loading, empty, error, success và retry đã rõ chưa?
- Nút, form, thẻ, màu, khoảng cách và icon có theo quy tắc chung không?
- Nội dung, trạng thái và hành động có đúng vai trò người dùng không?
- Keyboard, focus, tương phản, zoom và giảm chuyển động có dùng được không?

Đánh giá bằng hành trình thực tế và nội dung người dùng đọc được; ảnh chụp đẹp không đủ để kết luận trải nghiệm đạt yêu cầu.
