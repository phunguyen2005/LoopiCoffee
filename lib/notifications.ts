import {
  Bell,
  CalendarDays,
  Clock3,
  UserRound,
  TriangleAlert,
  FileText,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

export type LoopiNotificationItem = {
  id: string;
  type?: string | null;
  title: string;
  entity_href: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationMeta = {
  icon: LucideIcon;
  badgeLabel: string;
  iconBgClass: string;
  iconColorClass: string;
  borderClass: string;
};

export function getNotificationMeta(type?: string | null): NotificationMeta {
  switch (type) {
    case "shift_published":
    case "shift_created":
      return {
        icon: CalendarDays,
        badgeLabel: "Ca làm việc",
        iconBgClass: "bg-blue-50 text-blue-700",
        iconColorClass: "text-blue-600",
        borderClass: "border-blue-100",
      };
    case "shift_swapped":
      return {
        icon: Clock3,
        badgeLabel: "Đổi ca",
        iconBgClass: "bg-amber-50 text-amber-700",
        iconColorClass: "text-amber-600",
        borderClass: "border-amber-100",
      };
    case "request_created":
    case "request_decided":
    case "request_withdrawn":
    case "leave_approved":
    case "leave_rejected":
      return {
        icon: UserRound,
        badgeLabel: "Yêu cầu",
        iconBgClass: "bg-emerald-50 text-emerald-700",
        iconColorClass: "text-emerald-600",
        borderClass: "border-emerald-100",
      };
    case "incident":
    case "issue":
      return {
        icon: TriangleAlert,
        badgeLabel: "Sự cố",
        iconBgClass: "bg-rose-50 text-rose-700",
        iconColorClass: "text-rose-600",
        borderClass: "border-rose-100",
      };
    case "attendance_reviewed":
    case "attendance_adjusted":
      return {
        icon: CheckCircle2,
        badgeLabel: "Chấm công",
        iconBgClass: "bg-teal-50 text-teal-700",
        iconColorClass: "text-teal-600",
        borderClass: "border-teal-100",
      };
    default:
      return {
        icon: Bell,
        badgeLabel: "Hệ thống",
        iconBgClass: "bg-[#fbf2f4] text-[#6f2939]",
        iconColorClass: "text-[#6f2939]",
        borderClass: "border-[#f3d9df]",
      };
  }
}

export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (isNaN(date.getTime())) return "";
    if (diffMs < 0 || diffMs < 45000) return "Vừa xong";

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} phút trước`;

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} giờ trước`;

    const diffDays = Math.floor(diffHour / 24);
    if (diffDays === 1) {
      const timeStr = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
      return `Hôm qua lúc ${timeStr}`;
    }
    if (diffDays < 7) {
      return `${diffDays} ngày trước`;
    }

    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

export function formatFullDateTime(dateString: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}
