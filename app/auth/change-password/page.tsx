"use client";

import { readJson } from "@/platform/http/client";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setMessage("Mật khẩu mới cần có ít nhất 10 ký tự.");
    if (password !== confirmPassword) return setMessage("Hai mật khẩu chưa khớp nhau.");
    setLoading(true);
    setMessage("");
    try {
      await readJson(await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }));
      window.location.replace("/app/today");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đổi mật khẩu. Hãy thử lại.");
    } finally { setLoading(false); }
  }

  return (
    <main className="auth-password-page">
      <section className="auth-password-card">
        <span className="auth-password-icon"><KeyRound size={24} /></span>
        <p className="eyebrow">Lần đăng nhập đầu tiên</p>
        <h1>Tạo mật khẩu riêng của bạn</h1>
        <p className="supporting-copy">Hãy đặt mật khẩu riêng trước khi vào hệ thống.</p>
        <form onSubmit={submit} className="form-grid auth-password-form">
          <div className="field full"><label htmlFor="new-password">Mật khẩu mới</label><input id="new-password" type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></div>
          <div className="field full"><label htmlFor="confirm-password">Nhập lại mật khẩu</label><input id="confirm-password" type="password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required autoComplete="new-password" /></div>
          {message && <p className="operation-message field full">{message}</p>}
          <button className="button button-large field full" type="submit" disabled={loading}><ShieldCheck size={17} /> {loading ? "Đang lưu…" : "Lưu và tiếp tục"}</button>
        </form>
      </section>
    </main>
  );
}
