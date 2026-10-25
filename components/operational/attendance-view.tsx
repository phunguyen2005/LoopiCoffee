"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  History,
  MapPin,
  Search,
  ShieldCheck,
  X,
  Edit3,
  Camera,
  ChevronRight,
} from "lucide-react";
import { AsyncStatePanel, ListSkeleton, MetricCard, MetricSkeleton, ViewHeader, formatDateTime, readJson } from "./shared";

type AttendanceEvent = {
  id: string;
  employeeEmail?: string;
  employeeName: string;
  action: "check_in" | "check_out" | string;
  recordedAt: string;
  originalRecordedAt: string;
  revision: number;
  verification: string[];
  photoPresent: boolean;
  reviewRequired: boolean;
  exceptionStatus: string | null;
  employeeReason: string | null;
  location: { latitude: number; longitude: number; accuracy: number; distance: number } | null;
};

type AuditLogItem = {
  id: string;
  actorEmail: string;
  action: string;
  metadata: { previousTime?: string; newTime?: string; reason?: string } | null;
  createdAt: string;
};

export function AttendanceReviewView() {
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [selectedPhotoEventId, setSelectedPhotoEventId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "exceptions" | "completed">("all");

  // Adjust Time Modal State
  const [adjustingEvent, setAdjustingEvent] = useState<AttendanceEvent | null>(null);
  const [newAdjustedTime, setNewAdjustedTime] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  // History Modal State
  const [historyEvent, setHistoryEvent] = useState<AttendanceEvent | null>(null);
  const [historyLogs, setHistoryLogs] = useState<AuditLogItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [actorEmail, setActorEmail] = useState("");
  const [isSoleOwner, setIsSoleOwner] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingEvents(true); setReviewError("");
    try {
      const payload = await readJson<{ events: typeof events; actorEmail?: string; isSoleOwner?: boolean }>(await fetch("/api/attendance/review", { cache: "no-store" }));
      setEvents(payload.events ?? []);
      setActorEmail(payload.actorEmail ?? "");
      setIsSoleOwner(Boolean(payload.isSoleOwner));
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : "Không thể tải chấm công."); }
    finally { setLoadingEvents(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function decide(eventId: string, decision: "approved" | "rejected") {
    if (reviewBusy) return;
    setReviewBusy(true); setReviewError("");
    try {
    await readJson(await fetch("/api/attendance/review", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId, decision }),
    }));
    await refresh();
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : "Không thể duyệt công."); }
    finally { setReviewBusy(false); }
  }

  async function approveAllPending() {
    if (reviewBusy) return;
    setReviewBusy(true); setReviewError("");
    try {
    const pendingEvents = (events ?? []).filter((e) =>
      e.reviewRequired &&
      e.exceptionStatus === "pending" &&
      (!actorEmail || e.employeeEmail?.toLowerCase() !== actorEmail.toLowerCase())
    );
    for (const ev of pendingEvents) {
      await readJson(await fetch("/api/attendance/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: ev.id, decision: "approved" }),
      }));
    }
    await refresh();
    } catch (cause) { setReviewError(cause instanceof Error ? cause.message : "Chưa hoàn tất duyệt công. Hãy tải lại để xem các mục đã lưu."); }
    finally { setReviewBusy(false); }
  }

  // Open adjust modal
  function openAdjustModal(event: AttendanceEvent) {
    setAdjustingEvent(event);
    // Convert ISO to format datetime-local accepts: YYYY-MM-DDTHH:mm
    const date = new Date(event.recordedAt);
    const localISOTime = new Date(date.getTime() + 7 * 60 * 60000).toISOString().slice(0, 16);
    setNewAdjustedTime(localISOTime);
    setAdjustReason("");
    setAdjustError("");
  }

  async function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingEvent) return;
    if (!adjustReason.trim()) {
      setAdjustError("Vui lòng nêu rõ lý do điều chỉnh giờ (bắt buộc kiểm toán).");
      return;
    }
    setAdjustSubmitting(true);
    setAdjustError("");
    try {
      const isoTime = new Date(`${newAdjustedTime}:00+07:00`).toISOString();
      const res = await fetch("/api/attendance/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: adjustingEvent.id,
          expectedRevision: adjustingEvent.revision,
          action: "adjust_time",
          adjustedTime: isoTime,
          reason: adjustReason.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Không thể điều chỉnh giờ.");
      }
      setAdjustingEvent(null);
      await refresh();
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setAdjustSubmitting(false);
    }
  }

  // Open history modal
  async function openHistoryModal(event: AttendanceEvent) {
    setHistoryEvent(event);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/attendance/review?historyFor=${encodeURIComponent(event.id)}`, { cache: "no-store" });
      const payload = await readJson<{ history: AuditLogItem[] }>(res);
      setHistoryLogs(payload.history ?? []);
    } catch {
      setHistoryLogs([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [confirmRejectEventId, setConfirmRejectEventId] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    return [...(events ?? [])]
      .filter((ev) => {
        const matchesSearch =
          search.trim() === "" ||
          ev.employeeName.toLowerCase().includes(search.toLowerCase()) ||
          (ev.employeeReason && ev.employeeReason.toLowerCase().includes(search.toLowerCase()));

        const isPending = ev.reviewRequired && ev.exceptionStatus === "pending";
        const hasException = ev.reviewRequired || Boolean(ev.exceptionStatus);
        const isCompleted = !ev.reviewRequired || ev.exceptionStatus === "approved";

        if (statusFilter === "pending") return matchesSearch && isPending;
        if (statusFilter === "exceptions") return matchesSearch && hasException;
        if (statusFilter === "completed") return matchesSearch && isCompleted;
        return matchesSearch;
      })
      .sort((a, b) => {
        const aPending = a.reviewRequired && a.exceptionStatus === "pending";
        const bPending = b.reviewRequired && b.exceptionStatus === "pending";
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;
        return new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime();
      });
  }, [events, search, statusFilter]);

  const pendingCount = (events ?? []).filter((e) => e.reviewRequired && e.exceptionStatus === "pending").length;

  return (
    <div className="stack" style={{ gap: 20 }}>
      {reviewError && !loadingEvents && events.length > 0 && <p role="alert">{reviewError}</p>}
      {/* Top Metric Grid */}
      <section className="metric-grid">
        {loadingEvents || reviewError ? Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} label="chỉ số chấm công" />) : <>
          <MetricCard icon={AlertCircle} tone="pink" value={String(pendingCount)} label="Cần phê duyệt" />
          <MetricCard icon={ShieldCheck} tone="mint" value={String((events ?? []).filter((e) => !e.reviewRequired || e.exceptionStatus === "approved").length)} label="Đã hoàn tất" />
          <MetricCard icon={MapPin} tone="amber" value={String((events ?? []).filter((e) => e.location).length)} label="Có tọa độ GPS" />
          <MetricCard icon={CheckCircle2} tone="burgundy" value={String((events ?? []).filter((e) => e.photoPresent).length)} label="Có ảnh máy chủ" />
        </>}
      </section>

      {/* Main Review Section */}
      <section className="card" style={{ padding: "20px 24px" }}>
        <div className="section-row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 18 }}>
          <div>
            <ViewHeader title="Bằng chứng chấm công & Đối soát" subtitle="Giữ nguyên thời gian chấm gốc; mỗi điều chỉnh đều có lý do và lịch sử" />
          </div>
          {pendingCount > 0 && (
            confirmApproveAll ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--burgundy)", fontWeight: 700 }}>
                  Duyệt toàn bộ {pendingCount} ngoại lệ?
                </span>
                <button
                  type="button"
                  className="button-secondary button-compact"
                  style={{ minHeight: 44 }}
                  disabled={reviewBusy}
                  onClick={() => setConfirmApproveAll(false)}
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  className="button button-compact"
                  style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 6 }}
                  disabled={reviewBusy}
                  onClick={() => {
                    setConfirmApproveAll(false);
                    void approveAllPending();
                  }}
                >
                  <CheckCircle2 size={15} /> Xác nhận duyệt ({pendingCount})
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button button-compact"
                disabled={reviewBusy}
                style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => setConfirmApproveAll(true)}
              >
                <CheckCircle2 size={15} /> Duyệt tất cả ({pendingCount})
              </button>
            )
          )}
        </div>

        {/* Search & Filter Toolbar */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingTop: 10, borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Tìm theo tên nhân viên, ghi chú..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                paddingLeft: 36,
                paddingRight: 12,
                height: 44,
                borderRadius: 10,
                border: "1px solid var(--border-subtle, #e2e8f0)",
                fontSize: "0.88rem",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "Tất cả" },
              { key: "pending", label: `Cần duyệt (${pendingCount})` },
              { key: "exceptions", label: "Có ngoại lệ" },
              { key: "completed", label: "Đã hoàn tất" },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`filter-chip ${statusFilter === chip.key ? "active" : ""}`}
                onClick={() => setStatusFilter(chip.key as typeof statusFilter)}
                style={{
                  minHeight: 44,
                  padding: "8px 14px",
                  borderRadius: 20,
                  fontSize: "0.82rem",
                  fontWeight: statusFilter === chip.key ? 700 : 500,
                  border: statusFilter === chip.key ? "1px solid var(--primary, #6f2939)" : "1px solid var(--border-subtle, #e2e8f0)",
                  background: statusFilter === chip.key ? "var(--primary, #6f2939)" : "transparent",
                  color: statusFilter === chip.key ? "#fff" : "inherit",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Review Cards Grid */}
        <div className="review-grid">
          {loadingEvents ? <ListSkeleton rows={5} /> : reviewError ? <AsyncStatePanel state="error" title="Không thể tải dữ liệu chấm công" description={reviewError} actionLabel="Thử lại" onAction={() => void refresh()} /> : filteredEvents.length === 0 ? (
            search.trim() || statusFilter !== "all" ? <AsyncStatePanel state="empty" title="Không có bản ghi khớp bộ lọc" description="Thử từ khóa khác hoặc xóa bộ lọc hiện tại." actionLabel="Xóa bộ lọc" onAction={() => { setSearch(""); setStatusFilter("all"); }} /> : <AsyncStatePanel state="empty" title="Chưa phát sinh chấm công" description="Bản ghi chấm vào/ra của nhân viên sẽ xuất hiện tại đây." />
          ) : (
            filteredEvents.map((event) => {
              const isPending = event.reviewRequired && event.exceptionStatus === "pending";
              const isCheckIn = event.action === "check_in";
              return (
                <article
                  className="review-card"
                  key={event.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    border: isPending ? "1.5px solid #f2c6ce" : undefined,
                    background: isPending ? "#fffafa" : undefined,
                  }}
                >
                  <div className="section-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ fontSize: "1rem" }}>{event.employeeName}</strong>
                      <small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>
                        {isCheckIn ? "Vào ca" : "Ra ca"} · {formatDateTime(event.recordedAt)}
                      </small>
                    </div>
                    <span className={`badge ${isPending ? "warning" : event.reviewRequired ? "neutral" : "success"}`}>
                      {isPending ? "Cần duyệt" : event.reviewRequired ? "Đã duyệt" : "Chuẩn"}
                    </span>
                  </div>

                  {/* Photo Stamped Image if selected */}
                  {selectedPhotoEventId === event.id && event.photoPresent && (
                    <div style={{ margin: "6px 0", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-subtle, #e2e8f0)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="review-photo"
                        src={`/api/files/${event.id}`}
                        alt={`Bằng chứng chấm công của ${event.employeeName}`}
                        style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }}
                      />
                    </div>
                  )}

                  {/* Employee reason & notes */}
                  {event.employeeReason ? (
                    <div style={{ padding: "8px 12px", background: "var(--surface-subtle, #f8fafc)", borderRadius: 8, fontSize: "0.82rem", borderLeft: "3px solid #f59e0b" }}>
                      <strong>Ghi chú:</strong> {event.employeeReason}
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>Không có ghi chú ngoại lệ.</p>
                  )}

                  {/* Location readout */}
                  {event.location && (
                    <div className="location-readout" style={{ fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 2 }}>
                      <div className="flex items-center gap-1.5 flex-wrap font-semibold text-[#332a2b]">
                        <MapPin size={13} className="shrink-0 text-[#6f2939]" />
                        <span>
                          ±{Math.round(event.location.accuracy).toLocaleString("vi-VN")} m · Cách quán{" "}
                          {Math.round(event.location.distance) >= 1000
                            ? `${(event.location.distance / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km (${Math.round(event.location.distance).toLocaleString("vi-VN")} m)`
                            : `${Math.round(event.location.distance).toLocaleString("vi-VN")} m`}
                        </span>
                      </div>
                      <small style={{ color: "var(--muted)", fontSize: "0.72rem", lineHeight: 1.35 }}>
                        Thông tin tham khảo để đối soát
                      </small>
                    </div>
                  )}

                  {/* Secondary Inspection Actions (Outline/Secondary Buttons) */}
                  <div style={{ marginTop: "auto", paddingTop: 10, paddingBottom: 2, borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {event.photoPresent && (
                      <button
                        type="button"
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#e3d5d1] bg-white hover:bg-[#fff6f7] text-[#332a2b] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition shadow-2xs"
                        onClick={() => setSelectedPhotoEventId(selectedPhotoEventId === event.id ? null : event.id)}
                      >
                        <Camera size={14} className="text-[#6f2939]" /> {selectedPhotoEventId === event.id ? "Ẩn ảnh" : "Xem ảnh"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="min-h-[44px] px-3 py-1.5 rounded-lg border border-[#e3d5d1] bg-white hover:bg-[#fff6f7] text-[#332a2b] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition shadow-2xs"
                      onClick={() => openAdjustModal(event)}
                    >
                      <Edit3 size={14} className="text-[#6f2939]" /> Điều chỉnh giờ
                    </button>

                    <button
                      type="button"
                      className="min-h-[44px] px-3 py-1.5 rounded-lg border border-[#ebe2df] bg-[#faf6f3] hover:bg-[#f2eae6] text-[#7b6f70] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                      onClick={() => openHistoryModal(event)}
                    >
                      <History size={14} /> Lịch sử
                    </button>
                  </div>

                  {/* Primary Approval Actions (Separated with >=44px touch targets) */}
                  {isPending && (
                    <div style={{ paddingTop: 8, borderTop: "1px dashed #efe4e0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                      {actorEmail && event.employeeEmail?.toLowerCase() === actorEmail.toLowerCase() ? (
                        <span
                          className="badge warning"
                          style={{
                            fontSize: "0.75rem",
                            background: isSoleOwner ? "#fffbeb" : undefined,
                            color: isSoleOwner ? "#92400e" : undefined,
                            border: isSoleOwner ? "1px solid #fde68a" : undefined,
                          }}
                        >
                          {isSoleOwner
                            ? "Chủ quán tự điều chỉnh — sự kiện sẽ được ghi nhận vào nhật ký kiểm toán mức cao"
                            : "Chờ quản lý khác duyệt độc lập"}
                        </span>
                      ) : confirmRejectEventId === event.id ? (
                        <>
                          <span style={{ fontSize: "0.78rem", color: "#991b1b", fontWeight: 600, marginRight: "auto" }}>
                            Xác nhận từ chối bản ghi này?
                          </span>
                          <button
                            type="button"
                            className="button-secondary button-compact"
                            style={{ minHeight: 44 }}
                            disabled={reviewBusy}
                            onClick={() => setConfirmRejectEventId(null)}
                          >
                            Huỷ
                          </button>
                          <button
                            type="button"
                            className="button button-compact"
                            style={{ minHeight: 44, background: "#dc2626" }}
                            disabled={reviewBusy}
                            onClick={() => {
                              setConfirmRejectEventId(null);
                              void decide(event.id, "rejected");
                            }}
                          >
                            Xác nhận từ chối
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="button-secondary button-compact"
                            style={{ minHeight: 44, color: "#b91c1c", borderColor: "#f3c7ce", flex: "1 1 110px" }}
                            onClick={() => setConfirmRejectEventId(event.id)}
                            disabled={reviewBusy}
                          >
                            Từ chối
                          </button>
                          <button
                            type="button"
                            className="button button-compact"
                            style={{ minHeight: 44, flex: "1 1 120px" }}
                            onClick={() => decide(event.id, "approved")}
                            disabled={reviewBusy}
                          >
                            Phê duyệt
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

      {/* Modal 1: Adjust Time Modal */}
      {adjustingEvent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => !adjustSubmitting && setAdjustingEvent(null)}
        >
          <div
            style={{
              background: "var(--surface, #ffffff)",
              width: "100%",
              maxWidth: 480,
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 12px 36px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleAdjustSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Edit3 size={18} style={{ color: "var(--primary)" }} />
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Điều chỉnh giờ chấm công</h3>
                </div>
                <button type="button" onClick={() => setAdjustingEvent(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: "12px 14px", background: "var(--surface-subtle, #f8fafc)", borderRadius: 10, fontSize: "0.85rem" }}>
                <div><strong>Nhân viên:</strong> {adjustingEvent.employeeName}</div>
                <div style={{ marginTop: 4 }}>
                  <strong>Thao tác:</strong> {adjustingEvent.action === "check_in" ? "Chấm vào ca" : "Chấm ra ca"}
                </div>
                <div style={{ marginTop: 4 }}>
                  <strong>Giờ ghi nhận ban đầu:</strong> {formatDateTime(adjustingEvent.recordedAt)}
                </div>
              </div>

              {isSoleOwner && adjustingEvent.employeeEmail?.toLowerCase() === actorEmail.toLowerCase() && (
                <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600 }}>
                  ⚠️ Chủ quán tự điều chỉnh — sự kiện sẽ được ghi nhận vào nhật ký kiểm toán mức cao
                </div>
              )}

              {adjustError && (
                <div style={{ padding: "10px 14px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} /> {adjustError}
                </div>
              )}

              <div className="field">
                <label htmlFor="adjusted-time">Giờ điều chỉnh mới (GMT+7) *</label>
                <input
                  id="adjusted-time"
                  type="datetime-local"
                  required
                  value={newAdjustedTime}
                  onChange={(e) => setNewAdjustedTime(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="adjust-reason">Lý do điều chỉnh (bắt buộc lưu vết kiểm toán) *</label>
                <textarea
                  id="adjust-reason"
                  required
                  rows={3}
                  placeholder="Ví dụ: Nhân viên có mặt đúng giờ nhưng camera chấm công bị lỗi kết nối, quản lý xác nhận duyệt lại giờ."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border-subtle, #cbd5e1)", fontSize: "0.88rem" }}
                />
              </div>

              <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
                ℹ️ Lưu ý: Mọi thao tác chỉnh sửa giờ đều được ghi nhận vào nhật ký kiểm toán (người sửa, thời gian, lý do) và tự động tính lại số giờ làm việc.
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                <button type="button" className="button-secondary" onClick={() => setAdjustingEvent(null)} disabled={adjustSubmitting}>
                  Hủy
                </button>
                <button type="submit" className="button" disabled={adjustSubmitting}>
                  {adjustSubmitting ? "Đang lưu…" : "Xác nhận điều chỉnh"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: View History Diff Modal */}
      {historyEvent && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setHistoryEvent(null)}
        >
          <div
            style={{
              background: "var(--surface, #ffffff)",
              width: "100%",
              maxWidth: 520,
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 12px 36px rgba(0,0,0,0.2)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <History size={18} style={{ color: "var(--primary)" }} />
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>Lịch sử chỉnh sửa bản ghi</h3>
              </div>
              <button type="button" onClick={() => setHistoryEvent(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 16, fontSize: "0.85rem", color: "var(--muted)" }}>
              Nhân viên: <strong style={{ color: "var(--foreground)" }}>{historyEvent.employeeName}</strong> • {historyEvent.action === "check_in" ? "Vào ca" : "Ra ca"} ({formatDateTime(historyEvent.recordedAt)})
            </div>

            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              {loadingHistory ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)" }}>Đang tải lịch sử kiểm toán...</div>
              ) : historyLogs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "36px 0" }}>
                  <ShieldCheck size={36} style={{ color: "#16a34a", margin: "0 auto 10px" }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Bản ghi nguyên gốc từ máy chủ</p>
                  <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                    Chưa có bất kỳ thao tác can thiệp hay sửa đổi nào.
                  </p>
                </div>
              ) : (
                historyLogs.map((log) => {
                  const meta = log.metadata ?? {};
                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: "12px 14px",
                        background: "var(--surface-subtle, #f8fafc)",
                        borderRadius: 10,
                        border: "1px solid var(--border-subtle, #e2e8f0)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <strong style={{ color: "var(--primary)" }}>{log.actorEmail}</strong>
                        <small style={{ color: "var(--muted)" }}>{formatDateTime(log.createdAt)}</small>
                      </div>

                      {meta.previousTime && meta.newTime && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0", fontFamily: "monospace", fontSize: "0.82rem" }}>
                          <span style={{ textDecoration: "line-through", color: "#dc2626" }}>{formatDateTime(meta.previousTime)}</span>
                          <ChevronRight size={14} style={{ color: "var(--muted)" }} />
                          <span style={{ fontWeight: 700, color: "#16a34a" }}>{formatDateTime(meta.newTime)}</span>
                        </div>
                      )}

                      {meta.reason && (
                        <div style={{ marginTop: 6, fontSize: "0.82rem", background: "#ffffff", padding: "6px 10px", borderRadius: 6, border: "1px solid #f1f5f9" }}>
                          <em>Lý do:</em> {meta.reason}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="button" onClick={() => setHistoryEvent(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
