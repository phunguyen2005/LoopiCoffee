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
  nextShifts: ShiftItem[];
  latestHandover: { summary: string; created_at: string; author_name: string } | null;
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
        setCurrentTimestamp(Date.now());
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    loadDashboard();
    window.addEventListener("focus", loadDashboard);
    return () => window.removeEventListener("focus", loadDashboard);
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

  // Detect late or missing check-in
  const lateOrMissingStaff = useMemo(() => {
    if (!currentTimestamp) return [];
    const shifts = data?.todayShifts ?? [];
    const activeStaff = data?.activeStaffList ?? [];
    const activeEmails = new Set(activeStaff.map((s) => s.employee_email.toLowerCase()));

    return shifts.filter((shift) => {
      const startTime = new Date(shift.starts_at).getTime();
      const endTime = new Date(shift.ends_at).getTime();
      return (
        currentTimestamp >= startTime + 5 * 60 * 1000 &&
        currentTimestamp < endTime &&
        !activeEmails.has(shift.employee_email.toLowerCase())
      );
    });
  }, [data?.todayShifts, data?.activeStaffList, currentTimestamp]);

  const isStoreOpen = metrics.activeStaff > 0;
  const isShiftUnattended = !isStoreOpen && lateOrMissingStaff.length > 0;
  const todayShifts = data?.todayShifts ?? [];
  const upcomingTodayShifts = todayShifts.filter((shift) => new Date(shift.starts_at).getTime() > currentTimestamp);

  if (!data) {
    return (
      <div className="stack">
        {error ? (
          <AsyncStatePanel state="error" title="Không thể tải bảng điều hành" description="Số liệu vận hành chưa được xác nhận. Hãy kiểm tra kết nối rồi thử lại." actionLabel="Thử lại" onAction={loadDashboard} />
        ) : (
          <>
            <AsyncStatePanel state="loading" title="Đang tải bảng điều hành" description="LoopiCafe đang xác nhận ca làm, chấm công và các việc cần xử lý." />
            <section className="metric-grid" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} label="chỉ số vận hành" />)}
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <AsyncStatePanel compact state="error" title="Chưa thể cập nhật dữ liệu mới" description="Các số liệu bên dưới là lần tải gần nhất, có thể đã cũ." actionLabel="Thử lại" onAction={loadDashboard} />}
      {/* 1. HERO OPERATIONAL PULSE */}
      <section
        className="hero-status-card relative overflow-hidden"
        style={{
          borderColor: isShiftUnattended ? "#f4a9b7" : undefined,
          background: isShiftUnattended
            ? "linear-gradient(135deg, #fff2f4 0%, #fffaf5 100%)"
            : undefined,
        }}
      >
        <div className="hero-status-copy">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 6,
            }}
          >
            <span
              className={`badge ${
                isStoreOpen ? "success" : isShiftUnattended ? "danger" : "neutral"
              }`}
              style={{
                fontSize: 11,
                padding: "6px 12px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {isStoreOpen ? (
                <span className="pulse-dot" />
              ) : isShiftUnattended ? (
                "⚠️ ĐÃ ĐẾN CA TRỰC"
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#999" }} />
              )}
              {isStoreOpen
                ? "CỬA HÀNG ĐANG MỞ CA"
                : isShiftUnattended
                ? "CHƯA CÓ NHÂN VIÊN VÀO CA"
                : todayShifts.length === 0
                ? "CHƯA CÓ CA ĐƯỢC LÊN LỊCH"
                : upcomingTodayShifts.length > 0
                ? "CA TIẾP THEO CHƯA BẮT ĐẦU"
                : "HIỆN KHÔNG TRONG CA LÀM"}
            </span>
            <span className="status-label">
              <CheckCircle2 size={14} /> {error ? "Dữ liệu lần tải gần nhất" : "Dữ liệu trực tiếp hôm nay"}
            </span>
          </div>

          <h2>
            {isShiftUnattended
              ? "Ca làm đã bắt đầu nhưng chưa ghi nhận nhân viên check-in!"
              : totalActionItems > 0
              ? `Có ${totalActionItems} việc vận hành cần bạn xử lý ngay`
              : isStoreOpen
              ? "Mọi việc tại cửa hàng đang diễn ra đúng nhịp"
              : todayShifts.length === 0
              ? "Hôm nay chưa có ca làm việc được lên lịch"
              : upcomingTodayShifts.length > 0
              ? "Ca tiếp theo chưa bắt đầu"
              : "Hiện không có ca làm việc đang diễn ra"}
          </h2>

          <p>
            {isShiftUnattended
              ? "Đã quá giờ bắt đầu ca làm nhưng chưa có lượt chấm công nào từ nhân viên trực. Hãy kiểm tra hoặc liên hệ ngay."
              : totalActionItems > 0
              ? `Bao gồm ${metrics.pendingExceptions} ngoại lệ chấm công, ${pendingRequests} yêu cầu nhân viên và ${metrics.openIncidents} sự cố.`
              : isStoreOpen
              ? "Đang có nhân sự check-in. Không có ngoại lệ, yêu cầu hoặc sự cố tồn đọng theo dữ liệu vừa tải."
              : todayShifts.length === 0
              ? "Chưa có dữ liệu ca để đánh giá tình trạng chấm công hôm nay."
              : upcomingTodayShifts.length > 0
              ? `Ca tiếp theo bắt đầu lúc ${formatTime(upcomingTodayShifts[0].starts_at)}. Hệ thống sẽ cập nhật khi nhân viên check-in.`
              : "Các ca đã lên lịch trong ngày hiện không diễn ra. Hãy xem lịch để kiểm tra chi tiết."}
          </p>

          <div className="status-metrics">
            <span>
              <strong>{metrics.activeStaff}</strong>
              <small>đang trực quầy</small>
            </span>
            <span>
              <strong className={lateOrMissingStaff.length > 0 ? "text-[#c75865]" : ""}>
                {lateOrMissingStaff.length}
              </strong>
              <small>chưa check-in</small>
            </span>
            <span>
              <strong>
                {metrics.checklistDone}/{metrics.checklistTotal}
              </strong>
              <small>mở ca xong</small>
            </span>
            <span>
              <strong className={metrics.pendingExceptions > 0 ? "text-[#c75865]" : ""}>
                {metrics.pendingExceptions}
              </strong>
              <small>ngoại lệ chờ</small>
            </span>
          </div>
        </div>

      </section>

      {/* 2. OWNER QUICK ACTIONS TOOLBAR */}
      <section className="card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#7b6f70] flex items-center gap-1.5">
            <Coffee size={14} className="text-[#d96d83]" /> Thao tác nhanh cho Quản lý
          </h3>
          <span className="text-xs text-[#7b6f70]">Tối ưu tốc độ quản lý cửa hàng</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Link
            href="/app/schedule"
            className="p-3 rounded-2xl bg-[#fff2f4] hover:bg-[#ffe1e7] text-[#6f2939] font-bold text-xs flex items-center gap-2.5 transition border border-[#ffe1e7] shadow-sm hover:shadow active:scale-98"
          >
            <span className="w-8 h-8 rounded-xl bg-white text-[#d96d83] flex items-center justify-center shrink-0 shadow-xs">
              <CalendarDays size={16} />
            </span>
            <div>
              <strong className="block text-[#332a2b]">Xếp ca làm</strong>
              <small className="text-[11px] text-[#7b6f70] font-normal">Tạo ca tuần mới</small>
            </div>
          </Link>

          <Link
            href="/app/team"
            className="p-3 rounded-2xl bg-[#f0faf5] hover:bg-[#e2f5ec] text-[#2d6a4f] font-bold text-xs flex items-center gap-2.5 transition border border-[#d8f3e5] shadow-sm hover:shadow active:scale-98"
          >
            <span className="w-8 h-8 rounded-xl bg-white text-[#40916c] flex items-center justify-center shrink-0 shadow-xs">
              <UserPlus size={16} />
            </span>
            <div>
              <strong className="block text-[#332a2b]">Thêm nhân sự</strong>
              <small className="text-[11px] text-[#7b6f70] font-normal">Mời nhân viên mới</small>
            </div>
          </Link>

          <Link
            href="/app/attendance/review"
            className="p-3 rounded-2xl bg-[#fff8e7] hover:bg-[#fff2cf] text-[#8a5d00] font-bold text-xs flex items-center gap-2.5 transition border border-[#ffe8a3] shadow-sm hover:shadow active:scale-98"
          >
            <span className="w-8 h-8 rounded-xl bg-white text-[#d48b00] flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck size={16} />
            </span>
            <div>
              <strong className="block text-[#332a2b]">Duyệt chấm công</strong>
              <small className="text-[11px] text-[#7b6f70] font-normal">
                {metrics.pendingExceptions > 0 ? `${metrics.pendingExceptions} việc chờ` : "Kiểm tra giờ"}
              </small>
            </div>
          </Link>

          <Link
            href="/app/reports/attendance"
            className="p-3 rounded-2xl bg-[#f4f3fe] hover:bg-[#eae8fd] text-[#4f46e5] font-bold text-xs flex items-center gap-2.5 transition border border-[#e0ddfc] shadow-sm hover:shadow active:scale-98"
          >
            <span className="w-8 h-8 rounded-xl bg-white text-[#6366f1] flex items-center justify-center shrink-0 shadow-xs">
              <FileBarChart size={16} />
            </span>
            <div>
              <strong className="block text-[#332a2b]">Bảng lương kỳ</strong>
              <small className="text-[11px] text-[#7b6f70] font-normal">
                {metrics.monthWorkedMinutes ? formatWorkedMinutes(metrics.monthWorkedMinutes) : "Đối soát công"}
              </small>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. METRIC SUMMARY CARDS */}
      <section className="metric-grid">
        <motion.div whileHover={{ y: -3, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/team" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={UsersRound}
              tone="mint"
              value={String(metrics.activeStaff)}
              label="Đang trực tại quán"
            />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -3, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/attendance/review" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={AlertCircle}
              tone="pink"
              value={String(metrics.pendingExceptions)}
              label="Ngoại lệ chấm công"
            />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -3, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/requests" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={UserRound}
              tone="amber"
              value={String(pendingRequests)}
              label="Yêu cầu cần duyệt"
            />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -3, scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Link href="/app/reports/attendance" style={{ textDecoration: "none" }}>
            <MetricCard
              icon={Clock3}
              tone="burgundy"
              value={formatWorkedMinutes(metrics.monthWorkedMinutes ?? 0)}
              label="Tổng giờ công tháng này"
            />
          </Link>
        </motion.div>
      </section>

      {/* 4. ACTION ITEMS INBOX (IF ANY PENDING) */}
      {totalActionItems > 0 && (
        <section className="card border-l-4 border-l-[#d96d83]" style={{ order: -1 }}>
          <div className="card-header pb-2">
            <ViewHeader
              title={`Cần xử lý ngay (${totalActionItems})`}
              subtitle="Các vấn đề ảnh hưởng trực tiếp tới vận hành cửa hàng"
            />
          </div>
          <div className="space-y-2.5">
            {metrics.pendingExceptions > 0 && (
              <div className="p-3 rounded-2xl bg-[#fff2f4] border border-[#ffe1e7] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white text-[#d96d83] flex items-center justify-center shrink-0">
                    <AlertCircle size={16} />
                  </span>
                  <div>
                    <strong className="text-xs text-[#332a2b] block font-bold">
                      {metrics.pendingExceptions} ngoại lệ chấm công chờ phê duyệt
                    </strong>
                    <span className="text-[11px] text-[#7b6f70]">
                      Nhân viên đi trễ, thiếu ảnh hoặc chấm công ngoài bán kính
                    </span>
                  </div>
                </div>
                <Link
                  href="/app/attendance/review"
                  className="px-3 py-1.5 rounded-xl bg-[#d96d83] text-white text-xs font-bold shrink-0 hover:bg-[#c75865] transition flex items-center gap-1"
                >
                  Xử lý ngay <ArrowRight size={13} />
                </Link>
              </div>
            )}

            {pendingRequests > 0 && (
              <div className="p-3 rounded-2xl bg-[#fffaf0] border border-[#fef0cd] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white text-[#d48b00] flex items-center justify-center shrink-0">
                    <UserRound size={16} />
                  </span>
                  <div>
                    <strong className="text-xs text-[#332a2b] block font-bold">
                      {pendingRequests} đơn xin nghỉ phép / đổi ca chưa duyệt
                    </strong>
                    <span className="text-[11px] text-[#7b6f70]">
                      Cần quyết định để nhân viên chủ động sắp xếp công việc
                    </span>
                  </div>
                </div>
                <Link
                  href="/app/requests"
                  className="px-3 py-1.5 rounded-xl bg-[#d48b00] text-white text-xs font-bold shrink-0 hover:bg-[#b57600] transition flex items-center gap-1"
                >
                  Xem đơn <ArrowRight size={13} />
                </Link>
              </div>
            )}

            {metrics.openIncidents > 0 && (
              <div className="p-3 rounded-2xl bg-[#fff6f6] border border-[#fedada] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white text-[#b91c1c] flex items-center justify-center shrink-0">
                    <PackageOpen size={16} />
                  </span>
                  <div>
                    <strong className="text-xs text-[#332a2b] block font-bold">
                      {metrics.openIncidents} sự cố thiết bị & nguyên liệu tại quầy
                    </strong>
                    <span className="text-[11px] text-[#7b6f70]">
                      Nhân viên báo hỏng hóc hoặc thiếu bao bì cần hỗ trợ
                    </span>
                  </div>
                </div>
                <Link
                  href="/app/issues"
                  className="px-3 py-1.5 rounded-xl bg-[#b91c1c] text-white text-xs font-bold shrink-0 hover:bg-[#991b1b] transition flex items-center gap-1"
                >
                  Chi tiết <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5. TODAY'S LIVE STAFF & ATTENDANCE STATUS */}
      <div className="page-grid">
        {/* Left: Who is currently working */}
        <section className="card">
          <div className="card-header">
            <ViewHeader
              title="Nhân sự đang trực quầy"
              subtitle={`${activeStaffList.length} nhân sự đã check-in có mặt`}
            />
            <Link className="text-link" href="/app/attendance/review">
              Duyệt công
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
                    Đang làm
                  </span>
                  <Link
                    href="/app/attendance/review"
                    className="p-1 rounded-lg hover:bg-[#fff2f4] text-[#7b6f70] text-xs transition"
                    title="Xem chi tiết chấm công"
                  >
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            ))}

            {activeStaffList.length === 0 && (
              <div className="p-6 text-center text-[#7b6f70] space-y-2">
                <UserCheck size={28} className="mx-auto text-[#b0a8a6]" />
                <p className="font-medium text-xs">Hiện tại chưa có nhân viên nào check-in vào ca.</p>
                <span className="text-[11px] text-[#9c9391] block">
                  Khi nhân viên chấm công, danh sách sẽ cập nhật tức thời tại đây.
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Right: Late or Missing Attendance / Upcoming Shifts */}
        <div className="stack">
          {/* Late / Missing Alert Section */}
          <section className="card">
            <div className="card-header">
              <ViewHeader
                title="Chưa check-in / Đi trễ"
                subtitle="Theo dõi ca làm đã đến giờ nhưng chưa có mặt"
              />
              <Link className="text-link" href="/app/schedule">
                Xem lịch
              </Link>
            </div>

            <div className="list">
              {lateOrMissingStaff.map((shift) => (
                <div className="list-row bg-[#fff2f4]/60 rounded-xl p-2.5" key={shift.id}>
                  <div className="person">
                    <span className="mini-icon pink">
                      <AlertTriangle size={15} />
                    </span>
                    <span className="person-copy">
                      <strong>{shift.employee_name}</strong>
                      <small className="text-[#c75865] font-medium">
                        Ca {formatTime(shift.starts_at)} — {formatTime(shift.ends_at)} · Chưa vào ca
                      </small>
                    </span>
                  </div>
                  <Link
                    href="/app/attendance/review"
                    className="badge danger"
                    style={{ textDecoration: "none" }}
                  >
                    Chưa vào ca
                  </Link>
                </div>
              ))}

              {lateOrMissingStaff.length === 0 && (
                <div className="p-4 text-center text-[#2d6a4f] bg-[#f0faf5] rounded-2xl border border-[#d8f3e5] text-xs">
                  <CheckCircle2 size={18} className="mx-auto mb-1 text-[#40916c]" />
                  <strong>Đúng giờ & Đầy đủ</strong>
                  <p className="text-[11px] text-[#52796f] mt-0.5">
                    Không có nhân viên nào bị trễ ca hôm nay.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Latest Handover Card */}
          <aside className="card">
            <div className="card-header">
              <ViewHeader
                title="Bàn giao ca mới nhất"
                subtitle={
                  data?.latestHandover
                    ? `${data.latestHandover.author_name} · ${formatDateTime(
                        data.latestHandover.created_at
                      )}`
                    : "Chưa có bàn giao ca"
                }
              />
              <Link className="text-link" href="/app/handovers">
                Tất cả
              </Link>
            </div>
            <p className="supporting-copy preserve-lines text-xs text-[#554a4c] leading-relaxed">
              {data?.latestHandover?.summary ??
                "Thông tin ghi chú thiết bị, nguyên liệu hoặc quầy sẽ xuất hiện sau khi nhân viên hoàn tất ca."}
            </p>
          </aside>
        </div>
      </div>

      {/* 6. TODAY'S & UPCOMING SHIFTS ROSTER */}
      <section className="card">
        <div className="card-header">
          <ViewHeader
            title="Lịch làm việc hôm nay & sắp tới"
            subtitle="Danh sách ca đã xuất bản phân công cho nhân viên"
          />
          <Link className="text-link flex items-center gap-1 text-xs font-bold" href="/app/schedule">
            Quản lý lịch tuần <ArrowRight size={13} />
          </Link>
        </div>

        <div className="list">
          {nextShifts.map((shift) => (
            <div className="list-row" key={shift.id}>
              <div className="person">
                <span className="mini-icon mint">
                  <CalendarDays size={15} />
                </span>
                <span className="person-copy">
                  <strong>{shift.employee_name}</strong>
                  <small>
                    {formatDateTime(shift.starts_at)} — {formatTime(shift.ends_at)}
                  </small>
                </span>
              </div>
              <span className="badge success">{shift.role_label}</span>
            </div>
          ))}

          {nextShifts.length === 0 && (
            <div className="p-6 text-center text-[#7b6f70] space-y-2">
              <CalendarDays size={26} className="mx-auto text-[#b0a8a6]" />
              <p className="text-xs font-medium">Chưa có ca làm việc nào được xuất bản cho thời gian tới.</p>
              <Link
                href="/app/schedule"
                className="button button-compact inline-flex items-center gap-1 text-xs mx-auto mt-2"
              >
                <Plus size={14} /> Lập lịch ca ngay
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
