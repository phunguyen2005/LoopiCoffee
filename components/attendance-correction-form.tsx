"use client";

import { useState } from "react";
import { readJson } from "@/platform/http/client";

export function AttendanceCorrectionForm({ sessionId, revision, action, onSaved }: { sessionId: string; revision?: number; action: "check_in" | "check_out"; onSaved: () => Promise<void> }) {
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="operation-form" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await readJson(await fetch("/api/attendance/review", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adjust_time", sessionId, attendanceAction: action, expectedRevision: revision, adjustedTime: `${time}:00+07:00`, reason }) }));
      setTime(""); setReason(""); await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu giờ điều chỉnh."); }
    finally { setBusy(false); }
  }}>
    <label>Giờ {action === "check_in" ? "vào" : "ra"} được xác nhận (GMT+7)<input type="datetime-local" required value={time} onChange={(event) => setTime(event.target.value)} /></label>
    <label>Lý do đối soát<textarea required minLength={5} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <button className="button-secondary button-compact" disabled={busy}>Lưu giờ đã đối soát</button>
  </form>;
}
