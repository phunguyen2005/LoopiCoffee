"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, KeyRound, MailPlus, RefreshCw, Search, ShieldCheck, UserPlus } from "lucide-react";
import { AsyncStatePanel, ListSkeleton, readJson, roleLabel } from "./operational/shared";

type AccountRole = "owner" | "manager" | "team_lead" | "employee";
type AccountStatus = "active" | "invited" | "suspended" | "offboarded";
type CustomRole = { id: string; name: string; status: string; revision: number };
type Account = {
  id: string; email: string; display_name: string; last_login_at: string | null; role: AccountRole;
  role_id?: string | null; role_name?: string | null; status: AccountStatus;
  must_change_password: number; password_reset_pending: number; access_revision: number; created_at: string; updated_at: string;
};

export function AdminAccountsView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [roleSelectValue, setRoleSelectValue] = useState<string>("employee");
  const [status, setStatus] = useState<AccountStatus>("active");
  const [credential, setCredential] = useState<{ email: string; displayName: string; password: string } | null>(null);
  const [lostPasswordTarget, setLostPasswordTarget] = useState<{ id?: string; email: string; displayName: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [createRoleValue, setCreateRoleValue] = useState<string>("employee");
  const [create, setCreate] = useState({ displayName: "", email: "", activationMethod: "invite" as "invite" | "temporary_password", reason: "" });
  const createKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const mutateKeyRef = useRef<{ signature: string; key: string } | null>(null);

  function getStableKey(ref: React.MutableRefObject<{ signature: string; key: string } | null>, payload: unknown) {
    const signature = JSON.stringify(payload);
    if (ref.current && ref.current.signature === signature) {
      return ref.current.key;
    }
    const key = crypto.randomUUID();
    ref.current = { signature, key };
    return key;
  }

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/accounts", { cache: "no-store" });
      const payload = await readJson<{ accounts?: Account[]; customRoles?: CustomRole[]; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Không thể tải tài khoản.");
      setAccounts(payload.accounts ?? []);
      setCustomRoles(payload.customRoles ?? []);
      return payload.accounts ?? [];
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải tài khoản.");
      return [];
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>("all");
  const [roleFilter, setRoleFilter] = useState<"all" | AccountRole>("all");
  const [pending, setPending] = useState<null | "change_role" | "update_status" | "reset_password">(null);

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!selected && !showCreate) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setSelected(null); setPending(null); setShowCreate(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, showCreate, busy]);

  const filtered = useMemo(() => accounts.filter((account) => {
    const needle = search.trim().toLowerCase();
    if (statusFilter !== "all" && account.status !== statusFilter) return false;
    if (roleFilter !== "all" && account.role !== roleFilter) return false;
    return !needle || account.display_name.toLowerCase().includes(needle) || account.email.toLowerCase().includes(needle);
  }), [accounts, search, statusFilter, roleFilter]);
  const ownerCount = accounts.filter((account) => account.role === "owner").length;
  const hasOwner = ownerCount > 0;

  async function createAccount(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setLostPasswordTarget(null);
    try {
      const isCustom = createRoleValue.startsWith("custom:");
      const targetRole: AccountRole = isCustom ? "employee" : (createRoleValue as AccountRole);
      const targetRoleId = isCustom ? createRoleValue.slice(7) : null;
      const bodyPayload = {
        ...create,
        email: create.email.trim().toLowerCase(),
        displayName: create.displayName.trim(),
        role: targetRole,
        roleId: targetRoleId,
        mustChangePassword: true,
      };
      const idempotencyKey = getStableKey(createKeyRef, bodyPayload);

      const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        ...bodyPayload, idempotencyKey,
      }) });
      const payload = await readJson<{ error?: string; temporaryPassword?: string; replayed?: boolean; passwordRetrievable?: boolean }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Không thể tạo tài khoản.");
      createKeyRef.current = null;
      const refreshedAccounts = await load();
      if (payload.temporaryPassword) {
        setCredential({ email: create.email, displayName: create.displayName, password: payload.temporaryPassword });
        setCopied(false);
      } else if (payload.replayed && create.activationMethod === "temporary_password" && payload.passwordRetrievable === false) {
        const matched = refreshedAccounts.find((item) => item.email.toLowerCase() === create.email.trim().toLowerCase());
        setLostPasswordTarget({ id: matched?.id, email: create.email.trim().toLowerCase(), displayName: create.displayName.trim() });
      }
      setCreate({ displayName: "", email: "", activationMethod: "invite", reason: "" });
      setCreateRoleValue("employee");
      setShowCreate(false);
      setMessage(payload.replayed ? "Thao tác đã hoàn tất trước đó (không tạo trùng tài khoản)." : "Đã tạo tài khoản. Hồ sơ công việc và lương cần được hoàn thiện tại mục Nhân sự.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo tài khoản."); }
    finally { setBusy(false); }
  }

  async function mutate(action: "change_role" | "update_status" | "reset_password" | "resend_invite", forceNewKey = false, explicitTarget?: Account) {
    const targetAccount = explicitTarget ?? selected;
    if (!targetAccount) return;
    setPending(null);
    setBusy(true); setError(""); setMessage(""); setLostPasswordTarget(null);
    try {
      const isCustom = roleSelectValue.startsWith("custom:");
      const targetRole: AccountRole = isCustom ? "employee" : (roleSelectValue as AccountRole);
      const targetRoleId = isCustom ? roleSelectValue.slice(7) : null;
      const bodyPayload = {
        id: targetAccount.id,
        action,
        role: targetRole,
        roleId: targetRoleId,
        status,
        reason,
        expectedRevision: targetAccount.access_revision,
      };
      if (forceNewKey) mutateKeyRef.current = null;
      const idempotencyKey = getStableKey(mutateKeyRef, bodyPayload);

      const response = await fetch("/api/admin/accounts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        ...bodyPayload, idempotencyKey,
      }) });
      const payload = await readJson<{ error?: string; temporaryPassword?: string; replayed?: boolean; passwordRetrievable?: boolean }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Không thể cập nhật tài khoản.");
      mutateKeyRef.current = null;
      if (payload.temporaryPassword) {
        setCredential({ email: targetAccount.email, displayName: targetAccount.display_name, password: payload.temporaryPassword });
        setCopied(false);
      } else if (payload.replayed && action === "reset_password" && payload.passwordRetrievable === false) {
        setLostPasswordTarget({ id: targetAccount.id, email: targetAccount.email, displayName: targetAccount.display_name });
      }
      setMessage(payload.replayed ? "Thao tác đã hoàn tất trước đó." : "Đã cập nhật tài khoản và ghi nhật ký quản trị.");
      setReason(""); setSelected(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể cập nhật tài khoản."); }
    finally { setBusy(false); }
  }

  const selectedCurrentVal = selected ? (selected.role_id ? `custom:${selected.role_id}` : selected.role) : "";
  const isOwnerSelected = !!selected && (selected.role === "owner" || roleSelectValue === "owner");
  const soleOwnerSelected = selected?.role === "owner" && ownerCount === 1;
  const blockingStatus = status === "suspended" || status === "offboarded";
  const confirmDanger = pending === "reset_password" || (pending === "update_status" && blockingStatus);
  const confirmConsequence = pending === "change_role"
    ? "Quyền truy cập thay đổi ngay; phiên đăng nhập hiện tại phải tải lại quyền."
    : pending === "update_status"
      ? blockingStatus ? "Tài khoản bị chặn đăng nhập ngay tại dịch vụ xác thực." : "Tài khoản được phép đăng nhập trở lại."
      : "Mật khẩu cũ bị thay thế; mật khẩu tạm chỉ hiển thị một lần.";
  const confirmTitle = pending === "change_role" ? "Đổi vai trò" : pending === "update_status" ? "Cập nhật trạng thái" : "Cấp mật khẩu tạm";
  const needsReason = isOwnerSelected && reason.trim().length < 5;

  return <div className="stack adm-page">
    <header className="adm-header">
      <div><h2 className="card-title">Tài khoản</h2><p className="card-subtitle">Tạo, khóa và phân vai trò đăng nhập. Công và lương quản lý riêng tại mục Nhân sự.</p></div>
      <button type="button" className="button" onClick={() => { setError(""); setShowCreate(true); }}><UserPlus size={17} /> Tạo tài khoản</button>
    </header>
    {message && <div className="notice success" role="status">{message}</div>}
    {error && !showCreate && !selected && <div className="notice danger" role="alert">{error}</div>}
    {lostPasswordTarget && (
      <div className="notice warning" role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>
          Thao tác cho <strong>{lostPasswordTarget.displayName}</strong> ({lostPasswordTarget.email}) đã hoàn tất trước đó, nhưng phản hồi chứa mật khẩu tạm một lần đã bị mất và không thể lấy lại mật khẩu cũ.
        </span>
        {lostPasswordTarget.id && (
          <button
            type="button"
            className="button button-compact"
            disabled={busy}
            onClick={() => {
              const target = accounts.find((a) => a.id === lostPasswordTarget.id);
              if (target) void mutate("reset_password", true, target);
            }}
          >
            <KeyRound size={15} /> Cấp mật khẩu tạm mới
          </button>
        )}
      </div>
    )}

    {credential && (
      <div
        className="admin-dialog-backdrop"
        role="presentation"
        onMouseDown={() => { setCredential(null); setCopied(false); }}
      >
        <section
          className="admin-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="credential-dialog-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <span className="mini-icon mint"><KeyRound size={18} /></span>
            <h2 id="credential-dialog-title">Cấp mật khẩu tạm thành công</h2>
          </div>
          <p>
            Mật khẩu tạm đã được khởi tạo cho tài khoản <strong>{credential.displayName}</strong> ({credential.email}).
          </p>
          <div className="p-3.5 rounded-2xl bg-[#f7f5f4] border border-[#e8e4e3] flex flex-col gap-2.5">
            <span className="text-xs text-[#7b6f70] font-medium">Mật khẩu tạm khởi tạo:</span>
            <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-xl border border-[#ded8d6]">
              <code className="text-base font-mono font-bold tracking-wider text-[#332a2b] select-all">
                {credential.password}
              </code>
              <button
                type="button"
                className={`button-secondary px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${copied ? "!bg-[#e8f5e9] !text-[#2e7d32] !border-[#a5d6a7]" : ""}`}
                onClick={() => {
                  void navigator.clipboard.writeText(credential.password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check size={14} /> : null}
                {copied ? "Đã sao chép!" : "Sao chép"}
              </button>
            </div>
          </div>
          <div className="notice warning text-xs leading-relaxed">
            Mật khẩu này <strong>chỉ hiển thị một lần duy nhất</strong> trong bộ nhớ phiên làm việc này và không thể xem lại sau khi đóng. Hãy lưu hoặc gửi cho nhân viên và yêu cầu đổi mật khẩu khi đăng nhập lần đầu.
          </div>
          <div className="admin-dialog-actions justify-end mt-2">
            <button
              type="button"
              className="button"
              onClick={() => { setCredential(null); setCopied(false); }}
            >
              Đã lưu & Đóng
            </button>
          </div>
        </section>
      </div>
    )}

    {showCreate && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => !busy && setShowCreate(false)}>
    <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="create-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
      <h2 id="create-dialog-title">Tạo tài khoản đăng nhập</h2>
      {error && <div className="notice danger" role="alert">{error}</div>}
      <form className="admin-form-grid" onSubmit={createAccount}>
        <label className="field"><span>Họ tên</span><input required minLength={2} value={create.displayName} onChange={(event) => setCreate({ ...create, displayName: event.target.value })} /></label>
        <label className="field"><span>Email đăng nhập</span><input required type="email" value={create.email} onChange={(event) => setCreate({ ...create, email: event.target.value })} /></label>
        <label className="field">
          <span>Vai trò</span>
          <select value={createRoleValue} onChange={(event) => setCreateRoleValue(event.target.value)}>
            <optgroup label="Vai trò hệ thống">
              <option value="employee">Nhân viên</option>
              <option value="team_lead">Trưởng ca</option>
              <option value="manager">Quản lý</option>
              <option value="owner" disabled={hasOwner}>Chủ quán{hasOwner ? " (đã có)" : ""}</option>
            </optgroup>
            {customRoles.length > 0 && (
              <optgroup label="Vai trò tùy chỉnh">
                {customRoles.map((cr) => (
                  <option key={cr.id} value={`custom:${cr.id}`}>
                    {cr.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {hasOwner && <small className="muted">Mỗi cửa hàng chỉ có một Chủ quán. Hãy khôi phục tài khoản hiện tại thay vì tạo thêm.</small>}
        </label>
        <label className="field"><span>Kích hoạt</span><select value={create.activationMethod} onChange={(event) => setCreate({ ...create, activationMethod: event.target.value as typeof create.activationMethod })}><option value="invite">Gửi lời mời</option><option value="temporary_password">Mật khẩu tạm</option></select></label>
        {createRoleValue === "owner" && <label className="field admin-span-2"><span>Lý do tạo Chủ quán</span><textarea required minLength={5} value={create.reason} onChange={(event) => setCreate({ ...create, reason: event.target.value })} /></label>}
        <div className="admin-dialog-actions admin-span-2">
          <button className="button" disabled={busy}><UserPlus size={17} />{busy ? "Đang tạo…" : "Tạo tài khoản"}</button>
          <button type="button" className="button-secondary" disabled={busy} onClick={() => setShowCreate(false)}>Hủy</button>
        </div>
      </form>
    </section></div>}

    <section className="adm-section">
      <div className="admin-account-filters">
        <label className="field admin-search"><span>Tìm tài khoản</span><span className="input-with-icon"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc email" /></span></label>
        <label className="field"><span>Trạng thái</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Tất cả</option><option value="active">Đang hoạt động</option><option value="invited">Chờ kích hoạt</option><option value="suspended">Tạm khóa</option><option value="offboarded">Đã nghỉ việc</option></select></label>
        <label className="field"><span>Vai trò hệ thống</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}><option value="all">Tất cả</option><option value="owner">Chủ quán</option><option value="manager">Quản lý</option><option value="team_lead">Trưởng ca</option><option value="employee">Nhân viên</option></select></label>
        <button className="button-secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /> Tải lại</button>
      </div>
      {!loading && accounts.length > 0 && <p className="muted" role="status">Hiển thị {filtered.length}/{accounts.length} tài khoản.</p>}
      {loading ? <ListSkeleton rows={5} /> : error && accounts.length === 0 ? <AsyncStatePanel state="error" title="Không thể tải tài khoản" description={error} actionLabel="Thử lại" onAction={() => void load()} /> : filtered.length === 0 ? <AsyncStatePanel state="empty" title="Không có tài khoản phù hợp" description="Thử từ khóa hoặc bộ lọc khác." /> : <ul className="adm-list">
        {filtered.map((account) => {
          const currentVal = account.role_id ? `custom:${account.role_id}` : account.role;
          return (
            <li key={account.id}>
              <button
                type="button"
                className="adm-row"
                onClick={() => {
                  setSelected(account);
                  setRoleSelectValue(currentVal);
                  setStatus(account.status);
                  setReason("");
                }}
              >
                <span className="adm-avatar" aria-hidden>{(account.display_name.trim()[0] ?? "?").toUpperCase()}</span>
                <span className="adm-row-main">
                  <strong>{account.display_name}</strong>
                  <small>{account.email}</small>
                  <small>{account.role_name || roleLabel(account.role)}</small>
                </span>
                <span className="admin-status-badge" data-status={account.status}>{statusLabel(account.status)}</span>
              </button>
            </li>
          );
        })}
      </ul>}
    </section>

    {selected && (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => !busy && setSelected(null)}>
          <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="account-dialog-title">{selected.display_name}</h2><p>{selected.email}</p>
            {error && <div className="notice danger" role="alert">{error}</div>}
            <label className="field">
              <span>Vai trò</span>
              <select value={roleSelectValue} disabled={soleOwnerSelected} onChange={(event) => setRoleSelectValue(event.target.value)}>
                <optgroup label="Vai trò hệ thống">
                  <option value="employee">Nhân viên</option>
                  <option value="team_lead">Trưởng ca</option>
                  <option value="manager">Quản lý</option>
                  <option value="owner" disabled={hasOwner && selected.role !== "owner"}>Chủ quán{hasOwner && selected.role !== "owner" ? " (đã có)" : ""}</option>
                </optgroup>
                {customRoles.length > 0 && (
                  <optgroup label="Vai trò tùy chỉnh">
                    {customRoles.map((cr) => (
                      <option key={cr.id} value={`custom:${cr.id}`}>
                        {cr.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {soleOwnerSelected && <small className="muted">Đây là Chủ quán duy nhất. Có thể đặt lại mật khẩu hoặc gửi lại lời mời, nhưng không thể hạ vai trò.</small>}
            </label>
            <button className="button-secondary" disabled={busy || soleOwnerSelected || roleSelectValue === selectedCurrentVal} onClick={() => setPending("change_role")}><ShieldCheck size={16} /> Đổi vai trò</button>
            <label className="field"><span>Trạng thái</span><select value={status} onChange={(event) => setStatus(event.target.value as AccountStatus)}><option value="active">Đang hoạt động</option><option value="suspended" disabled={soleOwnerSelected}>Tạm khóa</option><option value="offboarded" disabled={soleOwnerSelected}>Đã nghỉ việc</option>{selected.status === "invited" && <option value="invited">Chờ kích hoạt</option>}</select>{soleOwnerSelected && <small className="muted">Không thể khóa Chủ quán duy nhất. Dùng khôi phục mật khẩu hoặc lời mời để sửa lỗi truy cập.</small>}</label>
            <button className="button-secondary" disabled={busy || status === selected.status} onClick={() => setPending("update_status")}>Cập nhật trạng thái</button>
            {isOwnerSelected && <label className="field"><span>Lý do thao tác với Chủ quán (tối thiểu 5 ký tự)</span><textarea required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
            {pending && <div className={`admin-confirm${confirmDanger ? " danger" : ""}`} role="alertdialog" aria-labelledby="admin-confirm-title">
                <strong id="admin-confirm-title">{confirmTitle} cho {selected.display_name}?</strong>
                <p>{selected.email}. {confirmConsequence} Thao tác được ghi vào nhật ký quản trị.</p>
                {needsReason && <p role="alert">Cần nhập lý do trước khi xác nhận.</p>}
                <div className="admin-dialog-actions">
                  <button className={confirmDanger ? "button button-danger" : "button"} disabled={busy || needsReason} onClick={() => void mutate(pending)}>{busy ? "Đang xử lý…" : "Xác nhận"}</button>
                  <button className="button-secondary" disabled={busy} onClick={() => setPending(null)}>Hủy</button>
                </div>
              </div>}
            <div className="admin-dialog-actions"><button className="button-secondary" disabled={busy} onClick={() => setPending("reset_password")}><KeyRound size={16} /> Mật khẩu tạm</button>{selected.status === "invited" && <button className="button-secondary" disabled={busy} onClick={() => void mutate("resend_invite")}><MailPlus size={16} /> Gửi lại lời mời</button>}</div>
            <button className="button ghost" disabled={busy} onClick={() => { setSelected(null); setPending(null); }}>Đóng</button>
          </section>
        </div>
    )}
  </div>;
}

function statusLabel(status: AccountStatus) {
  return status === "active" ? "Đang hoạt động" : status === "invited" ? "Chờ kích hoạt" : status === "suspended" ? "Tạm khóa" : "Đã nghỉ việc";
}
