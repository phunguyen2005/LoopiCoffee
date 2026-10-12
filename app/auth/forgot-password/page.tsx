"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?recovery=1`,
      });
      if (error) throw error;
      setMessage("Nếu email có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Hãy mở liên kết trong trình duyệt này.");
    } catch { setMessage("Chưa thể gửi liên kết. Hãy thử lại sau hoặc liên hệ quản lý."); }
    finally { setPending(false); }
  }
  return <main className="card" style={{ maxWidth: 540, margin: "64px auto", padding: 32 }}>
    <h1>Đặt lại mật khẩu</h1>
    <form onSubmit={submit} className="form-grid">
      <label className="field full">Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button className="button" disabled={pending}>{pending ? "Đang gửi…" : "Gửi liên kết đặt lại"}</button>
      {message && <p role="status">{message}</p>}
    </form>
    <p><Link href="/auth/login">Quay lại đăng nhập</Link></p>
  </main>;
}
