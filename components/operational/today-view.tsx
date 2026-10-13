"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Clock3, UserRound } from "lucide-react";
import { LoopySticker } from "../loopy-sticker";
import { ApiState, ViewHeader, formatTime, readJson } from "./shared";

export function EmployeeTodayView() {
  const [data, setData] = useState<{
    shift: { starts_at: string; ends_at: string; role_label: string; is_shift_lead: number } | null;
    attendance: { opened_at: string | null; closed_at: string | null; status: string } | null;
    checklist: { total: number; done: number };
    handover: { id: string; created_at: string } | null;
    monthStats?: { sessionCount: number; workedMinutes: number };
    upcomingShifts?: Array<{ id: string; starts_at: string; ends_at: string; role_label: string; is_shift_lead: number }>;
  } | null>(null);
  const [state, setState] = useState<ApiState>("loading");

  const loadToday = useCallback((showLoading = true) => {
    if (showLoading) setState("loading");
    fetch("/api/today", { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(async (response) => {
        const payload = await readJson<NonNullable<typeof data> & { error?: string }>(response);
        if (!response.ok) throw new Error(payload.error ?? "Không thể tải thông tin ca hôm nay.");
        setData(payload);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadToday(false), 0);
    const refreshOnFocus = () => loadToday(false);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [loadToday]);

  if (state === "loading") {
    return (
      <div className="stack employee-today-view">
        <section className="card" role="status" aria-live="polite">
          <ViewHeader title="Đang tải ca hôm nay…" subtitle="LoopiCafe đang cập nhật lịch, chấm công và công việc của bạn" />
        </section>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className="stack employee-today-view">
        <section className="card" role="alert">
          <ViewHeader title="Chưa tải được ca hôm nay" subtitle="Kết nối có thể đang gián đoạn. Dữ liệu cũ sẽ không được dùng thay thế." />
          <button type="button" className="button button-compact" style={{ marginTop: 16 }} onClick={() => loadToday()}>
            Thử tải lại
          </button>
        </section>
      </div>
    );
  }

  const hasShift = Boolean(data.shift);
  const checklistCount = data.checklist?.total ?? 0;
  const checklistDone = data.checklist?.done ?? 0;
  const hasCheckedIn = Boolean(data.attendance?.opened_at);
  const hasCheckedOut = Boolean(data.attendance?.closed_at);
  const hasHandover = Boolean(data.handover?.id);
  const checklistNotApplicable = checklistCount === 0;
  const checklistComplete = checklistNotApplicable || checklistDone >= checklistCount;
  const checklistStepComplete = hasCheckedIn && checklistComplete;
  const checklistProgress = checklistCount > 0 ? Math.min(100, (checklistDone / checklistCount) * 100) : 0;
  const completedSteps = [hasCheckedIn, checklistStepComplete, hasHandover, hasCheckedOut].filter(Boolean).length;
  const primaryAction = !hasShift
    ? { href: "/app/schedule", label: "Xem lịch của tôi", icon: CalendarDays }
    : hasCheckedOut
    ? { href: "/app/schedule", label: "Xem lịch ca tiếp theo", icon: CalendarDays }
    : !hasCheckedIn
    ? { href: "/app/attendance", label: "Chấm công vào ca", icon: Clock3 }
    : !checklistComplete
    ? { href: "/app/checklists", label: "Tiếp tục checklist", icon: Check }
    : !hasHandover
    ? { href: "/app/handovers", label: "Chuẩn bị bàn giao ca", icon: UserRound }
    : { href: "/app/attendance", label: "Chấm công ra ca", icon: Clock3 };
  const PrimaryIcon = primaryAction.icon;

  const monthMinutes = data.monthStats?.workedMinutes ?? 0;
  const monthHours = Math.floor(monthMinutes / 60);
  const monthRemMins = monthMinutes % 60;
  const monthSessions = data.monthStats?.sessionCount ?? 0;

  return (
    <div className="stack employee-today-view has-sticky-primary" style={{ gap: 20 }}>
      {/* Hero Shift Summary Card */}
      <section className="today-summary-card">
        <div className="today-summary-content">
          <div className="today-summary-heading">
            <span className={`today-live-status ${hasCheckedIn && !hasCheckedOut ? "is-live" : ""}`}>
              <span aria-hidden="true" />
              {hasCheckedOut ? "Đã hoàn tất ca" : hasCheckedIn ? "Đang trong ca làm" : hasShift ? "Sắp đến ca làm" : "Hôm nay nghỉ"}
            </span>
            <span className="today-store-label">Cửa hàng LoopiCafe</span>
          </div>
          <span className="today-kicker">Ca làm việc của bạn</span>
          <h2>{hasShift ? `${formatTime(data.shift!.starts_at)} — ${formatTime(data.shift!.ends_at)}` : "Một ngày thật nhẹ nhàng"}</h2>
          <p>
            {hasShift
              ? `${data.shift!.role_label}${data.shift!.is_shift_lead ? " · Trưởng ca trực" : ""}`
              : "Bạn không có ca trực hôm nay. Hãy xem lịch làm việc để biết ca tiếp theo."}
          </p>

          <div className="today-summary-metrics">
            <div>
              <span>Vào ca</span>
              <strong>{hasCheckedIn ? formatTime(data.attendance!.opened_at!) : "Chưa chấm"}</strong>
            </div>
            <div>
              <span>Checklist</span>
              <strong>{checklistNotApplicable ? "Không có" : `${checklistDone}/${checklistCount}`}</strong>
            </div>
            <div>
              <span>Bàn giao</span>
              <strong>{hasHandover ? "Đã gửi" : "Chưa xong"}</strong>
            </div>
            <div>
              <span>Ra ca</span>
              <strong>{hasCheckedOut ? formatTime(data.attendance!.closed_at!) : "Chưa chấm"}</strong>
            </div>
          </div>

          <Link href={primaryAction.href} className="button today-primary-action">
            <PrimaryIcon size={18} /> {primaryAction.label}
          </Link>
        </div>
        <div className="today-summary-mascot" aria-hidden="true">
          <LoopySticker mood={hasCheckedOut ? "celebrate" : hasShift ? "working" : "shy"} size={138} />
        </div>
      </section>

      {/* Personal Working Hours & Month Performance Card */}
      <section className="card" style={{ padding: "18px 20px" }}>
        <div className="section-row" style={{ marginBottom: 14, justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Thống kê công tháng này</h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
              Dữ liệu đối soát tự động từ các lần chấm công đã xác thực
            </p>
          </div>
          <Link href="/app/attendance" className="button-link" style={{ fontSize: "0.85rem" }}>
            Lịch sử chấm công ›
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div style={{ padding: "12px 14px", background: "var(--surface-subtle, rgba(0,0,0,0.03))", borderRadius: 12 }}>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", display: "block" }}>Tổng giờ tích lũy</span>
            <strong style={{ fontSize: "1.3rem", color: "var(--primary)" }}>{monthHours}h {monthRemMins > 0 ? `${monthRemMins}p` : ""}</strong>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", marginTop: 2 }}>Trong tháng hiện tại</span>
          </div>
          <div style={{ padding: "12px 14px", background: "var(--surface-subtle, rgba(0,0,0,0.03))", borderRadius: 12 }}>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", display: "block" }}>Số ca hoàn tất</span>
            <strong style={{ fontSize: "1.3rem" }}>{monthSessions} ca</strong>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", marginTop: 2 }}>Đã được ghi nhận</span>
          </div>
          <div style={{ padding: "12px 14px", background: "var(--surface-subtle, rgba(0,0,0,0.03))", borderRadius: 12 }}>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", display: "block" }}>Tiến độ checklist ca</span>
            <strong style={{ fontSize: "1.3rem", color: checklistComplete ? "#15803d" : "inherit" }}>
              {checklistCount > 0 ? `${checklistDone}/${checklistCount}` : "100%"}
            </strong>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", marginTop: 2 }}>Nhiệm vụ chuẩn ca</span>
          </div>
        </div>
      </section>

      {/* 4-Step Shift Operational Progress */}
      {hasShift ? (
        <section className="card today-flow-card">
          <div className="section-row today-flow-heading">
            <ViewHeader title="Tiến trình ca làm" subtitle="Chạm vào từng bước để chuyển nhanh tới việc cần làm" />
            <span className="badge info">{completedSteps === 4 ? "4/4 Hoàn tất" : `${completedSteps}/4 ${completedSteps === 0 ? "Chưa vào ca" : "Đang thực hiện"}`}</span>
          </div>
          <div className="today-task-flow">
            <Link href="/app/attendance" className={`today-task-step ${hasCheckedIn ? "complete" : "current"}`}>
              <span className="today-step-marker">{hasCheckedIn ? <Check size={16} /> : "1"}</span>
              <span>
                <small>1. Chấm vào ca</small>
                <strong>{hasCheckedIn ? formatTime(data.attendance!.opened_at!) : "Chưa chấm vào ca"}</strong>
                <em className={`step-badge ${hasCheckedIn ? "success" : "warning"}`}>{hasCheckedIn ? "✅ Hoàn thành" : "🟡 Bắt đầu ngay"}</em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>

            <Link href="/app/checklists" className={`today-task-step ${checklistStepComplete ? "complete" : hasCheckedIn ? "current" : "locked"}`}>
              <span className="today-step-marker">{checklistStepComplete ? <Check size={16} /> : "2"}</span>
              <span>
                <small>2. Checklist mở ca</small>
                <strong>{checklistNotApplicable ? "Không có việc được giao" : `${checklistDone}/${checklistCount} công việc đã xong`}</strong>
                <em className={`step-badge ${checklistStepComplete ? "success" : hasCheckedIn ? "warning" : "neutral"}`}>
                  {checklistStepComplete ? (checklistNotApplicable ? "✅ Không áp dụng" : "✅ Hoàn thành") : hasCheckedIn ? "🟡 Đang thực hiện" : "🔒 Chưa đến bước"}
                </em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>

            <Link href="/app/handovers" className={`today-task-step ${hasHandover ? "complete" : checklistStepComplete ? "current" : "locked"}`}>
              <span className="today-step-marker">{hasHandover ? <Check size={16} /> : "3"}</span>
              <span>
                <small>3. Bàn giao ca</small>
                <strong>{hasHandover ? `Đã gửi lúc ${formatTime(data.handover!.created_at)}` : "Ghi chú & tài sản ca"}</strong>
                <em className={`step-badge ${hasHandover ? "success" : checklistStepComplete ? "warning" : "neutral"}`}>
                  {hasHandover ? "✅ Đã bàn giao" : checklistStepComplete ? "🟡 Sẵn sàng bàn giao" : "⚪ Chưa bắt đầu"}
                </em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>

            <Link href="/app/attendance" className={`today-task-step ${hasCheckedOut ? "complete" : checklistStepComplete && hasHandover ? "current" : "locked"}`}>
              <span className="today-step-marker">{hasCheckedOut ? <Check size={16} /> : "4"}</span>
              <span>
                <small>4. Chấm ra ca</small>
                <strong>{hasCheckedOut ? formatTime(data.attendance!.closed_at!) : `Dự kiến ${formatTime(data.shift!.ends_at)}`}</strong>
                <em className={`step-badge ${hasCheckedOut ? "success" : checklistStepComplete && hasHandover ? "warning" : "locked"}`}>
                  {hasCheckedOut ? "✅ Hoàn thành" : checklistStepComplete && hasHandover ? "🟡 Sẵn sàng ra ca" : hasCheckedIn ? "🔒 Hoàn tất các bước trước" : "🔒 Chưa đến bước"}
                </em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>
          </div>
        </section>
      ) : (
        <section className="card today-empty-actions">
          <ViewHeader title="Chuẩn bị cho ca tiếp theo" subtitle="Lịch làm và yêu cầu của bạn luôn ở đây" />
          <div>
            <Link href="/app/schedule" className="button-secondary"><CalendarDays size={16} /> Xem lịch làm việc</Link>
            <Link href="/app/requests" className="button-secondary"><UserRound size={16} /> Gửi yêu cầu</Link>
          </div>
        </section>
      )}

      {/* Upcoming Shifts Section */}
      {data.upcomingShifts && data.upcomingShifts.length > 0 && (
        <section className="card" style={{ padding: "18px 20px" }}>
          <div className="section-row" style={{ marginBottom: 12, justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>Ca làm việc sắp tới</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)" }}>
                Lịch phân công tiếp theo của bạn trong tuần
              </p>
            </div>
            <Link href="/app/schedule" className="button-link" style={{ fontSize: "0.85rem" }}>
              Toàn bộ lịch ›
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.upcomingShifts.map((upcoming) => {
              const startDate = new Date(upcoming.starts_at);
              const dateStr = new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" }).format(startDate);
              return (
                <div
                  key={upcoming.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--surface-subtle, rgba(0,0,0,0.02))",
                    borderRadius: 10,
                    border: "1px solid var(--border-subtle, rgba(0,0,0,0.06))",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, minWidth: 70, color: "var(--foreground)" }}>{dateStr}</span>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {formatTime(upcoming.starts_at)} — {formatTime(upcoming.ends_at)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="badge neutral" style={{ fontSize: "0.75rem" }}>{upcoming.role_label}</span>
                    {Boolean(upcoming.is_shift_lead) && (
                      <span className="badge warning" style={{ fontSize: "0.72rem" }}>Trưởng ca</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Checklist quick preview bar */}
      <section className="today-checklist-strip">
        <div className="today-checklist-copy">
          <span className="mini-icon pink"><Check size={17} /></span>
          <div><small>Công việc trong ca</small><strong>{checklistCount > 0 ? `${checklistDone} trên ${checklistCount} việc đã xong` : "Chưa có checklist hôm nay"}</strong></div>
        </div>
        <div className="progress"><span style={{ width: `${checklistProgress}%` }} /></div>
        <Link href="/app/checklists">Mở checklist <span>›</span></Link>
      </section>

      {/* Quick Staff Actions for Exceptions & Help */}
      <section className="today-secondary-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Link
          href="/app/requests"
          className="button-secondary"
          style={{ justifyContent: "center", textAlign: "center", fontSize: "0.85rem", padding: "10px 12px" }}
        >
          Xin nghỉ / Đổi ca
        </Link>
        <Link
          href="/app/issues"
          className="button-secondary"
          style={{ justifyContent: "center", textAlign: "center", fontSize: "0.85rem", padding: "10px 12px" }}
        >
          Báo cáo sự cố quán
        </Link>
      </section>

      <Link href={primaryAction.href} className="button mobile-sticky-primary">
        <PrimaryIcon size={18} /> {primaryAction.label}
      </Link>
    </div>
  );
}
