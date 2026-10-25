"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readJson } from "@/platform/http/client";
import { InteractiveLoopyMascot } from "@/components/loopy-sticker";
import { ArrowLeft, ArrowRight, Sparkles, UserCheck } from "lucide-react";

export default function AccessPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function activate() {
    setPending(true);
    setError("");
    try {
      const result = await readJson<{ landingPath?: string }>(
        await fetch("/api/auth/activate", { method: "POST" }),
      );
      router.replace(result.landingPath ?? "/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể kích hoạt tài khoản.");
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
        <div className="text-center mb-5">
          <div className="flex items-center justify-center mx-auto mb-2">
            <InteractiveLoopyMascot
              size={112}
              statusMood={error ? "error" : pending ? "loading" : "idle"}
            />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#fff2f4] border border-[#ffe1e7] text-[#6f2939] text-[11px] font-semibold mb-2">
            <Sparkles size={12} className="text-[#f4b85f]" /> Kích hoạt quyền truy cập
          </div>

          <h1 className="text-xl font-bold text-[#6f2939] flex items-center justify-center gap-1.5">
            Quyền truy cập LoopyCafe
          </h1>
          <p className="text-xs text-[#7b6f70] mt-1 max-w-xs mx-auto">
            Bạn đã đăng nhập thành công. Vui lòng xác nhận để kích hoạt tài khoản làm việc.
          </p>
        </div>

        {/* Explanatory Context Box */}
        <div className="mb-5 p-3.5 rounded-2xl bg-[#fffaf4] border border-[#eee3df] text-xs text-[#635657] space-y-2">
          <p className="leading-relaxed">
            • Nếu quản lý đã gửi lời mời hoặc cấp quyền, bấm <strong>Xác nhận lời mời</strong> bên dưới để bắt đầu làm việc.
          </p>
          <p className="leading-relaxed">
            • Tài khoản bị khóa hoặc cần phân lại quyền sẽ cần quản lý cửa hàng mở lại.
          </p>
        </div>

        {/* Feedback Alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-2xl bg-[#fff2f4] border border-[#ffe1e7] text-[#c75865] text-xs font-medium flex items-start gap-2"
          >
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          className="w-full py-3.5 bg-[#6f2939] hover:bg-[#4c1d29] text-white font-bold rounded-2xl transition shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm disabled:opacity-50 mt-1 cursor-pointer"
          disabled={pending}
          onClick={() => void activate()}
        >
          <UserCheck size={16} />
          {pending ? "Đang kiểm tra…" : "Xác nhận lời mời"}
          {!pending && <ArrowRight size={16} />}
        </button>

        {/* Bottom Back Link */}
        <div className="mt-5 pt-4 border-t border-[#eee3df] text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-xs text-[#7b6f70] hover:text-[#6f2939] hover:underline font-medium"
          >
            <ArrowLeft size={14} /> Đăng nhập tài khoản khác
          </Link>
        </div>

        {/* Security Note */}
        <div className="mt-3 text-center text-[11px] text-[#7b6f70] leading-relaxed">
          🔒 Thao tác này không đồng ý thay bạn với thông báo thu thập ảnh và vị trí khi chấm công.
        </div>
      </div>
    </div>
  );
}
