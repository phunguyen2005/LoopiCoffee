import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Camera,
  ClipboardCheck,
  Clock3,
} from "lucide-react";
import { LoopyMark } from "@/components/loopy-mark";
import "./landing-video.css";

import { HeroAnimated } from "@/components/hero-animated";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const benefits = [
  {
    icon: Clock3,
    title: "Nắm tình hình ca làm",
    text: "Lịch làm, đi trễ và giờ công được gom lại trong một luồng rõ ràng.",
  },
  {
    icon: ClipboardCheck,
    title: "Chuẩn hóa việc mở và đóng quán",
    text: "Checklist mở ca, đóng ca và bàn giao luôn gắn với đúng người, đúng ca.",
  },
  {
    icon: Camera,
    title: "Xử lý vấn đề trước khi bị quên",
    text: "Báo cáo sự cố, hỏng hóc thiết bị và thiếu nguyên liệu ngay khi phát sinh.",
  },
];

export default function Home() {
  redirect("/auth/login");

  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand" aria-label="LoopyCafe - Trang chủ">
          <LoopyMark size="small" />
          <span>LoopyCafe</span>
        </Link>
        <nav aria-label="Điều hướng công khai">
          <Link href="/camera-location-notice" className="nav-link">
            Quyền riêng tư
          </Link>
          <Link href="/auth/login" className="button button-compact">
            Đăng nhập <ArrowRight size={16} />
          </Link>
        </nav>
      </header>

      <HeroAnimated />

      <section id="video-demo" className="landing-video-section" aria-labelledby="landing-video-title">
        <div className="landing-video-heading">
          <span>10 giây cùng LoopyCafe</span>
          <h2 id="landing-video-title">LoopyCafe trong 10 giây</h2>
          <p>
            Một góc nhìn trực quan về cách LoopyCafe giúp mọi ca làm trong quán luôn đúng nhịp. Quán vẫn chạy trơn tru mà Không theo dõi vị trí nền.
          </p>
        </div>
        <figure className="landing-video-card">
          <video
            className="landing-intro-video"
            controls
            playsInline
            preload="metadata"
            poster="/loopicafe-introduce-poster.jpg"
            aria-label="Video giới thiệu thương hiệu LoopyCafe trong 10 giây"
          >
            <source src="/loopicafe-introduce-vid.mp4" type="video/mp4" />
            Trình duyệt của bạn không hỗ trợ video MP4.{" "}
            <a href="/loopicafe-introduce-vid.mp4">Mở video giới thiệu LoopyCafe</a>.
          </video>
        </figure>

        <div className="landing-video-bullets" style={{ maxWidth: 860, margin: "24px auto 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          <div style={{ background: "rgba(255, 255, 255, 0.8)", padding: "14px 18px", borderRadius: 16, border: "1px solid #eee3df", fontSize: 13, color: "#6f2939" }}>
            <strong>• Xem ca & Chấm công</strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7b6f70" }}>Nhân viên xem ca hôm nay và chấm công bằng ảnh trực tiếp trên điện thoại.</p>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.8)", padding: "14px 18px", borderRadius: 16, border: "1px solid #eee3df", fontSize: 13, color: "#6f2939" }}>
            <strong>• Chuẩn hóa Mở & Đóng ca</strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7b6f70" }}>Đảm bảo đầy đủ quy trình mở quán, vệ sinh và bàn giao ca làm.</p>
          </div>
          <div style={{ background: "rgba(255, 255, 255, 0.8)", padding: "14px 18px", borderRadius: 16, border: "1px solid #eee3df", fontSize: 13, color: "#6f2939" }}>
            <strong>• Cảnh báo sớm cho Owner</strong>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#7b6f70" }}>Nhận thông báo ngay khi có sự cố thiết bị hoặc ngoại lệ chấm công.</p>
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
        <div className="brand"><LoopyMark size="small" /><span>LoopyCafe</span></div>
        <p>Được thiết kế cho nhịp vận hành thật của một quán cà phê nhỏ.</p>
        <div>
          <Link href="/privacy">Quyền riêng tư</Link>
          <Link href="/terms">Điều khoản</Link>
        </div>
      </footer>
    </main>
  );
}
