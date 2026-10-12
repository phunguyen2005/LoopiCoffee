"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readJson } from "@/platform/http/client";

export default function AccessPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function activate() {
    setPending(true);
    setError("");
    try {
      await readJson(await fetch("/api/auth/activate", { method: "POST" }));
      router.replace("/app/today");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kích hoạt tài khoản.");
    } finally { setPending(false); }
  }
  return (
    <main className="card" style={{ maxWidth: 540, margin: "64px auto", padding: 32 }}>
      <h1>Quyền truy cập LoopiCafe</h1>
      <p>Bạn đã đăng nhập. Nếu quản lý đã mời bạn, hãy xác nhận để kích hoạt quyền truy cập. Tài khoản bị khóa cần quản lý mở lại.</p>
      <p>Thao tác này không đồng ý thay bạn với thông báo thu thập ảnh và vị trí.</p>
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={pending} onClick={() => void activate()}>{pending ? "Đang kiểm tra…" : "Xác nhận lời mời"}</button>
      <p><Link href="/auth/login">Quay lại đăng nhập</Link></p>
    </main>
  );
}
