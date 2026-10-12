"use client";

import React, { useEffect, useState, useRef } from "react";
import { AlertCircle, PackageOpen, Plus } from "lucide-react";
import {
  ApiState,
  InlineError,
  ViewHeader,
  formatDateTime,
  readJson,
  severityLabel,
  statusLabel,
} from "./shared";

export function PersistentIssuesView({ canManage = false }: { canManage?: boolean }) {
  const [issues, setIssues] = useState<Array<{
    id: string; title: string; category: string; severity: string; status: string; created_at: string;
  }>>([]);
  const [state, setState] = useState<ApiState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Thiết bị");
  const [severity, setSeverity] = useState("medium");
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveLock = useRef(false);
  const statusLock = useRef(false);

  useEffect(() => {
    fetch("/api/incidents", { cache: "no-store" })
      .then(readJson<{ incidents: typeof issues }>)
      .then((payload) => { setIssues(payload.incidents ?? []); setState("ready"); })
      .catch(() => setState("error"));
  }, []);

  async function refresh() {
    try {
      const payload = await readJson<{ incidents: typeof issues }>(await fetch("/api/incidents", { cache: "no-store" }));
      setIssues(payload.incidents ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true); setError(null);
    try {
      await readJson(await fetch("/api/incidents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category, severity }),
      }));
      setTitle(""); setShowForm(false);
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa xác nhận được báo cáo. Kiểm tra danh sách trước khi gửi lại."); }
    finally { saveLock.current = false; setSaving(false); }
  }

  async function updateStatus(id: string, status: "acknowledged" | "resolved" | "closed") {
    if (statusLock.current) return;
    statusLock.current = true; setPendingId(id); setError(null);
    try {
      await readJson(await fetch("/api/incidents", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }),
      }));
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không thể cập nhật sự cố."); }
    finally { statusLock.current = false; setPendingId(null); }
  }

  return (
    <div className="page-grid issues-page">
      <section className="card">
        <div className="section-row issues-heading" style={{ marginBottom: 18 }}>
          <ViewHeader title="Danh sách cần xử lý" subtitle="Thiết bị, vận hành và thiếu nguyên liệu" />
          <button className="button button-compact" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Báo sự cố</button>
        </div>
        {error && <p role="alert" className="inline-error">{error}</p>}
        {showForm && (
          <form className="attention-card operation-form" onSubmit={create}>
            <div className="field full"><label htmlFor="incident-title">Mô tả ngắn</label><input id="incident-title" minLength={3} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} required /></div>
            <div className="field"><label htmlFor="incident-category">Loại</label><select id="incident-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>Thiết bị</option><option>Thiếu nguyên liệu</option><option>Thiếu bao bì</option><option>Khác</option></select></div>
            <div className="field"><label htmlFor="incident-severity">Mức độ</label><select id="incident-severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option></select></div>
            <div className="form-actions"><button className="button button-compact" type="submit" disabled={saving}>{saving ? "Đang gửi…" : "Gửi báo cáo"}</button></div>
          </form>
        )}
        {state === "error" ? <InlineError text="Không tải được danh sách sự cố." /> : (
          <div className="list">
            {state === "loading" && <p className="supporting-copy">Đang tải sự cố…</p>}
            {state === "ready" && !issues.length && <p className="supporting-copy">Chưa có sự cố nào.</p>}
            {issues.map((issue) => (
              <div className="list-row issue-row" key={issue.id}>
                <div className="person">
                  <span className={`mini-icon ${issue.severity === "high" ? "pink" : "mint"}`}><PackageOpen size={15} /></span>
                  <span className="person-copy"><strong>{issue.title}</strong><small>{issue.category} · {formatDateTime(issue.created_at)}</small></span>
                </div>
                <div className="row-actions">
                  <span className={`badge ${issue.severity === "high" ? "danger" : issue.severity === "medium" ? "warning" : "neutral"}`}>{severityLabel(issue.severity)}</span>
                  <span className={`badge ${["resolved", "closed"].includes(issue.status) ? "success" : "warning"}`}>{statusLabel(issue.status)}</span>
                  {canManage && issue.status !== "closed" && <button className="text-link" disabled={pendingId !== null} onClick={() => updateStatus(issue.id, issue.status === "open" ? "acknowledged" : issue.status === "acknowledged" ? "resolved" : "closed")}>
                    {pendingId === issue.id ? "Đang lưu…" : issue.status === "open" ? "Tiếp nhận" : issue.status === "acknowledged" ? "Đã xử lý" : "Đóng sự cố"}
                  </button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <aside className="stack">
        <section className="card">
          <ViewHeader title="Nguyên tắc báo sự cố" subtitle="Ưu tiên xử lý gián đoạn vận hành" />
          <p className="supporting-copy">Báo sớm giúp Quản lý phân công kỹ thuật hoặc chủ động điều chuyển nguyên liệu trước giờ cao điểm.</p>
          <div className="attention-card" style={{ marginTop: 12 }}>
            <span className="badge danger"><AlertCircle size={12} /> Cần ưu tiên</span>
            <h4 style={{ marginTop: 8 }}>{state === "loading" ? "Đang tải…" : `${(issues ?? []).filter((issue) => ["open", "acknowledged"].includes(issue.status)).length} sự cố cần xử lý`}</h4>
            <p style={{ fontSize: 11, margin: "4px 0 0" }}>Bao gồm hỏng hóc máy móc & thiếu hụt bao bì.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
