"use client";
import { readJson } from "@/platform/http/client";

import Link from "next/link";
import { Bell, CheckCircle2, FileClock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AsyncStatePanel, ListSkeleton } from "@/components/operational/shared";

export function NotificationsView() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{
    id: string; title: string; entity_href: string | null; read_at: string | null; created_at: string;
  }>>([]);
  const loadNotifications = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const payload = await readJson<{ notifications: typeof items }>(await fetch("/api/notifications", { cache: "no-store" }));
      setItems(payload.notifications ?? []);
    } catch { setError("Không tải được thông báo. Hãy thử lại."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadNotifications(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);
  async function markRead(id: string) {
    if (pending) return;
    setPending(id); setError(null);
    try {
    await readJson(await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }));
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch { setError("Chưa lưu trạng thái đã đọc. Vui lòng thử lại."); }
    finally { setPending(null); }
  }
  return (
    <section className="card">
      <div className="card-header"><div><h2 className="card-title">Thông báo của bạn</h2><p className="card-subtitle">{loading || error ? "Chưa xác nhận số thông báo chưa đọc" : `${items.filter((item) => !item.read_at).length} chưa đọc`}</p></div></div>
      <div className="list">
        {loading ? <ListSkeleton rows={4} /> : error ? <AsyncStatePanel state="error" title="Không thể tải thông báo" description={error} actionLabel="Thử lại" onAction={() => void loadNotifications()} /> : items.length === 0 ? <AsyncStatePanel state="empty" title="Chưa có thông báo" description="Các cập nhật về ca làm và vận hành sẽ xuất hiện tại đây." /> : null}
        {!loading && items.map((item) => (
          <div className="list-row" key={item.id}>
            <div className="person"><span className={`mini-icon ${item.read_at ? "mint" : "pink"}`}>{item.read_at ? <CheckCircle2 size={15} /> : <Bell size={15} />}</span><span className="person-copy"><strong>{item.title}</strong><small>{formatDateTime(item.created_at)}</small></span></div>
            <div className="row-actions">
              {item.entity_href && <Link className="text-link" href={item.entity_href}>Mở</Link>}
              {!item.read_at && <button disabled={pending !== null} className="text-link" onClick={() => markRead(item.id)}>Đã đọc</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AuditView() {
  const [events, setEvents] = useState<Array<{
    id: string;
    actor_email: string;
    entity_type: string;
    entity_id: string;
    action: string;
    metadata: string;
    created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "attendance" | "employee" | "payroll" | "store">("all");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const payload = await readJson<{ events: typeof events }>(await fetch("/api/audit", { cache: "no-store" }));
      setEvents(payload.events ?? []);
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : "Không thể tải nhật ký kiểm toán."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAudit(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAudit]);

  const filteredEvents = useMemo(() => {
    return (events ?? []).filter((event) => {
      const matchesSearch =
        search.trim() === "" ||
        event.actor_email.toLowerCase().includes(search.toLowerCase()) ||
        event.action.toLowerCase().includes(search.toLowerCase()) ||
        event.entity_type.toLowerCase().includes(search.toLowerCase()) ||
        (event.metadata && event.metadata.toLowerCase().includes(search.toLowerCase()));

      let matchesCategory = true;
      if (categoryFilter === "attendance") {
        matchesCategory = event.entity_type.includes("attendance") || event.action.includes("attendance");
      } else if (categoryFilter === "employee") {
        matchesCategory = event.entity_type.includes("employee") || event.action.includes("account");
      } else if (categoryFilter === "payroll") {
        matchesCategory = event.entity_type.includes("payroll") || event.action.includes("payroll");
      } else if (categoryFilter === "store") {
        matchesCategory =
          event.entity_type.includes("store") ||
          event.entity_type.includes("shift") ||
          event.entity_type.includes("checklist");
      }

      return matchesSearch && matchesCategory;
    });
  }, [events, search, categoryFilter]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card" style={{ padding: "20px 24px" }}>
        <div className="section-row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h2 className="card-title" style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Nhật ký kiểm toán hệ thống (Audit Trail)</h2>
            <p className="card-subtitle" style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Theo dõi minh bạch mọi thay đổi về chấm công, nhân sự, bảng lương và cấu hình cửa hàng
            </p>
          </div>
          <span className="badge neutral" style={{ fontSize: "0.82rem" }}>
            {loading || loadError ? "— sự kiện" : `${events.length} sự kiện được lưu trữ`}
          </span>
        </div>

        {/* Reassurance banner */}
        <div
          style={{
            marginTop: 14,
            padding: "10px 14px",
            background: "var(--surface-subtle, #f8fafc)",
            borderRadius: 10,
            border: "1px solid var(--border-subtle, #e2e8f0)",
            fontSize: "0.8rem",
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "#16a34a", fontWeight: 700 }}>🔒 An toàn & Bảo mật:</span>
          Dữ liệu kiểm toán không lưu trữ tọa độ GPS chi tiết, ảnh khuôn mặt, mật khẩu hoặc mã phiên.
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
            <input
              type="text"
              placeholder="Tìm theo email, hành động, từ khóa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                height: 38,
                borderRadius: 8,
                border: "1px solid var(--border-subtle, #e2e8f0)",
                fontSize: "0.88rem",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "Tất cả" },
              { key: "attendance", label: "Chấm công" },
              { key: "employee", label: "Nhân sự & Quyền" },
              { key: "payroll", label: "Bảng lương" },
              { key: "store", label: "Cửa hàng & Ca" },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`filter-chip ${categoryFilter === chip.key ? "active" : ""}`}
                onClick={() => setCategoryFilter(chip.key as typeof categoryFilter)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: "0.82rem",
                  fontWeight: categoryFilter === chip.key ? 700 : 500,
                  border: categoryFilter === chip.key ? "1px solid var(--primary, #6f2939)" : "1px solid var(--border-subtle, #e2e8f0)",
                  background: categoryFilter === chip.key ? "var(--primary, #6f2939)" : "transparent",
                  color: categoryFilter === chip.key ? "#fff" : "inherit",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Audit Events List */}
      <section className="card" style={{ padding: 0 }}>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : loadError ? (
          <AsyncStatePanel state="error" title="Không thể tải nhật ký kiểm toán" description={loadError} actionLabel="Thử lại" onAction={() => void loadAudit()} />
        ) : filteredEvents.length === 0 ? (
          search.trim() || categoryFilter !== "all" ? <AsyncStatePanel state="empty" title="Không có sự kiện khớp bộ lọc" description="Thử từ khóa khác hoặc xóa bộ lọc hiện tại." actionLabel="Xóa bộ lọc" onAction={() => { setSearch(""); setCategoryFilter("all"); }} /> : <AsyncStatePanel state="empty" title="Chưa phát sinh sự kiện kiểm toán" description="Các thao tác quan trọng sẽ được hiển thị tại đây khi phát sinh." />
        ) : (
          <div className="list">
            {filteredEvents.map((event) => {
              const isExpanded = expandedEventId === event.id;
              let parsedMeta: Record<string, unknown> | null = null;
              try {
                if (event.metadata && event.metadata !== "{}" && event.metadata !== "null") {
                  parsedMeta = JSON.parse(event.metadata);
                }
              } catch {
                // Ignore parse errors
              }

              const hasMeta = Boolean(parsedMeta && Object.keys(parsedMeta).length > 0);

              return (
                <div
                  key={event.id}
                  className="list-row"
                  style={{
                    flexDirection: "column",
                    alignItems: "stretch",
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: hasMeta ? "pointer" : "default",
                    }}
                    onClick={() => hasMeta && setExpandedEventId(isExpanded ? null : event.id)}
                  >
                    <div className="person" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span className={`mini-icon ${event.action.includes("created") ? "mint" : event.action.includes("adjust") || event.action.includes("updated") ? "pink" : "amber"}`}>
                        <FileClock size={16} />
                      </span>
                      <span className="person-copy">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: "0.92rem" }}>{actionLabel(event.action)}</strong>
                          <span className="badge neutral" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                            {event.entity_type}
                          </span>
                        </div>
                        <small style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 2 }}>
                          Bởi: <strong>{event.actor_email}</strong> · {formatDateTime(event.created_at)}
                        </small>
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {hasMeta && (
                        <button
                          type="button"
                          className="button-secondary"
                          style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedEventId(isExpanded ? null : event.id);
                          }}
                        >
                          {isExpanded ? "Thu gọn ▲" : "Chi tiết ▼"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Metadata Viewer */}
                  {isExpanded && parsedMeta && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "12px 14px",
                        background: "var(--surface-subtle, #f8fafc)",
                        borderRadius: 8,
                        border: "1px solid var(--border-subtle, #e2e8f0)",
                        fontSize: "0.82rem",
                      }}
                    >
                      <strong style={{ display: "block", marginBottom: 6, color: "var(--primary)" }}>Dữ liệu chi tiết sự kiện:</strong>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                        {Object.entries(parsedMeta).map(([k, v]) => (
                          <div key={k} style={{ background: "#ffffff", padding: "6px 10px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
                            <span style={{ color: "var(--muted)", fontSize: "0.75rem", display: "block" }}>{k}</span>
                            <strong style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>
                              {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function actionLabel(value: string) {
  const map: Record<string, string> = {
    "attendance.adjust_time": "Điều chỉnh giờ chấm công",
    "attendance.reviewed": "Phê duyệt chấm công",
    "account.created": "Tạo tài khoản nhân viên",
    "account.info_updated": "Cập nhật thông tin nhân viên",
    "account.password_reset": "Cấp lại mật khẩu tạm thời",
    "account.invite_resent": "Gửi lại lời mời tham gia",
    "payroll.finalized": "Khóa sổ bảng lương",
    "store.updated": "Cập nhật cấu hình quán",
  };
  return map[value] ?? value.replaceAll(".", " · ").replaceAll("_", " ");
}
