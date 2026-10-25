import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";
import { hasGrantedPermission } from "../../people/domain/permissions.ts";
import type { AccessActor } from "../../people/domain/access.ts";

export interface AcknowledgeHandoverResult {
  success: boolean;
  handoverId: string;
  acknowledgedAt: string;
  alreadyAcknowledged?: boolean;
}

export async function acknowledgeHandover(
  db: D1Database,
  actor: AccessActor,
  handoverId: string,
  acknowledgedAt: string = new Date().toISOString(),
): Promise<AcknowledgeHandoverResult> {
  const handover = await db.prepare(
    `SELECT h.id, h.store_id, h.receiver_employee_id, h.next_shift_id, h.acknowledged_at,
            next_shift.employee_email AS next_shift_employee_email
     FROM handovers h
     LEFT JOIN shifts next_shift ON next_shift.id = h.next_shift_id AND next_shift.store_id = h.store_id
     WHERE h.id = ? AND h.store_id = ?`,
  ).bind(handoverId, actor.storeId).first<{
    id: string;
    store_id: string;
    receiver_employee_id: string | null;
    next_shift_id: string | null;
    next_shift_employee_email: string | null;
    acknowledged_at: string | null;
  }>();

  if (!handover) {
    throw new ApplicationError("Bản bàn giao ca không tồn tại.", 404, "handover_not_found");
  }

  if (handover.acknowledged_at) {
    return {
      success: true,
      handoverId: handover.id,
      acknowledgedAt: handover.acknowledged_at,
      alreadyAcknowledged: true,
    };
  }

  const isReceiver = handover.receiver_employee_id === actor.id
    || handover.next_shift_employee_email?.toLowerCase() === actor.email.toLowerCase();
  const isLegacyManagedHandover = !handover.receiver_employee_id
    && !handover.next_shift_id
    && hasGrantedPermission(actor, "handovers.manage");
  if (!isReceiver && !isLegacyManagedHandover) {
    throw new ApplicationError(
      "Bản bàn giao này được gửi cho người hoặc ca khác.",
      403,
      "handover_receiver_mismatch",
    );
  }

  await db.batch([
    db.prepare(
      "UPDATE handovers SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ? AND acknowledged_at IS NULL",
    ).bind(acknowledgedAt, actor.email, handoverId),
    auditStatement(
      db,
      actor.email,
      "handover",
      handoverId,
      "handover.acknowledged",
      { receiverEmployeeId: handover.receiver_employee_id, nextShiftId: handover.next_shift_id },
      acknowledgedAt,
    ),
  ]);

  return {
    success: true,
    handoverId,
    acknowledgedAt,
  };
}
