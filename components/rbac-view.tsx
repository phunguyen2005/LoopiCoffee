"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Edit3, Plus, RefreshCw, Save, ShieldCheck, Users } from "lucide-react";
import { AsyncStatePanel, ViewHeader, readJson } from "./operational/shared";

type Permission = { key: string; label: string; description: string; group: string; assignableTo: string[]; dependsOn?: string[] };
type SystemRoleSet = { role: "manager" | "team_lead"; permissions: string[]; revision: number; configured: boolean };
type CustomRoleRecord = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  revision: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assignedCount: number;
  permissions: string[];
  permissionRevision: number;
};
type Payload = {
  catalog: Permission[];
  roles: SystemRoleSet[];
  customRoles?: CustomRoleRecord[];
  editable: boolean;
  error?: string;
};

export function RbacView() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [role, setRole] = useState<string>("manager");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editReason, setEditReason] = useState("");

  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");

  const load = useCallback(async (selectRoleId?: string) => {
    setError("");
    const response = await fetch("/api/admin/roles", { cache: "no-store" });
    const data = await readJson<Payload>(response);
    if (!response.ok) throw new Error(data.error ?? "Không thể tải quyền.");
    setPayload(data);

    const targetRole = selectRoleId || role;
    const isCustom = targetRole.startsWith("crole_");
    if (isCustom) {
      const cr = data.customRoles?.find((item) => item.id === targetRole);
      if (cr) {
        setRole(cr.id);
        setSelected(cr.permissions ?? []);
      } else {
        setRole("manager");
        const mgr = data.roles.find((item) => item.role === "manager");
        setSelected(mgr?.permissions ?? []);
      }
    } else {
      const sys = data.roles.find((item) => item.role === targetRole);
      setRole(targetRole);
      setSelected(sys?.permissions ?? []);
    }
  }, [role]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Không thể tải quyền.")),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);

  const isCustomRole = role.startsWith("crole_");
  const currentCustomRole = isCustomRole ? payload?.customRoles?.find((item) => item.id === role) : null;
  const currentSystemRole = !isCustomRole ? payload?.roles.find((item) => item.role === role) : null;
  const currentRevision = isCustomRole ? (currentCustomRole?.permissionRevision ?? 0) : (currentSystemRole?.revision ?? 0);

  const initialPermissions = useMemo(() => {
    if (isCustomRole) {
      return currentCustomRole?.permissions ?? [];
    }
    return currentSystemRole?.permissions ?? [];
  }, [isCustomRole, currentCustomRole, currentSystemRole]);

  const isDirty = useMemo(() => {
    if (selected.length !== initialPermissions.length) return true;
    const initialSet = new Set(initialPermissions);
    return selected.some((p) => !initialSet.has(p));
  }, [selected, initialPermissions]);

  const available = useMemo(() => {
    if (!payload) return [];
    if (isCustomRole) {
      return payload.catalog;
    }
    return payload.catalog.filter((item) => item.assignableTo.includes(role as "manager" | "team_lead"));
  }, [payload, role, isCustomRole]);

  const groups = useMemo(() => [...new Set(available.map((item) => item.group))], [available]);

  function toggle(permission: Permission) {
    if (!payload?.editable) return;
    const next = new Set(selected);
    if (next.has(permission.key)) {
      next.delete(permission.key);
      for (const item of available) if (item.dependsOn?.includes(permission.key)) next.delete(item.key);
    } else {
      next.add(permission.key);
      for (const dependency of permission.dependsOn ?? []) next.add(dependency);
    }
    setSelected([...next]);
  }

  async function save() {
    if (!currentCustomRole && !currentSystemRole) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/roles/${role}/permissions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          permissions: selected,
          expectedRevision: currentRevision,
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể lưu quyền.");
      setMessage("Đã cập nhật bộ quyền. Thay đổi có hiệu lực từ request tiếp theo.");
      setReason("");
      await load(role);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu quyền.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateCustomRole() {
    if (!createName.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await readJson<{ role?: { id: string; name: string }; error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể tạo vai trò.");
      setShowCreateDialog(false);
      setCreateName("");
      setCreateDesc("");
      setMessage(`Đã tạo vai trò tùy chỉnh "${data.role?.name}". Hãy cấu hình quyền ban đầu.`);
      await load(data.role?.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo vai trò.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCustomRole() {
    if (!currentCustomRole || !editName.trim() || editReason.trim().length < 5) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleId: currentCustomRole.id,
          action: "update",
          name: editName.trim(),
          description: editDesc.trim() || undefined,
          expectedRevision: currentCustomRole.revision,
          reason: editReason.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể cập nhật vai trò.");
      setShowEditDialog(false);
      setEditReason("");
      setMessage("Đã cập nhật thông tin vai trò.");
      await load(currentCustomRole.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật vai trò.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveCustomRole() {
    if (!currentCustomRole || archiveReason.trim().length < 5) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleId: currentCustomRole.id,
          action: "archive",
          expectedRevision: currentCustomRole.revision,
          reason: archiveReason.trim(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error ?? "Không thể lưu trữ vai trò.");
      setShowArchiveDialog(false);
      setArchiveReason("");
      setMessage(`Đã lưu trữ vai trò "${currentCustomRole.name}".`);
      await load("manager");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu trữ vai trò.");
    } finally {
      setBusy(false);
    }
  }

  if (!payload && error) {
    return (
      <AsyncStatePanel
        state="error"
        title="Không thể tải ma trận quyền"
        description={error}
        actionLabel="Thử lại"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="stack admin-workspace">
      <section className="card">
        <ViewHeader
          title="Vai trò & phân quyền"
          subtitle="Cấu hình quyền cho vai trò hệ thống hoặc tạo vai trò tùy chỉnh theo cửa hàng. Quyền chỉ mở chức năng; phạm vi cửa hàng và chống tự duyệt luôn được kiểm tra."
        />
      </section>

      {message && <div className="notice success" role="status">{message}</div>}
      {error && <div className="notice danger" role="alert">{error}</div>}

      <section className="card rbac-toolbar flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="field mb-0">
            <span>Vai trò đang chọn</span>
            <select
              value={role}
              onChange={(event) => {
                const nextRole = event.target.value;
                setRole(nextRole);
                if (nextRole.startsWith("crole_")) {
                  const cr = payload?.customRoles?.find((item) => item.id === nextRole);
                  setSelected(cr?.permissions ?? []);
                } else {
                  const sys = payload?.roles.find((item) => item.role === nextRole);
                  setSelected(sys?.permissions ?? []);
                }
              }}
            >
              <optgroup label="Vai trò hệ thống">
                <option value="manager">Quản lý</option>
                <option value="team_lead">Trưởng ca</option>
              </optgroup>
              {payload?.customRoles && payload.customRoles.length > 0 && (
                <optgroup label="Vai trò tùy chỉnh">
                  {payload.customRoles.map((cr) => (
                    <option key={cr.id} value={cr.id} disabled={cr.status === "archived"}>
                      {cr.name} {cr.status === "archived" ? "(Đã lưu trữ)" : `(${cr.assignedCount} người)`}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <span className="badge neutral">Revision {currentRevision}</span>

          {currentCustomRole && (
            <div className="flex items-center gap-2">
              <span className="badge info flex items-center gap-1">
                <Users size={13} /> {currentCustomRole.assignedCount} tài khoản
              </span>
              {payload?.editable && currentCustomRole.status === "active" && (
                <>
                  <button
                    type="button"
                    className="button-secondary px-2.5 py-1 text-xs"
                    onClick={() => {
                      setEditName(currentCustomRole.name);
                      setEditDesc(currentCustomRole.description ?? "");
                      setEditReason("");
                      setShowEditDialog(true);
                    }}
                    title="Chỉnh sửa tên và mô tả vai trò"
                  >
                    <Edit3 size={14} /> Sửa tên
                  </button>
                  <button
                    type="button"
                    className="button-secondary text-danger px-2.5 py-1 text-xs"
                    onClick={() => {
                      setArchiveReason("");
                      setShowArchiveDialog(true);
                    }}
                    title="Lưu trữ vai trò khi không còn tài khoản sử dụng"
                  >
                    <Archive size={14} /> Lưu trữ
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {payload?.editable && (
            <button
              type="button"
              className="button-secondary text-xs"
              onClick={() => {
                setCreateName("");
                setCreateDesc("");
                setShowCreateDialog(true);
              }}
            >
              <Plus size={15} /> Thêm vai trò mới
            </button>
          )}
          <button type="button" className="button-secondary text-xs" onClick={() => void load()}>
            <RefreshCw size={15} /> Tải lại
          </button>
        </div>
      </section>

      {/* Dialog tạo vai trò mới */}
      {showCreateDialog && (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => !busy && setShowCreateDialog(false)}>
          <section className="admin-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Tạo vai trò tùy chỉnh mới</h2>
            <p className="text-xs text-[#7b6f70]">
              Vai trò mới sẽ bắt đầu với danh sách quyền rỗng. Bạn có thể chọn bất kỳ quyền nghiệp vụ nào trong danh mục sau khi tạo.
            </p>
            <label className="field">
              <span>Tên vai trò (2-50 ký tự) *</span>
              <input
                required
                minLength={2}
                maxLength={50}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Ví dụ: Kế toán ca, Barista Lead, Giám sát kho..."
              />
            </label>
            <label className="field">
              <span>Mô tả vai trò</span>
              <textarea
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Mô tả phạm vi trách nhiệm của vai trò này..."
                rows={2}
              />
            </label>
            <div className="admin-dialog-actions justify-end mt-2">
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setShowCreateDialog(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="button"
                disabled={busy || createName.trim().length < 2}
                onClick={() => void handleCreateCustomRole()}
              >
                {busy ? "Đang tạo…" : "Tạo vai trò"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Dialog sửa vai trò */}
      {showEditDialog && currentCustomRole && (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => !busy && setShowEditDialog(false)}>
          <section className="admin-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Chỉnh sửa vai trò tùy chỉnh</h2>
            <label className="field">
              <span>Tên vai trò *</span>
              <input
                required
                minLength={2}
                maxLength={50}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Mô tả vai trò</span>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
              />
            </label>
            <label className="field">
              <span>Lý do thay đổi (tối thiểu 5 ký tự) *</span>
              <textarea
                required
                minLength={5}
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Nhập lý do điều chỉnh tên hoặc mô tả..."
              />
            </label>
            <div className="admin-dialog-actions justify-end mt-2">
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setShowEditDialog(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="button"
                disabled={busy || editName.trim().length < 2 || editReason.trim().length < 5}
                onClick={() => void handleUpdateCustomRole()}
              >
                {busy ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Dialog lưu trữ vai trò */}
      {showArchiveDialog && currentCustomRole && (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => !busy && setShowArchiveDialog(false)}>
          <section className="admin-dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h2 className="text-danger">Lưu trữ vai trò tùy chỉnh</h2>
            <p className="text-sm">
              Bạn có chắc chắn muốn lưu trữ vai trò <strong>{currentCustomRole.name}</strong>?
            </p>
            {currentCustomRole.assignedCount > 0 ? (
              <div className="notice danger text-xs leading-relaxed">
                Vai trò này hiện đang được gán cho <strong>{currentCustomRole.assignedCount}</strong> tài khoản. Bạn phải chuyển tất cả các tài khoản này sang vai trò khác tại trang Quản trị tài khoản trước khi có thể lưu trữ.
              </div>
            ) : (
              <div className="notice warning text-xs leading-relaxed">
                Vai trò sau khi lưu trữ sẽ không thể gán cho nhân viên mới và bộ quyền của nó sẽ bị đóng băng.
              </div>
            )}
            <label className="field">
              <span>Lý do lưu trữ (tối thiểu 5 ký tự) *</span>
              <textarea
                required
                minLength={5}
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="Nhập lý do lưu trữ vai trò này..."
              />
            </label>
            <div className="admin-dialog-actions justify-end mt-2">
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setShowArchiveDialog(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={busy || currentCustomRole.assignedCount > 0 || archiveReason.trim().length < 5}
                onClick={() => void handleArchiveCustomRole()}
              >
                {busy ? "Đang xử lý…" : "Xác nhận lưu trữ"}
              </button>
            </div>
          </section>
        </div>
      )}

      {groups.map((group) => (
        <section className="card" key={group}>
          <h2>{groupLabel(group)}</h2>
          <div className="rbac-grid">
            {available
              .filter((item) => item.group === group)
              .map((permission) => (
                <label className="rbac-item" key={permission.key}>
                  <input
                    type="checkbox"
                    checked={selected.includes(permission.key)}
                    disabled={!payload?.editable || busy}
                    onChange={() => toggle(permission)}
                  />
                  <span>
                    <strong>{permission.label}</strong>
                    <small>{permission.description}</small>
                    {permission.dependsOn?.length ? (
                      <em>Phụ thuộc: {permission.dependsOn.join(", ")}</em>
                    ) : null}
                  </span>
                </label>
              ))}
          </div>
        </section>
      ))}

      {payload?.editable && (
        <section className="card rbac-save">
          <label className="field">
            <span>Lý do thay đổi bộ quyền (tối thiểu 5 ký tự) *</span>
            <textarea
              id="rbac-reason-input"
              minLength={5}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ví dụ: Điều chỉnh phạm vi xử lý đơn và xem báo cáo cho vai trò này"
            />
          </label>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {isDirty && (
              <span className="text-xs font-semibold text-[#a65300] bg-[#fff4d6] border border-[#f4b85f] px-2.5 py-1 rounded-md">
                Có thay đổi quyền chưa lưu
              </span>
            )}
            <button
              type="button"
              className="button min-h-[44px]"
              disabled={busy || reason.trim().length < 5}
              onClick={() => void save()}
            >
              <Save size={17} /> {busy ? "Đang lưu…" : "Lưu bộ quyền"}
            </button>
          </div>
        </section>
      )}

      {payload?.editable && isDirty && (
        <aside
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#e2d5cb] p-3 shadow-lg flex items-center justify-between gap-3 md:hidden"
          aria-label="Thanh lưu thay đổi ma trận quyền trên thiết bị di động"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-[#6f2939]">Ma trận quyền đã thay đổi</span>
            <span className="text-[11px] text-[#635657] truncate">
              {reason.trim().length < 5 ? "Nhập lý do để lưu" : "Sẵn sàng lưu thay đổi"}
            </span>
          </div>
          <button
            type="button"
            className="button min-h-[44px] shrink-0 text-xs px-3 py-2"
            disabled={busy}
            onClick={() => {
              if (reason.trim().length < 5) {
                const el = document.getElementById("rbac-reason-input");
                el?.focus();
                el?.scrollIntoView({ behavior: "smooth" });
              } else {
                void save();
              }
            }}
          >
            <Save size={15} /> {busy ? "Đang lưu…" : "Lưu quyền"}
          </button>
        </aside>
      )}

      {!payload?.editable && (
        <div className="notice">
          <ShieldCheck size={17} /> Chủ quán đang xem ma trận quyền ở chế độ đối soát.
        </div>
      )}
    </div>
  );
}

function groupLabel(group: string) {
  return (
    ({
      overview: "Tổng quan",
      workforce: "Nhân sự & lịch",
      attendance: "Chấm công",
      payroll: "Lương & báo cáo",
      operations: "Vận hành",
      ordering: "Menu & đơn hàng",
    } as Record<string, string>)[group] ?? group
  );
}


