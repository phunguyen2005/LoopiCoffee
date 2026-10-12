"use client";

import React from "react";
import Link from "next/link";
import { MotionLoopySticker } from "@/components/loopy-sticker";
import { Search, Home, Clock3 } from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="min-h-screen bg-[#fffaf4] flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl border border-[#eee3df] flex flex-col items-center">
        {/* Dynamic Speech Bubble */}
        <div className="loopy-speech-bubble mb-4 max-w-xs">
          &quot;Ồ không! Loopy dùng kính lúp soi khắp nơi mà vẫn không thấy trang này ở đâu hết! 🔍&quot;
        </div>

        <MotionLoopySticker mood="investigating" size={170} />

        <h1 className="text-2xl font-black text-[#6f2939] mt-6 flex items-center justify-center gap-2">
          <Search className="text-[#d96d83]" size={24} /> Trang không tồn tại (404)
        </h1>

        <p className="text-sm text-[#635657] mt-2 leading-relaxed">
          Đường dẫn bạn truy cập có thể đã thay đổi hoặc không khả dụng. Vui lòng chọn lối tắt bên dưới để tiếp tục.
        </p>

        <div className="mt-6 flex flex-col gap-3 w-full">
          <Link
            href="/app"
            className="w-full py-3.5 bg-[#6f2939] hover:bg-[#4c1d29] text-white font-bold rounded-2xl transition flex items-center justify-center gap-2 text-sm shadow-md"
          >
            Về Ứng dụng Vận hành
          </Link>

          <Link
            href="/app/attendance"
            className="w-full py-3.5 bg-[#fff2f4] hover:bg-[#ffe1e7] text-[#6f2939] font-bold rounded-2xl transition flex items-center justify-center gap-2 text-sm border border-[#ffe1e7]"
          >
            <Clock3 size={17} /> Đi đến Chấm công ngay
          </Link>

          <Link
            href="/"
            className="text-xs font-semibold text-[#7b6f70] hover:text-[#6f2939] transition mt-1 flex items-center justify-center gap-1"
          >
            <Home size={14} /> Quay về Trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
