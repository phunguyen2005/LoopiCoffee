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
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoopySticker } from "./loopy-sticker";

type ApiState = "loading" | "ready" | "error";

export function OperationsDashboardView() {
  const [data, setData] = useState<{
    metrics: { activeStaff: number; pendingExceptions: number; checklistDone: number; checklistTotal: number; openIncidents: number };
    nextShifts: Array<{ id: string; employee_name: string; starts_at: string; ends_at: string; role_label: string }>;
    latestHandover: { summary: string; created_at: string; author_name: string } | null;
  } | null>(null);
  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store" }).then(readJson).then(setData);
  }, []);
  const metrics = data?.metrics ?? { activeStaff: 0, pendingExceptions: 0, checklistDone: 0, checklistTotal: 0, openIncidents: 0 };
  return (
    <div className="stack">
      <section className="hero-status-card">
        <div className="hero-status-copy">
          <span className="status-label"><CheckCircle2 size={14} /> Dữ liệu vận hành trực tiếp</span>
          <h2>{metrics.pendingExceptions ? `${metrics.pendingExceptions} việc cần xem ngay` : "Cửa hàng đang được theo dõi"}</h2>
          <p>Các chỉ số bên dưới đến từ dữ liệu đã lưu, không còn là số liệu minh họa.</p>
          <div className="status-metrics">
            <span><strong>{metrics.activeStaff}</strong><small>đang trong ca</small></span>
            <span><strong>{metrics.checklistDone}/{metrics.checklistTotal}</strong><small>checklist</small></span>
            <span><strong>{metrics.pendingExceptions}</strong><small>cần duyệt</small></span>
          </div>
        </div>
        <div className="hero-status-mascot"><LoopySticker mood={metrics.pendingExceptions ? "alert" : "hello"} size={126} /></div>
      </section>
      <section className="metric-grid">
        <MetricCard icon={UsersRound} tone="mint" value={String(metrics.activeStaff)} label="Đang trong ca" />
        <MetricCard icon={AlertCircle} tone="pink" value={String(metrics.pendingExceptions)} label="Ngoại lệ chờ duyệt" />
        <MetricCard icon={CheckCircle2} tone="amber" value={`${metrics.checklistDone}/${metrics.checklistTotal}`} label="Việc hoàn tất" />
        <MetricCard icon={PackageOpen} tone="burgundy" value={String(metrics.openIncidents)} label="Sự cố đang mở" />
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
            {data && data.nextShifts.length === 0 && <p className="supporting-copy">Chưa có ca sắp tới. Hãy xuất bản lịch trước khi bật chấm công cho nhân viên.</p>}
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
  useEffect(() => {
    fetch("/api/today", { cache: "no-store" }).then(readJson).then(setData);
  }, []);
  return (
    <div className="page-grid">
      <section className="hero-status-card" style={{ minHeight: 260 }}>
        <div className="hero-status-copy">
          <span className="status-label"><CalendarDays size={14} /> Ca của bạn</span>
          <h2>{data?.shift ? `${formatTime(data.shift.starts_at)} — ${formatTime(data.shift.ends_at)}` : "Chưa có ca được phân công"}</h2>
          <p>{data?.shift ? `${data.shift.role_label}${data.shift.is_shift_lead ? " · Trưởng ca" : ""}` : "Quản lý cần xuất bản ca trước khi lượt chấm công có thể được xác nhận."}</p>
          <div className="status-metrics">
            <span><strong>{data?.attendance?.opened_at ? formatTime(data.attendance.opened_at) : "—"}</strong><small>vào ca</small></span>
            <span><strong>{data?.checklist?.done ?? 0}/{data?.checklist?.total ?? 0}</strong><small>công việc</small></span>
          </div>
        </div>
        <div className="hero-status-mascot"><LoopySticker mood={data?.shift ? "working" : "confused"} size={125} /></div>
      </section>
      <aside className="stack">
        <section className="card">
          <ViewHeader title="Chấm công" subtitle="Ảnh do máy chủ đóng dấu" />
          <p className="supporting-copy">Camera và vị trí chỉ được yêu cầu sau khi bạn chủ động bắt đầu.</p>
          <Link href="/app/attendance" className="button" style={{ width: "100%", marginTop: 14 }}>Mở chấm công</Link>
        </section>
        <section className="card">
          <ViewHeader title="Checklist" subtitle={`${data?.checklist?.done ?? 0}/${data?.checklist?.total ?? 0} việc hoàn tất`} />
          <Link href="/app/checklists" className="text-link">Tiếp tục công việc</Link>
        </section>
      </aside>
    </div>
  );
}

export function PersistentChecklistsView() {
  const [items, setItems] = useState<Array<{
    id: string; label: string; assignee: string; required: number; completed: number;
  }>>([]);
  const [state, setState] = useState<ApiState>("loading");

  useEffect(() => {
    fetch("/api/checklists", { cache: "no-store" })
      .then(readJson)
      .then((payload) => { setItems(payload.items ?? []); setState("ready"); })
      .catch(() => setState("error"));
  }, []);

  async function toggle(item: (typeof items)[number]) {
    const completed = !item.completed;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, completed: completed ? 1 : 0 } : entry));
    const response = await fetch("/api/checklists", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, completed }),
    });
    if (!response.ok) {
      setItems((current) => current.map((entry) => entry.id === item.id ? item : entry));
    }
  }

  const done = items.filter((item) => item.completed).length;
  return (
    <div className="page-grid">
      <section className="card">
        <ViewHeader title="Mở ca · Ca sáng" subtitle={state === "loading" ? "Đang tải công việc…" : `${done}/${items.length} công việc hoàn tất`} />
        <div className="progress"><span style={{ width: items.length ? `${(done / items.length) * 100}%` : "0%" }} /></div>
        {state === "error" ? <InlineError text="Không tải được checklist. Vui lòng thử lại." /> : (
          <div className="list" style={{ marginTop: 18 }}>
            {items.map((item) => (
              <button key={item.id} className="list-row operation-row-button" onClick={() => toggle(item)}>
                <div className="person">
                  <span className={`mini-icon ${item.completed ? "mint" : "pink"}`}>{item.completed ? <Check size={15} /> : <Clock3 size={15} />}</span>
                  <span className="person-copy">
                    <strong style={{ textDecoration: item.completed ? "line-through" : "none", opacity: item.completed ? 0.6 : 1 }}>{item.label}</strong>
                    <small>{item.assignee} · {item.required ? "Bắt buộc" : "Tùy chọn"}</small>
                  </span>
                </div>
                <span className={`badge ${item.completed ? "success" : "neutral"}`}>{item.completed ? "Đã xong" : "Đánh dấu"}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <aside className="card" style={{ textAlign: "center" }}>
        <LoopySticker mood={items.length > 0 && done === items.length ? "success" : "checklist"} size={145} />
        <h3 className="card-title">{items.length > 0 && done === items.length ? "Tuyệt vời, xong hết rồi!" : "Mỗi việc nhỏ, một ca thật mượt"}</h3>
        <p className="supporting-copy">Mỗi thay đổi được lưu vào cửa hàng và ghi lại người thực hiện.</p>
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
      <aside className="card" style={{ textAlign: "center" }}>
        <LoopySticker mood="alert" size={138} />
        <h3 className="card-title">Báo sớm, xử lý gọn</h3>
        <p className="supporting-copy">{state === "loading" ? "Đang đồng bộ…" : `${issues.filter((issue) => issue.status === "open").length} sự cố đang mở.`}</p>
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
        <ViewHeader title="Bàn giao gần đây" subtitle={`${handovers.length} bản ghi đã lưu`} />
        <div className="list">
          {handovers.slice(0, 5).map((handover) => (
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
          <ViewHeader title="Yêu cầu cửa hàng" subtitle={`${requests.filter((item) => item.status === "pending").length} yêu cầu chờ duyệt`} />
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
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("employee");
  const [message, setMessage] = useState("");

  useEffect(() => { void refresh(); }, []);
  async function refresh() {
    const payload = await readJson(await fetch("/api/team", { cache: "no-store" }));
    setEmployees(payload.employees ?? []);
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, displayName, role }),
    });
    const payload = await readJson(response);
    if (response.ok) {
      setMessage("Đã tạo lời mời. Hãy cấp quyền truy cập trang riêng tư cho email này trước khi họ đăng nhập.");
      setShowForm(false); setEmail(""); setDisplayName(""); await refresh();
    } else {
      setMessage(payload.error ?? "Không thể tạo lời mời.");
    }
  }

  return (
    <section className="card">
      <div className="section-row" style={{ marginBottom: 18 }}>
        <ViewHeader title="Đội ngũ LoopiCafe" subtitle={`${employees.filter((employee) => employee.status === "active").length} tài khoản đang hoạt động`} />
        <button className="button button-compact" onClick={() => setShowForm((value) => !value)}><UserPlus size={15} /> Mời nhân viên</button>
      </div>
      {showForm && (
        <form className="attention-card operation-form" onSubmit={invite}>
          <div className="field"><label htmlFor="invite-name">Họ tên</label><input id="invite-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div>
          <div className="field"><label htmlFor="invite-email">Email</label><input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="field"><label htmlFor="invite-role">Vai trò</label><select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="employee">Nhân viên</option><option value="manager">Quản lý</option><option value="owner">Chủ cửa hàng</option></select></div>
          <div className="form-actions"><button className="button button-compact" type="submit">Tạo lời mời</button></div>
        </form>
      )}
      {message && <p className="operation-message">{message}</p>}
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
    name: "", address: "", latitude: "", longitude: "", timezone: "Asia/Ho_Chi_Minh",
    earlyCheckinMinutes: "30", lateMinutes: "10", earlyDepartureMinutes: "15",
    absenceMinutes: "60", missingCheckoutMinutes: "180",
  });
  const [message, setMessage] = useState("Đang tải thiết lập…");

  useEffect(() => {
    fetch("/api/store", { cache: "no-store" }).then(readJson).then((payload) => {
      const store = payload.store ?? {};
      const rules = payload.rules ?? {};
      setForm({
        name: store.name ?? "",
        address: store.address ?? "",
        latitude: String(store.latitude ?? ""),
        longitude: String(store.longitude ?? ""),
        timezone: store.timezone ?? "Asia/Ho_Chi_Minh",
        earlyCheckinMinutes: String(rules.early_checkin_minutes ?? 30),
        lateMinutes: String(rules.late_minutes ?? 10),
        earlyDepartureMinutes: String(rules.early_departure_minutes ?? 15),
        absenceMinutes: String(rules.absence_minutes ?? 60),
        missingCheckoutMinutes: String(rules.missing_checkout_minutes ?? 180),
      });
      setMessage("");
    }).catch(() => setMessage("Không tải được thiết lập."));
  }, []);
  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Đang lưu…");
    const response = await fetch("/api/store", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await readJson(response);
    setMessage(response.ok ? `Đã lưu. Quy tắc phiên bản ${payload.ruleVersion}.` : payload.error ?? "Không thể lưu.");
  }

  return (
    <div className="page-grid">
      <section className="card">
        <ViewHeader title="Cửa hàng & chấm công" subtitle="Tọa độ và ngưỡng được lưu theo phiên bản" />
        <form onSubmit={save}>
          <div className="form-grid">
            <InputField id="store-name" label="Tên cửa hàng" value={form.name} onChange={(value) => update("name", value)} full />
            <InputField id="address" label="Địa chỉ" value={form.address} onChange={(value) => update("address", value)} full />
            <InputField id="latitude" label="Vĩ độ" value={form.latitude} onChange={(value) => update("latitude", value)} />
            <InputField id="longitude" label="Kinh độ" value={form.longitude} onChange={(value) => update("longitude", value)} />
            <InputField id="early-checkin" label="Vào sớm tối đa (phút)" value={form.earlyCheckinMinutes} onChange={(value) => update("earlyCheckinMinutes", value)} />
            <InputField id="late" label="Ngưỡng đi trễ (phút)" value={form.lateMinutes} onChange={(value) => update("lateMinutes", value)} />
            <InputField id="early-departure" label="Ra sớm (phút)" value={form.earlyDepartureMinutes} onChange={(value) => update("earlyDepartureMinutes", value)} />
            <InputField id="absence" label="Ngưỡng vắng mặt (phút)" value={form.absenceMinutes} onChange={(value) => update("absenceMinutes", value)} />
            <InputField id="missing-checkout" label="Thiếu ra ca sau (phút)" value={form.missingCheckoutMinutes} onChange={(value) => update("missingCheckoutMinutes", value)} />
          </div>
          <div className="form-actions"><button className="button button-compact" type="submit">Lưu thiết lập</button></div>
        </form>
        {message && <p className="operation-message">{message}</p>}
      </section>
      <aside className="card">
        <ViewHeader title="Vị trí cửa hàng" subtitle="Chỉ dùng để tính khoảng cách hiển thị" />
        <div className="map-placeholder"><span className="mini-icon pink map-pin"><MapPin size={23} /></span></div>
        <p className="supporting-copy">Khoảng cách không tự động quyết định chấm công hợp lệ. Mỗi lần lưu sẽ tạo một phiên bản quy tắc mới.</p>
      </aside>
    </div>
  );
}

export function ScheduleManagerView({ canManage = false }: { canManage?: boolean }) {
  const [shifts, setShifts] = useState<Array<{
    id: string; employee_name: string; employee_email: string; starts_at: string; ends_at: string; role_label: string;
  }>>([]);
  const [employees, setEmployees] = useState<Array<{ email: string; display_name: string; status: string }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [employeeEmail, setEmployeeEmail] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState("");

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
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/shifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeEmail,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        roleLabel: "Nhân viên",
      }),
    });
    const payload = await readJson(response);
    if (response.ok) {
      setShowForm(false); setError(""); await refresh();
    } else setError(payload.error ?? "Không thể tạo ca.");
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <ViewHeader title="Lịch làm đã xuất bản" subtitle={`${shifts.length} ca được lưu`} />
          {canManage && <button className="button button-compact" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Tạo ca</button>}
        </div>
        {showForm && canManage && (
          <form className="attention-card operation-form" onSubmit={create}>
            <div className="field"><label htmlFor="shift-employee">Nhân viên</label><select id="shift-employee" value={employeeEmail} onChange={(event) => setEmployeeEmail(event.target.value)} required><option value="">Chọn nhân viên</option>{employees.map((employee) => <option value={employee.email} key={employee.email}>{employee.display_name}</option>)}</select></div>
            <div className="field"><label htmlFor="shift-start">Bắt đầu</label><input id="shift-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></div>
            <div className="field"><label htmlFor="shift-end">Kết thúc</label><input id="shift-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></div>
            <div className="form-actions"><button className="button button-compact" type="submit">Xuất bản ca</button></div>
          </form>
        )}
        {error && <InlineError text={error} />}
        <div className="list">
          {shifts.map((shift) => (
            <div className="list-row" key={shift.id}>
              <div className="person"><span className="mini-icon mint"><CalendarDays size={15} /></span><span className="person-copy"><strong>{shift.employee_name}</strong><small>{formatDateTime(shift.starts_at)} — {formatTime(shift.ends_at)}</small></span></div>
              <span className="badge success">{shift.role_label}</span>
            </div>
          ))}
        </div>
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
    const response = await fetch("/api/attendance/review", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId, decision }),
    });
    if (response.ok) await refresh();
  }

  return (
    <div className="stack">
      <section className="metric-grid">
        <MetricCard icon={AlertCircle} tone="pink" value={String(events.filter((event) => event.reviewRequired).length)} label="Cần xem xét" />
        <MetricCard icon={ShieldCheck} tone="mint" value={String(events.filter((event) => !event.reviewRequired).length)} label="Đã hoàn tất" />
        <MetricCard icon={MapPin} tone="amber" value={String(events.filter((event) => event.location).length)} label="Có vị trí" />
        <MetricCard icon={CheckCircle2} tone="burgundy" value={String(events.filter((event) => event.photoPresent).length)} label="Có ảnh máy chủ" />
      </section>
      <section className="card">
        <ViewHeader title="Bằng chứng chấm công" subtitle="Chỉ chủ quán và quản lý được mở ảnh, tọa độ chính xác" />
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
    displayName: string; workedMinutes: number; shiftCount: number; exceptionCount: number;
  }>>([]);
  useEffect(() => {
    fetch("/api/reports/attendance", { cache: "no-store" }).then(readJson).then((payload) => setSummary(payload.rows ?? []));
  }, []);
  const totalMinutes = useMemo(() => summary.reduce((total, row) => total + row.workedMinutes, 0), [summary]);
  return (
    <div className="stack">
      <section className="metric-grid">
        <MetricCard icon={Clock3} tone="mint" value={formatWorkedMinutes(totalMinutes)} label="Tổng giờ đã ghi nhận" />
        <MetricCard icon={UsersRound} tone="pink" value={String(summary.length)} label="Nhân viên có dữ liệu" />
        <MetricCard icon={AlertCircle} tone="amber" value={String(summary.reduce((total, row) => total + row.exceptionCount, 0))} label="Ngoại lệ" />
        <MetricCard icon={CheckCircle2} tone="burgundy" value={String(summary.reduce((total, row) => total + row.shiftCount, 0))} label="Phiên chấm công" />
      </section>
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <ViewHeader title="Tổng hợp giờ công" subtitle="Dữ liệu phiên thật, phút chính xác, không làm tròn" />
          <a href="/api/reports/attendance.csv" className="button button-compact"><Download size={15} /> Xuất CSV</a>
        </div>
        <div className="schedule-grid">
          <table className="report-table">
            <thead><tr>{["Nhân viên", "Giờ công", "Số phiên", "Ngoại lệ"].map((header) => <th key={header}>{header}</th>)}</tr></thead>
            <tbody>{summary.map((row) => <tr key={row.displayName}><td>{row.displayName}</td><td>{formatWorkedMinutes(row.workedMinutes)}</td><td>{row.shiftCount}</td><td>{row.exceptionCount}</td></tr>)}</tbody>
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

function InputField({ id, label, value, onChange, full }: { id: string; label: string; value: string; onChange: (value: string) => void; full?: boolean }) {
  return <div className={`field ${full ? "full" : ""}`}><label htmlFor={id}>{label}</label><input id={id} value={value} onChange={(event) => onChange(event.target.value)} required /></div>;
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
  return "Nhân viên";
}
