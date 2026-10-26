"use client";
import { readJson } from "@/platform/http/client";

import Link from "next/link";
import {
  Bell,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  FileClock,
  RotateCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AsyncStatePanel, ListSkeleton } from "@/components/operational/shared";
import {
  formatRelativeTime,
  formatFullDateTime,
  getNotificationMeta,
  type LoopiNotificationItem,
} from "@/lib/notifications";

export function NotificationsView() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [items, setItems] = useState<LoopiNotificationItem[]>([]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readJson<{ notifications: LoopiNotificationItem[] }>(
        await fetch("/api/notifications", { cache: "no-store" })
      );
      setItems(payload.notifications ?? []);
    } catch {
      setError("Không tải được thông báo. Hãy thử lại.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadNotifications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  async function markRead(id: string) {
    if (pending) return;
    setPending(id);
    setError(null);
    try {
      await readJson(
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        })
      );
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    } catch {
      setError("Chưa lưu trạng thái đã đọc. Vui lòng thử lại.");
    } finally {
      setPending(null);
    }
  }

  async function markAllRead() {
    if (pending || unreadCount === 0) return;
    setPending("all");
    setError(null);
    try {
      const unreadItems = items.filter((item) => !item.read_at);
      await Promise.all(
        unreadItems.map((item) =>
          fetch("/api/notifications", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: item.id }),
          })
        )
      );
      setItems((current) =>
        current.map((item) => ({
          ...item,
          read_at: item.read_at ?? new Date().toISOString(),
        }))
      );
    } catch {
      setError("Chưa lưu trạng thái đã đọc. Vui lòng thử lại.");
    } finally {
      setPending(null);
    }
  }

  const unreadCount = items.filter((item) => !item.read_at).length;
  const filteredItems = filter === "unread" ? items.filter((item) => !item.read_at) : items;

  return (
    <div className="stack w-full max-w-full" style={{ gap: 14 }}>
      {/* Overview & Actions Card */}
      <section className="card" style={{ padding: "16px 18px" }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-[#332a2b] tracking-tight m-0">
                Thông báo hệ thống & ca làm
              </h2>
              <span
                className={`badge ${unreadCount > 0 ? "pink" : "neutral"} text-[11px] font-semibold px-2 py-0.5 rounded-full`}
              >
                {loading || error ? "—" : unreadCount > 0 ? `${unreadCount} chưa đọc` : "Đã đọc tất cả"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#7b6f70] mt-1 m-0 leading-relaxed">
              Cập nhật kịp thời về lịch làm việc, đổi ca, phê duyệt yêu cầu và vận hành cửa hàng
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
            {unreadCount > 0 && (
              <button
                type="button"
                className="button-secondary text-xs"
                onClick={() => void markAllRead()}
                disabled={loading || pending !== null}
                style={{ padding: "6px 12px", minHeight: 34, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10 }}
              >
                <CheckCheck size={14} />
                <span>{pending === "all" ? "Đang lưu…" : "Đọc tất cả"}</span>
              </button>
            )}
            <button
              type="button"
              className="button-secondary text-xs"
              onClick={() => void loadNotifications()}
              disabled={loading}
              title="Làm mới thông báo"
              style={{ padding: "6px 12px", minHeight: 34, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10 }}
            >
              <RotateCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
          }}
        >
          <button
            type="button"
            className={`filter-chip ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: "0.82rem",
              fontWeight: filter === "all" ? 700 : 500,
              border: filter === "all" ? "1px solid #6f2939" : "1px solid #e2dcd9",
              background: filter === "all" ? "#6f2939" : "transparent",
              color: filter === "all" ? "#ffffff" : "#4c4041",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Tất cả ({items.length})
          </button>
          <button
            type="button"
            className={`filter-chip ${filter === "unread" ? "active" : ""}`}
            onClick={() => setFilter("unread")}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: "0.82rem",
              fontWeight: filter === "unread" ? 700 : 500,
              border: filter === "unread" ? "1px solid #6f2939" : "1px solid #e2dcd9",
              background: filter === "unread" ? "#6f2939" : "transparent",
              color: filter === "unread" ? "#ffffff" : "#4c4041",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Chưa đọc ({unreadCount})
          </button>
        </div>
      </section>

      {/* Notifications List Card */}
      <section className="card overflow-hidden w-full max-w-full" style={{ padding: 0 }}>
        <div className="list w-full max-w-full">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : error ? (
            <AsyncStatePanel
              state="error"
              title="Không thể tải thông báo"
              description={error}
              actionLabel="Thử lại"
              onAction={() => void loadNotifications()}
            />
          ) : filteredItems.length === 0 ? (
            <AsyncStatePanel
              state="empty"
              title={filter === "unread" ? "Bạn đã đọc hết mọi thông báo rồi ✨" : "Mọi thứ đang yên ắng, chưa có thông báo mới."}
              description={
                filter === "unread"
                  ? "Tuyệt vời ghê! Bạn không còn thông báo nào chưa đọc nè."
                  : "Khi có cập nhật về ca làm, đổi ca hoặc duyệt yêu cầu, Loopy sẽ nhắn bạn ngay tại đây nhé."
              }
            />
          ) : (
            filteredItems.map((item) => {
              const isUnread = !item.read_at;
              const meta = getNotificationMeta(item.type);
              const Icon = meta.icon;

              return (
                <div
                  className="list-row w-full max-w-full"
                  key={item.id}
                  style={{
                    backgroundColor: isUnread ? "rgba(255, 242, 244, 0.45)" : undefined,
                    borderLeft: isUnread ? "4px solid #d96d83" : "4px solid transparent",
                    borderBottom: "1px solid #f2ebe8",
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    boxSizing: "border-box",
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 }}>
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${meta.iconBgClass} ${meta.borderClass}`}
                      style={{ marginTop: 2 }}
                    >
                      <Icon size={17} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span className="badge neutral" style={{ fontSize: "0.72rem", padding: "1px 6px", borderRadius: 6 }}>
                          {meta.badgeLabel}
                        </span>
                        {isUnread && (
                          <span
                            style={{
                              display: "inline-block",
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              backgroundColor: "#d96d83",
                              flexShrink: 0,
                            }}
                            title="Chưa đọc"
                          />
                        )}
                      </div>
                      <strong
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: isUnread ? 700 : 500,
                          color: isUnread ? "#332a2b" : "#4c4041",
                          display: "block",
                          lineHeight: 1.42,
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {item.title}
                      </strong>
                      <small
                        style={{
                          color: "var(--muted)",
                          fontSize: "0.76rem",
                          marginTop: 3,
                          display: "inline-block",
                          lineHeight: 1.35,
                        }}
                        title={formatFullDateTime(item.created_at)}
                      >
                        {formatRelativeTime(item.created_at)} · {formatFullDateTime(item.created_at)}
                      </small>
                    </div>
                  </div>

                  <div className="row-actions" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {item.entity_href && (
                      <Link
                        className="button-secondary"
                        href={item.entity_href}
                        onClick={() => {
                          if (isUnread) void markRead(item.id);
                        }}
                        style={{
                          minHeight: 34,
                          padding: "6px 11px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          borderRadius: 10,
                        }}
                      >
                        <span>Mở</span>
                        <ExternalLink size={12} />
                      </Link>
                    )}
                    {isUnread && (
                      <button
                        type="button"
                        disabled={pending === item.id}
                        className="button-primary"
                        onClick={() => void markRead(item.id)}
                        style={{
                          minHeight: 34,
                          padding: "6px 11px",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          borderRadius: 10,
                        }}
                      >
                        <Check size={13} />
                        <span>Đã đọc</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

type AuditEventItem = {
  id: string;
  actor_email: string;
  actor_name?: string | null;
  actor_role?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: string;
  created_at: string;
};

const CATEGORY_CHIPS = [
  { key: "all", label: "Tất cả" },
  { key: "attendance", label: "Chấm công" },
  { key: "employee", label: "Nhân sự & phân quyền" },
  { key: "payroll", label: "Lương thưởng" },
  { key: "store", label: "Cửa hàng & ca làm" },
] as const;

const META_FIELD_LABELS: Record<string, string> = {
  action: "Hành động",
  oldName: "Tên cũ",
  newName: "Tên mới",
  amount: "Số tiền",
  reason: "Lý do",
  note: "Ghi chú",
  period: "Kỳ lương",
  role: "Vai trò",
  status: "Trạng thái",
  previousRole: "Vai trò trước đó",
  previousStatus: "Trạng thái trước đó",
  shiftId: "Mã ca làm việc",
  employeeEmail: "Email nhân sự",
  expiresInSeconds: "Thời hạn phiên (giây)",
  verification: "Xác thực",
  photoStatus: "Ảnh chụp",
  hasLocation: "Định vị GPS",
  decision: "Quyết định",
  hasReviewerNote: "Ghi chú người duyệt",
  employeeCount: "Số lượng nhân sự",
  routineType: "Loại công việc",
  severity: "Mức độ nghiêm trọng",
};

type DateFilterPreset = "all" | "today" | "yesterday" | "7days" | "custom";

export function AuditView() {
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "attendance" | "employee" | "payroll" | "store">("all");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [customDate, setCustomDate] = useState<string>("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const loadAudit = useCallback(async (preset: DateFilterPreset = datePreset, specificDate: string = customDate) => {
    setLoading(true);
    setLoadError("");
    try {
      let url = "/api/audit";
      const today = getTodayVnDate();
      if (preset === "today") {
        url += `?date=${today}`;
      } else if (preset === "yesterday") {
        url += `?date=${getYesterdayVnDate()}`;
      } else if (preset === "7days") {
        url += `?from=${getSevenDaysAgoVnDate()}&to=${today}`;
      } else if (preset === "custom" && specificDate) {
        url += `?date=${specificDate}`;
      }
      const payload = await readJson<{ events: AuditEventItem[] }>(await fetch(url, { cache: "no-store" }));
      setEvents(payload.events ?? []);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Không thể tải lịch sử hoạt động.");
    } finally {
      setLoading(false);
    }
  }, [datePreset, customDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAudit(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAudit]);

  const filteredEvents = useMemo(() => {
    const today = getTodayVnDate();
    const yesterday = getYesterdayVnDate();
    const sevenDaysAgo = getSevenDaysAgoVnDate();

    return (events ?? []).filter((event) => {
      // Date preset verification
      const eventDate = getEventVnDate(event.created_at);
      if (datePreset === "today" && eventDate !== today) return false;
      if (datePreset === "yesterday" && eventDate !== yesterday) return false;
      if (datePreset === "7days" && (eventDate < sevenDaysAgo || eventDate > today)) return false;
      if (datePreset === "custom" && customDate && eventDate !== customDate) return false;

      const actorText = formatActor(event.actor_email, event.actor_name, event.actor_role);
      const matchesSearch =
        search.trim() === "" ||
        event.actor_email.toLowerCase().includes(search.toLowerCase()) ||
        actorText.toLowerCase().includes(search.toLowerCase()) ||
        event.action.toLowerCase().includes(search.toLowerCase()) ||
        event.entity_type.toLowerCase().includes(search.toLowerCase()) ||
        (event.metadata && event.metadata.toLowerCase().includes(search.toLowerCase()));

      let matchesCategory = true;
      if (categoryFilter === "attendance") {
        matchesCategory = event.entity_type.includes("attendance") || event.action.includes("attendance");
      } else if (categoryFilter === "employee") {
        matchesCategory =
          event.entity_type.includes("employee") ||
          event.entity_type.includes("account") ||
          event.action.includes("account") ||
          event.action.includes("profile") ||
          event.action.includes("access") ||
          event.action.includes("role") ||
          event.entity_type.includes("role");
      } else if (categoryFilter === "payroll") {
        matchesCategory =
          event.entity_type.includes("payroll") ||
          event.action.includes("payroll") ||
          event.action.includes("reports");
      } else if (categoryFilter === "store") {
        matchesCategory =
          event.entity_type.includes("store") ||
          event.entity_type.includes("shift") ||
          event.entity_type.includes("checklist") ||
          event.entity_type.includes("handover") ||
          event.entity_type.includes("incident") ||
          event.action.includes("store") ||
          event.action.includes("shift") ||
          event.action.includes("ordering") ||
          event.action.includes("menu") ||
          event.action.includes("request");
      }

      return matchesSearch && matchesCategory;
    });
  }, [events, search, categoryFilter, datePreset, customDate]);

  const groupedEvents = useMemo(() => {
    const groups: Array<{ label: string; events: AuditEventItem[] }> = [];
    const map = new Map<string, AuditEventItem[]>();

    for (const event of filteredEvents) {
      const groupLabel = formatDateGroup(event.created_at);
      let list = map.get(groupLabel);
      if (!list) {
        list = [];
        map.set(groupLabel, list);
        groups.push({ label: groupLabel, events: list });
      }
      list.push(event);
    }
    return groups;
  }, [filteredEvents]);

  const resetAllFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setDatePreset("all");
    setCustomDate("");
    void loadAudit("all", "");
  };

  const hasAnyFilter = search.trim() !== "" || categoryFilter !== "all" || datePreset !== "all";

  const formatMetaValue = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (key === "action") {
      if (value === "check_in") return "Vào ca";
      if (value === "check_out") return "Ra ca";
    }
    if (key === "expiresInSeconds") {
      return `${value} giây`;
    }
    if (key === "amount" && typeof value === "number") {
      return `${value > 0 ? "+" : ""}${value.toLocaleString("vi-VN")} đ`;
    }
    if (key === "hasLocation") {
      return value ? "Có tọa độ quán" : "Không có tọa độ";
    }
    if (key === "decision") {
      if (value === "approved") return "Đã phê duyệt";
      if (value === "rejected") return "Từ chối";
    }
    if (key === "role") {
      const roles: Record<string, string> = {
        owner: "Chủ quán",
        manager: "Quản lý",
        team_lead: "Trưởng ca",
        employee: "Nhân viên",
        system_admin: "Quản trị viên",
      };
      return typeof value === "string" ? roles[value] ?? value : String(value);
    }
    if (key === "status") {
      const statuses: Record<string, string> = {
        active: "Đang hoạt động",
        suspended: "Tạm khóa",
        invited: "Đã gửi lời mời",
        offboarded: "Đã nghỉ việc",
        inactive: "Ngưng hoạt động",
      };
      return typeof value === "string" ? statuses[value] ?? value : String(value);
    }
    if (typeof value === "boolean") {
      return value ? "Có" : "Không";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card" style={{ padding: "20px 24px" }}>
        <div className="section-row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Lịch sử hoạt động</h2>
              {datePreset !== "all" && (
                <span className="badge pink" style={{ fontSize: "0.78rem", padding: "2px 8px", borderRadius: 10 }}>
                  Đối soát: {datePreset === "today" ? "Hôm nay" : datePreset === "yesterday" ? "Hôm qua" : datePreset === "7days" ? "7 ngày qua" : formatVnDisplayDate(customDate)}
                </span>
              )}
            </div>
            <p className="card-subtitle" style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Những thay đổi gần đây ở quán đều được lưu tại đây.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="badge neutral" style={{ fontSize: "0.82rem" }}>
              {loading || loadError ? "— hoạt động" : `${events.length} hoạt động được ghi nhận`}
            </span>
            <button
              type="button"
              className="button-secondary text-xs"
              onClick={() => void loadAudit(datePreset, customDate)}
              disabled={loading}
              title="Làm mới lịch sử hoạt động"
              style={{ padding: "6px 12px", minHeight: 34, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10 }}
            >
              <RotateCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Làm mới</span>
            </button>
          </div>
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
          Dữ liệu lưu trữ chính xác để đối soát; không lưu tọa độ GPS chi tiết, ảnh khuôn mặt, mật khẩu hoặc mã phiên.
        </div>

        {/* Date Filter Bar for Reconciling (Bộ lọc ngày đối soát) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground, #332a2b)" }}>
            <Calendar size={15} style={{ color: "#6f2939" }} />
            <span>Đối soát theo ngày:</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {(
              [
                { key: "all", label: "Tất cả các ngày" },
                { key: "today", label: "Hôm nay" },
                { key: "yesterday", label: "Hôm qua" },
                { key: "7days", label: "7 ngày qua" },
                { key: "custom", label: "Chọn ngày cụ thể" },
              ] as const
            ).map((p) => {
              const isActive = datePreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`filter-chip ${isActive ? "active" : ""}`}
                  onClick={() => {
                    if (p.key === "custom") {
                      setDatePreset("custom");
                      if (!customDate) {
                        const today = getTodayVnDate();
                        setCustomDate(today);
                        void loadAudit("custom", today);
                      } else {
                        void loadAudit("custom", customDate);
                      }
                    } else {
                      setDatePreset(p.key);
                      if (p.key === "all") setCustomDate("");
                      void loadAudit(p.key, "");
                    }
                  }}
                  style={{
                    padding: "5px 12px",
                    minHeight: 34,
                    borderRadius: 20,
                    fontSize: "0.8rem",
                    fontWeight: isActive ? 700 : 500,
                    border: isActive ? "1px solid var(--primary, #6f2939)" : "1px solid var(--border-subtle, #e2e8f0)",
                    background: isActive ? "var(--primary, #6f2939)" : "transparent",
                    color: isActive ? "#ffffff" : "inherit",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {p.label}
                </button>
              );
            })}

            {datePreset === "custom" && (
              <input
                type="date"
                aria-label="Chọn ngày đối soát"
                value={customDate}
                max={getTodayVnDate()}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomDate(val);
                  if (val) void loadAudit("custom", val);
                }}
                style={{
                  padding: "4px 10px",
                  minHeight: 34,
                  fontSize: "0.82rem",
                  borderRadius: 10,
                  border: "1px solid var(--primary, #6f2939)",
                  backgroundColor: "#fff",
                  color: "#332a2b",
                  outline: "none",
                }}
              />
            )}

            {datePreset !== "all" && (
              <button
                type="button"
                onClick={() => {
                  setDatePreset("all");
                  setCustomDate("");
                  void loadAudit("all", "");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  fontSize: "0.78rem",
                  color: "#7b6f70",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
                title="Bỏ lọc ngày để xem tất cả"
              >
                <X size={13} />
                <span>Bỏ lọc ngày</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
            <input
              type="text"
              placeholder="Tìm theo người thực hiện, hành động, từ khóa..."
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
            {CATEGORY_CHIPS.map((chip) => (
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

      {/* Events List */}
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : loadError ? (
          <AsyncStatePanel state="error" title="Không thể tải lịch sử hoạt động" description={loadError} actionLabel="Thử lại" onAction={() => void loadAudit(datePreset, customDate)} />
        ) : filteredEvents.length === 0 ? (
          hasAnyFilter ? (
            <AsyncStatePanel
              state="empty"
              title={
                datePreset !== "all"
                  ? `Không có hoạt động nào trong ${datePreset === "today" ? "hôm nay" : datePreset === "yesterday" ? "hôm qua" : datePreset === "7days" ? "7 ngày qua" : `ngày ${formatVnDisplayDate(customDate)}`}`
                  : "Không có hoạt động khớp bộ lọc"
              }
              description="Thử tìm kiếm với từ khóa khác, đổi ngày hoặc xóa các bộ lọc hiện tại."
              actionLabel="Xóa bộ lọc"
              onAction={resetAllFilters}
            />
          ) : (
            <AsyncStatePanel
              state="empty"
              title="Chưa có hoạt động nào được ghi nhận"
              description="Các thao tác và thay đổi quan trọng tại quán sẽ xuất hiện tại đây."
            />
          )
        ) : (
          <div className="list">
            {groupedEvents.map((group) => (
              <div key={group.label} className="audit-date-group">
                <div
                  style={{
                    padding: "8px 20px",
                    background: "var(--surface-subtle, #f8fafc)",
                    borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
                    borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--muted, #665055)",
                    textTransform: "uppercase",
                  }}
                >
                  {group.label}
                </div>

                {group.events.map((event) => {
                  const isExpanded = expandedEventId === event.id;
                  let parsedMeta: Record<string, unknown> | null = null;
                  try {
                    if (event.metadata && event.metadata !== "{}" && event.metadata !== "null") {
                      parsedMeta = JSON.parse(event.metadata);
                    }
                  } catch {
                    // Ignore parse errors
                  }

                  const presentation = resolveEventPresentation(event, parsedMeta);
                  const actorDisplay = formatActor(event.actor_email, event.actor_name, event.actor_role);
                  const hasMeta = Boolean(parsedMeta && Object.keys(parsedMeta).length > 0);

                  return (
                    <div
                      key={event.id}
                      className="list-row"
                      style={{
                        padding: "16px 20px",
                        borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
                        background: isExpanded ? "var(--surface-subtle, #fafafa)" : "transparent",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                      }}
                    >
                      {/* Left status icon */}
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        <span className={`mini-icon ${presentation.iconType}`}>
                          <FileClock size={16} />
                        </span>
                      </div>

                      {/* Main card body */}
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                        {/* Action title and Category badge */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "0.95rem", color: "var(--foreground, #27141a)" }}>
                            {presentation.title}
                          </strong>
                          <span className="badge neutral" style={{ fontSize: "0.72rem", padding: "1px 8px", borderRadius: 12 }}>
                            {presentation.categoryBadge}
                          </span>
                        </div>

                        {/* Actor and time subline */}
                        <div style={{ fontSize: "0.82rem", color: "var(--muted, #665055)", fontWeight: 500 }}>
                          {actorDisplay} · {formatTime(event.created_at)}
                        </div>

                        {/* Natural descriptive sentence */}
                        <p style={{ margin: "2px 0 6px", fontSize: "0.85rem", color: "var(--foreground-muted, #4b363c)", lineHeight: 1.45 }}>
                          {presentation.summary}
                        </p>

                        {/* Detail toggle */}
                        <div>
                          <button
                            type="button"
                            className="button-secondary"
                            style={{
                              padding: "3px 10px",
                              fontSize: "0.76rem",
                              fontWeight: 600,
                              borderRadius: 8,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                          >
                            {isExpanded ? "Thu gọn ▲" : "Xem chi tiết ▼"}
                          </button>
                        </div>

                        {/* Expanded details (Tối giản, thân thiện, không hiển thị mã kỹ thuật) */}
                        {isExpanded && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: "12px 14px",
                              background: "#ffffff",
                              borderRadius: 10,
                              border: "1px solid var(--border-subtle, #e2e8f0)",
                              fontSize: "0.82rem",
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}
                          >
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                              <div style={{ padding: "8px 12px", background: "var(--surface-subtle, #f8fafc)", borderRadius: 8 }}>
                                <span style={{ color: "var(--muted)", fontSize: "0.74rem", display: "block" }}>Người thực hiện</span>
                                <strong style={{ fontSize: "0.85rem" }}>{actorDisplay}</strong>
                                {event.actor_email !== "system" && !actorDisplay.includes(event.actor_email) && (
                                  <span style={{ color: "var(--muted)", fontSize: "0.76rem", display: "block", marginTop: 2 }}>{event.actor_email}</span>
                                )}
                              </div>
                              <div style={{ padding: "8px 12px", background: "var(--surface-subtle, #f8fafc)", borderRadius: 8 }}>
                                <span style={{ color: "var(--muted)", fontSize: "0.74rem", display: "block" }}>Thời điểm ghi nhận</span>
                                <strong style={{ fontSize: "0.85rem" }}>{formatFullDateTime(event.created_at)}</strong>
                              </div>
                            </div>

                            {hasMeta && (
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                                {Object.entries(parsedMeta!)
                                  .filter(([k]) => !["id", "commandId", "shift1Id", "shift2Id", "nonceHash"].includes(k))
                                  .map(([k, v]) => (
                                    <div key={k} style={{ padding: "8px 12px", background: "var(--surface-subtle, #f8fafc)", borderRadius: 8 }}>
                                      <span style={{ color: "var(--muted)", fontSize: "0.74rem", display: "block" }}>
                                        {META_FIELD_LABELS[k] ?? k}
                                      </span>
                                      <strong style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
                                        {formatMetaValue(k, v)}
                                      </strong>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function getTodayVnDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getYesterdayVnDate(): string {
  const yesterday = new Date(Date.now() - 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(yesterday);
}

function getSevenDaysAgoVnDate(): string {
  const past = new Date(Date.now() - 7 * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(past);
}

function getEventVnDate(isoString: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

function formatVnDisplayDate(ymdString: string): string {
  if (!ymdString) return "";
  const parts = ymdString.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return ymdString;
}

function formatDateGroup(isoString: string): string {
  const eventDate = new Date(isoString);
  const now = new Date();

  const getVnDateParts = (d: Date) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };

  const eventYmd = getVnDateParts(eventDate);
  const todayYmd = getVnDateParts(now);

  const yesterdayDate = new Date(now.getTime() - 86_400_000);
  const yesterdayYmd = getVnDateParts(yesterdayDate);

  const [, m, d] = eventYmd.split("-");
  const dayMonth = `${d}/${m}`;

  if (eventYmd === todayYmd) {
    return `HÔM NAY · ${dayMonth}`;
  }
  if (eventYmd === yesterdayYmd) {
    return `HÔM QUA · ${dayMonth}`;
  }
  const [y] = eventYmd.split("-");
  return `${dayMonth}/${y}`;
}

function formatTime(isoString: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function formatActor(email: string, name?: string | null, role?: string | null): string {
  if (email === "system") return "Hệ thống tự động";

  const roleTitles: Record<string, string> = {
    owner: "Chủ quán",
    manager: "Quản lý",
    team_lead: "Trưởng ca",
    employee: "Nhân viên",
    system_admin: "Quản trị viên",
  };
  const roleName = role ? roleTitles[role] ?? role : "";

  if (name && name.trim()) {
    const trimmed = name.trim();
    if (role === "owner" && (trimmed.toLowerCase() === "owner" || trimmed.toLowerCase().includes("@") || trimmed === "Chủ quán")) {
      return "Chủ quán";
    }
    return roleName ? `${trimmed} (${roleName})` : trimmed;
  }

  if (roleName) return roleName;
  if (email.startsWith("owner@") || email.includes("owner")) return "Chủ quán";
  if (email.startsWith("manager@") || email.includes("manager")) return "Quản lý";
  if (email.includes("@")) {
    const local = email.split("@")[0];
    if (local.startsWith("staff.")) {
      const staffLetter = local.replace("staff.", "").toUpperCase();
      return `Nhân viên ${staffLetter}`;
    }
    return email;
  }
  return email;
}

function resolveEventPresentation(
  event: AuditEventItem,
  meta: Record<string, unknown> | null,
): {
  title: string;
  summary: string;
  categoryBadge: string;
  iconType: "mint" | "pink" | "amber" | "blue";
} {
  const { action, entity_type } = event;

  // 1. Attendance Capture Sessions (Starting photo capture / opening camera)
  // CRITICAL RULE: NEVER interpret capture session as "Chấm công thành công".
  if (action === "attendance.capture_session_created" || entity_type === "attendance_capture_session") {
    const targetAction = meta?.action === "check_out" ? "ra ca" : "vào ca";
    return {
      title: "Tạo phiên chấm công",
      summary: `Đã bắt đầu một phiên chụp ảnh để ${targetAction}.`,
      categoryBadge: "Phiên chấm công",
      iconType: "blue",
    };
  }

  // 2. Attendance Events (Actual check-in / check-out recorded)
  if (action === "attendance.check_in") {
    return {
      title: "Chấm công vào ca",
      summary: "Ghi nhận nhân viên vào ca làm việc thành công.",
      categoryBadge: "Chấm công",
      iconType: "mint",
    };
  }

  if (action === "attendance.check_out") {
    return {
      title: "Chấm công ra ca",
      summary: "Ghi nhận nhân viên hoàn tất ca làm việc thành công.",
      categoryBadge: "Chấm công",
      iconType: "mint",
    };
  }

  if (action === "attendance.adjust_time" || action === "attendance.corrected") {
    const reasonText = meta?.reason ? ` (Lý do: ${String(meta.reason)})` : "";
    return {
      title: "Điều chỉnh giờ chấm công",
      summary: `Đã điều chỉnh lại giờ chấm công thực tế${reasonText}.`,
      categoryBadge: "Chấm công",
      iconType: "pink",
    };
  }

  if (action === "attendance.review_approved" || action === "attendance.reviewed") {
    return {
      title: "Phê duyệt chấm công",
      summary: "Bản ghi chấm công đã được quản lý/chủ quán phê duyệt.",
      categoryBadge: "Chấm công",
      iconType: "mint",
    };
  }

  if (action === "attendance.review_rejected") {
    return {
      title: "Từ chối duyệt chấm công",
      summary: "Bản ghi chấm công đã bị từ chối xét duyệt.",
      categoryBadge: "Chấm công",
      iconType: "amber",
    };
  }

  if (action === "attendance.auto_closed") {
    return {
      title: "Đóng ca tự động",
      summary: "Hệ thống tự động đóng ca làm việc do quá thời hạn tối đa.",
      categoryBadge: "Chấm công",
      iconType: "amber",
    };
  }

  if (action === "attendance.evidence_cleanup_resolved" || action === "attendance.evidence_expired") {
    return {
      title: "Dọn dẹp bằng chứng nhạy cảm",
      summary: "Đã dọn dẹp ảnh và vị trí chấm công quá hạn 90 ngày theo chính sách lưu trữ.",
      categoryBadge: "Chấm công",
      iconType: "blue",
    };
  }

  // 3. Employee, Profile & Access
  if (action === "profile.name_updated") {
    const newName = meta?.newName ? ` thành "${String(meta.newName)}"` : "";
    return {
      title: "Cập nhật hồ sơ nhân viên",
      summary: `Thông tin nhân sự đã được cập nhật${newName}.`,
      categoryBadge: "Nhân sự",
      iconType: "pink",
    };
  }

  if (action === "employee.profile_updated" || action === "account.info_updated") {
    return {
      title: "Cập nhật thông tin nhân viên",
      summary: "Thông tin nhân sự đã được cập nhật.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "pink",
    };
  }

  if (action === "employee.access_updated" || action.startsWith("rbac.")) {
    return {
      title: "Cập nhật phân quyền & vai trò",
      summary: "Thay đổi vai trò hoặc quyền hạn truy cập của nhân viên trong quán.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "amber",
    };
  }

  if (action === "account.created") {
    return {
      title: "Tạo tài khoản nhân viên",
      summary: "Khởi tạo tài khoản nhân viên mới trong hệ thống.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "mint",
    };
  }

  if (action === "account.password_reset") {
    return {
      title: "Cấp lại mật khẩu nhân viên",
      summary: "Đã gửi lại yêu cầu cấp mật khẩu tạm thời cho tài khoản.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "amber",
    };
  }

  if (action === "account.password_changed") {
    return {
      title: "Đổi mật khẩu tài khoản",
      summary: "Tài khoản đã hoàn tất đổi mật khẩu mới.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "pink",
    };
  }

  if (action === "account.invite_resent") {
    return {
      title: "Gửi lại lời mời tham gia",
      summary: "Đã gửi lại liên kết lời mời kích hoạt tài khoản nhân viên.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "blue",
    };
  }

  if (action === "account.email_changed") {
    const prev = meta?.previousEmail ? String(meta.previousEmail) : "";
    const next = meta?.newEmail ? String(meta.newEmail) : "";
    const detail = prev && next ? ` từ ${prev} sang ${next}` : "";
    return {
      title: "Đổi email đăng nhập",
      summary: `Đã cập nhật địa chỉ email đăng nhập của tài khoản${detail}.`,
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "amber",
    };
  }

  if (action === "account.deleted") {
    const targetEmail = meta?.email ? ` (${String(meta.email)})` : "";
    return {
      title: "Xóa vĩnh viễn tài khoản & dữ liệu",
      summary: `Đã xóa vĩnh viễn tài khoản${targetEmail} và toàn bộ dữ liệu liên quan khỏi hệ thống.`,
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "pink",
    };
  }

  if (action === "admin.pin_configured") {
    return {
      title: "Thiết lập mã PIN bảo mật",
      summary: "Quản trị hệ thống đã khởi tạo hoặc cập nhật mã PIN xác thực xóa dữ liệu.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "amber",
    };
  }

  if (action === "employee.invitation_accepted") {
    return {
      title: "Kích hoạt tài khoản thành công",
      summary: "Nhân viên đã hoàn tất kích hoạt tài khoản và đăng nhập lần đầu.",
      categoryBadge: "Nhân sự & phân quyền",
      iconType: "mint",
    };
  }

  // 4. Payroll
  if (action === "payroll.finalized") {
    const period = meta?.period ? ` kỳ ${String(meta.period)}` : "";
    return {
      title: "Khóa sổ bảng lương",
      summary: `Đã chốt và khóa sổ bảng lương${period}.`,
      categoryBadge: "Lương thưởng",
      iconType: "pink",
    };
  }

  if (action === "payroll.reopened") {
    const period = meta?.period ? ` kỳ ${String(meta.period)}` : "";
    return {
      title: "Mở lại bảng lương",
      summary: `Mở lại bảng lương${period} để điều chỉnh hoặc tính toán lại.`,
      categoryBadge: "Lương thưởng",
      iconType: "amber",
    };
  }

  if (action === "payroll.adjusted") {
    const amountVal = meta?.amount !== undefined ? Number(meta.amount) : null;
    const amountText = amountVal !== null ? ` (${amountVal > 0 ? "+" : ""}${amountVal.toLocaleString("vi-VN")}đ)` : "";
    return {
      title: "Điều chỉnh lương thưởng",
      summary: `Đã thêm khoản điều chỉnh trên bảng lương${amountText}.`,
      categoryBadge: "Lương thưởng",
      iconType: "pink",
    };
  }

  if (action === "reports.payroll_exported") {
    const period = meta?.period ? ` kỳ ${String(meta.period)}` : "";
    return {
      title: "Xuất file bảng lương",
      summary: `Đã tải xuống file bảng tính lương${period}.`,
      categoryBadge: "Lương thưởng",
      iconType: "blue",
    };
  }

  if (action === "reports.attendance_exported") {
    const period = meta?.period ? ` kỳ ${String(meta.period)}` : "";
    return {
      title: "Xuất dữ liệu chấm công",
      summary: `Đã tải xuống file báo cáo chấm công${period}.`,
      categoryBadge: "Chấm công",
      iconType: "blue",
    };
  }

  // 5. Store, Shifts, Operations
  if (action === "store.updated") {
    return {
      title: "Cập nhật cấu hình quán",
      summary: "Thông tin vị trí hoặc cài đặt của quán đã được cập nhật.",
      categoryBadge: "Cửa hàng & ca làm",
      iconType: "pink",
    };
  }

  if (action === "ordering.settings_updated") {
    return {
      title: "Cập nhật trạng thái nhận đơn",
      summary: "Thay đổi cài đặt bật/tắt nhận đơn trực tiếp tại quầy.",
      categoryBadge: "Cửa hàng & ca làm",
      iconType: "blue",
    };
  }

  if (action.startsWith("shift.")) {
    const isPub = action.includes("published");
    return {
      title: isPub ? "Phát hành lịch làm việc" : "Cập nhật ca làm việc",
      summary: isPub ? "Lịch làm việc đã được công bố cho toàn bộ nhân viên." : "Thông tin phân ca làm việc đã được cập nhật.",
      categoryBadge: "Cửa hàng & ca làm",
      iconType: "mint",
    };
  }

  if (action.startsWith("request.")) {
    if (action.includes("approved")) {
      return {
        title: "Duyệt yêu cầu của nhân viên",
        summary: "Đã phê duyệt yêu cầu đổi ca, hỗ trợ hoặc xin nghỉ.",
        categoryBadge: "Cửa hàng & ca làm",
        iconType: "mint",
      };
    }
    if (action.includes("rejected")) {
      return {
        title: "Từ chối yêu cầu của nhân viên",
        summary: "Đã từ chối yêu cầu đổi ca hoặc xin nghỉ.",
        categoryBadge: "Cửa hàng & ca làm",
        iconType: "amber",
      };
    }
    if (action.includes("withdrawn")) {
      return {
        title: "Rút lại yêu cầu ca",
        summary: "Nhân viên đã chủ động hủy bỏ yêu cầu đã gửi.",
        categoryBadge: "Cửa hàng & ca làm",
        iconType: "blue",
      };
    }
    return {
      title: "Gửi yêu cầu ca làm",
      summary: "Nhân viên đã gửi một yêu cầu mới trên hệ thống.",
      categoryBadge: "Cửa hàng & ca làm",
      iconType: "blue",
    };
  }

  if (action === "handover.created") {
    return {
      title: "Gửi sổ bàn giao ca",
      summary: "Đã hoàn thành ghi chú bàn giao cho ca làm việc tiếp theo.",
      categoryBadge: "Cửa hàng & ca làm",
      iconType: "mint",
    };
  }

  if (action.startsWith("incident.")) {
    const isAck = action.includes("acknowledged");
    return {
      title: isAck ? "Tiếp nhận xử lý sự cố" : "Báo cáo sự cố tại quầy",
      summary: isAck ? "Sự cố vận hành đã được quản lý tiếp nhận xử lý." : "Ghi nhận một sự cố phát sinh tại quán cần khắc phục.",
      categoryBadge: "Cửa hàng & ca làm",
      iconType: "amber",
    };
  }

  if (action.startsWith("checklist.")) {
    const isComp = action.includes("completed");
    return {
      title: isComp ? "Hoàn tất việc kiểm tra ca" : "Cập nhật đầu việc kiểm tra",
      summary: isComp ? "Đã kiểm tra và hoàn thành đầu việc trong ca." : "Đầu việc kiểm tra ca làm việc đã được cập nhật.",
      categoryBadge: "Cửa hàng & ca làm",
      iconType: "mint",
    };
  }

  // Fallback for any other event
  return {
    title: action.replaceAll(".", " · ").replaceAll("_", " "),
    summary: "Hoạt động đã được ghi nhận an toàn trên hệ thống.",
    categoryBadge: entity_type.replaceAll("_", " "),
    iconType: "blue",
  };
}
