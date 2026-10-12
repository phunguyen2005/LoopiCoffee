"use client";

import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserCheck,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { readJson } from "@/platform/http/client";
import { AttendanceCorrectionForm } from "@/components/attendance-correction-form";
import type { PayrollReportRow as ReportRow, PayrollException } from "@/modules/payroll/contracts/report";
type ReportStatus = ReportRow["status"];
type ReportPayload = {
  period: { key: string; label: string; startDate: string; endDate: string };
  storeName: string;
  timezone: string;
  dataThrough: string;
  periodStatus: "reviewing" | "finalized" | "paid";
  finalizedAt: string | null;
  finalizedBy: string | null;
  canViewPayroll: boolean;
  canManagePayroll: boolean;
  canReviewAttendance: boolean;
  rows: ReportRow[];
};
type SortKey = "displayName" | "scheduledMinutes" | "recordedMinutes" | "approvedMinutes" | "overtimeMinutes" | "exceptionCount" | "totalSalary" | "status";

export function PayrollReportsView() {
  const initialPeriod = useMemo(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).format(new Date()), []);
  const [activeTab, setActiveTab] = useState<"attendance" | "payroll">("attendance");
  const [draftPeriod, setDraftPeriod] = useState(initialPeriod);
  const [period, setPeriod] = useState(initialPeriod);
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [jobTitle, setJobTitle] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "displayName", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);
  const [drawerFocus, setDrawerFocus] = useState<"summary" | "exceptions">("summary");
  const [exportOpen, setExportOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const adjustmentKeyRef = useRef("");
  const exportRef = useRef<HTMLDivElement>(null);

  const loadReport = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/attendance?period=${encodeURIComponent(period)}`, { cache: "no-store", signal });
      const payload = await readJson<ReportPayload & { error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Không thể tải báo cáo kỳ lương.");
      if (signal?.aborted) return;
      setReport(payload);
      setSelectedRow((current) => current
        ? payload.rows.find((row: ReportRow) => row.email === current.email) ?? null
        : null);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Không thể tải báo cáo kỳ lương.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void loadReport(controller.signal); }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [loadReport]);
  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [activeTab, search, jobTitle, status, pageSize, period]);
  useEffect(() => {
    if (activeTab === "payroll" && report && !report.canViewPayroll) {
      queueMicrotask(() => setActiveTab("attendance"));
    }
  }, [activeTab, report]);
  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);
  useEffect(() => {
    const closeDrawer = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRow(null);
    };
    document.addEventListener("keydown", closeDrawer);
    return () => document.removeEventListener("keydown", closeDrawer);
  }, []);

  const baseRows = useMemo(() => {
    const rows = report?.rows ?? [];
    return activeTab === "payroll" ? rows.filter((row) => row.includeInPayroll && row.hasPayrollData) : rows;
  }, [activeTab, report]);
  const jobTitles = useMemo(() => Array.from(new Set((report?.rows ?? []).map((row) => row.jobTitle))).sort(), [report]);
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("vi");
    return baseRows.filter((row) => {
      const matchesSearch = !needle || `${row.displayName} ${row.email}`.toLocaleLowerCase("vi").includes(needle);
      return matchesSearch && (jobTitle === "all" || row.jobTitle === jobTitle) && (status === "all" || row.status === status);
    });
  }, [baseRows, jobTitle, search, status]);
  const sortedRows = useMemo(() => [...filteredRows].sort((a, b) => {
    const aValue = a[sort.key];
    const bValue = b[sort.key];
    const comparison = typeof aValue === "string"
      ? aValue.localeCompare(String(bValue), "vi")
      : Number(aValue) - Number(bValue);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [filteredRows, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const visibleRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  const payrollRows = useMemo(() => (report?.rows ?? []).filter((row) => row.includeInPayroll && row.hasPayrollData), [report]);
  const totalSalary = payrollRows.reduce((total, row) => total + row.totalSalary, 0);
  const finalizedCount = payrollRows.filter((row) => ["attendance_approved", "payroll_finalized", "paid"].includes(row.status)).length;
  const unresolvedEmployees = payrollRows.filter((row) => row.pendingExceptionCount > 0).length;
  const unresolvedExceptions = (report?.rows ?? []).reduce((total, row) => total + row.pendingExceptionCount, 0);

  function updateSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "displayName" ? "asc" : "desc" });
  }

  function openDetails(row: ReportRow, focus: "summary" | "exceptions" = "summary") {
    setSelectedRow(row);
    setDrawerFocus(focus);
    setReviewNote("");
    setAdjustmentAmount(""); setAdjustmentReason(""); adjustmentKeyRef.current = "";
  }

  async function mutatePeriod(action: "finalize" | "reopen") {
    const confirmed = window.confirm(action === "finalize"
      ? `Chốt kỳ lương ${report?.period.label}? Sau khi chốt, số liệu sẽ được khóa.`
      : `Mở lại kỳ lương ${report?.period.label}? Thao tác này sẽ được ghi vào nhật ký.`);
    if (!confirmed) return;
    setMutating(true);
    setError("");
    try {
      const response = await fetch("/api/reports/payroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, period }),
      });
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Không thể cập nhật kỳ lương.");
      await loadReport();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Không thể cập nhật kỳ lương.");
    } finally {
      setMutating(false);
    }
  }

  async function reviewException(exception: PayrollException, decision: "approved" | "rejected") {
    if (!exception.canReview) return;
    setMutating(true);
    setError("");
    try {
      const response = await fetch("/api/attendance/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: exception.id, decision, reviewerNote: reviewNote.trim() }),
      });
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || "Không thể xử lý ngoại lệ.");
      setReviewNote("");
      await loadReport();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Không thể xử lý ngoại lệ.");
    } finally {
      setMutating(false);
    }
  }

  async function addAdjustment(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedRow || mutating) return;
    setMutating(true); setError("");
    try {
      if (!adjustmentKeyRef.current) adjustmentKeyRef.current = crypto.randomUUID();
      await readJson(await fetch("/api/reports/payroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adjust", id: adjustmentKeyRef.current, period, employeeEmail: selectedRow.email, amount: Number(adjustmentAmount), reason: adjustmentReason }) }));
      adjustmentKeyRef.current = ""; setAdjustmentAmount(""); setAdjustmentReason(""); await loadReport();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu điều chỉnh lương."); }
    finally { setMutating(false); }
  }

  return (
    <div className="stack payroll-report-page">
      <section className="card report-heading-card">
        <div className="report-title-row">
          <div>
            <span className="report-eyebrow"><SlidersHorizontal size={14} /> Trung tâm đối soát nhân sự</span>
            <h2 className="card-title">Báo cáo</h2>
            <p className="card-subtitle">Theo dõi chấm công và chi phí nhân sự theo từng kỳ.</p>
          </div>
          {report && (
            <div className="period-progress" aria-label="Tiến độ kỳ lương">
              <span className={`badge ${report.periodStatus === "reviewing" ? "warning" : "success"}`}>
                {periodStatusLabel(report.periodStatus)}
              </span>
              <strong>{finalizedCount}/{payrollRows.length} nhân viên đã chốt công</strong>
            </div>
          )}
        </div>

        <div className="report-tabs" role="tablist" aria-label="Loại báo cáo">
          <button className={activeTab === "attendance" ? "active" : ""} onClick={() => setActiveTab("attendance")} role="tab" aria-selected={activeTab === "attendance"}>
            <Clock3 size={16} /> Chấm công
          </button>
          {report?.canViewPayroll && (
            <button className={activeTab === "payroll" ? "active" : ""} onClick={() => setActiveTab("payroll")} role="tab" aria-selected={activeTab === "payroll"}>
              <Banknote size={16} /> Bảng lương
            </button>
          )}
        </div>

        <div className="report-filter-grid">
          <label>
            <span>Kỳ lương</span>
            <input type="month" value={draftPeriod} onChange={(event) => setDraftPeriod(event.target.value)} />
          </label>
          <label>
            <span>Cửa hàng</span>
            <select value={report?.storeName ?? ""} disabled aria-label="Cửa hàng hiện tại">
              <option>{report?.storeName ?? "Đang tải…"}</option>
            </select>
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">Tất cả trạng thái</option>
              <option value="unchecked">Chưa kiểm tra</option>
              <option value="exception">Có ngoại lệ</option>
              <option value="attendance_approved">Đã duyệt công</option>
              <option value="payroll_finalized">Đã chốt lương</option>
              <option value="paid">Đã thanh toán</option>
            </select>
          </label>
          <label>
            <span>Chức danh</span>
            <select value={jobTitle} onChange={(event) => setJobTitle(event.target.value)}>
              <option value="all">Tất cả chức danh</option>
              {jobTitles.map((title) => <option key={title} value={title}>{title}</option>)}
            </select>
          </label>
          <button className="button button-compact report-apply-button" onClick={() => setPeriod(draftPeriod)} disabled={!draftPeriod || draftPeriod === period}>
            Áp dụng
          </button>
        </div>
        {report && (
          <div className="data-through-line">
            <CalendarDays size={14} />
            <span>Kỳ {report.period.label}</span>
            <span className="dot-separator">•</span>
            <span>Dữ liệu được tính đến {formatDateTime(report.dataThrough)}</span>
          </div>
        )}
      </section>

      <section className="report-metric-grid">
        {report?.canViewPayroll && <ReportMetric icon={Banknote} tone="pink" value={formatMoney(totalSalary)} label="Tổng lương tạm tính" />}
        <ReportMetric icon={UserCheck} tone="mint" value={`${finalizedCount}/${payrollRows.length}`} label="Đã chốt công" />
        <ReportMetric icon={UsersRound} tone="amber" value={String(Math.max(0, payrollRows.length - finalizedCount))} label="Chưa chốt công" />
        <ReportMetric icon={AlertTriangle} tone="burgundy" value={String(unresolvedExceptions)} label="Ngoại lệ cần xử lý" />
      </section>

      <section className="card report-table-card">
        <div className="report-toolbar">
          <label className="report-search">
            <Search size={16} />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm nhân viên hoặc email…" />
          </label>
          <div className="report-toolbar-actions">
            <div className="export-menu" ref={exportRef}>
              <button className="button-secondary button-compact" onClick={() => setExportOpen((open) => !open)} aria-expanded={exportOpen}>
                <Download size={15} /> Xuất dữ liệu <ChevronDown size={14} />
              </button>
              {exportOpen && (
                <div className="export-popover">
                  {report?.canViewPayroll && <a href={`/api/reports/payroll.xls?period=${encodeURIComponent(period)}`}><FileSpreadsheet size={15} /> Xuất bảng lương Excel</a>}
                  <a href={`/api/reports/attendance.csv?period=${encodeURIComponent(period)}`}><FileText size={15} /> Chi tiết chấm công CSV</a>
                  {report?.canViewPayroll && <button onClick={() => { setActiveTab("payroll"); setExportOpen(false); window.setTimeout(() => window.print(), 80); }}><FileText size={15} /> Xuất phiếu lương PDF</button>}
                  <button onClick={() => { setExportOpen(false); window.print(); }}><Printer size={15} /> In báo cáo</button>
                </div>
              )}
            </div>
            {report?.canManagePayroll && report.periodStatus === "reviewing" && (
              <button className="button button-compact" onClick={() => void mutatePeriod("finalize")} disabled={mutating || unresolvedEmployees > 0} title={unresolvedEmployees > 0 ? "Xử lý hết ngoại lệ trước khi chốt kỳ" : undefined}>
                <LockKeyhole size={15} /> Chốt kỳ lương
              </button>
            )}
            {report?.canManagePayroll && report.periodStatus === "finalized" && (
              <button className="button-secondary button-compact" onClick={() => void mutatePeriod("reopen")} disabled={mutating}>
                <RotateCcw size={15} /> Mở lại kỳ
              </button>
            )}
          </div>
        </div>

        {report?.rows.some((row) => row.snapshotComplete === false) && <p className="attention-card" role="status">Kỳ lương cũ giữ nguyên tổng tiền đã lưu. Các chi tiết không được lưu trước đây được đánh dấu “—”, không tính lại theo đơn giá hiện tại.</p>}
        {error && <div className="report-error" role="alert"><AlertTriangle size={16} /> {error}<button onClick={() => setError("")} aria-label="Đóng thông báo"><X size={14} /></button></div>}
        <div className="report-table-scroll">
          <table className="report-table payroll-table">
            <thead>
              {activeTab === "attendance" ? (
                <tr>
                  <SortableHeader label="Nhân viên" sortKey="displayName" current={sort} onSort={updateSort} sticky />
                  <SortableHeader label="Giờ lịch" sortKey="scheduledMinutes" current={sort} onSort={updateSort} numeric />
                  <SortableHeader label="Giờ ghi nhận" sortKey="recordedMinutes" current={sort} onSort={updateSort} numeric />
                  <SortableHeader label="Giờ đã duyệt" sortKey="approvedMinutes" current={sort} onSort={updateSort} numeric />
                  <SortableHeader label="Tăng ca" sortKey="overtimeMinutes" current={sort} onSort={updateSort} numeric />
                  <th>Đi muộn / Về sớm</th>
                  <SortableHeader label="Ngoại lệ" sortKey="exceptionCount" current={sort} onSort={updateSort} numeric />
                  <SortableHeader label="Trạng thái" sortKey="status" current={sort} onSort={updateSort} />
                </tr>
              ) : (
                <tr>
                  <SortableHeader label="Nhân viên" sortKey="displayName" current={sort} onSort={updateSort} sticky />
                  <SortableHeader label="Giờ duyệt" sortKey="approvedMinutes" current={sort} onSort={updateSort} numeric />
                  <SortableHeader label="Tăng ca" sortKey="overtimeMinutes" current={sort} onSort={updateSort} numeric />
                  <th className="numeric-cell">Đơn giá</th>
                  <th className="numeric-cell">Điều chỉnh</th>
                  <SortableHeader label="Thực nhận" sortKey="totalSalary" current={sort} onSort={updateSort} numeric />
                  <SortableHeader label="Trạng thái" sortKey="status" current={sort} onSort={updateSort} />
                </tr>
              )}
            </thead>
            <tbody>
              {loading && <TableMessage colSpan={activeTab === "attendance" ? 8 : 7}>Đang tổng hợp dữ liệu kỳ lương…</TableMessage>}
              {!loading && visibleRows.map((row) => (
                <tr key={row.email} tabIndex={0} onClick={() => openDetails(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openDetails(row); }} aria-label={`Mở chi tiết ${row.displayName}`}>
                  <td className="employee-cell">
                    <span className="employee-avatar">{initials(row.displayName)}</span>
                    <span><strong>{row.displayName}</strong><small>{row.jobTitle} · {row.email}</small></span>
                  </td>
                  {activeTab === "attendance" ? (
                    <>
                      <td className="numeric-cell">{row.snapshotComplete === false ? "—" : formatMinutes(row.scheduledMinutes)}</td>
                      <td className="numeric-cell">{row.snapshotComplete === false ? "—" : formatMinutes(row.recordedMinutes)}</td>
                      <td className="numeric-cell"><strong>{formatMinutes(row.approvedMinutes)}</strong></td>
                      <td className="numeric-cell">{formatMinutes(row.overtimeMinutes)}</td>
                      <td>{row.snapshotComplete === false ? "—" : `${row.lateCount} lần / ${row.earlyLeaveCount} lần`}</td>
                      <td className="numeric-cell">
                        <button className={`exception-button ${row.pendingExceptionCount > 0 ? "has-exception" : ""}`} onClick={(event) => { event.stopPropagation(); openDetails(row, "exceptions"); }}>
                          {row.snapshotComplete === false ? "—" : row.exceptionCount > 0 ? `${row.exceptionCount} ngoại lệ` : "Không có"}
                        </button>
                      </td>
                      <td><StatusBadge status={row.status} /></td>
                    </>
                  ) : (
                    <>
                      <td className="numeric-cell">{formatMinutes(row.approvedMinutes)}</td>
                      <td className="numeric-cell">{formatMinutes(row.overtimeMinutes)}</td>
                      <td className="numeric-cell">{row.snapshotComplete === false ? "—" : row.compensationType === "monthly" ? `${formatMoney(row.monthlySalary)}/tháng` : `${formatMoney(row.hourlyRate)}/h`}</td>
                      <td className="numeric-cell">{formatSignedMoney(row.allowanceAmount + row.bonusAmount - row.deductionAmount)}</td>
                      <td className="numeric-cell salary-cell"><strong>{formatMoney(row.totalSalary)}</strong></td>
                      <td><StatusBadge status={row.status} /></td>
                    </>
                  )}
                </tr>
              ))}
              {!loading && visibleRows.length === 0 && <TableMessage colSpan={activeTab === "attendance" ? 8 : 7}>Không có nhân viên khớp với bộ lọc hiện tại.</TableMessage>}
            </tbody>
          </table>
        </div>
        <div className="report-pagination">
          <span>Hiển thị {sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedRows.length)} trong {sortedRows.length} nhân viên</span>
          <div>
            <label>Số dòng <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option>10</option><option>25</option><option>50</option></select></label>
            <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} aria-label="Trang trước"><ChevronLeft size={16} /></button>
            <strong>{page}/{pageCount}</strong>
            <button onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} aria-label="Trang sau"><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>

      {selectedRow && (
        <div className="report-drawer-layer" role="presentation">
          <button className="report-drawer-backdrop" onClick={() => setSelectedRow(null)} aria-label="Đóng chi tiết" />
          <aside className="report-drawer" role="dialog" aria-modal="true" aria-labelledby="employee-detail-title">
            <div className="drawer-header">
              <div className="drawer-person">
                <span className="employee-avatar large">{initials(selectedRow.displayName)}</span>
                <div><span className="report-eyebrow">Chi tiết kỳ {report?.period.key}</span><h3 id="employee-detail-title">{selectedRow.displayName}</h3><p>{selectedRow.jobTitle} · {selectedRow.email}</p></div>
              </div>
              <button className="drawer-close" onClick={() => setSelectedRow(null)} aria-label="Đóng"><X size={19} /></button>
            </div>
            <div className="drawer-body">
              {drawerFocus === "exceptions" && <div className="drawer-anchor-note"><AlertTriangle size={15} /> Đang mở danh sách ngoại lệ cần xử lý.</div>}
              <DrawerSection title="Tổng quan kỳ lương">
                <div className="drawer-stat-grid">
                  <DrawerStat label="Giờ lịch" value={selectedRow.snapshotComplete === false ? "—" : formatMinutes(selectedRow.scheduledMinutes)} />
                  <DrawerStat label="Giờ ghi nhận" value={selectedRow.snapshotComplete === false ? "—" : formatMinutes(selectedRow.recordedMinutes)} />
                  <DrawerStat label="Giờ đã duyệt" value={formatMinutes(selectedRow.approvedMinutes)} />
                  <DrawerStat label="Tăng ca" value={formatMinutes(selectedRow.overtimeMinutes)} />
                  <DrawerStat label="Đi muộn" value={selectedRow.snapshotComplete === false ? "—" : `${selectedRow.lateCount} lần`} />
                  <DrawerStat label="Về sớm" value={selectedRow.snapshotComplete === false ? "—" : `${selectedRow.earlyLeaveCount} lần`} />
                </div>
              </DrawerSection>

              {report?.canViewPayroll && selectedRow.includeInPayroll && (
                <>
                  <DrawerSection title="Thu nhập">
                    {selectedRow.snapshotComplete === false ? <p>Không có chi tiết đơn giá lịch sử.</p> : <>
                      <MoneyLine label="Lương cơ bản" value={selectedRow.baseSalary} />
                      <MoneyLine label="Phần tăng ca" value={selectedRow.overtimePay} />
                    </>}
                    <MoneyLine label="Phụ cấp" value={selectedRow.allowanceAmount} />
                    <MoneyLine label="Thưởng" value={selectedRow.bonusAmount} />
                  </DrawerSection>
                  <DrawerSection title="Khấu trừ">
                    <MoneyLine label="Tổng khấu trừ" value={selectedRow.deductionAmount} negative />
                  </DrawerSection>
                  <div className="net-pay-row"><span>Thực nhận</span><strong>{formatMoney(selectedRow.totalSalary)}</strong></div>
                  <DrawerSection title="Điều chỉnh có lý do">
                    {(selectedRow.adjustments ?? []).map((item) => <p key={item.id}>{formatMoney(item.amount)} · {item.reason} · {item.actorEmail}</p>)}
                    {report.canManagePayroll && report.periodStatus === "reviewing" && <form className="operation-form" onSubmit={addAdjustment}>
                      <p>Lương cơ bản = giờ được duyệt × đơn giá. Số tiền dương để cộng, âm để trừ; sửa sai bằng một điều chỉnh bù.</p>
                      <label>Số tiền (đồng)<input type="number" step="1" min="-100000000" max="100000000" required value={adjustmentAmount} onChange={(event) => { setAdjustmentAmount(event.target.value); adjustmentKeyRef.current = ""; }} /></label>
                      <label>Lý do<textarea minLength={5} maxLength={1000} required value={adjustmentReason} onChange={(event) => { setAdjustmentReason(event.target.value); adjustmentKeyRef.current = ""; }} /></label>
                      <button className="button-secondary button-compact" disabled={mutating}>Lưu điều chỉnh</button>
                    </form>}
                  </DrawerSection>
                </>
              )}

              <DrawerSection title={`Ngoại lệ (${selectedRow.exceptions.length})`}>
                {selectedRow.exceptions.length === 0 && <div className="drawer-empty"><CheckCircle2 size={18} /> {selectedRow.snapshotComplete === false ? "Không có dữ liệu ngoại lệ lịch sử." : "Không có ngoại lệ trong kỳ này."}</div>}
                {selectedRow.exceptions.map((exception) => (
                  <article className="drawer-exception" key={exception.id}>
                    <div className="drawer-exception-top"><strong>{formatDate(exception.occurredAt)} · {exception.title}</strong><ExceptionStatus status={exception.status} /></div>
                    {exception.employeeReason && <p>Ghi chú nhân viên: {exception.employeeReason}</p>}
                    {exception.reviewerEmail && <p>Người xử lý: {exception.reviewerEmail}</p>}
                    {exception.reviewerNote && <p>Ghi chú duyệt: {exception.reviewerNote}</p>}
                    {exception.canReview ? (
                      <div className="exception-review-actions">
                        <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Thêm ghi chú xử lý (không bắt buộc)" maxLength={500} />
                        <div><button className="button-secondary button-compact" disabled={mutating} onClick={() => void reviewException(exception, "rejected")}>Từ chối</button><button className="button button-compact" disabled={mutating} onClick={() => void reviewException(exception, "approved")}>Phê duyệt</button></div>
                      </div>
                    ) : exception.status === "pending" && report?.canReviewAttendance && report.periodStatus === "reviewing" && exception.sessionId && exception.correctionAction ? (
                      <AttendanceCorrectionForm sessionId={exception.sessionId} revision={exception.revision} action={exception.correctionAction} onSaved={loadReport} />
                    ) : exception.status === "pending" && report?.canReviewAttendance ? (
                      <Link href="/app/attendance/review" className="text-link">Mở màn hình kiểm tra để chỉnh giờ</Link>
                    ) : null}
                  </article>
                ))}
              </DrawerSection>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function SortableHeader({ label, sortKey, current, onSort, numeric, sticky }: { label: string; sortKey: SortKey; current: { key: SortKey; direction: "asc" | "desc" }; onSort: (key: SortKey) => void; numeric?: boolean; sticky?: boolean }) {
  return <th className={`${numeric ? "numeric-cell" : ""} ${sticky ? "sticky-column" : ""}`}><button className="sort-button" onClick={() => onSort(sortKey)}>{label}<ChevronsUpDown size={13} aria-hidden="true" /><span className="sr-only">{current.key === sortKey ? `Đang sắp xếp ${current.direction === "asc" ? "tăng dần" : "giảm dần"}` : "Sắp xếp cột"}</span></button></th>;
}

function ReportMetric({ icon: Icon, tone, value, label }: { icon: React.ComponentType<{ size?: number }>; tone: string; value: string; label: string }) {
  return <article className="metric-card report-metric"><span className={`metric-icon ${tone}`}><Icon size={17} /></span><strong>{value}</strong><span>{label}</span></article>;
}

function TableMessage({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return <tr><td colSpan={colSpan} className="report-table-message">{children}</td></tr>;
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const tone = status === "exception" ? "warning" : status === "unchecked" ? "neutral" : "success";
  return <span className={`badge ${tone}`}>{statusLabel(status)}</span>;
}

function ExceptionStatus({ status }: { status: PayrollException["status"] }) {
  if (status === "informational") return <span className="badge neutral">Thông tin</span>;
  return <span className={`badge ${status === "pending" ? "warning" : status === "approved" ? "success" : "danger"}`}>{status === "pending" ? "Chờ xử lý" : status === "approved" ? "Đã duyệt" : "Từ chối"}</span>;
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="drawer-section"><h4>{title}</h4>{children}</section>;
}

function DrawerStat({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function MoneyLine({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return <div className="money-line"><span>{label}</span><strong>{negative && value > 0 ? "−" : ""}{formatMoney(value)}</strong></div>;
}

function statusLabel(status: ReportStatus) {
  if (status === "paid") return "Đã thanh toán";
  if (status === "payroll_finalized") return "Đã chốt lương";
  if (status === "attendance_approved") return "Đã duyệt công";
  if (status === "exception") return "Có ngoại lệ";
  return "Chưa kiểm tra";
}

function periodStatusLabel(status: ReportPayload["periodStatus"]) {
  if (status === "paid") return "Đã thanh toán";
  if (status === "finalized") return "Đã chốt bảng lương";
  return "Đang kiểm tra";
}

function formatMinutes(minutes: number) {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  return `${Math.floor(safeMinutes / 60)}h ${String(safeMinutes % 60).padStart(2, "0")}p`;
}

function formatMoney(amount: number) {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(amount || 0))}đ`;
}

function formatSignedMoney(amount: number) {
  if (!amount) return "0đ";
  return `${amount > 0 ? "+" : "−"}${formatMoney(Math.abs(amount))}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]?.toUpperCase()).join("");
}
