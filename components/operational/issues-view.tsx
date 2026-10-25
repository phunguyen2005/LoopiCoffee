"use client";

import React, { useEffect, useState, useRef } from "react";
import { AlertCircle, PackageOpen, Plus } from "lucide-react";
import {
  ApiState,
  AsyncStatePanel,
  ListSkeleton,
  ViewHeader,
  formatDateTime,
  readJson,
  severityLabel,
  statusLabel,
} from "./shared";

const NEXT_INCIDENT_STATUS: Record<string, "acknowledged" | "resolved" | "closed" | undefined> = {
  open: "acknowledged",
  acknowledged: "resolved",
  resolved: "closed",
  closed: undefined,
};

const NEXT_ACTION_LABEL: Record<string, string> = {
  open: "Tiếp nhận",
  acknowledged: "Đánh dấu đã xử lý",
  resolved: "Đóng sự cố",
};

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
  const [notice, setNotice] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"unresolved" | "all">("all");
  const saveLock = useRef(false);
  const statusLock = useRef(false);
  const createKey = useRef("");

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
    saveLock.current = true; setSaving(true); setError(null); setNotice(null);
    try {
      const idempotencyKey = createKey.current || (createKey.current = crypto.randomUUID());
      await readJson(await fetch("/api/incidents", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, category, severity, idempotencyKey }),
      }));
      createKey.current = "";
      setTitle(""); setShowForm(false);
      setNotice("Đã gửi báo cáo sự cố rồi nhé. Quản lý cửa hàng đã nhận được thông tin để hỗ trợ!");
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa xác nhận được báo cáo. Gửi lại sẽ dùng đúng mã cũ để tránh tạo trùng."); }
    finally { saveLock.current = false; setSaving(false); }
  }

  async function updateStatus(id: string, status: "acknowledged" | "resolved" | "closed") {
    if (statusLock.current) return;
    statusLock.current = true; setPendingId(id); setError(null); setNotice(null);
    try {
      await readJson(await fetch("/api/incidents", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }),
      }));
      setNotice("Đã cập nhật trạng thái sự cố rồi nhé! ✨");
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không thể cập nhật sự cố.");
      await refresh();
    }
    finally { statusLock.current = false; setPendingId(null); }
  }

  const unresolvedCount = (issues ?? []).filter((issue) => ["open", "acknowledged"].includes(issue.status)).length;

  const statusOrder: Record<string, number> = {
    open: 0,
    acknowledged: 1,
    resolved: 2,
    closed: 3,
  };
  const severityOrder: Record<string, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  const sortedIssues = [...issues]
    .filter((issue) => {
      if (filterMode === "unresolved") return ["open", "acknowledged"].includes(issue.status);
      return true;
    })
    .sort((a, b) => {
      const sDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (sDiff !== 0) return sDiff;
      const sevDiff = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="page-grid issues-page">
      <section className="card">
        <div className="section-row issues-heading" style={{ marginBottom: 14 }}>
          <ViewHeader title="Sự cố & Hỗ trợ quầy" subtitle="Ghi nhận hỏng hóc thiết bị và thiếu hụt nguyên liệu" />
          <button
            type="button"
            className="button button-compact"
            style={{ minHeight: 44 }}
            onClick={() => setShowForm((value) => !value)}
          >
            <Plus size={15} /> {showForm ? "Đóng biểu mẫu" : "Báo sự cố"}
          </button>
        </div>
        {error && <p role="alert" className="inline-error">{error}</p>}
        {notice && (
          <p role="status" className="operation-message" style={{ fontSize: "0.82rem", marginBottom: 14 }}>
            {notice}
          </p>
        )}
        {showForm && (
          <form className="attention-card operation-form" onSubmit={create} style={{ marginBottom: 18 }}>
            <div className="field">
              <label htmlFor="incident-category">Phân loại sự cố *</label>
              <select id="incident-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>Thiết bị</option>
                <option>Thiếu nguyên liệu</option>
                <option>Thiếu bao bì</option>
                <option>Khác</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="incident-severity">Mức độ ảnh hưởng *</label>
              <select id="incident-severity" value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="low">Thấp (Chưa ảnh hưởng khách)</option>
                <option value="medium">Vừa (Cần xử lý trong ngày)</option>
                <option value="high">Cao (Cản trở bán hàng ngay)</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="incident-title">Mô tả ngắn sự cố * (tối thiểu 3 ký tự)</label>
              <input
                id="incident-title"
                minLength={3}
                maxLength={180}
                placeholder="VD: Máy xay cà phê kêu to, sắp hết sữa tươi..."
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {[
                  { label: "Máy pha / máy xay trục trặc", cat: "Thiết bị", sev: "high" },
                  { label: "Sắp hết sữa tươi / hạt cà phê", cat: "Thiếu nguyên liệu", sev: "medium" },
                  { label: "Sắp hết ly / nắp / ống hút", cat: "Thiếu bao bì", sev: "medium" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTitle(preset.label);
                      setCategory(preset.cat);
                      setSeverity(preset.sev);
                    }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--line)",
                      background: "white",
                      color: "var(--coffee)",
                      fontSize: "0.74rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-actions">
              <button className="button button-compact" style={{ minHeight: 44 }} type="submit" disabled={saving}>
                {saving ? "Đang gửi…" : "Gửi báo cáo"}
              </button>
            </div>
          </form>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          {state === "ready" && issues.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Bộ lọc trạng thái sự cố">
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                className={filterMode === "all" ? "button button-compact" : "button-secondary button-compact"}
                style={{ minHeight: 40, padding: "0 13px", fontSize: "0.78rem" }}
              >
                Tất cả ({issues.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("unresolved")}
                className={filterMode === "unresolved" ? "button button-compact" : "button-secondary button-compact"}
                style={{ minHeight: 40, padding: "0 13px", fontSize: "0.78rem" }}
              >
                Chưa xử lý ({unresolvedCount})
              </button>
            </div>
          )}
          <p className="supporting-copy" aria-label="Quy trình xử lý sự cố" style={{ margin: 0, fontSize: "0.78rem" }}>
            Mới mở → Đã tiếp nhận → Đã xử lý → Đã đóng
          </p>
        </div>

        {state === "error" ? (
          <AsyncStatePanel state="error" title="Không thể tải danh sách sự cố" description="Số sự cố cần xử lý chưa được xác nhận." actionLabel="Thử lại" onAction={() => void refresh()} />
        ) : (
          <div className="list">
            {state === "loading" && <ListSkeleton rows={4} />}
            {state === "ready" && !issues.length && (
              <AsyncStatePanel state="empty" title="Quán đang chạy êm ru ✨" description="Hiện không có sự cố nào được ghi nhận tại quầy. Nếu có máy móc hỏng hay thiếu đồ, hãy bấm báo ngay nhé!" actionLabel="Báo sự cố" onAction={() => setShowForm(true)} />
            )}
            {state === "ready" && issues.length > 0 && sortedIssues.length === 0 && (
              <AsyncStatePanel
                compact
                state="empty"
                title="Tuyệt vời! Không còn sự cố nào chưa xử lý ✨"
                description="Mọi vấn đề thiết bị và nguyên vật liệu đã được giải quyết hoặc đóng xong."
                actionLabel="Xem tất cả"
                onAction={() => setFilterMode("all")}
              />
            )}
            {sortedIssues.map((issue) => {
              const isUnresolved = ["open", "acknowledged"].includes(issue.status);
              return (
                <div
                  className="list-row issue-row"
                  key={issue.id}
                  style={{
                    padding: "12px 14px",
                    marginBottom: 8,
                    borderRadius: 14,
                    border: isUnresolved ? "1px solid #f2d0d6" : "1px solid var(--line)",
                    background: isUnresolved ? "#fffafa" : "white",
                  }}
                >
                  <div className="person">
                    <span className={`mini-icon ${issue.severity === "high" ? "pink" : "mint"}`}><PackageOpen size={15} /></span>
                    <span className="person-copy">
                      <strong>{issue.title}</strong>
                      <small>{issue.category} · {formatDateTime(issue.created_at)}</small>
                    </span>
                  </div>
                  <div className="row-actions" style={{ gap: 8 }}>
                    <span className={`badge ${issue.severity === "high" ? "danger" : issue.severity === "medium" ? "warning" : "neutral"}`}>{severityLabel(issue.severity)}</span>
                    <span className={`badge ${["resolved", "closed"].includes(issue.status) ? "success" : "warning"}`}>{statusLabel(issue.status)}</span>
                    {canManage && NEXT_INCIDENT_STATUS[issue.status] && (
                      <button
                        type="button"
                        className="button-secondary button-compact"
                        disabled={pendingId !== null}
                        style={{ minHeight: 44, paddingInline: 12, fontSize: "0.78rem" }}
                        aria-label={`${NEXT_ACTION_LABEL[issue.status]} sự cố: ${issue.title}`}
                        onClick={() => updateStatus(issue.id, NEXT_INCIDENT_STATUS[issue.status]!)}
                      >
                        {pendingId === issue.id ? "Đang lưu…" : NEXT_ACTION_LABEL[issue.status]}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <aside className="stack">
        <section className="card">
          <ViewHeader title="Nguyên tắc báo sự cố" subtitle="Ưu tiên xử lý gián đoạn vận hành" />
          <p className="supporting-copy">Báo sớm giúp Quản lý phân công kỹ thuật hoặc chủ động điều chuyển nguyên liệu trước giờ cao điểm.</p>
          <div className="attention-card" style={{ marginTop: 12 }}>
            <span className="badge danger"><AlertCircle size={12} /> Cần ưu tiên</span>
            <h4 style={{ marginTop: 8 }}>{state !== "ready" ? "— sự cố cần xử lý" : `${unresolvedCount} sự cố cần xử lý`}</h4>
            <p style={{ fontSize: 11, margin: "4px 0 0" }}>Bao gồm hỏng hóc máy móc & thiếu hụt bao bì.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
