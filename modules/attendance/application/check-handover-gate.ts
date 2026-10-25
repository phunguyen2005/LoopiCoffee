import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export interface HandoverGateOptions {
  shiftId?: string | null;
  bypass?: boolean;
  bypassReason?: string;
  bypassActor?: { email: string; role: string; storeId: string };
  now?: string;
}

export interface HandoverGateResult {
  allowed: boolean;
  code?: string;
  message?: string;
  handoverId?: string;
  firstShift?: boolean;
  bypassed?: boolean;
}

export async function checkHandoverGate(
  db: D1Database,
  storeId: string,
  employeeEmail: string,
  options?: HandoverGateOptions,
): Promise<HandoverGateResult> {
  const unacknowledged = await db.prepare(
    `SELECT h.id, h.author_email, h.created_at
     FROM handovers h
     LEFT JOIN employees receiver ON receiver.id = h.receiver_employee_id AND receiver.store_id = h.store_id
     WHERE h.store_id = ? AND h.acknowledged_at IS NULL
       AND (lower(receiver.email) = lower(?) OR h.next_shift_id = ?)
     ORDER BY h.created_at DESC LIMIT 1`,
  ).bind(storeId, employeeEmail, options?.shiftId ?? "").first<{ id: string; author_email: string; created_at: string }>();

  // Chỉ bàn giao nhắm đúng người hoặc đúng ca mới chặn check-in.
  if (!unacknowledged) {
    return { allowed: true, firstShift: true };
  }

  // Preceding handover exists and is unacknowledged
  if (options?.bypass) {
    const actor = options.bypassActor;
    if (!actor || !["owner", "manager"].includes(actor.role)) {
      throw new ApplicationError(
        "Chỉ Quản lý hoặc Chủ quán mới có quyền bypass bàn giao ca.",
        403,
        "manager_bypass_forbidden",
      );
    }

    const reason = options.bypassReason?.trim();
    if (!reason || reason.length < 5) {
      throw new ApplicationError(
        "Lý do bypass bàn giao cần ít nhất 5 ký tự.",
        400,
        "bypass_reason_required",
      );
    }

    const now = options.now ?? new Date().toISOString();
    await db.batch([
      auditStatement(
        db,
        actor.email,
        "handover",
        unacknowledged.id,
        "handover.emergency_bypass",
        {
          bypassReason: reason,
          targetEmployeeEmail: employeeEmail,
          targetShiftId: options.shiftId ?? null,
          managerEmail: actor.email,
        },
        now,
      ),
    ]);

    return {
      allowed: true,
      bypassed: true,
      handoverId: unacknowledged.id,
    };
  }

  return {
    allowed: false,
    code: "handover_acknowledgment_required",
    message: "Bàn giao ca trước chưa được xác nhận.",
    handoverId: unacknowledged.id,
  };
}
