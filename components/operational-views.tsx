"use client";

import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  MapPin,
  PackageOpen,
  Plus,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoopySticker, MotionLoopySticker, type StickerMood } from "./loopy-sticker";
import { useLoopyToast } from "./loopy-toast";
import { TaskSparkleBurst, CelebrationConfetti } from "./confetti-sparkles";
export { AdminAccountsView } from "./admin-accounts-view";

type ApiState = "loading" | "ready" | "error";
type ShiftPreset = "morning" | "evening" | "full" | "custom";

const DAY_CHIP_LABELS = [
  { key: 0, label: "T2" },
  { key: 1, label: "T3" },
  { key: 2, label: "T4" },
  { key: 3, label: "T5" },
  { key: 4, label: "T6" },
  { key: 5, label: "T7" },
  { key: 6, label: "CN" },
] as const;

export function OperationsDashboardView() {
  const [data, setData] = useState<{
    metrics: { activeStaff: number; pendingExceptions: number; checklistDone: number; checklistTotal: number; openIncidents: number };
    nextShifts: Array<{ id: string; employee_name: string; starts_at: string; ends_at: string; role_label: string }>;
    latestHandover: { summary: string; created_at: string; author_name: string } | null;
  } | null>(null);
  const loadDashboard = () => {
    fetch("/api/dashboard", { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(readJson)
      .then(setData)
      .catch(() => {});
  };

  useEffect(() => {
    loadDashboard();
    window.addEventListener("focus", loadDashboard);
    return () => window.removeEventListener("focus", loadDashboard);
  }, []);
  const metrics = data?.metrics ?? { activeStaff: 0, pendingExceptions: 0, checklistDone: 0, checklistTotal: 0, openIncidents: 0 };
  const isStoreOpen = metrics.activeStaff > 0;
  const hasUpcomingShifts = (data?.nextShifts ?? []).length > 0;
  // Shift is due but 0 staff active = Panicked state!
  const isShiftUnattended = !isStoreOpen && hasUpcomingShifts;

  const mascotMood: StickerMood = isShiftUnattended
    ? "panicked"
    : metrics.pendingExceptions > 0
    ? "worries"
    : isStoreOpen
    ? "cheer"
    : "sleeping";

  return (
    <div className="stack">
      <section className="hero-status-card relative overflow-hidden" style={{
        borderColor: isShiftUnattended ? "#f4a9b7" : undefined,
        background: isShiftUnattended
          ? "linear-gradient(135deg, #fff2f4 0%, #fffaf5 100%)"
          : undefined,
      }}>
        <div className="hero-status-copy">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <span className={`badge ${isStoreOpen ? "success" : isShiftUnattended ? "danger" : "neutral"}`} style={{ fontSize: 11, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {isStoreOpen ? <span className="pulse-dot" /> : isShiftUnattended ? "⚠️ CHƯA CHECK-IN TRỰC CA" : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#999" }} />}
              {isStoreOpen ? "CỬA HÀNG ĐANG VÀO CA" : isShiftUnattended ? "ĐẾN CA NƯỚC MÀ CHƯA CÓ NHÂN VIÊN" : "CHƯA CÓ CA LÀM"}
            </span>
            <span className="status-label"><CheckCircle2 size={14} /> Dữ liệu trực tiếp</span>
          </div>
          <h2>
            {isShiftUnattended
              ? "Ááá! Đã đến ca làm nhưng chưa có nhân viên nào check-in!"
              : metrics.pendingExceptions
              ? `${metrics.pendingExceptions} ngoại lệ cần duyệt ngay`
              : isStoreOpen
              ? "Mọi việc tại cửa hàng đang đúng nhịp"
              : "Cửa hàng hiện chưa có ca trực"}
          </h2>
          <p>
            {isShiftUnattended
              ? "Ối ối! Ca trực đã đến giờ rồi mà chưa thấy nhân viên nào có mặt tại quán... Quản lý ơi kiểm tra ngay giúp Loopy với! 😱"
              : "Tóm tắt vận hành hôm nay cho Chủ quán & Quản lý."}
          </p>
          <div className="status-metrics">
            <span><strong>{metrics.activeStaff}</strong><small>đang có mặt</small></span>
            <span><strong>{metrics.checklistDone}/{metrics.checklistTotal}</strong><small>mở ca xong</small></span>
            <span><strong>{metrics.pendingExceptions}</strong><small>ngoại lệ chờ</small></span>
          </div>
        </div>
        <div className="hero-status-mascot" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {isShiftUnattended && (
            <div className="loopy-speech-bubble" style={{ fontSize: 11, padding: "6px 10px", marginBottom: 4 }}>
              "Loopy lo quá đi thôi! 😭"
            </div>
          )}
          <MotionLoopySticker mood={mascotMood} size={135} />
        </div>
      </section>
      <section className="metric-grid">
        <motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Link href="/app/schedule" style={{ textDecoration: "none" }}>
            <MetricCard icon={UsersRound} tone="mint" value={String(metrics.activeStaff)} label="Đang có mặt tại quán" />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Link href="/app/attendance/review" style={{ textDecoration: "none" }}>
            <MetricCard icon={AlertCircle} tone="pink" value={String(metrics.pendingExceptions)} label="Ngoại lệ chờ duyệt" />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Link href="/app/checklists" style={{ textDecoration: "none" }}>
            <MetricCard icon={CheckCircle2} tone="amber" value={`${metrics.checklistDone}/${metrics.checklistTotal}`} label="Mở ca hoàn tất" />
          </Link>
        </motion.div>
        <motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Link href="/app/issues" style={{ textDecoration: "none" }}>
            <MetricCard icon={PackageOpen} tone="burgundy" value={String(metrics.openIncidents)} label="Sự cố đang xử lý" />
          </Link>
        </motion.div>
      </section>
      <div className="page-grid">
        <section className="card">
          <div className="card-header"><ViewHeader title="Ca sắp tới" subtitle="Lịch đã xuất bản trong cửa hàng" /><Link className="text-link" href="/app/schedule">Quản lý lịch</Link></div>
          <div className="list">
            {(data?.nextShifts ?? []).map((shift) => (
              <div className="list-row" key={shift.id}>
                <div className="person"><span className="mini-icon mint"><CalendarDays size={15} /></span><span className="person-copy"><strong>{shift.employee_name}</strong><small>{formatDateTime(shift.starts_at)} — {formatTime(shift.ends_at)}</small></span></div>
                <span className="badge success">{shift.role_label}</span>
              </div>
            ))}
            {data && (data.nextShifts ?? []).length === 0 && <p className="supporting-copy">Chưa có ca sắp tới. Hãy xuất bản lịch trước khi bật chấm công cho nhân viên.</p>}
          </div>
        </section>
        <aside className="card">
          <div className="card-header"><ViewHeader title="Bàn giao mới nhất" subtitle={data?.latestHandover ? `${data.latestHandover.author_name} · ${formatDateTime(data.latestHandover.created_at)}` : "Chưa có bàn giao"} /></div>
          <p className="supporting-copy preserve-lines">{data?.latestHandover?.summary ?? "Bàn giao sau khi kết thúc ca để thông tin không bị thất lạc."}</p>
        </aside>
      </div>
    </div>
  );
}

export function EmployeeTodayView() {
  const [data, setData] = useState<{
    shift: { starts_at: string; ends_at: string; role_label: string; is_shift_lead: number } | null;
    attendance: { opened_at: string | null; closed_at: string | null; status: string } | null;
    checklist: { total: number; done: number };
  } | null>(null);

  const loadToday = () => {
    fetch("/api/today", { cache: "no-store", headers: { "Cache-Control": "no-cache" } })
      .then(readJson)
      .then(setData)
      .catch(() => {});
  };

  useEffect(() => {
    loadToday();
    window.addEventListener("focus", loadToday);
    return () => window.removeEventListener("focus", loadToday);
  }, []);

  const hasShift = Boolean(data?.shift);
  const checklistCount = data?.checklist?.total ?? 0;
  const checklistDone = data?.checklist?.done ?? 0;
  const hasCheckedIn = Boolean(data?.attendance?.opened_at);
  const hasCheckedOut = Boolean(data?.attendance?.closed_at);
  const checklistComplete = checklistCount > 0 && checklistDone >= checklistCount;
  const checklistProgress = checklistCount > 0 ? Math.min(100, (checklistDone / checklistCount) * 100) : 0;
  const primaryAction = !hasShift
    ? { href: "/app/schedule", label: "Xem lịch của tôi", icon: CalendarDays }
    : !hasCheckedIn
    ? { href: "/app/attendance", label: "Chấm công vào ca", icon: Clock3 }
    : !checklistComplete
    ? { href: "/app/checklists", label: "Tiếp tục checklist", icon: Check }
    : { href: "/app/handovers", label: "Chuẩn bị bàn giao ca", icon: UserRound };
  const PrimaryIcon = primaryAction.icon;

  return (
    <div className="stack employee-today-view">
      <section className="today-summary-card">
        <div className="today-summary-content">
          <div className="today-summary-heading">
            <span className={`today-live-status ${hasCheckedIn && !hasCheckedOut ? "is-live" : ""}`}>
              <span aria-hidden="true" />
              {hasCheckedOut ? "Đã hoàn tất ca" : hasCheckedIn ? "Đang trong ca" : hasShift ? "Sắp đến ca" : "Chưa có ca"}
            </span>
            <span className="today-store-label">Cửa hàng chính</span>
          </div>
          <span className="today-kicker">Ca hôm nay</span>
          <h2>{hasShift ? `${formatTime(data!.shift!.starts_at)} — ${formatTime(data!.shift!.ends_at)}` : "Một ngày thật nhẹ nhàng"}</h2>
          <p>{hasShift ? `${data!.shift!.role_label}${data!.shift!.is_shift_lead ? " · Trưởng ca" : ""}` : "Bạn chưa có ca được phân công. Hãy xem lịch để chuẩn bị cho ca tiếp theo."}</p>

          <div className="today-summary-metrics">
            <div><span>Vào ca</span><strong>{hasCheckedIn ? formatTime(data!.attendance!.opened_at!) : "Chưa chấm"}</strong></div>
            <div><span>Checklist</span><strong>{checklistDone}/{checklistCount} việc</strong></div>
            <div><span>Bàn giao</span><strong>{hasCheckedOut ? "Đã xong" : "Chưa hoàn tất"}</strong></div>
          </div>

          <Link href={primaryAction.href} className="button today-primary-action">
            <PrimaryIcon size={18} /> {primaryAction.label}
          </Link>
        </div>
        <div className="today-summary-mascot" aria-hidden="true">
          <LoopySticker mood={hasCheckedOut ? "celebrate" : hasShift ? "working" : "shy"} size={138} />
        </div>
      </section>

      {hasShift ? (
        <section className="card today-flow-card">
          <div className="section-row today-flow-heading">
            <ViewHeader title="Tiến trình ca làm" subtitle="Chạm vào từng bước để tiếp tục" />
            <span className="badge info">{hasCheckedOut ? "4/4" : checklistComplete ? "2/4" : hasCheckedIn ? "1/4" : "0/4"}</span>
          </div>
          <div className="today-task-flow">
            <Link href="/app/attendance" className={`today-task-step ${hasCheckedIn ? "complete" : "current"}`}>
              <span className="today-step-marker">{hasCheckedIn ? <Check size={16} /> : "1"}</span>
              <span><small>Chấm vào ca</small><strong>{hasCheckedIn ? formatTime(data!.attendance!.opened_at!) : "Chờ chụp ảnh"}</strong><em>{hasCheckedIn ? "Hoàn thành" : "Cần làm tiếp"}</em></span>
              <span className="today-step-arrow">›</span>
            </Link>
            <Link href="/app/checklists" className={`today-task-step ${checklistComplete ? "complete" : hasCheckedIn ? "current" : "locked"}`}>
              <span className="today-step-marker">{checklistComplete ? <Check size={16} /> : "2"}</span>
              <span><small>Checklist mở ca</small><strong>{checklistDone}/{checklistCount} công việc</strong><em>{checklistComplete ? "Hoàn thành" : hasCheckedIn ? "Đang thực hiện" : "Chưa đến bước"}</em></span>
              <span className="today-step-arrow">›</span>
            </Link>
            <Link href="/app/handovers" className={`today-task-step ${checklistComplete ? "current" : "pending"}`}>
              <span className="today-step-marker">3</span>
              <span><small>Bàn giao ca</small><strong>Ghi chú cho ca sau</strong><em>{checklistComplete ? "Có thể bắt đầu" : "Chưa bắt đầu"}</em></span>
              <span className="today-step-arrow">›</span>
            </Link>
            <Link href="/app/attendance" className={`today-task-step ${hasCheckedOut ? "complete" : "locked"}`}>
              <span className="today-step-marker">{hasCheckedOut ? <Check size={16} /> : "4"}</span>
              <span><small>Chấm ra ca</small><strong>{hasCheckedOut ? formatTime(data!.attendance!.closed_at!) : formatTime(data!.shift!.ends_at)}</strong><em>{hasCheckedOut ? "Hoàn thành" : "Chưa đến giờ"}</em></span>
              <span className="today-step-arrow">›</span>
            </Link>
          </div>
        </section>
      ) : (
        <section className="card today-empty-actions">
          <ViewHeader title="Chuẩn bị cho ca tiếp theo" subtitle="Lịch làm và yêu cầu của bạn luôn ở đây" />
          <div>
            <Link href="/app/schedule" className="button-secondary"><CalendarDays size={16} /> Xem lịch làm việc</Link>
            <Link href="/app/requests" className="button-secondary"><UserRound size={16} /> Gửi yêu cầu</Link>
          </div>
        </section>
      )}

      <section className="today-checklist-strip">
        <div className="today-checklist-copy">
          <span className="mini-icon pink"><Check size={17} /></span>
          <div><small>Công việc trong ca</small><strong>{checklistCount > 0 ? `${checklistDone} trên ${checklistCount} việc đã xong` : "Chưa có checklist hôm nay"}</strong></div>
        </div>
        <div className="progress"><span style={{ width: `${checklistProgress}%` }} /></div>
        <Link href="/app/checklists">Mở checklist <span>›</span></Link>
      </section>

      <Link href={primaryAction.href} className="button mobile-sticky-primary">
        <PrimaryIcon size={18} /> {primaryAction.label}
      </Link>
    </div>
  );
}

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

  useEffect(() => {
    fetch("/api/checklists", { cache: "no-store" })
      .then(readJson)
      .then((payload) => { setItems(payload.items ?? []); setState("ready"); })
      .catch(() => setState("error"));
  }, []);

  async function refresh() {
    try {
      const payload = await readJson(await fetch("/api/checklists", { cache: "no-store" }));
      setItems(payload.items ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  async function createChecklist(event: React.FormEvent) {
    event.preventDefault();
    if (!newLabel.trim()) return;
    const response = await fetch("/api/checklists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: newLabel,
        assignee: newAssignee,
        required: isRequired,
      }),
    });
    if (response.ok) {
      setNewLabel("");
      setShowForm(false);
      showLoopyToast("Đã thêm công việc mới!", { message: newLabel, mood: "checklist", type: "success" });
      await refresh();
    }
  }

  async function toggle(item: (typeof items)[number]) {
    const nextCompleted = !item.completed;

    // Sparkle animation & sound
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

    const response = await fetch("/api/checklists", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, completed: nextCompleted }),
    });
    if (!response.ok) {
      setItems((current) => current.map((entry) => entry.id === item.id ? item : entry));
    }
  }

  const done = items.filter((item) => item.completed).length;
  const isAllDone = items.length > 0 && done === items.length;

  return (
    <div className="page-grid relative">
      <CelebrationConfetti active={triggerCelebration} />

      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <ViewHeader title="Checklist mở ca & vận hành" subtitle={state === "loading" ? "Đang tải công việc…" : `${done}/${items.length} công việc hoàn tất`} />
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

        <div className="progress"><span style={{ width: items.length ? `${(done / items.length) * 100}%` : "0%" }} /></div>
        {state === "error" ? <InlineError text="Không tải được checklist. Vui lòng thử lại." /> : (
          <div className="list" style={{ marginTop: 18 }}>
            {items.map((item) => (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.01, x: 2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="list-row operation-row-button relative"
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
                    <strong style={{ textDecoration: item.completed ? "line-through" : "none", opacity: item.completed ? 0.6 : 1, fontSize: 13 }}>
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
        {/* Dynamic Loopy Speech Bubble */}
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

export function PersistentIssuesView({ canManage = false }: { canManage?: boolean }) {
  const [issues, setIssues] = useState<Array<{
    id: string; title: string; category: string; severity: string; status: string; created_at: string;
  }>>([]);
  const [state, setState] = useState<ApiState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Thiết bị");
  const [severity, setSeverity] = useState("medium");

  useEffect(() => {
    fetch("/api/incidents", { cache: "no-store" })
      .then(readJson)
      .then((payload) => { setIssues(payload.incidents ?? []); setState("ready"); })
      .catch(() => setState("error"));
  }, []);
  async function refresh() {
    try {
      const payload = await readJson(await fetch("/api/incidents", { cache: "no-store" }));
      setIssues(payload.incidents ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/incidents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, category, severity }),
    });
    if (response.ok) {
      setTitle("");
      setShowForm(false);
      await refresh();
    }
  }
  async function acknowledge(id: string) {
    const response = await fetch("/api/incidents", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: "acknowledged" }),
    });
    if (response.ok) await refresh();
  }

  return (
    <div className="page-grid">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <ViewHeader title="Danh sách cần xử lý" subtitle="Thiết bị, vận hành và thiếu nguyên liệu" />
          <button className="button button-compact" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Báo sự cố</button>
        </div>
        {showForm && (
          <form className="attention-card operation-form" onSubmit={create}>
            <div className="field full"><label htmlFor="incident-title">Mô tả ngắn</label><input id="incident-title" value={title} onChange={(event) => setTitle(event.target.value)} required /></div>
            <div className="field"><label htmlFor="incident-category">Loại</label><select id="incident-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>Thiết bị</option><option>Thiếu nguyên liệu</option><option>Thiếu bao bì</option><option>Khác</option></select></div>
            <div className="field"><label htmlFor="incident-severity">Mức độ</label><select id="incident-severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option></select></div>
            <div className="form-actions"><button className="button button-compact" type="submit">Gửi báo cáo</button></div>
          </form>
        )}
        {state === "error" ? <InlineError text="Không tải được danh sách sự cố." /> : (
          <div className="list">
            {issues.map((issue) => (
              <div className="list-row" key={issue.id}>
                <div className="person">
                  <span className={`mini-icon ${issue.severity === "high" ? "pink" : "mint"}`}><PackageOpen size={15} /></span>
                  <span className="person-copy"><strong>{issue.title}</strong><small>{issue.category} · {formatDateTime(issue.created_at)}</small></span>
                </div>
                <div className="row-actions">
                  <span className={`badge ${issue.severity === "high" ? "danger" : issue.severity === "medium" ? "warning" : "neutral"}`}>{severityLabel(issue.severity)}</span>
                  {issue.status === "open" && canManage ? <button className="text-link" onClick={() => acknowledge(issue.id)}>Tiếp nhận</button> : <span className={`badge ${issue.status === "open" ? "warning" : "success"}`}>{statusLabel(issue.status)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <aside className="stack">
        <section className="card">
          <ViewHeader title="Nguyên tắc báo sự cố" subtitle="Ưu tiên xử lý gián đoạn vận hành" />
          <p className="supporting-copy">Báo sớm giúp Quản lý phân công kỹ thuật hoặc chủ động điều chuyển nguyên liệu trước giờ cao điểm.</p>
          <div className="attention-card" style={{ marginTop: 12 }}>
            <span className="badge danger"><AlertCircle size={12} /> Cần ưu tiên</span>
            <h4 style={{ marginTop: 8 }}>{state === "loading" ? "Đang tải…" : `${(issues ?? []).filter((issue) => issue.status === "open").length} sự cố cần xử lý`}</h4>
            <p style={{ fontSize: 11, margin: "4px 0 0" }}>Bao gồm hỏng hóc máy móc & thiếu hụt bao bì.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

export function PersistentHandoversView() {
  const [handovers, setHandovers] = useState<Array<{
    id: string; summary: string; manager_attention: number; created_at: string; author_name: string;
  }>>([]);
  const [unfinished, setUnfinished] = useState("");
  const [stock, setStock] = useState("");
  const [equipment, setEquipment] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void fetch("/api/handovers", { cache: "no-store" })
      .then(readJson)
      .then((payload) => setHandovers(payload.handovers ?? []));
  }, []);
  async function refresh() {
    const payload = await readJson(await fetch("/api/handovers", { cache: "no-store" }));
    setHandovers(payload.handovers ?? []);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const summary = [
      unfinished && `Việc chưa hoàn tất: ${unfinished}`,
      stock && `Sắp hết: ${stock}`,
      equipment && `Thiết bị: ${equipment}`,
      note && `Ghi chú: ${note}`,
    ].filter(Boolean).join("\n");
    const response = await fetch("/api/handovers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ summary, managerAttention: Boolean(stock || equipment) }),
    });
    if (response.ok) {
      setSaved(true);
      setUnfinished(""); setStock(""); setEquipment(""); setNote("");
      await refresh();
    }
  }

  return (
    <div className="page-grid">
      <section className="card">
        <ViewHeader title="Bàn giao ca" subtitle="Nội dung được lưu cho ca sau và quản lý" />
        <form onSubmit={submit}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="unfinished">Việc chưa hoàn tất</label><textarea id="unfinished" value={unfinished} onChange={(event) => setUnfinished(event.target.value)} /></div>
            <div className="field"><label htmlFor="stock">Nguyên liệu / bao bì sắp hết</label><textarea id="stock" value={stock} onChange={(event) => setStock(event.target.value)} /></div>
            <div className="field"><label htmlFor="equipment">Thiết bị cần lưu ý</label><textarea id="equipment" value={equipment} onChange={(event) => setEquipment(event.target.value)} /></div>
            <div className="field full"><label htmlFor="next-note">Ghi chú cho ca sau</label><textarea id="next-note" value={note} onChange={(event) => setNote(event.target.value)} /></div>
          </div>
          <div className="form-actions"><button className="button button-compact" type="submit" disabled={[unfinished, stock, equipment, note].join("").trim().length < 10}>Gửi bàn giao</button></div>
        </form>
      </section>
      <aside className="card">
        <ViewHeader title="Bàn giao gần đây" subtitle={`${(handovers ?? []).length} bản ghi đã lưu`} />
        <div className="list">
          {(handovers ?? []).slice(0, 5).map((handover) => (
            <div className="list-row" key={handover.id}>
              <span className="person-copy"><strong>{handover.author_name}</strong><small>{formatDateTime(handover.created_at)}</small></span>
              <span className={`badge ${handover.manager_attention ? "warning" : "success"}`}>{handover.manager_attention ? "Cần chú ý" : "Đã lưu"}</span>
            </div>
          ))}
        </div>
        {saved && <div className="toast"><CheckCircle2 size={17} /> Bàn giao đã được lưu.</div>}
      </aside>
    </div>
  );
}

export function PersistentRequestsView({ canApprove = false }: { canApprove?: boolean }) {
  const [requests, setRequests] = useState<Array<{
    id: string; employee_name: string; type: string; title: string; reason: string; status: string; created_at: string;
  }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("leave");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    const payload = await readJson(await fetch("/api/requests", { cache: "no-store" }));
    setRequests(payload.requests ?? []);
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, title, reason }),
    });
    if (response.ok) {
      setShowForm(false); setTitle(""); setReason(""); await refresh();
    }
  }
  async function decide(id: string, decision: "approved" | "rejected") {
    const response = await fetch("/api/requests", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, decision }),
    });
    if (response.ok) await refresh();
  }

  return (
    <div className="page-grid">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <ViewHeader title="Yêu cầu cửa hàng" subtitle={`${(requests ?? []).filter((item) => item.status === "pending").length} yêu cầu chờ duyệt`} />
          <button className="button button-compact" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Tạo yêu cầu</button>
        </div>
        {showForm && (
          <form className="attention-card operation-form" onSubmit={create}>
            <div className="field"><label htmlFor="request-type">Loại</label><select id="request-type" value={type} onChange={(event) => setType(event.target.value)}><option value="leave">Nghỉ</option><option value="swap">Đổi ca</option><option value="correction">Sửa chấm công</option></select></div>
            <div className="field"><label htmlFor="request-title">Tiêu đề</label><input id="request-title" value={title} onChange={(event) => setTitle(event.target.value)} required /></div>
            <div className="field full"><label htmlFor="request-reason">Lý do</label><textarea id="request-reason" value={reason} onChange={(event) => setReason(event.target.value)} required /></div>
            <div className="form-actions"><button className="button button-compact" type="submit">Gửi yêu cầu</button></div>
          </form>
        )}
        <div className="list">
          {requests.map((item) => (
            <div className="list-row" key={item.id}>
              <div className="person"><span className="avatar">{initials(item.employee_name)}</span><span className="person-copy"><strong>{item.title}</strong><small>{item.employee_name} · {item.reason}</small></span></div>
              <div className="row-actions">
                {item.status === "pending" && canApprove ? (
                  <><button className="text-link" onClick={() => decide(item.id, "approved")}>Duyệt</button><button className="text-link danger-text" onClick={() => decide(item.id, "rejected")}>Từ chối</button></>
                ) : <span className={`badge ${item.status === "approved" ? "success" : item.status === "rejected" ? "danger" : "warning"}`}>{item.status === "approved" ? "Đã duyệt" : item.status === "rejected" ? "Đã từ chối" : "Đang chờ"}</span>}
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className="card"><ViewHeader title="Nguyên tắc" subtitle="Không mất dữ liệu gốc" /><p className="supporting-copy">Điều chỉnh chấm công luôn giữ lại thời gian và bằng chứng ban đầu để quản lý đối chiếu.</p></aside>
    </div>
  );
}

export function PersistentTeamView() {
  const [employees, setEmployees] = useState<Array<{
    id: string; email: string; display_name: string; role: string; status: string;
  }>>([]);

  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    const payload = await readJson(await fetch("/api/team", { cache: "no-store" }));
    setEmployees(payload.employees ?? []);
  }
  return (
    <section className="card">
      <div className="section-row" style={{ marginBottom: 18 }}>
        <ViewHeader title="Đội ngũ LoopiCafe" subtitle={`${(employees ?? []).filter((employee) => employee.status === "active").length} tài khoản đang hoạt động`} />
      </div>
      <div className="list">
        {employees.map((employee) => (
          <div className="list-row" key={employee.id}>
            <div className="person"><span className="avatar">{initials(employee.display_name)}</span><span className="person-copy"><strong>{employee.display_name}</strong><small>{employee.email} · {roleLabel(employee.role)}</small></span></div>
            <span className={`badge ${employee.status === "active" ? "success" : employee.status === "invited" ? "warning" : "neutral"}`}>{employee.status === "active" ? "Đang hoạt động" : employee.status === "invited" ? "Đã mời" : "Đã vô hiệu"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PersistentStoreSettingsView() {
  const [form, setForm] = useState({
    name: "",
    address: "",
    latitude: 10.754128,
    longitude: 106.66754,
    geofenceRadiusMeters: 100,
    timezone: "Asia/Ho_Chi_Minh",
    earlyCheckinMinutes: "30",
    lateMinutes: "10",
    earlyDepartureMinutes: "15",
    absenceMinutes: "60",
    missingCheckoutMinutes: "180",
  });

  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>("Đang tải thiết lập…");
  const [isSuccess, setIsSuccess] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletMarkerRef = useRef<any>(null);
  const leafletCircleRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/store", { cache: "no-store" })
      .then(readJson)
      .then((payload) => {
        const store = payload.store ?? {};
        const rules = payload.rules ?? {};
        const lat = Number(store.latitude) || 10.754128;
        const lng = Number(store.longitude) || 106.66754;
        const radius = Number(store.geofence_radius_meters) || 100;

        setForm({
          name: store.name ?? "LoopiCafe Main Store",
          address: store.address ?? "Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh",
          latitude: lat,
          longitude: lng,
          geofenceRadiusMeters: radius,
          timezone: store.timezone ?? "Asia/Ho_Chi_Minh",
          earlyCheckinMinutes: String(rules.early_checkin_minutes ?? 30),
          lateMinutes: String(rules.late_minutes ?? 10),
          earlyDepartureMinutes: String(rules.early_departure_minutes ?? 15),
          absenceMinutes: String(rules.absence_minutes ?? 60),
          missingCheckoutMinutes: String(rules.missing_checkout_minutes ?? 180),
        });
        setMessage(null);
      })
      .catch(() => setMessage("Không tải được thiết lập."));
  }, []);

  // Dynamically load Leaflet for real interactive map rendering
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).L) {
      setLeafletLoaded(true);
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => setLeafletLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Initialize and update Leaflet interactive map
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || typeof window === "undefined") return;
    const L = (window as any).L;
    if (!L) return;

    const lat = form.latitude;
    const lng = form.longitude;
    const radius = form.geofenceRadiusMeters;

    if (!leafletMapRef.current) {
      const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      const circle = L.circle([lat, lng], {
        radius,
        color: "#6f2939",
        fillColor: "#d96d83",
        fillOpacity: 0.25,
        weight: 2,
      }).addTo(map);

      marker.on("dragend", (e: any) => {
        const pos = e.target.getLatLng();
        circle.setLatLng(pos);
        setForm((prev) => ({ ...prev, latitude: pos.lat, longitude: pos.lng }));
        reverseGeocode(pos.lat, pos.lng);
      });

      map.on("click", (e: any) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        setForm((prev) => ({ ...prev, latitude: e.latlng.lat, longitude: e.latlng.lng }));
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      });

      leafletMapRef.current = map;
      leafletMarkerRef.current = marker;
      leafletCircleRef.current = circle;
    } else {
      leafletMapRef.current.setView([lat, lng], leafletMapRef.current.getZoom());
      leafletMarkerRef.current.setLatLng([lat, lng]);
      leafletCircleRef.current.setLatLng([lat, lng]);
      leafletCircleRef.current.setRadius(radius);
    }
  }, [leafletLoaded, form.latitude, form.longitude, form.geofenceRadiusMeters]);

  // Reverse geocoding helper (Coordinates -> Address text)
  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`
      );
      const data = await res.json();
      if (data && data.display_name) {
        setForm((prev) => ({ ...prev, address: data.display_name }));
      }
    } catch {
      // Fallback silent
    }
  }

  // Address search helper (Address text -> Coordinates)
  async function handleAddressSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!form.address.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          form.address
        )}&limit=1&accept-language=vi`
      );
      const data = await res.json();
      if (data && data[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setForm((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
          address: data[0].display_name || prev.address,
        }));
      } else {
        setMessage("Không tìm thấy tọa độ cho địa chỉ này trên bản đồ.");
      }
    } catch {
      setMessage("Không thể tra cứu địa chỉ lúc này.");
    } finally {
      setSearching(false);
    }
  }

  // Current HTML5 GPS Location helper
  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Trình duyệt không hỗ trợ truy cập GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setForm((prev) => ({ ...prev, latitude: lat, longitude: lng }));
        reverseGeocode(lat, lng);
        setLocating(false);
      },
      () => {
        setMessage("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function update(key: keyof typeof form, value: any) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setIsSuccess(false);

    try {
      const response = await fetch("/api/store", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(payload.error ?? "Không thể lưu thiết lập.");
      }
      setIsSuccess(true);
      setMessage(`Đã lưu thiết lập cửa hàng thành công! (Quy tắc v${payload.ruleVersion})`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Đã có lỗi xảy ra.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {message && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 16,
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

      {/* SECTION 1: THÔNG TIN & VỊ TRÍ CỬA HÀNG */}
      <section className="card">
        <ViewHeader
          title="1. Thông tin & Vị trí cửa hàng"
          subtitle="Địa điểm chính thức và bán kính geofence cho phép nhân viên check-in"
        />

        <div className="page-grid" style={{ marginTop: 16 }}>
          <div className="space-y-4">
            <div className="field full">
              <label htmlFor="store-name">Tên cửa hàng</label>
              <input
                id="store-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ví dụ: LoopiCafe Nguyễn Trãi"
              />
            </div>

            <div className="field full">
              <label htmlFor="store-address">Địa chỉ cửa hàng</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  id="store-address"
                  type="text"
                  required
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="Nhập địa chỉ (VD: 123 Lê Lợi, Quận 1, TP.HCM)…"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleAddressSearch}
                  disabled={searching}
                  className="button button-compact secondary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {searching ? "Đang tìm…" : "Tìm vị trí"}
                </button>
              </div>
              <small style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, display: "block" }}>
                Hoặc kéo thả ghim màu đỏ trên bản đồ để tinh chỉnh vị trí cửa hàng chính xác.
              </small>
            </div>

            <div className="field full">
              <label>Bán kính chấm công hợp lệ (Geofence Radius)</label>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {[50, 100, 150, 200].map((radius) => (
                  <button
                    key={radius}
                    type="button"
                    onClick={() => update("geofenceRadiusMeters", radius)}
                    className={`button button-compact ${
                      form.geofenceRadiusMeters === radius ? "" : "secondary"
                    }`}
                    style={{
                      flex: 1,
                      fontWeight: form.geofenceRadiusMeters === radius ? 700 : 500,
                    }}
                  >
                    {radius}m {radius === 100 ? "⭐" : ""}
                  </button>
                ))}
              </div>
              <small style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "block" }}>
                Nhân viên chỉ có thể check-in khi vị trí GPS điện thoại nằm trong bán kính này.
              </small>
            </div>

            <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating}
                className="button button-compact secondary"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <MapPin size={15} /> {locating ? "Đang định vị…" : "Dùng vị trí hiện tại của tôi"}
              </button>
            </div>
          </div>

          {/* Interactive Map Visualizer */}
          <div
            style={{
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid #eee3df",
              minHeight: 280,
              position: "relative",
              background: "#fffaf4",
            }}
          >
            <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: 280 }} />
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                right: 8,
                background: "rgba(255, 255, 255, 0.92)",
                backdropFilter: "blur(4px)",
                padding: "8px 12px",
                borderRadius: 12,
                fontSize: 11,
                color: "#332a2b",
                fontWeight: 600,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                zIndex: 1000,
              }}
            >
              <span>
                📍 Tọa độ: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
              </span>
              <span className="badge burgundy">Bán kính: {form.geofenceRadiusMeters}m</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: QUY TẮC CHẤM CÔNG */}
      <section className="card">
        <ViewHeader
          title="2. Quy tắc chấm công"
          subtitle="Cấu hình thời gian chấp nhận check-in, đi trễ, về sớm và vắng mặt"
        />
        <div className="form-grid" style={{ marginTop: 16 }}>
          <InputField
            id="early-checkin"
            label="Cho phép check-in trước ca tối đa (phút)"
            value={form.earlyCheckinMinutes}
            onChange={(value) => update("earlyCheckinMinutes", value)}
            placeholder="30"
          />
          <InputField
            id="late"
            label="Tính đi trễ sau (phút)"
            value={form.lateMinutes}
            onChange={(value) => update("lateMinutes", value)}
            placeholder="10"
          />
          <InputField
            id="early-departure"
            label="Tính về sớm trước (phút)"
            value={form.earlyDepartureMinutes}
            onChange={(value) => update("earlyDepartureMinutes", value)}
            placeholder="15"
          />
          <InputField
            id="absence"
            label="Tự động đánh dấu vắng mặt sau (phút)"
            value={form.absenceMinutes}
            onChange={(value) => update("absenceMinutes", value)}
            placeholder="60"
          />
        </div>
      </section>

      {/* SECTION 3: QUY TẮC CA LÀM & CẢNH BÁO */}
      <section className="card">
        <ViewHeader
          title="3. Quy tắc ca làm & Cảnh báo"
          subtitle="Tự động nhắc nhở nhân viên khi quên check-out ra ca"
        />
        <div className="form-grid" style={{ marginTop: 16 }}>
          <InputField
            id="missing-checkout"
            label="Cảnh báo chưa check-out sau (phút)"
            value={form.missingCheckoutMinutes}
            onChange={(value) => update("missingCheckoutMinutes", value)}
            placeholder="180"
          />
        </div>

        <div className="form-actions" style={{ marginTop: 24 }}>
          <button className="button button-compact" type="submit" disabled={submitting}>
            {submitting ? "Đang lưu thiết lập…" : "Lưu thiết lập cửa hàng"}
          </button>
        </div>
      </section>
    </form>
  );
}

export function ScheduleManagerView({ canManage = false }: { canManage?: boolean }) {
  const [shifts, setShifts] = useState<Array<{
    id: string; employee_name: string; employee_email: string; starts_at: string; ends_at: string; role_label: string;
  }>>([]);
  const [employees, setEmployees] = useState<Array<{ email: string; display_name: string; status: string }>>([]);
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
  const [weekStartDate, setWeekStartDate] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split("T")[0];
  });

  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]); // Mon-Fri default
  const [shiftPreset, setShiftPreset] = useState<ShiftPreset>("morning");
  const [customStart, setCustomStart] = useState("06:00");
  const [customEnd, setCustomEnd] = useState("14:00");

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    void Promise.all([
      fetch("/api/shifts", { cache: "no-store" }).then(readJson),
      canManage
        ? fetch("/api/team", { cache: "no-store" }).then(readJson).catch(() => ({ employees: [] }))
        : Promise.resolve({ employees: [] }),
    ]).then(([shiftPayload, teamPayload]) => {
      setShifts(shiftPayload.shifts ?? []);
      setEmployees((teamPayload.employees ?? []).filter((employee: { status: string }) => employee.status === "active"));
    });
  }, [canManage]);

  async function refresh() {
    const [shiftPayload, teamPayload] = await Promise.all([
      readJson(await fetch("/api/shifts", { cache: "no-store" })),
      canManage ? fetch("/api/team", { cache: "no-store" }).then(readJson).catch(() => ({ employees: [] })) : Promise.resolve({ employees: [] }),
    ]);
    setShifts(shiftPayload.shifts ?? []);
    setEmployees((teamPayload.employees ?? []).filter((employee: { status: string }) => employee.status === "active"));
  }

  const toggleDay = (dayIndex: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  // Conflict Detection Logic
  const conflicts = useMemo(() => {
    if (!employeeEmail || selectedDays.length === 0) return [];
    const monday = new Date(weekStartDate);

    const foundConflicts: string[] = [];
    selectedDays.forEach((dayOffset) => {
      const shiftDate = new Date(monday);
      shiftDate.setDate(monday.getDate() + dayOffset);
      const dateStr = shiftDate.toISOString().split("T")[0];

      const existing = shifts.find(
        (s) => s.employee_email === employeeEmail && s.starts_at.startsWith(dateStr)
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
      payloadBody = {
        employeeEmail,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
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

      const monday = new Date(weekStartDate);
      const batchShifts = selectedDays.map((offset) => {
        const shiftDate = new Date(monday);
        shiftDate.setDate(monday.getDate() + offset);

        const [sH, sM] = startTimeStr.split(":").map(Number);
        const [eH, eM] = endTimeStr.split(":").map(Number);

        const sDate = new Date(shiftDate);
        sDate.setHours(sH, sM, 0, 0);

        const eDate = new Date(shiftDate);
        eDate.setHours(eH, eM, 0, 0);

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

    const response = await fetch("/api/shifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadBody),
    });
    const payload = await readJson(response);
    if (response.ok) {
      setShowForm(false);
      setError("");
      setSuccessMsg(payload.message ?? "Đã thêm ca vào lịch thành công!");
      await refresh();
    } else {
      setError(payload.error ?? "Không thể tạo ca.");
    }
  }

  // Format week label
  const mondayDate = new Date(weekStartDate);
  const sundayDate = new Date(mondayDate);
  sundayDate.setDate(mondayDate.getDate() + 6);
  const weekLabel = `Tuần ${formatDateVN(mondayDate)} — ${formatDateVN(sundayDate)}`;
  const sortedShifts = [...shifts].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return (
    <div className="stack">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className="card-title">{weekLabel}</h2>
            <p className="card-subtitle">{shifts.length} ca đã được phân công trong tuần này</p>
          </div>
          {canManage && (
            <div style={{ display: "flex", gap: 10 }}>
              <button className="button-secondary button-compact" onClick={() => setShowForm((v) => !v)}>
                <Plus size={15} /> {showForm ? "Đóng form" : "Thêm ca vào lịch (Bước 1)"}
              </button>
              <button
                className="button button-compact"
                onClick={() => setSuccessMsg("Lịch tuần đã được xác nhận & xuất bản cho toàn bộ nhân viên!")}
              >
                <CheckCircle2 size={15} /> Xuất bản lịch tuần (Bước 3)
              </button>
            </div>
          )}
        </div>

        {successMsg && (
          <div className="toast" style={{ marginBottom: 16 }}>
            <CheckCircle2 size={17} /> {successMsg}
          </div>
        )}

        {showForm && canManage && (
          <form className="attention-card operation-form" onSubmit={create} style={{ marginBottom: 20 }}>
            <div className="field full">
              <label>Chế độ phân ca</label>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                <button
                  type="button"
                  className={`button button-compact ${scheduleMode === "weekly" ? "" : "button-secondary"}`}
                  onClick={() => setScheduleMode("weekly")}
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

            {/* Inline Conflict Warnings */}
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
              <button className="button button-compact" type="submit">
                {scheduleMode === "weekly" ? `Thêm ${selectedDays.length} ca vào lịch` : "Thêm ca vào lịch"}
              </button>
            </div>
          </form>
        )}

        {error && <InlineError text={error} />}

        <div className="schedule-view-switch" role="tablist" aria-label="Chế độ xem lịch">
          <button type="button" role="tab" aria-selected={scheduleView === "list"} className={scheduleView === "list" ? "active" : ""} onClick={() => setScheduleView("list")}>
            <CalendarDays size={16} /> Danh sách
          </button>
          <button type="button" role="tab" aria-selected={scheduleView === "week"} className={scheduleView === "week" ? "active" : ""} onClick={() => setScheduleView("week")}>
            <Clock3 size={16} /> Lịch tuần
          </button>
        </div>

        {/* 7-Day Weekly Grid View */}
        {scheduleView === "week" && <div className="week-grid-container" style={{ overflowX: "auto", marginTop: 12 }}>
          <div className="week-grid" style={{ minWidth: 700 }}>
            <div className="week-head" style={{ fontWeight: 700 }}>Nhân viên</div>
            {DAY_CHIP_LABELS.map((chip, idx) => {
              const dayDate = new Date(mondayDate);
              dayDate.setDate(mondayDate.getDate() + idx);
              return (
                <div className="week-head" key={chip.key}>
                  {chip.label}
                  <strong style={{ display: "block", fontSize: 11, color: "#7b6f70" }}>{dayDate.getDate()}/{dayDate.getMonth() + 1}</strong>
                </div>
              );
            })}

            {/* Rows for Employees */}
            {(employees.length > 0 ? employees : [{ email: "demo", display_name: "Tất cả ca" }]).map((emp) => (
              <Fragment key={emp.email}>
                <div className="week-person" style={{ fontWeight: 600, fontSize: 13, alignSelf: "center" }}>
                  {emp.display_name}
                </div>

                {DAY_CHIP_LABELS.map((chip, idx) => {
                  const dayDate = new Date(mondayDate);
                  dayDate.setDate(mondayDate.getDate() + idx);
                  const dateStr = dayDate.toISOString().split("T")[0];

                  const dayShifts = shifts.filter((s) =>
                    (emp.email === "demo" || s.employee_email === emp.email) && s.starts_at.startsWith(dateStr)
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
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>}

        {scheduleView === "list" && <div className="schedule-mobile-list">
          <div className="schedule-list-heading">
            <div><span>Ca của tôi</span><strong>{sortedShifts.length} ca trong lịch</strong></div>
            <span className="badge neutral">Danh sách</span>
          </div>
          {sortedShifts.map((shift) => {
            const status = getShiftStatus(shift.starts_at, shift.ends_at);
            return (
              <article className={`schedule-shift-card ${status.tone}`} key={shift.id}>
                <div className="schedule-shift-date">
                  <span>{new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(shift.starts_at))}</span>
                  <strong>{new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(shift.starts_at))}</strong>
                </div>
                <div className="schedule-shift-main">
                  <div className="schedule-shift-topline">
                    <div><span>{shift.role_label}</span><strong>{shift.employee_name}</strong></div>
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                  </div>
                  <div className="schedule-shift-meta">
                    <span><Clock3 size={14} /> {formatTime(shift.starts_at)} — {formatTime(shift.ends_at)}</span>
                    <span><MapPin size={14} /> Cửa hàng chính</span>
                  </div>
                </div>
              </article>
            );
          })}
          {shifts.length === 0 && (
            <p className="supporting-copy" style={{ textAlign: "center", padding: "16px 0" }}>
              Chưa có ca làm nào được xuất bản. Bấm “Thêm ca vào lịch (Bước 1)” để xếp ca cho nhân viên.
            </p>
          )}
        </div>}
      </section>
    </div>
  );
}

export function AttendanceReviewView() {
  const [events, setEvents] = useState<Array<{
    id: string; employeeName: string; action: string; recordedAt: string;
    verification: string[]; photoPresent: boolean; reviewRequired: boolean;
    exceptionStatus: string | null; employeeReason: string | null;
    location: { latitude: number; longitude: number; accuracy: number; distance: number } | null;
  }>>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/attendance/review", { cache: "no-store" })
      .then(readJson)
      .then((payload) => setEvents(payload.events ?? []))
      .catch(() => setEvents([]));
  }, []);
  async function refresh() {
    const payload = await readJson(await fetch("/api/attendance/review", { cache: "no-store" }));
    setEvents(payload.events ?? []);
  }
  async function decide(eventId: string, decision: "approved" | "rejected") {
    await fetch("/api/attendance/review", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId, decision }),
    });
    await refresh();
  }

  async function approveAllPending() {
    const pendingEvents = (events ?? []).filter((e) => e.reviewRequired && e.exceptionStatus === "pending");
    for (const ev of pendingEvents) {
      await fetch("/api/attendance/review", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: ev.id, decision: "approved" }),
      });
    }
    await refresh();
  }

  const pendingCount = (events ?? []).filter((e) => e.reviewRequired && e.exceptionStatus === "pending").length;

  return (
    <div className="stack">
      <section className="metric-grid">
        <MetricCard icon={AlertCircle} tone="pink" value={String((events ?? []).filter((event) => event.reviewRequired).length)} label="Cần xem xét" />
        <MetricCard icon={ShieldCheck} tone="mint" value={String((events ?? []).filter((event) => !event.reviewRequired).length)} label="Đã hoàn tất" />
        <MetricCard icon={MapPin} tone="amber" value={String((events ?? []).filter((event) => event.location).length)} label="Có vị trí" />
        <MetricCard icon={CheckCircle2} tone="burgundy" value={String((events ?? []).filter((event) => event.photoPresent).length)} label="Có ảnh máy chủ" />
      </section>
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <ViewHeader title="Bằng chứng chấm công" subtitle="Chỉ chủ quán và quản lý được mở ảnh, tọa độ chính xác" />
          {pendingCount > 0 && (
            <button className="button button-compact" onClick={approveAllPending}>
              <CheckCircle2 size={15} /> Duyệt tất cả ({pendingCount})
            </button>
          )}
        </div>
        <div className="review-grid">
          {events.map((event) => (
            <article className="review-card" key={event.id}>
              <div className="section-row">
                <div><strong>{event.employeeName}</strong><small>{event.action === "check_in" ? "Vào ca" : "Ra ca"} · {formatDateTime(event.recordedAt)}</small></div>
                <span className={`badge ${event.reviewRequired ? "warning" : "success"}`}>{event.reviewRequired ? "Cần duyệt" : "Hoàn tất"}</span>
              </div>
              {selected === event.id && event.photoPresent && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="review-photo" src={`/api/files/${event.id}`} alt={`Bằng chứng chấm công của ${event.employeeName}`} />
              )}
              <p>{event.employeeReason ?? "Không có ghi chú ngoại lệ."}</p>
              {event.location && <div className="location-readout">{event.location.latitude.toFixed(6)}, {event.location.longitude.toFixed(6)} · ±{Math.round(event.location.accuracy)} m · cách quán {Math.round(event.location.distance)} m</div>}
              <div className="row-actions">
                {event.photoPresent && <button className="text-link" onClick={() => setSelected(selected === event.id ? null : event.id)}>{selected === event.id ? "Ẩn ảnh" : "Mở ảnh riêng tư"}</button>}
                {event.reviewRequired && event.exceptionStatus === "pending" && (
                  <><button className="text-link" onClick={() => decide(event.id, "approved")}>Phê duyệt</button><button className="text-link danger-text" onClick={() => decide(event.id, "rejected")}>Từ chối</button></>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PersistedReportsView() {
  const [summary, setSummary] = useState<Array<{
    displayName: string; email: string; role: string; workedMinutes: number; shiftCount: number; exceptionCount: number; hourlyRate: number; estimatedSalary: number;
  }>>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/reports/attendance", { cache: "no-store" })
      .then(readJson)
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

function ViewHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="card-title">{title}</h2><p className="card-subtitle">{subtitle}</p></div>;
}

function InlineError({ text }: { text: string }) {
  return <div className="attention-card" style={{ marginTop: 14 }}><span className="badge danger"><AlertCircle size={11} /> Cần thử lại</span><p style={{ margin: "9px 0 0" }}>{text}</p></div>;
}

function InputField({ id, label, value, onChange, full, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; full?: boolean; placeholder?: string }) {
  return <div className={`field ${full ? "full" : ""}`}><label htmlFor={id}>{label}</label><input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} required /></div>;
}

function MetricCard({ icon: Icon, tone, value, label }: { icon: React.ComponentType<{ size?: number }>; tone: string; value: string; label: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={17} /></span><strong>{value}</strong><span>{label}</span></article>;
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && !payload.error) throw new Error("Request failed");
  return payload;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatWorkedMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}p`;
}

function initials(value: string) {
  return value.split(" ").slice(-2).map((part) => part[0]).join("").toUpperCase();
}

function severityLabel(value: string) {
  if (value === "high") return "Cao";
  if (value === "medium") return "Vừa";
  return "Thấp";
}

function statusLabel(value: string) {
  if (value === "acknowledged") return "Đã tiếp nhận";
  if (value === "resolved") return "Đã xử lý";
  if (value === "closed") return "Đã đóng";
  return "Mở";
}

function roleLabel(value: string) {
  if (value === "owner") return "Chủ cửa hàng";
  if (value === "manager") return "Quản lý";
  if (value === "team_lead") return "Trưởng nhóm";
  return "Nhân viên";
}

function getShiftStatus(startsAt: string, endsAt: string) {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now >= start && now <= end) return { label: "Đang diễn ra", badge: "success", tone: "is-live" };
  if (now < start) return { label: "Sắp tới", badge: "warning", tone: "is-upcoming" };
  return { label: "Đã hoàn thành", badge: "neutral", tone: "is-done" };
}

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
      const payload = await response.json().catch(() => ({}));
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

function formatDateVN(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(date);
}
