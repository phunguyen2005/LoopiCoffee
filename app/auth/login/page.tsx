'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Coffee, Mail, Lock, Sparkles, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isMagicLink, setIsMagicLink] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isMagicLink) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setSuccessMsg('Đã gửi liên kết đăng nhập! Vui lòng kiểm tra hộp thư email của bạn.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push('/app/today');
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fffaf4] relative">
      {/* Top Left Navigation back to Landing Page */}
      <div className="absolute top-6 left-6 hidden sm:block">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#6b4b3e] hover:text-[#6f2939] bg-white border border-[#eee3df] hover:bg-[#fff2f4] px-4 py-2.5 rounded-full transition shadow-sm"
        >
          <ArrowLeft size={16} /> Trang chủ
        </Link>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-[0_18px_50px_rgba(82,43,48,0.09)] border border-[#eee3df]">
        {/* Mobile-visible back to home link */}
        <div className="mb-3 sm:hidden text-left">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7b6f70] hover:text-[#6f2939]"
          >
            <ArrowLeft size={14} /> Trang chủ
          </Link>
        </div>

        {/* Mascot & Brand Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-[#fff2f4] rounded-2xl flex items-center justify-center mx-auto mb-2 text-[#d96d83] shadow-sm border border-[#ffe1e7]">
            <Coffee size={28} />
          </div>
          <h1 className="text-xl font-bold text-[#6f2939] flex items-center justify-center gap-1.5">
            LoopiCafe <Sparkles className="w-4 h-4 text-[#f4b85f]" />
          </h1>
          <p className="text-xs text-[#7b6f70] mt-0.5">Cổng quản lý vận hành và nhân sự</p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-[#fff2f4] border border-[#ffe1e7] text-[#c75865] text-xs font-medium flex items-center gap-2">
            <span>⚠️</span> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-[#dff3ea] border border-[#b8e6d3] text-[#4c9779] text-xs font-medium flex items-center gap-2">
            <ShieldCheck size={18} /> {successMsg}
          </div>
        )}

        {/* Static Google Sign-In Button */}
        <button
          type="button"
          className="w-full py-3 px-4 bg-white border border-[#eee3df] hover:bg-[#fff2f4] hover:border-[#f4a9b7] text-[#332a2b] font-semibold rounded-2xl transition flex items-center justify-center gap-2.5 text-xs sm:text-sm shadow-sm cursor-pointer mb-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Đăng nhập bằng Google
        </button>

        {/* Divider */}
        <div className="relative my-4 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#eee3df]"></div>
          </div>
          <span className="relative bg-white px-3 text-[11px] text-[#7b6f70] font-medium">Hoặc tài khoản email</span>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-[#6b4b3e] uppercase tracking-wider mb-1.5">
              Địa chỉ Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70]" size={16} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nhanvien@loopicafe.com"
                className="w-full pl-10 pr-4 py-3 bg-[#fffaf4] border border-[#eee3df] rounded-2xl focus:outline-none focus:border-[#d96d83] transition text-[#332a2b] text-xs sm:text-sm"
              />
            </div>
          </div>

          {!isMagicLink && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#6b4b3e] uppercase tracking-wider">
                  Mật khẩu
                </label>
                <Link
                  href="/auth/forgot-password"
                  onClick={(e) => {
                    e.preventDefault();
                    alert("Tính năng đặt lại mật khẩu đã gửi yêu cầu tới Quản lý cửa hàng hoặc Quản trị viên.");
                  }}
                  className="text-[11px] text-[#d96d83] hover:underline font-semibold"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70]" size={16} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-[#fffaf4] border border-[#eee3df] rounded-2xl focus:outline-none focus:border-[#d96d83] transition text-[#332a2b] text-xs sm:text-sm"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#6f2939] hover:bg-[#4c1d29] text-white font-bold rounded-2xl transition shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm disabled:opacity-50 mt-1 cursor-pointer"
          >
            {loading ? 'Đang xác thực...' : isMagicLink ? 'Gửi liên kết đăng nhập' : 'Đăng nhập'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        {/* Toggle Login Method */}
        <div className="mt-5 pt-4 border-t border-[#eee3df] text-center">
          <button
            type="button"
            onClick={() => setIsMagicLink(!isMagicLink)}
            className="text-xs text-[#7b6f70] hover:text-[#6f2939] hover:underline font-medium"
          >
            {isMagicLink ? 'Đăng nhập bằng Email & Mật khẩu' : 'Đăng nhập bằng liên kết gửi qua email'}
          </button>
        </div>

        {/* Security Note */}
        <div className="mt-4 text-center text-[11px] text-[#7b6f70]">
          🔒 Bảo mật bởi Supabase Auth & Phân quyền cửa hàng
        </div>
      </div>
    </div>
  );
}
