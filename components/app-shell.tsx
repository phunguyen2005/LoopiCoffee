"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  Clock3,
  Coffee,
  FileBarChart,
  HandHelping,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  ShieldPlus,
  Store,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LoopyMark } from "./loopy-mark";
import { LoopyToastProvider } from "./loopy-toast";
import type { LoopiUser } from "@/app/loopi-user";

type TodaySnapshot = {
  shift: { starts_at: string; ends_at: string; role_label: string } | null;
  attendance: { opened_at: string | null; closed_at: string | null; status: string } | null;
  checklist: { total: number; done: number };
};

// Navigation structure grouped logically for Owner/Manager vs Staff
const overviewNav = [
  { href: "/app", label: "Tổng quan", icon: LayoutDashboard, roles: ["system_admin", "owner", "manager"] },
  { href: "/app/today", label: "Hôm nay", icon: Coffee, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
  { href: "/app/profile", label: "Hồ sơ cá nhân", icon: UserRound, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
];

const operationsNav = [
  { href: "/app/schedule", label: "Lịch làm", icon: CalendarDays, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
  { href: "/app/attendance", label: "Chấm công", icon: Clock3, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
  { href: "/app/checklists", label: "Checklist", icon: CheckSquare2, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
  { href: "/app/issues", label: "Sự cố", icon: TriangleAlert, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
  { href: "/app/handovers", label: "Bàn giao", icon: HandHelping, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
];

const teamNav = [
  { href: "/app/team", label: "Nhân viên", icon: UsersRound, roles: ["system_admin", "owner", "manager"] },
  { href: "/app/requests", label: "Yêu cầu", icon: UserRound, roles: ["system_admin", "owner", "manager", "team_lead", "employee"] },
  { href: "/app/attendance/review", label: "Duyệt chấm công", icon: ShieldCheck, roles: ["system_admin", "owner", "manager", "team_lead"] },
];

const adminNav = [
  { href: "/app/admin/accounts", label: "Tài khoản", icon: ShieldPlus, roles: ["system_admin", "owner"] },
  { href: "/app/reports/attendance", label: "Báo cáo", icon: FileBarChart, roles: ["system_admin", "owner", "manager"] },
  { href: "/app/settings/store", label: "Thiết lập", icon: Settings, roles: ["system_admin", "owner"] },
  { href: "/app/audit", label: "Nhật ký", icon: FileBarChart, roles: ["system_admin", "owner"] },
];

function isActive(pathname: string, href: string) {
  if (href === "/app/attendance") return pathname === href;
  return href === "/app" ? pathname === href : pathname.startsWith(href);
}

export function AppShell({
  user,
  dateLabel,
  children,
}: {
  user: LoopiUser;
  dateLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [todaySnapshot, setTodaySnapshot] = useState<TodaySnapshot | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/today", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => payload && setTodaySnapshot(payload as TodaySnapshot))
      .catch(() => {});
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("mobile-drawer-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("mobile-drawer-open");
    };
  }, [mobileNavOpen]);

  const initials = user.displayName
    .split(" ")
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const filterNav = (items: typeof overviewNav) =>
    items.filter((item) => item.roles.includes(user.role));

  const visibleOverview = filterNav(overviewNav);
  const visibleOperations = filterNav(operationsNav);
  const visibleTeam = filterNav(teamNav);
  const visibleAdmin = filterNav(adminNav);

  const visibleMobile = user.role === "employee"
    ? [
        { href: "/app/today", label: "Hôm nay", icon: Coffee },
        { href: "/app/schedule", label: "Lịch", icon: CalendarDays },
        { href: "/app/attendance", label: "Chấm công", icon: Clock3 },
        { href: "/app/checklists", label: "Công việc", icon: CheckSquare2 },
        { href: "/app/issues", label: "Sự cố", icon: TriangleAlert },
      ]
    : [
        { href: "/app", label: "Tổng quan", icon: LayoutDashboard },
        { href: "/app/today", label: "Hôm nay", icon: Coffee },
        { href: "/app/attendance/review", label: "Duyệt ca", icon: ShieldCheck },
        { href: "/app/schedule", label: "Lịch", icon: CalendarDays },
        { href: "/app/issues", label: "Sự cố", icon: TriangleAlert },
      ];

  const handleSignOut = () => {
    router.push("/auth/signout");
  };

  return (
    <LoopyToastProvider>
      <div className="app-frame">
        <aside className="app-sidebar">
          {/* Brand logo redirects to Landing Page (/) */}
          <Link
            href="/"
            className="brand"
            title="Trở về trang chủ LoopiCafe"
          >
            <LoopyMark size="small" />
            <span>LoopiCafe</span>
          </Link>

          {visibleOverview.length > 0 && <span className="nav-section-label">Tổng quan</span>}
          {visibleOverview.length > 0 && (
            <nav className="app-nav" aria-label="Điều hướng tổng quan">
              {visibleOverview.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}
                >
                  <Icon size={17} /> {label}
                </Link>
              ))}
            </nav>
          )}

          {visibleOperations.length > 0 && <span className="nav-section-label" style={{ marginTop: 20 }}>Vận hành</span>}
          {visibleOperations.length > 0 && (
            <nav className="app-nav" aria-label="Điều hướng vận hành">
              {visibleOperations.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}
                >
                  <Icon size={17} /> {label}
                </Link>
              ))}
            </nav>
          )}

          {visibleTeam.length > 0 && <span className="nav-section-label" style={{ marginTop: 20 }}>Nhân sự</span>}
          {visibleTeam.length > 0 && (
            <nav className="app-nav" aria-label="Điều hướng nhân sự">
              {visibleTeam.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}
                >
                  <Icon size={17} /> {label}
                </Link>
              ))}
            </nav>
          )}

          {visibleAdmin.length > 0 && <span className="nav-section-label" style={{ marginTop: 20 }}>Quản trị</span>}
          {visibleAdmin.length > 0 && (
            <nav className="app-nav" aria-label="Điều hướng quản trị">
              {visibleAdmin.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}
                >
                  <Icon size={17} /> {label}
                </Link>
              ))}
            </nav>
          )}
          <div
            className="sidebar-bottom cursor-pointer hover:bg-[#fff2f4] transition p-2 rounded-xl"
            onClick={() => setShowProfile(true)}
            role="button"
            tabIndex={0}
            title="Xem thông tin tài khoản"
          >
            <span className="avatar">{initials}</span>
            <span className="flex-1 min-w-0">
              <strong className="block truncate">{user.displayName}</strong>
              <small className="text-xs text-[#7b6f70]">{roleLabel(user.role)}</small>
            </span>
          </div>
        </aside>

        <main className="app-main">
          <div className="mobile-topbar">
            <Link href="/app/today" className="brand" title="Về trang Hôm nay">
              <LoopyMark size="small" /><span>LoopiCafe</span>
            </Link>
            <div className="mobile-topbar-actions">
              <Link href="/app/notifications" className="icon-button mobile-notification-button" aria-label="Thông báo">
                <Bell size={18} /><span aria-hidden="true" />
              </Link>
              <button onClick={() => setShowProfile(true)} className="avatar-button" aria-label="Mở hồ sơ cá nhân">
                <span className="avatar">{initials}</span>
              </button>
              <button
                className="icon-button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Mở bảng điều khiển nhanh"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-dashboard-drawer"
              >
                <Menu size={19} />
              </button>
            </div>
          </div>
          <header className="app-header">
            <div className="app-header-copy">
              <h1 className="app-title">{titleForPath(pathname)}</h1>
              <p>{subtitleForPath(pathname, todaySnapshot)}</p>
            </div>
            <div className="header-actions">
              <span className="date-pill"><CalendarDays size={14} /> {dateLabel}</span>
              <Link href="/app/notifications" className="icon-button" aria-label="Thông báo"><Bell size={17} /></Link>
              <button
                onClick={() => setShowProfile(true)}
                className="avatar-button focus:outline-none"
                title="Thông tin tài khoản"
              >
                <span className="avatar">{initials}</span>
              </button>
            </div>
          </header>
          <section className="mobile-quick-panel" aria-label="Tóm tắt ca làm hôm nay">
            <Link href="/app/schedule" className="mobile-quick-stat">
              <span>Ca hôm nay</span>
              <strong>{todaySnapshot?.shift ? `${formatShellTime(todaySnapshot.shift.starts_at)}–${formatShellTime(todaySnapshot.shift.ends_at)}` : "Chưa có ca"}</strong>
            </Link>
            <Link href="/app/attendance" className="mobile-quick-stat">
              <span>Trạng thái</span>
              <strong>{todaySnapshot?.attendance?.closed_at ? "Đã ra ca" : todaySnapshot?.attendance?.opened_at ? "Đang trong ca" : "Chưa vào ca"}</strong>
            </Link>
            <Link href="/app/checklists" className="mobile-quick-stat">
              <span>Checklist</span>
              <strong>{todaySnapshot ? `${todaySnapshot.checklist.done}/${todaySnapshot.checklist.total} việc` : "Đang tải…"}</strong>
            </Link>
          </section>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.button
              type="button"
              className="mobile-drawer-backdrop"
              aria-label="Đóng bảng điều khiển nhanh"
              onClick={() => setMobileNavOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              id="mobile-dashboard-drawer"
              className="mobile-dashboard-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Bảng điều khiển nhanh"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
            >
              <div className="mobile-drawer-header">
                <div>
                  <span className="drawer-eyebrow">Quick dashboard</span>
                  <h2>Xin chào, {user.displayName.split(" ").slice(-1)[0]}!</h2>
                  <p>Cửa hàng chính · {roleLabel(user.role)}</p>
                </div>
                <button className="icon-button" onClick={() => setMobileNavOpen(false)} aria-label="Đóng bảng điều khiển">
                  <X size={19} />
                </button>
              </div>

              <div className="drawer-shift-summary">
                <span className="mini-icon pink"><Coffee size={18} /></span>
                <div>
                  <small>Ca làm hôm nay</small>
                  <strong>{todaySnapshot?.shift ? `${formatShellTime(todaySnapshot.shift.starts_at)} — ${formatShellTime(todaySnapshot.shift.ends_at)}` : "Chưa có ca được phân công"}</strong>
                  <span>{todaySnapshot?.shift?.role_label ?? "Kiểm tra lịch để xem ca tiếp theo"}</span>
                </div>
              </div>

              <div className="drawer-quick-actions">
                <Link href="/app/attendance"><Clock3 size={18} /><span>Chấm công</span></Link>
                <Link href="/app/schedule"><CalendarDays size={18} /><span>Xem lịch</span></Link>
                <Link href="/app/issues"><TriangleAlert size={18} /><span>Báo sự cố</span></Link>
              </div>

              <div className="drawer-nav-groups">
                {[
                  { label: "Công việc", items: [...visibleOverview, ...visibleOperations] },
                  { label: "Nhân sự & quản trị", items: [...visibleTeam, ...visibleAdmin] },
                ].map((section) => section.items.length > 0 && (
                  <section key={section.label}>
                    <h3>{section.label}</h3>
                    <nav aria-label={section.label}>
                      {section.items.map(({ href, label, icon: Icon }) => (
                        <Link key={href} href={href} className={isActive(pathname, href) ? "active" : ""}>
                          <Icon size={17} /><span>{label}</span>
                        </Link>
                      ))}
                    </nav>
                  </section>
                ))}
              </div>

              <div className="drawer-account-actions">
                <button onClick={() => { setMobileNavOpen(false); setShowProfile(true); }}>
                  <UserRound size={17} /> Hồ sơ & cài đặt
                </button>
                <button onClick={handleSignOut} className="danger-text"><LogOut size={17} /> Đăng xuất</button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Profile & Sign Out Modal / Drawer */}
      {showProfile && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-[#eee3df] animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#eee3df]">
              <h3 className="font-bold text-[#6f2939] text-lg flex items-center gap-2">
                <UserRound size={20} className="text-[#d96d83]" /> Thông tin tài khoản
              </h3>
              <button
                onClick={() => setShowProfile(false)}
                className="p-1 rounded-full hover:bg-[#fff2f4] text-[#7b6f70] transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-[#fff2f4] text-[#d96d83] font-bold text-2xl rounded-2xl flex items-center justify-center mx-auto mb-2 border border-[#ffe1e7]">
                  {initials}
                </div>
                <h4 className="font-bold text-[#332a2b] text-base">{user.displayName}</h4>
                <span className="inline-block mt-1 px-3 py-1 bg-[#ffe1e7] text-[#6f2939] text-xs font-semibold rounded-full uppercase">
                  {roleLabel(user.role)}
                </span>
              </div>

              <div className="bg-[#fffaf4] rounded-2xl p-4 border border-[#eee3df] space-y-3 text-sm">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#7b6f70] flex items-center gap-1.5"><UserRound size={14} /> Email:</span>
                  <span className="font-medium text-[#332a2b]">{user.email}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#7b6f70] flex items-center gap-1.5"><Store size={14} /> Cửa hàng:</span>
                  <span className="font-medium text-[#332a2b]">LoopiCafe Main Store</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#7b6f70] flex items-center gap-1.5"><ShieldCheck size={14} /> Trạng thái:</span>
                  <span className="text-[#4c9779] font-semibold">Đang hoạt động</span>
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Link
                href="/app/profile"
                onClick={() => setShowProfile(false)}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#d96d83] to-[#c75865] hover:from-[#c75865] hover:to-[#a83d4c] text-white font-bold rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-[0_6px_20px_rgba(217,109,131,0.28)] hover:shadow-[0_8px_24px_rgba(217,109,131,0.38)] active:scale-[0.98]"
              >
                <UserRound size={16} /> Chỉnh sửa họ tên & hồ sơ
              </Link>
              <button
                onClick={handleSignOut}
                className="w-full py-3 bg-[#fff2f4] hover:bg-[#ffe1e7] text-[#c75865] font-bold rounded-2xl transition flex items-center justify-center gap-2 text-sm border border-[#ffe1e7]"
              >
                <LogOut size={16} /> Đăng xuất tài khoản
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Navigation */}
      <nav className="mobile-nav" aria-label="Điều hướng di động">
        {visibleMobile.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}
          >
            <Icon size={17} /> {label}
          </Link>
        ))}
      </nav>
    </div>
    </LoopyToastProvider>
  );
}

function titleForPath(pathname: string) {
  if (pathname === "/app") return "Tổng quan cửa hàng";
  if (pathname.startsWith("/app/profile")) return "Hồ sơ cá nhân";
  if (pathname.startsWith("/app/today")) return "Ca làm hôm nay";
  if (pathname.startsWith("/app/schedule")) return "Lịch làm việc";
  if (pathname.startsWith("/app/attendance")) return "Chấm công";
  if (pathname.startsWith("/app/checklists")) return "Checklist vận hành";
  if (pathname.startsWith("/app/issues")) return "Sự cố & thiếu hàng";
  if (pathname.startsWith("/app/handovers")) return "Bàn giao ca";
  if (pathname.startsWith("/app/requests")) return "Yêu cầu của nhân viên";
  if (pathname.startsWith("/app/team")) return "Nhân sự";
  if (pathname.startsWith("/app/admin/accounts")) return "Quản trị tài khoản";
  if (pathname.startsWith("/app/reports")) return "Báo cáo";
  if (pathname.startsWith("/app/settings")) return "Thiết lập cửa hàng";
  if (pathname.startsWith("/app/notifications")) return "Thông báo";
  if (pathname.startsWith("/app/audit")) return "Nhật ký kiểm toán";
  return "LoopiCafe";
}

function subtitleForPath(pathname: string, today: TodaySnapshot | null) {
  if (pathname.startsWith("/app/today")) {
    return today?.shift
      ? `Ca hiện tại: ${formatShellTime(today.shift.starts_at)} — ${formatShellTime(today.shift.ends_at)}`
      : "Mọi việc quan trọng trong ngày, ở một nơi";
  }
  if (pathname.startsWith("/app/schedule")) return "Xem nhanh ca của bạn theo danh sách hoặc tuần";
  if (pathname === "/app/attendance") {
    return today?.attendance?.opened_at ? "Bạn đang trong ca làm việc" : "Bạn chưa bắt đầu ca hôm nay";
  }
  if (pathname.startsWith("/app/checklists")) {
    return today ? `Bạn đã hoàn tất ${today.checklist.done}/${today.checklist.total} công việc` : "Theo dõi checklist trong ca";
  }
  if (pathname.startsWith("/app/issues")) return "Báo nhanh và theo dõi sự cố tại cửa hàng";
  return "LoopiCafe · Cửa hàng chính";
}

function formatShellTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function roleLabel(role: LoopiUser["role"]) {
  if (role === "system_admin") return "Quản trị hệ thống";
  if (role === "owner") return "Chủ cửa hàng";
  if (role === "manager") return "Quản lý";
  if (role === "team_lead") return "Trưởng nhóm";
  return "Nhân viên";
}
