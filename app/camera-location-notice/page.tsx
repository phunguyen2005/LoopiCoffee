import { LegalPage } from "@/components/legal-page";
import { ConsentAction } from "@/components/consent-action";

export default function CameraLocationNoticePage() {
  return (
    <LegalPage
      title="Ảnh & vị trí khi chấm công"
      intro="LoopyCafe chỉ yêu cầu camera và vị trí sau khi nhân viên chủ động bấm chấm công. Đây là bằng chứng hỗ trợ quản lý xem xét, không phải công cụ theo dõi."
      icon="camera"
    >
      <section>
        <h2>Chúng tôi ghi nhận gì?</h2>
        <ul>
          <li>Một ảnh mới chụp trực tiếp từ camera trong trình duyệt.</li>
          <li>Vĩ độ, kinh độ và độ chính xác do thiết bị cung cấp tại thời điểm đó.</li>
          <li>Thời gian chính thức do máy chủ tạo, không dựa vào đồng hồ điện thoại.</li>
          <li>Khoảng cách tính từ vị trí được cung cấp đến tọa độ cửa hàng.</li>
        </ul>
      </section>
      <section>
        <h2>Điều LoopyCafe không làm</h2>
        <p>
          Ứng dụng không theo dõi vị trí nền, không dùng nhận diện khuôn mặt,
          không đọc Wi-Fi, không dùng ảnh có sẵn trong thư viện và không coi vị
          trí trình duyệt là bằng chứng tuyệt đối về sự hiện diện.
        </p>
      </section>
      <section>
        <h2>Ai có thể xem?</h2>
        <p>
          Chỉ chủ quán và quản lý được ủy quyền trong đúng cửa hàng có thể mở
          ảnh và tọa độ chi tiết. Nhân viên khác không thể xem dữ liệu này.
        </p>
      </section>
      <section>
        <h2>Lưu trong bao lâu?</h2>
        <p>
          Ảnh chấm công và vị trí chính xác được giữ tối đa 90 ngày rồi xóa.
          Thời gian chấm công, kết quả xét duyệt và tổng giờ làm có thể được giữ
          lâu hơn để phục vụ vận hành và đối soát.
        </p>
      </section>
      <section>
        <h2>Khi thiết bị không cấp quyền</h2>
        <p>
          Nhân viên vẫn có thể gửi một lượt chấm công ngoại lệ kèm lý do.
          Quản lý sẽ xem xét thủ công thay vì hệ thống làm mất thời gian làm việc.
        </p>
      </section>
      <ConsentAction />
    </LegalPage>
  );
}
