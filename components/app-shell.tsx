"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
import { LoopyMark } from "./loopy-mark";
import type { LoopiUser } from "@/app/loopi-user";

// Navigation structure grouped logically for Owner/Manager vs Staff
const overviewNav = [
  { href: "/app", label: "Tổng quan", icon: LayoutDashboard, roles: ["owner", "manager"] },
  { href: "/app/today", label: "Hôm nay", icon: Coffee, roles: ["owner", "manager", "team_lead", "employee"] },
];

const operationsNav = [
  { href: "/app/schedule", label: "Lịch làm", icon: CalendarDays, roles: ["owner", "manager", "team_lead", "employee"] },
  { href: "/app/attendance", label: "Chấm công", icon: Clock3, roles: ["owner", "manager", "team_lead", "employee"] },
  { href: "/app/checklists", label: "Checklist", icon: CheckSquare2, roles: ["owner", "manager", "team_lead", "employee"] },
  { href: "/app/issues", label: "Sự cố", icon: TriangleAlert, roles: ["owner", "manager", "team_lead", "employee"] },
  { href: "/app/handovers", label: "Bàn giao", icon: HandHelping, roles: ["owner", "manager", "team_lead", "employee"] },
];

const teamNav = [
  { href: "/app/team", label: "Nhân viên", icon: UsersRound, roles: ["owner", "manager"] },
  { href: "/app/requests", label: "Yêu cầu", icon: UserRound, roles: ["owner", "manager", "team_lead", "employee"] },
  { href: "/app/attendance/review", label: "Duyệt chấm công", icon: ShieldCheck, roles: ["owner", "manager", "team_lead"] },
];

const adminNav = [
  { href: "/app/admin/accounts", label: "Tài khoản", icon: ShieldPlus, roles: ["owner"] },
  { href: "/app/reports/attendance", label: "Báo cáo", icon: FileBarChart, roles: ["owner", "manager"] },
  { href: "/app/settings/store", label: "Thiết lập", icon: Settings, roles: ["owner"] },
  { href: "/app/audit", label: "Nhật ký", icon: FileBarChart, roles: ["owner"] },
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
    <div className="app-frame">
      <aside className="app-sidebar">
        {/* Brand logo redirects to Landing Page (/) */}
        <Link href="/" className="brand" title="Trở về trang chủ LoopiCafe">
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
          <Link href="/" className="brand" title="Trở về trang chủ">
            <LoopyMark size="small" /><span>LoopiCafe</span>
          </Link>
          <button
            className="icon-button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Mở trình đơn"
          >
            <Menu size={18} />
          </button>
        </div>
        <header className="app-header">
          <div className="app-header-copy">
            <h1 className="app-title">{titleForPath(pathname)}</h1>
            <p>LoopiCafe · Cửa hàng chính</p>
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
        {children}
      </main>

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

            <div className="pt-2">
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
  );
}

function titleForPath(pathname: string) {
  if (pathname === "/app") return "Tổng quan cửa hàng";
  if (pathname.startsWith("/app/today")) return "Ca làm hôm nay";
  if (pathname.startsWith("/app/schedule")) return "Lịch làm việc";
  if (pathname.startsWith("/app/attendance")) return "Chấm công";
  if (pathname.startsWith("/app/checklists")) return "Checklist vận hành";
  if (pathname.startsWith("/app/issues")) return "Sự cố & thiếu hàng";
  if (pathname.startsWith("/app/handovers")) return "Bàn giao ca";
  if (pathname.startsWith("/app/requests")) return "Yêu cầu của nhân viên";
  if (pathname.startsWith("/app/team")) return "Nhân sự";
  if (pathname.startsWith("/app/admin/accounts")) return "Quản trị tài khoản";
  if (pathname.startsWith("/app/reports")) return "Báo cáo chấm công";
  if (pathname.startsWith("/app/settings")) return "Thiết lập cửa hàng";
  if (pathname.startsWith("/app/notifications")) return "Thông báo";
  if (pathname.startsWith("/app/audit")) return "Nhật ký kiểm toán";
  return "LoopiCafe";
}

function roleLabel(role: LoopiUser["role"]) {
  if (role === "owner") return "Chủ cửa hàng";
  if (role === "manager") return "Quản lý";
  if (role === "team_lead") return "Trưởng nhóm";
  return "Nhân viên";
}
