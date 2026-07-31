"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { MotionLoopySticker } from "@/components/loopy-sticker";
import { RefreshCw, Home, Clock3, AlertCircle } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("System Error caught:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#fffaf4] flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl border border-[#eee3df] flex flex-col items-center">
        {/* Dynamic Speech Bubble */}
        <div className="loopy-speech-bubble mb-4 max-w-xs">
          "Hic hic... Đã có sự cố bất ngờ xảy ra! Loopy đang rất lo lắng nè! 😭"
        </div>

        <MotionLoopySticker mood="crying" size={170} />

        <h1 className="text-2xl font-black text-[#6f2939] mt-6 flex items-center justify-center gap-2">
          <AlertCircle className="text-[#c75865]" size={24} /> Đã xảy ra lỗi hệ thống
        </h1>

        <p className="text-sm text-[#635657] mt-2 leading-relaxed">
          {error?.message || "Hệ thống gặp gián đoạn tạm thời. Đừng lo, dữ liệu chấm công và vận hành của bạn vẫn an toàn!"}
        </p>

        <div className="mt-6 flex flex-col gap-3 w-full">
          <button
            onClick={() => reset()}
            className="w-full py-3.5 bg-[#6f2939] hover:bg-[#4c1d29] text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 text-sm shadow-md"
          >
            <RefreshCw size={17} /> Thử tải lại trang
          </button>

          <Link
            href="/app/attendance"
            className="w-full py-3.5 bg-[#fff2f4] hover:bg-[#ffe1e7] text-[#6f2939] font-bold rounded-2xl transition flex items-center justify-center gap-2 text-sm border border-[#ffe1e7]"
          >
            <Clock3 size={17} /> Đi đến trang Chấm công
          </Link>

          <Link
            href="/"
            className="text-xs font-semibold text-[#7b6f70] hover:text-[#6f2939] transition mt-1 flex items-center justify-center gap-1"
          >
            <Home size={14} /> Quay về Trang chủ LoopiCafe
          </Link>
        </div>
      </div>
    </main>
  );
}
