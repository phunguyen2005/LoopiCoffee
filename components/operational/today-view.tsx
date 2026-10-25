"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Clock3, UserRound } from "lucide-react";
import { LoopySticker } from "../loopy-sticker";
import { ApiState, ViewHeader, formatShiftRange, formatTime, readJson } from "./shared";

export function EmployeeTodayView() {
  const [data, setData] = useState<{
    shift: { starts_at: string; ends_at: string; role_label: string; is_shift_lead: number } | null;
    attendance: { opened_at: string | null; closed_at: string | null; status: string; missing_checkout?: number } | null;
    checklist: { total: number; done: number };
    handover: { id: string; created_at: string } | null;
    incomingHandover: { id: string; summary: string; manager_attention: number; created_at: string; author_name: string } | null;
    monthStats?: { completedSessionCount: number; approvedWorkedMinutes: number };
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
          <ViewHeader title="Đang tải ca hôm nay…" subtitle="LoopyCafe đang cập nhật lịch, chấm công và công việc của bạn" />
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
  const isMissingCheckout = Boolean(data.attendance?.missing_checkout);
  const isAttendanceApproved = data.attendance?.status === "completed" && !isMissingCheckout;
  const hasHandover = Boolean(data.handover?.id);
  const needsHandoverAcknowledgement = Boolean(data.incomingHandover?.id) && !hasCheckedIn;
  const checklistNotApplicable = checklistCount === 0;
  const checklistComplete = checklistCount > 0 && checklistDone >= checklistCount;
  const checklistAllowsNextStep = checklistNotApplicable || checklistComplete;
  const checklistStepComplete = hasCheckedIn && checklistComplete;
  const checklistProgress = checklistCount > 0 ? Math.min(100, (checklistDone / checklistCount) * 100) : 0;
  const handoverGateComplete = !needsHandoverAcknowledgement;
  const completedSteps = [handoverGateComplete, hasCheckedIn, checklistStepComplete, hasHandover, isAttendanceApproved].filter(Boolean).length;
  const primaryAction = !hasShift
    ? { href: "/app/schedule", label: "Xem lịch của tôi", icon: CalendarDays }
    : hasCheckedOut
    ? { href: "/app/schedule", label: "Xem lịch ca tiếp theo", icon: CalendarDays }
    : needsHandoverAcknowledgement
    ? { href: "/app/handovers", label: "Nhận bàn giao trước khi vào ca", icon: UserRound }
    : !hasCheckedIn
    ? { href: "/app/attendance", label: "Chấm công vào ca", icon: Clock3 }
    : !checklistAllowsNextStep
    ? { href: "/app/checklists", label: "Tiếp tục checklist", icon: Check }
    : !hasHandover
    ? { href: "/app/handovers", label: "Chuẩn bị bàn giao ca", icon: UserRound }
    : { href: "/app/attendance", label: "Chấm công ra ca", icon: Clock3 };
  const PrimaryIcon = primaryAction.icon;

  const monthMinutes = data.monthStats?.approvedWorkedMinutes ?? 0;
  const monthHours = Math.floor(monthMinutes / 60);
  const monthRemMins = monthMinutes % 60;
  const monthSessions = data.monthStats?.completedSessionCount ?? 0;

  return (
    <div className="stack employee-today-view" style={{ gap: 16 }}>
      {/* Hero Shift Summary Card */}
      <section className="today-summary-card">
        <div className="today-summary-content">
          <div className="today-summary-heading">
            <span className={`today-live-status ${hasCheckedIn && !hasCheckedOut ? "is-live" : ""}`}>
              <span aria-hidden="true" />
              {isMissingCheckout ? "Quên check-out · chờ duyệt" : hasCheckedOut ? (isAttendanceApproved ? "Ca đã được ghi nhận ✨" : "Chờ quản lý duyệt") : hasCheckedIn ? "Đang trong ca làm ☕" : hasShift ? "Sắp đến ca làm" : "Hôm nay nghỉ ngơi 🌸"}
            </span>
            <span className="today-store-label">Cửa hàng LoopyCafe</span>
          </div>
          <span className="today-kicker">Ca làm việc của bạn</span>
          <h2>{hasShift ? formatShiftRange(data.shift!.starts_at, data.shift!.ends_at) : "Một ngày thật nhẹ nhàng"}</h2>
          <p>
            {hasShift
              ? `${data.shift!.role_label}${data.shift!.is_shift_lead ? " · Trưởng ca trực" : ""}`
              : "Hôm nay quán chưa có ca nào được xếp cho bạn nè, thong thả nghỉ ngơi nạp năng lượng nhé 🌸"}
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

          {hasShift && !hasCheckedOut ? (
            <Link href={primaryAction.href} className="button today-primary-action">
              <PrimaryIcon size={18} /> {primaryAction.label}
            </Link>
          ) : (
            <Link
              href={primaryAction.href}
              className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-[#ffe1e7] hover:text-white transition-colors"
            >
              <PrimaryIcon size={15} />
              <span>{primaryAction.label}</span>
              <span aria-hidden="true">›</span>
            </Link>
          )}
        </div>
        <div className="today-summary-mascot" aria-hidden="true">
          <LoopySticker mood={hasCheckedOut ? "celebrate" : hasShift ? "working" : "shy"} size={138} />
        </div>
      </section>

      {/* Urgent Next-Step Banner when Handover Ack or Missing Checkout requires attention */}
      {needsHandoverAcknowledgement && (
        <section
          className="attention-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            borderLeft: "4px solid #d97706",
            background: "#fffbeb",
            borderColor: "#fde68a",
          }}
        >
          <div style={{ flex: "1 1 200px" }}>
            <h4 style={{ margin: 0, color: "#92400e", fontSize: "0.9rem" }}>
              Cần nhận bàn giao từ {data.incomingHandover!.author_name}
            </h4>
            <p style={{ margin: "4px 0 0", color: "#b45309", fontSize: "0.8rem" }}>
              Đọc lời dặn dò ca trước và xác nhận trước khi check-in vào ca nhé.
            </p>
          </div>
          <Link href="/app/handovers" className="button button-compact" style={{ minHeight: 44 }}>
            Đọc & nhận ca ngay
          </Link>
        </section>
      )}

      {/* Shift workflow follows the server handover gate and attendance approval states. */}
      {hasShift ? (
        <section className="card today-flow-card">
          <div className="section-row today-flow-heading">
            <ViewHeader title="Tiến trình ca làm" subtitle="Chạm vào bước đang mở để thực hiện ngay" />
            <span className="badge info">{completedSteps === 5 ? "5/5 Đã hoàn tất ✨" : `${completedSteps}/5 ${hasCheckedIn ? "Đang thực hiện" : "Chuẩn bị vào ca"}`}</span>
          </div>
          <div className="today-task-flow">
            <Link href="/app/handovers" className={`today-task-step ${handoverGateComplete ? "complete" : "current"}`}>
              <span className="today-step-marker">{handoverGateComplete ? <Check size={16} /> : "1"}</span>
              <span>
                <small>1. Nhận bàn giao từ ca trước</small>
                <strong>{needsHandoverAcknowledgement ? `Từ ${data.incomingHandover!.author_name}` : "Không có bàn giao đang chờ"}</strong>
                <em className={`step-badge ${handoverGateComplete ? "success" : "warning"}`}>{handoverGateComplete ? "Sẵn sàng" : "Cần xác nhận"}</em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>

            <Link href="/app/attendance" className={`today-task-step ${hasCheckedIn ? "complete" : handoverGateComplete ? "current" : "locked"}`}>
              <span className="today-step-marker">{hasCheckedIn ? <Check size={16} /> : "2"}</span>
              <span>
                <small>2. Check-in vào ca</small>
                <strong>{hasCheckedIn ? formatTime(data.attendance!.opened_at!) : "Chưa check-in vào ca"}</strong>
                <em className={`step-badge ${hasCheckedIn ? "success" : handoverGateComplete ? "warning" : "neutral"}`}>{hasCheckedIn ? "Đã ghi nhận" : handoverGateComplete ? "Bắt đầu ngay" : "Nhận bàn giao trước"}</em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>

            <Link href="/app/checklists" className={`today-task-step ${checklistStepComplete ? "complete" : hasCheckedIn ? "current" : "locked"}`}>
              <span className="today-step-marker">{checklistStepComplete ? <Check size={16} /> : "3"}</span>
              <span>
                <small>3. Việc cần làm trong ca</small>
                <strong>{checklistNotApplicable ? "Không có việc được giao" : `${checklistDone}/${checklistCount} công việc đã xong`}</strong>
                <em className={`step-badge ${checklistStepComplete ? "success" : hasCheckedIn ? "warning" : "neutral"}`}>
                  {checklistStepComplete ? "Hoàn thành" : checklistNotApplicable ? "Chưa có checklist" : hasCheckedIn ? "Đang thực hiện" : "Chưa đến bước"}
                </em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>

            <Link href="/app/handovers" className={`today-task-step ${hasHandover ? "complete" : hasCheckedIn && checklistAllowsNextStep ? "current" : "locked"}`}>
              <span className="today-step-marker">{hasHandover ? <Check size={16} /> : "4"}</span>
              <span>
                <small>4. Ghi chú & Bàn giao ca</small>
                <strong>{hasHandover ? `Đã gửi lúc ${formatTime(data.handover!.created_at)}` : "Ghi chú & tài sản ca"}</strong>
                <em className={`step-badge ${hasHandover ? "success" : hasCheckedIn && checklistAllowsNextStep ? "warning" : "neutral"}`}>
                  {hasHandover ? "Đã bàn giao" : hasCheckedIn && checklistAllowsNextStep ? "Sẵn sàng bàn giao" : "Chưa bắt đầu"}
                </em>
              </span>
              <span className="today-step-arrow">›</span>
            </Link>

            <Link href="/app/attendance" className={`today-task-step ${isAttendanceApproved ? "complete" : hasCheckedOut || hasHandover ? "current" : "locked"}`}>
              <span className="today-step-marker">{isAttendanceApproved ? <Check size={16} /> : "5"}</span>
              <span>
                <small>5. Check-out ra ca</small>
                <strong>{isMissingCheckout ? "Hệ thống đã đóng · chưa tính công" : hasCheckedOut ? formatTime(data.attendance!.closed_at!) : `Dự kiến ${formatTime(data.shift!.ends_at)}`}</strong>
                <em className={`step-badge ${isAttendanceApproved ? "success" : hasCheckedOut || hasHandover ? "warning" : "locked"}`}>
                  {isAttendanceApproved ? "Đã ghi nhận" : isMissingCheckout ? "Cần gửi điều chỉnh" : hasCheckedOut ? "Chờ duyệt" : hasHandover ? "Sẵn sàng ra ca" : hasCheckedIn ? "Hoàn tất các bước trước" : "Chưa đến bước"}
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
            <Link href="/app/schedule" className="button-secondary" style={{ minHeight: 44 }}><CalendarDays size={16} /> Xem lịch làm việc</Link>
            <Link href="/app/requests" className="button-secondary" style={{ minHeight: 44 }}><UserRound size={16} /> Gửi yêu cầu</Link>
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

      {/* Upcoming Shifts Section */}
      {data.upcomingShifts && data.upcomingShifts.length > 0 && (
        <section className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <ViewHeader
              title="Ca làm việc sắp tới"
              subtitle="Lịch phân công tiếp theo của bạn trong tuần"
            />
            <Link href="/app/schedule" className="text-link inline-flex items-center min-h-[44px] px-2">
              Toàn bộ lịch ›
            </Link>
          </div>
          <div className="divide-y divide-[#f5efec] border border-[#eee3df] rounded-2xl bg-[#fffaf4]/60 overflow-hidden">
            {data.upcomingShifts.map((upcoming) => {
              const startDate = new Date(upcoming.starts_at);
              const dateStr = new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" }).format(startDate);
              return (
                <div
                  key={upcoming.id}
                  className="flex items-center justify-between flex-wrap gap-2 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold min-w-[64px] text-[#6f2939]">{dateStr}</span>
                    <span className="text-xs sm:text-sm font-semibold text-[#332a2b]">
                      {formatShiftRange(upcoming.starts_at, upcoming.ends_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="badge neutral">{upcoming.role_label}</span>
                    {Boolean(upcoming.is_shift_lead) && (
                      <span className="badge warning">Trưởng ca</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Personal Working Hours & Month Performance Card */}
      <section className="card">
        <div className="card-header" style={{ marginBottom: 12 }}>
          <ViewHeader
            title="Thống kê công tháng này"
            subtitle="Dữ liệu đối soát tự động từ các lần chấm công đã xác thực"
          />
          <Link href="/app/attendance" className="text-link inline-flex items-center min-h-[44px] px-2">
            Lịch sử chấm công ›
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#fffaf4] border border-[#eee3df] min-w-0">
            <span className="text-[11px] leading-tight text-[#7b6f70] font-medium block truncate">Giờ đã được duyệt</span>
            <strong className="text-sm sm:text-base font-extrabold text-[#6f2939] block mt-1 tabular-nums whitespace-nowrap">
              {monthHours}h{monthRemMins > 0 ? ` ${monthRemMins}p` : ""}
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#fffaf4] border border-[#eee3df] min-w-0">
            <span className="text-[11px] leading-tight text-[#7b6f70] font-medium block truncate">Ca đã được duyệt</span>
            <strong className="text-sm sm:text-base font-extrabold text-[#332a2b] block mt-1 tabular-nums whitespace-nowrap">
              {monthSessions} ca
            </strong>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#fffaf4] border border-[#eee3df] min-w-0">
            <span className="text-[11px] leading-tight text-[#7b6f70] font-medium block truncate">Checklist hôm nay</span>
            <strong
              className={`text-sm sm:text-base font-extrabold block mt-1 tabular-nums whitespace-nowrap ${
                checklistComplete ? "text-[#2d6a4f]" : "text-[#332a2b]"
              }`}
            >
              {checklistCount > 0 ? `${checklistDone}/${checklistCount}` : "—"}
            </strong>
          </div>
        </div>
      </section>

      {/* Quick Staff Actions for Exceptions & Help */}
      <section className="today-secondary-actions grid grid-cols-2 gap-3">
        <Link
          href="/app/requests"
          className="button-secondary justify-center text-center text-xs sm:text-sm min-h-[44px]"
        >
          Xin nghỉ / Đổi ca
        </Link>
        <Link
          href="/app/issues"
          className="button-secondary justify-center text-center text-xs sm:text-sm min-h-[44px]"
        >
          Báo cáo sự cố quán
        </Link>
      </section>
    </div>
  );
}
