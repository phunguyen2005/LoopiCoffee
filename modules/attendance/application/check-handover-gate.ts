import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export interface HandoverGateOptions {
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
    `SELECT id, author_email, created_at
     FROM handovers
     WHERE store_id = ? AND acknowledged_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(storeId).first<{ id: string; author_email: string; created_at: string }>();

  // If no unacknowledged handover exists in the store, first shift / clean shift proceeds freely
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
