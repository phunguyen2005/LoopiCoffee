"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  Clock3,
  Coffee,
  FileBarChart,
  HandHelping,
  LayoutDashboard,
  Menu,
  Settings,
  TriangleAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import { LoopyMark } from "./loopy-mark";
import type { LoopiUser } from "@/app/loopi-user";

const primaryNavigation = [
  { href: "/app", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/app/today", label: "Hôm nay", icon: Coffee },
  { href: "/app/schedule", label: "Lịch làm", icon: CalendarDays },
  { href: "/app/attendance", label: "Chấm công", icon: Clock3 },
  { href: "/app/checklists", label: "Checklist", icon: CheckSquare2 },
  { href: "/app/issues", label: "Sự cố", icon: TriangleAlert },
  { href: "/app/handovers", label: "Bàn giao", icon: HandHelping },
  { href: "/app/requests", label: "Yêu cầu", icon: UserRound },
];

const managementNavigation = [
  { href: "/app/team", label: "Nhân sự", icon: UsersRound },
  { href: "/app/reports/attendance", label: "Báo cáo", icon: FileBarChart },
  { href: "/app/settings/store", label: "Thiết lập", icon: Settings },
];

const mobileNavigation = [
  primaryNavigation[0],
  primaryNavigation[1],
  primaryNavigation[2],
  primaryNavigation[3],
  primaryNavigation[5],
];

function isActive(pathname: string, href: string) {
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
  const initials = user.displayName
    .split(" ")
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <Link href="/app" className="brand">
          <LoopyMark size="small" />
          <span>LoopiCafe</span>
        </Link>
        <span className="nav-section-label">Cửa hàng</span>
        <nav className="app-nav" aria-label="Điều hướng vận hành">
          {primaryNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}
            >
              <Icon size={17} /> {label}
            </Link>
          ))}
        </nav>
        <span className="nav-section-label" style={{ marginTop: 24 }}>Quản lý</span>
        <nav className="app-nav" aria-label="Điều hướng quản lý">
          {managementNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-item ${isActive(pathname, href) ? "active" : ""}`}
            >
              <Icon size={17} /> {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">{initials}</span>
          <span>
            <strong>{user.displayName}</strong>
            <small>Chủ cửa hàng</small>
          </span>
        </div>
      </aside>

      <main className="app-main">
        <div className="mobile-topbar">
          <Link href="/app" className="brand">
            <LoopyMark size="small" /><span>LoopiCafe</span>
          </Link>
          <button className="icon-button" aria-label="Mở trình đơn"><Menu size={18} /></button>
        </div>
        <header className="app-header">
          <div className="app-header-copy">
            <h1 className="app-title">{titleForPath(pathname)}</h1>
            <p>LoopiCafe Nguyễn Trãi · Asia/Ho_Chi_Minh</p>
          </div>
          <div className="header-actions">
            <span className="date-pill"><CalendarDays size={14} /> {dateLabel}</span>
            <button className="icon-button" aria-label="Thông báo"><Bell size={17} /></button>
            <span className="avatar">{initials}</span>
          </div>
        </header>
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Điều hướng di động">
        {mobileNavigation.map(({ href, label, icon: Icon }) => (
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
  if (pathname.startsWith("/app/reports")) return "Báo cáo chấm công";
  if (pathname.startsWith("/app/settings")) return "Thiết lập cửa hàng";
  return "LoopiCafe";
}
