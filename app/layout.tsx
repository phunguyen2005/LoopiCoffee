import type { Metadata } from "next";
import { Be_Vietnam_Pro, Nunito } from "next/font/google";
import "./globals.css";

const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

const display = Nunito({
  variable: "--font-display",
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={`${sans.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
