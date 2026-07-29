import { LegalPage } from "@/components/legal-page";

export default function PrivacyPage() {
  return (
    <LegalPage title="Quyền riêng tư" intro="LoopiCafe thu thập lượng dữ liệu tối thiểu cần thiết để vận hành ca làm, bảo vệ quyền truy cập theo vai trò và xóa bằng chứng nhạy cảm theo thời hạn.">
      <section><h2>Dữ liệu tài khoản</h2><p>Tên hiển thị, email, số điện thoại công việc, vai trò và trạng thái làm việc được dùng để xếp lịch và phân quyền.</p></section>
      <section><h2>Dữ liệu vận hành</h2><p>Lịch, chấm công, checklist, sự cố, bàn giao và yêu cầu được lưu để cửa hàng có lịch sử làm việc rõ ràng.</p></section>
      <section><h2>Dữ liệu nhạy cảm</h2><p>Ảnh và tọa độ chấm công chỉ dành cho quản lý/chủ quán, được lưu riêng tư và xóa theo thời hạn 90 ngày.</p></section>
      <section><h2>Liên hệ</h2><p>Nhân viên có thể liên hệ trực tiếp chủ quán để hỏi về dữ liệu, yêu cầu sửa thông tin tài khoản hoặc báo cáo quyền truy cập không phù hợp.</p></section>
    </LegalPage>
  );
}
