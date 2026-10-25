import { LegalPage } from "@/components/legal-page";

export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng" intro="LoopyCafe là công cụ hỗ trợ vận hành nội bộ. Các quyết định nhân sự vẫn thuộc trách nhiệm của chủ quán và quản lý.">
      <section><h2>Sử dụng đúng mục đích</h2><p>Người dùng chỉ truy cập dữ liệu của cửa hàng và vai trò được giao, không chia sẻ tài khoản hoặc bằng chứng chấm công ra ngoài khi chưa được phép.</p></section>
      <section><h2>Bằng chứng chấm công</h2><p>Ảnh, vị trí và khoảng cách chỉ là dữ liệu hỗ trợ xem xét. Chúng không tự động chứng minh danh tính hay sự hiện diện thực tế.</p></section>
      <section><h2>Chỉnh sửa và phê duyệt</h2><p>Mọi điều chỉnh giờ làm phải có lý do và lịch sử kiểm tra. Bản ghi gốc không bị âm thầm thay thế.</p></section>
      <section><h2>Giới hạn phạm vi</h2><p>LoopyCafe không thay thế POS, kế toán, thanh toán, bảng lương hoàn chỉnh hoặc ứng dụng giao hàng.</p></section>
    </LegalPage>
  );
}
