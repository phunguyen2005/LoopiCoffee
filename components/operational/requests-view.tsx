"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { AsyncStatePanel, ListSkeleton, ViewHeader, initials, readJson, formatDateVN, formatTime } from "./shared";

type RequestRow = { id: string; employee_email?: string; employee_name: string; type: string; title: string; reason: string; status: string; created_at: string; shift_id?: string | null; starts_at: string | null; ends_at: string | null; correction_action?: "check_in" | "check_out" | null; correction_effective_time?: string | null };
type OwnShift = { id: string; employee_email: string; starts_at: string; ends_at: string; status: string; approved_leave_request_id: string | null };
type CorrectionEvent = { id: string; event_id: string | null; action: "check_in" | "check_out"; recorded_at: string; effective_at: string | null; session_id: string; revision: number };

export function PersistentRequestsView({
  approvalScope = "none",
  canReviewLeave,
  canReviewCorrection,
  canApplySwap,
}: {
  approvalScope?: "none" | "swap_only" | "all";
  canReviewLeave?: boolean;
  canReviewCorrection?: boolean;
  canApplySwap?: boolean;
}) {
  const effectiveLeave = canReviewLeave ?? (approvalScope === "all");
  const effectiveCorrection = canReviewCorrection ?? (approvalScope === "all");
  const effectiveSwap = canApplySwap ?? (approvalScope === "all" || approvalScope === "swap_only");
  const canApprove = effectiveLeave || effectiveCorrection || effectiveSwap;
  const canReviewItem = (itemType: string) => {
    if (itemType === "leave") return effectiveLeave;
    if (itemType === "correction") return effectiveCorrection;
    if (itemType === "swap") return effectiveSwap;
    return false;
  };
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [shifts, setShifts] = useState<OwnShift[]>([]);
  const [teamShifts, setTeamShifts] = useState<OwnShift[]>([]);
  const [swapTargets, setSwapTargets] = useState<Record<string, string>>({});
  const [correctionEvents, setCorrectionEvents] = useState<CorrectionEvent[]>([]);
  const [actorEmail, setActorEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("leave");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [correctionEventId, setCorrectionEventId] = useState("");
  const [adjustedTime, setAdjustedTime] = useState("");
  const [autoTitle, setAutoTitle] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "resolved">("all");
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [confirmApplySwapId, setConfirmApplySwapId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const key = useRef("");

  const refresh = useCallback(async () => {
    setError("");
    const [payload, schedule] = await Promise.all([
      fetch("/api/requests", { cache: "no-store" }).then(readJson<{ requests: RequestRow[]; correctionEvents: CorrectionEvent[]; actorEmail: string }>),
      fetch("/api/shifts", { cache: "no-store" }).then(readJson<{ shifts: OwnShift[] }>),
    ]);
    setRequests(payload?.requests ?? []);
    const email = payload?.actorEmail ?? "";
    setActorEmail(email);
    setCorrectionEvents(payload?.correctionEvents ?? []);
    const visibleShifts = schedule?.shifts ?? [];
    setTeamShifts(visibleShifts);
    setShifts(visibleShifts.filter((shift) => shift.employee_email.toLowerCase() === email.toLowerCase() && shift.status === "published" && !shift.approved_leave_request_id));
  }, []);

  const retry = useCallback(async () => {
    setLoading(true);
    try { await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải yêu cầu."); }
    finally { setLoading(false); }
  }, [refresh]);

  useEffect(() => {
    const timer = setTimeout(() => { void retry(); }, 0);
    return () => clearTimeout(timer);
  }, [retry]);

  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => {});
      }
    }
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => {});
      }
    }, 30_000);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.clearInterval(interval);
    };
  }, [refresh]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!key.current) key.current = crypto.randomUUID();
      const selectedCorrection = correctionEvents.find((item) => item.id === correctionEventId);
      await readJson(await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        type,
        title,
        reason,
        shiftId: type === "leave" || type === "swap" ? shiftId : undefined,
        correctionEventId: type === "correction" ? selectedCorrection?.event_id ?? undefined : undefined,
        correctionSessionId: type === "correction" ? selectedCorrection?.session_id : undefined,
        correctionAction: type === "correction" ? selectedCorrection?.action : undefined,
        adjustedTime: type === "correction" && adjustedTime ? new Date(`${adjustedTime}:00+07:00`).toISOString() : undefined,
        expectedRevision: type === "correction" ? selectedCorrection?.revision : undefined,
        idempotencyKey: key.current,
      }) }));
      key.current = ""; setShowForm(false); setTitle(""); setAutoTitle(""); setReason(""); setShiftId(""); setCorrectionEventId(""); setAdjustedTime(""); setNotice("Đã gửi yêu cầu thành công rồi nhé! ✨"); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể gửi yêu cầu."); }
    finally { setBusy(false); }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setConfirmRejectId(null);
    try {
      const result = await readJson<{ coverageWarning?: string; guidance?: string }>(await fetch("/api/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision }) }));
      setNotice(result.guidance || result.coverageWarning || (decision === "approved" ? "Đơn nghỉ của bạn được duyệt rồi! ✨" : "Đã từ chối yêu cầu."));
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xử lý yêu cầu."); }
    finally { setBusy(false); }
  }

  async function withdraw(id: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice(""); setConfirmWithdrawId(null);
    try {
      await readJson(await fetch("/api/requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "withdraw", requestId: id, id }),
      }));
      setNotice("Đã rút yêu cầu thành công rồi nhé! ✨");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể rút yêu cầu.");
    } finally {
      setBusy(false);
    }
  }

  async function applyApprovedSwap(item: RequestRow) {
    const targetShiftId = swapTargets[item.id];
    if (busy || !item.shift_id || !targetShiftId) return;
    setBusy(true); setError(""); setNotice(""); setConfirmApplySwapId(null);
    try {
      await readJson(await fetch("/api/requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply_swap", id: item.id, requestId: item.id, shift1Id: item.shift_id, shift2Id: targetShiftId }),
      }));
      setNotice("Đã áp dụng đổi ca thành công! Lương sẽ theo người nhận ca sau khi chấm công được duyệt. ✨");
      setSwapTargets((current) => ({ ...current, [item.id]: "" }));
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể áp dụng đổi ca."); }
    finally { setBusy(false); }
  }

  const pendingCount = requests.filter((item) => item.status === "pending").length;
  const resolvedCount = requests.length - pendingCount;

  const sortedRequests = [...requests]
    .filter((item) => {
      if (statusFilter === "pending") return item.status === "pending";
      if (statusFilter === "resolved") return item.status !== "pending";
      return true;
    })
    .sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const typeLabel = (itemType: string) =>
    itemType === "leave" ? "Xin nghỉ ca" : itemType === "swap" ? "Đổi ca" : "Sửa chấm công";

  return (
    <div className="page-grid">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
          <ViewHeader
            title="Đơn từ & Yêu cầu"
            subtitle={loading || error ? "Chưa xác nhận số yêu cầu chờ duyệt" : `${pendingCount} yêu cầu đang chờ duyệt`}
          />
          <button
            type="button"
            className="button button-compact"
            style={{ minHeight: 44 }}
            disabled={busy}
            onClick={() => setShowForm((value) => !value)}
          >
            <Plus size={15} /> {showForm ? "Đóng biểu mẫu" : "Tạo yêu cầu"}
          </button>
        </div>

        {notice && (
          <p role="status" className="operation-message" style={{ fontSize: "0.82rem", marginBottom: 14 }}>
            {notice}
          </p>
        )}

        {showForm && (
          <form className="attention-card operation-form" onSubmit={create} style={{ marginBottom: 18 }}>
            <div className="field">
              <label htmlFor="request-type">Loại yêu cầu *</label>
              <select
                id="request-type"
                disabled={busy}
                value={type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setType(nextType);
                  if (nextType === "swap" && (!title || title === autoTitle)) {
                    const suggested = "Đề nghị đổi ca làm việc";
                    setTitle(suggested);
                    setAutoTitle(suggested);
                  }
                  key.current = "";
                }}
              >
                <option value="leave">Nghỉ một ca</option>
                <option value="swap">Đề nghị đổi ca</option>
                <option value="correction">Đề nghị sửa chấm công</option>
              </select>
            </div>

            {(type === "leave" || type === "swap") && (
              <div className="field">
                <label htmlFor="request-shift">{type === "leave" ? "Ca xin nghỉ" : "Ca muốn đổi"} *</label>
                <select
                  id="request-shift"
                  disabled={busy}
                  required
                  value={shiftId}
                  onChange={(event) => {
                    const nextShiftId = event.target.value;
                    setShiftId(nextShiftId);
                    const picked = shifts.find((s) => s.id === nextShiftId);
                    if (picked && (!title || title === autoTitle)) {
                      const suggested = `${type === "leave" ? "Xin nghỉ" : "Đề nghị đổi"} ca ${formatDateVN(new Date(picked.starts_at))} (${formatTime(picked.starts_at)}–${formatTime(picked.ends_at)})`;
                      setTitle(suggested);
                      setAutoTitle(suggested);
                    }
                    key.current = "";
                  }}
                >
                  <option value="">{type === "leave" ? "Chọn ca xin nghỉ" : "Chọn ca muốn đổi"}</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {formatDateVN(new Date(shift.starts_at))} · {formatTime(shift.starts_at)}–{formatTime(shift.ends_at)}
                    </option>
                  ))}
                </select>
                <small>{type === "leave" ? "Hiển thị ca từ tuần trước đến 31 ngày tới." : "Chọn ca nguồn; quản lý sẽ chọn ca đối ứng khi áp dụng đổi ca."}</small>
              </div>
            )}

            {type === "correction" && (
              <>
                <div className="field">
                  <label htmlFor="correction-event">Sự kiện cần sửa *</label>
                  <select
                    id="correction-event"
                    disabled={busy}
                    required
                    value={correctionEventId}
                    onChange={(event) => {
                      const selected = correctionEvents.find((item) => item.id === event.target.value);
                      setCorrectionEventId(event.target.value);
                      if (selected) {
                        const date = new Date(selected.effective_at ?? selected.recorded_at);
                        setAdjustedTime(new Date(date.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 16));
                        if (!title || title === autoTitle) {
                          const actionText = selected.event_id ? (selected.action === "check_in" ? "giờ vào ca" : "giờ ra ca") : "giờ ra ca còn thiếu";
                          const suggested = `Đề nghị điều chỉnh ${actionText} ngày ${formatDateVN(new Date(selected.recorded_at))}`;
                          setTitle(suggested);
                          setAutoTitle(suggested);
                        }
                      }
                      key.current = "";
                    }}
                  >
                    <option value="">Chọn lần chấm công</option>
                    {correctionEvents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.event_id ? (item.action === "check_in" ? "Chấm vào" : "Chấm ra") : "Bổ sung giờ chấm ra còn thiếu"} · {formatDateVN(new Date(item.recorded_at))} {formatTime(item.recorded_at)}
                      </option>
                    ))}
                  </select>
                  <small>Giờ ghi nhận gốc luôn được giữ nguyên trong lịch sử.</small>
                </div>
                <div className="field">
                  <label htmlFor="correction-time">Giờ thực tế đề nghị *</label>
                  <input
                    id="correction-time"
                    type="datetime-local"
                    disabled={busy || !correctionEventId}
                    required
                    value={adjustedTime}
                    onChange={(event) => { setAdjustedTime(event.target.value); key.current = ""; }}
                  />
                </div>
              </>
            )}

            <div className="field full">
              <label htmlFor="request-title">Tiêu đề tóm tắt *</label>
              <input
                id="request-title"
                disabled={busy}
                maxLength={180}
                placeholder="Tự động điền khi chọn ca hoặc nhập ngắn gọn..."
                value={title}
                onChange={(event) => { setTitle(event.target.value); key.current = ""; }}
                required
              />
            </div>

            <div className="field full">
              <label htmlFor="request-reason">Lý do chi tiết * (ít nhất 5 ký tự)</label>
              <textarea
                id="request-reason"
                disabled={busy}
                minLength={5}
                maxLength={1000}
                placeholder={
                  type === "swap"
                    ? "Ghi rõ ca hiện tại và người/ca muốn đổi..."
                    : "Nêu rõ lý do để quản lý có đủ thông tin phê duyệt..."
                }
                value={reason}
                onChange={(event) => { setReason(event.target.value); key.current = ""; }}
                required
              />
            </div>

            <div className="form-actions">
              <button className="button button-compact" style={{ minHeight: 44 }} disabled={busy} type="submit">
                {busy ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </div>
          </form>
        )}

        {!loading && !error && requests.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }} role="group" aria-label="Bộ lọc trạng thái yêu cầu">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={statusFilter === "all" ? "button button-compact" : "button-secondary button-compact"}
              style={{ minHeight: 40, padding: "0 13px", fontSize: "0.78rem" }}
            >
              Tất cả ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("pending")}
              className={statusFilter === "pending" ? "button button-compact" : "button-secondary button-compact"}
              style={{ minHeight: 40, padding: "0 13px", fontSize: "0.78rem" }}
            >
              Chờ duyệt ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("resolved")}
              className={statusFilter === "resolved" ? "button button-compact" : "button-secondary button-compact"}
              style={{ minHeight: 40, padding: "0 13px", fontSize: "0.78rem" }}
            >
              Đã xử lý ({resolvedCount})
            </button>
          </div>
        )}

        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <AsyncStatePanel state="error" title="Không thể tải yêu cầu" description={error} actionLabel="Thử lại" onAction={() => void retry()} />
        ) : !requests.length ? (
          <AsyncStatePanel
            state="empty"
            title="Chỗ này vẫn còn trống nè!"
            description={canApprove ? "Chưa có đơn nghỉ, đổi ca hay sửa công nào đang chờ duyệt nè." : "Bạn chưa gửi yêu cầu nào. Khi bạn gửi, danh sách sẽ xuất hiện tại đây để theo dõi nhé."}
          />
        ) : sortedRequests.length === 0 ? (
          <AsyncStatePanel
            compact
            state="empty"
            title="Không có yêu cầu khớp bộ lọc nè"
            description="Thử chuyển sang bộ lọc khác để xem danh sách nhé."
            actionLabel="Xem tất cả"
            onAction={() => setStatusFilter("all")}
          />
        ) : null}

        <div className="list">
          {!loading && !error && sortedRequests.map((item) => {
            const isPending = item.status === "pending";
            const canDecide = isPending && canReviewItem(item.type) && item.employee_email?.toLowerCase() !== actorEmail.toLowerCase();
            const isOwnPending = isPending && Boolean(actorEmail) && item.employee_email?.toLowerCase() === actorEmail.toLowerCase();
            return (
              <div
                className="list-row"
                key={item.id}
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 10,
                  padding: "14px",
                  marginBottom: 10,
                  borderRadius: 16,
                  border: isPending ? "1px solid #f2d0d6" : "1px solid var(--line)",
                  background: isPending ? "#fffafa" : "white",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div className="person" style={{ alignItems: "flex-start", flex: "1 1 220px" }}>
                    <span className="avatar" style={{ flexShrink: 0 }}>{initials(item.employee_name)}</span>
                    <span className="person-copy" style={{ whiteSpace: "normal" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                        <span className="badge neutral" style={{ padding: "3px 8px", fontSize: "0.7rem" }}>
                          {typeLabel(item.type)}
                        </span>
                        <small style={{ margin: 0, fontSize: "0.75rem" }}>
                          {formatDateVN(new Date(item.created_at))}
                        </small>
                      </span>
                      <strong style={{ whiteSpace: "normal", fontSize: "0.9rem", lineHeight: 1.4 }}>
                        {item.title}
                      </strong>
                      <small style={{ whiteSpace: "normal", fontSize: "0.8rem", color: "var(--ink)", marginTop: 4, lineHeight: 1.45 }}>
                        <strong>{item.employee_name}:</strong> {item.reason}
                      </small>
                      {item.starts_at && (
                        <small style={{ whiteSpace: "normal", marginTop: 4, fontWeight: 600, color: "var(--burgundy)" }}>
                          Ca nghỉ: {formatDateVN(new Date(item.starts_at))} · {formatTime(item.starts_at)}–{formatTime(item.ends_at!)}
                        </small>
                      )}
                      {item.correction_effective_time && (
                        <small style={{ whiteSpace: "normal", marginTop: 4, fontWeight: 600, color: "var(--burgundy)" }}>
                          Đề nghị {item.correction_action === "check_in" ? "giờ vào" : "giờ ra"}: {formatDateVN(new Date(item.correction_effective_time))} {formatTime(item.correction_effective_time)}
                        </small>
                      )}
                      {(item.status === "approved_pending_apply" || item.status === "approved") && item.type === "swap" && (
                        <small style={{ whiteSpace: "normal", color: "var(--status-warning, #b45309)", fontWeight: 600, marginTop: 4 }}>
                          ⚠️ Đã duyệt — cần chọn ca đối ứng và áp dụng trước khi chốt lương.
                        </small>
                      )}
                      {item.status === "applied" && item.type === "correction" && (
                        <small style={{ whiteSpace: "normal", color: "var(--status-success, #047857)", fontWeight: 600, marginTop: 4 }}>
                          ✓ Đã áp dụng điều chỉnh; giờ ghi nhận gốc không thay đổi.
                        </small>
                      )}
                    </span>
                  </div>

                  <span
                    className={`badge ${
                      item.status === "applied" || (item.status === "approved" && item.type === "leave")
                        ? "success"
                        : item.status === "approved" || item.status === "approved_pending_apply"
                        ? "info"
                        : item.status === "rejected"
                        ? "danger"
                        : "warning"
                    }`}
                  >
                    {item.status === "applied"
                      ? "Đã duyệt & áp dụng"
                      : item.status === "approved_pending_apply"
                      ? "Đã duyệt · Chờ áp dụng"
                      : item.status === "approved"
                      ? item.type === "leave"
                        ? "Đã duyệt (Đã cập nhật ca)"
                        : "Duyệt đề nghị (Chờ xếp lịch)"
                      : item.status === "rejected"
                      ? "Đã từ chối"
                      : "Chờ duyệt"}
                  </span>
                </div>

                {(item.status === "approved_pending_apply" || item.status === "approved") && item.type === "swap" && effectiveSwap && item.shift_id && (
                  <div className="row-actions" style={{ paddingTop: 8, borderTop: "1px dashed #efe4e0", gap: 10, flexWrap: "wrap" }}>
                    <label htmlFor={`swap-target-${item.id}`} style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      Ca đối ứng
                    </label>
                    <select
                      id={`swap-target-${item.id}`}
                      disabled={busy}
                      value={swapTargets[item.id] ?? ""}
                      onChange={(event) => setSwapTargets((current) => ({ ...current, [item.id]: event.target.value }))}
                      style={{ minHeight: 44, flex: "1 1 260px" }}
                    >
                      <option value="">Chọn ca của nhân viên khác</option>
                      {teamShifts
                        .filter((shift) => shift.status === "published" && !shift.approved_leave_request_id && shift.id !== item.shift_id && shift.employee_email.toLowerCase() !== item.employee_email?.toLowerCase())
                        .map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.employee_email} · {formatDateVN(new Date(shift.starts_at))} · {formatTime(shift.starts_at)}–{formatTime(shift.ends_at)}
                          </option>
                        ))}
                    </select>
                    {confirmApplySwapId === item.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--burgundy)", fontWeight: 600, marginRight: "auto" }}>
                          Xác nhận áp dụng đổi ca trực này vào lịch?
                        </span>
                        <button
                          type="button"
                          className="button-secondary button-compact"
                          style={{ minHeight: 44 }}
                          disabled={busy}
                          onClick={() => setConfirmApplySwapId(null)}
                        >
                          Huỷ
                        </button>
                        <button
                          type="button"
                          className="button button-compact"
                          style={{ minHeight: 44 }}
                          disabled={busy}
                          onClick={() => void applyApprovedSwap(item)}
                        >
                          Xác nhận áp dụng
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="button button-compact"
                        style={{ minHeight: 44 }}
                        disabled={busy || !swapTargets[item.id]}
                        onClick={() => setConfirmApplySwapId(item.id)}
                      >
                        Áp dụng đổi ca
                      </button>
                    )}
                  </div>
                )}

                {canDecide && (
                  <div
                    className="row-actions"
                    style={{
                      paddingTop: 8,
                      borderTop: "1px dashed #efe4e0",
                      justifyContent: "flex-end",
                      gap: 10,
                    }}
                  >
                    {confirmRejectId === item.id ? (
                      <>
                        <span style={{ fontSize: "0.78rem", color: "#991b1b", fontWeight: 600, marginRight: "auto" }}>
                          Xác nhận từ chối yêu cầu này?
                        </span>
                        <button
                          type="button"
                          className="button-secondary button-compact"
                          style={{ minHeight: 44 }}
                          disabled={busy}
                          onClick={() => setConfirmRejectId(null)}
                        >
                          Huỷ
                        </button>
                        <button
                          type="button"
                          className="button button-compact"
                          style={{ minHeight: 44, background: "#dc2626" }}
                          disabled={busy}
                          onClick={() => void decide(item.id, "rejected")}
                        >
                          Xác nhận từ chối
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="button-secondary button-compact danger-text"
                          style={{ minHeight: 44, borderColor: "#f3c7ce" }}
                          disabled={busy}
                          onClick={() => setConfirmRejectId(item.id)}
                        >
                          Từ chối
                        </button>
                        <button
                          type="button"
                          className="button button-compact"
                          style={{ minHeight: 44 }}
                          disabled={busy}
                          onClick={() => void decide(item.id, "approved")}
                        >
                          Duyệt yêu cầu
                        </button>
                      </>
                    )}
                  </div>
                )}

                {isOwnPending && (
                  <div
                    className="row-actions"
                    style={{
                      paddingTop: 8,
                      borderTop: "1px dashed #efe4e0",
                      justifyContent: "flex-end",
                      gap: 10,
                    }}
                  >
                    {confirmWithdrawId === item.id ? (
                      <>
                        <span style={{ fontSize: "0.78rem", color: "#dc2626", fontWeight: 600, marginRight: "auto" }}>
                          Bạn chắc chắn muốn rút yêu cầu này?
                        </span>
                        <button
                          type="button"
                          className="button-secondary button-compact"
                          style={{ minHeight: 44 }}
                          disabled={busy}
                          onClick={() => setConfirmWithdrawId(null)}
                        >
                          Huỷ
                        </button>
                        <button
                          type="button"
                          className="button button-compact"
                          style={{ minHeight: 44, background: "#dc2626" }}
                          disabled={busy}
                          onClick={() => void withdraw(item.id)}
                        >
                          Xác nhận rút đơn
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="button-secondary button-compact danger-text"
                        style={{ minHeight: 44, borderColor: "#f3c7ce" }}
                        disabled={busy}
                        onClick={() => setConfirmWithdrawId(item.id)}
                      >
                        Rút đơn
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <aside className="card">
        <ViewHeader title="Nguyên tắc" subtitle="Giữ nguyên dữ liệu gốc" />
        <p className="supporting-copy">
          Nghỉ một ca được duyệt sẽ tự động cập nhật ca nghỉ và không tính vắng. Quản lý chủ động bố trí người thay. Yêu cầu sửa công phải chọn sự kiện và giờ đề nghị cụ thể; khi duyệt, hệ thống ghi correction append-only, tăng revision và giữ nguyên giờ ghi nhận gốc.
        </p>
      </aside>
    </div>
  );
}
