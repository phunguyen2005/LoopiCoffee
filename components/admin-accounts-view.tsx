"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, KeyRound, Lock, Mail, MailPlus, RefreshCw, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
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
  const [hasPinConfigured, setHasPinConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [roleSelectValue, setRoleSelectValue] = useState<string>("employee");
  const [status, setStatus] = useState<AccountStatus>("active");
  const [newEmail, setNewEmail] = useState("");
  const [deletePin, setDeletePin] = useState("");
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinForm, setPinForm] = useState({ currentPin: "", newPin: "" });
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
      const payload = await readJson<{ accounts?: Account[]; customRoles?: CustomRole[]; hasPinConfigured?: boolean; error?: string }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Không thể tải tài khoản.");
      setAccounts(payload.accounts ?? []);
      setCustomRoles(payload.customRoles ?? []);
      setHasPinConfigured(Boolean(payload.hasPinConfigured));
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
  const [pending, setPending] = useState<null | "change_role" | "update_status" | "reset_password" | "change_email" | "delete_account">(null);

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!selected && !showCreate && !showPinDialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setSelected(null);
        setPending(null);
        setShowCreate(false);
        setShowPinDialog(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, showCreate, showPinDialog, busy]);

  const filtered = useMemo(() => accounts.filter((account) => {
    const needle = search.trim().toLowerCase();
    if (statusFilter !== "all" && account.status !== statusFilter) return false;
    if (roleFilter !== "all" && account.role !== roleFilter) return false;
    return !needle || account.display_name.toLowerCase().includes(needle) || account.email.toLowerCase().includes(needle);
  }), [accounts, search, statusFilter, roleFilter]);

  async function saveSecurityPin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set_pin",
          currentPin: pinForm.currentPin.trim() || undefined,
          newPin: pinForm.newPin.trim(),
        }),
      });
      const payload = await readJson<{ error?: string; ok?: boolean }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Không thể thiết lập mã PIN.");
      setHasPinConfigured(true);
      setPinForm({ currentPin: "", newPin: "" });
      setShowPinDialog(false);
      setMessage("Đã lưu mã PIN bảo mật (4–6 ký tự) và ghi nhật ký quản trị.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể thiết lập mã PIN.");
    } finally {
      setBusy(false);
    }
  }

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

  async function mutate(
    action: "change_role" | "update_status" | "reset_password" | "resend_invite" | "change_email" | "delete_account",
    forceNewKey = false,
    explicitTarget?: Account,
  ) {
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
        newEmail: action === "change_email" ? newEmail.trim().toLowerCase() : undefined,
        pin: action === "delete_account" ? deletePin.trim() : undefined,
        reason,
        expectedRevision: targetAccount.access_revision,
      };
      if (forceNewKey) mutateKeyRef.current = null;
      const idempotencyKey = getStableKey(mutateKeyRef, bodyPayload);

      const response = await fetch("/api/admin/accounts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        ...bodyPayload, idempotencyKey,
      }) });
      const payload = await readJson<{ error?: string; temporaryPassword?: string; replayed?: boolean; passwordRetrievable?: boolean; newEmail?: string; deleted?: boolean }>(response);
      if (!response.ok) throw new Error(payload.error ?? "Không thể cập nhật tài khoản.");
      mutateKeyRef.current = null;
      if (payload.temporaryPassword) {
        setCredential({ email: targetAccount.email, displayName: targetAccount.display_name, password: payload.temporaryPassword });
        setCopied(false);
      } else if (payload.replayed && action === "reset_password" && payload.passwordRetrievable === false) {
        setLostPasswordTarget({ id: targetAccount.id, email: targetAccount.email, displayName: targetAccount.display_name });
      }
      if (action === "delete_account") {
        setMessage(`Đã xóa vĩnh viễn tài khoản ${targetAccount.email} cùng toàn bộ dữ liệu liên quan và ghi nhật ký quản trị.`);
      } else if (action === "change_email") {
        setMessage(`Đã đổi email đăng nhập thành ${payload.newEmail ?? newEmail.trim().toLowerCase()} và ghi nhật ký quản trị.`);
      } else {
        setMessage(payload.replayed ? "Thao tác đã hoàn tất trước đó." : "Đã cập nhật tài khoản và ghi nhật ký quản trị.");
      }
      setReason(""); setDeletePin(""); setSelected(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể cập nhật tài khoản."); }
    finally { setBusy(false); }
  }

  const selectedCurrentVal = selected ? (selected.role_id ? `custom:${selected.role_id}` : selected.role) : "";
  const blockingStatus = status === "suspended" || status === "offboarded";
  const confirmDanger = pending === "delete_account" || pending === "reset_password" || (pending === "update_status" && blockingStatus);
  const confirmConsequence = pending === "change_role"
    ? "Quyền truy cập thay đổi ngay; phiên đăng nhập hiện tại phải tải lại quyền."
    : pending === "update_status"
      ? blockingStatus ? "Tài khoản bị chặn đăng nhập ngay tại dịch vụ xác thực." : "Tài khoản được phép đăng nhập trở lại."
      : pending === "change_email"
        ? `Địa chỉ email đăng nhập sẽ đổi sang ${newEmail.trim().toLowerCase()} và đồng bộ sang toàn bộ hồ sơ, chấm công, bảng lương.`
        : pending === "delete_account"
          ? "Tài khoản đăng nhập cùng toàn bộ dữ liệu liên quan (ca làm, chấm công, bảng lương, yêu cầu, bàn giao, sự cố, thông báo) sẽ bị xóa vĩnh viễn và không thể khôi phục."
          : "Mật khẩu cũ bị thay thế; mật khẩu tạm chỉ hiển thị một lần.";
  const confirmTitle = pending === "change_role"
    ? "Đổi vai trò"
    : pending === "update_status"
      ? "Cập nhật trạng thái"
      : pending === "change_email"
        ? "Đổi email đăng nhập"
        : pending === "delete_account"
          ? "Xóa vĩnh viễn tài khoản & dữ liệu"
          : "Cấp mật khẩu tạm";
  const deletePinReady = deletePin.trim().length >= 4 && deletePin.trim().length <= 6;

  return <div className="stack adm-page">
    <header className="adm-header">
      <div><h2 className="card-title">Tài khoản</h2><p className="card-subtitle">Toàn quyền tạo, đổi email, phân vai trò (kể cả nhiều Chủ quán) và xóa tài khoản kèm dữ liệu.</p></div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="button-secondary"
          onClick={() => { setError(""); setPinForm({ currentPin: "", newPin: "" }); setShowPinDialog(true); }}
        >
          <Lock size={16} /> {hasPinConfigured ? "Đổi mã PIN bảo mật" : "Thiết lập mã PIN"}
        </button>
        <button type="button" className="button" onClick={() => { setError(""); setShowCreate(true); }}><UserPlus size={17} /> Tạo tài khoản</button>
      </div>
    </header>
    {message && <div className="notice success" role="status">{message}</div>}
    {error && !showCreate && !selected && !showPinDialog && <div className="notice danger" role="alert">{error}</div>}
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

    {showPinDialog && (
      <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => !busy && setShowPinDialog(false)}>
        <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="pin-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-2">
            <span className="mini-icon amber"><Lock size={18} /></span>
            <h2 id="pin-dialog-title">{hasPinConfigured ? "Đổi mã PIN bảo mật" : "Thiết lập mã PIN bảo mật"}</h2>
          </div>
          <p className="text-sm text-[#7b6f70]">
            Mã PIN (từ 4 đến 6 ký tự) dùng để xác thực mỗi khi Quản trị hệ thống thực hiện xóa vĩnh viễn tài khoản và dữ liệu.
          </p>
          {error && <div className="notice danger" role="alert">{error}</div>}
          <form className="stack" onSubmit={saveSecurityPin}>
            {hasPinConfigured && (
              <label className="field">
                <span>Mã PIN hiện tại</span>
                <input
                  type="password"
                  required
                  minLength={4}
                  maxLength={6}
                  autoComplete="off"
                  placeholder="Nhập mã PIN hiện tại (4–6 ký tự)"
                  value={pinForm.currentPin}
                  onChange={(event) => setPinForm({ ...pinForm, currentPin: event.target.value })}
                />
              </label>
            )}
            <label className="field">
              <span>Mã PIN mới (4–6 ký tự)</span>
              <input
                type="password"
                required
                minLength={4}
                maxLength={6}
                autoComplete="new-password"
                placeholder="Nhập 4 đến 6 ký tự"
                value={pinForm.newPin}
                onChange={(event) => setPinForm({ ...pinForm, newPin: event.target.value })}
              />
            </label>
            <div className="admin-dialog-actions">
              <button className="button" disabled={busy || pinForm.newPin.trim().length < 4 || pinForm.newPin.trim().length > 6}>
                <Lock size={16} /> {busy ? "Đang lưu…" : "Lưu mã PIN"}
              </button>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => setShowPinDialog(false)}>Hủy</button>
            </div>
          </form>
        </section>
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
              <option value="owner">Chủ quán</option>
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
        </label>
        <label className="field"><span>Kích hoạt</span><select value={create.activationMethod} onChange={(event) => setCreate({ ...create, activationMethod: event.target.value as typeof create.activationMethod })}><option value="invite">Gửi lời mời</option><option value="temporary_password">Mật khẩu tạm</option></select></label>
        <label className="field admin-span-2"><span>Ghi chú / Lý do (tùy chọn)</span><textarea value={create.reason} onChange={(event) => setCreate({ ...create, reason: event.target.value })} placeholder="Ghi chú nội bộ cho nhật ký quản trị (nếu cần)" /></label>
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
                  setNewEmail(account.email);
                  setDeletePin("");
                  setReason("");
                  setPending(null);
                  setError("");
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
              <span>Email đăng nhập</span>
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="email@loopi.vn"
              />
            </label>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !newEmail.trim() || newEmail.trim().toLowerCase() === selected.email.toLowerCase()}
              onClick={() => setPending("change_email")}
            >
              <Mail size={16} /> Đổi email đăng nhập
            </button>

            <label className="field">
              <span>Vai trò</span>
              <select value={roleSelectValue} onChange={(event) => setRoleSelectValue(event.target.value)}>
                <optgroup label="Vai trò hệ thống">
                  <option value="employee">Nhân viên</option>
                  <option value="team_lead">Trưởng ca</option>
                  <option value="manager">Quản lý</option>
                  <option value="owner">Chủ quán</option>
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
            </label>
            <button className="button-secondary" disabled={busy || roleSelectValue === selectedCurrentVal} onClick={() => setPending("change_role")}><ShieldCheck size={16} /> Đổi vai trò</button>
            <label className="field">
              <span>Trạng thái</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as AccountStatus)}>
                <option value="active">Đang hoạt động</option>
                <option value="suspended">Tạm khóa</option>
                <option value="offboarded">Đã nghỉ việc</option>
                {selected.status === "invited" && <option value="invited">Chờ kích hoạt</option>}
              </select>
            </label>
            <button className="button-secondary" disabled={busy || status === selected.status} onClick={() => setPending("update_status")}>Cập nhật trạng thái</button>
            <label className="field">
              <span>Ghi chú / Lý do (tùy chọn)</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ghi chú nội bộ cho nhật ký quản trị (nếu cần)" />
            </label>
            {pending && <div className={`admin-confirm${confirmDanger ? " danger" : ""}`} role="alertdialog" aria-labelledby="admin-confirm-title">
                <strong id="admin-confirm-title">{confirmTitle} cho {selected.display_name}?</strong>
                <p>{selected.email}. {confirmConsequence} Thao tác được ghi vào nhật ký quản trị.</p>
                {pending === "delete_account" && (
                  !hasPinConfigured ? (
                    <div className="notice warning text-xs" style={{ marginTop: 8 }}>
                      Bạn chưa thiết lập mã PIN bảo mật (4–6 ký tự). Vui lòng thiết lập mã PIN trước khi xóa tài khoản.
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="button button-compact"
                          onClick={() => { setShowPinDialog(true); }}
                        >
                          <Lock size={14} /> Thiết lập mã PIN ngay
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="field" style={{ marginTop: 8 }}>
                      <span>Nhập mã PIN bảo mật (4–6 ký tự) để xác nhận xóa</span>
                      <input
                        type="password"
                        required
                        minLength={4}
                        maxLength={6}
                        autoComplete="off"
                        placeholder="Mã PIN (4–6 ký tự)"
                        value={deletePin}
                        onChange={(event) => setDeletePin(event.target.value)}
                      />
                    </label>
                  )
                )}
                <div className="admin-dialog-actions">
                  <button
                    className={confirmDanger ? "button button-danger" : "button"}
                    disabled={busy || (pending === "delete_account" && (!hasPinConfigured || !deletePinReady))}
                    onClick={() => void mutate(pending)}
                  >
                    {busy ? "Đang xử lý…" : pending === "delete_account" ? "Xác nhận xóa vĩnh viễn" : "Xác nhận"}
                  </button>
                  <button className="button-secondary" disabled={busy} onClick={() => setPending(null)}>Hủy</button>
                </div>
              </div>}
            <div className="admin-dialog-actions">
              <button className="button-secondary" disabled={busy} onClick={() => setPending("reset_password")}><KeyRound size={16} /> Mật khẩu tạm</button>
              {selected.status === "invited" && <button className="button-secondary" disabled={busy} onClick={() => void mutate("resend_invite")}><MailPlus size={16} /> Gửi lại lời mời</button>}
              <button
                type="button"
                className="button button-danger"
                disabled={busy}
                onClick={() => { setDeletePin(""); setPending("delete_account"); }}
              >
                <Trash2 size={16} /> Xóa tài khoản & dữ liệu
              </button>
            </div>
            <button className="button ghost" disabled={busy} onClick={() => { setSelected(null); setPending(null); }}>Đóng</button>
          </section>
        </div>
    )}
  </div>;
}

function statusLabel(status: AccountStatus) {
  return status === "active" ? "Đang hoạt động" : status === "invited" ? "Chờ kích hoạt" : status === "suspended" ? "Tạm khóa" : "Đã nghỉ việc";
}
