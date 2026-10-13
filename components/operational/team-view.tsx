"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  UserPlus,
  Phone,
  Mail,
  Shield,
  Check,
  X,
  CalendarDays,
  Copy,
  AlertCircle,
} from "lucide-react";
import { AsyncStatePanel, ListSkeleton, ViewHeader, initials, readJson, roleLabel } from "./shared";

type TeamMember = {
  id: string;
  email: string;
  display_name: string;
  job_title?: string;
  phone?: string | null;
  start_date?: string | null;
  role: string;
  status: string;
  created_at?: string;
  hourly_rate?: number;
};

export function PersistentTeamView() {
  const [employees, setEmployees] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Quick Add Form
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newJobTitle, setNewJobTitle] = useState("Barista");
  const [newRole, setNewRole] = useState("employee");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addError, setAddError] = useState("");
  const [createdCredential, setCreatedCredential] = useState<{ email: string; password?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTeam = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setTeamError("");
    try {
      const res = await fetch("/api/admin/accounts", { cache: "no-store", signal });
      if (res.ok) {
        const payload = await readJson<{ accounts?: TeamMember[] }>(res);
        if (signal?.aborted) return;
        setEmployees(payload.accounts ?? []);
        return;
      }
      const teamRes = await fetch("/api/team", { cache: "no-store", signal });
      const teamPayload = await readJson<{ employees?: TeamMember[]; error?: string }>(teamRes);
      if (!teamRes.ok) throw new Error(teamPayload.error ?? "Không thể tải danh sách nhân sự.");
      if (!signal?.aborted) setEmployees(teamPayload.employees ?? []);
    } catch (cause) {
      if (signal?.aborted) return;
      setTeamError(cause instanceof Error ? cause.message : "Không thể tải danh sách nhân sự.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadTeam(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadTeam]);

  async function refreshTeam() {
    await loadTeam();
  }

  const filteredEmployees = useMemo(() => {
    return employees.filter((member) => {
      const matchesSearch =
        search.trim() === "" ||
        member.display_name.toLowerCase().includes(search.toLowerCase()) ||
        member.email.toLowerCase().includes(search.toLowerCase()) ||
        (member.phone && member.phone.includes(search)) ||
        (member.job_title && member.job_title.toLowerCase().includes(search.toLowerCase()));

      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "manager" && (member.role === "manager" || member.role === "owner" || member.role === "system_admin")) ||
        (roleFilter === "lead" && member.role === "team_lead") ||
        (roleFilter === "staff" && (member.role === "employee" || !member.role));

      return matchesSearch && matchesRole;
    });
  }, [employees, search, roleFilter]);

  const activeCount = employees.filter((e) => e.status === "active").length;
  const managerCount = employees.filter((e) => ["owner", "manager", "team_lead"].includes(e.role)).length;

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setAddError("");
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: newDisplayName.trim(),
          email: newEmail.trim().toLowerCase(),
          phone: newPhone.trim(),
          jobTitle: newJobTitle.trim(),
          role: newRole,
          activationMethod: "temporary_password",
        }),
      });
      const data = await readJson<{ account?: TeamMember; temporaryPassword?: string; error?: string }>(res);
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Không thể thêm nhân viên mới.");
      }

      setCreatedCredential({
        email: newEmail.trim().toLowerCase(),
        password: data.temporaryPassword,
      });

      // Reload team list
      void refreshTeam();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetAddForm() {
    setShowAddModal(false);
    setCreatedCredential(null);
    setNewDisplayName("");
    setNewEmail("");
    setNewPhone("");
    setNewJobTitle("Barista");
    setNewRole("employee");
    setAddError("");
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Top Header Card */}
      <section className="card" style={{ padding: "20px 24px" }}>
        <div className="section-row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <ViewHeader
              title="Đội ngũ nhân sự LoopiCafe"
              subtitle={loading ? "Đang xác nhận dữ liệu nhân sự…" : teamError ? "Chưa thể xác nhận số liệu nhân sự" : `${activeCount} nhân sự đang hoạt động trên tổng số ${employees.length} tài khoản`}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span className="badge success" style={{ fontSize: "0.78rem" }}>{loading || teamError ? "—" : activeCount} Đang hoạt động</span>
              <span className="badge warning" style={{ fontSize: "0.78rem" }}>{loading || teamError ? "—" : managerCount} Quản trị / Trưởng ca</span>
              <span className="badge neutral" style={{ fontSize: "0.78rem" }}>{loading || teamError ? "—" : employees.length - activeCount} Đã mời / Vô hiệu</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="button"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
              onClick={() => setShowAddModal(true)}
            >
              <UserPlus size={16} /> + Thêm nhân viên
            </button>
            <Link
              href="/app/admin/accounts"
              className="button-secondary"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Shield size={15} /> Phân quyền chi tiết
            </Link>
          </div>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="card" style={{ padding: "14px 20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          {/* Search box */}
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Tìm theo tên, email, chức danh..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                paddingLeft: 36,
                paddingRight: 12,
                height: 38,
                borderRadius: 8,
                border: "1px solid var(--border-subtle, #e2e8f0)",
                fontSize: "0.88rem",
              }}
            />
          </div>

          {/* Role Filter Chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "Tất cả" },
              { key: "manager", label: "Quản lý / Chủ quán" },
              { key: "lead", label: "Trưởng ca" },
              { key: "staff", label: "Nhân viên" },
            ].map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`filter-chip ${roleFilter === chip.key ? "active" : ""}`}
                onClick={() => setRoleFilter(chip.key)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: "0.82rem",
                  fontWeight: roleFilter === chip.key ? 700 : 500,
                  border: roleFilter === chip.key ? "1px solid var(--primary, #6f2939)" : "1px solid var(--border-subtle, #e2e8f0)",
                  background: roleFilter === chip.key ? "var(--primary, #6f2939)" : "transparent",
                  color: roleFilter === chip.key ? "#fff" : "inherit",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Employee Directory Grid / List */}
      <section className="card" style={{ padding: "0" }}>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : teamError ? (
          <AsyncStatePanel state="error" title="Không thể tải danh sách nhân sự" description={teamError} actionLabel="Thử lại" onAction={() => void loadTeam()} />
        ) : filteredEmployees.length === 0 ? (
          search.trim() || roleFilter !== "all" ? (
            <AsyncStatePanel state="empty" title="Không có nhân viên khớp bộ lọc" description="Thử từ khóa khác hoặc xóa bộ lọc hiện tại." actionLabel="Xóa bộ lọc" onAction={() => { setSearch(""); setRoleFilter("all"); }} />
          ) : (
            <AsyncStatePanel state="empty" title="Chưa có nhân sự" description="Thêm nhân viên đầu tiên để bắt đầu phân ca và quản lý vận hành." actionLabel="Thêm nhân viên" onAction={() => setShowAddModal(true)} />
          )
        ) : (
          <div className="list">
            {filteredEmployees.map((employee) => {
              const isLeadOrManager = ["owner", "manager", "team_lead"].includes(employee.role);
              return (
                <div
                  key={employee.id}
                  className="list-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--border-subtle, rgba(0,0,0,0.05))",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedMember(employee)}
                >
                  <div className="person" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span
                      className="avatar"
                      style={{
                        background: isLeadOrManager ? "linear-gradient(135deg, #6f2939, #9b3d52)" : "var(--surface-subtle, #f1f5f9)",
                        color: isLeadOrManager ? "#fff" : "var(--foreground)",
                        fontWeight: 700,
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.95rem",
                      }}
                    >
                      {initials(employee.display_name)}
                    </span>
                    <span className="person-copy">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: "0.95rem" }}>{employee.display_name}</strong>
                        {employee.job_title && (
                          <span className="badge neutral" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>
                            {employee.job_title}
                          </span>
                        )}
                      </div>
                      <small style={{ color: "var(--muted)", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
                        <span>{employee.email}</span>
                        {employee.phone && <span>· {employee.phone}</span>}
                        <span>· {roleLabel(employee.role)}</span>
                      </small>
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      className={`badge ${employee.status === "active" ? "success" : employee.status === "invited" ? "warning" : "neutral"}`}
                      style={{ fontSize: "0.78rem" }}
                    >
                      {employee.status === "active" ? "Đang làm" : employee.status === "invited" ? "Đã mời" : "Đã vô hiệu"}
                    </span>
                    <button
                      type="button"
                      className="button-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMember(employee);
                      }}
                    >
                      Chi tiết
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Member Detail Drawer / Modal */}
      {selectedMember && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 999,
          }}
          onClick={() => setSelectedMember(null)}
        >
          <div
            style={{
              background: "var(--surface, #ffffff)",
              width: "100%",
              maxWidth: 440,
              height: "100%",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
              padding: "24px 28px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #6f2939, #a84e61)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "1.2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {initials(selectedMember.display_name)}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>{selectedMember.display_name}</h3>
                  <p style={{ margin: "2px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                    {selectedMember.job_title ?? "Nhân viên quán"} • {roleLabel(selectedMember.role)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}
              >
                <X size={20} />
              </button>
            </div>

            <hr style={{ borderColor: "var(--border-subtle, rgba(0,0,0,0.08))" }} />

            {/* Contact Details */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                Thông tin liên lạc
              </h4>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem" }}>
                <Mail size={16} style={{ color: "var(--muted)" }} />
                <span>{selectedMember.email}</span>
              </div>
              {selectedMember.phone ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem" }}>
                  <Phone size={16} style={{ color: "var(--muted)" }} />
                  <a href={`tel:${selectedMember.phone}`} style={{ color: "var(--primary)", textDecoration: "none" }}>
                    {selectedMember.phone}
                  </a>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", color: "var(--muted)" }}>
                  <Phone size={16} />
                  <span>Chưa cập nhật SĐT</span>
                </div>
              )}
            </div>

            {/* Status & Permissions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                Trạng thái & Phân quyền
              </h4>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface-subtle, #f8fafc)", borderRadius: 8 }}>
                <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>Trạng thái tài khoản:</span>
                <span className={`badge ${selectedMember.status === "active" ? "success" : "warning"}`}>
                  {selectedMember.status === "active" ? "Đang hoạt động" : selectedMember.status === "invited" ? "Chờ kích hoạt" : "Đã vô hiệu"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface-subtle, #f8fafc)", borderRadius: 8 }}>
                <span style={{ fontSize: "0.88rem", color: "var(--muted)" }}>Vai trò hệ thống:</span>
                <strong style={{ fontSize: "0.88rem" }}>{roleLabel(selectedMember.role)}</strong>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              <Link
                href="/app/schedule"
                className="button-secondary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 }}
              >
                <CalendarDays size={16} /> Xem ca làm việc của nhân viên
              </Link>
              <Link
                href="/app/admin/accounts"
                className="button"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 }}
              >
                <Shield size={16} /> Quản trị tài khoản & mức lương
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Employee Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => !isSubmitting && resetAddForm()}
        >
          <div
            style={{
              background: "var(--surface, #ffffff)",
              width: "100%",
              maxWidth: 480,
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 12px 36px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {createdCredential ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
                  <Check size={24} />
                </div>
                <h3 style={{ margin: 0, fontSize: "1.2rem" }}>Tạo nhân viên thành công!</h3>
                <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted)" }}>
                  Thông tin đăng nhập tạm thời đã được tạo. Hãy gửi cho nhân viên để đăng nhập lần đầu:
                </p>

                <div style={{ background: "var(--surface-subtle, #f8fafc)", border: "1px dashed var(--border-subtle, #cbd5e1)", padding: 14, borderRadius: 10, textAlign: "left" }}>
                  <div style={{ fontSize: "0.85rem", marginBottom: 6 }}>
                    <strong>Email:</strong> {createdCredential.email}
                  </div>
                  {createdCredential.password && (
                    <div style={{ fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span><strong>Mật khẩu tạm:</strong> <code style={{ color: "var(--primary)" }}>{createdCredential.password}</code></span>
                      <button
                        type="button"
                        className="button-secondary"
                        style={{ padding: "3px 8px", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}
                        onClick={() => {
                          navigator.clipboard.writeText(`Email: ${createdCredential.email}\nMật khẩu: ${createdCredential.password}`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2500);
                        }}
                      >
                        <Copy size={12} /> {copied ? "Đã chép" : "Sao chép"}
                      </button>
                    </div>
                  )}
                </div>

                <button type="button" className="button" style={{ marginTop: 8 }} onClick={resetAddForm}>
                  Đóng & Hoàn tất
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddEmployee} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>+ Thêm nhân viên mới</h3>
                  <button type="button" onClick={resetAddForm} style={{ background: "none", border: "none", cursor: "pointer" }}>
                    <X size={18} />
                  </button>
                </div>

                {addError && (
                  <div style={{ padding: "10px 14px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={16} /> {addError}
                  </div>
                )}

                <div className="field">
                  <label htmlFor="emp-name">Họ và tên *</label>
                  <input
                    id="emp-name"
                    required
                    placeholder="Ví dụ: Nguyễn Văn An"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="emp-email">Email đăng nhập *</label>
                  <input
                    id="emp-email"
                    type="email"
                    required
                    placeholder="nhanvien@loopicafe.vn"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field">
                    <label htmlFor="emp-phone">Số điện thoại</label>
                    <input
                      id="emp-phone"
                      placeholder="0912345678"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="emp-role">Vai trò</label>
                    <select
                      id="emp-role"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      style={{ height: 42, borderRadius: 8 }}
                    >
                      <option value="employee">Nhân viên</option>
                      <option value="team_lead">Trưởng ca</option>
                      <option value="manager">Quản lý</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="emp-job">Chức danh công việc</label>
                  <input
                    id="emp-job"
                    placeholder="Ví dụ: Barista, Phục vụ, Thu ngân"
                    value={newJobTitle}
                    onChange={(e) => setNewJobTitle(e.target.value)}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                  <button type="button" className="button-secondary" onClick={resetAddForm} disabled={isSubmitting}>
                    Hủy
                  </button>
                  <button type="submit" className="button" disabled={isSubmitting}>
                    {isSubmitting ? "Đang tạo…" : "Tạo nhân viên"}
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

