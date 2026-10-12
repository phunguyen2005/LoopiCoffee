"use client";

import React, { useEffect, useState, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { ViewHeader, formatDateTime, readJson } from "./shared";

export function PersistentHandoversView() {
  const [handovers, setHandovers] = useState<Array<{
    id: string; summary: string; manager_attention: number; created_at: string; author_name: string;
  }>>([]);
  const [unfinished, setUnfinished] = useState("");
  const [stock, setStock] = useState("");
  const [equipment, setEquipment] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveLock = useRef(false);

  useEffect(() => {
    void fetch("/api/handovers", { cache: "no-store" })
      .then(readJson<{ handovers: typeof handovers }>)
      .then((payload) => setHandovers(payload.handovers ?? []))
      .catch(() => setError("Không tải được nội dung bàn giao. Vui lòng thử lại."))
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    try {
      setError(null);
      const payload = await readJson<{ handovers: typeof handovers }>(await fetch("/api/handovers", { cache: "no-store" }));
      setHandovers(payload.handovers ?? []);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không tải được nội dung bàn giao."); }
    finally { setLoading(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saveLock.current) return;
    const summary = [
      unfinished && `Việc chưa hoàn tất: ${unfinished}`,
      stock && `Sắp hết: ${stock}`,
      equipment && `Thiết bị: ${equipment}`,
      note && `Ghi chú: ${note}`,
    ].filter(Boolean).join("\n");
    if (summary.length > 2000) { setError("Nội dung bàn giao tối đa 2.000 ký tự."); return; }
    saveLock.current = true; setSaving(true); setSaved(false); setError(null);
    try {
      await readJson(await fetch("/api/handovers", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary, managerAttention: Boolean(stock || equipment) }),
      }));
      setSaved(true);
      setUnfinished(""); setStock(""); setEquipment(""); setNote("");
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Chưa xác nhận được bàn giao. Kiểm tra danh sách trước khi gửi lại."); }
    finally { saveLock.current = false; setSaving(false); }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <ViewHeader title="Bàn giao ca" subtitle="Nội dung được lưu cho ca sau và quản lý" />
        {error && <p role="alert" className="inline-error">{error} <button type="button" className="text-link" onClick={refresh}>Tải lại</button></p>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="unfinished">Việc chưa hoàn tất</label><textarea id="unfinished" value={unfinished} onChange={(event) => setUnfinished(event.target.value)} /></div>
            <div className="field"><label htmlFor="stock">Nguyên liệu / bao bì sắp hết</label><textarea id="stock" value={stock} onChange={(event) => setStock(event.target.value)} /></div>
            <div className="field"><label htmlFor="equipment">Thiết bị cần lưu ý</label><textarea id="equipment" value={equipment} onChange={(event) => setEquipment(event.target.value)} /></div>
            <div className="field full"><label htmlFor="next-note">Ghi chú cho ca sau</label><textarea id="next-note" value={note} onChange={(event) => setNote(event.target.value)} /></div>
          </div>
          <div className="form-actions"><button className="button button-compact" type="submit" disabled={saving || [unfinished, stock, equipment, note].join("").trim().length < 10}>{saving ? "Đang lưu…" : "Gửi bàn giao"}</button></div>
        </form>
      </section>
      <aside className="card">
        <ViewHeader title="Bàn giao gần đây" subtitle={loading ? "Đang tải…" : `${(handovers ?? []).length} bản ghi đã lưu`} />
        <div className="list">
          {!loading && !handovers.length && <p className="supporting-copy">Chưa có bàn giao nào.</p>}
          {(handovers ?? []).map((handover) => (
            <div className="list-row" key={handover.id} style={{ flexWrap: "wrap" }}>
              <span className="person-copy"><strong>{handover.author_name}</strong><small>{formatDateTime(handover.created_at)}</small></span>
              <span className={`badge ${handover.manager_attention ? "warning" : "success"}`}>{handover.manager_attention ? "Cần chú ý" : "Đã lưu"}</span>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", width: "100%", margin: "8px 0", fontSize: 13 }}>{handover.summary}</p>
            </div>
          ))}
        </div>
        {saved && <div className="toast"><CheckCircle2 size={17} /> Bàn giao đã được lưu.</div>}
      </aside>
    </div>
  );
}
