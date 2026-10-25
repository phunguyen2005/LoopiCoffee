"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { InteractiveLoopyMascot } from "@/components/loopy-sticker";
import { Mail, ArrowLeft, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState<"idle" | "email">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?recovery=1`,
      });
      if (error) throw error;
      setSuccessMsg(
        "Nếu email có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Hãy mở liên kết trong trình duyệt này.",
      );
    } catch {
      setErrorMsg("Chưa thể gửi liên kết. Hãy thử lại sau hoặc liên hệ quản lý.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fffaf4] relative">
      {/* Top Left Navigation back to Login */}
      <div className="absolute top-6 left-6 hidden sm:block">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#6f2939] hover:text-[#4c1d29] bg-white border border-[#eee3df] hover:bg-[#fff2f4] px-4 py-2.5 rounded-full transition shadow-sm"
        >
          <ArrowLeft size={16} /> Quay lại đăng nhập
        </Link>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-[0_18px_50px_rgba(82,43,48,0.09)] border border-[#eee3df]">
        {/* Mobile-visible link */}
        <div className="mb-3 sm:hidden text-left">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6f2939] hover:text-[#4c1d29]"
          >
            <ArrowLeft size={14} /> Quay lại đăng nhập
          </Link>
        </div>

        {/* Mascot & Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mx-auto mb-2">
            <InteractiveLoopyMascot
              size={112}
              focusMode={focusMode}
              emailProgress={Math.min(1, email.length / 26)}
              statusMood={errorMsg ? "error" : successMsg ? "success" : pending ? "loading" : "idle"}
            />
          </div>
          <h1 className="text-xl font-bold text-[#6f2939] flex items-center justify-center gap-1.5">
            Đặt lại mật khẩu
          </h1>
          <p className="text-xs text-[#7b6f70] mt-1 max-w-xs mx-auto">
            Nhập email làm việc của bạn để nhận liên kết xác thực và thiết lập lại mật khẩu mới.
          </p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-2xl bg-[#fff2f4] border border-[#ffe1e7] text-[#c75865] text-xs font-medium flex items-center gap-2"
          >
            <span>⚠️</span> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            className="mb-5 p-3.5 rounded-2xl bg-[#dff3ea] border border-[#b8e6d3] text-[#4c9779] text-xs font-medium flex items-start gap-2.5"
          >
            <ShieldCheck size={18} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs text-[#2e7d32]">Đã gửi thư xác thực</p>
              <p className="text-[11px] leading-relaxed text-[#3c7860] mt-0.5">{successMsg}</p>
            </div>
          </div>
        )}

        {/* Forgot Password Form */}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="forgot-email"
              className="block text-xs font-semibold text-[#6b4b3e] uppercase tracking-wider mb-1.5"
            >
              Địa chỉ Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70]" size={16} />
              <input
                id="forgot-email"
                name="email"
                autoComplete="email"
                type="email"
                required
                value={email}
                onFocus={() => setFocusMode("email")}
                onBlur={() => setFocusMode("idle")}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nhanvien@loopycafe.com"
                className="w-full pl-10 pr-4 py-3 bg-[#fffaf4] border border-[#eee3df] rounded-2xl focus:outline-none focus:border-[#d96d83] transition text-[#332a2b] text-xs sm:text-sm placeholder:text-[#b5a6a4]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3.5 bg-[#6f2939] hover:bg-[#4c1d29] text-white font-bold rounded-2xl transition shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm disabled:opacity-50 mt-1 cursor-pointer"
          >
            {pending ? "Đang gửi…" : "Gửi liên kết đặt lại"}
            {!pending && <ArrowRight size={16} />}
          </button>
        </form>

        {/* Recovery Tips Note */}
        <div className="mt-5 p-3.5 rounded-2xl bg-[#fffaf4] border border-[#eee3df] text-[11px] text-[#7b6f70] space-y-1.5">
          <div className="font-semibold text-[#6f2939] flex items-center gap-1.5">
            <Sparkles size={13} className="text-[#f4b85f]" /> Hướng dẫn khôi phục
          </div>
          <p className="leading-relaxed text-[#635657]">
            • Vui lòng mở liên kết nhận được trên <strong>chính trình duyệt này</strong> để tiếp tục đổi mật khẩu.
          </p>
          <p className="leading-relaxed text-[#635657]">
            • Nếu không thấy email sau ít phút, hãy kiểm tra thêm hòm thư <strong>Spam / Rác</strong>.
          </p>
        </div>

        {/* Bottom Back Link */}
        <div className="mt-5 pt-4 border-t border-[#eee3df] text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs text-[#7b6f70] hover:text-[#6f2939] hover:underline font-medium"
          >
            <ArrowLeft size={14} /> Nhớ lại mật khẩu? Quay lại đăng nhập
          </Link>
        </div>

        {/* Security Note */}
        <div className="mt-3 text-center text-[11px] text-[#7b6f70]">
          🔒 Dữ liệu cửa hàng được bảo mật riêng tư
        </div>
      </div>
    </div>
  );
}
