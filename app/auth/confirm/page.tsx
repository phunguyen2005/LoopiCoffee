"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { readJson } from "@/platform/http/client";

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
    void confirmation.current.then((destination) => {
      if (!cancelled) window.location.replace(destination);
    }).catch(() => {
      if (!cancelled) setError("Không thể xác nhận liên kết. Hãy đăng nhập lại hoặc nhờ quản lý gửi lời mời mới.");
    });
    return () => { cancelled = true; };
  }, []);
  return <main className="card" style={{ maxWidth: 540, margin: "64px auto", padding: 32 }}>
    <h1>Xác nhận đăng nhập</h1>
    {error ? <><p role="alert">{error}</p><Link href="/auth/login">Quay lại đăng nhập</Link></> : <p>Đang xác nhận liên kết…</p>}
  </main>;
}
