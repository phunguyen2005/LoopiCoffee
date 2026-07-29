import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { LoopyMark } from "@/components/loopy-mark";
import { LoopySticker } from "@/components/loopy-sticker";

const benefits = [
  {
    icon: Clock3,
    title: "Biết ai đang trong ca",
    text: "Lịch làm, đi trễ và giờ công được gom lại trong một luồng rõ ràng.",
  },
  {
    icon: ClipboardCheck,
    title: "Không bỏ sót việc trong ca",
    text: "Checklist mở ca, đóng ca và bàn giao luôn gắn với đúng người, đúng ca.",
  },
  {
    icon: Camera,
    title: "Bằng chứng minh bạch",
    text: "Ảnh chụp trực tiếp kèm thời gian máy chủ và vị trí do thiết bị cung cấp.",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand" aria-label="LoopiCafe - Trang chủ">
          <LoopyMark size="small" />
          <span>LoopiCafe</span>
        </Link>
        <nav aria-label="Điều hướng công khai">
          <Link href="/camera-location-notice" className="nav-link">
            Quyền riêng tư
          </Link>
          <Link href="/app" className="button button-compact">
            Vào cửa hàng <ArrowRight size={16} />
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={15} /> Vận hành quán nhẹ nhàng hơn
          </div>
          <h1>Quán vẫn chạy trơn tru, ngay cả khi bạn không có mặt.</h1>
          <p className="hero-lead">
            LoopiCafe giúp chủ quán theo dõi ca làm, chấm công, checklist và sự
            cố trong một nơi thân thiện, rõ ràng.
          </p>
          <div className="hero-actions">
            <Link href="/app" className="button button-large">
              Mở bảng điều hành <ArrowRight size={18} />
            </Link>
            <Link href="/camera-location-notice" className="button-secondary button-large">
              Cách chúng tôi dùng vị trí
            </Link>
          </div>
          <div className="trust-row">
            <span><CheckCircle2 size={16} /> Không theo dõi nền</span>
            <span><ShieldCheck size={16} /> Ảnh được giữ riêng tư</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Minh họa trạng thái vận hành LoopiCafe">
          <div className="hero-glow" />
          <div className="hero-mascot">
            <LoopySticker mood="celebrate" size={250} />
            <div className="speech-bubble">Mọi thứ ổn rồi nè! ♡</div>
          </div>
          <div className="floating-card floating-card-top">
            <span className="mini-icon mint"><MapPin size={16} /></span>
            <span><strong>Vị trí đã ghi nhận</strong><small>Độ chính xác ±18 m</small></span>
          </div>
          <div className="floating-card floating-card-bottom">
            <span className="mini-icon pink"><ClipboardCheck size={16} /></span>
            <span><strong>Mở ca hoàn tất</strong><small>6/6 công việc</small></span>
          </div>
        </div>
      </section>

      <section className="benefit-section" aria-labelledby="benefit-title">
        <div className="section-heading">
          <span>Nhìn nhanh. Xử lý sớm.</span>
          <h2 id="benefit-title">Một nhịp làm việc liền mạch cho cả quán</h2>
        </div>
        <div className="benefit-grid">
          {benefits.map(({ icon: Icon, title, text }) => (
            <article className="benefit-card" key={title}>
              <div className="benefit-icon"><Icon size={22} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="flow-strip" aria-label="Quy trình chính">
        {["Xếp lịch", "Chấm công", "Hoàn tất việc", "Báo sự cố", "Bàn giao"].map(
          (item, index) => (
            <div className="flow-step" key={item}>
              <span>{index + 1}</span>
              <strong>{item}</strong>
            </div>
          ),
        )}
      </section>

      <footer className="landing-footer">
        <div className="brand"><LoopyMark size="small" /><span>LoopiCafe</span></div>
        <p>Được thiết kế cho nhịp vận hành thật của một quán cà phê nhỏ.</p>
        <div>
          <Link href="/privacy">Quyền riêng tư</Link>
          <Link href="/terms">Điều khoản</Link>
        </div>
      </footer>
    </main>
  );
}
