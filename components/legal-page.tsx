import Link from "next/link";
import { ArrowLeft, Camera, MapPin, ShieldCheck } from "lucide-react";
import { LoopyMark } from "./loopy-mark";

export function LegalPage({
  title,
  intro,
  children,
  icon = "shield",
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
  icon?: "shield" | "camera" | "location";
}) {
  const Icon = icon === "camera" ? Camera : icon === "location" ? MapPin : ShieldCheck;
  return (
    <main className="notice-page">
      <nav className="notice-nav">
        <Link href="/" className="brand"><LoopyMark size="small" /><span>LoopyCafe</span></Link>
        <Link href="/" className="button-secondary button-compact"><ArrowLeft size={15} /> Trang chủ</Link>
      </nav>
      <header className="notice-hero">
        <Icon size={32} />
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>
      <article className="notice-content">{children}</article>
    </main>
  );
}
