"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  Coffee,
  FileBarChart,
  HandHelping,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  ShieldPlus,
  ShoppingBag,
  Store,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { LoopyMark } from "./loopy-mark";
import { LoopyToastProvider } from "./loopy-toast";
import { LoopyPreloader, type LoopyPreloaderVariant } from "./loopy-preloader";
import { NotificationsPopover } from "./notifications-popover";
import type { LoopiUser } from "@/app/loopi-user";
import { getPersonalizedGreeting, getUserAccountName, getUserFirstName, LOOPY_COPY } from "@/lib/loopy-copy";

type TodaySnapshot = {
  shift: { starts_at: string; ends_at: string; role_label: string } | null;
  attendance: { opened_at: string | null; closed_at: string | null; status: string } | null;
  checklist: { total: number; done: number };
};

type OwnerDashboardSnapshot = {
  activeStaff: number;
  pendingExceptions: number;
  checklistDone: number;
  checklistTotal: number;
  openIncidents: number;
};

type AdminSummarySnapshot = {
  accounts: { total: number; active: number; invited: number; blocked: number };
  failedOperations: { count: number };
};

// Staff Navigation: Lean, focused on their personal shifts & daily shift tasks
const staffShiftNav = [
  { href: "/app/today", label: "Hôm nay", icon: Coffee },
  { href: "/app/attendance", label: "Chấm công", icon: Clock3 },
  { href: "/app/schedule", label: "Lịch làm của bạn", icon: CalendarDays },
];

const staffTaskNav = [
  { href: "/app/checklists", label: "Việc cần làm hôm nay", icon: CheckSquare2 },
  { href: "/app/handovers", label: "Sổ bàn giao ca", icon: HandHelping },
  { href: "/app/issues", label: "Báo sự cố quầy", icon: TriangleAlert },
  { href: "/app/requests", label: "Đơn từ & Yêu cầu", icon: UserRound },
];

// Owner & Manager Navigation: 3-Level Progressive Disclosure
// Level 1: Daily Operations (Core day-to-day)
const ownerDailyNav = [
  { href: "/app", label: "Hôm nay ở quán thế nào?", icon: LayoutDashboard, roles: ["owner", "manager"] },
  { href: "/app/team", label: "Nhà mình có những ai?", icon: UsersRound, roles: ["owner", "manager"] },
  { href: "/app/attendance/review", label: "Duyệt chấm công", icon: ShieldCheck, roles: ["owner", "manager"] },
  { href: "/app/schedule", label: "Lịch làm việc", icon: CalendarDays, roles: ["owner", "manager", "team_lead"] },
  { href: "/app/orders", label: "Đơn hàng của quán", icon: ShoppingBag, roles: ["owner", "manager"] },
];

// Level 2: Management & Oversight (Periodic check)
const ownerManagementNav = [
  { href: "/app/reports/attendance", label: "Báo cáo & Giờ công", icon: FileBarChart, roles: ["owner", "manager"] },
  { href: "/app/requests", label: "Đơn từ & Yêu cầu", icon: UserRound, roles: ["owner", "manager", "team_lead"] },
  { href: "/app/checklists", label: "Việc cần làm hôm nay", icon: CheckSquare2, roles: ["owner", "manager", "team_lead"] },
  { href: "/app/issues", label: "Sự cố & Bàn giao", icon: TriangleAlert, roles: ["owner", "manager", "team_lead"] },
];

// Level 3: Administration & Settings (Less frequent, safely grouped)
const ownerAdminNav = [
  { href: "/app/settings/store", label: "Thiết lập cửa hàng", icon: Settings, roles: ["owner"] },
  { href: "/app/audit", label: "Lịch sử hoạt động", icon: FileBarChart, roles: ["owner"] },
];

const systemAdminNav = [
  { href: "/app/admin", label: "Tổng quan quản trị", icon: LayoutDashboard },
  { href: "/app/admin/accounts", label: "Tài khoản", icon: UsersRound },
  { href: "/app/admin/roles", label: "Vai trò & quyền", icon: ShieldPlus },
  { href: "/app/admin/audit", label: "Nhật ký quản trị", icon: FileBarChart },
];

const permissionByHref: Record<string, string> = {
  "/app": "dashboard.read", "/app/team": "people.read", "/app/attendance/review": "attendance.review",
  "/app/orders": "orders.read", "/app/reports/attendance": "payroll.read",
};

function isActive(pathname: string, href: string, isStaff: boolean = false) {
  if (isStaff && href === "/app/today") {
    return pathname === "/app" || pathname === "/app/today" || pathname.startsWith("/app/today");
  }
  if (href === "/app/attendance") return pathname === href;
  return href === "/app" ? pathname === href : pathname.startsWith(href);
}

function getNavBadge(
  href: string,
  ownerMetrics: OwnerDashboardSnapshot | null,
  todaySnapshot: TodaySnapshot | null,
  adminSummary: AdminSummarySnapshot | null,
  isStaff: boolean,
  isTechnicalAdmin: boolean,
): { label: string; tone: "danger" | "warning" | "success" | "neutral" } | null {
  if (isTechnicalAdmin) {
    if (href === "/app/admin/accounts" && (adminSummary?.accounts?.invited ?? 0) > 0) {
      return { label: `${adminSummary!.accounts.invited}`, tone: "warning" };
    }
    if (href === "/app/admin/audit" && (adminSummary?.failedOperations?.count ?? 0) > 0) {
      return { label: `${adminSummary!.failedOperations.count}`, tone: "danger" };
    }
    return null;
  }

  if (isStaff) {
    if (href === "/app/attendance" && todaySnapshot?.attendance?.opened_at && !todaySnapshot?.attendance?.closed_at) {
      return { label: "Trong ca", tone: "success" };
    }
    if (href === "/app/checklists" && todaySnapshot && Number(todaySnapshot.checklist?.total ?? 0) > 0) {
      const done = Number(todaySnapshot.checklist?.done ?? 0);
      const total = Number(todaySnapshot.checklist?.total ?? 0);
      return { label: `${done}/${total}`, tone: done === total ? "success" : "neutral" };
    }
    return null;
  }

  // Owner / Manager
  if (href === "/app/attendance/review" && (ownerMetrics?.pendingExceptions ?? 0) > 0) {
    return { label: `${ownerMetrics!.pendingExceptions} cần duyệt`, tone: "danger" };
  }
  if (href === "/app/team" && (ownerMetrics?.activeStaff ?? 0) > 0) {
    return { label: `${ownerMetrics!.activeStaff} trực`, tone: "success" };
  }
  if (href === "/app/checklists" && ownerMetrics && ownerMetrics.checklistTotal > 0) {
    const { checklistDone, checklistTotal } = ownerMetrics;
    return { label: `${checklistDone}/${checklistTotal}`, tone: checklistDone === checklistTotal ? "success" : "neutral" };
  }
  if (href === "/app/issues" && (ownerMetrics?.openIncidents ?? 0) > 0) {
    return { label: `${ownerMetrics!.openIncidents}`, tone: "warning" };
  }
  return null;
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
  const shouldReduceMotion = useReducedMotion();
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const [showProfile, setShowProfile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [todaySnapshot, setTodaySnapshot] = useState<TodaySnapshot | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [preloaderVariant, setPreloaderVariant] = useState<LoopyPreloaderVariant | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileDrawerCloseButtonRef = useRef<HTMLButtonElement>(null);

  const isStaff = user.role === "employee" || user.role === "team_lead";
  const isTechnicalAdmin = user.role === "system_admin";
  const hasStickyCta = isStaff && (pathname === "/app" || pathname.startsWith("/app/today"));
  const showMobileQuickPanel = isTechnicalAdmin
    ? true
    : isStaff
    ? pathname !== "/app" && pathname !== "/app/today"
    : pathname !== "/app";
  const [effectivePermissions, setEffectivePermissions] = useState<string[]>(user.permissions);
  const [ownerMetrics, setOwnerMetrics] = useState<OwnerDashboardSnapshot | null>(null);
  const [adminSummary, setAdminSummary] = useState<AdminSummarySnapshot | null>(null);
  const [adminSummaryLoading, setAdminSummaryLoading] = useState(false);
  const [adminSummaryError, setAdminSummaryError] = useState(false);

  const reloadAdminSummary = () => {
    if (!isTechnicalAdmin) return;
    setAdminSummaryLoading(true);
    setAdminSummaryError(false);
    void fetch("/api/admin/summary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("fetch_failed");
        const payload = (await response.json()) as AdminSummarySnapshot;
        setAdminSummary(payload);
        setAdminSummaryLoading(false);
      })
      .catch(() => {
        setAdminSummaryError(true);
        setAdminSummaryLoading(false);
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    const reloadPermissions = () => {
      if (isTechnicalAdmin) return;
      void fetch("/api/me/permissions", { cache: "no-store", signal: controller.signal })
        .then(async (res) => (res.ok ? (await res.json()) as { permissions?: string[] } : null))
        .then((payload) => {
          if (payload?.permissions && Array.isArray(payload.permissions)) {
            setEffectivePermissions(payload.permissions);
          }
        })
        .catch(() => {});
    };
    reloadPermissions();
    window.addEventListener("focus", reloadPermissions);
    window.addEventListener("loopi:permission-error", reloadPermissions);
    return () => {
      controller.abort();
      window.removeEventListener("focus", reloadPermissions);
      window.removeEventListener("loopi:permission-error", reloadPermissions);
    };
  }, [pathname, isTechnicalAdmin]);

  useEffect(() => {
    const controller = new AbortController();
    const loadShellData = () => {
      if (isTechnicalAdmin) {
        setAdminSummaryLoading(true);
        setAdminSummaryError(false);
        void fetch("/api/admin/summary", { cache: "no-store", signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error("fetch_failed");
            const payload = (await response.json()) as AdminSummarySnapshot;
            setAdminSummary(payload);
            setAdminSummaryLoading(false);
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            setAdminSummaryError(true);
            setAdminSummaryLoading(false);
          });
      }

      if (!isTechnicalAdmin) {
        void fetch("/api/today", { cache: "no-store", signal: controller.signal })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => payload && setTodaySnapshot(payload as TodaySnapshot))
          .catch(() => {});
      }

      if (!isStaff && !isTechnicalAdmin) {
        void fetch("/api/dashboard", { cache: "no-store", signal: controller.signal })
          .then(async (response) => (response.ok ? (await response.json()) as { metrics?: OwnerDashboardSnapshot } : null))
          .then((payload) => payload?.metrics && setOwnerMetrics(payload.metrics))
          .catch(() => {});
      }

      if (!isTechnicalAdmin) {
        void fetch("/api/notifications", { cache: "no-store", signal: controller.signal })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            const notifications = (payload as { notifications?: Array<{ read_at: string | null }> } | null)?.notifications;
            setUnreadNotificationCount(Array.isArray(notifications) ? notifications.filter((notification) => notification.read_at === null).length : 0);
          })
          .catch(() => {});
      }
    };

    loadShellData();
    window.addEventListener("focus", loadShellData);
    const pollingInterval = window.setInterval(loadShellData, 30000);

    return () => {
      controller.abort();
      window.removeEventListener("focus", loadShellData);
      window.clearInterval(pollingInterval);
    };
  }, [isStaff, isTechnicalAdmin]);

  useEffect(() => {
    const closeFrame = window.requestAnimationFrame(() => setMobileNavOpen(false));
    return () => window.cancelAnimationFrame(closeFrame);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : mobileMenuButtonRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      mobileDrawerCloseButtonRef.current?.focus();
    });
    const handleDrawerKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = mobileDrawerRef.current;
      if (!drawer) return;
      const focusableElements = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements.at(-1);
      if (!firstFocusable || !lastFocusable) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      if (!drawer.contains(document.activeElement)) {
        event.preventDefault();
        firstFocusable.focus();
      } else if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };
    document.addEventListener("keydown", handleDrawerKeyboard);
    document.body.classList.add("mobile-drawer-open");
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDrawerKeyboard);
      document.body.classList.remove("mobile-drawer-open");
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [mobileNavOpen]);

  const initials = user.displayName
    .split(" ")
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const filterNav = <T extends { roles?: string[]; href: string }>(items: T[]) =>
    items.filter((item) => {
      if (item.href === "/app/reports/attendance") {
        return effectivePermissions.includes("payroll.read") || effectivePermissions.includes("attendance.review");
      }
      const reqPerm = permissionByHref[item.href];
      if (reqPerm) {
        return effectivePermissions.includes(reqPerm);
      }
      return !item.roles || item.roles.includes(user.role);
    });

  const visibleDaily = isTechnicalAdmin ? [] : filterNav(ownerDailyNav);
  const visibleManagement = isTechnicalAdmin ? [] : filterNav(ownerManagementNav);
  const visibleAdmin = isTechnicalAdmin ? [] : filterNav(ownerAdminNav);
  const customPermittedNav = isStaff
    ? [...ownerDailyNav, ...ownerManagementNav].filter(
        (item) => item.href === "/app/reports/attendance"
          ? effectivePermissions.includes("payroll.read") || effectivePermissions.includes("attendance.review")
          : permissionByHref[item.href] && effectivePermissions.includes(permissionByHref[item.href]),
      )
    : [];

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {
      daily: false,
      management: false,
      admin: false,
    };
    if (typeof window === "undefined") return defaults;
    try {
      const saved = localStorage.getItem("loopicafe_owner_sidebar_collapsed");
      if (saved) {
        return { ...defaults, ...JSON.parse(saved) };
      }
    } catch {}
    return defaults;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [sectionKey]: !prev[sectionKey] };
      try {
        localStorage.setItem("loopicafe_owner_sidebar_collapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const isDailyActive = visibleDaily.some((item) => isActive(pathname, item.href));
  const isManagementActive = visibleManagement.some((item) => isActive(pathname, item.href));
  const isAdminActive = visibleAdmin.some((item) => isActive(pathname, item.href));

  const hasSearch = searchQuery.trim().length > 0;
  const searchLower = searchQuery.trim().toLowerCase();

  const filteredDaily = visibleDaily.filter(
    (item) => !hasSearch || item.label.toLowerCase().includes(searchLower)
  );
  const filteredManagement = visibleManagement.filter(
    (item) => !hasSearch || item.label.toLowerCase().includes(searchLower)
  );
  const filteredAdmin = visibleAdmin.filter(
    (item) => !hasSearch || item.label.toLowerCase().includes(searchLower)
  );

  const totalFilteredCount = filteredDaily.length + filteredManagement.length + filteredAdmin.length;

  const isDailyOpen = hasSearch ? filteredDaily.length > 0 : !collapsedSections.daily || isDailyActive;
  const isManagementOpen = hasSearch ? filteredManagement.length > 0 : !collapsedSections.management || isManagementActive;
  const isAdminOpen = hasSearch ? filteredAdmin.length > 0 : !collapsedSections.admin || isAdminActive;

  const allOpen = isDailyOpen && isManagementOpen && (visibleAdmin.length === 0 || isAdminOpen);

  const handleToggleAll = () => {
    const nextCollapsed = allOpen;
    const next = {
      daily: nextCollapsed,
      management: nextCollapsed,
      admin: nextCollapsed,
    };
    setCollapsedSections(next);
    try {
      localStorage.setItem("loopicafe_owner_sidebar_collapsed", JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    if (activeLinkRef.current) {
      activeLinkRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [pathname]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (!isInput && (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const visibleMobile = isTechnicalAdmin
    ? [
        { href: "/app/admin", label: "Quản trị", icon: LayoutDashboard },
        { href: "/app/admin/accounts", label: "Tài khoản", icon: UsersRound },
        { href: "/app/admin/roles", label: "Phân quyền", icon: ShieldPlus },
        { href: "/app/admin/audit", label: "Nhật ký", icon: FileBarChart },
        { href: "/app/profile", label: "Hồ sơ", icon: UserRound },
      ]
    : isStaff
    ? [
        { href: "/app/today", label: "Hôm nay", icon: Coffee },
        { href: "/app/attendance", label: "Chấm công", icon: Clock3 },
        { href: "/app/schedule", label: "Lịch", icon: CalendarDays },
        { href: "/app/checklists", label: "Việc cần làm", icon: CheckSquare2 },
        { href: "/app/requests", label: "Đơn từ", icon: UserRound },
      ]
    : [
        { href: "/app", label: "Ở quán", icon: LayoutDashboard },
        { href: "/app/team", label: "Nhà mình", icon: UsersRound },
        { href: "/app/attendance/review", label: "Duyệt công", icon: ShieldCheck },
        { href: "/app/schedule", label: "Lịch", icon: CalendarDays },
        { href: "/app/reports/attendance", label: "Báo cáo", icon: FileBarChart },
      ];

  const notificationLabel = unreadNotificationCount > 0
    ? `Thông báo, ${unreadNotificationCount} chưa đọc`
    : "Thông báo";

  const handleSignOut = () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setPreloaderVariant("depart");
    window.setTimeout(() => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/auth/signout";
      document.body.appendChild(form);
      form.submit();
    }, 950);
  };

  return (
    <LoopyToastProvider>
      <LoopyPreloader
        visible={preloaderVariant !== null}
        variant={preloaderVariant ?? undefined}
      />
      <div className="app-frame">
        <aside className="app-sidebar">
          {/* Header: Logo and Store status */}
          <div className="sidebar-header">
            <Link
              href="/"
              className="brand"
              title="Trở về trang chủ LoopyCafe"
            >
              <LoopyMark size="small" />
              <span>LoopyCafe</span>
            </Link>
            <div className="sidebar-store-chip" title="Cửa hàng đang hoạt động bình thường">
              <span className="sidebar-store-dot" />
              <span>Cửa hàng chính</span>
            </div>
          </div>

          {/* Quick Search & Expand/Collapse Toggle for Owner & Manager */}
          {!isTechnicalAdmin && !isStaff && (
            <div className="sidebar-search-box">
              <div className="sidebar-search-input-wrap">
                <Search size={14} className="sidebar-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Tìm nhanh menu (nhấn /)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="sidebar-search-input"
                  aria-label="Tìm kiếm mục điều hướng"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="sidebar-search-clear"
                    aria-label="Xóa tìm kiếm"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="sidebar-controls-row">
                <span className="sidebar-search-hint">
                  {hasSearch ? `${totalFilteredCount} kết quả` : "Phím tắt: / hoặc Ctrl+K"}
                </span>
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="sidebar-toggle-all-btn"
                  title={allOpen ? "Thu gọn các nhóm" : "Mở rộng tất cả"}
                >
                  <ChevronsUpDown size={12} />
                  <span>{allOpen ? "Thu gọn" : "Mở tất cả"}</span>
                </button>
              </div>
            </div>
          )}

          {/* Dedicated Scrollable Area */}
          <div className="sidebar-scroll-area">
            {isTechnicalAdmin ? (
              <>
                <span className="nav-section-label">Quản trị hệ thống</span>
                <nav className="app-nav" aria-label="Điều hướng quản trị hệ thống">
                  {systemAdminNav.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                    return (
                      <Link
                        key={href}
                        href={href}
                        ref={active ? activeLinkRef : undefined}
                        className={`nav-item ${active ? "active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon size={17} />
                        <span className="truncate flex-1">{label}</span>
                        {badge && (
                          <span className={`nav-item-badge ${badge.tone}`}>
                            {badge.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </>
            ) : isStaff ? (
              <>
                <span className="nav-section-label">Ca làm & Chấm công</span>
                <nav className="app-nav" aria-label="Điều hướng ca làm">
                  {staffShiftNav.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href, true);
                    const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                    return (
                      <Link
                        key={href}
                        href={href}
                        ref={active ? activeLinkRef : undefined}
                        className={`nav-item ${active ? "active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon size={17} />
                        <span className="truncate flex-1">{label}</span>
                        {badge && (
                          <span className={`nav-item-badge ${badge.tone}`}>
                            {badge.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>

                <span className="nav-section-label" style={{ marginTop: 20 }}>Nhiệm vụ trong ca</span>
                <nav className="app-nav" aria-label="Điều hướng công việc">
                  {staffTaskNav.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href, true);
                    const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                    return (
                      <Link
                        key={href}
                        href={href}
                        ref={active ? activeLinkRef : undefined}
                        className={`nav-item ${active ? "active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon size={17} />
                        <span className="truncate flex-1">{label}</span>
                        {badge && (
                          <span className={`nav-item-badge ${badge.tone}`}>
                            {badge.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>

                {customPermittedNav.length > 0 && (
                  <>
                    <span className="nav-section-label" style={{ marginTop: 20 }}>Quản lý được phân quyền</span>
                    <nav className="app-nav" aria-label="Điều hướng quản lý được phân quyền">
                      {customPermittedNav.map(({ href, label, icon: Icon }) => {
                        const active = isActive(pathname, href, false);
                        const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, false, isTechnicalAdmin);
                        return (
                          <Link
                            key={href}
                            href={href}
                            ref={active ? activeLinkRef : undefined}
                            className={`nav-item ${active ? "active" : ""}`}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon size={17} />
                            <span className="truncate flex-1">{label}</span>
                            {badge && (
                              <span className={`nav-item-badge ${badge.tone}`}>
                                {badge.label}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </nav>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Section 1: Daily Operations */}
                {filteredDaily.length > 0 && (
                  <div className="nav-section-block">
                    <button
                      type="button"
                      className="nav-section-header"
                      onClick={() => toggleSection("daily")}
                      aria-expanded={isDailyOpen}
                      aria-controls="owner-nav-daily"
                    >
                      <span className="nav-section-header-title">
                        <span>Vận hành hàng ngày</span>
                      </span>
                      <span className="nav-section-header-meta">
                        {(ownerMetrics?.pendingExceptions ?? 0) > 0 && !isDailyOpen && (
                          <span className="nav-section-alert-dot" title="Có ngoại lệ cần duyệt" />
                        )}
                        <span className="nav-section-badge">{visibleDaily.length}</span>
                        <ChevronDown
                          size={14}
                          className={`nav-section-chevron ${isDailyOpen ? "" : "is-collapsed"}`}
                        />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isDailyOpen && (
                        <motion.div
                          id="owner-nav-daily"
                          key="daily-nav-list"
                          initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                          animate={shouldReduceMotion ? undefined : { height: "auto", opacity: 1 }}
                          exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <nav className="app-nav" aria-label="Điều hướng vận hành hàng ngày">
                            {filteredDaily.map(({ href, label, icon: Icon }) => {
                              const active = isActive(pathname, href);
                              const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                              return (
                                <Link
                                  key={href}
                                  href={href}
                                  ref={active ? activeLinkRef : undefined}
                                  className={`nav-item ${active ? "active" : ""}`}
                                  aria-current={active ? "page" : undefined}
                                >
                                  <Icon size={17} />
                                  <span className="truncate flex-1">{label}</span>
                                  {badge && (
                                    <span className={`nav-item-badge ${badge.tone}`}>
                                      {badge.label}
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </nav>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Section 2: Management & Oversight */}
                {filteredManagement.length > 0 && (
                  <div className="nav-section-block" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="nav-section-header"
                      onClick={() => toggleSection("management")}
                      aria-expanded={isManagementOpen}
                      aria-controls="owner-nav-management"
                    >
                      <span className="nav-section-header-title">
                        <span>Quản trị & Đối soát</span>
                      </span>
                      <span className="nav-section-header-meta">
                        {(ownerMetrics?.openIncidents ?? 0) > 0 && !isManagementOpen && (
                          <span className="nav-section-alert-dot" title="Có sự cố chưa xử lý" />
                        )}
                        <span className="nav-section-badge">{visibleManagement.length}</span>
                        <ChevronDown
                          size={14}
                          className={`nav-section-chevron ${isManagementOpen ? "" : "is-collapsed"}`}
                        />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isManagementOpen && (
                        <motion.div
                          id="owner-nav-management"
                          key="mgmt-nav-list"
                          initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                          animate={shouldReduceMotion ? undefined : { height: "auto", opacity: 1 }}
                          exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <nav className="app-nav" aria-label="Điều hướng quản trị">
                            {filteredManagement.map(({ href, label, icon: Icon }) => {
                              const active = isActive(pathname, href);
                              const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                              return (
                                <Link
                                  key={href}
                                  href={href}
                                  ref={active ? activeLinkRef : undefined}
                                  className={`nav-item ${active ? "active" : ""}`}
                                  aria-current={active ? "page" : undefined}
                                >
                                  <Icon size={17} />
                                  <span className="truncate flex-1">{label}</span>
                                  {badge && (
                                    <span className={`nav-item-badge ${badge.tone}`}>
                                      {badge.label}
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </nav>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Section 3: Administration & Settings */}
                {filteredAdmin.length > 0 && (
                  <div className="nav-section-block" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="nav-section-header"
                      onClick={() => toggleSection("admin")}
                      aria-expanded={isAdminOpen}
                      aria-controls="owner-nav-admin"
                    >
                      <span className="nav-section-header-title">
                        <span>Hệ thống nâng cao</span>
                      </span>
                      <span className="nav-section-header-meta">
                        <span className="nav-section-badge">{visibleAdmin.length}</span>
                        <ChevronDown
                          size={14}
                          className={`nav-section-chevron ${isAdminOpen ? "" : "is-collapsed"}`}
                        />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isAdminOpen && (
                        <motion.div
                          id="owner-nav-admin"
                          key="admin-nav-list"
                          initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                          animate={shouldReduceMotion ? undefined : { height: "auto", opacity: 1 }}
                          exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <nav className="app-nav" aria-label="Điều hướng hệ thống">
                            {filteredAdmin.map(({ href, label, icon: Icon }) => {
                              const active = isActive(pathname, href);
                              const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                              return (
                                <Link
                                  key={href}
                                  href={href}
                                  ref={active ? activeLinkRef : undefined}
                                  className={`nav-item ${active ? "active" : ""}`}
                                  aria-current={active ? "page" : undefined}
                                >
                                  <Icon size={17} />
                                  <span className="truncate flex-1">{label}</span>
                                  {badge && (
                                    <span className={`nav-item-badge ${badge.tone}`}>
                                      {badge.label}
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </nav>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Empty Search State */}
                {hasSearch && totalFilteredCount === 0 && (
                  <div className="sidebar-search-empty">
                    <Search size={20} className="text-[#c75865] mb-2 opacity-60" />
                    <p className="text-xs text-[#7b6f70] mb-2 font-medium">Chưa thấy mục nào khớp với &ldquo;{searchQuery}&rdquo; nè!</p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-xs font-bold text-[#6f2939] hover:underline"
                    >
                      Xóa tìm kiếm
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pinned Footer: User Profile Card & Quick Logout */}
          <div className="sidebar-footer">
            <div className="sidebar-profile-card">
              <button
                type="button"
                className="sidebar-bottom-user-btn"
                onClick={() => setShowProfile(true)}
                disabled={!hydrated}
                title="Xem thông tin tài khoản"
              >
                <div className="sidebar-avatar-wrapper">
                  <span className="avatar">{initials}</span>
                  <span className="sidebar-active-dot" title="Tài khoản đang hoạt động" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <strong className="block truncate text-xs font-bold text-[#332a2b]">{user.displayName}</strong>
                  <small className="block text-[10.5px] text-[#7b6f70] truncate">{roleLabel(user.role)}</small>
                </div>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="sidebar-quick-logout-btn"
                title="Đăng xuất nhanh"
                aria-label="Đăng xuất tài khoản"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        <main className={`app-main ${hasStickyCta ? "has-mobile-nav-and-cta" : ""}`}>
          <div className="mobile-topbar">
            <div className="mobile-topbar-primary">
              <Link href={isTechnicalAdmin ? "/app/admin" : isStaff ? "/app/today" : "/app"} className="brand" title="Trở về trang chính">
                <LoopyMark size="small" /><span>LoopyCafe</span>
              </Link>
              <div className="mobile-topbar-actions">
                {!isTechnicalAdmin && (
                  <NotificationsPopover
                    unreadCount={unreadNotificationCount}
                    onUnreadCountChange={setUnreadNotificationCount}
                    iconSize={18}
                  />
                )}
                <button disabled={!hydrated} onClick={() => setShowProfile(true)} className="avatar-button" aria-label="Mở hồ sơ cá nhân">
                  <span className="avatar">{initials}</span>
                </button>
                <button
                  ref={mobileMenuButtonRef}
                  className="icon-button mobile-menu-btn"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Mở bảng điều khiển nhanh"
                  aria-expanded={mobileNavOpen}
                  aria-controls="mobile-dashboard-drawer"
                >
                  <Menu size={19} />
                </button>
              </div>
            </div>
            <div className="mobile-topbar-context">
              <h1 className="mobile-page-title">{titleForPath(pathname)}</h1>
              <p className="mobile-page-subtitle">{subtitleForPath(pathname, todaySnapshot, user)}</p>
            </div>
          </div>

          <header className="app-header desktop-only-header">
            <div className="app-header-copy">
              <h1 className="app-title">{titleForPath(pathname)}</h1>
              <p>{subtitleForPath(pathname, todaySnapshot, user)}</p>
            </div>
            <div className="header-actions">
              <span className="date-pill"><CalendarDays size={14} /> {dateLabel}</span>
              {!isTechnicalAdmin && (
                <NotificationsPopover
                  unreadCount={unreadNotificationCount}
                  onUnreadCountChange={setUnreadNotificationCount}
                  iconSize={17}
                />
              )}
              <button
                onClick={() => setShowProfile(true)}
                disabled={!hydrated}
                className="avatar-button focus:outline-none"
                title="Thông tin tài khoản"
              >
                <span className="avatar">{initials}</span>
              </button>
            </div>
          </header>

          {showMobileQuickPanel && (isTechnicalAdmin ? (
            <section className="mobile-quick-panel" aria-label="Tóm tắt quản trị hệ thống">
              <Link
                href="/app/admin/accounts"
                className="mobile-quick-stat"
                onClick={(e) => { if (adminSummaryError) { e.preventDefault(); reloadAdminSummary(); } }}
              >
                <span>Tài khoản hoạt động</span>
                <strong className={(adminSummary?.accounts?.active ?? 0) > 0 ? "text-[#2e7d32]" : ""}>
                  {adminSummaryLoading ? "Đang tải…" : adminSummaryError ? "Lỗi tải (chạm thử lại)" : `${adminSummary?.accounts?.active ?? 0} tài khoản`}
                </strong>
              </Link>
              <Link
                href="/app/admin/accounts"
                className="mobile-quick-stat"
                onClick={(e) => { if (adminSummaryError) { e.preventDefault(); reloadAdminSummary(); } }}
              >
                <span>Chờ kích hoạt</span>
                <strong className={(adminSummary?.accounts?.invited ?? 0) > 0 ? "text-[#d48b00]" : ""}>
                  {adminSummaryLoading ? "Đang tải…" : adminSummaryError ? "Lỗi tải (chạm thử lại)" : `${adminSummary?.accounts?.invited ?? 0} tài khoản`}
                </strong>
              </Link>
              <Link
                href="/app/admin/audit"
                className="mobile-quick-stat"
                onClick={(e) => { if (adminSummaryError) { e.preventDefault(); reloadAdminSummary(); } }}
              >
                <span>Thao tác lỗi</span>
                <strong className={(adminSummary?.failedOperations?.count ?? 0) > 0 ? "text-[#c75865]" : ""}>
                  {adminSummaryLoading ? "Đang tải…" : adminSummaryError ? "Lỗi tải (chạm thử lại)" : `${adminSummary?.failedOperations?.count ?? 0} lỗi`}
                </strong>
              </Link>
            </section>
          ) : isStaff ? (
            <section className="mobile-quick-panel" aria-label="Tóm tắt ca làm hôm nay">
              <Link href="/app/schedule" className="mobile-quick-stat">
                <span>Ca hôm nay</span>
                <strong>{todaySnapshot?.shift ? `${formatShellTime(todaySnapshot.shift.starts_at)}–${formatShellTime(todaySnapshot.shift.ends_at)}` : "Chưa có ca"}</strong>
              </Link>
              <Link href="/app/attendance" className="mobile-quick-stat">
                <span>Chấm công</span>
                <strong className={todaySnapshot?.attendance?.opened_at && !todaySnapshot?.attendance?.closed_at ? "text-[#2e7d32]" : ""}>
                  {todaySnapshot?.attendance?.closed_at ? "Đã ra ca" : todaySnapshot?.attendance?.opened_at ? "Đang trong ca" : "Chưa vào ca"}
                </strong>
              </Link>
              <Link href="/app/checklists" className="mobile-quick-stat">
                <span>Checklist</span>
                <strong>
                  {todaySnapshot
                    ? (() => {
                        const total = Number(todaySnapshot.checklist?.total ?? 0);
                        const done = Number(todaySnapshot.checklist?.done ?? 0);
                        if (total === 0) return "0 việc";
                        if (done < total) return `Còn ${total - done}/${total} việc`;
                        return `Xong ${done}/${total} việc`;
                      })()
                    : "Đang tải…"}
                </strong>
              </Link>
            </section>
          ) : (
            <section className="mobile-quick-panel" aria-label="Tóm tắt vận hành cửa hàng">
              <Link href="/app" className="mobile-quick-stat">
                <span>Đang trực quầy</span>
                <strong className={ownerMetrics?.activeStaff ? "text-[#2e7d32]" : ""}>
                  {ownerMetrics ? (ownerMetrics.activeStaff > 0 ? `${ownerMetrics.activeStaff} người trực` : "Chưa mở ca") : "Đang tải…"}
                </strong>
              </Link>
              <Link href="/app/attendance/review" className="mobile-quick-stat">
                <span>Chấm công</span>
                <strong className={ownerMetrics?.pendingExceptions ? "text-[#c75865]" : ""}>
                  {ownerMetrics ? (ownerMetrics.pendingExceptions > 0 ? `${ownerMetrics.pendingExceptions} ngoại lệ` : "0 ngoại lệ") : "Đang tải…"}
                </strong>
              </Link>
              <Link href="/app/checklists" className="mobile-quick-stat">
                <span>Checklist</span>
                <strong>
                  {ownerMetrics
                    ? (() => {
                        const total = Number(ownerMetrics.checklistTotal ?? 0);
                        const done = Number(ownerMetrics.checklistDone ?? 0);
                        if (total === 0) return "0 việc";
                        if (done < total) return `Còn ${total - done}/${total} việc`;
                        return `Xong ${done}/${total} việc`;
                      })()
                    : "Đang tải…"}
                </strong>
              </Link>
            </section>
          ))}

          <AnimatePresence>
            <motion.div
              key={pathname}
              className="app-content"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.button
              type="button"
              className="mobile-drawer-backdrop"
              aria-label="Đóng bảng điều khiển nhanh"
              onClick={() => setMobileNavOpen(false)}
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : undefined}
            />
            <motion.aside
              ref={mobileDrawerRef}
              id="mobile-dashboard-drawer"
              className="mobile-dashboard-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Bảng điều khiển nhanh"
              tabIndex={-1}
              initial={shouldReduceMotion ? false : { x: "100%" }}
              animate={shouldReduceMotion ? undefined : { x: 0 }}
              exit={shouldReduceMotion ? undefined : { x: "100%" }}
              transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 34 }}
            >
              <div className="mobile-drawer-header">
                <div>
                  <span className="drawer-eyebrow">LoopyCafe · {roleLabel(user.role)}</span>
                  <h2>{getPersonalizedGreeting(user).greeting}</h2>
                  <p>{getPersonalizedGreeting(user).submessage}</p>
                </div>
                <button ref={mobileDrawerCloseButtonRef} className="icon-button" onClick={() => setMobileNavOpen(false)} aria-label="Đóng bảng điều khiển">
                  <X size={19} />
                </button>
              </div>

              {isTechnicalAdmin ? (
                <div className="drawer-nav-groups"><section><h3>Quản trị hệ thống</h3><nav aria-label="Quản trị hệ thống">{systemAdminNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={isActive(pathname, href) ? "active" : ""} aria-current={isActive(pathname, href) ? "page" : undefined} onClick={() => setMobileNavOpen(false)}><Icon size={17} /><span>{label}</span></Link>)}</nav></section></div>
              ) : isStaff ? (
                <>
                  <div className="drawer-shift-summary">
                    <span className="mini-icon pink"><Coffee size={18} /></span>
                    <div>
                      <small>Ca làm hôm nay</small>
                      <strong>{todaySnapshot?.shift ? `${formatShellTime(todaySnapshot.shift.starts_at)} — ${formatShellTime(todaySnapshot.shift.ends_at)}` : "Hôm nay quán chưa có ca nào được xếp"}</strong>
                      <span>{todaySnapshot?.shift?.role_label ?? "Kiểm tra lịch để xem ca tiếp theo nhé ☕"}</span>
                    </div>
                  </div>

                  <div className="drawer-nav-groups">
                    <section>
                      <h3>Ca làm việc</h3>
                      <nav aria-label="Ca làm việc">
                        {staffShiftNav.map(({ href, label, icon: Icon }) => (
                          <Link
                            key={href}
                            href={href}
                            className={isActive(pathname, href, true) ? "active" : ""}
                            aria-current={isActive(pathname, href, true) ? "page" : undefined}
                            onClick={() => setMobileNavOpen(false)}
                          >
                            <Icon size={17} /><span>{label}</span>
                          </Link>
                        ))}
                      </nav>
                    </section>

                    <section>
                      <h3>Nhiệm vụ trong ca</h3>
                      <nav aria-label="Nhiệm vụ trong ca">
                        {staffTaskNav.map(({ href, label, icon: Icon }) => (
                          <Link
                            key={href}
                            href={href}
                            className={isActive(pathname, href, true) ? "active" : ""}
                            aria-current={isActive(pathname, href, true) ? "page" : undefined}
                            onClick={() => setMobileNavOpen(false)}
                          >
                            <Icon size={17} /><span>{label}</span>
                          </Link>
                        ))}
                      </nav>
                    </section>
                  </div>
                </>
              ) : (
                <>
                  <div className="drawer-shift-summary">
                    <span className="mini-icon mint"><LayoutDashboard size={18} /></span>
                    <div>
                      <small>Hôm nay ở quán</small>
                      <strong>{ownerMetrics ? (ownerMetrics.activeStaff > 0 ? `${ownerMetrics.activeStaff} bạn đang trực quầy` : "Chưa có ai vào ca") : "Đang cập nhật…"}</strong>
                      <span>{ownerMetrics && ownerMetrics.pendingExceptions > 0 ? `⚠️ Có ${ownerMetrics.pendingExceptions} việc cần bạn duyệt` : "Mọi việc ở quán đang rất êm ả nè ✨"}</span>
                    </div>
                  </div>

                  <div className="drawer-nav-groups" style={{ marginTop: 16 }}>
                    <section>
                      <h3>Vận hành hàng ngày</h3>
                      <nav aria-label="Vận hành hàng ngày">
                        {visibleDaily.map(({ href, label, icon: Icon }) => {
                          const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                          return (
                            <Link
                              key={href}
                              href={href}
                              className={isActive(pathname, href) ? "active" : ""}
                              aria-current={isActive(pathname, href) ? "page" : undefined}
                              onClick={() => setMobileNavOpen(false)}
                            >
                              <Icon size={17} className="shrink-0" />
                              <span className="flex-1 leading-snug">{label}</span>
                              {badge && <span className={`nav-item-badge ${badge.tone}`}>{badge.label}</span>}
                            </Link>
                          );
                        })}
                      </nav>
                    </section>

                    <section>
                      <h3>Quản trị & Đối soát</h3>
                      <nav aria-label="Quản trị">
                        {visibleManagement.map(({ href, label, icon: Icon }) => {
                          const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                          return (
                            <Link
                              key={href}
                              href={href}
                              className={isActive(pathname, href) ? "active" : ""}
                              aria-current={isActive(pathname, href) ? "page" : undefined}
                              onClick={() => setMobileNavOpen(false)}
                            >
                              <Icon size={17} className="shrink-0" />
                              <span className="flex-1 leading-snug">{label}</span>
                              {badge && <span className={`nav-item-badge ${badge.tone}`}>{badge.label}</span>}
                            </Link>
                          );
                        })}
                      </nav>
                    </section>

                    {visibleAdmin.length > 0 && (
                      <section>
                        <h3>Hệ thống & Cài đặt</h3>
                        <nav aria-label="Hệ thống">
                          {visibleAdmin.map(({ href, label, icon: Icon }) => {
                            const badge = getNavBadge(href, ownerMetrics, todaySnapshot, adminSummary, isStaff, isTechnicalAdmin);
                            return (
                              <Link
                                key={href}
                                href={href}
                                className={isActive(pathname, href) ? "active" : ""}
                                aria-current={isActive(pathname, href) ? "page" : undefined}
                                onClick={() => setMobileNavOpen(false)}
                              >
                                <Icon size={17} className="shrink-0" />
                                <span className="flex-1 leading-snug">{label}</span>
                                {badge && <span className={`nav-item-badge ${badge.tone}`}>{badge.label}</span>}
                              </Link>
                            );
                          })}
                        </nav>
                      </section>
                    )}
                  </div>
                </>
              )}

              <div className="drawer-account-actions">
                <button onClick={() => { setMobileNavOpen(false); setShowProfile(true); }}>
                  <UserRound size={17} /> Hồ sơ cá nhân & cài đặt
                </button>
                <button onClick={handleSignOut} className="danger-text"><LogOut size={17} /> Đăng xuất tài khoản</button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Profile & Sign Out Modal / Drawer */}
      {showProfile && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title" className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-[#eee3df] animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#eee3df]">
              <h3 id="profile-dialog-title" className="font-bold text-[#6f2939] text-lg flex items-center gap-2">
                <UserRound size={20} className="text-[#d96d83]" /> Thông tin tài khoản
              </h3>
              <button
                onClick={() => setShowProfile(false)}
                aria-label="Đóng thông tin tài khoản"
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-[#fff2f4] text-[#7b6f70] transition"
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
                  <span className="font-medium text-[#332a2b]">LoopyCafe Main Store</span>
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
        {visibleMobile.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href, isStaff);
          return (
            <Link
              key={href}
              href={href}
              className={`nav-item ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} /> {label}
            </Link>
          );
        })}
      </nav>
    </LoopyToastProvider>
  );
}

function titleForPath(pathname: string) {
  if (pathname === "/app/admin") return "Tổng quan quản trị";
  if (pathname.startsWith("/app/admin/roles")) return "Vai trò & quyền";
  if (pathname.startsWith("/app/admin/audit")) return "Nhật ký quản trị";
  if (pathname === "/app") return LOOPY_COPY.dashboardTitle;
  if (pathname.startsWith("/app/profile")) return "Hồ sơ cá nhân";
  if (pathname.startsWith("/app/today")) return "Ca làm của bạn hôm nay";
  if (pathname.startsWith("/app/schedule")) return LOOPY_COPY.scheduleNav;
  if (pathname.startsWith("/app/attendance/review")) return LOOPY_COPY.attendanceReviewNav;
  if (pathname.startsWith("/app/attendance")) return LOOPY_COPY.attendanceNav;
  if (pathname.startsWith("/app/checklists")) return LOOPY_COPY.checklistsNav;
  if (pathname.startsWith("/app/issues")) return LOOPY_COPY.issuesNav;
  if (pathname.startsWith("/app/handovers")) return LOOPY_COPY.handoversNav;
  if (pathname.startsWith("/app/requests")) return LOOPY_COPY.requestsNav;
  if (pathname.startsWith("/app/team")) return LOOPY_COPY.teamNav;
  if (pathname.startsWith("/app/orders")) return LOOPY_COPY.ordersNav;
  if (pathname.startsWith("/app/admin/accounts")) return "Quản trị tài khoản";
  if (pathname.startsWith("/app/reports")) return LOOPY_COPY.reportsNav;
  if (pathname.startsWith("/app/settings")) return LOOPY_COPY.settingsNav;
  if (pathname.startsWith("/app/notifications")) return LOOPY_COPY.notificationsNav;
  if (pathname.startsWith("/app/audit")) return "Lịch sử hoạt động";
  return "LoopyCafe";
}

function subtitleForPath(pathname: string, today: TodaySnapshot | null, user?: LoopiUser) {
  const accountName = user ? getUserAccountName(user.displayName, user.email) : "bạn";
  if (pathname === "/app") {
    if (user?.role === "owner" || user?.role === "manager") {
      return accountName !== "bạn"
        ? `Cùng xem nhịp điệu quán hôm nay nhé, ${accountName} ơi! ☕`
        : "Cùng xem nhịp điệu quán hôm nay nhé ☕";
    }
    return "Cùng Loopy cập nhật nhịp điệu quán hôm nay nhé ☕";
  }
  if (pathname.startsWith("/app/today")) {
    if (today?.attendance?.opened_at && !today?.attendance?.closed_at) {
      return `Bạn đang trong ca trực (${formatShellTime(today.attendance.opened_at)}), cố lên nhé! ☕`;
    }
    return today?.shift
      ? `Ca làm: ${formatShellTime(today.shift.starts_at)} — ${formatShellTime(today.shift.ends_at)} · Chúc bạn một ca thật vui!`
      : "Hôm nay quán chưa có ca nào được xếp cho bạn nè, thong thả nghỉ ngơi nhé 🌸";
  }
  if (pathname.startsWith("/app/schedule")) return "Lịch trực chu đáo cho từng ngày trong tuần";
  if (pathname.startsWith("/app/attendance/review")) return "Đối soát giờ vào ra và đồng hành cùng các bạn nhân viên";
  if (pathname === "/app/attendance") {
    return today?.attendance?.opened_at
      ? (today?.attendance?.closed_at ? "Ca hôm nay đã hoàn tất, nghỉ ngơi lấy lại sức nhé! 👋" : "Bạn đang trong ca làm việc, nhớ check-out khi xong nhé!")
      : "Chụp một bức ảnh thật tươi để bắt đầu ca nhé 📸";
  }
  if (pathname.startsWith("/app/checklists")) {
    if (user?.role === "owner" || user?.role === "manager") {
      return "Theo dõi tiến độ mở ca và kiểm tra hoàn thành của nhân viên";
    }
    const total = Number(today?.checklist?.total ?? 0);
    const done = Number(today?.checklist?.done ?? 0);
    return today
      ? (total === 0
          ? "Hôm nay chưa có checklist được giao, thảnh thơi nhé ✨"
          : done === total && total > 0
          ? "Tuyệt vời quá! Đã hoàn thành hết mọi công việc hôm nay rồi nè ✨"
          : `Đã hoàn thành ${done}/${total} việc trong ca`)
      : "Từng bước chăm chút để quán luôn sạch xinh và chu đáo";
  }
  if (pathname.startsWith("/app/team")) return "Gia đình LoopyCafe cùng nhau đồng hành mỗi ngày";
  if (pathname.startsWith("/app/issues")) return "Có gì cần khắc phục cứ báo ngay để mọi người cùng hỗ trợ nhé";
  if (pathname.startsWith("/app/handovers")) return "Truyền lửa và trao lại quầy gọn gàng cho ca tiếp theo";
  if (pathname.startsWith("/app/requests")) return "Nghỉ phép, đổi ca hay sửa giờ công thuận tiện và rõ ràng";
  if (pathname.startsWith("/app/orders")) return "Món nước yêu thương đang được gửi gắm tới từng vị khách";
  if (pathname.startsWith("/app/reports")) return "Minh bạch giờ làm, tính đúng từng giọt mồ hôi của các bạn";
  if (pathname.startsWith("/app/notifications")) return "Cập nhật ca làm và vận hành theo thời gian thực";
  return "LoopyCafe · Cửa hàng chính";
}

function subscribeHydration() {
  return () => {};
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
  if (role === "team_lead") return "Trưởng ca";
  return "Nhân viên";
}
