"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, KeyRound, ScrollText, ShieldCheck, UsersRound } from "lucide-react";
import { AsyncStatePanel, ListSkeleton, ViewHeader, formatDateTime, readJson } from "./operational/shared";
import { adminActionLabel } from "./admin-labels";

type Summary = {
  accounts?: { total: number; active: number; invited: number; blocked: number };
  failedOperations?: { count: number };
  recent?: Array<{ actor_email: string; action: string; created_at: string }>;
};

export function AdminDashboardView() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const retryLoad = () => {
    setError("");
    setData(null);
    setReloadKey((prev) => prev + 1);
  };
  useEffect(() => {
    let active = true;
    fetch("/api/admin/summary", { cache: "no-store" })
      .then(async (response) => {
        const payload = await readJson<Summary & { error?: string }>(response);
        if (!response.ok) throw new Error(payload.error ?? "Không thể tải tổng quan.");
        return payload;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Không thể tải tổng quan."); });
    return () => { active = false; };
  }, [reloadKey]);

  if (error) return <AsyncStatePanel state="error" title="Không thể tải khu vực quản trị" description={error} actionLabel="Thử lại" onAction={retryLoad} />;

  const invited = data?.accounts?.invited ?? 0;
  const failed = data?.failedOperations?.count ?? 0;
  const attention = [
    failed > 0 && { href: "/app/admin/audit", icon: AlertTriangle, tone: "danger", title: `${failed} thao tác tài khoản thất bại`, hint: "Xem nhật ký để biết thao tác nào cần thử lại." },
    invited > 0 && { href: "/app/admin/accounts", icon: KeyRound, tone: "warning", title: `${invited} tài khoản chờ kích hoạt`, hint: "Gửi lại lời mời hoặc cấp mật khẩu tạm." },
  ].filter(Boolean) as Array<{ href: string; icon: typeof AlertTriangle; tone: string; title: string; hint: string }>;

  return <div className="stack adm-page">
    <ViewHeader title="Quản trị hệ thống" subtitle="Danh tính đăng nhập và bộ quyền. Dữ liệu công, lương và đơn hàng không hiển thị ở đây." />

    <section className="adm-section" aria-labelledby="adm-attention">
      <h2 id="adm-attention" className="adm-section-title">Cần xử lý</h2>
      {!data ? <ListSkeleton rows={2} />
        : attention.length === 0 ? <p className="adm-calm" role="status"><ShieldCheck size={18} /> Không có việc nào đang chờ xử lý.</p>
        : <ul className="adm-list">{attention.map((item) => <li key={item.href}>
          <Link className="adm-row" href={item.href}>
            <span className={`adm-icon ${item.tone}`}><item.icon size={18} /></span>
            <span className="adm-row-main"><strong>{item.title}</strong><small>{item.hint}</small></span>
            <ChevronRight size={18} aria-hidden />
          </Link>
        </li>)}</ul>}
    </section>

    {data?.accounts && <p className="adm-summary" aria-label="Tóm tắt tài khoản">
      <span><b>{data.accounts.total}</b> tài khoản</span>
      <span><b>{data.accounts.active}</b> đang hoạt động</span>
      <span><b>{data.accounts.blocked}</b> bị khóa hoặc đã nghỉ</span>
    </p>}

    <section className="adm-section" aria-labelledby="adm-areas">
      <h2 id="adm-areas" className="adm-section-title">Truy cập nhanh</h2>
      <ul className="adm-list">
        <li><Link className="adm-row" href="/app/admin/accounts"><span className="adm-icon"><UsersRound size={18} /></span><span className="adm-row-main"><strong>Tài khoản</strong><small>Tạo, khóa, đặt lại mật khẩu, gán vai trò.</small></span><ChevronRight size={18} aria-hidden /></Link></li>
        <li><Link className="adm-row" href="/app/admin/roles"><span className="adm-icon"><ShieldCheck size={18} /></span><span className="adm-row-main"><strong>Vai trò &amp; quyền</strong><small>Bộ quyền và vai trò tùy chỉnh.</small></span><ChevronRight size={18} aria-hidden /></Link></li>
        <li><Link className="adm-row" href="/app/admin/audit"><span className="adm-icon"><ScrollText size={18} /></span><span className="adm-row-main"><strong>Nhật ký quản trị</strong><small>Đối soát thay đổi tài khoản và quyền.</small></span><ChevronRight size={18} aria-hidden /></Link></li>
      </ul>
    </section>

    {data && <section className="adm-section" aria-labelledby="adm-recent">
      <div className="adm-section-head"><h2 id="adm-recent" className="adm-section-title">Hoạt động gần đây</h2><Link className="adm-link" href="/app/admin/audit">Xem tất cả</Link></div>
      {(data.recent ?? []).length === 0 ? <p className="adm-calm">Chưa có thay đổi quản trị nào.</p>
        : <ul className="adm-timeline">{data.recent!.map((event, index) => <li key={`${event.created_at}-${index}`}>
          <strong>{adminActionLabel(event.action)}</strong>
          <small>{event.actor_email} · <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time></small>
        </li>)}</ul>}
    </section>}
  </div>;
}
