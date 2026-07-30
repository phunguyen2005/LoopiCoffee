import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const metadataBase = host
    ? new URL(`${protocol}://${host}`)
    : new URL(process.env.APP_URL ?? "http://localhost:3000");

  return {
    metadataBase,
    title: {
      default: "LoopiCafe — Vận hành quán trong một nhịp",
      template: "%s · LoopiCafe",
    },
    description:
      "Quản lý ca làm, chấm công có ảnh và vị trí, checklist, sự cố và bàn giao cho quán cà phê.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "LoopiCafe — Vận hành quán trong một nhịp",
      description: "Quán vẫn chạy trơn tru, ngay cả khi bạn không có mặt.",
      locale: "vi_VN",
      type: "website",
      images: [{ url: "/og.png", width: 1752, height: 919, alt: "LoopiCafe — Quán vẫn chạy trơn tru" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "LoopiCafe — Vận hành quán trong một nhịp",
      description: "Quán vẫn chạy trơn tru, ngay cả khi bạn không có mặt.",
      images: ["/og.png"],
    },
    manifest: "/manifest.webmanifest",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
