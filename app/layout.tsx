import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const isLoopbackHost =
    host?.startsWith("localhost") ||
    host?.startsWith("127.0.0.1") ||
    host?.startsWith("[::1]");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (isLoopbackHost ? "http" : "https");
  const metadataBase = host
    ? new URL(`${protocol}://${host}`)
    : new URL(process.env.APP_URL ?? "http://localhost:3000");

  return {
    metadataBase,
    title: {
      default: "LoopyCafe — Vận hành quán trong một nhịp",
      template: "%s · LoopyCafe",
    },
    description:
      "Quản lý ca làm, chấm công có ảnh và vị trí, checklist, sự cố và bàn giao cho quán cà phê.",
    icons: {
      icon: [{ url: "/brand/loopicafe-icon.png", type: "image/png", sizes: "192x192" }],
      shortcut: "/brand/loopicafe-icon.png",
      apple: "/brand/loopicafe-icon.png",
    },
    openGraph: {
      title: "LoopyCafe — Vận hành quán trong một nhịp",
      description: "Ca làm gọn hơn. Một chạm là xong.",
      locale: "vi_VN",
      type: "website",
      images: [{ url: "/og-mobile.png", width: 1733, height: 907, alt: "LoopyCafe — Ca làm gọn hơn. Một chạm là xong." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "LoopyCafe — Vận hành quán trong một nhịp",
      description: "Ca làm gọn hơn. Một chạm là xong.",
      images: ["/og-mobile.png"],
    },
    manifest: "/manifest.webmanifest",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
