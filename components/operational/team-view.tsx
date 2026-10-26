"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, KeyRound, Search, ShieldCheck, UserPlus, UserRound, X } from "lucide-react";
import { AsyncStatePanel, ListSkeleton, ViewHeader, initials, readJson, roleLabel } from "./shared";

type Member = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  role_id?: string | null;
  role_name?: string | null;
  status: string;
  job_title: string | null;
  phone: string | null;
  start_date: string | null;
  participates_attendance: number;
  payroll_eligible: number;
  compensation_type: "hourly" | "monthly" | "none";
  hourly_rate: number;
  monthly_salary: number;
  access_revision?: number;
  updated_at: string;
};

type CustomRole = {
  id: string;
  name: string;
  status: string;
  revision: number;
};

type QuickFilter = "all" | "active" | "attendance" | "inactive";

function memberStatusLabel(status: string) {
  if (status === "active") return "Đang hoạt động";
  if (status === "invited") return "Chờ kích hoạt";
  if (status === "suspended") return "Tạm khóa";
  if (status === "offboarded") return "Đã nghỉ việc";
  return "Ngừng hoạt động";
}

function compensationSummary(member: Member) {
  if (member.compensation_type === "hourly") {
    return `${(member.hourly_rate ?? 0).toLocaleString("vi-VN")}đ/giờ`;
  }
  if (member.compensation_type === "monthly") {
    return `${(member.monthly_salary ?? 0).toLocaleString("vi-VN")}đ/tháng`;
  }
  return "Chưa cấu hình lương";
}

export function PersistentTeamView() {
  const [members, setMembers] = useState<Member[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("employee");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [editing, setEditing] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmResetPassword, setConfirmResetPassword] = useState(false);
  const [confirmStatusChange, setConfirmStatusChange] = useState(false);
  const [resetCredential, setResetCredential] = useState<{ email: string; displayName: string; password: string } | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    jobTitle: "",
    phone: "",
    startDate: "",
    participatesAttendance: false,
    payrollEligible: false,
    compensationType: "none",
    hourlyRate: "0",
    monthlySalary: "0",
    roleSelect: "employee",
    status: "active",
    reason: "",
  });

  // Create Account State
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [copied, setCopied] = useState(false);
  const [createdCredential, setCreatedCredential] = useState<{
    email: string;
    displayName: string;
    password?: string;
    role: string;
    activationMethod: string;
  } | null>(null);
  const [createForm, setCreateForm] = useState({
    displayName: "",
    email: "",
    roleSelect: "employee",
    jobTitle: "Barista",
    phone: "",
    startDate: new Date().toISOString().slice(0, 10),
    activationMethod: "temporary_password" as "temporary_password" | "invite",
    participatesAttendance: true,
    payrollEligible: true,
    compensationType: "hourly" as "hourly" | "monthly" | "none",
    hourlyRate: "25000",
    monthlySalary: "0",
    reason: "",
  });

  const isOwner = currentUserRole === "owner";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/team", { cache: "no-store" });
      const data = await readJson<{
        employees?: Member[];
        customRoles?: CustomRole[];
        currentUserRole?: string;
        error?: string;
      }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể tải nhân sự.");
      setMembers(data.employees ?? []);
      setCustomRoles(data.customRoles ?? []);
      if (data.currentUserRole) setCurrentUserRole(data.currentUserRole);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải nhân sự.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => {
    return {
      all: members.length,
      active: members.filter((m) => m.status === "active").length,
      attendance: members.filter((m) => Boolean(m.participates_attendance)).length,
      inactive: members.filter((m) => m.status !== "active").length,
    };
  }, [members]);

  const filtered = useMemo(() => {
    return members.filter((member) => {
      if (quickFilter === "active" && member.status !== "active") return false;
      if (quickFilter === "attendance" && !member.participates_attendance) return false;
      if (quickFilter === "inactive" && member.status === "active") return false;
      const needle = search.trim().toLowerCase();
      return (
        !needle ||
        member.display_name.toLowerCase().includes(needle) ||
        member.email.toLowerCase().includes(needle) ||
        member.job_title?.toLowerCase().includes(needle)
      );
    });
  }, [members, search, quickFilter]);

  function open(member: Member) {
    setEditing(member);
    setConfirmResetPassword(false);
    setConfirmStatusChange(false);
    setForm({
      displayName: member.display_name,
      jobTitle: member.job_title ?? "",
      phone: member.phone ?? "",
      startDate: member.start_date ?? "",
      participatesAttendance: Boolean(member.participates_attendance),
      payrollEligible: Boolean(member.payroll_eligible),
      compensationType: member.compensation_type ?? "none",
      hourlyRate: String(member.hourly_rate ?? 0),
      monthlySalary: String(member.monthly_salary ?? 0),
      roleSelect: member.role_id ? `custom:${member.role_id}` : member.role,
      status: member.status,
      reason: "",
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const roleChanged = form.roleSelect !== (editing.role_id ? `custom:${editing.role_id}` : editing.role);
    const payrollChanged =
      form.payrollEligible !== Boolean(editing.payroll_eligible) ||
      form.compensationType !== editing.compensation_type ||
      Number(form.hourlyRate) !== (editing.hourly_rate ?? 0) ||
      Number(form.monthlySalary) !== (editing.monthly_salary ?? 0);
    if ((roleChanged || payrollChanged) && form.reason.trim().length < 5) {
      setError("Hãy nhập lý do khi thay đổi vai trò, quyền tính lương hoặc mức lương (tối thiểu 5 ký tự).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const isCustom = form.roleSelect.startsWith("custom:");
      const targetRole = isCustom ? "employee" : form.roleSelect;
      const targetRoleId = isCustom ? form.roleSelect.slice(7) : null;

      const payload: Record<string, unknown> = {
        id: editing.id,
        expectedUpdatedAt: editing.updated_at,
        displayName: form.displayName,
        jobTitle: form.jobTitle,
        phone: form.phone,
        startDate: form.startDate,
        participatesAttendance: form.participatesAttendance,
        payrollEligible: form.payrollEligible,
        compensationType: form.compensationType,
        hourlyRate: form.hourlyRate,
        monthlySalary: form.monthlySalary,
        reason: form.reason.trim(),
      };

      if (isOwner) {
        payload.role = targetRole;
        payload.roleId = targetRoleId;
        payload.status = form.status;
        payload.expectedRevision = editing.access_revision ?? 0;
      }

      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể cập nhật hồ sơ.");
      if (form.status !== editing.status) {
        const scheduleNote = form.status === "active" ? "Nhân viên có thể được xếp lịch trở lại." : "Nhân viên đã bị loại khỏi danh sách xếp lịch mới.";
        setMessage(`Đã lưu hồ sơ và chuyển trạng thái sang “${memberStatusLabel(form.status)}”. ${scheduleNote}`);
      } else {
        setMessage("Đã lưu lại thông tin thành viên và phân quyền mới rồi nhé! ✨");
      }
      setEditing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật hồ sơ.");
    } finally {
      setBusy(false);
    }
  }

  async function resetMemberPassword() {
    if (!editing || !isOwner || busy) return;
    if (form.reason.trim().length < 5) {
      setError("Hãy nhập lý do cấp lại mật khẩu, tối thiểu 5 ký tự.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editing.id, action: "reset_password", reason: form.reason.trim() }),
      });
      const data = await readJson<{ error?: string; temporaryPassword?: string }>(response);
      if (!response.ok || !data.temporaryPassword) {
        throw new Error(data.error ?? "Không thể cấp lại mật khẩu tạm.");
      }
      setCopied(false);
      setResetCredential({ email: editing.email, displayName: editing.display_name, password: data.temporaryPassword });
      setMessage("Đã cấp mật khẩu tạm mới. Nhân viên bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo.");
      setEditing(null);
      setConfirmResetPassword(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cấp lại mật khẩu tạm.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMemberStatus() {
    if (!editing || !isOwner || busy || form.status === editing.status) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          action: "update_status",
          status: form.status,
          expectedRevision: editing.access_revision ?? 0,
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể cập nhật trạng thái nhân viên.");
      const scheduleNote = form.status === "active" ? "Nhân viên có thể được xếp lịch trở lại." : "Nhân viên đã bị loại khỏi danh sách xếp lịch mới.";
      setMessage(`Đã chuyển trạng thái sang “${memberStatusLabel(form.status)}”. ${scheduleNote}`);
      setEditing(null);
      setConfirmStatusChange(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật trạng thái nhân viên.");
    } finally {
      setBusy(false);
    }
  }

  function resetCreateForm() {
    setCreateForm({
      displayName: "",
      email: "",
      roleSelect: "employee",
      jobTitle: "Barista",
      phone: "",
      startDate: new Date().toISOString().slice(0, 10),
      activationMethod: "temporary_password",
      participatesAttendance: true,
      payrollEligible: true,
      compensationType: "hourly",
      hourlyRate: "25000",
      monthlySalary: "0",
      reason: "",
    });
    setCreateError("");
  }

  async function handleCreateAccount(event: React.FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setCreateError("");
    try {
      const isCustom = createForm.roleSelect.startsWith("custom:");
      const targetRole = isCustom ? "employee" : createForm.roleSelect;
      const targetRoleId = isCustom ? createForm.roleSelect.slice(7) : null;

      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: createForm.email.trim().toLowerCase(),
          displayName: createForm.displayName.trim(),
          role: targetRole,
          roleId: targetRoleId,
          jobTitle: createForm.jobTitle.trim(),
          phone: createForm.phone.trim(),
          startDate: createForm.startDate,
          participatesAttendance: createForm.participatesAttendance,
          payrollEligible: createForm.payrollEligible,
          compensationType: createForm.compensationType,
          hourlyRate: createForm.hourlyRate,
          monthlySalary: createForm.monthlySalary,
          activationMethod: createForm.activationMethod,
          reason: createForm.reason.trim() || "Tạo tài khoản nhân viên mới từ quản lý nhân sự",
        }),
      });

      const data = await readJson<{ account?: Member; temporaryPassword?: string; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể tạo tài khoản.");

      await load();

      if (data.temporaryPassword) {
        setCreatedCredential({
          email: createForm.email.trim().toLowerCase(),
          displayName: createForm.displayName.trim(),
          password: data.temporaryPassword,
          role: targetRole,
          activationMethod: createForm.activationMethod,
        });
      } else {
        setShowCreate(false);
        setMessage(`Đã gửi thư mời kích hoạt tài khoản tới ${createForm.email}! ✨`);
        resetCreateForm();
      }
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : "Không thể tạo tài khoản.");
    } finally {
      setCreateBusy(false);
    }
  }

  function copyCredential() {
    if (!createdCredential?.password) return;
    const text = `LoopyCafe - Thông tin tài khoản đăng nhập:\n- Họ tên: ${createdCredential.displayName}\n- Email: ${createdCredential.email}\n- Mật khẩu tạm thời: ${createdCredential.password}\n\n* Lưu ý: Hãy đổi mật khẩu ở lần đăng nhập đầu tiên nhé!`;
    void copyText(text);
  }

  async function copyText(text: string) {
    let copiedSuccessfully = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copiedSuccessfully = true;
      }
    } catch {
      copiedSuccessfully = false;
    }

    if (!copiedSuccessfully) copiedSuccessfully = fallbackCopy(text);
    if (!copiedSuccessfully) {
      setError("Không thể tự động sao chép. Hãy chọn mật khẩu và sao chép thủ công.");
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  function fallbackCopy(text: string): boolean {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
    return succeeded;
  }

  const roleChanged = Boolean(
    editing && form.roleSelect !== (editing.role_id ? `custom:${editing.role_id}` : editing.role),
  );
  const payrollChanged = Boolean(
    editing && (
      form.payrollEligible !== Boolean(editing.payroll_eligible) ||
      form.compensationType !== editing.compensation_type ||
      Number(form.hourlyRate) !== (editing.hourly_rate ?? 0) ||
      Number(form.monthlySalary) !== (editing.monthly_salary ?? 0)
    ),
  );
  const reasonRequiredForSave = roleChanged || payrollChanged;

  return (
    <div className="stack">
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
      {error && !editing && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}

      {resetCredential && (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => setResetCredential(null)}>
          <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-password-result-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="mini-icon mint"><KeyRound size={18} /></span>
              <h2 id="reset-password-result-title">Đã cấp lại mật khẩu tạm</h2>
            </div>
            <p><strong>{resetCredential.displayName}</strong> ({resetCredential.email}) phải dùng mật khẩu dưới đây để đăng nhập và đổi mật khẩu riêng.</p>
            <div className="p-3.5 rounded-2xl bg-[#f7f5f4] border border-[#e8e4e3] flex items-center justify-between gap-2">
              <code className="text-base font-mono font-bold tracking-wider text-[#332a2b] select-all">{resetCredential.password}</code>
              <button
                type="button"
                className="button-secondary button-compact"
                onClick={() => void copyText(resetCredential.password)}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Đã sao chép" : "Sao chép"}
              </button>
            </div>
            <div className="notice warning text-xs">Mật khẩu này chỉ hiển thị trong lần này. Mật khẩu cũ đã mất hiệu lực.</div>
            <div className="admin-dialog-actions"><button type="button" className="button" onClick={() => setResetCredential(null)}>Đã lưu & Đóng</button></div>
          </section>
        </div>
      )}

      <section className="card team-page-card">
        <div className="card-header flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 12 }}>
          <ViewHeader
            title="Nhà mình có những ai?"
            subtitle="Hồ sơ công việc, trạng thái chấm công và đơn giá lương. Chạm vào thành viên để chỉnh sửa."
          />
          {isOwner && (
            <button
              type="button"
              className="button shrink-0"
              style={{ minHeight: 44, padding: "0 18px" }}
              onClick={() => {
                setShowCreate(true);
                setCreateError("");
                setCreatedCredential(null);
              }}
            >
              <UserPlus size={16} />
              <span>Tạo tài khoản mới</span>
            </button>
          )}
        </div>

        {/* Search (44-48px) & Intentional Horizontal Filter Chips */}
        <div className="team-toolbar">
          <label className="team-search-box">
            <span className="sr-only">Tìm nhân sự</span>
            <Search size={17} className="team-search-icon" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên, email hoặc chức danh..."
              className="team-search-input"
            />
            {search && (
              <button
                type="button"
                className="team-search-clear"
                onClick={() => setSearch("")}
                aria-label="Xóa từ khóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </label>

          <div className="team-filter-scroll" role="tablist" aria-label="Lọc danh sách nhân sự">
            {(
              [
                { key: "all", label: "Tất cả", count: counts.all },
                { key: "active", label: "Đang làm", count: counts.active },
                { key: "attendance", label: "Có chấm công", count: counts.attendance },
                ...(counts.inactive > 0
                  ? [{ key: "inactive", label: "Tạm ngưng", count: counts.inactive }]
                  : []),
              ] as Array<{ key: QuickFilter; label: string; count: number }>
            ).map((tab) => {
              const active = quickFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setQuickFilter(tab.key)}
                  className={`team-filter-chip ${active ? "active is-active" : ""}`}
                >
                  <span className="team-filter-label">{tab.label}</span>
                  <span className="team-filter-count">({tab.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <ListSkeleton rows={5} />
        ) : error && members.length === 0 ? (
          <AsyncStatePanel
            state="error"
            title="Không thể tải danh sách nhân sự"
            description={error}
            actionLabel="Thử tải lại"
            onAction={() => void load()}
          />
        ) : filtered.length === 0 ? (
          <AsyncStatePanel
            compact
            state="empty"
            title={search || quickFilter !== "all" ? "Chưa thấy ai khớp với tìm kiếm nè!" : "Chỗ này vẫn còn trống nè!"}
            description={
              search || quickFilter !== "all"
                ? "Không có bạn nào khớp với bộ lọc hiện tại. Hãy thử xóa bộ lọc để xem lại nhé."
                : "Quán mình hiện chưa có hồ sơ nhân sự nào được thêm nè."
            }
            actionLabel={search || quickFilter !== "all" ? "Xóa bộ lọc" : undefined}
            onAction={
              search || quickFilter !== "all"
                ? () => {
                    setSearch("");
                    setQuickFilter("all");
                  }
                : undefined
            }
          />
        ) : (
          <div className="admin-account-list team-compact-list">
            {filtered.map((member) => (
              <button
                type="button"
                className="team-member-card"
                key={member.id}
                onClick={() => open(member)}
              >
                <i className="avatar shrink-0">{initials(member.display_name)}</i>
                <div className="team-member-main">
                  <div className="team-member-topline">
                    <div className="team-member-identity">
                      <strong className="team-member-name">
                        {member.display_name}
                      </strong>
                      <span
                        className={`team-role-pill ${
                          member.role === "owner" || member.role === "manager" ? "is-manager" : ""
                        }`}
                      >
                        {member.role_name ? member.role_name : roleLabel(member.role)}
                      </span>
                    </div>
                    <span
                      className={`badge team-status-badge ${
                        member.status === "active" ? "success" : "neutral"
                      }`}
                    >
                      {memberStatusLabel(member.status)}
                    </span>
                  </div>
                  <div className="team-member-meta">
                    <span className="truncate">
                      {member.job_title ?? "Chưa cập nhật chức danh"} · {compensationSummary(member)}
                    </span>
                    <span className="team-member-email truncate">{member.email}</span>
                  </div>
                </div>
                <ChevronRight size={16} className="team-member-chevron" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Edit Member Sheet */}
      {editing && (
        <div
          className="admin-dialog-backdrop team-editor-backdrop"
          role="presentation"
          onMouseDown={() => !busy && setEditing(null)}
        >
          <form
            className="admin-dialog team-editor-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-edit-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={save}
          >
            {/* Sticky Header: Preserves Employee Context */}
            <div className="team-editor-header">
              <div className="flex items-center gap-3 min-w-0">
                <i className="avatar shrink-0">{initials(editing.display_name)}</i>
                <div className="min-w-0">
                  <h2 id="team-edit-title" className="team-editor-title truncate">
                    {editing.display_name}
                  </h2>
                  <p className="team-editor-subtitle truncate">
                    {editing.role_name ? editing.role_name : roleLabel(editing.role)} · {compensationSummary(editing)} · {editing.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="icon-button shrink-0"
                aria-label="Đóng"
                onClick={() => setEditing(null)}
              >
                <X size={19} />
              </button>
            </div>

            {/* Independent Scrollable Form Body */}
            <div className="team-editor-body">
              {error && (
                <div className="notice danger" role="alert" style={{ marginBottom: 4 }}>
                  {error}
                </div>
              )}

              {/* Role & Permissions Assignment for Owner */}
              {isOwner && (
                <div className="team-editor-section">
                  <span className="team-editor-section-label">Phân quyền & Vai trò</span>
                  <label className="field">
                    <span>Vai trò trong hệ thống</span>
                    <select
                      value={form.roleSelect}
                      onChange={(event) => setForm({ ...form, roleSelect: event.target.value })}
                    >
                      <optgroup label="Vai trò mặc định">
                        <option value="employee">Nhân viên (Chỉ thao tác ca làm, chấm công, checklist của mình)</option>
                        <option value="team_lead">Trưởng ca (Vận hành ca, duyệt đổi ca, quản lý sự cố)</option>
                        <option value="manager">Quản lý (Quản lý đội ngũ, lịch làm việc, báo cáo)</option>
                      </optgroup>
                      {customRoles.length > 0 && (
                        <optgroup label="Vai trò tùy chỉnh của quán">
                          {customRoles.map((cr) => (
                            <option key={cr.id} value={`custom:${cr.id}`}>
                              {cr.name} (Vai trò tùy chỉnh)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  <p className="text-xs text-[#7b6f70] mt-1">
                    {form.roleSelect === "employee" && "Nhân viên barista, phục vụ, thu ngân; chỉ thao tác nghiệp vụ trong ca."}
                    {form.roleSelect === "team_lead" && "Trưởng ca có quyền duyệt đổi ca, tiếp nhận và xác nhận bàn giao ca, xử lý sự cố."}
                    {form.roleSelect === "manager" && "Quản lý có toàn quyền vận hành lịch làm, nhân sự, menu, ngoại lệ chấm công."}
                    {form.roleSelect.startsWith("custom:") && "Kế thừa quyền hạn theo vai trò tùy chỉnh đã thiết lập cho cửa hàng."}
                  </p>
                </div>
              )}

              {/* Promoted Checkboxes: Critical Operational & Payroll Flags */}
              <div className="team-editor-section">
                <span className="team-editor-section-label">Thiết lập chấm công & tính lương</span>
                <div className="team-checkbox-grid">
                  <label className={`rbac-item team-checkbox-card ${form.participatesAttendance ? "is-checked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={form.participatesAttendance}
                      onChange={(event) =>
                        setForm({ ...form, participatesAttendance: event.target.checked })
                      }
                    />
                    <span>
                      <strong>Tham gia chấm công</strong>
                      <small>Cho phép phân ca và ghi nhận phiên công.</small>
                    </span>
                  </label>
                  <label className={`rbac-item team-checkbox-card ${form.payrollEligible ? "is-checked" : ""}`}>
                    <input
                      type="checkbox"
                      checked={form.payrollEligible}
                      disabled={form.compensationType === "none"}
                      onChange={(event) =>
                        setForm({ ...form, payrollEligible: event.target.checked })
                      }
                    />
                    <span>
                      <strong>Được tính lương</strong>
                      <small>Tổng hợp vào kỳ lương theo đơn giá hiệu lực.</small>
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                  <label className="field">
                    <span>Hình thức lương</span>
                    <select
                      value={form.compensationType}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          compensationType: event.target.value,
                          payrollEligible:
                            event.target.value === "none" ? false : form.payrollEligible,
                        })
                      }
                    >
                      <option value="none">Chưa cấu hình</option>
                      <option value="hourly">Theo giờ</option>
                      <option value="monthly">Theo tháng</option>
                    </select>
                  </label>
                  {form.compensationType === "hourly" && (
                    <label className="field">
                      <span>Đơn giá/giờ (VND)</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        inputMode="numeric"
                        value={form.hourlyRate}
                        onChange={(event) => setForm({ ...form, hourlyRate: event.target.value })}
                      />
                    </label>
                  )}
                  {form.compensationType === "monthly" && (
                    <label className="field">
                      <span>Lương tháng (VND)</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        inputMode="numeric"
                        value={form.monthlySalary}
                        onChange={(event) =>
                          setForm({ ...form, monthlySalary: event.target.value })
                        }
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Job & Personal Info */}
              <div className="team-editor-section">
                <span className="team-editor-section-label">Thông tin hồ sơ công việc</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="field">
                    <span>Họ tên</span>
                    <input
                      required
                      value={form.displayName}
                      onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Chức danh</span>
                    <input
                      required
                      value={form.jobTitle}
                      onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2.5">
                  <label className="field">
                    <span>Số điện thoại</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Ngày vào làm</span>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                    />
                  </label>
                </div>
              </div>

              <label className="field">
                <span>
                  Lý do cập nhật {reasonRequiredForSave || confirmResetPassword ? "*" : "(không bắt buộc)"}
                </span>
                <textarea
                  required={reasonRequiredForSave || confirmResetPassword}
                  rows={2}
                  minLength={reasonRequiredForSave || confirmResetPassword ? 5 : undefined}
                  placeholder={reasonRequiredForSave || confirmResetPassword
                    ? "Ghi rõ lý do thay đổi nhạy cảm (tối thiểu 5 ký tự)..."
                    : "Có thể thêm ghi chú để dễ đối chiếu sau này..."}
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                  style={{ minHeight: 68 }}
                />
                <small>
                  Chỉ bắt buộc khi đổi vai trò, quyền/mức lương hoặc cấp lại mật khẩu. Sửa hồ sơ và đổi trạng thái nhân viên có thể cập nhật trực tiếp.
                </small>
              </label>
              {isOwner && editing.role !== "owner" && editing.role !== "system_admin" && (
                <div className="team-editor-section">
                  <span className="team-editor-section-label">Trạng thái nhân viên</span>
                  <label className="field">
                    <span>Quyền hoạt động</span>
                    <select
                      value={form.status}
                      disabled={busy}
                      onChange={(event) => {
                        setForm({ ...form, status: event.target.value });
                        setConfirmStatusChange(false);
                      }}
                    >
                      {editing.status === "invited" && <option value="invited" disabled>Chờ kích hoạt</option>}
                      {editing.status === "inactive" && <option value="inactive" disabled>Ngừng hoạt động (dữ liệu cũ)</option>}
                      <option value="active">Đang hoạt động</option>
                      <option value="suspended">Tạm khóa</option>
                      <option value="offboarded">Đã nghỉ việc</option>
                    </select>
                    <small>
                      Tài khoản tạm khóa hoặc đã nghỉ việc không thể đăng nhập và không xuất hiện trong danh sách xếp lịch mới. Các ca đã tạo vẫn được giữ làm lịch sử.
                    </small>
                  </label>
                  {form.status !== editing.status && !confirmStatusChange && (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setConfirmStatusChange(true);
                      }}
                    >
                      Cập nhật trạng thái
                    </button>
                  )}
                  {form.status !== editing.status && confirmStatusChange && (
                    <div className={`admin-confirm ${form.status === "active" ? "" : "danger"}`} role="alertdialog" aria-labelledby="team-status-confirm-title">
                      <strong id="team-status-confirm-title">
                        Chuyển sang “{memberStatusLabel(form.status)}”?
                      </strong>
                      <p>
                        {form.status === "active"
                          ? "Tài khoản sẽ được mở lại và có thể xuất hiện trong danh sách xếp lịch."
                          : "Tài khoản sẽ bị chặn truy cập và bị loại khỏi danh sách xếp lịch mới ngay sau khi cập nhật."}
                        {" "}Thao tác này chỉ cập nhật trạng thái; hãy lưu hồ sơ trước nếu bạn vừa sửa thông tin khác.
                      </p>
                      <div className="admin-dialog-actions">
                        <button type="button" className={form.status === "active" ? "button" : "button button-danger"} disabled={busy} onClick={() => void updateMemberStatus()}>
                          {busy ? "Đang cập nhật…" : "Xác nhận cập nhật"}
                        </button>
                        <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmStatusChange(false)}>Hủy</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {isOwner && editing.role !== "owner" && (
                <div className="team-editor-section">
                  <span className="team-editor-section-label">Khôi phục đăng nhập</span>
                  <p className="text-xs text-[#7b6f70]">Cấp một mật khẩu tạm mới cho tài khoản hiện có. Mật khẩu cũ mất hiệu lực và nhân viên phải đổi lại sau khi đăng nhập.</p>
                  {!confirmResetPassword ? (
                    <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmResetPassword(true)}>
                      <KeyRound size={16} /> Cấp lại mật khẩu tạm
                    </button>
                  ) : (
                    <div className="admin-confirm danger" role="alertdialog" aria-labelledby="team-reset-password-title">
                      <strong id="team-reset-password-title">Cấp lại mật khẩu cho {editing.display_name}?</strong>
                      <p>Mật khẩu hiện tại sẽ mất hiệu lực ngay. Thao tác được ghi nhật ký quản trị.</p>
                      <div className="admin-dialog-actions">
                        <button type="button" className="button button-danger" disabled={busy || form.reason.trim().length < 5} onClick={() => void resetMemberPassword()}>
                          {busy ? "Đang cấp lại…" : "Xác nhận cấp mật khẩu mới"}
                        </button>
                        <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmResetPassword(false)}>Hủy</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pinned Action Footer: Always Visible */}
            <div className="team-editor-footer">
              <button
                type="button"
                className="button-secondary"
                style={{ minHeight: 44 }}
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Huỷ
              </button>
              <button type="submit" className="button" style={{ minHeight: 44 }} disabled={busy}>
                <UserRound size={17} />
                {busy ? "Đang lưu…" : "Lưu hồ sơ"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Account Modal for Owner */}
      {showCreate && (
        <div
          className="admin-dialog-backdrop team-editor-backdrop"
          role="presentation"
          onMouseDown={() => !createBusy && (setShowCreate(false), resetCreateForm())}
        >
          <div
            className="admin-dialog team-editor-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="team-create-title"
            onMouseDown={(event) => event.stopPropagation()}
            style={{ maxWidth: 600 }}
          >
            {createdCredential ? (
              <div className="p-6 text-center">
                <div
                  className="w-14 h-14 mx-auto rounded-full bg-[#fdf2f4] text-[#c75865] flex items-center justify-center mb-4"
                  style={{ width: 56, height: 56, margin: "0 auto 16px" }}
                >
                  <ShieldCheck size={28} />
                </div>
                <h2 id="team-create-title" className="text-lg font-bold text-[#3d1822] mb-1">
                  Đã tạo tài khoản và phân quyền thành công! 🎉
                </h2>
                <p className="text-xs text-[#7b6f70] mb-5">
                  Tài khoản đã sẵn sàng. Bạn hãy sao chép thông tin đăng nhập bên dưới để gửi cho bạn nhân viên mới nhé.
                </p>

                <div
                  className="bg-[#fff9fa] border border-[#f3d9dc] rounded-xl p-4 text-left mb-5 space-y-2.5"
                  style={{ borderRadius: 14, padding: 16, marginBottom: 20 }}
                >
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#7b6f70] font-medium">Họ và tên:</span>
                    <strong className="text-[#3d1822]">{createdCredential.displayName}</strong>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-2">
                    <span className="text-[#7b6f70] font-medium">Email đăng nhập:</span>
                    <span className="font-mono font-bold text-[#3d1822]">{createdCredential.email}</span>
                  </div>
                  {createdCredential.password && (
                    <div className="flex justify-between items-center text-xs pt-2 mt-2 border-t border-[#f3d9dc]">
                      <span className="text-[#7b6f70] font-medium">Mật khẩu tạm thời:</span>
                      <span
                        className="font-mono text-sm font-bold text-[#b8334a] bg-[#fff] px-2 py-0.5 rounded border border-[#e8c5ca]"
                        style={{ padding: "2px 8px", borderRadius: 6 }}
                      >
                        {createdCredential.password}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xs mt-2">
                    <span className="text-[#7b6f70] font-medium">Vai trò:</span>
                    <span className="badge success">{roleLabel(createdCredential.role)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  {createdCredential.password && (
                    <button
                      type="button"
                      className="button flex-1 justify-center"
                      onClick={copyCredential}
                      style={{ minHeight: 44 }}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copied ? "Đã sao chép!" : "Sao chép thông tin đăng nhập"}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-secondary flex-1 justify-center"
                    onClick={() => {
                      setShowCreate(false);
                      setCreatedCredential(null);
                      resetCreateForm();
                    }}
                    style={{ minHeight: 44 }}
                  >
                    Hoàn tất & Đóng
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateAccount} className="team-editor-form">
                <div className="team-editor-header">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="rounded-xl bg-[#fdf2f4] text-[#c75865] flex items-center justify-center shrink-0"
                      style={{ width: 40, height: 40, borderRadius: 12 }}
                    >
                      <UserPlus size={20} />
                    </div>
                    <div className="min-w-0">
                      <h2 id="team-create-title" className="team-editor-title truncate">
                        Tạo tài khoản & Phân quyền nhân sự
                      </h2>
                      <p className="team-editor-subtitle truncate">
                        Tạo tài khoản đăng nhập, gán vai trò và thiết lập chế độ chấm công/lương.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button shrink-0"
                    aria-label="Đóng"
                    disabled={createBusy}
                    onClick={() => {
                      setShowCreate(false);
                      resetCreateForm();
                    }}
                  >
                    <X size={19} />
                  </button>
                </div>

                <div className="team-editor-body">
                  {createError && (
                    <div className="notice danger" role="alert" style={{ marginBottom: 4 }}>
                      {createError}
                    </div>
                  )}

                  {/* Section 1: Account & Credentials */}
                  <div className="team-editor-section">
                    <span className="team-editor-section-label">Thông tin tài khoản đăng nhập</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="field">
                        <span>Họ và tên *</span>
                        <input
                          required
                          placeholder="Ví dụ: Nguyễn Văn A"
                          value={createForm.displayName}
                          onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Email đăng nhập *</span>
                        <input
                          required
                          type="email"
                          placeholder="nhanvien@loopicafe.test"
                          value={createForm.email}
                          onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                        />
                      </label>
                    </div>

                    <label className="field mt-2.5">
                      <span>Phương thức kích hoạt tài khoản</span>
                      <select
                        value={createForm.activationMethod}
                        onChange={(e) => setCreateForm({ ...createForm, activationMethod: e.target.value as "temporary_password" | "invite" })}
                      >
                        <option value="temporary_password">Cấp mật khẩu tạm thời (Hiển thị ngay cho Chủ quán để gửi nhân viên)</option>
                        <option value="invite">Gửi thư mời qua email (Nhân viên nhận email kích hoạt và tự đặt mật khẩu)</option>
                      </select>
                    </label>
                  </div>

                  {/* Section 2: Role & Permissions */}
                  <div className="team-editor-section">
                    <span className="team-editor-section-label">Phân quyền & Vai trò</span>
                    <label className="field">
                      <span>Vai trò trong hệ thống *</span>
                      <select
                        value={createForm.roleSelect}
                        onChange={(e) => setCreateForm({ ...createForm, roleSelect: e.target.value })}
                      >
                        <optgroup label="Vai trò mặc định">
                          <option value="employee">Nhân viên (Thao tác ca làm, chấm công, checklist của mình)</option>
                          <option value="team_lead">Trưởng ca (Vận hành ca, duyệt đổi ca, quản lý sự cố)</option>
                          <option value="manager">Quản lý (Quản lý đội ngũ, lịch làm việc, báo cáo)</option>
                        </optgroup>
                        {customRoles.length > 0 && (
                          <optgroup label="Vai trò tùy chỉnh của quán">
                            {customRoles.map((cr) => (
                              <option key={cr.id} value={`custom:${cr.id}`}>
                                {cr.name} (Vai trò tùy chỉnh)
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </label>
                    <p className="text-xs text-[#7b6f70] mt-1">
                      {createForm.roleSelect === "employee" && "Nhân viên barista, phục vụ, thu ngân; chỉ thao tác nghiệp vụ trong ca."}
                      {createForm.roleSelect === "team_lead" && "Trưởng ca có quyền duyệt đổi ca, tiếp nhận và xác nhận bàn giao ca, xử lý sự cố."}
                      {createForm.roleSelect === "manager" && "Quản lý có toàn quyền vận hành lịch làm, nhân sự, menu, ngoại lệ chấm công."}
                      {createForm.roleSelect.startsWith("custom:") && "Kế thừa quyền hạn theo vai trò tùy chỉnh đã thiết lập cho cửa hàng."}
                    </p>
                  </div>

                  {/* Section 3: Job & Attendance & Salary */}
                  <div className="team-editor-section">
                    <span className="team-editor-section-label">Hồ sơ công việc & Chấm công</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="field">
                        <span>Chức danh công việc</span>
                        <input
                          placeholder="Ví dụ: Barista, Thu ngân..."
                          value={createForm.jobTitle}
                          onChange={(e) => setCreateForm({ ...createForm, jobTitle: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Số điện thoại</span>
                        <input
                          type="tel"
                          placeholder="0901234567"
                          value={createForm.phone}
                          onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                        />
                      </label>
                    </div>

                    <label className="field mt-2.5">
                      <span>Ngày bắt đầu làm việc</span>
                      <input
                        type="date"
                        value={createForm.startDate}
                        onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                      />
                    </label>

                    <div className="team-checkbox-grid mt-2.5">
                      <label className={`rbac-item team-checkbox-card ${createForm.participatesAttendance ? "is-checked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={createForm.participatesAttendance}
                          onChange={(e) => setCreateForm({ ...createForm, participatesAttendance: e.target.checked })}
                        />
                        <span>
                          <strong>Tham gia chấm công</strong>
                          <small>Cho phép phân ca và ghi nhận phiên công.</small>
                        </span>
                      </label>
                      <label className={`rbac-item team-checkbox-card ${createForm.payrollEligible ? "is-checked" : ""}`}>
                        <input
                          type="checkbox"
                          checked={createForm.payrollEligible}
                          disabled={createForm.compensationType === "none"}
                          onChange={(e) => setCreateForm({ ...createForm, payrollEligible: e.target.checked })}
                        />
                        <span>
                          <strong>Được tính lương</strong>
                          <small>Tổng hợp vào kỳ lương theo đơn giá hiệu lực.</small>
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                      <label className="field">
                        <span>Hình thức lương</span>
                        <select
                          value={createForm.compensationType}
                          onChange={(e) => setCreateForm({
                            ...createForm,
                            compensationType: e.target.value as "hourly" | "monthly" | "none",
                            payrollEligible: e.target.value === "none" ? false : createForm.payrollEligible,
                          })}
                        >
                          <option value="hourly">Theo giờ</option>
                          <option value="monthly">Theo tháng</option>
                          <option value="none">Chưa cấu hình</option>
                        </select>
                      </label>
                      {createForm.compensationType === "hourly" && (
                        <label className="field">
                          <span>Đơn giá/giờ (VND)</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={createForm.hourlyRate}
                            onChange={(e) => setCreateForm({ ...createForm, hourlyRate: e.target.value })}
                          />
                        </label>
                      )}
                      {createForm.compensationType === "monthly" && (
                        <label className="field">
                          <span>Lương tháng (VND)</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={createForm.monthlySalary}
                            onChange={(e) => setCreateForm({ ...createForm, monthlySalary: e.target.value })}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Section 4: Note / Reason */}
                  <label className="field">
                    <span>Ghi chú / Lý do tạo tài khoản</span>
                    <input
                      placeholder="Ví dụ: Tuyển nhân viên mới cho quán"
                      value={createForm.reason}
                      onChange={(e) => setCreateForm({ ...createForm, reason: e.target.value })}
                    />
                  </label>
                </div>

                <div className="team-editor-footer">
                  <button
                    type="button"
                    className="button-secondary"
                    style={{ minHeight: 44 }}
                    disabled={createBusy}
                    onClick={() => {
                      setShowCreate(false);
                      resetCreateForm();
                    }}
                  >
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    className="button"
                    style={{ minHeight: 44 }}
                    disabled={createBusy}
                  >
                    <UserPlus size={16} />
                    <span>{createBusy ? "Đang tạo tài khoản…" : "Tạo tài khoản & Phân quyền"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
