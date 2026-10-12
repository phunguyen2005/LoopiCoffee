'use client';

import React, { useSyncExternalStore, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LoopySticker } from '@/components/loopy-sticker';
import { LoopyPreloader } from '@/components/loopy-preloader';
import { Mail, Lock, Sparkles, ArrowRight, ShieldCheck, Eye, EyeOff, Coffee } from 'lucide-react';

export default function LoginPage() {
  const savedEmail = useSyncExternalStore(subscribeRememberedEmail, readRememberedEmail, () => '');
  const [editedEmail, setEmail] = useState<string | null>(null);
  const email = editedEmail ?? savedEmail;
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [preloaderVisible, setPreloaderVisible] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Remembering an email is optional; blocked storage must not prevent sign-in.
    try {
      if (rememberMe) {
        localStorage.setItem('loopicafe_remembered_email', email);
      } else {
        localStorage.removeItem('loopicafe_remembered_email');
      }
    } catch {
      // Continue when browser privacy settings make local storage unavailable.
    }

    try {
      if (isMagicLink) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: false,
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
        const activation = await fetch("/api/auth/activate", { method: "POST" });
        if (!activation.ok) {
          window.location.replace("/auth/access");
          return;
        }
        const membership = await activation.json() as { mustChangePassword?: boolean };
        // Start one fresh authenticated request with single clean preloader
        setPreloaderVisible(true);
        await new Promise<void>((resolve) => setTimeout(resolve, 650));
        window.location.replace(membership.mustChangePassword ? '/auth/change-password' : '/app/today');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng nhập không thành công. Vui lòng kiểm tra lại thông tin.';
      setErrorMsg(message);
      setPreloaderVisible(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <LoopyPreloader visible={preloaderVisible} />
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#fffaf4] relative">
        {/* Top Left Navigation to Order Page */}
        <div className="absolute top-6 left-6 hidden sm:block">
          <Link
            href="/order"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#6f2939] hover:text-[#4c1d29] bg-white border border-[#eee3df] hover:bg-[#fff2f4] px-4 py-2.5 rounded-full transition shadow-sm"
          >
            <Coffee size={16} /> Đặt món ngay
          </Link>
        </div>

      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-[0_18px_50px_rgba(82,43,48,0.09)] border border-[#eee3df]">
        {/* Mobile-visible link to Order Page */}
        <div className="mb-3 sm:hidden text-left">
          <Link
            href="/order"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6f2939] hover:text-[#4c1d29]"
          >
            <Coffee size={14} /> Đặt món ngay
          </Link>
        </div>

        {/* Mascot & Brand Header */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mx-auto mb-2">
            <LoopySticker mood="checkin" size={92} />
          </div>
          <h1 className="text-xl font-bold text-[#6f2939] flex items-center justify-center gap-1.5">
            LoopiCafe <Sparkles className="w-4 h-4 text-[#f4b85f]" />
          </h1>
          <p className="text-xs text-[#7b6f70] mt-0.5">Đăng nhập để xem ca làm, checklist và tình hình cửa hàng.</p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div role="alert" className="mb-5 p-3.5 rounded-2xl bg-[#fff2f4] border border-[#ffe1e7] text-[#c75865] text-xs font-medium flex items-center gap-2">
            <span>⚠️</span> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-5 p-3.5 rounded-2xl bg-[#dff3ea] border border-[#b8e6d3] text-[#4c9779] text-xs font-medium flex items-center gap-2">
            <ShieldCheck size={18} /> {successMsg}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-3.5">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-[#6b4b3e] uppercase tracking-wider mb-1.5">
              Địa chỉ Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70]" size={16} />
              <input
                id="login-email"
                name="email"
                autoComplete="username"
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
                <label htmlFor="login-password" className="block text-xs font-semibold text-[#6b4b3e] uppercase tracking-wider">
                  Mật khẩu
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-[11px] text-[#d96d83] hover:underline font-semibold"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70]" size={16} />
                <input
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-[#fffaf4] border border-[#eee3df] rounded-2xl focus:outline-none focus:border-[#d96d83] transition text-[#332a2b] text-xs sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7b6f70] hover:text-[#6f2939] p-1 transition cursor-pointer"
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Remember Me & Persistent Login Session Checkbox */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold text-[#6b4b3e] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-[#eee3df] text-[#6f2939] focus:ring-[#d96d83] accent-[#6f2939] cursor-pointer"
              />
              <span>Ghi nhớ tài khoản</span>
            </label>
            <span className="text-[11px] text-[#7b6f70]" title="Tự động điền email và duy trì phiên đăng nhập">
              Duy trì phiên đăng nhập
            </span>
          </div>

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
            {isMagicLink ? 'Đăng nhập bằng Email & Mật khẩu' : 'Gửi liên kết đăng nhập qua email'}
          </button>
        </div>

        {/* Customer Order Link */}
        <div className="mt-4 pt-4 border-t border-[#eee3df] text-center">
          <p className="text-xs text-[#7b6f70] mb-2">Bạn là khách hàng muốn gọi món?</p>
          <Link
            href="/order"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#fffaf4] hover:bg-[#fff2f4] text-[#6f2939] border border-[#f4a9b7] font-semibold rounded-2xl text-xs transition"
          >
            <Coffee size={15} /> Xem thực đơn & Đặt món ngay
          </Link>
        </div>

        {/* Security Note */}
        <div className="mt-3 text-center text-[11px] text-[#7b6f70]">
          🔒 Dữ liệu cửa hàng được bảo mật riêng tư
        </div>
      </div>
    </div>
  </>
);
}

function subscribeRememberedEmail(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}
function readRememberedEmail() {
  try { return localStorage.getItem('loopicafe_remembered_email') ?? ''; }
  catch { return ''; }
}
