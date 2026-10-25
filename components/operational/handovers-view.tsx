"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { AsyncStatePanel, ListSkeleton, ViewHeader, formatDateTime, readJson } from "./shared";
import { clearPendingHandover, prepareHandoverAttempt } from "./handover-attempt";

type Handover = {
  id: string; summary: string; manager_attention: number; acknowledged_at?: string | null; created_at: string;
  author_name: string; receiver_name?: string | null; next_shift_starts_at?: string | null; can_acknowledge?: boolean;
};
type ShiftOption = { id: string; starts_at: string; ends_at: string; role_label: string; employee_id: string; employee_name: string };
type CurrentShift = { id: string; starts_at: string; ends_at: string; role_label: string };
type PendingChecklistItem = { id: string; label: string; assignee: string; required: number };
type HandoverPayload = {
  handovers: Handover[]; currentShift: CurrentShift | null; nextShifts: ShiftOption[]; unfinishedShiftItems: PendingChecklistItem[];
};

const QUICK_HANDOVER_TEMPLATES = [
  "Quầy ổn định, nguyên liệu và tiền lẻ đã kiểm đủ cho ca tiếp theo.",
  "Cần bổ sung thêm sữa tươi / đá viên ở đầu ca; máy móc hoạt động tốt.",
  "Đã dọn quầy cơ bản, nhờ ca sau kiểm tra lại khu vực bàn khách.",
];

export function PersistentHandoversView() {
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [currentShift, setCurrentShift] = useState<CurrentShift | null>(null);
  const [nextShifts, setNextShifts] = useState<ShiftOption[]>([]);
  const [unfinishedItems, setUnfinishedItems] = useState<PendingChecklistItem[]>([]);
  const [summary, setSummary] = useState("");
  const [nextShiftId, setNextShiftId] = useState("");
  const [managerAttention, setManagerAttention] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveLock = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const payload = await readJson<HandoverPayload>(await fetch("/api/handovers", { cache: "no-store" }));
      setHandovers(payload.handovers ?? []);
      setCurrentShift(payload.currentShift ?? null);
      setNextShifts(payload.nextShifts ?? []);
      setUnfinishedItems(payload.unfinishedShiftItems ?? []);
      setNextShiftId((current) => current || payload.nextShifts?.[0]?.id || "");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không tải được nội dung bàn giao. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function acknowledge(id: string) {
    try {
      setError(null);
      setAcknowledgingId(id);
      await readJson(await fetch("/api/handovers", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action: "acknowledge" }),
      }));
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa thể xác nhận bàn giao.");
    } finally {
      setAcknowledgingId(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saveLock.current || !currentShift) return;
    const selectedShift = nextShifts.find((item) => item.id === nextShiftId);
    if (!selectedShift) { setError("Hãy chọn ca nhận hợp lệ."); return; }
    const normalizedSummary = summary.trim();
    if (normalizedSummary.length < 10) { setError("Nội dung bàn giao cần ít nhất 10 ký tự."); return; }
    if (normalizedSummary.length > 2000) { setError("Nội dung bàn giao tối đa 2.000 ký tự."); return; }
    saveLock.current = true; setSaving(true); setSaved(false); setError(null);
    try {
      const payload = JSON.stringify({
        summary: normalizedSummary,
        managerAttention,
        shiftId: currentShift.id,
        receiverEmployeeId: selectedShift.employee_id,
        nextShiftId: selectedShift.id,
      });
      const attempt = prepareHandoverAttempt(payload);
      await readJson(await fetch("/api/handovers", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(attempt.payload), idempotencyKey: attempt.key }),
      }));
      clearPendingHandover();
      setSaved(true); setSummary(""); setManagerAttention(false);
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Chưa lưu được bàn giao. Gửi lại sẽ dùng cùng mã để tránh tạo trùng.");
    } finally {
      saveLock.current = false; setSaving(false);
    }
  }

  const pendingForMe = useMemo(
    () => handovers.filter((item) => !item.acknowledged_at && item.can_acknowledge),
    [handovers],
  );

  const sortedHandovers = useMemo(
    () =>
      [...handovers].sort((a, b) => {
        const aPending = !a.acknowledged_at && a.can_acknowledge ? 1 : 0;
        const bPending = !b.acknowledged_at && b.can_acknowledge ? 1 : 0;
        if (aPending !== bPending) return bPending - aPending;
        if (Boolean(a.acknowledged_at) !== Boolean(b.acknowledged_at)) {
          return a.acknowledged_at ? 1 : -1;
        }
        return Date.parse(b.created_at) - Date.parse(a.created_at);
      }),
    [handovers],
  );

  const summaryLength = summary.trim().length;

  return (
    <div className="page-grid">
      <section className="card">
        <ViewHeader title="Sổ bàn giao ca" subtitle="Nhận ca trước hoặc dặn dò cho ca tiếp theo; thông tin được lưu để đối chiếu" />

        {!loading && pendingForMe.length > 0 && (
          <div className="attention-card" role="region" aria-label="Bàn giao cần xác nhận ngay" style={{ marginBottom: 16, borderColor: "#f5c2c7", background: "#fff5f6" }}>
            <strong style={{ display: "flex", gap: 8, alignItems: "center", color: "#6f2939" }}>
              <AlertTriangle size={18} aria-hidden="true" />
              Có {pendingForMe.length} bàn giao gửi cho bạn đang chờ xác nhận nhận ca nè
            </strong>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {pendingForMe.map((item) => (
                <div key={item.id} style={{ background: "#ffffff", borderRadius: 12, padding: 12, border: "1px solid #f2d6dc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span className="person-copy">
                      <strong>Từ: {item.author_name}</strong>
                      <small>{formatDateTime(item.created_at)}</small>
                    </span>
                    {item.manager_attention ? <span className="badge warning">Cần quản lý chú ý</span> : null}
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: "8px 0 10px", fontSize: 13.5, color: "#332a2b" }}>
                    {item.summary}
                  </p>
                  <button
                    type="button"
                    className="button button-compact"
                    disabled={acknowledgingId !== null}
                    style={{ minHeight: 44, width: "100%", justifyContent: "center" }}
                    onClick={() => void acknowledge(item.id)}
                  >
                    {acknowledgingId === item.id ? "Đang xác nhận…" : "Xác nhận nhận ca ngay"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && currentShift && (
          <div className="attention-card" style={{ marginBottom: 16 }}>
            <strong style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {unfinishedItems.length ? <AlertTriangle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
              {unfinishedItems.length ? `Còn ${unfinishedItems.length} mục checklist ca chưa hoàn thành nè` : "Checklist ca đã hoàn thành xuất sắc! ✨"}
            </strong>
            {unfinishedItems.length > 0 && (
              <>
                <ul style={{ margin: "10px 0 0", paddingLeft: 22 }}>
                  {unfinishedItems.map((item) => <li key={item.id}>{item.label}{item.required ? " (bắt buộc)" : ""}</li>)}
                </ul>
                <div style={{ marginTop: 10 }}>
                  <Link href="/app/checklists" className="button-secondary button-compact" style={{ minHeight: 40, display: "inline-flex" }}>
                    Mở Checklist để hoàn tất
                  </Link>
                </div>
              </>
            )}
            <p className="supporting-copy" style={{ margin: "8px 0 0" }}>
              Các mục chưa xong được giữ nguyên trạng thái; gửi bàn giao không tự đánh dấu hoàn thành.
            </p>
          </div>
        )}

        {error && <p role="alert" className="inline-error">{error} <button type="button" className="text-link" onClick={() => void refresh()}>Tải lại</button></p>}
        {loading ? <ListSkeleton rows={3} /> : !currentShift ? (
          <AsyncStatePanel state="empty" title="Chỗ này vẫn còn trống nè!" description="Hôm nay quán chưa có ca nào được xếp cho bạn lúc này để tạo bàn giao nhé." />
        ) : !nextShifts.length ? (
          <AsyncStatePanel state="empty" title="Chỗ này vẫn còn trống nè!" description="Quản lý cần xếp lịch cho ca tiếp theo trước khi bạn gửi bàn giao nhé." />
        ) : (
          <form onSubmit={submit}>
            <div className="form-grid">
              <div className="field full">
                <span style={{ fontSize: 12, fontWeight: 600, color: "#7b6f70", display: "block", marginBottom: 6 }}>
                  Mẫu ghi chú nhanh (chạm để điền):
                </span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {QUICK_HANDOVER_TEMPLATES.map((tpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="button-secondary button-compact"
                      style={{ minHeight: 36, fontSize: 12, padding: "6px 10px", textAlign: "left" }}
                      onClick={() => setSummary((prev) => (prev.trim() ? `${prev.trim()}\n${tpl}` : tpl))}
                    >
                      + {tpl.slice(0, 34)}…
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <label htmlFor="handover-summary">Tóm tắt bàn giao <span aria-hidden="true">*</span></label>
                  <small style={{ fontSize: 11.5, fontWeight: 600, color: summaryLength >= 10 ? "#2e7d32" : "#7b6f70" }}>
                    {summaryLength}/10 ký tự tối thiểu
                  </small>
                </div>
                <textarea id="handover-summary" minLength={10} maxLength={2000} required value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Nhập tình trạng quầy, nguyên liệu cần chuẩn bị, thiết bị hoặc việc còn dở..." aria-describedby="handover-summary-help" />
                <small id="handover-summary-help">Nêu việc còn lại, nguyên liệu, thiết bị và lưu ý cho ca sau.</small>
              </div>
              <div className="field full">
                <label htmlFor="handover-receiver">Người / ca nhận <span aria-hidden="true">*</span></label>
                <select id="handover-receiver" required value={nextShiftId} onChange={(event) => setNextShiftId(event.target.value)}>
                  {nextShifts.map((shift) => (
                    <option value={shift.id} key={shift.id}>{shift.employee_name} · {shift.role_label} · {formatDateTime(shift.starts_at)}</option>
                  ))}
                </select>
              </div>
              <div className="field full" style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
                <input id="manager-attention" type="checkbox" checked={managerAttention} onChange={(event) => setManagerAttention(event.target.checked)} style={{ width: 20, height: 20 }} />
                <label htmlFor="manager-attention" style={{ margin: 0, cursor: "pointer" }}>Cần quản lý chú ý / xử lý</label>
              </div>
            </div>
            <div className="form-actions">
              <button className="button button-compact" type="submit" disabled={saving || summaryLength < 10} style={{ minHeight: 44 }}>
                {saving ? "Đang lưu…" : "Gửi bàn giao"}
              </button>
            </div>
          </form>
        )}
      </section>

      <aside className="card">
        <ViewHeader title="Bàn giao gần đây" subtitle={loading || error ? "Chưa xác nhận số bản ghi" : `${handovers.length} bản ghi đã lưu`} />
        {!loading && pendingForMe.length > 0 && (
          <p role="status" className="attention-card" style={{ marginBottom: 12 }}>Có bàn giao gửi cho bạn đang chờ nhận. Hãy đọc và xác nhận trước khi chấm vào ca.</p>
        )}
        <div className="list">
          {loading ? <ListSkeleton rows={3} /> : error && handovers.length === 0 ? <AsyncStatePanel compact state="error" title="Không thể tải bàn giao gần đây" description={error} actionLabel="Thử lại" onAction={() => void refresh()} /> : !handovers.length ? <AsyncStatePanel compact state="empty" title="Chỗ này vẫn còn trống nè!" description="Sổ bàn giao sẽ lưu lại lời dặn dò đầu tiên ngay sau khi ca trước gửi nhé." /> : null}
          {!loading && sortedHandovers.map((handover) => (
            <div className="list-row" key={handover.id} style={{ flexWrap: "wrap" }}>
              <span className="person-copy"><strong>{handover.author_name}</strong><small>{formatDateTime(handover.created_at)}{handover.receiver_name ? ` · gửi ${handover.receiver_name}` : ""}</small></span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                {handover.acknowledged_at ? <span className="badge success">Đã nhận ca</span> : handover.can_acknowledge ? (
                  <button type="button" className="button button-compact" disabled={acknowledgingId !== null} style={{ minHeight: 44 }} onClick={() => void acknowledge(handover.id)}>
                    {acknowledgingId === handover.id ? "Đang xác nhận…" : "Xác nhận nhận ca"}
                  </button>
                ) : <span className="badge neutral">Chờ người nhận</span>}
                <span className={`badge ${handover.manager_attention ? "warning" : "neutral"}`}>{handover.manager_attention ? "Cần quản lý chú ý" : "Bàn giao"}</span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", width: "100%", margin: "8px 0", fontSize: 13 }}>{handover.summary}</p>
            </div>
          ))}
        </div>
        {saved && <div className="toast" role="status"><CheckCircle2 size={17} aria-hidden="true" /> Bàn giao đã được lưu.</div>}
      </aside>
    </div>
  );
}
