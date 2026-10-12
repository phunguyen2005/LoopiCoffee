"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

export type ApiState = "loading" | "ready" | "error";
export type ShiftPreset = "morning" | "evening" | "full" | "custom";

export type ScheduleShift = {
  id: string;
  employee_name: string;
  employee_email: string;
  starts_at: string;
  ends_at: string;
  role_label: string;
  is_shift_lead: number;
  status: string;
  revision: number;
  approved_leave_request_id: string | null;
};

export const DAY_CHIP_LABELS = [
  { key: 0, label: "T2" },
  { key: 1, label: "T3" },
  { key: 2, label: "T4" },
  { key: 3, label: "T5" },
  { key: 4, label: "T6" },
  { key: 5, label: "T7" },
  { key: 6, label: "CN" },
] as const;

export function ViewHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="card-title">{title}</h2>
      <p className="card-subtitle">{subtitle}</p>
    </div>
  );
}

export function InlineError({ text }: { text: string }) {
  return (
    <div className="attention-card" style={{ marginTop: 14 }}>
      <span className="badge danger">
        <AlertCircle size={11} /> Cần thử lại
      </span>
      <p style={{ margin: "9px 0 0" }}>{text}</p>
    </div>
  );
}

export function InputField({
  id,
  label,
  value,
  onChange,
  full,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  full?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: React.ComponentType<{ size?: number }>;
  tone: string;
  value: string;
  label: string;
}) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}>
        <Icon size={17} />
      </span>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

export { readJson } from "@/platform/http/client";

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const storeDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function storeDateKey(value: string | Date) {
  const parts = storeDateFormatter.formatToParts(typeof value === "string" ? new Date(value) : value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addStoreDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function startOfStoreWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const offset = date.getUTCDay() === 0 ? -6 : 1 - date.getUTCDay();
  return addStoreDays(dateKey, offset);
}

export function storeDateTime(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00+07:00`);
}

export function formatWorkedMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}p`;
}

export function initials(value: string) {
  return value
    .split(" ")
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function severityLabel(value: string) {
  if (value === "high") return "Cao";
  if (value === "medium") return "Vừa";
  return "Thấp";
}

export function statusLabel(value: string) {
  if (value === "acknowledged") return "Đã tiếp nhận";
  if (value === "resolved") return "Đã xử lý";
  if (value === "closed") return "Đã đóng";
  return "Mở";
}

export function roleLabel(value: string) {
  if (value === "owner") return "Chủ cửa hàng";
  if (value === "manager") return "Quản lý";
  if (value === "team_lead") return "Trưởng nhóm";
  return "Nhân viên";
}

export function getShiftStatus(startsAt: string, endsAt: string) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now >= start && now <= end) return { label: "Đang diễn ra", badge: "success", tone: "is-live" };
  if (now < start) return { label: "Sắp tới", badge: "warning", tone: "is-upcoming" };
  return { label: "Đã hoàn thành", badge: "neutral", tone: "is-done" };
}

export function formatDateVN(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(date);
}
