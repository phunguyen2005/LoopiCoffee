"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ViewHeader, initials, readJson, formatDateVN, formatTime } from "./shared";

type RequestRow = { id: string; employee_name: string; type: string; title: string; reason: string; status: string; created_at: string; starts_at: string | null; ends_at: string | null };
type OwnShift = { id: string; employee_email: string; starts_at: string; ends_at: string; status: string; approved_leave_request_id: string | null };

export function PersistentRequestsView({ canApprove = false }: { canApprove?: boolean }) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [shifts, setShifts] = useState<OwnShift[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("leave");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const key = useRef("");
  const refresh = useCallback(async () => {
    const [payload, schedule] = await Promise.all([
      fetch("/api/requests", { cache: "no-store" }).then(readJson<{ requests: RequestRow[]; actorEmail: string }>),
      fetch("/api/shifts", { cache: "no-store" }).then(readJson<{ shifts: OwnShift[] }>),
    ]);
    setRequests(payload.requests);
    setShifts(schedule.shifts.filter((shift) => shift.employee_email.toLowerCase() === payload.actorEmail.toLowerCase() && shift.status === "published" && !shift.approved_leave_request_id));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Không thể tải yêu cầu.")).finally(() => setLoading(false)); }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  async function create(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!key.current) key.current = crypto.randomUUID();
      await readJson(await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, title, reason, shiftId: type === "leave" ? shiftId : undefined, idempotencyKey: key.current }) }));
      key.current = ""; setShowForm(false); setTitle(""); setReason(""); setShiftId(""); setNotice("Đã gửi yêu cầu."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể gửi yêu cầu."); }
    finally { setBusy(false); }
  }
  async function decide(id: string, decision: "approved" | "rejected") {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await readJson<{ coverageWarning?: string }>(await fetch("/api/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision }) }));
      setNotice(result.coverageWarning || "Đã lưu quyết định."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xử lý yêu cầu."); }
    finally { setBusy(false); }
  }
  return <div className="page-grid"><section className="card">
    <div className="section-row" style={{ marginBottom: 18 }}><ViewHeader title="Yêu cầu cửa hàng" subtitle={`${requests.filter((item) => item.status === "pending").length} yêu cầu chờ duyệt`} /><button className="button button-compact" disabled={busy} onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Tạo yêu cầu</button></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading && <p>Đang tải yêu cầu…</p>}
    {showForm && <form className="attention-card operation-form" onSubmit={create}>
      <div className="field"><label htmlFor="request-type">Loại</label><select id="request-type" disabled={busy} value={type} onChange={(event) => { setType(event.target.value); key.current = ""; }}><option value="leave">Nghỉ một ca</option><option value="swap">Đề nghị đổi ca</option><option value="correction">Đề nghị sửa chấm công</option></select></div>
      {type === "leave" && <div className="field"><label htmlFor="request-shift">Ca xin nghỉ</label><select id="request-shift" disabled={busy} required value={shiftId} onChange={(event) => { setShiftId(event.target.value); key.current = ""; }}><option value="">Chọn ca của bạn</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{formatDateVN(new Date(shift.starts_at))} · {formatTime(shift.starts_at)}–{formatTime(shift.ends_at)}</option>)}</select><small>Hiển thị ca từ tuần trước đến 31 ngày tới.</small></div>}
      <div className="field"><label htmlFor="request-title">Tiêu đề</label><input id="request-title" disabled={busy} maxLength={180} value={title} onChange={(event) => { setTitle(event.target.value); key.current = ""; }} required /></div>
      <div className="field full"><label htmlFor="request-reason">Lý do</label><textarea id="request-reason" disabled={busy} minLength={5} maxLength={1000} value={reason} onChange={(event) => { setReason(event.target.value); key.current = ""; }} required /></div>
      <div className="form-actions"><button className="button button-compact" disabled={busy} type="submit">{busy ? "Đang gửi…" : "Gửi yêu cầu"}</button></div>
    </form>}
    {!loading && !requests.length && <p>Chưa có yêu cầu nào.</p>}
    <div className="list">{requests.map((item) => <div className="list-row" key={item.id}>
      <div className="person"><span className="avatar">{initials(item.employee_name)}</span><span className="person-copy"><strong>{item.title}</strong><small>{item.employee_name} · {item.reason}</small>{item.starts_at && <small>{formatDateVN(new Date(item.starts_at))} · {formatTime(item.starts_at)}–{formatTime(item.ends_at!)}</small>}</span></div>
      <div className="row-actions">{item.status === "pending" && canApprove ? <><button className="text-link" disabled={busy} onClick={() => void decide(item.id, "approved")}>Duyệt</button><button className="text-link danger-text" disabled={busy} onClick={() => void decide(item.id, "rejected")}>Từ chối</button></> : <span className={`badge ${item.status === "approved" ? "success" : item.status === "rejected" ? "danger" : "warning"}`}>{item.status === "approved" ? "Đã duyệt" : item.status === "rejected" ? "Đã từ chối" : "Đang chờ"}</span>}</div>
    </div>)}</div>
  </section><aside className="card"><ViewHeader title="Nguyên tắc" subtitle="Giữ nguyên dữ liệu gốc" /><p className="supporting-copy">Nghỉ một ca được duyệt sẽ đánh dấu ca nghỉ và không tính vắng. Quản lý bố trí người thay. Đề nghị đổi ca hoặc sửa công cần quản lý thực hiện trên màn hình tương ứng; quyết định yêu cầu không tự thay đổi các dữ liệu đó.</p></aside></div>;
}
