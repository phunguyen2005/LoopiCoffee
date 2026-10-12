"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Coffee,
  Download,
  MapPin,
  PackageOpen,
  Plus,
  Search,
  ShieldCheck,
  TimerReset,
  TriangleAlert,
  UsersRound,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { AttendanceCapture } from "./attendance-capture";
import { LoopySticker } from "./loopy-sticker";

const staff = [
  { name: "Trần Gia Hân", role: "Pha chế", initials: "GH", status: "Đang làm", time: "07:56" },
  { name: "Phạm Minh Khoa", role: "Thu ngân", initials: "MK", status: "Đang làm", time: "08:02" },
  { name: "Lê Thảo Vy", role: "Phục vụ", initials: "TV", status: "Đi trễ", time: "08:11" },
  { name: "Nguyễn Quốc Bảo", role: "Pha chế", initials: "QB", status: "Ca sau", time: "13:00" },
];

const checklistSeed = [
  { id: 1, label: "Khởi động máy pha cà phê", required: true, done: true, assignee: "Gia Hân" },
  { id: 2, label: "Kiểm tra tiền lẻ đầu ca", required: true, done: true, assignee: "Minh Khoa" },
  { id: 3, label: "Kiểm tra sữa, hạt và đá", required: true, done: false, assignee: "Thảo Vy" },
  { id: 4, label: "Vệ sinh quầy phục vụ", required: true, done: false, assignee: "Thảo Vy" },
  { id: 5, label: "Mở ứng dụng giao hàng", required: false, done: true, assignee: "Minh Khoa" },
  { id: 6, label: "Xác nhận quán sẵn sàng", required: true, done: false, assignee: "Gia Hân" },
];

const initialIssues = [
  { id: 1, title: "Máy xay số 2 phát tiếng lạ", category: "Thiết bị", severity: "Cao", status: "Mở", time: "09:14" },
  { id: 2, title: "Sắp hết ly giấy 500 ml", category: "Thiếu bao bì", severity: "Vừa", status: "Đã tiếp nhận", time: "08:46" },
  { id: 3, title: "Mạng máy POS chập chờn", category: "POS / Internet", severity: "Thấp", status: "Đã xử lý", time: "Hôm qua" },
];

export function DashboardView() {
  return (
    <div className="stack">
      <section className="hero-status-card">
        <div className="hero-status-copy">
          <span className="status-label"><Coffee size={14} /> Đang vận hành · Ca sáng</span>
          <h2>Chào buổi sáng, chị Linh!</h2>
          <p>Quán đã mở được 1 giờ 24 phút. Có 2 việc cần chị xem ngay hôm nay.</p>
          <div className="status-metrics">
            <span><strong>3/4</strong><small>đã có mặt</small></span>
            <span><strong>50%</strong><small>mở ca</small></span>
            <span><strong>2</strong><small>cần xử lý</small></span>
          </div>
        </div>
        <div className="hero-status-mascot"><LoopySticker mood="hello" size={126} /></div>
      </section>

      <section className="metric-grid" aria-label="Chỉ số vận hành">
        <Metric icon={UsersRound} tone="mint" value="3" label="Đang trong ca" />
        <Metric icon={TimerReset} tone="pink" value="1" label="Đi trễ hôm nay" />
        <Metric icon={ClipboardCheck} tone="amber" value="3/6" label="Việc mở ca" />
        <Metric icon={TriangleAlert} tone="burgundy" value="2" label="Sự cố đang mở" />
      </section>

      <div className="page-grid">
        <div className="stack">
          <section className="card">
            <CardHeader title="Nhân sự trong ca" subtitle="Cập nhật gần nhất lúc 09:24" action="Xem lịch" href="/app/schedule" />
            <div className="list">
              {staff.map((person) => (
                <PersonRow key={person.name} {...person} />
              ))}
            </div>
          </section>
          <section className="card">
            <CardHeader title="Tiến độ mở ca" subtitle="3 trong 6 công việc đã hoàn tất" action="Mở checklist" href="/app/checklists" />
            <div className="progress" aria-label="50 phần trăm hoàn tất"><span style={{ width: "50%" }} /></div>
            <div className="list" style={{ marginTop: 12 }}>
              {checklistSeed.slice(0, 4).map((item) => (
                <div className="list-row" key={item.id}>
                  <div className="person">
                    <span className={`mini-icon ${item.done ? "mint" : "pink"}`}>
                      {item.done ? <Check size={15} /> : <Clock3 size={15} />}
                    </span>
                    <span className="person-copy">
                      <strong>{item.label}</strong>
                      <small>{item.assignee} · {item.required ? "Bắt buộc" : "Tùy chọn"}</small>
                    </span>
                  </div>
                  <span className={`badge ${item.done ? "success" : "warning"}`}>{item.done ? "Xong" : "Đang chờ"}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <CardHeader title="Cần chị xem" subtitle="Ưu tiên theo mức độ ảnh hưởng" />
            <div className="attention-card">
              <span className="badge danger"><AlertCircle size={11} /> Mức cao</span>
              <h4 style={{ marginTop: 10 }}>Máy xay số 2 phát tiếng lạ</h4>
              <p>Gia Hân báo lúc 09:14. Thiết bị vẫn đang được tạm ngưng sử dụng.</p>
              <Link className="text-link" href="/app/issues">Xem chi tiết <ArrowRight size={11} /></Link>
            </div>
            <div className="attention-card">
              <span className="badge warning"><TimerReset size={11} /> Ngoại lệ</span>
              <h4 style={{ marginTop: 10 }}>Thảo Vy chấm công lúc 08:11</h4>
              <p>Ảnh và vị trí đã ghi nhận. Nhân viên có ghi chú về kẹt xe.</p>
              <Link className="text-link" href="/app/attendance">Duyệt chấm công <ArrowRight size={11} /></Link>
            </div>
          </section>
          <section className="card">
            <CardHeader title="Bàn giao gần nhất" subtitle="Ca đóng cửa · Hôm qua 22:18" />
            <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.7 }}>
              Còn ít syrup đào. Máy làm đá hoạt động bình thường sau khi vệ sinh.
              Cần bổ sung ly 500 ml trong sáng nay.
            </p>
            <span className="badge warning">Cần quản lý chú ý</span>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function TodayView() {
  return (
    <div className="page-grid">
      <div className="stack">
        <section className="hero-status-card" style={{ minHeight: 245 }}>
          <div className="hero-status-copy">
            <span className="status-label"><CalendarDays size={14} /> Thứ tư, 29 tháng 7</span>
            <h2>Ca sáng · 08:00 — 16:00</h2>
            <p>Vị trí: LoopiCafe Nguyễn Trãi · Vai trò: Trưởng ca</p>
            <div className="status-metrics">
              <span><strong>08:02</strong><small>đã vào ca</small></span>
              <span><strong>3/6</strong><small>việc hoàn tất</small></span>
            </div>
          </div>
          <div className="hero-status-mascot"><LoopySticker mood="working" size={125} /></div>
        </section>
        <section className="card">
          <CardHeader title="Việc cần làm tiếp theo" subtitle="Checklist mở ca" action="Xem tất cả" href="/app/checklists" />
          <div className="list">
            {checklistSeed.map((item) => (
              <div className="list-row" key={item.id}>
                <div className="person">
                  <span className={`mini-icon ${item.done ? "mint" : "pink"}`}>
                    {item.done ? <Check size={15} /> : <Clock3 size={15} />}
                  </span>
                  <span className="person-copy">
                    <strong>{item.label}</strong>
                    <small>{item.required ? "Bắt buộc" : "Tùy chọn"} · {item.assignee}</small>
                  </span>
                </div>
                <span className={`badge ${item.done ? "success" : "neutral"}`}>{item.done ? "Đã xong" : "Chưa làm"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <aside className="stack">
        <section className="card">
          <CardHeader title="Chấm công hôm nay" subtitle="Thời gian do máy chủ ghi nhận" />
          <div className="list">
            <div className="list-row">
              <div className="person">
                <span className="mini-icon mint"><Check size={15} /></span>
                <span className="person-copy"><strong>Vào ca</strong><small>08:02 · Có ảnh & vị trí</small></span>
              </div>
              <span className="badge success">Đã ghi nhận</span>
            </div>
            <div className="list-row">
              <div className="person">
                <span className="mini-icon pink"><Clock3 size={15} /></span>
                <span className="person-copy"><strong>Ra ca</strong><small>Dự kiến 16:00</small></span>
              </div>
              <span className="badge neutral">Chưa đến giờ</span>
            </div>
          </div>
          <Link href="/app/attendance" className="button" style={{ width: "100%", marginTop: 14, padding: "0 18px" }}>
            Mở chấm công <Camera size={16} />
          </Link>
        </section>
        <section className="card">
          <CardHeader title="Thông tin bàn giao" subtitle="Từ ca đóng cửa hôm qua" />
          <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.7 }}>
            Ưu tiên kiểm tra ly giấy 500 ml và syrup đào trước giờ cao điểm.
          </p>
          <span className="badge warning">Đã đọc lúc 07:58</span>
        </section>
      </aside>
    </div>
  );
}

export function ScheduleView() {
  const people = ["Gia Hân", "Minh Khoa", "Thảo Vy", "Quốc Bảo"];
  const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  return (
    <div className="stack">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <div>
            <h2 className="card-title">Tuần 27/07 — 02/08</h2>
            <p className="card-subtitle">4 nhân viên · 18 ca đã phân công</p>
          </div>
          <div className="header-actions">
            <button className="icon-button" aria-label="Tuần trước"><ChevronLeft size={16} /></button>
            <button className="icon-button" aria-label="Tuần sau"><ChevronRight size={16} /></button>
            <button className="button button-compact"><Plus size={15} /> Tạo ca</button>
          </div>
        </div>
        <div className="schedule-grid">
          <div className="week-grid">
            <div className="week-head" />
            {days.map((day, index) => <div className="week-head" key={day}>{day}<strong>{27 + index}</strong></div>)}
            {people.flatMap((person, personIndex) => [
              <div className="week-person" key={`${person}-name`}>{person}</div>,
              ...days.map((day, dayIndex) => (
                <div className="week-cell" key={`${person}-${day}`}>
                  {(dayIndex + personIndex) % 3 !== 1 && (
                    <div className={`shift-block ${personIndex % 3 === 1 ? "mint" : personIndex % 3 === 2 ? "amber" : ""}`}>
                      {personIndex % 2 ? "13:00–21:00" : "08:00–16:00"}<br />{personIndex === 0 ? "Pha chế" : personIndex === 1 ? "Thu ngân" : "Phục vụ"}
                    </div>
                  )}
                </div>
              )),
            ])}
          </div>
        </div>
      </section>
      <div className="metric-grid">
        <Metric icon={CalendarDays} tone="mint" value="18" label="Ca đã lên lịch" />
        <Metric icon={UsersRound} tone="pink" value="4" label="Nhân viên" />
        <Metric icon={AlertCircle} tone="amber" value="1" label="Ca còn thiếu người" />
        <Metric icon={Clock3} tone="burgundy" value="132h" label="Tổng giờ dự kiến" />
      </div>
    </div>
  );
}

export function AttendanceView() {
  return (
    <div className="page-grid attendance-page-grid">
      <AttendanceCapture />
      <aside className="stack attendance-support">
        <section className="card">
          <CardHeader title="Quyền riêng tư" subtitle="Ảnh và vị trí chỉ được lấy khi bạn bấm chấm công" />
          <div className="list">
            <EvidenceLine icon={Camera} title="Ảnh trực tiếp" text="Không cho chọn ảnh có sẵn" />
            <EvidenceLine icon={MapPin} title="Vị trí một lần" text="Không theo dõi nền" />
            <EvidenceLine icon={Clock3} title="Giờ máy chủ" text="Không dùng đồng hồ điện thoại" />
            <EvidenceLine icon={ShieldCheck} title="Lưu riêng tư" text="Theo thời hạn lưu trữ đã cấu hình" />
          </div>
          <Link href="/camera-location-notice" className="text-link">Đọc thông báo đầy đủ <ArrowRight size={11} /></Link>
        </section>
        <section className="card">
          <CardHeader title="Lịch làm việc" subtitle="Xem ca được phân công và giờ bắt đầu, kết thúc" />
          <Link href="/app/schedule" className="text-link">Mở lịch của bạn <ArrowRight size={11} /></Link>
        </section>
      </aside>
    </div>
  );
}

export function ChecklistsView() {
  const [items, setItems] = useState(checklistSeed);
  const done = items.filter((item) => item.done).length;
  function toggle(id: number) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, done: !item.done } : item));
  }
  return (
    <div className="page-grid">
      <section className="card">
        <CardHeader title="Mở ca · Ca sáng" subtitle={`${done}/${items.length} công việc hoàn tất`} />
        <div className="progress"><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
        <div className="list" style={{ marginTop: 18 }}>
          {items.map((item) => (
            <button
              key={item.id}
              className="list-row"
              onClick={() => toggle(item.id)}
              style={{ width: "100%", borderLeft: 0, borderRight: 0, borderTop: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}
            >
              <div className="person">
                <span className={`mini-icon ${item.done ? "mint" : "pink"}`}>{item.done ? <Check size={15} /> : <Clock3 size={15} />}</span>
                <span className="person-copy">
                  <strong style={{ textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>{item.label}</strong>
                  <small>{item.assignee} · {item.required ? "Bắt buộc" : "Tùy chọn"}</small>
                </span>
              </div>
              <span className={`badge ${item.done ? "success" : "neutral"}`}>{item.done ? "Đã xong" : "Đánh dấu"}</span>
            </button>
          ))}
        </div>
      </section>
      <aside className="stack">
        <section className="card" style={{ textAlign: "center" }}>
          <LoopySticker mood={done === items.length ? "success" : "checklist"} size={145} />
          <h3 className="card-title">{done === items.length ? "Tuyệt vời, xong hết rồi!" : "Mỗi việc nhỏ, một ca thật mượt"}</h3>
          <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 10, lineHeight: 1.6 }}>
            Các mục bắt buộc chưa hoàn tất sẽ được nhắc khi ra ca, nhưng không giữ bạn lại.
          </p>
        </section>
        <section className="card">
          <CardHeader title="Mẫu checklist" subtitle="Phiên bản 3 · Cập nhật 21/07" action="Quản lý mẫu" />
          <span className="badge success">Đang áp dụng</span>
        </section>
      </aside>
    </div>
  );
}

export function IssuesView() {
  const [issues, setIssues] = useState(initialIssues);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  function addIssue(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setIssues((current) => [
      { id: Date.now(), title, category: "Khác", severity: "Vừa", status: "Mở", time: "Vừa xong" },
      ...current,
    ]);
    setTitle("");
    setShowForm(false);
  }
  return (
    <div className="page-grid">
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <div><h2 className="card-title">Danh sách cần xử lý</h2><p className="card-subtitle">Thiết bị, vận hành và thiếu nguyên liệu</p></div>
          <button className="button button-compact" onClick={() => setShowForm((value) => !value)}><Plus size={15} /> Báo sự cố</button>
        </div>
        {showForm && (
          <form className="attention-card" onSubmit={addIssue} style={{ marginBottom: 14 }}>
            <div className="field">
              <label htmlFor="issue-title">Mô tả ngắn</label>
              <input id="issue-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Máy lạnh không mát" autoFocus />
            </div>
            <div className="form-actions">
              <button type="button" className="button-secondary button-compact" onClick={() => setShowForm(false)}>Hủy</button>
              <button className="button button-compact" type="submit">Gửi báo cáo</button>
            </div>
          </form>
        )}
        <div className="list">
          {issues.map((issue) => (
            <div className="list-row" key={issue.id}>
              <div className="person">
                <span className={`mini-icon ${issue.severity === "Cao" ? "pink" : "mint"}`}>{issue.category === "Thiết bị" ? <Wrench size={15} /> : <PackageOpen size={15} />}</span>
                <span className="person-copy">
                  <strong>{issue.title}</strong>
                  <small>{issue.category} · {issue.time}</small>
                </span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <span className={`badge ${issue.severity === "Cao" ? "danger" : issue.severity === "Vừa" ? "warning" : "neutral"}`}>{issue.severity}</span>
                <span className={`badge ${issue.status === "Đã xử lý" ? "success" : "neutral"}`}>{issue.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className="stack">
        <section className="card" style={{ textAlign: "center" }}>
          <LoopySticker mood="worries" size={138} />
          <h3 className="card-title">Báo sớm, xử lý gọn</h3>
          <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 10, lineHeight: 1.6 }}>Ảnh và mô tả giúp quản lý hiểu tình hình trước khi liên hệ lại.</p>
        </section>
        <section className="metric-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <Metric icon={AlertCircle} tone="pink" value="1" label="Mức cao" />
          <Metric icon={CheckCircle2} tone="mint" value="5" label="Đã xử lý tuần này" />
        </section>
      </aside>
    </div>
  );
}

export function HandoversView() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="page-grid">
      <section className="card">
        <CardHeader title="Bàn giao ca sáng" subtitle="Cho ca chiều · 13:00 — 21:00" />
        <form onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="unfinished">Việc chưa hoàn tất</label><textarea id="unfinished" defaultValue="Vệ sinh kỹ máy xay số 2 sau khi kỹ thuật kiểm tra." /></div>
            <div className="field"><label htmlFor="stock">Nguyên liệu / bao bì sắp hết</label><textarea id="stock" defaultValue="Ly giấy 500 ml, syrup đào." /></div>
            <div className="field"><label htmlFor="equipment">Thiết bị cần lưu ý</label><textarea id="equipment" defaultValue="Không sử dụng máy xay số 2." /></div>
            <div className="field full"><label htmlFor="next-note">Ghi chú cho ca sau</label><textarea id="next-note" placeholder="Thông tin ngắn gọn, dễ hành động..." /></div>
          </div>
          <div className="form-actions"><button className="button-secondary button-compact" type="button">Lưu nháp</button><button className="button button-compact" type="submit">Gửi bàn giao</button></div>
        </form>
      </section>
      <aside className="stack">
        <section className="card">
          <CardHeader title="Bàn giao gần đây" subtitle="Đã được ca sau xác nhận" />
          <div className="list">
            <div className="list-row"><span className="person-copy"><strong>Ca đóng cửa · 28/07</strong><small>Quốc Bảo · 22:18</small></span><span className="badge success">Đã đọc</span></div>
            <div className="list-row"><span className="person-copy"><strong>Ca sáng · 28/07</strong><small>Gia Hân · 13:04</small></span><span className="badge success">Đã đọc</span></div>
          </div>
        </section>
        {saved && <div className="toast"><CheckCircle2 size={17} /> Bàn giao đã được gửi cho ca sau.</div>}
      </aside>
    </div>
  );
}

export function RequestsView() {
  return (
    <div className="page-grid">
      <section className="card">
        <CardHeader title="Đang chờ duyệt" subtitle="3 yêu cầu cần quyết định" />
        <div className="list">
          {[
            ["Thảo Vy", "Nghỉ ca sáng · 02/08", "Việc gia đình", "Nghỉ phép"],
            ["Quốc Bảo", "Đổi ca với Minh Khoa", "Ca tối · 01/08", "Đổi ca"],
            ["Gia Hân", "Điều chỉnh giờ ra ca", "28/07 · 21:47 → 22:00", "Chấm công"],
          ].map(([name, title, note, type]) => (
            <div className="list-row" key={title}>
              <div className="person"><span className="avatar">{name.split(" ").slice(-2).map((x) => x[0]).join("")}</span><span className="person-copy"><strong>{title}</strong><small>{name} · {note}</small></span></div>
              <span className="badge warning">{type}</span>
            </div>
          ))}
        </div>
      </section>
      <aside className="card">
        <CardHeader title="Ảnh hưởng nhân sự" subtitle="Nếu duyệt tất cả yêu cầu" />
        <div className="attention-card"><span className="badge warning">Cần chú ý</span><h4 style={{ marginTop: 10 }}>Ca sáng 02/08 còn thiếu 1 người</h4><p>Nên phân công thêm nhân viên trước khi duyệt nghỉ.</p></div>
      </aside>
    </div>
  );
}

export function TeamView() {
  return (
    <section className="card">
      <div className="section-row" style={{ marginBottom: 18 }}>
        <div><h2 className="card-title">Đội ngũ LoopiCafe</h2><p className="card-subtitle">4 nhân viên đang hoạt động</p></div>
        <div className="header-actions"><button className="icon-button" aria-label="Tìm nhân viên"><Search size={16} /></button><button className="button button-compact"><Plus size={15} /> Mời nhân viên</button></div>
      </div>
      <div className="list">
        {staff.map((person, index) => (
          <div className="list-row" key={person.name}>
            <div className="person"><span className="avatar">{person.initials}</span><span className="person-copy"><strong>{person.name}</strong><small>{person.role} · NV-00{index + 1}</small></span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="badge success">Đang làm việc</span><button className="icon-button" aria-label={`Xem ${person.name}`}><ArrowRight size={15} /></button></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReportsView() {
  const records = [
    ["Trần Gia Hân", "42h 16p", "5", "0", "0"],
    ["Phạm Minh Khoa", "38h 02p", "5", "0", "1"],
    ["Lê Thảo Vy", "35h 47p", "4", "2", "0"],
    ["Nguyễn Quốc Bảo", "31h 28p", "4", "0", "0"],
  ];
  return (
    <div className="stack">
      <section className="metric-grid">
        <Metric icon={Clock3} tone="mint" value="147h 33p" label="Tổng giờ tuần này" />
        <Metric icon={UsersRound} tone="pink" value="4" label="Nhân viên" />
        <Metric icon={TimerReset} tone="amber" value="2" label="Lần đi trễ" />
        <Metric icon={AlertCircle} tone="burgundy" value="1" label="Ngoại lệ chờ duyệt" />
      </section>
      <section className="card">
        <div className="section-row" style={{ marginBottom: 18 }}>
          <div><h2 className="card-title">Tổng hợp giờ công</h2><p className="card-subtitle">21/07 — 27/07 · Giờ đã duyệt, không làm tròn</p></div>
          <a href="/api/reports/attendance.csv" className="button button-compact"><Download size={15} /> Xuất CSV</a>
        </div>
        <div className="schedule-grid">
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620, fontSize: 11 }}>
            <thead><tr style={{ textAlign: "left", color: "var(--muted)" }}>{["Nhân viên", "Giờ công", "Số ca", "Đi trễ", "Ngoại lệ"].map((header) => <th key={header} style={{ padding: "12px", borderBottom: "1px solid var(--line)" }}>{header}</th>)}</tr></thead>
            <tbody>{records.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={cell + index} style={{ padding: "15px 12px", borderBottom: "1px solid var(--line)", fontWeight: index === 0 ? 700 : 500 }}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function StoreSettingsView() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="page-grid">
      <section className="card">
        <CardHeader title="Thông tin cửa hàng" subtitle="Dùng cho giờ địa phương và bằng chứng chấm công" />
        <form onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
          <div className="form-grid">
            <div className="field full"><label htmlFor="store-name">Tên cửa hàng</label><input id="store-name" defaultValue="LoopiCafe Nguyễn Trãi" /></div>
            <div className="field full"><label htmlFor="address">Địa chỉ</label><input id="address" defaultValue="Nguyễn Trãi, Quận 5, TP. Hồ Chí Minh" /></div>
            <div className="field"><label htmlFor="latitude">Vĩ độ</label><input id="latitude" defaultValue="10.754128" /></div>
            <div className="field"><label htmlFor="longitude">Kinh độ</label><input id="longitude" defaultValue="106.667540" /></div>
            <div className="field"><label htmlFor="timezone">Múi giờ</label><select id="timezone" defaultValue="Asia/Ho_Chi_Minh"><option>Asia/Ho_Chi_Minh</option></select></div>
            <div className="field"><label htmlFor="retention">Lưu ảnh chấm công</label><select id="retention" defaultValue="90"><option value="90">90 ngày</option></select></div>
          </div>
          <div className="form-actions"><button className="button button-compact" type="submit">Lưu thiết lập</button></div>
        </form>
      </section>
      <aside className="stack">
        <section className="card">
          <CardHeader title="Vị trí cửa hàng" subtitle="Chỉ dùng để tính khoảng cách hiển thị" />
          <div style={{ minHeight: 180, borderRadius: 18, display: "grid", placeItems: "center", background: "linear-gradient(145deg, #e2f2ea, #f6ece7)" }}>
            <span className="mini-icon pink" style={{ width: 52, height: 52, borderRadius: 18 }}><MapPin size={23} /></span>
          </div>
          <p style={{ margin: "13px 0 0", color: "var(--muted)", fontSize: 9, lineHeight: 1.6 }}>Khoảng cách chỉ là dữ liệu tham khảo, không tự động quyết định chấm công hợp lệ.</p>
        </section>
        {saved && <div className="toast"><CheckCircle2 size={17} /> Đã lưu thiết lập cửa hàng.</div>}
      </aside>
    </div>
  );
}

function Metric({ icon: Icon, tone, value, label }: { icon: React.ComponentType<{ size?: number }>; tone: string; value: string; label: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={17} /></span><strong>{value}</strong><span>{label}</span></article>;
}

function CardHeader({ title, subtitle, action, href }: { title: string; subtitle?: string; action?: string; href?: string }) {
  return (
    <div className="card-header">
      <div><h2 className="card-title">{title}</h2>{subtitle && <p className="card-subtitle">{subtitle}</p>}</div>
      {action && (href ? <Link className="text-link" href={href}>{action}</Link> : <button className="text-link">{action}</button>)}
    </div>
  );
}

function PersonRow({ name, role, initials, status, time }: (typeof staff)[number]) {
  return (
    <div className="list-row">
      <div className="person"><span className="avatar">{initials}</span><span className="person-copy"><strong>{name}</strong><small>{role} · {time}</small></span></div>
      <span className={`badge ${status === "Đang làm" ? "success" : status === "Đi trễ" ? "danger" : "neutral"}`}>{status}</span>
    </div>
  );
}

function EvidenceLine({ icon: Icon, title, text }: { icon: React.ComponentType<{ size?: number }>; title: string; text: string }) {
  return (
    <div className="list-row">
      <div className="person"><span className="mini-icon mint"><Icon size={15} /></span><span className="person-copy"><strong>{title}</strong><small>{text}</small></span></div>
      <CheckCircle2 size={15} color="var(--mint-strong)" />
    </div>
  );
}
