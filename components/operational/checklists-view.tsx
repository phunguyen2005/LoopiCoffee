"use client";

import React, { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Clock3,
  Plus,
  CheckCircle2,
  Calendar,
  Layers,
  History,
  X,
  Search,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { MotionLoopySticker } from "../loopy-sticker";
import { useLoopyToast } from "../loopy-toast";
import { CelebrationConfetti, TaskSparkleBurst } from "../confetti-sparkles";
import {
  ApiState,
  AsyncStatePanel,
  ListSkeleton,
  ViewHeader,
  formatDateTime,
  formatTime,
  readJson,
  storeDateKey,
  addStoreDays,
} from "./shared";
import type { ChecklistHistoryRecord } from "@/app/api/checklists/history/route";

export type ChecklistItem = {
  id: string;
  label: string;
  assignee: string;
  required: number;
  completed: number;
  routine_type: "daily_routine" | "shift_routine";
  shift_id?: string | null;
  responsible_role?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  shift_employee_email?: string | null;
  shift_employee_name?: string | null;
  shift_role_label?: string | null;
  shift_starts_at?: string | null;
  shift_ends_at?: string | null;
};

export type ShiftSummary = {
  id: string;
  starts_at: string;
  ends_at: string;
  role_label: string;
  employee_name: string;
  employee_email?: string;
};

export function PersistentChecklistsView({
  canManage = false,
  userRole = "employee",
  userEmail,
  userName,
}: {
  canManage?: boolean;
  userRole?: string;
  userEmail?: string;
  userName?: string;
}) {
  const { showLoopyToast, playChime } = useLoopyToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [state, setState] = useState<ApiState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAssignee, setNewAssignee] = useState("Toàn bộ ca làm");
  const [routineType, setRoutineType] = useState<"daily_routine" | "shift_routine">("daily_routine");
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [activeSparkleId, setActiveSparkleId] = useState<string | null>(null);
  const [triggerCelebration, setTriggerCelebration] = useState(false);
  const [pending, setPending] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [carryOverOpenId, setCarryOverOpenId] = useState<string | null>(null);
  const [carryOverTarget, setCarryOverTarget] = useState<string>("daily");
  const [filterMode, setFilterMode] = useState<"all" | "incomplete" | "completed">("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  // History modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyDate, setHistoryDate] = useState(() => storeDateKey(new Date()));
  const [historyStatus, setHistoryStatus] = useState<"all" | "completed" | "incomplete">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyRecords, setHistoryRecords] = useState<ChecklistHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = React.useCallback(async (date: string, status: string, search: string) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/checklists/history?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Không thể tải lịch sử checklist.");
      const data = await res.json() as { history: ChecklistHistoryRecord[] };
      setHistoryRecords(data.history ?? []);
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : "Lỗi khi tải lịch sử checklist.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showHistoryModal) {
      const timer = window.setTimeout(() => {
        void loadHistory(historyDate, historyStatus, historySearch);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [showHistoryModal, historyDate, historyStatus, historySearch, loadHistory]);

  const isOwnerOrManager = canManage || userRole === "owner" || userRole === "manager";

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/checklists", { cache: "no-store" })
      .then(readJson<{ items: ChecklistItem[]; shifts: ShiftSummary[]; currentShift?: { id: string } | null }>)
      .then((payload) => {
        setItems(payload.items ?? []);
        setShifts(payload.shifts ?? []);
        setSelectedShiftId(payload.currentShift?.id ?? payload.shifts?.[0]?.id ?? "");
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  async function refresh() {
    try {
      const payload = await readJson<{ items: ChecklistItem[]; shifts: ShiftSummary[]; currentShift?: { id: string } | null }>(
        await fetch("/api/checklists", { cache: "no-store" })
      );
      setItems(payload.items ?? []);
      setShifts(payload.shifts ?? []);
      setSelectedShiftId((current) => current || payload.currentShift?.id || payload.shifts?.[0]?.id || "");
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function createChecklist(event: React.FormEvent) {
    event.preventDefault();
    if (!newLabel.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/checklists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: newLabel,
          assignee: routineType === "shift_routine" ? undefined : newAssignee,
          required: isRequired,
          routineType,
          shiftId: routineType === "shift_routine" ? selectedShiftId : undefined,
        }),
      });
      await readJson(response);
      setNewLabel("");
      setShowForm(false);
      showLoopyToast("Đã thêm công việc mới!", { message: newLabel, mood: "checklist", type: "success" });
      await refresh();
      window.dispatchEvent(new CustomEvent("loopi:checklist-updated"));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Chưa lưu được công việc. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  async function toggle(item: ChecklistItem) {
    if (pending || togglingId) return;
    const shiftEnded = item.routine_type === "shift_routine"
      && (!item.shift_ends_at || new Date(item.shift_ends_at).getTime() <= currentTimeMs);
    if (shiftEnded) {
      setError("Ca làm đã kết thúc. Checklist chỉ được xem lại trong lịch sử và không thể thay đổi.");
      return;
    }
    setTogglingId(item.id);
    setError(null);
    const nextCompleted = !item.completed;
    try {
      const res = await readJson<{
        updated: boolean;
        completed: boolean;
        completedAt?: string | null;
        completedBy?: string | null;
        completedByName?: string | null;
        businessDate?: string;
      }>(
        await fetch("/api/checklists", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: item.id, completed: nextCompleted }),
        })
      );

      if (nextCompleted) {
        setActiveSparkleId(item.id);
        playChime("success");
      } else {
        playChime("pop");
      }

      const nowIso = new Date().toISOString();
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                completed: nextCompleted ? 1 : 0,
                completed_at: nextCompleted ? (res.completedAt ?? nowIso) : null,
                completed_by: nextCompleted ? (res.completedBy ?? userEmail ?? null) : null,
                completed_by_name: nextCompleted
                  ? (res.completedByName ?? userName ?? userEmail ?? "Nhân viên")
                  : null,
              }
            : entry
        )
      );

      const newDoneCount = items.filter((i) => (i.id === item.id ? nextCompleted : i.completed)).length;

      if (nextCompleted) {
        if (items.length > 0 && newDoneCount === items.length) {
          setTriggerCelebration(true);
          showLoopyToast("Xuất sắc 100%! 🎉", {
            message: "Tất cả công việc hôm nay đã hoàn thành xuất sắc!",
            mood: "cheer",
            type: "success",
          });
        } else {
          showLoopyToast("Hoàn thành!", {
            message: `Loopy ghi nhận: ${item.label}`,
            mood: "success",
            type: "success",
          });
        }
      }
      window.dispatchEvent(new CustomEvent("loopi:checklist-updated"));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Chưa lưu được trạng thái checklist. Vui lòng thử lại.");
    } finally {
      setTogglingId(null);
    }
  }

  async function resolveOverdueItem(
    item: ChecklistItem,
    options: {
      action: "complete_late" | "carry_over" | "dismiss";
      targetRoutineType?: "daily_routine" | "shift_routine";
      targetShiftId?: string;
      assignee?: string;
    },
  ) {
    if (pending || togglingId) return;
    setTogglingId(item.id);
    setError(null);
    try {
      await readJson(
        await fetch("/api/checklists", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            ...options,
          }),
        }),
      );
      if (options.action === "complete_late") {
        playChime("success");
        showLoopyToast("Đã hoàn thành bù!", {
          message: `Đã ghi nhận hoàn thành cho "${item.label}"`,
          mood: "success",
          type: "success",
        });
      } else if (options.action === "carry_over") {
        playChime("success");
        showLoopyToast("Đã chuyển sang hôm nay!", {
          message: `"${item.label}" đã được đưa vào danh sách việc cần làm hôm nay`,
          mood: "checklist",
          type: "success",
        });
        setCarryOverOpenId(null);
      } else if (options.action === "dismiss") {
        playChime("pop");
        showLoopyToast("Đã đóng việc tồn đọng", {
          message: `Đã bỏ qua "${item.label}" và ghi nhật ký hoạt động`,
          mood: "checklist",
          type: "info",
        });
      }
      await refresh();
      window.dispatchEvent(new CustomEvent("loopi:checklist-updated"));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Chưa xử lý được công việc quá hạn. Vui lòng thử lại.");
    } finally {
      setTogglingId(null);
    }
  }

  const isOverdueShiftItem = React.useCallback(
    (item: ChecklistItem) =>
      item.routine_type === "shift_routine" &&
      !item.completed &&
      (!item.shift_ends_at || new Date(item.shift_ends_at).getTime() <= currentTimeMs),
    [currentTimeMs],
  );

  // Separate overdue items from past ended shifts vs active items for today
  const overdueShiftItems = useMemo(
    () => items.filter((item) => isOverdueShiftItem(item)),
    [items, isOverdueShiftItem],
  );
  const todayItems = useMemo(
    () => items.filter((item) => !isOverdueShiftItem(item)),
    [items, isOverdueShiftItem],
  );

  // Filter today's items by scope (all vs daily vs specific shift)
  const scopedItems = useMemo(() => {
    if (scopeFilter === "daily") {
      return todayItems.filter((item) => item.routine_type !== "shift_routine");
    }
    if (scopeFilter !== "all") {
      return todayItems.filter((item) => item.shift_id === scopeFilter);
    }
    return todayItems;
  }, [todayItems, scopeFilter]);

  // Filter scoped items by completion status
  const filteredItems = useMemo(() => {
    if (filterMode === "incomplete") {
      return scopedItems.filter((item) => !item.completed);
    }
    if (filterMode === "completed") {
      return scopedItems.filter((item) => Boolean(item.completed));
    }
    return scopedItems;
  }, [scopedItems, filterMode]);

  // Overall statistics for TODAY's active scope (excluding overdue past-shift items)
  const done = todayItems.filter((item) => item.completed).length;
  const requiredIncompleteCount = todayItems.filter((item) => item.required && !item.completed).length;
  const isAllDone = todayItems.length > 0 && done === todayItems.length && overdueShiftItems.length === 0;
  const overallPercentage = todayItems.length > 0 ? Math.round((done / todayItems.length) * 100) : 0;

  // Filter counts
  const scopedDoneCount = scopedItems.filter((item) => item.completed).length;
  const scopedIncompleteCount = scopedItems.length - scopedDoneCount;

  // Active/upcoming shifts for today's breakdown
  const allShiftsForBreakdown = useMemo(() => {
    const map = new Map<string, ShiftSummary>();
    for (const shift of shifts) {
      map.set(shift.id, shift);
    }
    for (const item of todayItems) {
      if (item.routine_type === "shift_routine" && item.shift_id && !map.has(item.shift_id)) {
        map.set(item.shift_id, {
          id: item.shift_id,
          starts_at: item.shift_starts_at || "",
          ends_at: item.shift_ends_at || "",
          role_label: item.shift_role_label || item.assignee || "Ca làm việc",
          employee_name: item.shift_employee_name || item.assignee || "Nhân sự ca",
          employee_email: item.shift_employee_email || undefined,
        });
      }
    }
    return Array.from(map.values());
  }, [shifts, todayItems]);

  // Shift progress breakdowns for today
  const shiftProgressStats = useMemo(() => {
    return allShiftsForBreakdown.map((shift) => {
      const shiftTasks = todayItems.filter((item) => item.shift_id === shift.id);
      const shiftDone = shiftTasks.filter((item) => item.completed).length;
      const shiftPercent = shiftTasks.length > 0 ? Math.round((shiftDone / shiftTasks.length) * 100) : 0;
      return {
        shift,
        total: shiftTasks.length,
        done: shiftDone,
        percent: shiftPercent,
        isComplete: shiftTasks.length > 0 && shiftDone === shiftTasks.length,
      };
    });
  }, [allShiftsForBreakdown, todayItems]);

  const totalDailyItems = todayItems.filter((item) => item.routine_type !== "shift_routine");
  const doneDailyItems = totalDailyItems.filter((item) => item.completed).length;

  const sortChecklistItems = (list: ChecklistItem[]) =>
    [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.required !== b.required) return b.required - a.required;
      return 0;
    });

  const shiftItems = sortChecklistItems(filteredItems.filter((item) => item.routine_type === "shift_routine"));
  const dailyItems = sortChecklistItems(filteredItems.filter((item) => item.routine_type !== "shift_routine"));

  const todayDateKey = storeDateKey(new Date(currentTimeMs));

  const formatShiftScopeLabel = (item: ChecklistItem) => {
    const role = item.shift_role_label || item.assignee || "Ca cụ thể";
    const emp = item.shift_employee_name || item.assignee || "Nhân sự ca";
    const timeRange =
      item.shift_starts_at && item.shift_ends_at
        ? `${formatTime(item.shift_starts_at)} — ${formatTime(item.shift_ends_at)}`
        : item.shift_starts_at
        ? formatTime(item.shift_starts_at)
        : "";
    const shiftDate = item.shift_starts_at ? storeDateKey(new Date(item.shift_starts_at)) : "";
    const dateSuffix = shiftDate && shiftDate !== todayDateKey ? ` (${shiftDate})` : "";
    return {
      badgeText: `Phạm vi: Ca cụ thể · ${role}${dateSuffix}`,
      detailText: `Nhân sự ca: ${emp}${timeRange ? ` · Khung giờ: ${timeRange}` : ""}`,
    };
  };

  const formatDailyScopeLabel = (assignee: string) => {
    const isWholeDay =
      !assignee ||
      assignee === "Toàn bộ ca làm" ||
      assignee === "Toàn bộ ngày vận hành" ||
      assignee === "Quầy";
    return {
      badgeText: isWholeDay
        ? "Phạm vi: Toàn bộ ca làm (Việc chung)"
        : `Phạm vi: Toàn ca làm · ${assignee}`,
      detailText: isWholeDay
        ? "Áp dụng xuyên suốt toàn bộ ca làm trong ngày kinh doanh"
        : `Áp dụng cho giai đoạn ${assignee} trong ngày kinh doanh`,
    };
  };

  const renderChecklistRow = (item: ChecklistItem) => {
    const isToggling = togglingId === item.id;
    const isShiftEnded = item.routine_type === "shift_routine"
      && (!item.shift_ends_at || new Date(item.shift_ends_at).getTime() <= currentTimeMs);
    const scopeInfo =
      item.routine_type === "shift_routine"
        ? formatShiftScopeLabel(item)
        : formatDailyScopeLabel(item.assignee);
    return (
      <motion.button
        key={item.id}
        type="button"
        whileHover={isShiftEnded ? undefined : { scale: 1.004 }}
        whileTap={isShiftEnded ? undefined : { scale: 0.985 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="list-row operation-row-button checklist-task relative"
        onClick={() => toggle(item)}
        disabled={Boolean(togglingId) || isShiftEnded}
        aria-pressed={Boolean(item.completed)}
        style={{
          minHeight: 68,
          padding: "12px 16px",
          borderRadius: 14,
          marginBottom: 10,
          border: item.completed
            ? "1px solid #cce7db"
            : item.required
            ? "1px solid #efd2d8"
            : "1px solid var(--line)",
          background: item.completed ? "#f6fcf9" : "var(--paper)",
          opacity: isToggling ? 0.72 : isShiftEnded ? 0.78 : 1,
          cursor: isShiftEnded ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
        }}
      >
        <TaskSparkleBurst active={activeSparkleId === item.id} onComplete={() => setActiveSparkleId(null)} />
        <div className="person" style={{ flex: 1, minWidth: 0 }}>
          <span className={`mini-icon ${item.completed ? "mint" : "pink"}`} style={{ flexShrink: 0 }}>
            {item.completed ? <Check size={16} /> : <Clock3 size={16} />}
          </span>
          <span className="person-copy" style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
            <strong
              style={{
                textDecoration: item.completed ? "line-through" : "none",
                opacity: item.completed ? 0.75 : 1,
                fontSize: "0.92rem",
                display: "block",
                wordBreak: "break-word",
              }}
            >
              {item.label.replace(/<[^>]*>/g, "").replace(/thi\?u/gi, "thiếu").replace(/gi\?y/gi, "giấy").replace(/\?/g, "")}
            </strong>

            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  background: item.routine_type === "shift_routine" ? "#fff0f3" : "#f3ede6",
                  color: item.routine_type === "shift_routine" ? "var(--burgundy-dark)" : "var(--coffee)",
                  border: item.routine_type === "shift_routine" ? "1px solid #f4cfd7" : "1px solid #e4d8cc",
                }}
              >
                {scopeInfo.badgeText}
              </span>
              {item.required ? (
                <span style={{ fontSize: "0.72rem", color: "var(--burgundy)", fontWeight: 700 }}>
                  · Bắt buộc *
                </span>
              ) : (
                <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>· Tùy chọn</span>
              )}
            </div>

            {item.completed ? (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 6,
                    padding: "4px 9px",
                    borderRadius: 8,
                    background: "#eaf6ee",
                    border: "1px solid #c2e6d0",
                    color: "#0d6840",
                    fontSize: "0.76rem",
                    fontWeight: 600,
                    width: "fit-content",
                  }}
                >
                  <CheckCircle2 size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <span>
                    Hoàn thành bởi: <strong>{item.completed_by_name || item.completed_by || "Nhân viên"}</strong>
                  </span>
                  {item.completed_at && (
                    <span style={{ color: "#2d7a56", fontWeight: 500, fontSize: "0.72rem" }}>
                      lúc {formatDateTime(item.completed_at)}
                    </span>
                  )}
                </div>
                <small style={{ fontSize: "0.73rem", color: "var(--muted)" }}>
                  {scopeInfo.detailText}
                </small>
              </div>
            ) : (
              <div style={{ marginTop: 4 }}>
                <small style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                  {scopeInfo.detailText}
                </small>
              </div>
            )}
          </span>
        </div>

        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <span
            className={`badge ${item.completed ? "success" : item.required ? "warning" : "neutral"}`}
            style={{ fontSize: "0.74rem", padding: "4px 9px", whiteSpace: "nowrap" }}
          >
            {isToggling
              ? "Đang lưu…"
              : item.completed
              ? "✓ Đã xong"
              : isShiftEnded
              ? "Chưa xong (Ca đã qua)"
              : item.required
              ? "Chưa xong *"
              : "Chạm xong"}
          </span>
        </div>
      </motion.button>
    );
  };

  return (
    <div className="page-grid checklist-page relative">
      <CelebrationConfetti active={triggerCelebration} />

      <section className="card">
        <div className="section-row checklist-heading" style={{ marginBottom: 16 }}>
          <ViewHeader
            title={isOwnerOrManager ? "Việc cần làm hôm nay của quán" : "Việc cần làm hôm nay"}
            subtitle={
              state !== "ready"
                ? "Chưa xác nhận tiến độ hôm nay"
                : todayItems.length > 0
                ? `${done}/${todayItems.length} công việc trong phạm vi ca hôm nay (${overallPercentage}%)${
                    overdueShiftItems.length > 0 ? ` · ${overdueShiftItems.length} việc tồn từ ca đã qua` : ""
                  }`
                : overdueShiftItems.length > 0
                ? `Hôm nay chưa có đầu việc mới · Có ${overdueShiftItems.length} việc tồn đọng từ ca đã qua cần xử lý`
                : "0/0 công việc trong phạm vi ca hiện tại (0%)"
            }
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="button-secondary button-compact"
              style={{ minHeight: 44, fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => setShowHistoryModal(true)}
              title="Xem lịch sử hoàn thành checklist theo ngày"
            >
              <History size={15} /> Lịch sử checklist
            </button>
            {canManage && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="button button-compact"
                style={{ minHeight: 44 }}
                onClick={() => setShowForm((v) => !v)}
              >
                <Plus size={15} /> {showForm ? "Đóng biểu mẫu" : "Thêm công việc"}
              </motion.button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="report-error" style={{ marginBottom: 14 }}>
            <span>{error}</span>
          </div>
        )}

        {pending && <p role="status" className="operation-message">Đang lưu công việc mới…</p>}

        {showForm && canManage && (
          <form className="attention-card operation-form" onSubmit={createChecklist} style={{ marginBottom: 20 }}>
            <div className="field full">
              <label htmlFor="checklist-label">Tên công việc *</label>
              <input
                id="checklist-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="VD: Kiểm tra phễu cà phê, lau máy espresso..."
                required
              />
            </div>
            <div className="field">
              <label htmlFor="checklist-routine-type">Phạm vi checklist</label>
              <select
                id="checklist-routine-type"
                value={routineType}
                onChange={(e) => setRoutineType(e.target.value as "daily_routine" | "shift_routine")}
              >
                <option value="daily_routine">Toàn bộ ca làm / Theo ngày kinh doanh (Việc chung)</option>
                <option value="shift_routine">Theo một ca làm cụ thể (Gắn ca & nhân sự)</option>
              </select>
            </div>
            {routineType === "shift_routine" ? (
              <div className="field">
                <label htmlFor="checklist-shift">Ca làm cụ thể *</label>
                <select
                  id="checklist-shift"
                  required
                  value={selectedShiftId}
                  onChange={(e) => setSelectedShiftId(e.target.value)}
                >
                  <option value="" disabled>Chọn ca</option>
                  {allShiftsForBreakdown.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.employee_name} · {shift.role_label} · {shift.starts_at ? new Date(shift.starts_at).toLocaleString("vi-VN") : "Ca làm"}
                    </option>
                  ))}
                </select>
                <small>Checklist ca qua 00:00 vẫn bảo toàn ngày bắt đầu ca và không bị tách đôi.</small>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="checklist-assignee">Phạm vi áp dụng trong ngày</label>
                <select id="checklist-assignee" value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}>
                  <option value="Toàn bộ ca làm">Toàn bộ ca làm (Việc chung cả ngày)</option>
                  <option value="Ca sáng (Mở cửa)">Toàn ca làm · Ca sáng (Mở cửa)</option>
                  <option value="Ca giữa (Giữa ngày)">Toàn ca làm · Ca giữa (Giữa ngày)</option>
                  <option value="Ca tối (Đóng cửa)">Toàn ca làm · Ca tối (Đóng cửa)</option>
                </select>
              </div>
            )}
            <div className="field" style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12 }}>
              <input
                id="checklist-required"
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                style={{ width: 20, height: 20 }}
              />
              <label htmlFor="checklist-required" style={{ margin: 0, cursor: "pointer" }}>
                Bắt buộc hoàn thành trước khi bàn giao ca
              </label>
            </div>
            <div className="form-actions">
              <button
                className="button button-compact"
                type="submit"
                disabled={pending || (routineType === "shift_routine" && !selectedShiftId)}
              >
                Lưu công việc
              </button>
            </div>
          </form>
        )}

        {/* Dedicated Overdue Shift Checklist Resolution Section */}
        {state === "ready" && overdueShiftItems.length > 0 && (
          <div
            role="region"
            aria-label="Việc tồn đọng từ ca đã qua cần xử lý"
            style={{
              background: "#fff8f1",
              border: "1px solid #f0c9ad",
              borderRadius: 16,
              padding: "16px",
              marginBottom: 20,
              boxShadow: "0 4px 14px rgba(176, 86, 36, 0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    className="badge warning"
                    style={{
                      background: "#fde6d2",
                      color: "#8f3d0b",
                      border: "1px solid #f3c199",
                      fontSize: "0.74rem",
                    }}
                  >
                    Quá hạn · Cần xử lý ({overdueShiftItems.length})
                  </span>
                  <strong style={{ fontSize: "0.95rem", color: "#5e2508" }}>
                    Việc tồn đọng từ ca đã qua nhưng chưa hoàn thành
                  </strong>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "#7c5239" }}>
                  Các việc này thuộc ca làm đã kết thúc và được tách riêng để không làm lệch % tiến độ của ca hôm nay. Bạn có thể đánh dấu hoàn thành bù, chuyển sang việc hôm nay hoặc bỏ qua.
                </p>
              </div>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              {overdueShiftItems.map((item) => {
                const scopeInfo = formatShiftScopeLabel(item);
                const isProcessing = togglingId === item.id;
                const isPickingCarryOver = carryOverOpenId === item.id;
                return (
                  <div
                    key={item.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #f1d4be",
                      borderRadius: 14,
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      opacity: isProcessing ? 0.72 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 220 }}>
                        <span className="mini-icon pink" style={{ flexShrink: 0, marginTop: 2 }}>
                          <Clock3 size={16} />
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: "0.92rem", color: "var(--ink)", display: "block", wordBreak: "break-word" }}>
                            {item.label}
                          </strong>
                          <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 8px",
                                borderRadius: 999,
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                background: "#fff0f3",
                                color: "var(--burgundy-dark)",
                                border: "1px solid #f4cfd7",
                              }}
                            >
                              {scopeInfo.badgeText}
                            </span>
                            {item.required ? (
                              <span style={{ fontSize: "0.72rem", color: "var(--burgundy)", fontWeight: 700 }}>
                                · Bắt buộc *
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>· Tùy chọn</span>
                            )}
                          </div>
                          <small style={{ display: "block", marginTop: 4, fontSize: "0.75rem", color: "var(--muted)" }}>
                            {scopeInfo.detailText}
                          </small>
                        </div>
                      </div>

                      {canManage && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={Boolean(togglingId)}
                            onClick={() => void resolveOverdueItem(item, { action: "complete_late" })}
                            className="button button-compact"
                            style={{
                              minHeight: 44,
                              minWidth: 44,
                              padding: "0 13px",
                              fontSize: "0.78rem",
                              background: "#0d6840",
                              borderColor: "#0d6840",
                            }}
                            title="Xác nhận công việc này đã được thực hiện bù"
                          >
                            <Check size={14} /> Hoàn thành bù
                          </button>

                          <button
                            type="button"
                            disabled={Boolean(togglingId)}
                            onClick={() => {
                              if (shifts.length === 0) {
                                void resolveOverdueItem(item, {
                                  action: "carry_over",
                                  targetRoutineType: "daily_routine",
                                  assignee: "Toàn bộ ca làm",
                                });
                              } else {
                                setCarryOverTarget(shifts[0]?.id ?? "daily");
                                setCarryOverOpenId((curr) => (curr === item.id ? null : item.id));
                              }
                            }}
                            className="button-secondary button-compact"
                            style={{
                              minHeight: 44,
                              minWidth: 44,
                              padding: "0 13px",
                              fontSize: "0.78rem",
                            }}
                            title="Đưa công việc này sang danh sách việc cần làm hôm nay"
                          >
                            <RefreshCw size={14} />{" "}
                            {shifts.length === 0 ? "Chuyển sang hôm nay (Việc chung)" : "Chuyển sang hôm nay"}
                          </button>

                          <button
                            type="button"
                            disabled={Boolean(togglingId)}
                            onClick={() => void resolveOverdueItem(item, { action: "dismiss" })}
                            className="button-secondary button-compact"
                            style={{
                              minHeight: 44,
                              minWidth: 44,
                              padding: "0 12px",
                              fontSize: "0.78rem",
                              color: "#9a2b3e",
                              borderColor: "#efd2d8",
                              background: "#fff7f8",
                            }}
                            title="Bỏ qua và đóng công việc tồn đọng này (có ghi nhật ký hoạt động)"
                          >
                            <X size={14} /> Bỏ qua
                          </button>
                        </div>
                      )}
                    </div>

                    {isPickingCarryOver && shifts.length > 0 && (
                      <div
                        style={{
                          paddingTop: 10,
                          borderTop: "1px dashed #edd5c2",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
                          <label
                            htmlFor={`carry-over-select-${item.id}`}
                            style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--coffee)" }}
                          >
                            Chọn phạm vi hôm nay:
                          </label>
                          <select
                            id={`carry-over-select-${item.id}`}
                            value={carryOverTarget}
                            onChange={(e) => setCarryOverTarget(e.target.value)}
                            style={{
                              minHeight: 44,
                              padding: "6px 10px",
                              borderRadius: 10,
                              border: "1px solid var(--line)",
                              fontSize: "0.78rem",
                              background: "#fff",
                            }}
                          >
                            <option value="daily">Toàn bộ ca làm (Việc chung hôm nay)</option>
                            {shifts.map((s) => (
                              <option key={s.id} value={s.id}>
                                Ca cụ thể: {s.role_label} · {s.employee_name} ({formatTime(s.starts_at)} — {formatTime(s.ends_at)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            disabled={Boolean(togglingId)}
                            onClick={() => {
                              if (carryOverTarget === "daily") {
                                void resolveOverdueItem(item, {
                                  action: "carry_over",
                                  targetRoutineType: "daily_routine",
                                  assignee: "Toàn bộ ca làm",
                                });
                              } else {
                                void resolveOverdueItem(item, {
                                  action: "carry_over",
                                  targetRoutineType: "shift_routine",
                                  targetShiftId: carryOverTarget,
                                });
                              }
                            }}
                            className="button button-compact"
                            style={{ minHeight: 44, minWidth: 44, padding: "0 13px", fontSize: "0.78rem" }}
                          >
                            Xác nhận chuyển
                          </button>
                          <button
                            type="button"
                            onClick={() => setCarryOverOpenId(null)}
                            className="button-secondary button-compact"
                            style={{ minHeight: 44, minWidth: 44, padding: "0 12px", fontSize: "0.78rem" }}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {state === "ready" && todayItems.length > 0 && (
          <>
            {/* Progress Bar & Summary Stats for Today */}
            <div style={{ marginBottom: 16 }}>
              <div className="progress" style={{ marginBottom: 10, height: 8, borderRadius: 999 }}>
                <span style={{ width: `${overallPercentage}%` }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: "0.78rem" }}>
                <span style={{ color: "var(--muted)" }}>
                  Tiến độ ca hôm nay: <strong style={{ color: "var(--burgundy-dark)" }}>{done}/{todayItems.length} việc đã xong</strong> ·{" "}
                  <strong style={{ color: todayItems.length - done > 0 ? "var(--burgundy)" : "#0d6840" }}>
                    {todayItems.length - done} chưa xong
                  </strong>{" "}
                  ({overallPercentage}%)
                </span>
                {requiredIncompleteCount > 0 ? (
                  <span style={{ color: "var(--burgundy)", fontWeight: 600 }}>
                    ⚠️ Còn {requiredIncompleteCount} việc bắt buộc chưa xong
                  </span>
                ) : (
                  <span style={{ color: "#0d6840", fontWeight: 600 }}>
                    ✓ Đã hoàn tất các việc bắt buộc hôm nay
                  </span>
                )}
              </div>
            </div>

            {/* Scope & Shift Progress Cards for Owner / Manager */}
            {isOwnerOrManager && (todayItems.length > 0 || allShiftsForBreakdown.length > 0) && (
              <div
                style={{
                  background: "var(--sand-light, #fbf7f2)",
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  marginBottom: 18,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Layers size={16} style={{ color: "var(--burgundy)" }} />
                    <strong style={{ fontSize: "0.86rem", color: "var(--burgundy-dark)" }}>
                      Phạm vi checklist hôm nay: Toàn ca làm & Ca làm cụ thể
                    </strong>
                  </div>
                  <small style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                    Bấm vào từng phạm vi để lọc danh sách việc cần làm
                  </small>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                    gap: 10,
                  }}
                >
                  {/* Option to clear filter */}
                  <button
                    type="button"
                    onClick={() => setScopeFilter("all")}
                    style={{
                      minHeight: 44,
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: scopeFilter === "all" ? "2px solid var(--burgundy)" : "1px solid var(--line)",
                      background: scopeFilter === "all" ? "#fff" : "transparent",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div>
                      <strong style={{ color: "var(--burgundy-dark)", display: "block" }}>Tất cả công việc hôm nay</strong>
                      <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>Toàn bộ phạm vi checklist</span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        className={`badge ${todayItems.length - done > 0 ? "warning" : "success"}`}
                        style={{ fontSize: "0.7rem", padding: "2px 7px" }}
                      >
                        {todayItems.length - done > 0 ? `${todayItems.length - done} chưa xong` : `${done}/${todayItems.length} xong`}
                      </span>
                      <span style={{ fontWeight: 700, color: "var(--burgundy)" }}>{done}/{todayItems.length}</span>
                    </div>
                  </button>

                  {/* Daily Tasks Card (Whole shift / all shifts scope) */}
                  <button
                    type="button"
                    onClick={() => setScopeFilter(scopeFilter === "daily" ? "all" : "daily")}
                    style={{
                      minHeight: 44,
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: scopeFilter === "daily" ? "2px solid var(--burgundy)" : "1px solid var(--line)",
                      background: scopeFilter === "daily" ? "#fff" : "transparent",
                      cursor: "pointer",
                      fontSize: "0.78rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div>
                      <strong style={{ color: "var(--burgundy-dark)", display: "block" }}>Toàn bộ ca làm (Việc chung)</strong>
                      <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>Phạm vi: Toàn ca làm / Theo ngày</span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        className={`badge ${
                          totalDailyItems.length === 0
                            ? "neutral"
                            : doneDailyItems === totalDailyItems.length
                            ? "success"
                            : "warning"
                        }`}
                        style={{ fontSize: "0.7rem", padding: "2px 7px" }}
                      >
                        {totalDailyItems.length === 0
                          ? "0 việc"
                          : totalDailyItems.length - doneDailyItems > 0
                          ? `${totalDailyItems.length - doneDailyItems} chưa xong`
                          : `✓ ${doneDailyItems}/${totalDailyItems.length} xong`}
                      </span>
                      <span style={{ fontWeight: 700, color: "var(--burgundy)" }}>
                        {doneDailyItems}/{totalDailyItems.length}
                      </span>
                    </div>
                  </button>

                  {/* Individual Shifts */}
                  {shiftProgressStats.map(({ shift, total, done: sDone, isComplete }) => {
                    const isSelected = scopeFilter === shift.id;
                    const shiftDate = shift.starts_at ? storeDateKey(new Date(shift.starts_at)) : "";
                    const dateSuffix = shiftDate && shiftDate !== todayDateKey ? ` (${shiftDate})` : "";
                    const timeLabel =
                      shift.starts_at && shift.ends_at
                        ? `${formatTime(shift.starts_at)} — ${formatTime(shift.ends_at)}`
                        : "";
                    return (
                      <button
                        key={shift.id}
                        type="button"
                        onClick={() => setScopeFilter(isSelected ? "all" : shift.id)}
                        style={{
                          minHeight: 44,
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: isSelected ? "2px solid var(--burgundy)" : "1px solid var(--line)",
                          background: isSelected ? "#fff" : "transparent",
                          cursor: "pointer",
                          fontSize: "0.78rem",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div>
                          <strong style={{ color: "var(--burgundy-dark)", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            Ca cụ thể: {shift.role_label}{dateSuffix}
                          </strong>
                          <span style={{ color: "var(--muted)", fontSize: "0.72rem", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {shift.employee_name}{timeLabel ? ` · ${timeLabel}` : ""}
                          </span>
                        </div>
                        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span
                            className={`badge ${isComplete ? "success" : total === 0 ? "neutral" : "warning"}`}
                            style={{ fontSize: "0.7rem", padding: "2px 7px" }}
                          >
                            {total === 0 ? "0 việc" : isComplete ? "✓ Đã xong" : `${total - sDone} chưa xong`}
                          </span>
                          {total > 0 && (
                            <span style={{ fontWeight: 700, color: isComplete ? "#0d6840" : "var(--burgundy)" }}>
                              {sDone}/{total}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filter Tabs & Action Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Bộ lọc trạng thái checklist">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={filterMode === "all" ? "button button-compact" : "button-secondary button-compact"}
                  style={{ minHeight: 44, padding: "0 13px", fontSize: "0.78rem" }}
                >
                  Tất cả ({scopedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("incomplete")}
                  className={filterMode === "incomplete" ? "button button-compact" : "button-secondary button-compact"}
                  style={{ minHeight: 44, padding: "0 13px", fontSize: "0.78rem" }}
                >
                  Chưa xong ({scopedIncompleteCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("completed")}
                  className={filterMode === "completed" ? "button button-compact" : "button-secondary button-compact"}
                  style={{ minHeight: 44, padding: "0 13px", fontSize: "0.78rem" }}
                >
                  ✓ Đã hoàn thành ({scopedDoneCount})
                </button>
              </div>

              {scopeFilter !== "all" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="badge neutral" style={{ fontSize: "0.74rem" }}>
                    Đang lọc phạm vi:{" "}
                    {scopeFilter === "daily"
                      ? "Toàn bộ ca làm (Việc chung)"
                      : (() => {
                          const s = allShiftsForBreakdown.find((shift) => shift.id === scopeFilter);
                          return s ? `Ca cụ thể: ${s.role_label} (${s.employee_name})` : "Ca cụ thể";
                        })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setScopeFilter("all")}
                    className="button-secondary button-compact"
                    style={{ minHeight: 44, minWidth: 44, padding: "0 12px", fontSize: "0.74rem" }}
                  >
                    Xem tất cả
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {state === "loading" ? (
          <ListSkeleton rows={5} />
        ) : state === "error" ? (
          <AsyncStatePanel
            state="error"
            title="Không thể tải checklist"
            description="Tiến độ checklist chưa được xác nhận."
            actionLabel="Thử lại"
            onAction={() => void refresh()}
          />
        ) : !items.length ? (
          <AsyncStatePanel
            state="empty"
            title="Chỗ này vẫn còn trống nè!"
            description={
              canManage
                ? "Hôm nay chưa có đầu việc nào. Bạn hãy tạo công việc đầu tiên cho quy trình vận hành hôm nay nhé!"
                : "Hôm nay quán chưa có đầu việc checklist nào được giao nè. Thảnh thơi rồi nhé!"
            }
            actionLabel={canManage ? "Thêm công việc" : undefined}
            onAction={canManage ? () => setShowForm(true) : undefined}
          />
        ) : todayItems.length === 0 ? (
          <AsyncStatePanel
            compact
            state="empty"
            title="Ca hôm nay chưa có công việc mới"
            description="Bạn có thể xử lý công việc tồn đọng từ ca đã qua ở khung phía trên (Hoàn thành bù, Chuyển sang hôm nay hoặc Bỏ qua), hoặc thêm công việc mới cho hôm nay."
            actionLabel={canManage ? "Thêm công việc hôm nay" : undefined}
            onAction={canManage ? () => setShowForm(true) : undefined}
          />
        ) : filteredItems.length === 0 ? (
          <AsyncStatePanel
            compact
            state="empty"
            title={
              filterMode === "completed"
                ? "Chưa có công việc nào hoàn thành"
                : filterMode === "incomplete"
                ? "Tất cả công việc đã hoàn thành!"
                : "Không có công việc nào phù hợp bộ lọc"
            }
            description={
              filterMode === "completed"
                ? "Hãy tích chọn các việc khi thực hiện trong ca."
                : filterMode === "incomplete"
                ? "Tuyệt vời! Không còn việc tồn đọng trong danh sách này."
                : "Thử đổi bộ lọc hoặc chọn ca khác."
            }
            actionLabel="Xem tất cả công việc"
            onAction={() => {
              setFilterMode("all");
              setScopeFilter("all");
            }}
          />
        ) : (
          <div className="stack" style={{ gap: 20, marginTop: 8 }}>
            {/* Shift Routines Section */}
            {shiftItems.length > 0 && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "0.92rem", color: "var(--burgundy-dark)", display: "block" }}>
                      Phạm vi: Theo ca làm cụ thể ({shiftItems.length})
                    </strong>
                    <small style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      Hiển thị rõ từng việc thuộc ca làm cụ thể nào và nhân sự phụ trách.
                    </small>
                  </div>
                  <span
                    className={`badge ${
                      shiftItems.filter((i) => i.completed).length === shiftItems.length ? "success" : "warning"
                    }`}
                  >
                    {shiftItems.filter((i) => !i.completed).length > 0
                      ? `${shiftItems.filter((i) => !i.completed).length} chưa xong`
                      : `${shiftItems.length}/${shiftItems.length} xong`}
                  </span>
                </div>
                <div className="list">{shiftItems.map(renderChecklistRow)}</div>
              </div>
            )}

            {/* Daily Routines Section */}
            {dailyItems.length > 0 && (
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "0.92rem", color: "var(--burgundy-dark)", display: "block" }}>
                      Phạm vi: Toàn bộ ca làm / Việc chung trong ngày ({dailyItems.length})
                    </strong>
                    <small style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      Áp dụng chung cho toàn ca làm hoặc theo giai đoạn vận hành của cửa hàng.
                    </small>
                  </div>
                  <span
                    className={`badge ${
                      dailyItems.filter((i) => i.completed).length === dailyItems.length ? "success" : "warning"
                    }`}
                  >
                    {dailyItems.filter((i) => !i.completed).length > 0
                      ? `${dailyItems.filter((i) => !i.completed).length} chưa xong`
                      : `${dailyItems.length}/${dailyItems.length} xong`}
                  </span>
                </div>
                <div className="list">{dailyItems.map(renderChecklistRow)}</div>
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <motion.div
          key={`${done}-${filterMode}-${overdueShiftItems.length}`}
          initial={{ opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="loopy-speech-bubble"
        >
          {overdueShiftItems.length > 0 && todayItems.length === 0
            ? `Loopy nhắc nhẹ: Đang có ${overdueShiftItems.length} việc tồn từ ca đã qua cần xử lý đó nha!`
            : filterMode === "completed"
            ? `Loopy ghi nhận: Đã hoàn thành cụ thể ${done} công việc hôm nay!`
            : isAllDone
            ? "Tuyệt vời quá! Loopy rất tự hào về bạn! Toàn bộ checklist hôm nay đã hoàn thành 100%!"
            : done > 0
            ? `Cố lên! Đã hoàn thành ${done} việc, còn ${todayItems.length - done} việc nữa!`
            : "Chào bạn! Hãy tích chọn các công việc khi bắt đầu ca nhé!"}
        </motion.div>

        <MotionLoopySticker
          mood={isAllDone ? "celebrate" : done > 0 ? "working" : "checklist"}
          size={145}
        />

        <h3 className="card-title" style={{ marginTop: 12 }}>
          {isAllDone ? "Tuyệt vời, xong hết rồi!" : "Loopy đồng hành cùng bạn"}
        </h3>
        <p className="supporting-copy">
          {isAllDone
            ? "Tất cả công việc đã chuẩn bị sẵn sàng cho ca làm việc mượt mà."
            : isOwnerOrManager
            ? "Chủ quán và quản lý có thể quan sát tiến độ từng ca làm việc và thêm công việc mới vào checklist bất cứ lúc nào."
            : "Nhân viên tích chọn công việc trong ca để ghi nhận tiến độ vận hành."}
        </p>
      </aside>

      {/* Modal Lịch sử checklist */}
      {showHistoryModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 14,
            backdropFilter: "blur(4px)",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="checklist-history-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHistoryModal(false);
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 580,
              width: "100%",
              boxShadow: "0 14px 36px rgba(0,0,0,0.22)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              padding: 0,
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid #ebd8dc",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fffaf4",
              }}
            >
              <div>
                <h3 id="checklist-history-title" style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--burgundy-dark)", display: "flex", alignItems: "center", gap: 7 }}>
                  <History size={18} color="var(--burgundy)" /> Lịch sử hoàn thành checklist
                </h3>
                <p style={{ margin: "3px 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
                  Lưu trữ kết quả thực hiện theo ngày & nhân sự hoàn thành
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                aria-label="Đóng bảng lịch sử"
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 8,
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Controls Bar */}
            <div
              style={{
                padding: "14px 18px",
                background: "#fff",
                borderBottom: "1px solid var(--line)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Date selection & Quick presets */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label htmlFor="history-date-input" style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--coffee)" }}>
                    Ngày:
                  </label>
                  <input
                    id="history-date-input"
                    type="date"
                    value={historyDate}
                    onChange={(e) => setHistoryDate(e.target.value)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      fontSize: "0.8rem",
                      color: "var(--coffee)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={historyDate === storeDateKey(new Date()) ? "button button-compact" : "button-secondary button-compact"}
                    style={{ minHeight: 30, padding: "0 9px", fontSize: "0.72rem" }}
                    onClick={() => setHistoryDate(storeDateKey(new Date()))}
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    className={historyDate === addStoreDays(storeDateKey(new Date()), -1) ? "button button-compact" : "button-secondary button-compact"}
                    style={{ minHeight: 30, padding: "0 9px", fontSize: "0.72rem" }}
                    onClick={() => setHistoryDate(addStoreDays(storeDateKey(new Date()), -1))}
                  >
                    Hôm qua
                  </button>
                  <button
                    type="button"
                    className={historyDate === "" ? "button button-compact" : "button-secondary button-compact"}
                    style={{ minHeight: 30, padding: "0 9px", fontSize: "0.72rem" }}
                    onClick={() => setHistoryDate("")}
                  >
                    Tất cả ngày
                  </button>
                </div>
              </div>

              {/* Status and search filters */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    type="button"
                    className={historyStatus === "all" ? "button button-compact" : "button-secondary button-compact"}
                    style={{ minHeight: 28, padding: "0 8px", fontSize: "0.72rem" }}
                    onClick={() => setHistoryStatus("all")}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    className={historyStatus === "completed" ? "button button-compact" : "button-secondary button-compact"}
                    style={{ minHeight: 28, padding: "0 8px", fontSize: "0.72rem" }}
                    onClick={() => setHistoryStatus("completed")}
                  >
                    ✓ Đã xong
                  </button>
                  <button
                    type="button"
                    className={historyStatus === "incomplete" ? "button button-compact" : "button-secondary button-compact"}
                    style={{ minHeight: 28, padding: "0 8px", fontSize: "0.72rem" }}
                    onClick={() => setHistoryStatus("incomplete")}
                  >
                    Chưa xong
                  </button>
                </div>

                <div style={{ position: "relative", minWidth: 160, flex: 1, maxWidth: 220 }}>
                  <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
                  <input
                    type="search"
                    placeholder="Tìm tên hoặc người làm..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "5px 8px 5px 26px",
                      borderRadius: 8,
                      border: "1px solid var(--line)",
                      fontSize: "0.75rem",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Modal Body - Record List */}
            <div style={{ padding: "14px 18px", overflowY: "auto", flex: 1, maxHeight: "calc(90vh - 210px)" }}>
              {historyLoading ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                  <LoaderCircle size={24} className="spin" style={{ margin: "0 auto 8px", display: "block", color: "var(--burgundy)" }} />
                  Đang tải lịch sử checklist…
                </div>
              ) : historyError ? (
                <div className="report-error">
                  <span>{historyError}</span>
                  <button
                    type="button"
                    className="button-link"
                    style={{ marginLeft: 8, textDecoration: "underline" }}
                    onClick={() => loadHistory(historyDate, historyStatus, historySearch)}
                  >
                    Thử lại
                  </button>
                </div>
              ) : historyRecords.length === 0 ? (
                <div style={{ textAlign: "center", padding: "36px 16px", color: "var(--muted)" }}>
                  <Calendar size={32} style={{ margin: "0 auto 8px", display: "block", opacity: 0.4 }} />
                  <strong style={{ display: "block", fontSize: "0.88rem", color: "var(--coffee)" }}>
                    Không có bản ghi checklist nào
                  </strong>
                  <p style={{ fontSize: "0.76rem", margin: "4px 0 0" }}>
                    {historyDate ? `Không tìm thấy công việc cho ngày ${historyDate}.` : "Chưa có dữ liệu lịch sử phù hợp bộ lọc."}
                  </p>
                </div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                    <span>Tìm thấy {historyRecords.length} đầu việc</span>
                    <span>{historyDate ? `Ngày: ${historyDate}` : "Tất cả ngày lưu trữ"}</span>
                  </div>
                  {historyRecords.map((record) => (
                    <div
                      key={`${record.itemId}-${record.businessDate}`}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: record.completed ? "1px solid #cce7db" : "1px solid var(--line)",
                        background: record.completed ? "#f7fdf9" : "#fff",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <strong
                          style={{
                            fontSize: "0.88rem",
                            color: "var(--coffee)",
                            textDecoration: record.completed ? "line-through" : "none",
                            opacity: record.completed ? 0.8 : 1,
                          }}
                        >
                          {record.label}
                        </strong>
                        <span
                          className={`badge ${record.completed ? "success" : record.required ? "warning" : "neutral"}`}
                          style={{ fontSize: "0.7rem", padding: "2px 7px", whiteSpace: "nowrap" }}
                        >
                          {record.completed ? "✓ Đã hoàn thành" : "Chưa xong"}
                        </span>
                      </div>

                      {record.completed ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 5,
                            padding: "3px 8px",
                            borderRadius: 6,
                            background: "#eaf6ee",
                            border: "1px solid #c2e6d0",
                            color: "#0d6840",
                            fontSize: "0.73rem",
                            fontWeight: 600,
                            width: "fit-content",
                          }}
                        >
                          <CheckCircle2 size={12} className="shrink-0" />
                          <span>Người làm: <strong>{record.completedByName || record.completedBy || "Nhân viên"}</strong></span>
                          {record.completedAt && (
                            <span style={{ color: "#2d7a56", fontWeight: 500, fontSize: "0.7rem" }}>
                              lúc {formatDateTime(record.completedAt)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <small style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                          Chưa có ghi nhận hoàn thành cho ngày {record.businessDate}.
                        </small>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--muted)", paddingTop: 2 }}>
                        <span>
                          {record.routineType === "shift_routine" ? (
                            <>Phạm vi: Ca cụ thể · {record.shiftRoleLabel || record.assignee} ({record.shiftEmployeeName || record.assignee})</>
                          ) : (
                            <>Phạm vi: Toàn ca làm · {record.assignee}</>
                          )}
                          {record.required ? " · Bắt buộc *" : " · Tùy chọn"}
                        </span>
                        <span style={{ fontWeight: 600 }}>Ngày: {record.businessDate}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "12px 18px",
                borderTop: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#faf7f5",
              }}
            >
              <button
                type="button"
                className="button-secondary button-compact"
                style={{ minHeight: 36, fontSize: "0.78rem" }}
                onClick={() => loadHistory(historyDate, historyStatus, historySearch)}
              >
                <RefreshCw size={13} style={{ marginRight: 4 }} /> Làm mới
              </button>
              <button
                type="button"
                className="button button-compact"
                style={{ minHeight: 36, fontSize: "0.78rem" }}
                onClick={() => setShowHistoryModal(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
