import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

type RestoreRateInput = {
  id?: unknown;
  employeeEmail?: unknown;
  hourlyRate?: unknown;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
  reason?: unknown;
};

export async function restoreHistoricalHourlyRate(db: D1Database, actor: AccessActor, input: RestoreRateInput) {
  if (actor.role !== "owner") throw new ApplicationError("Chỉ Chủ quán mới có thể khôi phục lịch sử đơn giá.", 403, "forbidden");
  const id = text(input.id, 16, 120, "Mã thao tác không hợp lệ.");
  const employeeEmail = text(input.employeeEmail, 3, 320, "Nhân viên không hợp lệ.").toLowerCase();
  const reason = text(input.reason, 5, 1000, "Cần nêu căn cứ khôi phục đơn giá.");
  const hourlyRate = Number(input.hourlyRate);
  if (!Number.isSafeInteger(hourlyRate) || hourlyRate <= 0 || hourlyRate > 1_000_000_000) {
    throw new ApplicationError("Đơn giá giờ không hợp lệ.", 400, "invalid_pay_rate");
  }
  const effectiveFrom = timestamp(input.effectiveFrom, "Thời điểm bắt đầu đơn giá không hợp lệ.");
  const effectiveTo = input.effectiveTo === undefined || input.effectiveTo === null || input.effectiveTo === ""
    ? null
    : timestamp(input.effectiveTo, "Thời điểm kết thúc đơn giá không hợp lệ.");
  if (effectiveTo && effectiveTo <= effectiveFrom) throw new ApplicationError("Khoảng hiệu lực đơn giá không hợp lệ.", 400, "invalid_pay_rate_period");

  const replay = await db.prepare(
    `SELECT employee_email, hourly_rate, effective_from, effective_to FROM employee_rate_history
     WHERE id = ? AND store_id = ?`,
  ).bind(id, actor.storeId).first<{ employee_email: string; hourly_rate: number | null; effective_from: string; effective_to: string | null }>();
  if (replay) {
    if (replay.employee_email.toLowerCase() === employeeEmail && replay.hourly_rate === hourlyRate && replay.effective_from === effectiveFrom && replay.effective_to === effectiveTo) {
      return { restored: true, id, replayed: true };
    }
    throw new ApplicationError("Mã thao tác đã được dùng với nội dung khác.", 409, "idempotency_conflict");
  }

  const employee = await db.prepare(
    `SELECT email, compensation_type, payroll_eligible FROM employees
     WHERE store_id = ? AND lower(email) = lower(?) AND role <> 'system_admin'`,
  ).bind(actor.storeId, employeeEmail).first<{ email: string; compensation_type: string | null; payroll_eligible: number | null }>();
  if (!employee) throw new ApplicationError("Không tìm thấy nhân viên trong cửa hàng.", 404, "employee_not_found");
  if (employee.compensation_type !== "hourly" || employee.payroll_eligible === 0) {
    throw new ApplicationError("Nhân viên không thuộc chế độ lương giờ.", 409, "invalid_compensation_type");
  }
  const overlap = await db.prepare(
    `SELECT id FROM employee_rate_history WHERE store_id = ? AND lower(employee_email) = lower(?) AND compensation_type = 'hourly'
       AND ? < COALESCE(effective_to, '9999-12-31T23:59:59.999Z')
       AND COALESCE(?, '9999-12-31T23:59:59.999Z') > effective_from LIMIT 1`,
  ).bind(actor.storeId, employee.email, effectiveFrom, effectiveTo).first();
  if (overlap) throw new ApplicationError("Khoảng đơn giá bị chồng với lịch sử hiện có.", 409, "rate_history_overlap");

  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();
  let result: D1Result<unknown>[];
  try {
    result = await db.batch([
      db.prepare(
        `INSERT INTO employee_rate_history
          (id, store_id, employee_email, compensation_type, hourly_rate, monthly_salary, effective_from, effective_to, created_by, created_at)
         SELECT ?, ?, ?, 'hourly', ?, NULL, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM employee_rate_history WHERE id = ?)`,
      ).bind(id, actor.storeId, employee.email, hourlyRate, effectiveFrom, effectiveTo, actor.email, now, id),
      auditStatement(db, actor.email, "employee_rate_history", id, "payroll.rate_history_restored", {
        employeeEmail: employee.email,
        hourlyRate,
        effectiveFrom,
        effectiveTo,
        reason,
      }, now, true, commandId, actor.storeId),
      db.prepare("UPDATE stores SET workforce_revision = workforce_revision + 1, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM audit_events WHERE id = ?)")
        .bind(now, actor.storeId, commandId),
    ]);
  } catch (cause) {
    if (cause instanceof Error && /rate_history_overlap/i.test(cause.message)) {
      throw new ApplicationError("Khoảng đơn giá bị chồng với lịch sử hiện có.", 409, "rate_history_overlap");
    }
    throw cause;
  }
  if (!result[0].meta.changes) throw new ApplicationError("Lịch sử đơn giá vừa được cập nhật. Hãy tải lại.", 409, "payroll_conflict");
  return { restored: true, id, replayed: false };
}

function text(value: unknown, min: number, max: number, message: string) {
  if (typeof value !== "string") throw new ApplicationError(message, 400, "invalid_input");
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new ApplicationError(message, 400, "invalid_input");
  return normalized;
}

function timestamp(value: unknown, message: string) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new ApplicationError(message, 400, "invalid_timestamp");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ApplicationError(message, 400, "invalid_timestamp");
  return parsed.toISOString();
}
