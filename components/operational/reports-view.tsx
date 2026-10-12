"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, UsersRound, Wallet } from "lucide-react";
import { MetricCard, ViewHeader, formatWorkedMinutes, readJson, roleLabel } from "./shared";

export function PersistedReportsView() {
  const [summary, setSummary] = useState<Array<{
    displayName: string; email: string; role: string; workedMinutes: number; shiftCount: number; exceptionCount: number; hourlyRate: number; estimatedSalary: number;
  }>>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/reports/attendance", { cache: "no-store" })
      .then(readJson<{ rows: typeof summary; isOwner?: boolean; isOwnerOrManager?: boolean }>)
      .then((payload) => {
        setSummary(payload.rows ?? []);
        setIsOwner(Boolean(payload.isOwner || payload.isOwnerOrManager));
      });
  }, []);

  const filteredSummary = useMemo(() => {
    if (!search.trim()) return summary;
    const lower = search.toLowerCase();
    return summary.filter((row) => row.displayName.toLowerCase().includes(lower) || row.email.toLowerCase().includes(lower));
  }, [summary, search]);

  const totalMinutes = useMemo(() => filteredSummary.reduce((total, row) => total + row.workedMinutes, 0), [filteredSummary]);
  const totalSalary = useMemo(() => filteredSummary.reduce((total, row) => total + (row.estimatedSalary || 0), 0), [filteredSummary]);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
  };

  return (
    <div className="stack">
      <section className="metric-grid">
        {isOwner && (
          <MetricCard icon={Wallet} tone="pink" value={formatVND(totalSalary)} label="Tổng quỹ lương tạm tính" />
        )}
        <MetricCard icon={Clock3} tone="mint" value={formatWorkedMinutes(totalMinutes)} label="Tổng giờ đã ghi nhận" />
        <MetricCard icon={UsersRound} tone="amber" value={String(filteredSummary.length)} label="Nhân viên có dữ liệu" />
        <MetricCard icon={CheckCircle2} tone="burgundy" value={String(filteredSummary.reduce((total, row) => total + row.shiftCount, 0))} label="Phiên chấm công tháng" />
      </section>
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <ViewHeader title="Báo cáo & Tổng hợp lương tháng" subtitle="Thống kê giờ công & tính lương tự động cho cửa hàng" />
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="search"
              placeholder="Tìm theo tên nhân viên…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid var(--line)",
                fontSize: 12,
                background: "var(--paper)",
              }}
            />
            <a href="/api/reports/attendance.csv" className="button button-compact"><Download size={15} /> Xuất CSV</a>
          </div>
        </div>
        <div className="schedule-grid">
          <table className="report-table">
            <thead>
              <tr>
                {["Nhân viên", "Chức danh", "Mức lương/h", "Giờ công", "Số phiên", "Ngoại lệ", "Tổng lương tạm tính"].map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSummary.map((row) => (
                <tr key={row.displayName}>
                  <td>
                    <strong>{row.displayName}</strong>
                    <br />
                    <small style={{ color: "var(--muted)", fontSize: 11 }}>{row.email}</small>
                  </td>
                  <td>
                    <span className={`badge ${row.role === "owner" ? "burgundy" : row.role === "manager" ? "warning" : "neutral"}`}>
                      {roleLabel(row.role)}
                    </span>
                  </td>
                  <td>{formatVND(row.hourlyRate)}/h</td>
                  <td><strong>{formatWorkedMinutes(row.workedMinutes)}</strong></td>
                  <td>{row.shiftCount} ca</td>
                  <td>
                    <span className={`badge ${row.exceptionCount > 0 ? "warning" : "success"}`}>
                      {row.exceptionCount > 0 ? `${row.exceptionCount} ngoại lệ` : "0 ngoại lệ"}
                    </span>
                  </td>
                  <td>
                    <strong style={{ color: "#6f2939", fontSize: 14 }}>{formatVND(row.estimatedSalary)}</strong>
                  </td>
                </tr>
              ))}
              {filteredSummary.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)" }}>
                    Không tìm thấy dữ liệu nhân viên khớp với từ khóa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
