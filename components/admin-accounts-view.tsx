"use client";
import { readJson } from "@/platform/http/client";

import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Check,
  Clock,
  Copy,
  Edit3,
  Eye,
  KeyRound,
  Lock,
  Mail,
  MoreVertical,
  Search,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserMinus,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type AccountRole = "system_admin" | "owner" | "manager" | "team_lead" | "employee";
type AccountStatus = "active" | "invited" | "suspended" | "offboarded";

type Account = {
  id: string;
  email: string;
  display_name: string;
  job_title: string;
  phone: string | null;
  start_date: string | null;
  last_login_at: string | null;
  role: AccountRole;
  status: AccountStatus;
  auth_user_id: string | null;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  participates_attendance: number | boolean;
  payroll_eligible: number | boolean;
  compensation_type: "hourly" | "monthly" | "shift" | "none";
  hourly_rate: number;
  monthly_salary: number;
};

type AuditLog = {
  id: string;
  actor_email: string;
  action: string;
  metadata: string;
  created_at: string;
};

type AccountResponse = {
  accounts?: Account[]; storeName?: string; currentUserEmail?: string;
  currentUserId?: string; currentUserRole?: AccountRole; auditLogs?: AuditLog[];
  temporaryPassword?: string; error?: string; message?: string;
};
export function AdminAccountsView() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [storeName, setStoreName] = useState("LoopiCafe Nguyễn Trãi");
  const [currentUserRole, setCurrentUserRole] = useState<AccountRole>("owner");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  // Filters & Search
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jobTitleFilter, setJobTitleFilter] = useState<string>("all");

  // Drawers & Modals State
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [selectedDetailAccount, setSelectedDetailAccount] = useState<Account | null>(null);
  const [detailAuditLogs, setDetailAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [roleChangeAccount, setRoleChangeAccount] = useState<Account | null>(null);
  const [targetRole, setTargetRole] = useState<AccountRole>("employee");

  const [statusChangeAccount, setStatusChangeAccount] = useState<Account | null>(null);
  const [targetStatus, setTargetStatus] = useState<AccountStatus>("suspended");

  const [issuedCredential, setIssuedCredential] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    displayName: "",
    email: "",
    phone: "",
    jobTitle: "Barista",
    role: "employee" as AccountRole,
    startDate: new Date().toISOString().split("T")[0],
    participatesAttendance: true,
    payrollEligible: true,
    compensationType: "hourly" as "hourly" | "monthly" | "shift" | "none",
    hourlyRate: "25000",
    monthlySalary: "0",
    activationMethod: "temporary_password" as "invite" | "temporary_password",
    mustChangePassword: true,
  });
  const [creating, setCreating] = useState(false);

  // Edit Form State
  const [editForm, setEditForm] = useState({
    displayName: "",
    jobTitle: "",
    phone: "",
    startDate: "",
    participatesAttendance: true,
    payrollEligible: true,
    compensationType: "hourly" as "hourly" | "monthly" | "shift" | "none",
    hourlyRate: "25000",
    monthlySalary: "0",
  });

  useEffect(() => {
    void refreshAccounts();
  }, []);

  async function refreshAccounts() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/accounts", { cache: "no-store" });
      const data = await readJson<AccountResponse>(res);
      if (res.ok) {
        setAccounts(data.accounts ?? []);
        if (data.storeName) setStoreName(data.storeName);
        if (data.currentUserRole) setCurrentUserRole(data.currentUserRole);
      } else {
        setMessage(data.error ?? "Không thể tải danh sách tài khoản.");
      }
    } catch {
      setMessage("Lỗi kết nối khi tải danh sách tài khoản.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAuditLogs(accountId: string) {
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/admin/accounts?auditFor=${accountId}`, { cache: "no-store" });
      const data = await readJson<AccountResponse>(res);
      if (res.ok) {
        setDetailAuditLogs(data.auditLogs ?? []);
      }
    } catch {
      setDetailAuditLogs([]);
    } finally {
      setLoadingAudit(false);
    }
  }

  // Filtered Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchSearch =
        !search.trim() ||
        acc.display_name.toLowerCase().includes(search.toLowerCase()) ||
        acc.email.toLowerCase().includes(search.toLowerCase()) ||
        (acc.phone && acc.phone.includes(search));

      const matchRole = roleFilter === "all" || acc.role === roleFilter;
      const matchStatus = statusFilter === "all" || acc.status === statusFilter;
      const matchJob = jobTitleFilter === "all" || acc.job_title === jobTitleFilter;

      return matchSearch && matchRole && matchStatus && matchJob;
    });
  }, [accounts, search, roleFilter, statusFilter, jobTitleFilter]);

  // Unique Job Titles for Filter
  const jobTitleOptions = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((acc) => {
      if (acc.job_title) set.add(acc.job_title);
    });
    return Array.from(set);
  }, [accounts]);

  // Metrics
  const stats = useMemo(() => {
    return {
      total: accounts.length,
      active: accounts.filter((a) => a.status === "active").length,
      invited: accounts.filter((a) => a.status === "invited").length,
      suspended: accounts.filter((a) => a.status === "suspended" || a.status === "offboarded").length,
    };
  }, [accounts]);

  // Handlers
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await readJson<AccountResponse>(res);
      if (res.ok) {
        setShowCreateDrawer(false);
        if (data.temporaryPassword) {
          setIssuedCredential({ email: createForm.email, password: data.temporaryPassword });
        }
        setCreateForm({
          displayName: "",
          email: "",
          phone: "",
          jobTitle: "Barista",
          role: "employee",
          startDate: new Date().toISOString().split("T")[0],
          participatesAttendance: true,
          payrollEligible: true,
          compensationType: "hourly",
          hourlyRate: "25000",
          monthlySalary: "0",
          activationMethod: "temporary_password",
          mustChangePassword: true,
        });
        await refreshAccounts();
      } else {
        alert(data.error ?? "Không thể tạo tài khoản.");
      }
    } catch {
      alert("Lỗi khi kết nối tới máy chủ.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateInfo(e: React.FormEvent) {
    e.preventDefault();
    if (!editAccount) return;
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editAccount.id,
          action: "update_info",
          ...editForm,
        }),
      });
      const data = await readJson<AccountResponse>(res);
      if (res.ok) {
        setEditAccount(null);
        await refreshAccounts();
      } else {
        alert(data.error ?? "Không thể cập nhật.");
      }
    } catch {
      alert("Lỗi kết nối.");
    }
  }

  async function handleChangeRole() {
    if (!roleChangeAccount) return;
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: roleChangeAccount.id,
          action: "change_role",
          role: targetRole,
        }),
      });
      const data = await readJson<AccountResponse>(res);
      if (res.ok) {
        setRoleChangeAccount(null);
        await refreshAccounts();
      } else {
        alert(data.error ?? "Không thể đổi vai trò.");
      }
    } catch {
      alert("Lỗi kết nối.");
    }
  }

  async function handleChangeStatus() {
    if (!statusChangeAccount) return;
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: statusChangeAccount.id,
          action: "update_status",
          status: targetStatus,
        }),
      });
      const data = await readJson<AccountResponse>(res);
      if (res.ok) {
        setStatusChangeAccount(null);
        await refreshAccounts();
      } else {
        alert(data.error ?? "Không thể cập nhật trạng thái.");
      }
    } catch {
      alert("Lỗi kết nối.");
    }
  }

  async function handleResetPassword(acc: Account) {
    if (!confirm(`Tạo mật khẩu tạm thời mới cho ${acc.display_name}?`)) return;
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: acc.id,
          action: "reset_password",
        }),
      });
      const data = await readJson<AccountResponse>(res);
      if (res.ok && data.temporaryPassword) {
        setIssuedCredential({ email: acc.email, password: data.temporaryPassword });
        await refreshAccounts();
      } else {
        alert(data.error ?? "Không thể tạo lại mật khẩu.");
      }
    } catch {
      alert("Lỗi kết nối.");
    }
  }

  async function handleResendInvite(acc: Account) {
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: acc.id,
          action: "resend_invite",
        }),
      });
      const data = await readJson<AccountResponse>(res);
      if (res.ok) {
        alert(`Đã gửi lại lời mời kích hoạt tới ${acc.email}`);
        await refreshAccounts();
      } else {
        alert(data.error ?? "Không thể gửi lời mời.");
      }
    } catch {
      alert("Lỗi kết nối.");
    }
  }

  async function copyCredential() {
    if (!issuedCredential) return;
    await navigator.clipboard.writeText(
      `LoopiCafe (${storeName})\nEmail: ${issuedCredential.email}\nMật khẩu tạm: ${issuedCredential.password}\nVui lòng đổi mật khẩu ở lần đăng nhập đầu tiên.`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {message && <p role="status" className="attention-card">{message}</p>}
      {/* 1. Header Metrics (4 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <UsersRound size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.total}</div>
            <div className="text-xs font-medium text-slate-500">Tổng tài khoản</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <UserCheck size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-700">{stats.active}</div>
            <div className="text-xs font-medium text-slate-500">Đang hoạt động</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Mail size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700">{stats.invited}</div>
            <div className="text-xs font-medium text-slate-500">Chờ kích hoạt</div>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
            <Lock size={20} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-700">{stats.suspended}</div>
            <div className="text-xs font-medium text-slate-500">Khóa / Đã nghỉ</div>
          </div>
        </div>
      </div>

      {/* Temporary Credential Notice Banner */}
      {issuedCredential && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-gradient-to-r from-emerald-900 to-emerald-800 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <BadgeCheck size={24} className="text-emerald-300 shrink-0" />
            <div>
              <div className="font-bold text-sm">Cấp mật khẩu tạm thời thành công!</div>
              <div className="text-xs text-emerald-200 mt-0.5">
                Email: <span className="font-mono text-white font-bold">{issuedCredential.email}</span> | Mật khẩu:{" "}
                <span className="font-mono bg-emerald-950 px-2 py-0.5 rounded text-amber-300 font-bold">{issuedCredential.password}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={copyCredential}
              className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Đã sao chép" : "Sao chép mật khẩu"}
            </button>
            <button
              onClick={() => setIssuedCredential(null)}
              className="p-1.5 rounded-xl hover:bg-emerald-700/50 text-emerald-300"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* 2. Filter & Actions Toolbar */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-2">
            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Tìm theo tên, email, SĐT…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-rose-500 transition"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-rose-500 transition"
            >
              <option value="all">Tất cả vai trò</option>
              <option value="owner">Chủ quán (Admin)</option>
              <option value="manager">Quản lý</option>
              <option value="employee">Nhân viên</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-rose-500 transition"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="invited">Chờ kích hoạt</option>
              <option value="suspended">Tạm khóa</option>
              <option value="offboarded">Đã nghỉ việc</option>
            </select>

            {/* Job Title Filter */}
            {jobTitleOptions.length > 0 && (
              <select
                value={jobTitleFilter}
                onChange={(e) => setJobTitleFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-rose-500 transition"
              >
                <option value="all">Tất cả chức danh</option>
                {jobTitleOptions.map((job) => (
                  <option key={job} value={job}>
                    {job}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Add Account Button */}
          <button
            onClick={() => setShowCreateDrawer(true)}
            className="px-4 py-2 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-bold text-xs rounded-xl shadow border border-rose-500/30 flex items-center justify-center gap-2 transition active:scale-95"
          >
            <UserPlus size={16} /> Thêm tài khoản
          </button>
        </div>

        {/* 3. Admin Accounts Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 font-bold border-b border-slate-100">
                <th className="py-3 px-4">Nhân viên</th>
                <th className="py-3 px-4">Chức danh</th>
                <th className="py-3 px-4">Cửa hàng</th>
                <th className="py-3 px-4">Vai trò hệ thống</th>
                <th className="py-3 px-4">Trạng thái</th>
                <th className="py-3 px-4">Đăng nhập gần nhất</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Đang tải danh sách tài khoản…
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Không tìm thấy tài khoản nhân viên khớp với bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50/60 transition group">
                    {/* Employee Info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-800 font-bold flex items-center justify-center text-xs shrink-0 border border-rose-200">
                          {getInitials(account.display_name)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{account.display_name}</div>
                          <div className="text-slate-400 text-[11px] font-mono">{account.email}</div>
                          {account.phone && <div className="text-slate-400 text-[11px]">{account.phone}</div>}
                        </div>
                      </div>
                    </td>

                    {/* Job Title (Chức danh) */}
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                        {account.job_title || "Barista"}
                      </span>
                    </td>

                    {/* Store (Cửa hàng) */}
                    <td className="py-3 px-4 text-slate-600 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Building2 size={13} className="text-slate-400" /> {storeName}
                      </span>
                    </td>

                    {/* System Role Badge */}
                    <td className="py-3 px-4">
                      {account.role === "owner" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 font-bold border border-rose-200/60">
                          <ShieldCheck size={13} /> Chủ quán (Admin)
                        </span>
                      ) : account.role === "manager" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-bold border border-amber-200/60">
                          <ShieldCheck size={13} /> Quản lý
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold border border-slate-200/60">
                          Nhân viên
                        </span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      {account.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Đang hoạt động
                        </span>
                      ) : account.status === "invited" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold text-[11px] border border-amber-200/60">
                          <Mail size={11} /> Chờ kích hoạt
                        </span>
                      ) : account.status === "suspended" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200/60">
                          <Lock size={11} /> Tạm khóa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold text-[11px] border border-slate-200/60">
                          <UserMinus size={11} /> Đã nghỉ việc
                        </span>
                      )}
                    </td>

                    {/* Last Login */}
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {account.last_login_at ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" /> {formatDateTime(account.last_login_at)}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Chưa đăng nhập</span>
                      )}
                    </td>

                    {/* Action 3-dots Menu */}
                    <td className="py-3 px-4 text-right relative">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === account.id ? null : account.id)}
                          className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition"
                          title="Thao tác"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Popover Menu */}
                        {activeMenuId === account.id && (
                          <div
                            className="absolute right-0 mt-1 w-48 rounded-2xl bg-white shadow-xl border border-slate-100 z-30 py-1.5 text-left text-xs divide-y divide-slate-100"
                            onMouseLeave={() => setActiveMenuId(null)}
                          >
                            <div className="py-1">
                              <button
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setSelectedDetailAccount(account);
                                  void fetchAuditLogs(account.id);
                                }}
                                className="w-full px-3.5 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"
                              >
                                <Eye size={14} className="text-slate-400" /> Xem chi tiết
                              </button>
                              <button
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setEditAccount(account);
                                  setEditForm({
                                    displayName: account.display_name,
                                    jobTitle: account.job_title || "Barista",
                                    phone: account.phone || "",
                                    startDate: account.start_date || "",
                                    participatesAttendance: Boolean(account.participates_attendance),
                                    payrollEligible: Boolean(account.payroll_eligible),
                                    compensationType: account.compensation_type || "hourly",
                                    hourlyRate: String(account.hourly_rate || 0),
                                    monthlySalary: String(account.monthly_salary || 0),
                                  });
                                }}
                                className="w-full px-3.5 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"
                              >
                                <Edit3 size={14} className="text-slate-400" /> Chỉnh sửa thông tin
                              </button>
                            </div>

                            <div className="py-1">
                              <button
                                onClick={() => {
                                  setActiveMenuId(null);
                                  setRoleChangeAccount(account);
                                  setTargetRole(account.role);
                                }}
                                className="w-full px-3.5 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"
                              >
                                <ShieldCheck size={14} className="text-amber-500" /> Đổi vai trò hệ thống
                              </button>
                              {account.status === "invited" && (
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    void handleResendInvite(account);
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"
                                >
                                  <Mail size={14} className="text-blue-500" /> Gửi lại lời mời
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setActiveMenuId(null);
                                  void handleResetPassword(account);
                                }}
                                className="w-full px-3.5 py-2 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-2"
                              >
                                <KeyRound size={14} className="text-purple-500" /> Cấp lại mật khẩu tạm
                              </button>
                            </div>

                            <div className="py-1">
                              {account.status === "active" ? (
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setStatusChangeAccount(account);
                                    setTargetStatus("suspended");
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-rose-50 text-rose-600 font-medium flex items-center gap-2"
                                >
                                  <Lock size={14} /> Tạm khóa tài khoản
                                </button>
                              ) : account.status === "suspended" ? (
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setStatusChangeAccount(account);
                                    setTargetStatus("active");
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-emerald-50 text-emerald-600 font-medium flex items-center gap-2"
                                >
                                  <Unlock size={14} /> Mở khóa tài khoản
                                </button>
                              ) : null}

                              {account.status !== "offboarded" && (
                                <button
                                  onClick={() => {
                                    setActiveMenuId(null);
                                    setStatusChangeAccount(account);
                                    setTargetStatus("offboarded");
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-slate-100 text-slate-600 font-medium flex items-center gap-2"
                                >
                                  <UserMinus size={14} /> Chấm dứt làm việc
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Role Explanation Guide Block */}
      <div className="card p-5 bg-gradient-to-br from-slate-50 to-rose-50/30 border border-slate-200/60">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <ShieldCheck size={17} className="text-rose-600" /> Chuẩn hóa vai trò phân quyền hệ thống
        </h3>
        <div className="grid md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
            <div className="font-bold text-rose-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-600" /> Chủ quán (Admin)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Toàn quyền hệ thống. Quản lý danh sách tài khoản, phân quyền, xem báo cáo lương & thiết lập thông số cửa hàng.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
            <div className="font-bold text-amber-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Quản lý (Manager)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Quản lý ca làm, chấm công, duyệt yêu cầu nghỉ phép, xử lý sự cố & bàn giao ca. Không được cấp quyền Chủ quán.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-1">
            <div className="font-bold text-slate-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400" /> Nhân viên (Staff)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Xem lịch cá nhân, chấm công hàng ngày, thực hiện checklist ca làm, báo cáo sự cố & gửi thông tin bàn giao ca.
            </p>
          </div>
        </div>
      </div>

      {/* --- DRAWERS & MODALS --- */}

      {/* CREATE ACCOUNT SLIDE-OVER DRAWER */}
      <AnimatePresence>
        {showCreateDrawer && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateDrawer(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            />
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-screen max-w-md bg-white shadow-2xl flex flex-col"
              >
                {/* Drawer Header */}
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                  <div className="flex items-center gap-2">
                    <UserPlus className="text-rose-600" size={20} />
                    <div>
                      <h2 className="text-base font-bold text-slate-800">Cấp tài khoản mới</h2>
                      <p className="text-xs text-slate-500">Tạo tài khoản truy cập nhân sự trong cửa hàng</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCreateDrawer(false)}
                    className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleCreateAccount} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Họ và tên nhân viên *</label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Nguyễn Minh An"
                      value={createForm.displayName}
                      onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Email đăng nhập *</label>
                    <input
                      type="email"
                      required
                      placeholder="VD: minhan@loopicafe.vn"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Số điện thoại liên hệ</label>
                    <input
                      type="tel"
                      placeholder="VD: 0908123456"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Chức danh công việc</label>
                      <input
                        type="text"
                        placeholder="Barista, Thu ngân..."
                        value={createForm.jobTitle}
                        onChange={(e) => setCreateForm({ ...createForm, jobTitle: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Vai trò hệ thống *</label>
                      <select
                        value={createForm.role}
                        onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as AccountRole })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500 bg-white"
                      >
                        <option value="employee">Nhân viên</option>
                        <option value="manager">Quản lý</option>
                        {["owner", "system_admin"].includes(currentUserRole) && <option value="owner">Chủ quán (Admin)</option>}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Cửa hàng làm việc</label>
                      <input
                        type="text"
                        disabled
                        value={storeName}
                        className="w-full px-3 py-2 rounded-xl border border-slate-100 bg-slate-100 text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Ngày bắt đầu làm</label>
                      <input
                        type="date"
                        value={createForm.startDate}
                        onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-rose-100 bg-rose-50/40 space-y-3">
                    <div>
                      <div className="font-bold text-slate-800">Chấm công & tính lương</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Thiết lập nghiệp vụ độc lập với vai trò đăng nhập.</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex items-center gap-2 text-slate-700 font-semibold">
                        <input type="checkbox" checked={createForm.participatesAttendance} onChange={(e) => setCreateForm({ ...createForm, participatesAttendance: e.target.checked })} />
                        Có chấm công
                      </label>
                      <label className="flex items-center gap-2 text-slate-700 font-semibold">
                        <input type="checkbox" checked={createForm.payrollEligible} onChange={(e) => setCreateForm({ ...createForm, payrollEligible: e.target.checked })} />
                        Có tính lương
                      </label>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Hình thức lương</label>
                      <select value={createForm.compensationType} onChange={(e) => setCreateForm({ ...createForm, compensationType: e.target.value as typeof createForm.compensationType, payrollEligible: e.target.value !== "none" && createForm.payrollEligible })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                        <option value="hourly">Theo giờ</option><option value="monthly">Theo tháng</option><option value="shift">Theo ca</option><option value="none">Không tính lương</option>
                      </select>
                    </div>
                    {createForm.compensationType !== "none" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block font-bold text-slate-700 mb-1">Đơn giá/giờ</label><input type="number" min="0" step="1000" value={createForm.hourlyRate} onChange={(e) => setCreateForm({ ...createForm, hourlyRate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200" /></div>
                        <div><label className="block font-bold text-slate-700 mb-1">Lương tháng</label><input type="number" min="0" step="100000" value={createForm.monthlySalary} onChange={(e) => setCreateForm({ ...createForm, monthlySalary: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200" /></div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <label className="block font-bold text-slate-700">Phương thức kích hoạt tài khoản</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                        <input
                          type="radio"
                          name="activationMethod"
                          checked={createForm.activationMethod === "temporary_password"}
                          onChange={() => setCreateForm({ ...createForm, activationMethod: "temporary_password" })}
                        />
                        <div>
                          <div className="font-bold text-slate-800">Tạo mật khẩu tạm thời</div>
                          <div className="text-[11px] text-slate-500">
                            Hệ thống sinh mật khẩu ngẫu nhiên để gửi trực tiếp cho nhân viên
                          </div>
                        </div>
                      </label>

                      <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                        <input
                          type="radio"
                          name="activationMethod"
                          checked={createForm.activationMethod === "invite"}
                          onChange={() => setCreateForm({ ...createForm, activationMethod: "invite" })}
                        />
                        <div>
                          <div className="font-bold text-slate-800">Gửi email mời kích hoạt</div>
                          <div className="text-[11px] text-slate-500">
                            Gửi email có chứa liên kết xác nhận để nhân viên tự đặt mật khẩu
                          </div>
                        </div>
                      </label>
                    </div>

                    {createForm.activationMethod === "temporary_password" && (
                      <label className="flex items-center gap-2 pt-2 text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createForm.mustChangePassword}
                          onChange={(e) => setCreateForm({ ...createForm, mustChangePassword: e.target.checked })}
                          className="rounded text-rose-600 focus:ring-rose-500"
                        />
                        <span>Yêu cầu đổi mật khẩu ngay ở lần đăng nhập đầu tiên</span>
                      </label>
                    )}
                  </div>

                  {/* Drawer Footer Actions */}
                  <div className="pt-6 border-t border-slate-100 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateDrawer(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow"
                    >
                      {creating ? "Đang xử lý…" : "Cấp tài khoản"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ACCOUNT DETAIL DRAWER (Xem chi tiết) */}
      <AnimatePresence>
        {selectedDetailAccount && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDetailAccount(null)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-screen max-w-lg bg-white shadow-2xl flex flex-col"
              >
                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-800 font-bold flex items-center justify-center border border-rose-200">
                      {getInitials(selectedDetailAccount.display_name)}
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-800">{selectedDetailAccount.display_name}</h2>
                      <p className="text-xs text-slate-500">{selectedDetailAccount.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDetailAccount(null)}
                    className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                  {/* 1. General Info */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] text-rose-700 flex items-center gap-1.5">
                      <UserCheck size={14} /> Thông tin chung
                    </h3>
                    <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100">
                      <div>
                        <div className="text-slate-400">Chức danh</div>
                        <div className="font-bold text-slate-700 mt-0.5">{selectedDetailAccount.job_title}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Số điện thoại</div>
                        <div className="font-bold text-slate-700 mt-0.5">{selectedDetailAccount.phone || "Chưa cập nhật"}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Cửa hàng làm việc</div>
                        <div className="font-bold text-slate-700 mt-0.5">{storeName}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Ngày bắt đầu làm</div>
                        <div className="font-bold text-slate-700 mt-0.5">{selectedDetailAccount.start_date || "Chưa rõ"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] text-emerald-700 flex items-center gap-1.5">
                      <BadgeCheck size={14} /> Chấm công & tính lương
                    </h3>
                    <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-2">
                      <div className="flex items-center justify-between"><span className="text-slate-500">Tham gia chấm công</span><span className="font-bold text-slate-800">{selectedDetailAccount.participates_attendance ? "Có" : "Không"}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500">Được tính lương</span><span className="font-bold text-slate-800">{selectedDetailAccount.payroll_eligible ? "Có" : "Không"}</span></div>
                      <div className="flex items-center justify-between"><span className="text-slate-500">Hình thức lương</span><span className="font-bold text-slate-800">{compensationLabel(selectedDetailAccount.compensation_type)}</span></div>
                      {selectedDetailAccount.compensation_type !== "none" && <div className="flex items-center justify-between"><span className="text-slate-500">Mức lương</span><span className="font-bold text-slate-800">{selectedDetailAccount.compensation_type === "monthly" ? `${formatMoney(selectedDetailAccount.monthly_salary)}/tháng` : `${formatMoney(selectedDetailAccount.hourly_rate)}/giờ`}</span></div>}
                    </div>
                  </div>

                  {/* 2. System Access & Role */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] text-amber-700 flex items-center gap-1.5">
                      <ShieldCheck size={14} /> Quyền truy cập & Vai trò
                    </h3>
                    <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Vai trò hệ thống</span>
                        <span className="font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-lg">
                          {selectedDetailAccount.role === "owner"
                            ? "Chủ quán (Admin)"
                            : selectedDetailAccount.role === "manager"
                            ? "Quản lý"
                            : "Nhân viên"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Trạng thái tài khoản</span>
                        <span className="font-bold text-slate-700">{selectedDetailAccount.status}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Người khởi tạo</span>
                        <span className="font-bold text-slate-700">{selectedDetailAccount.invited_by || "Hệ thống"}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Ngày cấp tài khoản</span>
                        <span className="font-bold text-slate-700">{formatDateTime(selectedDetailAccount.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Security */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] text-blue-700 flex items-center gap-1.5">
                      <Lock size={14} /> Bảo mật
                    </h3>
                    <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Đăng nhập gần nhất</span>
                        <span className="font-bold text-slate-800">
                          {selectedDetailAccount.last_login_at
                            ? formatDateTime(selectedDetailAccount.last_login_at)
                            : "Chưa từng đăng nhập"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Liên kết Supabase Auth</span>
                        <span className="font-bold text-emerald-700">
                          {selectedDetailAccount.auth_user_id ? "Đã liên kết" : "Chưa liên kết"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. Audit Log Trail */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] text-purple-700 flex items-center gap-1.5">
                      <Clock size={14} /> Nhật ký thay đổi & thao tác (Audit Log)
                    </h3>
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 max-h-48 overflow-y-auto">
                      {loadingAudit ? (
                        <div className="text-slate-400 text-center py-2">Đang tải nhật ký…</div>
                      ) : detailAuditLogs.length === 0 ? (
                        <div className="text-slate-400 text-center py-2">Chưa có lịch sử thay đổi.</div>
                      ) : (
                        detailAuditLogs.map((log) => (
                          <div key={log.id} className="p-2 rounded-xl bg-white border border-slate-100 space-y-0.5">
                            <div className="flex items-center justify-between font-bold text-slate-700">
                              <span>{log.action}</span>
                              <span className="text-[10px] text-slate-400">{formatDateTime(log.created_at)}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">Bởi: {log.actor_email}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT INFO MODAL */}
      <AnimatePresence>
        {editAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditAccount(null)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-xs z-10"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-800">Chỉnh sửa thông tin</h3>
                <button onClick={() => setEditAccount(null)} className="p-1 rounded-lg hover:bg-slate-100">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleUpdateInfo} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={editForm.displayName}
                    onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Chức danh công việc</label>
                  <input
                    type="text"
                    required
                    value={editForm.jobTitle}
                    onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ngày bắt đầu làm việc</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="p-3.5 rounded-2xl border border-rose-100 bg-rose-50/40 space-y-3">
                  <div className="font-bold text-slate-800">Chấm công & tính lương</div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={editForm.participatesAttendance} onChange={(e) => setEditForm({ ...editForm, participatesAttendance: e.target.checked })} /> Có chấm công</label>
                    <label className="flex items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={editForm.payrollEligible} onChange={(e) => setEditForm({ ...editForm, payrollEligible: e.target.checked })} /> Có tính lương</label>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Hình thức lương</label>
                    <select value={editForm.compensationType} onChange={(e) => setEditForm({ ...editForm, compensationType: e.target.value as typeof editForm.compensationType, payrollEligible: e.target.value !== "none" && editForm.payrollEligible })} className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white">
                      <option value="hourly">Theo giờ</option><option value="monthly">Theo tháng</option><option value="shift">Theo ca</option><option value="none">Không tính lương</option>
                    </select>
                  </div>
                  {editForm.compensationType !== "none" && <div className="grid grid-cols-2 gap-3"><div><label className="block font-bold text-slate-700 mb-1">Đơn giá/giờ</label><input type="number" min="0" step="1000" value={editForm.hourlyRate} onChange={(e) => setEditForm({ ...editForm, hourlyRate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200" /></div><div><label className="block font-bold text-slate-700 mb-1">Lương tháng</label><input type="number" min="0" step="100000" value={editForm.monthlySalary} onChange={(e) => setEditForm({ ...editForm, monthlySalary: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200" /></div></div>}
                </div>

                <div className="pt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditAccount(null)}
                    className="flex-1 py-2 rounded-xl border border-slate-200 font-bold"
                  >
                    Hủy
                  </button>
                  <button type="submit" className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold shadow">
                    Lưu thay đổi
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CHANGE ROLE CONFIRMATION MODAL */}
      <AnimatePresence>
        {roleChangeAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRoleChangeAccount(null)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-xs z-10"
            >
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="text-base font-bold text-slate-800">Thay đổi vai trò hệ thống</h3>
              </div>

              <p className="text-slate-600 leading-relaxed">
                Bạn đang chuẩn bị thay đổi vai trò hệ thống của{" "}
                <strong className="text-slate-800">{roleChangeAccount.display_name}</strong> ({roleChangeAccount.email}).
              </p>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Chọn vai trò hệ thống mới:</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as AccountRole)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                >
                  <option value="employee">Nhân viên</option>
                  <option value="manager">Quản lý</option>
                  {["owner", "system_admin"].includes(currentUserRole) && <option value="owner">Chủ quán (Admin)</option>}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px]">
                ⚠️ Thay đổi vai trò hệ thống sẽ ảnh hưởng tới các quyền truy cập thông tin chấm công, báo cáo và quản lý tài khoản của nhân viên.
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setRoleChangeAccount(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 font-bold"
                >
                  Hủy
                </button>
                <button
                  onClick={handleChangeRole}
                  className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow"
                >
                  Xác nhận đổi vai trò
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CHANGE STATUS / LOCK / OFFBOARD MODAL */}
      <AnimatePresence>
        {statusChangeAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStatusChangeAccount(null)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-xs z-10"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <AlertTriangle size={24} />
                <h3 className="text-base font-bold text-slate-800">
                  {targetStatus === "suspended"
                    ? "Tạm khóa tài khoản?"
                    : targetStatus === "offboarded"
                    ? "Chấm dứt làm việc?"
                    : "Mở khóa tài khoản?"}
                </h3>
              </div>

              <p className="text-slate-600 leading-relaxed">
                {targetStatus === "suspended" ? (
                  <>
                    Khóa tài khoản <strong className="text-slate-800">{statusChangeAccount.display_name}</strong>? Người
                    này sẽ không thể đăng nhập, nhưng toàn bộ lịch sử chấm công và công việc vẫn được giữ nguyên trong báo cáo.
                  </>
                ) : targetStatus === "offboarded" ? (
                  <>
                    Chấm dứt làm việc với <strong className="text-slate-800">{statusChangeAccount.display_name}</strong>? Nhân
                    viên sẽ được chuyển sang trạng thái Đã nghỉ việc, bị loại khỏi lịch làm mới nhưng lịch sử vận hành vẫn được giữ lại đầy đủ.
                  </>
                ) : (
                  <>
                    Mở khóa tài khoản cho <strong className="text-slate-800">{statusChangeAccount.display_name}</strong>? Người
                    này có thể đăng nhập lại vào hệ thống bình thường.
                  </>
                )}
              </p>

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setStatusChangeAccount(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 font-bold"
                >
                  Hủy
                </button>
                <button
                  onClick={handleChangeStatus}
                  className={`flex-1 py-2 rounded-xl text-white font-bold shadow ${
                    targetStatus === "active" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                  }`}
                >
                  Xác nhận
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getInitials(name: string) {
  if (!name) return "NV";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function compensationLabel(value: Account["compensation_type"]) {
  if (value === "monthly") return "Theo tháng";
  if (value === "shift") return "Theo ca";
  if (value === "none") return "Không tính lương";
  return "Theo giờ";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value || 0)}đ`;
}
