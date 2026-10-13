import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";
import { resolvePayrollPeriod } from "../domain/period.ts";

export async function addPayrollAdjustment(db: D1Database, actor: AccessActor, input: { id?: unknown; period?: unknown; employeeEmail?: unknown; amount?: unknown; reason?: unknown }) {
  if (!["owner", "manager"].includes(actor.role)) throw new ApplicationError("Bạn không có quyền điều chỉnh lương.", 403, "forbidden");
  if (typeof input.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(input.id) || typeof input.period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) || typeof input.employeeEmail !== "string" || typeof input.amount !== "number" || !Number.isSafeInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 100000000 || typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.length > 1000) throw new ApplicationError("Điều chỉnh cần số tiền nguyên khác 0, kỳ lương và lý do từ 5 đến 1000 ký tự.");
  const email = input.employeeEmail.toLowerCase(), reason = input.reason.trim();
  const existing = await db.prepare("SELECT store_id, period_key, employee_email, amount, reason FROM payroll_adjustments WHERE id = ?").bind(input.id)
    .first<{ store_id: string; period_key: string; employee_email: string; amount: number; reason: string }>();
  if (existing) {
    if (existing.store_id !== actor.storeId || existing.period_key !== input.period || existing.employee_email !== email || existing.amount !== input.amount || existing.reason !== reason) throw new ApplicationError("Mã điều chỉnh đã dùng cho nội dung khác.", 409, "adjustment_conflict");
    return { updated: true, replayed: true };
  }
  const period = resolvePayrollPeriod(input.period), now = new Date().toISOString();
  let results;
  try {
    results = await db.batch([
      db.prepare(`INSERT INTO payroll_adjustments (id, store_id, period_key, employee_email, amount, reason, actor_email, created_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM employees WHERE store_id = ? AND lower(email) = ? AND COALESCE(payroll_eligible, 1) = 1 AND COALESCE(compensation_type, 'hourly') = 'hourly')
        AND NOT EXISTS (SELECT 1 FROM payroll_periods WHERE store_id = ? AND period_start = ? AND period_end = ? AND status IN ('finalized', 'paid'))`)
        .bind(input.id, actor.storeId, input.period, email, input.amount, reason, actor.email, now, actor.storeId, email, actor.storeId, period.startIso, period.endExclusiveIso),
      auditStatement(db, actor.email, "payroll_adjustment", input.id, "payroll.adjusted", { employeeEmail: email, period: input.period, amount: input.amount, reason }, now, true),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message)) return addPayrollAdjustment(db, actor, input);
    throw error;
  }
  if (!results[0].meta.changes) throw new ApplicationError("Kỳ lương đã khóa hoặc nhân viên không thuộc bảng lương giờ.", 409, "payroll_conflict");
  return { updated: true, replayed: false };
}
