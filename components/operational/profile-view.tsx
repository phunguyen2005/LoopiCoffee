"use client";
import { readJson } from "@/platform/http/client";

import React, { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ViewHeader, initials, roleLabel } from "./shared";

export function PersistedProfileView({
  initialUser,
}: {
  initialUser: { email: string; displayName: string; role: string };
}) {
  const [displayName, setDisplayName] = useState(initialUser.displayName);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const currentInitials = displayName.trim()
    ? displayName.trim().split(" ").slice(-2).map((p) => p[0]).join("").toUpperCase()
    : initials(initialUser.displayName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setIsSuccess(false);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      const payload = await readJson<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Không thể cập nhật tên.");
      }
      setIsSuccess(true);
      setMessage("Đã cập nhật tên hiển thị thành công!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra.";
      setMessage(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <ViewHeader
          title="Thông tin cá nhân"
          subtitle="Cập nhật tên hiển thị của bạn trên toàn hệ thống LoopiCafe"
        />

        <form onSubmit={handleSubmit} className="operation-form" style={{ marginTop: 20 }}>
          {message && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 16,
                marginBottom: 16,
                background: isSuccess ? "#dff3ea" : "#fff2f4",
                border: `1px solid ${isSuccess ? "#b8e6d3" : "#ffe1e7"}`,
                color: isSuccess ? "#4c9779" : "#c75865",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {isSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{message}</span>
            </div>
          )}

          <div className="field full">
            <label htmlFor="user-display-name">Họ và tên hiển thị</label>
            <input
              id="user-display-name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Nhập tên của bạn…"
            />
            <small style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, display: "block" }}>
              Tên này sẽ hiển thị trên lịch làm việc, báo cáo chấm công và danh sách đội ngũ.
            </small>
          </div>

          <div className="field full">
            <label htmlFor="user-email-readonly">Địa chỉ Email</label>
            <input
              id="user-email-readonly"
              type="email"
              disabled
              value={initialUser.email}
              style={{ opacity: 0.7, cursor: "not-allowed", background: "#f8f5f2" }}
            />
          </div>

          <div className="form-actions" style={{ marginTop: 24 }}>
            <button className="button button-compact" type="submit" disabled={submitting}>
              {submitting ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </section>

      <aside className="card">
        <ViewHeader title="Thẻ nhân sự" subtitle="Hồ sơ tài khoản hiện tại" />
        <div style={{ textAlign: "center", padding: "24px 12px" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: "#fff2f4",
              border: "1px solid #ffe1e7",
              color: "#6f2939",
              fontSize: 24,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            {currentInitials}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#332a2b", margin: 0 }}>
            {displayName || initialUser.displayName}
          </h3>
          <p style={{ fontSize: 12, color: "#7b6f70", margin: "4px 0 12px" }}>{initialUser.email}</p>
          <span className="badge burgundy">{roleLabel(initialUser.role)}</span>
        </div>
      </aside>
    </div>
  );
}
