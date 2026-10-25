"use client";

import React from "react";
import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";

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
  has_attendance?: number;
  has_payroll_lock?: number;
  cover_for_shift_id?: string | null;
  cover_employee_name?: string | null;
  cover_employee_email?: string | null;
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

export function AsyncStatePanel({
  state,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  compact = false,
}: {
  state: "loading" | "empty" | "error";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  compact?: boolean;
}) {
  const Icon = state === "loading" ? LoaderCircle : state === "error" ? AlertCircle : Inbox;
  return (
    <div
      className={`async-state-panel ${compact ? "compact" : ""} ${state}`}
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
    >
      <Icon className={state === "loading" ? "async-state-spinner" : ""} size={compact ? 22 : 30} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && actionHref && (
        <a className="button button-compact" href={actionHref}>{actionLabel}</a>
      )}
      {actionLabel && onAction && !actionHref && (
        <button className="button-secondary button-compact" type="button" onClick={onAction}>
          {state === "error" && <RefreshCw size={15} aria-hidden="true" />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function MetricSkeleton({ label }: { label: string }) {
  return (
    <article className="metric-card metric-card-skeleton" aria-label={`Đang tải ${label}`} aria-busy="true">
      <span className="skeleton-block skeleton-icon" />
      <span className="skeleton-block skeleton-value" />
      <span className="skeleton-block skeleton-label" />
    </article>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="state-list-skeleton" role="status" aria-label="Đang tải dữ liệu" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="state-list-skeleton-row" key={index}>
          <span className="skeleton-block skeleton-avatar" />
          <span className="state-list-skeleton-copy">
            <span className="skeleton-block" />
            <span className="skeleton-block" />
          </span>
        </div>
      ))}
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
  type = "text",
  min,
  max,
  step,
  onlyNumbers = false,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  full?: boolean;
  placeholder?: string;
  type?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  onlyNumbers?: boolean;
  autoComplete?: string;
}) {
  const isNumeric = type === "number" || onlyNumbers;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isNumeric) return;
    // Allow keyboard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Meta+...)
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    // Block scientific notation / signs / decimal point
    if (["e", "E", "+", "-", "."].includes(event.key)) {
      event.preventDefault();
      return;
    }
    // If a single printable character is pressed and is not a digit 0-9, prevent it
    if (event.key.length === 1 && !/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    if (!isNumeric) return;
    const pasted = event.clipboardData.getData("text");
    if (!pasted) return;
    if (/\D/.test(pasted)) {
      event.preventDefault();
      const digitsOnly = pasted.replace(/\D/g, "");
      if (digitsOnly) {
        const input = event.currentTarget;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        const nextValue = value.slice(0, start) + digitsOnly + value.slice(end);
        onChange(nextValue);
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLInputElement>) => {
    if (!isNumeric) return;
    event.preventDefault();
    const dropped = event.dataTransfer.getData("text");
    const digitsOnly = dropped.replace(/\D/g, "");
    if (digitsOnly) {
      const input = event.currentTarget;
      const start = input.selectionStart ?? 0;
      const end = input.selectionEnd ?? 0;
      const nextValue = value.slice(0, start) + digitsOnly + value.slice(end);
      onChange(nextValue);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (isNumeric) {
      const sanitized = raw.replace(/\D/g, "");
      onChange(sanitized);
    } else {
      onChange(raw);
    }
  };

  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        inputMode={isNumeric ? "numeric" : undefined}
        pattern={isNumeric ? "[0-9]*" : undefined}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onChange={handleChange}
        autoComplete={autoComplete}
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
  sublabel,
}: {
  icon: React.ComponentType<{ size?: number }>;
  tone: string;
  value: string;
  label: string;
  sublabel?: string;
}) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}>
        <Icon size={17} />
      </span>
      <div className="metric-card-body">
        <strong>{value}</strong>
        <span>{label}</span>
        {sublabel && <small className="metric-card-sublabel">{sublabel}</small>}
      </div>
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

export function formatShiftRange(startsAt: string, endsAt: string) {
  const startDate = storeDateKey(startsAt);
  const endDate = storeDateKey(endsAt);
  const timeRange = `${formatTime(startsAt)} — ${formatTime(endsAt)}`;
  if (startDate === endDate) return timeRange;

  const endLabel = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(endsAt));
  return `${timeRange} ngày ${endLabel}`;
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

export function getShiftStatus(startsAt: string, endsAt: string, options?: { approvedLeaveRequestId?: string | null }) {
  if (options?.approvedLeaveRequestId) return { label: "Nghỉ đã duyệt", badge: "warning", tone: "is-leave" };
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
