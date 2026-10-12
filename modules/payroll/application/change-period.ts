import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";
import { resolvePayrollPeriod } from "../domain/period.ts";
import { loadPayrollReport } from "./load-report.ts";

export async function changePayrollPeriod(db: D1Database, actor: AccessActor, action: "finalize" | "reopen", periodKey?: string) {
  if (!["owner", "manager", "system_admin"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền chốt lương.", 403, "forbidden");
  const period = resolvePayrollPeriod(periodKey);
  const existing = await db.prepare(
    "SELECT id, status FROM payroll_periods WHERE store_id = ? AND period_start = ? AND period_end = ?",
  ).bind(actor.storeId, period.startIso, period.endExclusiveIso).first<{ id: string; status: string }>();
  const now = new Date().toISOString();
  if (action === "reopen") {
    if (actor.role === "manager") throw new ApplicationError("Chỉ Chủ quán mới có thể mở lại kỳ lương.", 403, "forbidden");
    if (!existing || existing.status !== "finalized") throw new ApplicationError("Chỉ có thể mở lại kỳ đã chốt và chưa thanh toán.", 409, "payroll_conflict");
    const result = await db.batch([
      db.prepare("UPDATE payroll_periods SET status = 'reviewing', reopened_by = ?, reopened_at = ?, updated_at = ? WHERE id = ? AND status = 'finalized'")
        .bind(actor.email, now, now, existing.id),
      auditStatement(db, actor.email, "payroll_period", existing.id, "payroll.reopened", { period: period.key }, now, true),
    ]);
    if (!result[0].meta.changes) throw new ApplicationError("Kỳ lương vừa được cập nhật. Hãy tải lại.", 409, "payroll_conflict");
    return { updated: true, status: "reviewing" };
  }
  if (existing && existing.status !== "reviewing") throw new ApplicationError("Kỳ lương đã khóa.", 409, "payroll_conflict");
  const report = await loadPayrollReport(db, { storeId: actor.storeId, actorEmail: actor.email, actorRole: actor.role, periodKey: period.key });
  const unresolvedSession = await db.prepare("SELECT id FROM attendance_sessions WHERE store_id = ? AND closed_at IS NULL AND opened_at < ? LIMIT 1").bind(actor.storeId, period.endExclusiveIso).first();
  if (unresolvedSession) throw new ApplicationError("Còn ca chưa đóng, kể cả ca bắt đầu từ kỳ trước. Hãy đối soát giờ ra trước khi chốt.", 409, "pending_exceptions");
  const rows = report.rows.filter((row) => row.includeInPayroll && row.hasPayrollData);
  if (!rows.length) throw new ApplicationError("Kỳ này chưa có nhân viên đủ điều kiện tính lương.", 409, "empty_payroll");
  if (rows.some((row) => row.pendingExceptionCount > 0)) throw new ApplicationError("Còn ngoại lệ chấm công chưa xử lý.", 409, "pending_exceptions");
  if (rows.some((row) => row.compensationType !== "hourly" || row.hourlyRate <= 0)) throw new ApplicationError("Hãy cấu hình đơn giá giờ cho từng nhân viên trước khi chốt kỳ. Phiên bản này chỉ tính lương theo giờ.", 409, "pay_rate_required");
  const periodId = existing?.id ?? crypto.randomUUID();
  const commandId = crypto.randomUUID();
  const result = await db.batch([
    db.prepare(
      `INSERT INTO payroll_periods (id, store_id, period_start, period_end, status, finalized_by, finalized_at, created_at, updated_at)
       SELECT ?, ?, ?, ?, 'finalized', ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM stores WHERE id = ? AND workforce_revision = ?)
       ON CONFLICT(store_id, period_start, period_end) DO UPDATE SET
         status = 'finalized', finalized_by = excluded.finalized_by, finalized_at = excluded.finalized_at, updated_at = excluded.updated_at
       WHERE payroll_periods.status = 'reviewing'
         AND EXISTS (SELECT 1 FROM stores WHERE id = ? AND workforce_revision = ?)`,
    ).bind(periodId, actor.storeId, period.startIso, period.endExclusiveIso, actor.email, now, now, now,
      actor.storeId, report.sourceRevision, actor.storeId, report.sourceRevision),
    // The unique audit ID also gates all writes if a concurrent finalizer won.
    auditStatement(db, actor.email, "payroll_period", periodId, "payroll.finalized", { period: period.key, employeeCount: rows.length }, now, true, commandId),
    db.prepare("DELETE FROM payroll_entries WHERE payroll_period_id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)").bind(periodId, commandId),
    ...rows.map((row) => db.prepare(
      `INSERT INTO payroll_entries (id, payroll_period_id, employee_email, approved_minutes, overtime_minutes,
        allowance_amount, bonus_amount, deduction_amount, total_amount, status, locked_at, updated_at, row_snapshot, snapshot_version)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'payroll_finalized', ?, ?, ?, 1
       WHERE EXISTS (SELECT 1 FROM audit_events WHERE id = ?)`,
    ).bind(crypto.randomUUID(), periodId, row.email, row.approvedMinutes, row.overtimeMinutes,
      row.allowanceAmount, row.bonusAmount, row.deductionAmount, row.totalSalary, now, now,
      JSON.stringify({ ...row, exceptions: row.exceptions.map((exception) => ({ ...exception, canReview: false })), status: "payroll_finalized", snapshotComplete: true }), commandId)),
  ]);
  if (!result[0].meta.changes) throw new ApplicationError("Dữ liệu công hoặc kỳ lương vừa thay đổi. Hãy tải lại và kiểm tra trước khi chốt.", 409, "payroll_conflict");
  return { updated: true, status: "finalized", employeeCount: rows.length };
}
