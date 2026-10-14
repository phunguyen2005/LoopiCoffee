import type { AccessActor } from "../../people/domain/access.ts";
import { ApplicationError } from "../../../platform/http/errors.ts";
import { auditStatement } from "../../../server/audit.ts";

export async function withdrawRequest(db: D1Database, actor: AccessActor, requestId: string) {
  if (!requestId || typeof requestId !== "string") {
    throw new ApplicationError("Chưa chọn yêu cầu cần rút.", 400);
  }

  const req = await db.prepare(
    "SELECT id, store_id, employee_email, status, title, type FROM requests WHERE id = ? AND store_id = ?"
  ).bind(requestId, actor.storeId).first<{
    id: string; store_id: string; employee_email: string; status: string; title: string; type: string;
  }>();

  if (!req) {
    throw new ApplicationError("Yêu cầu không tồn tại.", 404, "not_found");
  }

  // DEC-003: Only requester can withdraw
  if (actor.email.trim().toLowerCase() !== req.employee_email.trim().toLowerCase()) {
    throw new ApplicationError("Chỉ người tạo yêu cầu mới có quyền rút yêu cầu.", 403, "forbidden");
  }

  // DEC-003: Can only withdraw if still pending
  if (req.status !== "pending") {
    throw new ApplicationError("Yêu cầu không còn ở trạng thái chờ duyệt.", 409, "request_conflict");
  }

  const now = new Date().toISOString();
  const commandId = crypto.randomUUID();

  const results = await db.batch([
    db.prepare("UPDATE requests SET status = 'withdrawn' WHERE id = ? AND store_id = ? AND status = 'pending'").bind(requestId, actor.storeId),
    auditStatement(db, actor.email, "request", requestId, "request.withdrawn", { type: req.type }, now, true, commandId),
    db.prepare("INSERT INTO notifications (id, recipient_email, type, title, entity_href, created_at) VALUES (?, ?, 'request_withdrawn', ?, '/app/requests', ?)").bind(crypto.randomUUID(), actor.email, `Bạn đã rút yêu cầu: ${req.title}`, now),
  ]);

  if (!results[0].meta.changes) {
    throw new ApplicationError("Yêu cầu không còn ở trạng thái chờ duyệt.", 409, "request_conflict");
  }

  return { withdrawn: true, id: requestId, status: "withdrawn" };
}
