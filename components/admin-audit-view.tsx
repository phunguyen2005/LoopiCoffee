"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { adminActionLabel } from "./admin-labels";
import { AsyncStatePanel, ListSkeleton, ViewHeader, formatDateTime, readJson } from "./operational/shared";

type Event = {
  id: string; actor_email: string; entity_type: string; entity_id: string; action: string; created_at: string;
  target_label: string | null; details: Record<string, string | number | boolean | null>;
};

const categories = [
  { value: "all", label: "Tất cả" },
  { value: "account", label: "Tài khoản" },
  { value: "access", label: "Vai trò / trạng thái" },
  { value: "rbac", label: "Phân quyền" },
];

const detailLabels: Record<string, string> = {
  role: "Vai trò", roleId: "Mã vai trò", activationMethod: "Cách kích hoạt", reason: "Lý do", status: "Trạng thái",
  previousRole: "Vai trò cũ", previousStatus: "Trạng thái cũ", name: "Tên", permissions: "Quyền",
  previousEmail: "Email cũ", newEmail: "Email mới", email: "Email", displayName: "Họ tên",
  pinVerified: "Xác thực PIN", mode: "Hình thức",
};

export function AdminAuditView() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ category });
      if (query) params.set("q", query);
      const response = await fetch(`/api/admin/audit?${params}`, { cache: "no-store", signal });
      const data = await readJson<{ events?: Event[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể tải nhật ký.");
      setEvents(data.events ?? []);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Không thể tải nhật ký.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [category, query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);

  return <div className="stack adm-page">
    <header className="adm-header"><ViewHeader title="Nhật ký quản trị" subtitle="Chỉ hiển thị thay đổi tài khoản và phân quyền; không đưa dữ liệu công, lương hoặc thông tin khách hàng vào đây." /></header>
    <section className="card">
      <form className="admin-audit-filters" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
        <label className="field"><span>Loại thay đổi</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="field admin-search"><span>Tìm theo người thực hiện hoặc tài khoản</span>
          <span className="input-with-icon"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Email" maxLength={100} /></span>
        </label>
        <button className="button" type="submit" disabled={loading}><Search size={16} /> Lọc</button>
        <button className="button-secondary" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /> Tải lại</button>
      </form>
      {loading ? <ListSkeleton rows={6} />
        : error ? <AsyncStatePanel state="error" title="Không thể tải nhật ký" description={error} actionLabel="Thử lại" onAction={() => void load()} />
        : events.length === 0 ? <AsyncStatePanel state="empty" title="Không có bản ghi phù hợp" description="Các thay đổi tài khoản và quyền sẽ xuất hiện tại đây. Thử bỏ bộ lọc nếu cần." />
        : <div className="admin-audit-list">{events.map((event) => {
          const entries = Object.entries(event.details);
          return <article key={event.id}>
            <strong>{adminActionLabel(event.action)}</strong>
            <span>
              Thực hiện bởi {event.actor_email}
              {event.target_label ? <><br />Đối tượng: {event.target_label}</> : null}
            </span>
            <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
            {entries.length > 0 && <details className="admin-audit-details">
              <summary>Chi tiết</summary>
              <dl>{entries.map(([key, value]) => <div key={key}><dt>{detailLabels[key] ?? key}</dt><dd>{String(value)}</dd></div>)}</dl>
            </details>}
          </article>;
        })}</div>}
    </section>
  </div>;
}
