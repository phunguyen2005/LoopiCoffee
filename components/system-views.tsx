"use client";

import Link from "next/link";
import { Bell, CheckCircle2, FileClock } from "lucide-react";
import { useEffect, useState } from "react";

export function NotificationsView() {
  const [items, setItems] = useState<Array<{
    id: string; title: string; entity_href: string | null; read_at: string | null; created_at: string;
  }>>([]);
  useEffect(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setItems(payload.notifications ?? []));
  }, []);
  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }
  return (
    <section className="card">
      <div className="card-header"><div><h2 className="card-title">Thông báo của bạn</h2><p className="card-subtitle">{items.filter((item) => !item.read_at).length} chưa đọc</p></div></div>
      <div className="list">
        {items.length === 0 && <p className="supporting-copy">Chưa có thông báo mới.</p>}
        {items.map((item) => (
          <div className="list-row" key={item.id}>
            <div className="person"><span className={`mini-icon ${item.read_at ? "mint" : "pink"}`}>{item.read_at ? <CheckCircle2 size={15} /> : <Bell size={15} />}</span><span className="person-copy"><strong>{item.title}</strong><small>{formatDateTime(item.created_at)}</small></span></div>
            <div className="row-actions">
              {item.entity_href && <Link className="text-link" href={item.entity_href}>Mở</Link>}
              {!item.read_at && <button className="text-link" onClick={() => markRead(item.id)}>Đã đọc</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AuditView() {
  const [events, setEvents] = useState<Array<{
    id: string; actor_email: string; entity_type: string; action: string; created_at: string;
  }>>([]);
  useEffect(() => {
    fetch("/api/audit", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setEvents(payload.events ?? []));
  }, []);
  return (
    <section className="card">
      <div className="card-header"><div><h2 className="card-title">Nhật ký kiểm toán</h2><p className="card-subtitle">Không chứa tọa độ, ảnh, token hoặc dữ liệu lương</p></div></div>
      <div className="list">
        {events.map((event) => (
          <div className="list-row" key={event.id}>
            <div className="person"><span className="mini-icon mint"><FileClock size={15} /></span><span className="person-copy"><strong>{actionLabel(event.action)}</strong><small>{event.actor_email} · {event.entity_type} · {formatDateTime(event.created_at)}</small></span></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function actionLabel(value: string) {
  return value.replaceAll(".", " · ").replaceAll("_", " ");
}
