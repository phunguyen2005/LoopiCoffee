"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  FileBarChart,
  PackageOpen,
  Plus,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  MetricCard,
  AsyncStatePanel,
  MetricSkeleton,
  ViewHeader,
  formatDateTime,
  formatTime,
  formatWorkedMinutes,
  initials,
  readJson,
} from "./shared";

type ActiveStaff = {
  id: string;
  opened_at: string;
  employee_email: string;
  employee_name: string;
  job_title: string;
};

type ShiftItem = {
  id: string;
  employee_name: string;
  employee_email: string;
  starts_at: string;
  ends_at: string;
  role_label: string;
  job_title?: string;
};

type AttendanceSessionItem = {
  id: string;
  shift_id: string | null;
  employee_email: string;
  opened_at: string;
  closed_at: string | null;
};

type UnattendedShiftItem = ShiftItem & {
  alertType: "late" | "absent";
  lateMinutes: number;
  badgeLabel: string;
};

type DashboardData = {
  metrics: {
    activeStaff: number;
    pendingExceptions: number;
    checklistDone: number;
    checklistTotal: number;
    openIncidents: number;
    pendingRequests?: number;
    monthWorkedMinutes?: number;
  };
  activeStaffList?: ActiveStaff[];
  todayShifts?: ShiftItem[];
  todaySessions?: AttendanceSessionItem[];
  nextShifts: ShiftItem[];
  latestHandover: { summary: string; created_at: string; author_name: string } | null;
  serverTime?: string;
};

export function OperationsDashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [error, setError] = useState(false);

  const loadDashboard = useCallback(() => {
    fetch("/api/dashboard", { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(readJson<NonNullable<typeof data>>)
      .then((payload) => {
        setData(payload);
        setError(false);
        setCurrentTimestamp(payload.serverTime ? Date.parse(payload.serverTime) : Date.now());
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    loadDashboard();
    window.addEventListener("focus", loadDashboard);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadDashboard();
    }, 30_000);
    return () => {
      window.removeEventListener("focus", loadDashboard);
      window.clearInterval(interval);
    };
  }, [loadDashboard]);

  const metrics = data?.metrics ?? {
    activeStaff: 0,
    pendingExceptions: 0,
    checklistDone: 0,
    checklistTotal: 0,
    openIncidents: 0,
    pendingRequests: 0,
    monthWorkedMinutes: 0,
  };

  const activeStaffList = data?.activeStaffList ?? [];
  const nextShifts = data?.nextShifts ?? [];
  const pendingRequests = metrics.pendingRequests ?? 0;
  const totalActionItems = metrics.pendingExceptions + pendingRequests + metrics.openIncidents;

  // Detect late or missing check-in with shiftId correlation & level distinction
  const lateOrMissingStaff = useMemo<UnattendedShiftItem[]>(() => {
    if (!currentTimestamp) return [];
    const shifts = data?.todayShifts ?? [];
    const sessions = data?.todaySessions ?? [];

    const result: UnattendedShiftItem[] = [];

    shifts.forEach((shift) => {
      const startTime = new Date(shift.starts_at).getTime();
      const endTime = new Date(shift.ends_at).getTime();

      // Correlate with attendance sessions
      const hasAttendance = sessions.some((sess) => {
        if (sess.shift_id && sess.shift_id === shift.id) return true;
        if (sess.employee_email.toLowerCase() === shift.employee_email.toLowerCase()) {
          const sessOpen = new Date(sess.opened_at).getTime();
          if (sessOpen >= startTime - 30 * 60 * 1000 && sessOpen <= endTime) return true;
        }
        return false;
      });

      if (!hasAttendance) {
        if (currentTimestamp >= startTime + 5 * 60 * 1000 && currentTimestamp < endTime) {
          const lateMinutes = Math.max(1, Math.floor((currentTimestamp - startTime) / 60000));
          result.push({
            ...shift,
            alertType: "late",
            lateMinutes,
            badgeLabel: `Trễ ${lateMinutes} phút`,
          });
        } else if (currentTimestamp >= endTime) {
          result.push({
            ...shift,
            alertType: "absent",
            lateMinutes: Math.floor((endTime - startTime) / 60000),
            badgeLabel: "Vắng mặt",
          });
        }
      }
    });

    return result;
  }, [data?.todayShifts, data?.todaySessions, currentTimestamp]);

  const isStoreOpen = metrics.activeStaff > 0;
  const isShiftUnattended = !isStoreOpen && lateOrMissingStaff.some((s) => s.alertType === "late");
  const todayShifts = data?.todayShifts ?? [];
  const upcomingTodayShifts = todayShifts.filter((shift) => new Date(shift.starts_at).getTime() > currentTimestamp);

  if (!data) {
    return (
      <div className="stack">
        {error ? (
          <AsyncStatePanel
            state="error"
            title="Không thể tải bảng điều hành"
            description="Số liệu vận hành chưa được xác nhận. Hãy kiểm tra kết nối rồi thử lại."
            actionLabel="Thử lại"
            onAction={loadDashboard}
          />
        ) : (
          <>
            <AsyncStatePanel
              state="loading"
              title="Đang tải bảng điều hành"
              description="LoopyCafe đang xác nhận ca làm, chấm công và các việc cần xử lý."
            />
            <section className="metric-grid" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <MetricSkeleton key={index} label="chỉ số vận hành" />
              ))}
            </section>
          </>
        )}
      </div>
    );
  }

  const checklistRemaining = Math.max(0, metrics.checklistTotal - metrics.checklistDone);
  const checklistContextLabel =
    metrics.checklistTotal === 0
      ? "Chưa thiết lập mẫu việc đầu ca"
      : checklistRemaining === 0
      ? `Đã xong đủ ${metrics.checklistDone}/${metrics.checklistTotal} việc mở ca`
      : `Còn ${checklistRemaining}/${metrics.checklistTotal} việc mở ca chưa hoàn tất`;

  return (
    <div className="stack owner-dashboard">
      {error && (
        <AsyncStatePanel
          compact
          state="error"
          title="Chưa thể cập nhật dữ liệu mới"
          description="Các số liệu bên dưới là lần tải gần nhất, có thể đã cũ."
          actionLabel="Thử lại"
          onAction={loadDashboard}
        />
      )}

      {/* 1. COMPACT STORE STATUS PULSE (NO DUPLICATE METRIC CHIPS) */}
      <section
        className={`hero-status-card owner-hero-compact relative overflow-hidden ${
          isShiftUnattended ? "shift-alert" : ""
        }`}
      >
        <div className="hero-status-copy">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
            {isShiftUnattended ? (
              <span
                className="badge danger"
                style={{
                  fontSize: 11.5,
                  padding: "4px 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#fee2e2",
                  color: "#991b1b",
                  border: "1px solid #fca5a5",
                  fontWeight: 700,
                }}
              >
                <span className="pulse-dot" style={{ background: "#dc2626" }} />
                Quá giờ mở ca ({lateOrMissingStaff.length} ca chưa check-in)
              </span>
            ) : (
              <span
                className={`badge ${isStoreOpen ? "success" : "neutral"}`}
                style={{
                  fontSize: 11.5,
                  padding: "4px 10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isStoreOpen ? (
                  <span className="pulse-dot" />
                ) : (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#999" }} />
                )}
                {isStoreOpen
                  ? `Đang mở ca · ${metrics.activeStaff} nhân sự trực`
                  : todayShifts.length === 0
                  ? "Hôm nay chưa xếp lịch ca"
                  : upcomingTodayShifts.length > 0
                  ? `Ca kế tiếp lúc ${formatTime(upcomingTodayShifts[0].starts_at)}`
                  : "Ngoài khung giờ ca"}
              </span>
            )}
            <span
              className="status-label"
              style={{
                marginBottom: 0,
                color: isShiftUnattended ? "#7b6f70" : undefined,
              }}
            >
              <CheckCircle2
                size={13}
                className={isShiftUnattended ? "text-[#a89b9d]" : undefined}
              />{" "}
              {error
                ? `Dữ liệu cũ${data?.serverTime ? ` (${formatTime(data.serverTime)})` : ""}`
                : `Đồng bộ ${data?.serverTime ? formatTime(data.serverTime) : "vừa xong"}`}
            </span>
          </div>

          <h2>
            {isShiftUnattended
              ? "Ca làm đã đến giờ nhưng chưa có nhân viên check-in"
              : totalActionItems > 0
              ? `Có ${totalActionItems} việc vận hành cần chủ quán duyệt`
              : isStoreOpen
              ? "Quầy đang vận hành ổn định, không có việc tồn đọng"
              : todayShifts.length === 0
              ? "Hôm nay chưa có ca làm việc nào được xuất bản"
              : upcomingTodayShifts.length > 0
              ? `Ca tiếp theo sẽ bắt đầu lúc ${formatTime(upcomingTodayShifts[0].starts_at)}`
              : "Các ca trong ngày đã kết thúc"}
          </h2>

          <p>
            {isShiftUnattended
              ? "Hãy kiểm tra danh sách trễ ca ngay bên dưới hoặc liên hệ nhân viên trực để đảm bảo mở quầy đúng giờ."
              : totalActionItems > 0
              ? `${metrics.pendingExceptions} ngoại lệ chấm công · ${pendingRequests} đơn từ nhân sự · ${metrics.openIncidents} sự cố quầy.`
              : isStoreOpen
              ? `${checklistContextLabel}. Mọi lượt chấm công hiện tại đều hợp lệ.`
              : todayShifts.length === 0
              ? "Hãy lập lịch và xuất bản ca để nhân viên có thể chấm công đúng giờ."
              : upcomingTodayShifts.length > 0
              ? `Nhân sự phụ trách: ${upcomingTodayShifts[0].employee_name} (${upcomingTodayShifts[0].role_label}).`
              : "Bạn có thể đối soát giờ công trong ngày hoặc chuẩn bị lịch cho ngày mai."}
          </p>
        </div>
      </section>

      {/* 2. TOP BUSINESS PRIORITY: URGENT ACTION ITEMS ("Cần xử lý ngay") */}
      {(totalActionItems > 0 || lateOrMissingStaff.length > 0) && (
        <section className="card owner-priority-inbox" aria-label="Việc cần xử lý ưu tiên">
          <div className="card-header" style={{ marginBottom: 10 }}>
            <ViewHeader
              title={`Cần xử lý ngay (${totalActionItems + lateOrMissingStaff.length})`}
              subtitle="Ưu tiên theo mức độ ảnh hưởng đến vận hành quầy và bảng lương"
            />
          </div>
          <div className="owner-priority-list">
            {lateOrMissingStaff.map((shift) => (
              <Link
                key={shift.id}
                href="/app/schedule"
                className="owner-priority-item is-danger"
                style={{ textDecoration: "none" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#fee2e2] text-[#b91c1c] flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} />
                  </span>
                  <div className="min-w-0">
                    <strong className="text-xs sm:text-sm text-[#332a2b] block font-bold truncate">
                      {shift.employee_name} · {shift.badgeLabel}
                    </strong>
                    <span className="text-xs text-[#991b1b] block">
                      Ca {formatTime(shift.starts_at)}–{formatTime(shift.ends_at)} ({shift.role_label}) chưa ghi nhận vào ca
                    </span>
                  </div>
                </div>
                <span className="owner-priority-cta danger">
                  Kiểm tra ca <ArrowRight size={13} />
                </span>
              </Link>
            ))}

            {metrics.pendingExceptions > 0 && (
              <Link
                href="/app/attendance/review"
                className="owner-priority-item"
                style={{ textDecoration: "none" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#fff2f4] text-[#d96d83] flex items-center justify-center shrink-0">
                    <AlertCircle size={16} />
                  </span>
                  <div className="min-w-0">
                    <strong className="text-xs sm:text-sm text-[#332a2b] block font-bold">
                      {metrics.pendingExceptions} ngoại lệ chấm công chờ duyệt
                    </strong>
                    <span className="text-xs text-[#7b6f70] block">
                      Đi trễ, thiếu ảnh hoặc ngoài bán kính — cần duyệt để tính giờ công
                    </span>
                  </div>
                </div>
                <span className="owner-priority-cta">
                  Duyệt ngay <ArrowRight size={13} />
                </span>
              </Link>
            )}

            {pendingRequests > 0 && (
              <Link
                href="/app/requests"
                className="owner-priority-item"
                style={{ textDecoration: "none" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#fff8e7] text-[#a86e23] flex items-center justify-center shrink-0">
                    <UserRound size={16} />
                  </span>
                  <div className="min-w-0">
                    <strong className="text-xs sm:text-sm text-[#332a2b] block font-bold">
                      {pendingRequests} đơn xin nghỉ / đổi ca chờ phản hồi
                    </strong>
                    <span className="text-xs text-[#7b6f70] block">
                      Phê duyệt sớm để chủ động bố trí người thay ca
                    </span>
                  </div>
                </div>
                <span className="owner-priority-cta">
                  Xem đơn <ArrowRight size={13} />
                </span>
              </Link>
            )}

            {metrics.openIncidents > 0 && (
              <Link
                href="/app/issues"
                className="owner-priority-item"
                style={{ textDecoration: "none" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#fff5f5] text-[#b91c1c] flex items-center justify-center shrink-0">
                    <PackageOpen size={16} />
                  </span>
                  <div className="min-w-0">
                    <strong className="text-xs sm:text-sm text-[#332a2b] block font-bold">
                      {metrics.openIncidents} sự cố thiết bị / nguyên liệu tại quầy
                    </strong>
                    <span className="text-xs text-[#7b6f70] block">
                      Nhân viên báo hỏng hóc hoặc thiếu hàng cần xử lý
                    </span>
                  </div>
                </div>
                <span className="owner-priority-cta">
                  Chi tiết <ArrowRight size={13} />
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* 3. 4 KPI CARDS WITH CLEAR BUSINESS CONTEXT */}
      <section className="metric-grid owner-kpi-grid" aria-label="Chỉ số vận hành chính">
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/team" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={UsersRound}
              tone="mint"
              value={`${metrics.activeStaff} người`}
              label="Đang trực tại quán"
              sublabel={
                metrics.activeStaff > 0
                  ? "Đã check-in vào ca"
                  : todayShifts.length > 0
                  ? `Hôm nay có ${todayShifts.length} ca lịch`
                  : "Hôm nay chưa xếp ca"
              }
            />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/attendance/review" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={AlertCircle}
              tone="pink"
              value={metrics.pendingExceptions > 0 ? `${metrics.pendingExceptions} ca` : "0 ca"}
              label="Ngoại lệ chấm công"
              sublabel={
                metrics.pendingExceptions > 0
                  ? "Chờ duyệt để tính lương"
                  : "Tất cả ca đã hợp lệ"
              }
            />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/checklists" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={ShieldCheck}
              tone="amber"
              value={
                metrics.checklistTotal > 0
                  ? `${metrics.checklistDone}/${metrics.checklistTotal} việc`
                  : "0 việc"
              }
              label="Checklist mở ca"
              sublabel={
                metrics.checklistTotal === 0
                  ? "Chưa giao việc đầu ca"
                  : checklistRemaining === 0
                  ? "Đã hoàn tất mở quầy"
                  : `Còn ${checklistRemaining} việc cần kiểm tra`
              }
            />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/reports/attendance" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={Clock3}
              tone="burgundy"
              value={formatWorkedMinutes(metrics.monthWorkedMinutes ?? 0)}
              label="Giờ công đã duyệt"
              sublabel={
                (metrics.monthWorkedMinutes ?? 0) > 0
                  ? "Tích lũy trong tháng này"
                  : "Chưa có ca hoàn tất tháng này"
              }
            />
          </Link>
        </motion.div>
      </section>

      {/* 4. OWNER QUICK ACTIONS TOOLBAR */}
      <section className="card owner-quick-actions-card p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#7b6f70] flex items-center gap-1.5">
            <Coffee size={14} className="text-[#d96d83]" /> Thao tác nhanh cho quản lý
          </h3>
          <span className="hidden sm:inline text-xs text-[#7b6f70]">Tối ưu tốc độ quản lý cửa hàng</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link
            href="/app/schedule"
            className="owner-quick-action-btn p-3 rounded-xl bg-[#fffaf4] hover:bg-[#fff2f4] text-[#6f2939] font-bold text-xs flex items-center gap-2 transition border border-[#eee3df]"
          >
            <span className="w-7 h-7 rounded-lg bg-[#fff2f4] text-[#d96d83] flex items-center justify-center shrink-0">
              <CalendarDays size={15} />
            </span>
            <div className="min-w-0">
              <strong className="block text-[#332a2b] leading-tight">Xếp ca làm</strong>
              <small className="text-xs text-[#7b6f70] font-normal leading-tight block truncate">Lịch tuần</small>
            </div>
          </Link>

          <Link
            href="/app/team"
            className="owner-quick-action-btn p-3 rounded-xl bg-[#fffaf4] hover:bg-[#fff2f4] text-[#6f2939] font-bold text-xs flex items-center gap-2 transition border border-[#eee3df]"
          >
            <span className="w-7 h-7 rounded-lg bg-[#f0faf5] text-[#2d6a4f] flex items-center justify-center shrink-0">
              <UserPlus size={15} />
            </span>
            <div className="min-w-0">
              <strong className="block text-[#332a2b] leading-tight">Nhân sự</strong>
              <small className="text-xs text-[#7b6f70] font-normal leading-tight block truncate">Hồ sơ & lương</small>
            </div>
          </Link>

          <Link
            href="/app/attendance/review"
            className="owner-quick-action-btn p-3 rounded-xl bg-[#fffaf4] hover:bg-[#fff2f4] text-[#6f2939] font-bold text-xs flex items-center gap-2 transition border border-[#eee3df]"
          >
            <span className="w-7 h-7 rounded-lg bg-[#fff8e7] text-[#a86e23] flex items-center justify-center shrink-0">
              <ShieldCheck size={15} />
            </span>
            <div className="min-w-0">
              <strong className="block text-[#332a2b] leading-tight">Duyệt công</strong>
              <small className="text-xs text-[#7b6f70] font-normal leading-tight block truncate">
                {metrics.pendingExceptions > 0 ? `${metrics.pendingExceptions} ngoại lệ` : "Kiểm tra giờ"}
              </small>
            </div>
          </Link>

          <Link
            href="/app/reports/attendance"
            className="owner-quick-action-btn p-3 rounded-xl bg-[#fffaf4] hover:bg-[#fff2f4] text-[#6f2939] font-bold text-xs flex items-center gap-2 transition border border-[#eee3df]"
          >
            <span className="w-7 h-7 rounded-lg bg-[#f3e4e7] text-[#6f2939] flex items-center justify-center shrink-0">
              <FileBarChart size={15} />
            </span>
            <div className="min-w-0">
              <strong className="block text-[#332a2b] leading-tight">Bảng lương</strong>
              <small className="text-xs text-[#7b6f70] font-normal leading-tight block truncate">Đối soát kỳ</small>
            </div>
          </Link>
        </div>
      </section>

      {/* 5. CONSOLIDATED LIVE ROSTER, UPCOMING SHIFTS & HANDOVER */}
      <div className="page-grid">
        <section className="card">
          <div className="card-header">
            <ViewHeader
              title="Trực quầy & Lịch ca hôm nay"
              subtitle={
                activeStaffList.length > 0
                  ? `${activeStaffList.length} nhân sự đang trực · ${nextShifts.length} ca tiếp theo`
                  : "Theo dõi nhân sự trong ca và lịch phân công sắp tới"
              }
            />
            <Link
              className="text-link inline-flex items-center gap-1 text-xs font-bold min-h-[44px] px-2 shrink-0"
              href="/app/schedule"
              aria-label="Lối tắt quản trị lịch tuần"
            >
              Lịch tuần <ArrowRight size={13} />
            </Link>
          </div>

          <div className="list">
            {activeStaffList.map((staff) => (
              <div className="list-row" key={staff.id}>
                <div className="person">
                  <span className="avatar">{initials(staff.employee_name)}</span>
                  <span className="person-copy">
                    <strong>{staff.employee_name}</strong>
                    <small>
                      {staff.job_title} · Vào ca lúc {formatTime(staff.opened_at)}
                    </small>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge success">
                    <span className="pulse-dot" style={{ display: "inline-block", marginRight: 4 }} />
                    Đang trực
                  </span>
                  <Link
                    href="/app/attendance/review"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-[#fff2f4] text-[#7b6f70] text-xs transition"
                    title="Xem chi tiết chấm công"
                    aria-label={`Xem chi tiết chấm công của ${staff.employee_name}`}
                  >
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            ))}

            {nextShifts.slice(0, 4).map((shift) => (
              <div className="list-row" key={shift.id}>
                <div className="person">
                  <span className="mini-icon mint">
                    <CalendarDays size={15} />
                  </span>
                  <span className="person-copy">
                    <strong>{shift.employee_name}</strong>
                    <small>
                      Ca kế tiếp: {formatDateTime(shift.starts_at)} — {formatTime(shift.ends_at)}
                    </small>
                  </span>
                </div>
                <span className="badge neutral">{shift.role_label}</span>
              </div>
            ))}

            {activeStaffList.length === 0 && nextShifts.length === 0 && (
              <div className="p-5 text-center rounded-2xl border border-dashed border-[#e5d5d8] bg-[#fffaf4]/70 space-y-2">
                <UserCheck size={26} className="mx-auto text-[#b0a8a6]" />
                <strong className="block text-xs sm:text-sm font-bold text-[#332a2b]">
                  Chưa có nhân viên trực hoặc ca sắp tới
                </strong>
                <p className="text-xs text-[#7b6f70] max-w-sm mx-auto">
                  Hãy phân công ca làm trong lịch tuần để nhân viên biết giờ vào ca và thực hiện chấm công tại quầy.
                </p>
                <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
                  <Link
                    href="/app/schedule"
                    className="button button-compact inline-flex items-center gap-1.5 text-xs"
                  >
                    <Plus size={14} /> Xếp lịch ca ngay
                  </Link>
                  <Link
                    href="/app/attendance/review"
                    className="button-secondary button-compact inline-flex items-center gap-1.5 text-xs"
                  >
                    Đối soát chấm công
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="card">
          <div className="card-header">
            <ViewHeader
              title="Bàn giao ca & Checklist quầy"
              subtitle={
                data?.latestHandover
                  ? `Ghi nhận bởi ${data.latestHandover.author_name} · ${formatDateTime(
                      data.latestHandover.created_at
                    )}`
                  : "Theo dõi ghi chú chuyển giao giữa các ca"
              }
            />
            <Link className="text-link inline-flex items-center min-h-[44px] px-2 shrink-0" href="/app/handovers">
              Tất cả
            </Link>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 rounded-2xl bg-[#fffaf4] border border-[#eee3df]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <strong className="text-xs font-bold text-[#332a2b]">Tiến độ công việc mở ca hôm nay</strong>
                <Link href="/app/checklists" className="text-xs font-bold text-[#6f2939] hover:underline">
                  {metrics.checklistDone}/{metrics.checklistTotal} việc hoàn tất
                </Link>
              </div>
              <p className="text-xs text-[#7b6f70] m-0">
                {checklistContextLabel}
              </p>
            </div>

            {data?.latestHandover ? (
              <p className="supporting-copy preserve-lines text-xs sm:text-sm text-[#554a4c] leading-relaxed m-0">
                {data.latestHandover.summary}
              </p>
            ) : (
              <div className="p-4 rounded-2xl border border-dashed border-[#e5d5d8] text-center space-y-1.5">
                <p className="text-xs font-semibold text-[#554a4c] m-0">
                  Chưa có ghi chú bàn giao ca mới
                </p>
                <span className="text-xs text-[#7b6f70] block">
                  Khi nhân viên hoàn tất ca và gửi ghi chú nguyên liệu/thiết bị, nội dung sẽ hiển thị tại đây.
                </span>
                <div className="pt-1">
                  <Link href="/app/handovers" className="text-link text-xs font-bold inline-flex items-center gap-1">
                    Xem sổ bàn giao ca <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
