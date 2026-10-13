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
  getShiftStatus,
  readJson,
  startOfStoreWeek,
  storeDateKey,
  storeDateTime,
} from "./shared";

export function ScheduleManagerView({ canManage = false }: { canManage?: boolean }) {
  const [shifts, setShifts] = useState<ScheduleShift[]>([]);
  const [employees, setEmployees] = useState<Array<{ email: string; display_name: string; status: string }>>([]);
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
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingShift, setEditingShift] = useState<ScheduleShift | null>(null);

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
        canManage ? fetch("/api/team", { cache: "no-store", signal }) : Promise.resolve(null),
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
      setEmployees((teamPayload.employees ?? []).filter((employee: { status: string }) => employee.status === "active"));
      setLoadState("ready");
    } catch {
      if (signal.aborted || currentSeq !== scheduleSeqRef.current) {
        return;
      }
      setLoadState("error");
    }
  }, [canManage, weekStartDate]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadSchedule(false), 0);
    return () => {
      window.clearTimeout(initialLoad);
      abortControllerRef.current?.abort();
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
      };
    }

    try {
      setBusy(true);
      const response = await fetch("/api/shifts", {
        method: editingShift ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editingShift ? { ...payloadBody, id: editingShift.id, action: "edit", expectedRevision: editingShift.revision } : payloadBody),
      });
      const payload = await readJson<{ message?: string; error?: string }>(response);
      if (response.ok) {
        setShowForm(false);
        setEditingShift(null);
        setError("");
        setSuccessMsg(payload.message ?? "Đã thêm ca vào lịch thành công!");
        await refresh();
      } else {
        setError(payload.error ?? "Không thể tạo ca.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo ca.");
    } finally { setBusy(false); }
  }

  function editShift(shift: ScheduleShift) {
    const localInput = (value: string) => new Date(Date.parse(value) + 7 * 60 * 60_000).toISOString().slice(0, 16);
    setEditingShift(shift); setScheduleMode("single"); setEmployeeEmail(shift.employee_email); setRoleLabel(shift.role_label); setIsLead(Boolean(shift.is_shift_lead));
    setStartsAt(localInput(shift.starts_at)); setEndsAt(localInput(shift.ends_at)); setShowForm(true); setError("");
  }

  async function cancelShift(shift: ScheduleShift) {
    if (busy || !window.confirm(`Hủy ca ${shift.employee_name} ngày ${storeDateKey(shift.starts_at)}?`)) return;
    setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/shifts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: shift.id, action: "cancel", expectedRevision: shift.revision }) }));
      setSuccessMsg("Đã hủy ca và gửi thông báo cho nhân viên."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hủy ca."); }
    finally { setBusy(false); }
  }

  const sundayKey = addStoreDays(weekStartDate, 6);
  const mondayDate = storeDateTime(weekStartDate, "12:00");
  const sundayDate = storeDateTime(sundayKey, "12:00");
  const weekLabel = `Tuần ${formatDateVN(mondayDate)} — ${formatDateVN(sundayDate)}`;
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
    <div className="stack">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className="card-title">{weekLabel}</h2>
            <p className="card-subtitle">{loadState === "loading" ? "Đang cập nhật lịch…" : `${selectedWeekCount} ca đã được phân công trong tuần này`}</p>
          </div>
          {canManage && loadState === "ready" && (
            <button type="button" className="button-secondary button-compact" onClick={() => { setEditingShift(null); setShowForm((v) => !v); }}>
              <Plus size={15} /> {showForm ? "Đóng form" : "Thêm ca vào lịch"}
            </button>
          )}
        </div>
        <div className="schedule-week-navigation" aria-label="Điều hướng tuần">
          <button type="button" className="button-secondary button-compact" onClick={() => setWeekStartDate(addStoreDays(weekStartDate, -7))} aria-label="Tuần trước"><ChevronLeft size={16} /> Tuần trước</button>
          <button type="button" className="button-secondary button-compact" onClick={() => setWeekStartDate(startOfStoreWeek(storeDateKey(new Date())))}>Tuần này</button>
          <button type="button" className="button-secondary button-compact" onClick={() => setWeekStartDate(addStoreDays(weekStartDate, 7))}>Tuần sau <ChevronRight size={16} /></button>
          <label>Chọn ngày<input type="date" value={weekStartDate} onChange={(event) => { if (event.target.value) setWeekStartDate(startOfStoreWeek(event.target.value)); }} /></label>
        </div>
        {error && <p role="alert">{error}</p>}

        {successMsg && (
          <div className="toast" style={{ marginBottom: 16 }}>
            <CheckCircle2 size={17} /> {successMsg}
          </div>
        )}

        {showForm && canManage && loadState === "ready" && (
          <form className="attention-card operation-form" onSubmit={create} style={{ marginBottom: 20 }}>
            <div className="field full">
              <label>Chế độ phân ca</label>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <button
                  type="button"
                  className={`button button-compact ${scheduleMode === "weekly" ? "" : "button-secondary"}`}
                  onClick={() => setScheduleMode("weekly")}
                  disabled={Boolean(editingShift)}
                >
                  📅 Phân ca tuần (Nhiều ngày)
                </button>
                <button
                  type="button"
                  className={`button button-compact ${scheduleMode === "single" ? "" : "button-secondary"}`}
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

            <div className="field full" style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

            <div className="form-actions">
              <button className="button button-compact" type="submit" disabled={busy}>
                {scheduleMode === "weekly" ? `Thêm ${selectedDays.length} ca vào lịch` : "Thêm ca vào lịch"}
              </button>
            </div>
          </form>
        )}

        {error && <InlineError text={error} />}

        {loadState === "loading" ? (
          <p className="supporting-copy" role="status" aria-live="polite" style={{ padding: "18px 0" }}>Đang tải lịch làm việc…</p>
        ) : loadState === "error" ? (
          <div role="alert">
            <InlineError text="Không tải được lịch làm việc. Vui lòng kiểm tra kết nối và thử lại." />
            <button type="button" className="button-secondary button-compact" style={{ marginTop: 12 }} onClick={() => loadSchedule()}>
              Thử tải lại
            </button>
          </div>
        ) : (
          <>
            <div className="schedule-view-switch" role="tablist" aria-label="Chế độ xem lịch">
              <button id="schedule-list-tab" type="button" role="tab" aria-selected={scheduleView === "list"} aria-controls="schedule-list-panel" className={scheduleView === "list" ? "active" : ""} onClick={() => setScheduleView("list")}>
                <CalendarDays size={16} /> Danh sách ca
              </button>
              <button id="schedule-week-tab" type="button" role="tab" aria-selected={scheduleView === "week"} aria-controls="schedule-week-panel" className={scheduleView === "week" ? "active" : ""} onClick={() => setScheduleView("week")}>
                <Clock3 size={16} /> Lịch tuần
              </button>
            </div>

            {scheduleView === "week" && (
              <div id="schedule-week-panel" role="tabpanel" aria-labelledby="schedule-week-tab" className="week-grid-container" style={{ overflowX: "auto", marginTop: 12 }}>
                <div className="week-grid" style={{ minWidth: 700 }}>
                  <div className="week-head" style={{ fontWeight: 700 }}>Nhân viên</div>
                  {DAY_CHIP_LABELS.map((chip, idx) => {
                    const dayKey = addStoreDays(weekStartDate, idx);
                    const [, month, day] = dayKey.split("-");
                    return (
                      <div className="week-head" key={chip.key}>
                        {chip.label}
                        <strong style={{ display: "block", fontSize: 11, color: "#7b6f70" }}>{day}/{month}</strong>
                      </div>
                    );
                  })}

                  {(employees.length > 0 ? employees : [{ email: "demo", display_name: "Tất cả ca" }]).map((emp) => (
                    <Fragment key={emp.email}>
                      <div className="week-person" style={{ fontWeight: 600, fontSize: 13, alignSelf: "center" }}>
                        {emp.display_name}
                      </div>

                      {DAY_CHIP_LABELS.map((chip, idx) => {
                        const dateStr = addStoreDays(weekStartDate, idx);

                        const dayShifts = shifts.filter((s) =>
                          (emp.email === "demo" || s.employee_email === emp.email) && storeDateKey(s.starts_at) === dateStr
                        );

                        return (
                          <div className="week-cell" key={chip.key} style={{ minHeight: 64, padding: 4 }}>
                            {dayShifts.map((s) => (
                              <div
                                key={s.id}
                                className="shift-block mint"
                                style={{
                                  fontSize: 11,
                                  padding: "4px 6px",
                                  borderRadius: 8,
                                  marginBottom: 4,
                                  background: "#e8f5e9",
                                  border: "1px solid #b8e6d3",
                                  color: "#2e7d32",
                                }}
                              >
                                <strong>{s.role_label}</strong>
                                <div>{formatTime(s.starts_at)}–{formatTime(s.ends_at)}</div>
                              </div>
                            ))}
                            {canManage && emp.email !== "demo" && (
                              <button type="button" className="schedule-add-day" onClick={() => openSingleShiftForm(dateStr, emp.email)} aria-label={`Thêm ca cho ${emp.display_name} ngày ${dateStr}`}>
                                <Plus size={13} /> Thêm ca
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
                <div className="schedule-list-heading">
                  <div><span>{canManage ? "Lịch cửa hàng" : "Ca của tôi"}</span><strong>{listedShiftCount} ca hiện tại và sắp tới</strong></div>
                  <span className="badge neutral">Danh sách</span>
                </div>
                {scheduleGroups.filter((group) => group.shifts.length > 0).map((group) => (
                  <section className="schedule-list-group" key={group.id} aria-labelledby={`schedule-group-${group.id}`}>
                    <div className="schedule-list-group-heading">
                      <strong id={`schedule-group-${group.id}`}>{group.label}</strong><span>{group.shifts.length} ca</span>
                    </div>
                    {group.shifts.map((shift) => {
                      const status = getShiftStatus(shift.starts_at, shift.ends_at);
                      return (
                        <article className={`schedule-shift-card ${status.tone}`} key={shift.id}>
                          <div className="schedule-shift-date">
                            <span>{new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(shift.starts_at))}</span>
                            <strong>{new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(shift.starts_at))}</strong>
                          </div>
                          <div className="schedule-shift-main">
                            <div className="schedule-shift-topline">
                              <div>
                                <span>{shift.role_label}{shift.is_shift_lead ? " · Trưởng ca" : ""}</span>
                                <strong>{shift.employee_name}</strong>
                              </div>
                              <span className={`badge ${status.badge}`}>{status.label}</span>
                            </div>
                            {shift.approved_leave_request_id && <p className="warning-text">Nghỉ được duyệt · cần bố trí người thay.</p>}
                            {canManage && !shift.approved_leave_request_id && <div className="schedule-shift-actions"><button className="button-secondary button-compact" disabled={busy} onClick={() => editShift(shift)}>Sửa ca</button><button className="button-secondary button-compact" disabled={busy} onClick={() => void cancelShift(shift)}>Hủy ca</button></div>}
                            <div className="schedule-shift-meta">
                              <span><Clock3 size={14} /> {formatTime(shift.starts_at)} — {formatTime(shift.ends_at)}</span>
                              <span><MapPin size={14} /> Cửa hàng chính</span>
                            </div>
                            {!canManage && (
                              <div className="schedule-shift-actions">
                                <Link href="/app/requests" className="button-secondary button-compact">Đổi ca / Yêu cầu</Link>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ))}
                {listedShiftCount === 0 && (
                  <p className="supporting-copy" style={{ textAlign: "center", padding: "16px 0" }}>
                    {canManage ? "Chưa có ca hiện tại hoặc sắp tới. Hãy thêm ca để xếp lịch cho nhân viên." : "Bạn chưa có ca hiện tại hoặc sắp tới được phân công."}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
