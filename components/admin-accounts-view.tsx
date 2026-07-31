"use client";

import { Check, Copy, KeyRound, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

type Account = {
  id: string;
  email: string;
  display_name: string;
  role: "owner" | "manager" | "team_lead" | "employee";
  status: "active" | "inactive" | "invited";
  auth_user_id: string | null;
};

type IssuedCredential = { email: string; password: string } | null;

export function AdminAccountsView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Account["role"]>("employee");
  const [message, setMessage] = useState("Đang tải danh sách tài khoản…");
  const [issuedCredential, setIssuedCredential] = useState<IssuedCredential>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    const response = await fetch("/api/admin/accounts", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(payload.error ?? "Không tải được danh sách tài khoản.");
    setAccounts(payload.accounts ?? []);
    setMessage("");
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setIssuedCredential(null);
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, email, role }),
    });
    const payload = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) return setMessage(payload.error ?? "Không thể tạo tài khoản.");
    setIssuedCredential({ email, password: payload.temporaryPassword });
    setDisplayName("");
    setEmail("");
    setRole("employee");
    setMessage("Tài khoản đã sẵn sàng. Hãy gửi riêng thông tin đăng nhập tạm cho người dùng.");
    await refresh();
  }

  async function updateAccount(account: Account, changes: Partial<Pick<Account, "role" | "status">> & { resetPassword?: boolean }) {
    setMessage("");
    setIssuedCredential(null);
    const response = await fetch("/api/admin/accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: account.id, ...changes }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(payload.error ?? "Không thể cập nhật tài khoản.");
    if (payload.temporaryPassword) {
      setIssuedCredential({ email: account.email, password: payload.temporaryPassword });
      setMessage("Đã cấp mật khẩu tạm mới. Mật khẩu này chỉ hiển thị trong lần này.");
    } else {
      setMessage("Đã cập nhật quyền truy cập.");
    }
    await refresh();
  }

  async function copyCredential() {
    if (!issuedCredential) return;
    await navigator.clipboard.writeText(
      `LoopiCafe\nEmail: ${issuedCredential.email}\nMật khẩu tạm: ${issuedCredential.password}\nVui lòng đổi mật khẩu ngay ở lần đăng nhập đầu tiên.`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="admin-accounts-layout">
      <section className="card admin-account-create">
        <div className="card-header">
          <div><h2 className="card-title">Cấp tài khoản mới</h2><p className="card-subtitle">Email + mật khẩu tạm, bắt buộc đổi ở lần đăng nhập đầu tiên</p></div>
          <span className="metric-icon pink"><UserPlus size={19} /></span>
        </div>
        <form className="form-grid" onSubmit={createAccount}>
          <div className="field full"><label htmlFor="account-name">Họ và tên</label><input id="account-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Nguyễn Minh An" required /></div>
          <div className="field full"><label htmlFor="account-email">Email dùng để đăng nhập</label><input id="account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="minhan@loopicafe.vn" required /></div>
          <div className="field full"><label htmlFor="account-role">Phân quyền</label><select id="account-role" value={role} onChange={(event) => setRole(event.target.value as Account["role"])}><option value="manager">Quản lý</option><option value="team_lead">Trưởng nhóm</option><option value="employee">Nhân viên</option></select></div>
          <button className="button button-large field full" type="submit" disabled={submitting}><ShieldCheck size={17} /> {submitting ? "Đang tạo…" : "Tạo tài khoản"}</button>
        </form>
        {issuedCredential && (
          <div className="credential-card" role="status">
            <div><span>Thông tin chỉ hiển thị lần này</span><strong>{issuedCredential.email}</strong><code>{issuedCredential.password}</code></div>
            <button type="button" className="button-secondary button-compact" onClick={copyCredential}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Đã sao chép" : "Sao chép"}</button>
          </div>
        )}
        {message && <p className="operation-message">{message}</p>}
      </section>

      <section className="card admin-account-list">
        <div className="card-header">
          <div><h2 className="card-title">Tài khoản & phân quyền</h2><p className="card-subtitle">{accounts.filter((account) => account.status === "active").length} tài khoản đang hoạt động</p></div>
          <span className="metric-icon mint"><UsersRound size={19} /></span>
        </div>
        <div className="account-role-guide">
          <span><strong>Quản lý</strong> Lịch, đội ngũ, duyệt và báo cáo</span>
          <span><strong>Trưởng nhóm</strong> Điều phối ca, checklist và duyệt yêu cầu</span>
          <span><strong>Nhân viên</strong> Ca cá nhân, chấm công và công việc</span>
        </div>
        <div className="admin-account-rows">
          {accounts.map((account) => (
            <article className="admin-account-row" key={account.id}>
              <div className="person">
                <span className="avatar">{initials(account.display_name)}</span>
                <span className="person-copy"><strong>{account.display_name}</strong><small>{account.email}</small></span>
              </div>
              <div className="admin-account-controls">
                {account.role === "owner" ? (
                  <span className="badge info">Admin · Chủ quán</span>
                ) : (
                  <select aria-label={`Vai trò của ${account.display_name}`} value={account.role} onChange={(event) => updateAccount(account, { role: event.target.value as Account["role"] })}>
                    <option value="manager">Quản lý</option><option value="team_lead">Trưởng nhóm</option><option value="employee">Nhân viên</option>
                  </select>
                )}
                <span className={`badge ${account.status === "active" ? "success" : "neutral"}`}>{account.status === "active" ? "Đang hoạt động" : "Đã khóa"}</span>
                {account.role !== "owner" && account.auth_user_id && <button className="text-link" type="button" onClick={() => updateAccount(account, { resetPassword: true })}><KeyRound size={14} /> Cấp lại mật khẩu</button>}
                {account.role !== "owner" && account.auth_user_id && <button className={`text-link ${account.status === "active" ? "danger-text" : ""}`} type="button" onClick={() => updateAccount(account, { status: account.status === "active" ? "inactive" : "active" })}>{account.status === "active" ? "Khóa" : "Mở khóa"}</button>}
                {!account.auth_user_id && account.role !== "owner" && <span className="badge warning">Tài khoản cũ</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function initials(value: string) {
  return value.split(" ").filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
}
