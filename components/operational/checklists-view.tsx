"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock3, Plus } from "lucide-react";
import { MotionLoopySticker } from "../loopy-sticker";
import { useLoopyToast } from "../loopy-toast";
import { CelebrationConfetti, TaskSparkleBurst } from "../confetti-sparkles";
import { ApiState, AsyncStatePanel, ListSkeleton, ViewHeader, readJson } from "./shared";

export function PersistentChecklistsView({ canManage = false }: { canManage?: boolean }) {
  const { showLoopyToast, playChime } = useLoopyToast();
  const [items, setItems] = useState<Array<{
    id: string; label: string; assignee: string; required: number; completed: number;
  }>>([]);
  const [state, setState] = useState<ApiState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAssignee, setNewAssignee] = useState("Ca sáng (Mở cửa)");
  const [isRequired, setIsRequired] = useState(true);
  const [activeSparkleId, setActiveSparkleId] = useState<string | null>(null);
  const [triggerCelebration, setTriggerCelebration] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/checklists", { cache: "no-store" })
      .then(readJson<{ items: typeof items }>)
      .then((payload) => { setItems(payload.items ?? []); setState("ready"); })
      .catch(() => setState("error"));
  }, []);

  async function refresh() {
    try {
      const payload = await readJson<{ items: typeof items }>(await fetch("/api/checklists", { cache: "no-store" }));
      setItems(payload.items ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function createChecklist(event: React.FormEvent) {
    event.preventDefault();
    if (!newLabel.trim() || pending) return;
    setPending(true); setError(null);
    try {
    const response = await fetch("/api/checklists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: newLabel,
        assignee: newAssignee,
        required: isRequired,
      }),
    });
    await readJson(response);
      setNewLabel("");
      setShowForm(false);
      showLoopyToast("Đã thêm công việc mới!", { message: newLabel, mood: "checklist", type: "success" });
      await refresh();
    } catch { setError("Chưa lưu được công việc. Vui lòng thử lại."); }
    finally { setPending(false); }
  }

  async function toggle(item: (typeof items)[number]) {
    if (pending) return;
    setPending(true); setError(null);
    const nextCompleted = !item.completed;
    try {
      await readJson(await fetch("/api/checklists", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, completed: nextCompleted }),
      }));
    if (nextCompleted) {
      setActiveSparkleId(item.id);
      playChime("success");
    } else {
      playChime("pop");
    }

    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, completed: nextCompleted ? 1 : 0 } : entry));

    const newDoneCount = items.filter((i) => i.id === item.id ? nextCompleted : i.completed).length;

    if (nextCompleted) {
      if (items.length > 0 && newDoneCount === items.length) {
        setTriggerCelebration(true);
        showLoopyToast("Xuất sắc 100%! 🎉", {
          message: "Tất cả công việc mở ca đã hoàn thành xuất sắc!",
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

    } catch { setError("Chưa lưu được trạng thái checklist. Vui lòng thử lại."); }
    finally { setPending(false); }
  }

  const done = items.filter((item) => item.completed).length;
  const isAllDone = items.length > 0 && done === items.length;

  return (
    <div className="page-grid checklist-page relative">
      <CelebrationConfetti active={triggerCelebration} />

      <section className="card">
        <div className="section-row checklist-heading" style={{ marginBottom: 18 }}>
          <ViewHeader title="Checklist mở ca & vận hành" subtitle={state !== "ready" ? "Chưa xác nhận tiến độ hôm nay" : `${done}/${items.length} công việc hoàn tất hôm nay`} />
          {canManage && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="button button-compact"
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus size={15} /> Thêm công việc
            </motion.button>
          )}
        </div>

        {error && <p role="alert">{error}</p>}
        {pending && <p role="status">Đang lưu…</p>}
        {showForm && canManage && (
          <form className="attention-card operation-form" onSubmit={createChecklist} style={{ marginBottom: 20 }}>
            <div className="field full">
              <label htmlFor="checklist-label">Tên công việc</label>
              <input
                id="checklist-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="VD: Kiểm tra phễu cà phê, lau máy espresso..."
                required
              />
            </div>
            <div className="field">
              <label htmlFor="checklist-assignee">Giai đoạn / Ca</label>
              <select id="checklist-assignee" value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}>
                <option value="Ca sáng (Mở cửa)">Ca sáng (Mở cửa)</option>
                <option value="Ca giữa (Giữa ngày)">Ca giữa (Giữa ngày)</option>
                <option value="Ca tối (Đóng cửa)">Ca tối (Đóng cửa)</option>
                <option value="Toàn bộ ca làm">Toàn bộ ca làm</option>
              </select>
            </div>
            <div className="field" style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 28 }}>
              <input
                id="checklist-required"
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <label htmlFor="checklist-required" style={{ margin: 0, cursor: "pointer" }}>Bắt buộc hoàn thành</label>
            </div>
            <div className="form-actions">
              <button className="button button-compact" type="submit">Lưu công việc</button>
            </div>
          </form>
        )}

        {state === "ready" && <div className="progress"><span style={{ width: items.length ? `${(done / items.length) * 100}%` : "0%" }} /></div>}
        {state === "loading" ? <ListSkeleton rows={5} /> : state === "error" ? <AsyncStatePanel state="error" title="Không thể tải checklist" description="Tiến độ checklist chưa được xác nhận." actionLabel="Thử lại" onAction={() => void refresh()} /> : !items.length ? <AsyncStatePanel state="empty" title="Chưa có công việc trong checklist" description={canManage ? "Tạo công việc đầu tiên để chuẩn hóa quy trình trong ca." : "Quản lý chưa cấu hình công việc cho ca này."} actionLabel={canManage ? "Thêm công việc" : undefined} onAction={canManage ? () => setShowForm(true) : undefined} /> : (
          <div className="list" style={{ marginTop: 18 }}>
            {items.map((item) => (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.01, x: 2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="list-row operation-row-button checklist-task relative"
                onClick={() => toggle(item)}
                style={{
                  minHeight: 54,
                  padding: "12px 14px",
                  borderRadius: 14,
                  marginBottom: 6,
                  border: "1px solid var(--line)",
                  background: item.completed ? "#f8fdfa" : "var(--paper)",
                }}
              >
                <TaskSparkleBurst active={activeSparkleId === item.id} onComplete={() => setActiveSparkleId(null)} />
                <div className="person">
                  <span className={`mini-icon ${item.completed ? "mint" : "pink"}`}>
                    {item.completed ? <Check size={16} /> : <Clock3 size={16} />}
                  </span>
                  <span className="person-copy" style={{ textAlign: "left" }}>
                    <strong style={{ textDecoration: item.completed ? "line-through" : "none", opacity: item.completed ? 0.6 : 1 }}>
                      {item.label.replace(/<[^>]*>/g, "").replace(/thi\?u/gi, "thiếu").replace(/gi\?y/gi, "giấy").replace(/\?/g, "")}
                    </strong>
                    <small>{item.assignee} · {item.required ? "Bắt buộc *" : "Tùy chọn"}</small>
                  </span>
                </div>
                <span className={`badge ${item.completed ? "success" : "neutral"}`}>
                  {item.completed ? "✓ Đã xong" : "⚪ Đánh dấu"}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      <aside className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <motion.div
          key={done}
          initial={{ opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="loopy-speech-bubble"
        >
          {isAllDone
            ? "Tuyệt vời quá! Loopy rất tự hào về bạn! Ca làm đã chuẩn bị 100%!"
            : done > 0
            ? `Cố lên! Bạn đã làm xong ${done} việc, còn ${items.length - done} việc nữa!`
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
            : "Chủ quán và quản lý có thể thêm công việc mới vào danh sách checklist bất cứ lúc nào."}
        </p>
      </aside>
    </div>
  );
}
