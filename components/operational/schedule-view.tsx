"use client";

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, Plus } from "lucide-react";
import {
  ApiState,
  DAY_CHIP_LABELS,
  InlineError,
  ScheduleShift,
  ShiftPreset,
  addStoreDays,
  formatDateVN,
  formatTime,
  formatShiftRange,
  getShiftStatus,
  readJson,
  startOfStoreWeek,
  storeDateKey,
  storeDateTime,
} from "./shared";

export function ScheduleManagerView({
  canManage = false,
  canCreate,
  canPublish,
  canAdjust,
  canCancel,
  canReadTeam,
}: {
  canManage?: boolean;
  canCreate?: boolean;
  canPublish?: boolean;
  canAdjust?: boolean;
  canCancel?: boolean;
  canReadTeam?: boolean;
}) {
  const effectiveCanCreate = canCreate ?? canManage;
  const effectiveCanPublish = canPublish ?? canManage;
  const effectiveCanAdjust = canAdjust ?? canManage;
  const effectiveCanCancel = canCancel ?? canManage;
  const effectiveCanAssignCover = effectiveCanCreate && effectiveCanPublish;
  const effectiveCanReadTeam = canReadTeam ?? canManage;

  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Array<{ email: string; display_name: string; status: string; participates_attendance?: number }>>([]);
  const [loadState, setLoadState] = useState<ApiState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"weekly" | "single">("weekly");
  const [scheduleView, setScheduleView] = useState<"list" | "week">("list");
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [roleLabel, setRoleLabel] = useState("Barista");
  const [isLead, setIsLead] = useState(false);

  // Single mode fields
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // Weekly batch fields
  const [weekStartDate, setWeekStartDate] = useState(() => startOfStoreWeek(storeDateKey(new Date())));

  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [shiftPreset, setShiftPreset] = useState<ShiftPreset>("morning");
  const [customStart, setCustomStart] = useState("06:00");
  const [customEnd, setCustomEnd] = useState("14:00");

  const [error, setError] = useState("");
  const [staleConflict, setStaleConflict] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingShift, setEditingShift] = useState<ScheduleShift | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState("");

  // Cover shift state
  const [coveringShift, setCoveringShift] = useState<ScheduleShift | null>(null);
  const [coverEmployeeEmail, setCoverEmployeeEmail] = useState("");
  const [coverReason, setCoverReason] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");

  const scheduleSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadSchedule = useCallback(async (showLoading = true) => {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;
    const currentSeq = ++scheduleSeqRef.current;

    if (showLoading) setLoadState("loading");
    try {
      const range = new URLSearchParams({
        from: storeDateTime(weekStartDate, "00:00").toISOString(),
        to: storeDateTime(addStoreDays(weekStartDate, 35), "00:00").toISOString(),
      });
      const [shiftResponse, teamResponse] = await Promise.all([
        fetch(`/api/shifts?${range}`, { cache: "no-store", signal }),
        (canManage || effectiveCanReadTeam) ? fetch("/api/team?schedulable=1", { cache: "no-store", signal }) : Promise.resolve(null),
      ]);
      if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;

      const shiftPayload = await readJson<{ shifts: typeof shifts; error?: string; nextOffset: number | null }>(shiftResponse);
      if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;
      if (!shiftResponse.ok) throw new Error(shiftPayload.error ?? "Không thể tải lịch làm việc.");
      const teamPayload = teamResponse
        ? await readJson<{ employees: typeof employees }>(teamResponse).catch(() => ({ employees: [] }))
        : { employees: [] };
      if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;

      const allShifts = [...(shiftPayload.shifts ?? [])];
      let nextOffset = shiftPayload.nextOffset;
      while (nextOffset !== null && nextOffset !== undefined) {
        const nextRes = await fetch(`/api/shifts?${range}&offset=${nextOffset}`, { cache: "no-store", signal });
        if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;
        const next = await readJson<{ shifts: typeof shifts; nextOffset: number | null }>(nextRes);
        if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;
        allShifts.push(...next.shifts);
        nextOffset = next.nextOffset;
      }
      if (currentSeq !== scheduleSeqRef.current || signal.aborted) return;

      setShifts(allShifts.filter((shift) => shift.status !== "cancelled"));
      setEmployees(
        (teamPayload.employees ?? []).filter(
          (employee) => employee.status === "active" && Boolean(employee.participates_attendance ?? 1),
        ),
      );
      setStaleConflict(false);
      setLoadState("ready");
    } catch {
      if (signal.aborted || currentSeq !== scheduleSeqRef.current) {
        return;
      }
      setLoadState("error");
    }
  }, [canManage, effectiveCanReadTeam, weekStartDate]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadSchedule(false), 0);
    return () => {
      window.clearTimeout(initialLoad);
      abortControllerRef.current?.abort();
    };
  }, [loadSchedule]);

  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        void loadSchedule(false);
      }
    }
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadSchedule(false);
      }
    }, 30_000);
    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.clearInterval(interval);
    };
  }, [loadSchedule]);

  async function refresh() {
    await loadSchedule(false);
  }

  const toggleDay = (dayIndex: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  const openSingleShiftForm = (dateKey: string, email?: string) => {
    setEditingShift(null);
    setScheduleMode("single");
    setStartsAt(`${dateKey}T08:00`);
    setEndsAt(`${dateKey}T16:00`);
    if (email) setEmployeeEmail(email);
    setShowForm(true);
    setError("");
  };

  const conflicts = useMemo(() => {
    if (!employeeEmail || selectedDays.length === 0) return [];
    const foundConflicts: string[] = [];
    selectedDays.forEach((dayOffset) => {
      const dateStr = addStoreDays(weekStartDate, dayOffset);

      const existing = shifts.find(
        (s) => s.employee_email === employeeEmail && storeDateKey(s.starts_at) === dateStr
      );
      if (existing) {
        foundConflicts.push(
          `⚠️ ${existing.employee_name} đã có ca (${formatTime(existing.starts_at)}–${formatTime(existing.ends_at)}) vào ${DAY_CHIP_LABELS[dayOffset].label}`
        );
      }
    });
    return foundConflicts;
  }, [employeeEmail, selectedDays, weekStartDate, shifts]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSuccessMsg("");

    if (!employeeEmail) {
      setError("Vui lòng chọn nhân viên.");
      return;
    }

    let payloadBody: Record<string, unknown> = {};

    if (scheduleMode === "single") {
      if (!startsAt || !endsAt) {
        setError("Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc.");
        return;
      }
      const [startDateKey, startTime] = startsAt.split("T");
      const [endDateKey, endTime] = endsAt.split("T");
      const startDate = storeDateTime(startDateKey, startTime);
      const endDate = storeDateTime(endDateKey, endTime);
      if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
      payloadBody = {
        employeeEmail,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
        roleLabel,
        isShiftLead: isLead,
      };
    } else {
      if (selectedDays.length === 0) {
        setError("Vui lòng chọn ít nhất 1 ngày trong tuần.");
        return;
      }

      let startTimeStr = "06:00";
      let endTimeStr = "14:00";

      if (shiftPreset === "morning") {
        startTimeStr = "06:00"; endTimeStr = "14:00";
      } else if (shiftPreset === "evening") {
        startTimeStr = "14:00"; endTimeStr = "22:00";
      } else if (shiftPreset === "full") {
        startTimeStr = "08:00"; endTimeStr = "17:00";
      } else {
        startTimeStr = customStart; endTimeStr = customEnd;
      }

      const batchShifts = selectedDays.map((offset) => {
        const shiftDate = addStoreDays(weekStartDate, offset);
        const sDate = storeDateTime(shiftDate, startTimeStr);
        const eDate = storeDateTime(shiftDate, endTimeStr);
        if (eDate <= sDate) eDate.setUTCDate(eDate.getUTCDate() + 1);

        return {
          startsAt: sDate.toISOString(),
          endsAt: eDate.toISOString(),
          roleLabel,
          isShiftLead: isLead,
        };
      });

      payloadBody = {
        employeeEmail,
        batch: batchShifts,
        status: isDraft ? "draft" : "published",
      };
    }

    try {
      setBusy(true);
      const isAdjust = Boolean(editingShift && adjustmentReason.trim().length >= 5);
      const requestBody = editingShift
        ? {
            ...payloadBody,
            id: editingShift.id,
            action: isAdjust ? "adjust" : "edit",
            reason: isAdjust ? adjustmentReason.trim() : undefined,
            expectedRevision: editingShift.revision,
          }
        : {
            ...payloadBody,
            status: isDraft ? "draft" : "published",
          };

      const response = await fetch("/api/shifts", {
        method: editingShift ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await readJson<{ message?: string; error?: string; code?: string }>(response);
      if (response.ok) {
        setShowForm(false);
        setEditingShift(null);
        setAdjustmentReason("");
        setIsDraft(false);
        setError("");
        setStaleConflict(false);
        setSuccessMsg(payload.message ?? "Đã lưu ca vào lịch thành công!");
        await refresh();
      } else {
        setStaleConflict(response.status === 409);
        setError(payload.error ?? "Không thể lưu ca.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu ca.");
    } finally { setBusy(false); }
  }

  function editShift(shift: ScheduleShift) {
    const localInput = (value: string) => new Date(Date.parse(value) + 7 * 60 * 60_000).toISOString().slice(0, 16);
    setEditingShift(shift); setScheduleMode("single"); setEmployeeEmail(shift.employee_email); setRoleLabel(shift.role_label); setIsLead(Boolean(shift.is_shift_lead));
    setStartsAt(localInput(shift.starts_at)); setEndsAt(localInput(shift.ends_at)); setShowForm(true); setError(""); setStaleConflict(false); setAdjustmentReason("");
  }

  async function publishShift(shift: ScheduleShift) {
    if (busy) return;
    setBusy(true); setError(""); setStaleConflict(false);
    try {
      const response = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: shift.id, action: "publish", expectedRevision: shift.revision }),
      });
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setStaleConflict(response.status === 409);
        throw new Error(payload.error ?? "Không thể xuất bản ca.");
      }
      setSuccessMsg("Đã xuất bản ca và gửi thông báo cho nhân viên.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể xuất bản ca.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelShift(shift: ScheduleShift) {
    if (busy || !window.confirm(`Hủy ca ${shift.employee_name} ngày ${storeDateKey(shift.starts_at)}?`)) return;
    setBusy(true); setError(""); setStaleConflict(false);
    try {
      const response = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: shift.id, action: "cancel", expectedRevision: shift.revision }),
      });
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        setStaleConflict(response.status === 409);
        throw new Error(payload.error ?? "Không thể hủy ca.");
      }
      setSuccessMsg("Đã hủy ca và gửi thông báo cho nhân viên."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hủy ca."); }
    finally { setBusy(false); }
  }

  async function submitCover(event: React.FormEvent) {
    event.preventDefault();
    if (!coveringShift || !coverEmployeeEmail || coverBusy) return;
    setCoverBusy(true);
    setCoverError("");
    try {
      const response = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: coveringShift.id,
          action: "assign_cover",
          replacementEmployeeEmail: coverEmployeeEmail,
          reason: coverReason.trim() || undefined,
          expectedRevision: coveringShift.revision,
        }),
      });
      const payload = await readJson<{ message?: string; error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Không thể bố trí người làm thay.");
      }
      setSuccessMsg(payload.message ?? "Đã bố trí người làm thay thành công!");
      setCoveringShift(null);
      setCoverEmployeeEmail("");
      setCoverReason("");
      await refresh();
    } catch (cause) {
      setCoverError(cause instanceof Error ? cause.message : "Không thể bố trí người làm thay.");
    } finally {
      setCoverBusy(false);
    }
  }

  const formatDateKeyVN = (dateKey: string) => {
    const [year, month, day] = dateKey.split("-");
    return day && month && year ? `${day}/${month}/${year}` : dateKey;
  };
  const sundayKey = addStoreDays(weekStartDate, 6);
  const weekLabel = `Tuần ${formatDateKeyVN(weekStartDate)} — ${formatDateKeyVN(sundayKey)}`;
  const sortedShifts = [...shifts].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const selectedWeekCount = shifts.filter((shift) => {
    const dateKey = storeDateKey(shift.starts_at);
    return dateKey >= weekStartDate && dateKey <= sundayKey;
  }).length;
  const todayKey = storeDateKey(new Date());
  const tomorrowKey = addStoreDays(todayKey, 1);
  const currentWeekStart = startOfStoreWeek(todayKey);
  const currentWeekEnd = addStoreDays(currentWeekStart, 6);
  const scheduleGroups: Array<{ id: string; label: string; shifts: ScheduleShift[] }> = [
    { id: "today", label: "Hôm nay", shifts: [] },
    { id: "tomorrow", label: "Ngày mai", shifts: [] },
    { id: "week", label: "Tuần này", shifts: [] },
    { id: "upcoming", label: "Sắp tới", shifts: [] },
  ];
  sortedShifts.forEach((shift) => {
    const dateKey = storeDateKey(shift.starts_at);
    if (dateKey === todayKey) scheduleGroups[0].shifts.push(shift);
    else if (dateKey === tomorrowKey) scheduleGroups[1].shifts.push(shift);
    else if (dateKey >= currentWeekStart && dateKey <= currentWeekEnd) scheduleGroups[2].shifts.push(shift);
    else if (dateKey > currentWeekEnd) scheduleGroups[3].shifts.push(shift);
  });
  const listedShiftCount = scheduleGroups.reduce((total, group) => total + group.shifts.length, 0);

  return (
    <div className="stack min-w-0 max-w-full">
      <section className="card schedule-card-compact min-w-0 max-w-full overflow-hidden">
        <div className="schedule-top-controls">
          <div className="schedule-header-row">
            <div className="min-w-0">
              <h2 className="schedule-week-title">{weekLabel}</h2>
              <p className="schedule-week-subtitle">
                {loadState === "loading"
                  ? "Đang cập nhật lịch…"
                  : `${selectedWeekCount} ca trong tuần đang chọn · ${listedShiftCount} ca sắp tới`}
              </p>
            </div>
            {effectiveCanCreate && loadState === "ready" && (
              <button
                type="button"
                className="button schedule-add-shift-btn"
                onClick={() => { setEditingShift(null); setShowForm((v) => !v); }}
              >
                <Plus size={15} />
                <span>{showForm ? "Đóng form" : "Thêm ca"}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 schedule-week-nav" role="group" aria-label="Điều hướng tuần">
            <button
              type="button"
              className="button-secondary schedule-week-nav-btn"
              onClick={() => setWeekStartDate(addStoreDays(weekStartDate, -7))}
              aria-label="Tuần trước"
            >
              <ChevronLeft size={15} />
              <span>Tuần trước</span>
            </button>
            <button
              type="button"
              className={`button-secondary schedule-week-nav-btn ${weekStartDate === currentWeekStart ? "is-current" : ""}`}
              onClick={() => setWeekStartDate(startOfStoreWeek(storeDateKey(new Date())))}
            >
              <span>Tuần này</span>
            </button>
            <button
              type="button"
              className="button-secondary schedule-week-nav-btn"
              onClick={() => setWeekStartDate(addStoreDays(weekStartDate, 7))}
              aria-label="Tuần sau"
            >
              <span>Tuần sau</span>
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="schedule-mode-bar">
            <div className="schedule-view-switch" role="tablist" aria-label="Chế độ xem lịch">
              <button
                id="schedule-list-tab"
                type="button"
                role="tab"
                aria-selected={scheduleView === "list"}
                aria-controls="schedule-list-panel"
                className={scheduleView === "list" ? "active" : ""}
                onClick={() => setScheduleView("list")}
              >
                <CalendarDays size={14} />
                <span>Danh sách</span>
              </button>
              <button
                id="schedule-week-tab"
                type="button"
                role="tab"
                aria-selected={scheduleView === "week"}
                aria-controls="schedule-week-panel"
                className={scheduleView === "week" ? "active" : ""}
                onClick={() => setScheduleView("week")}
              >
                <Clock3 size={14} />
                <span>Lịch tuần</span>
              </button>
            </div>

            <label className="schedule-date-picker-btn" title="Chọn ngày bất kỳ để nhảy tới tuần tương ứng">
              <CalendarDays size={14} className="text-[#6f2939] shrink-0" />
              <span className="tabular-nums">{formatDateKeyVN(weekStartDate)}</span>
              <input
                type="date"
                aria-label="Chọn ngày"
                value={weekStartDate}
                onClick={(event) => {
                  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
                  try { input.showPicker?.(); } catch {}
                }}
                onChange={(event) => {
                  if (event.target.value) setWeekStartDate(startOfStoreWeek(event.target.value));
                }}
                className="sr-only"
              />
            </label>
          </div>
        </div>
        {error && (
          <div role="alert" style={{ marginBottom: 12 }}>
            <InlineError text={error} />
            {staleConflict && (
              <button
                type="button"
                className="button-secondary button-compact"
                style={{ marginTop: 8, minHeight: 42 }}
                onClick={() => { setError(""); setStaleConflict(false); void refresh(); }}
              >
                Tải lại lịch mới nhất
              </button>
            )}
          </div>
        )}

        {successMsg && (
          <div className="toast" style={{ marginBottom: 16 }}>
            <CheckCircle2 size={17} /> {successMsg}
          </div>
        )}

        {showForm && (editingShift ? effectiveCanAdjust : effectiveCanCreate) && loadState === "ready" && (
          <form className="attention-card operation-form" onSubmit={create} style={{ marginBottom: 20 }}>
            <div className="field full">
              <label>Chế độ phân ca</label>
              <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`button button-compact ${scheduleMode === "weekly" ? "" : "button-secondary"}`}
                  style={{ minHeight: 42 }}
                  onClick={() => setScheduleMode("weekly")}
                  disabled={Boolean(editingShift)}
                >
                  📅 Phân ca tuần (Nhiều ngày)
                </button>
                <button
                  type="button"
                  className={`button button-compact ${scheduleMode === "single" ? "" : "button-secondary"}`}
                  style={{ minHeight: 42 }}
                  onClick={() => setScheduleMode("single")}
                >
                  ⏰ Tạo 1 ca lẻ
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="shift-employee">Nhân viên *</label>
              <select
                id="shift-employee"
                disabled={Boolean(editingShift)}
                value={employeeEmail}
                onChange={(e) => setEmployeeEmail(e.target.value)}
                required
              >
                <option value="">-- Chọn nhân viên --</option>
                {employees.map((emp) => (
                  <option value={emp.email} key={emp.email}>
                    {emp.display_name} ({emp.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="shift-role">Vai trò trong ca</label>
              <select id="shift-role" value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)}>
                <option value="Barista">Barista (Pha chế)</option>
                <option value="Thu ngân">Thu ngân (Cashier)</option>
                <option value="Trưởng ca">Trưởng ca (Shift Lead)</option>
                <option value="Phục vụ">Phục vụ & Vệ sinh</option>
              </select>
            </div>

            {scheduleMode === "weekly" ? (
              <>
                <div className="field">
                  <label htmlFor="week-start">Tuần bắt đầu từ</label>
                  <input
                    id="week-start"
                    type="date"
                    value={weekStartDate}
                    onChange={(e) => setWeekStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label>Khung giờ ca làm</label>
                  <select
                    value={shiftPreset}
                    onChange={(e) => setShiftPreset(e.target.value as ShiftPreset)}
                  >
                    <option value="morning">Ca sáng (06:00 – 14:00)</option>
                    <option value="evening">Ca tối (14:00 – 22:00)</option>
                    <option value="full">Ca hành chính (08:00 – 17:00)</option>
                    <option value="custom">Tùy chỉnh khung giờ...</option>
                  </select>
                </div>

                {shiftPreset === "custom" && (
                  <>
                    <div className="field">
                      <label>Giờ bắt đầu</label>
                      <input
                        type="time"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Giờ kết thúc</label>
                      <input
                        type="time"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="field full">
                  <label>Chọn các ngày áp dụng ca (Day Chips):</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {DAY_CHIP_LABELS.map((chip) => {
                      const isSelected = selectedDays.includes(chip.key);
                      return (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => toggleDay(chip.key)}
                          style={{
                            minHeight: 40,
                            padding: "8px 16px",
                            borderRadius: 20,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 150ms ease",
                            background: isSelected ? "#6f2939" : "#ffffff",
                            color: isSelected ? "#ffffff" : "#332a2b",
                            border: `1px solid ${isSelected ? "#6f2939" : "#eee3df"}`,
                            boxShadow: isSelected ? "0 2px 8px rgba(111,41,57,0.2)" : "none",
                          }}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="shift-start">Thời gian bắt đầu</label>
                  <input
                    id="shift-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="shift-end">Thời gian kết thúc</label>
                  <input
                    id="shift-end"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {conflicts.length > 0 && (
              <div className="field full">
                <div style={{ background: "#fff3e0", border: "1px solid #ffe0b2", borderRadius: 14, padding: "10px 14px", color: "#e65100", fontSize: 12 }}>
                  {conflicts.map((c, i) => (
                    <div key={i}>{c}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="field full" style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40 }}>
              <input
                id="is-lead"
                type="checkbox"
                checked={isLead}
                onChange={(e) => setIsLead(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="is-lead" style={{ margin: 0, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                Đánh dấu là Trưởng ca (Shift Lead)
              </label>
            </div>

            {!editingShift ? (
              <div className="field full" style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40 }}>
                <input
                  id="is-draft"
                  type="checkbox"
                  checked={isDraft || !effectiveCanPublish}
                  disabled={!effectiveCanPublish}
                  onChange={(e) => setIsDraft(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <label htmlFor="is-draft" style={{ margin: 0, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                  Lưu dạng Ca nháp (Draft - chỉ Quản lý/Chủ quán thấy trước khi xuất bản)
                </label>
              </div>
            ) : (
              <div className="field full">
                <label htmlFor="adjust-reason">Lý do điều chỉnh (khi ca bắt đầu trong vòng 12 giờ)</label>
                <textarea
                  id="adjust-reason"
                  rows={2}
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="Nhập lý do điều chỉnh nếu ca cận giờ (tối thiểu 5 ký tự)..."
                />
              </div>
            )}

            <div className="form-actions">
              <button className="button button-compact" type="submit" disabled={busy} style={{ minHeight: 44 }}>
                {editingShift ? "Lưu thay đổi ca" : scheduleMode === "weekly" ? `Thêm ${selectedDays.length} ca vào lịch` : "Thêm ca vào lịch"}
              </button>
            </div>
          </form>
        )}

        {loadState === "loading" ? (
          <p className="supporting-copy" role="status" aria-live="polite" style={{ padding: "18px 0" }}>Đang tải lịch làm việc…</p>
        ) : loadState === "error" ? (
          <div role="alert">
            <InlineError text="Không tải được lịch làm việc. Vui lòng kiểm tra kết nối và thử lại." />
            <button type="button" className="button-secondary button-compact" style={{ marginTop: 12, minHeight: 42 }} onClick={() => loadSchedule()}>
              Thử tải lại
            </button>
          </div>
        ) : (
          <>
            {scheduleView === "week" && (
              <div
                id="schedule-week-panel"
                role="tabpanel"
                aria-labelledby="schedule-week-tab"
                className="week-grid-container"
                style={{
                  overflowX: "auto",
                  maxWidth: "100%",
                  width: "100%",
                  minWidth: 0,
                  boxSizing: "border-box",
                  WebkitOverflowScrolling: "touch",
                  marginTop: 10,
                }}
              >
                <p className="supporting-copy" style={{ fontSize: 12, margin: "0 0 8px" }}>
                  Vuốt ngang bảng để xem các ngày trong tuần. Cột tên nhân viên được ghim cố định bên trái.
                </p>
                <div className="week-grid">
                  <div className="week-head" style={{ fontWeight: 700 }}>Nhân viên</div>
                  {DAY_CHIP_LABELS.map((chip, idx) => {
                    const dayKey = addStoreDays(weekStartDate, idx);
                    const [, month, day] = dayKey.split("-");
                    const isTodayCol = dayKey === todayKey;
                    return (
                      <div
                        className="week-head"
                        key={chip.key}
                        style={isTodayCol ? { background: "#fff2f4", borderColor: "#f3c7d0", color: "#6f2939" } : undefined}
                      >
                        <span className="block leading-tight">{chip.label}{isTodayCol ? " • Nay" : ""}</span>
                        <strong style={{ display: "block", fontSize: 11, color: isTodayCol ? "#6f2939" : "#7b6f70" }} className="tabular-nums">{day}/{month}</strong>
                      </div>
                    );
                  })}

                  {(employees.length > 0 ? employees : [{ email: "demo", display_name: "Tất cả ca" }]).map((emp) => (
                    <Fragment key={emp.email}>
                      <div className="week-person" style={{ fontWeight: 600, fontSize: 12, alignSelf: "stretch", display: "flex", alignItems: "center" }}>
                        <span className="line-clamp-2 leading-tight">{emp.display_name}</span>
                      </div>

                      {DAY_CHIP_LABELS.map((chip, idx) => {
                        const dateStr = addStoreDays(weekStartDate, idx);

                        const dayShifts = shifts.filter((s) =>
                          (emp.email === "demo" || s.employee_email === emp.email) && storeDateKey(s.starts_at) === dateStr
                        );

                        return (
                          <div className="week-cell" key={chip.key} style={{ minHeight: 60, padding: 4 }}>
                            {dayShifts.map((s) => {
                              const isLeave = Boolean(s.approved_leave_request_id);
                              const statusInfo = getShiftStatus(s.starts_at, s.ends_at, { approvedLeaveRequestId: s.approved_leave_request_id });
                              return (
                                <div
                                  key={s.id}
                                  className={`shift-block ${isLeave ? "warning" : "mint"}`}
                                  style={{
                                    fontSize: 11,
                                    padding: "5px 6px",
                                    borderRadius: 8,
                                    marginBottom: 4,
                                    background: isLeave ? "#fffbeb" : "#e8f5e9",
                                    border: `1px solid ${isLeave ? "#fde68a" : "#b8e6d3"}`,
                                    color: isLeave ? "#b45309" : "#2e7d32",
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-start",
                                    gap: 2,
                                  }}
                                >
                                  <strong className="leading-tight block break-words">{s.role_label}</strong>
                                  <span
                                    style={{
                                      fontSize: 9.5,
                                      background: isLeave ? "#fef3c7" : "rgba(255,255,255,0.75)",
                                      color: isLeave ? "#92400e" : "#1b5e20",
                                      padding: "1px 5px",
                                      borderRadius: 4,
                                      fontWeight: 700,
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {isLeave ? "Nghỉ đã duyệt" : s.status === "draft" ? "Bản nháp" : statusInfo.label}
                                  </span>
                                  <div className="tabular-nums text-[10.5px] leading-tight mt-0.5">{formatShiftRange(s.starts_at, s.ends_at)}</div>
                                  {isLeave && (
                                    <div style={{ marginTop: 1, fontSize: 10, fontWeight: 600, lineHeight: 1.25 }}>
                                      {s.cover_employee_name ? `Thay: ${s.cover_employee_name}` : "Chưa bố trí"}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {effectiveCanCreate && emp.email !== "demo" && (
                              <button
                                type="button"
                                className="schedule-add-day"
                                onClick={() => openSingleShiftForm(dateStr, emp.email)}
                                aria-label={`Thêm ca cho ${emp.display_name} ngày ${formatDateKeyVN(dateStr)}`}
                                title="Thêm ca"
                              >
                                <Plus size={14} />
                                <span className="sr-only">Thêm ca</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            )}

            {scheduleView === "list" && (
              <div id="schedule-list-panel" role="tabpanel" aria-labelledby="schedule-list-tab" className="schedule-mobile-list">
                {scheduleGroups.filter((group) => group.shifts.length > 0).map((group) => (
                  <section className="schedule-list-group" key={group.id} aria-labelledby={`schedule-group-${group.id}`}>
                    <div className="schedule-list-group-heading">
                      <strong id={`schedule-group-${group.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {group.label}
                        {group.id === "today" && <span className="badge success">Ưu tiên hôm nay</span>}
                      </strong>
                      <span>{group.shifts.length} ca</span>
                    </div>
                    {group.shifts.map((shift) => {
                      const status = getShiftStatus(shift.starts_at, shift.ends_at, { approvedLeaveRequestId: shift.approved_leave_request_id });
                      const isLeave = Boolean(shift.approved_leave_request_id);
                      const shiftDateKey = storeDateKey(shift.starts_at);
                      const shiftDateVN = formatDateKeyVN(shiftDateKey);
                      const [, shiftMonth, shiftDay] = shiftDateKey.split("-");
                      const isWithin12h = shift.status === "published" && (Date.parse(shift.starts_at) - Date.now() < 12 * 60 * 60 * 1000);
                      const cancelBlockedReason = isLeave
                        ? "Ca đã duyệt nghỉ — không hủy trực tiếp"
                        : shift.has_payroll_lock
                        ? "Kỳ lương đã khóa — không thể sửa/hủy"
                        : shift.has_attendance
                        ? "Đã có chấm công — không thể sửa/hủy"
                        : isWithin12h
                        ? "Bắt đầu trong < 12 giờ — khóa hủy trực tiếp (dùng Sửa ca có lý do)"
                        : "";
                      return (
                        <article className={`schedule-shift-card ${status.tone}`} key={shift.id}>
                          <div className="schedule-shift-date" title={shiftDateVN}>
                            <span>{new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(shift.starts_at))}</span>
                            <strong className="text-sm font-bold leading-tight mt-0.5 tabular-nums">{shiftDay}/{shiftMonth}</strong>
                            <small className="text-[10px] text-[#7b6f70] font-medium leading-none mt-0.5 tabular-nums">{shiftDateVN.slice(-4)}</small>
                          </div>
                          <div className="schedule-shift-main">
                            <div className="schedule-shift-topline">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-[#6f2939] truncate">
                                  {shift.role_label}{shift.is_shift_lead ? " · Trưởng ca" : ""}
                                </span>
                                {canManage && (
                                  <strong>{shift.employee_name}</strong>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {shift.status === "draft" && <span className="badge warning">Bản nháp</span>}
                                <span className={`badge ${status.badge} text-sm font-medium`}>{status.label}</span>
                              </div>
                            </div>

                            {isLeave && (
                              shift.cover_employee_name ? (
                                <p className="text-sm font-medium text-[#0369a1] my-1">
                                  Đã bố trí người thay: <strong>{shift.cover_employee_name}</strong>
                                </p>
                              ) : canManage ? (
                                <p className="text-sm font-medium text-[#b45309] my-1">
                                  Chưa bố trí người thay
                                </p>
                              ) : null
                            )}

                            {canManage && cancelBlockedReason && (
                              <p style={{ fontSize: 11.5, color: "#9a3412", margin: "4px 0" }}>
                                🔒 {cancelBlockedReason}
                              </p>
                            )}

                            {canManage && (
                              <div className="schedule-shift-actions">
                                {isLeave ? (
                                  <>
                                    {!shift.cover_employee_name && effectiveCanAssignCover && (
                                      <button
                                        type="button"
                                        className="button button-compact"
                                        style={{ minHeight: 38 }}
                                        disabled={busy}
                                        onClick={() => {
                                          setCoveringShift(shift);
                                          setCoverEmployeeEmail("");
                                          setCoverReason("");
                                          setCoverError("");
                                        }}
                                      >
                                        Bố trí người thay
                                      </button>
                                    )}
                                    <Link href="/app/requests" className="button-secondary button-compact" style={{ minHeight: 38 }}>
                                      Xem đơn nghỉ
                                    </Link>
                                  </>
                                ) : (
                                  <>
                                    {shift.status === "draft" && effectiveCanPublish && (
                                      <button className="button button-compact" style={{ minHeight: 38 }} disabled={busy} onClick={() => void publishShift(shift)}>
                                        Xuất bản
                                      </button>
                                    )}
                                    {effectiveCanAdjust && !shift.has_attendance && !shift.has_payroll_lock && (
                                      <button className="button-secondary button-compact" style={{ minHeight: 38 }} disabled={busy} onClick={() => editShift(shift)}>Sửa ca</button>
                                    )}
                                    {effectiveCanCancel && !cancelBlockedReason && (
                                      <button className="button-secondary button-compact" style={{ minHeight: 38 }} disabled={busy} onClick={() => void cancelShift(shift)}>Hủy ca</button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2 flex-wrap mt-1.5">
                              <div className="schedule-shift-meta !mt-0">
                                <span className="tabular-nums"><Clock3 size={13} /> {formatShiftRange(shift.starts_at, shift.ends_at)}</span>
                                <span className="tabular-nums"><CalendarDays size={13} /> {shiftDateVN}</span>
                                <span className="hidden sm:inline-flex"><MapPin size={13} /> Cửa hàng chính</span>
                              </div>

                              {!canManage && (
                                <Link
                                  href="/app/requests"
                                  className="inline-flex items-center justify-center h-7 px-2.5 rounded-lg border border-[#eee3df] bg-white hover:bg-[#fff2f4] text-[11px] font-semibold text-[#6f2939] transition-colors shrink-0"
                                >
                                  {isLeave ? "Xem đơn nghỉ" : "Đổi ca / Yêu cầu"}
                                </Link>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ))}
                {listedShiftCount === 0 && (
                  <div className="p-6 text-center rounded-2xl border border-dashed border-[#e5d5d8] bg-[#fffaf4]/70 space-y-2.5 my-2">
                    <CalendarDays size={28} className="mx-auto text-[#b0a8a6]" />
                    <strong className="block text-sm font-bold text-[#332a2b]">
                      {canManage ? "Hôm nay quán chưa có ca nào được xếp" : "Hôm nay quán chưa có ca nào được xếp cho bạn"}
                    </strong>
                    <p className="supporting-copy max-w-md mx-auto">
                      {canManage
                        ? "Lịch tuần đang còn trống nè. Cùng lên lịch phân công các bạn để quán mở ca thật rộn ràng nhé!"
                        : "Quản lý chưa xuất bản ca làm mới cho bạn nè. Bạn có thể xem lại bảng tuần hoặc gửi yêu cầu đăng ký/đổi ca nhé."}
                    </p>
                    <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
                      {effectiveCanCreate && (
                        <button
                          type="button"
                          className="button button-compact inline-flex items-center gap-1.5"
                          style={{ minHeight: 40 }}
                          onClick={() => {
                            setEditingShift(null);
                            setScheduleMode("weekly");
                            setShowForm(true);
                          }}
                        >
                          <Plus size={15} /> Thêm ca làm việc
                        </button>
                      )}
                      {weekStartDate !== currentWeekStart && (
                        <button
                          type="button"
                          className="button-secondary button-compact"
                          style={{ minHeight: 40 }}
                          onClick={() => setWeekStartDate(currentWeekStart)}
                        >
                          Về tuần hiện tại
                        </button>
                      )}
                      <button
                        type="button"
                        className="button-secondary button-compact"
                        style={{ minHeight: 40 }}
                        onClick={() => setScheduleView("week")}
                      >
                        Mở bảng lịch tuần
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {coveringShift && (
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
              padding: 16,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-shift-dialog-title"
          >
            <div
              className="card"
              style={{
                maxWidth: 480,
                width: "100%",
                boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <h3 id="cover-shift-dialog-title" className="card-title" style={{ fontSize: 18, marginBottom: 8 }}>
                Bố trí người làm thay ca
              </h3>
              <p className="card-subtitle" style={{ marginBottom: 14 }}>
                Ca của <strong>{coveringShift.employee_name}</strong> ngày{" "}
                {formatDateVN(new Date(coveringShift.starts_at))} ({formatShiftRange(coveringShift.starts_at, coveringShift.ends_at)})
              </p>

              <div
                style={{
                  background: "#fff9f0",
                  border: "1px solid #fed7aa",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  color: "#9a3412",
                  marginBottom: 16,
                }}
              >
                Nhân viên đã được duyệt nghỉ ca này. Việc phân công sẽ tạo một ca làm mới liên kết với ca nghỉ và gửi thông báo đến người được chọn.
              </div>

              {coverError && <InlineError text={coverError} />}

              <form onSubmit={submitCover} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="field">
                  <label htmlFor="cover-employee-select">Chọn nhân viên thay thế *</label>
                  <select
                    id="cover-employee-select"
                    value={coverEmployeeEmail}
                    onChange={(e) => setCoverEmployeeEmail(e.target.value)}
                    required
                  >
                    <option value="">-- Chọn nhân viên sẵn sàng --</option>
                    {employees
                      .filter((emp) => emp.email !== coveringShift.employee_email)
                      .map((emp) => {
                        const hasConflict = shifts.some((s) => {
                          if (s.employee_email !== emp.email || s.id === coveringShift.id) return false;
                          const sStart = new Date(s.starts_at).getTime();
                          const sEnd = new Date(s.ends_at).getTime();
                          const targetStart = new Date(coveringShift.starts_at).getTime();
                          const targetEnd = new Date(coveringShift.ends_at).getTime();
                          return sStart < targetEnd && sEnd > targetStart;
                        });

                        return (
                          <option key={emp.email} value={emp.email} disabled={hasConflict}>
                            {emp.display_name} ({emp.email}) {hasConflict ? "⚠️ (Trùng giờ làm)" : ""}
                          </option>
                        );
                      })}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="cover-reason-input">
                    Lý do phân công (Tùy chọn)
                  </label>
                  <textarea
                    id="cover-reason-input"
                    rows={2}
                    value={coverReason}
                    onChange={(e) => setCoverReason(e.target.value)}
                    placeholder="Nhập ghi chú hoặc lý do bố trí người thay..."
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className="button-secondary button-compact"
                    disabled={coverBusy}
                    onClick={() => {
                      setCoveringShift(null);
                      setCoverEmployeeEmail("");
                      setCoverReason("");
                      setCoverError("");
                    }}
                  >
                    Hủy
                  </button>
                  <button type="submit" className="button button-compact" disabled={coverBusy || !coverEmployeeEmail}>
                    {coverBusy ? "Đang lưu…" : "Xác nhận bố trí"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
