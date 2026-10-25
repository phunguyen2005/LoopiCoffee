"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { readJson } from "@/platform/http/client";
import { InteractiveLoopyMascot } from "@/components/loopy-sticker";
import { ArrowLeft, Loader2, Sparkles, ShieldAlert } from "lucide-react";

export default function ConfirmPage() {
  const [error, setError] = useState("");
  const confirmation = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function confirm() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const recovery = params.get("type") === "recovery";
      // Remove bearer material before any navigation, feedback or logging.
      window.history.replaceState(null, "", window.location.pathname);
      const supabase = createClient();
      if (accessToken && refreshToken) {
        const result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (result.error) throw new Error("Liên kết đã hết hạn hoặc không hợp lệ.");
      }
      const response = await fetch("/api/auth/activate", { method: "POST" });
      const result = await readJson<{ mustChangePassword?: boolean; landingPath?: string }>(response);
      return recovery || result.mustChangePassword ? "/auth/change-password" : result.landingPath ?? "/app";
    }

    confirmation.current ??= confirm();
    void confirmation.current
      .then((destination) => {
        if (!cancelled) window.location.replace(destination);
      })
      .catch(() => {
        if (!cancelled) setError("Không thể xác nhận liên kết. Hãy đăng nhập lại hoặc nhờ quản lý gửi lời mời mới.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fffaf4] relative">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-[0_18px_50px_rgba(82,43,48,0.09)] border border-[#eee3df]">
        {/* Mascot */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mx-auto mb-2">
            <InteractiveLoopyMascot
              size={112}
              statusMood={error ? "error" : "loading"}
            />
          </div>

          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold mb-2 ${
              error
                ? "bg-[#fff2f4] border border-[#ffe1e7] text-[#c75865]"
                : "bg-[#fff2f4] border border-[#ffe1e7] text-[#6f2939]"
            }`}
          >
            {error ? <ShieldAlert size={12} /> : <Sparkles size={12} className="text-[#f4b85f]" />}
            {error ? "Lỗi xác thực" : "Xác thực danh tính"}
          </div>

          <h1 className="text-xl font-bold text-[#6f2939] flex items-center justify-center gap-1.5">
            {error ? "Không thể xác nhận liên kết" : "Đang xác nhận đăng nhập"}
          </h1>
          <p className="text-xs text-[#7b6f70] mt-1 max-w-xs mx-auto">
            {error
              ? "Liên kết xác thực có thể đã hết hạn hoặc đã được sử dụng trước đó."
              : "Vui lòng chờ trong giây lát, hệ thống đang kiểm tra liên kết an toàn..."}
          </p>
        </div>

        {error ? (
          <div className="space-y-4">
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-[#fff2f4] border border-[#ffe1e7] text-[#c75865] text-xs font-medium flex items-start gap-2.5"
            >
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span className="leading-relaxed">{error}</span>
            </div>

            <Link
              href="/auth/login"
              className="w-full py-3.5 bg-[#6f2939] hover:bg-[#4c1d29] text-white font-bold rounded-2xl transition shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer"
            >
              <ArrowLeft size={16} /> Quay lại đăng nhập
            </Link>

            <div className="mt-4 p-3 rounded-2xl bg-[#fffaf4] border border-[#eee3df] text-[11px] text-[#7b6f70] text-center">
              💡 Bạn có thể nhờ quản lý cửa hàng gửi lại email kích hoạt hoặc liên kết mới.
            </div>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-[#d96d83] animate-spin" />
            <p className="text-xs text-[#7b6f70]">Đang mở không gian làm việc...</p>
          </div>
        )}

        {/* Security Note */}
        <div className="mt-6 pt-4 border-t border-[#eee3df] text-center text-[11px] text-[#7b6f70]">
          🔒 Hệ thống xác thực danh tính LoopyCafe
        </div>
      </div>
    </div>
  );
}
