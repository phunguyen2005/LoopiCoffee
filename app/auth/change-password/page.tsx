"use client";

import React, { useState } from "react";
import Link from "next/link";
import { readJson } from "@/platform/http/client";
import { InteractiveLoopyMascot } from "@/components/loopy-sticker";
import { Lock, Eye, EyeOff, ShieldCheck, KeyRound, ArrowLeft, ArrowRight, Check } from "lucide-react";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusMode, setFocusMode] = useState<"idle" | "password">("idle");

  const isMinLength = password.length >= 12;
  const isMatch = confirmPassword.length > 0 && password === confirmPassword;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 12) return setMessage("Mật khẩu mới cần có ít nhất 12 ký tự.");
    if (password !== confirmPassword) return setMessage("Hai mật khẩu chưa khớp nhau.");

    setLoading(true);
    setMessage("");

    try {
      await readJson(
        await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }),
      );
      window.location.replace("/app/today");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đổi mật khẩu. Hãy thử lại.");
    } finally {
      setLoading(false);
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
          <ArrowLeft size={16} /> Đăng nhập
        </Link>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-[0_18px_50px_rgba(82,43,48,0.09)] border border-[#eee3df]">
        {/* Mobile-visible link */}
        <div className="mb-3 sm:hidden text-left">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6f2939] hover:text-[#4c1d29]"
          >
            <ArrowLeft size={14} /> Đăng nhập
          </Link>
        </div>

        {/* Mascot & Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mx-auto mb-2">
            <InteractiveLoopyMascot
              size={112}
              focusMode={focusMode}
              isPasswordVisible={showPassword || showConfirmPassword}
              statusMood={message ? "error" : loading ? "loading" : "idle"}
            />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff2f4] border border-[#ffe1e7] text-[#6f2939] text-[11px] font-semibold mb-2">
            <KeyRound size={12} className="text-[#d96d83]" /> Thiết lập bảo mật
          </div>

          <h1 className="text-xl font-bold text-[#6f2939] flex items-center justify-center gap-1.5">
            Tạo mật khẩu riêng của bạn
          </h1>
          <p className="text-xs text-[#7b6f70] mt-1 max-w-xs mx-auto">
            Hãy đặt mật khẩu riêng an toàn trước khi bắt đầu vào hệ thống LoopyCafe.
          </p>
        </div>

        {/* Feedback Alert */}
        {message && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-2xl bg-[#fff2f4] border border-[#ffe1e7] text-[#c75865] text-xs font-medium flex items-center gap-2"
          >
            <span>⚠️</span> {message}
          </div>
        )}

        {/* Form */}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold text-[#6b4b3e] uppercase tracking-wider mb-1.5"
            >
              Mật khẩu mới
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70]" size={16} />
              <input
                id="new-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                minLength={12}
                required
                autoComplete="new-password"
                value={password}
                onFocus={() => setFocusMode("password")}
                onBlur={() => setFocusMode("idle")}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 12 ký tự"
                className="w-full pl-10 pr-10 py-3 bg-[#fffaf4] border border-[#eee3df] rounded-2xl focus:outline-none focus:border-[#d96d83] transition text-[#332a2b] text-xs sm:text-sm placeholder:text-[#b5a6a4]"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70] hover:text-[#6f2939] p-1 transition cursor-pointer"
                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold text-[#6b4b3e] uppercase tracking-wider mb-1.5"
            >
              Nhập lại mật khẩu
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70]" size={16} />
              <input
                id="confirm-password"
                name="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                minLength={12}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onFocus={() => setFocusMode("password")}
                onBlur={() => setFocusMode("idle")}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full pl-10 pr-10 py-3 bg-[#fffaf4] border border-[#eee3df] rounded-2xl focus:outline-none focus:border-[#d96d83] transition text-[#332a2b] text-xs sm:text-sm placeholder:text-[#b5a6a4]"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70] hover:text-[#6f2939] p-1 transition cursor-pointer"
                title={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Validation Checklist */}
          <div className="p-3 bg-[#fffaf4] border border-[#eee3df] rounded-2xl space-y-1.5 text-xs">
            <div
              className={`flex items-center gap-2 transition-colors ${
                isMinLength ? "text-[#2e7d32] font-semibold" : "text-[#7b6f70]"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                  isMinLength ? "bg-[#dff3ea] text-[#2e7d32]" : "bg-[#eee3df] text-[#7b6f70]"
                }`}
              >
                {isMinLength ? <Check size={11} strokeWidth={3} /> : "•"}
              </span>
              <span>Độ dài từ 12 ký tự trở lên</span>
            </div>
            <div
              className={`flex items-center gap-2 transition-colors ${
                isMatch ? "text-[#2e7d32] font-semibold" : "text-[#7b6f70]"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                  isMatch ? "bg-[#dff3ea] text-[#2e7d32]" : "bg-[#eee3df] text-[#7b6f70]"
                }`}
              >
                {isMatch ? <Check size={11} strokeWidth={3} /> : "•"}
              </span>
              <span>Hai mật khẩu đã nhập trùng khớp</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#6f2939] hover:bg-[#4c1d29] text-white font-bold rounded-2xl transition shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm disabled:opacity-50 mt-2 cursor-pointer"
          >
            <ShieldCheck size={16} />
            {loading ? "Đang lưu…" : "Lưu và tiếp tục"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        {/* Bottom Back Link */}
        <div className="mt-5 pt-4 border-t border-[#eee3df] text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs text-[#7b6f70] hover:text-[#6f2939] hover:underline font-medium"
          >
            <ArrowLeft size={14} /> Quay lại trang đăng nhập
          </Link>
        </div>

        {/* Security Note */}
        <div className="mt-3 text-center text-[11px] text-[#7b6f70]">
          🔒 Mật khẩu được mã hóa an toàn theo tiêu chuẩn
        </div>
      </div>
    </div>
  );
}
