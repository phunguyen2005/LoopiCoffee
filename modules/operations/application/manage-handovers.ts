import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export interface AcknowledgeHandoverResult {
  success: boolean;
  handoverId: string;
  acknowledgedAt: string;
  alreadyAcknowledged?: boolean;
}

export async function acknowledgeHandover(
  db: D1Database,
  actor: { email: string; storeId: string; role?: string },
  handoverId: string,
  acknowledgedAt: string = new Date().toISOString(),
): Promise<AcknowledgeHandoverResult> {
  const handover = await db.prepare(
    "SELECT id, store_id, acknowledged_at FROM handovers WHERE id = ? AND store_id = ?",
  ).bind(handoverId, actor.storeId).first<{
    id: string;
    store_id: string;
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

  await db.batch([
    db.prepare(
      "UPDATE handovers SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL",
    ).bind(acknowledgedAt, handoverId),
    auditStatement(
      db,
      actor.email,
      "handover",
      handoverId,
      "handover.acknowledged",
      {},
      acknowledgedAt,
    ),
  ]);

  return {
    success: true,
    handoverId,
    acknowledgedAt,
  };
}
