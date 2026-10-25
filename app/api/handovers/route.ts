import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";
import { businessDate } from "@/modules/operations/domain/business-day";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ShiftRow = { id: string; starts_at: string; ends_at: string; employee_email: string; role_label: string };

async function payloadHash(summary: string, managerAttention: boolean, shiftId: string, receiverEmployeeId: string | null, nextShiftId: string | null) {
  const bytes = new TextEncoder().encode(JSON.stringify({ summary, managerAttention, shiftId, receiverEmployeeId, nextShiftId }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentShiftFor(db: D1Database, storeId: string, email: string, now = new Date()) {
  const before = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
  const after = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();
  return db.prepare(
    `SELECT id, starts_at, ends_at, employee_email, role_label FROM shifts
     WHERE store_id = ? AND lower(employee_email) = lower(?)
       AND status IN ('published', 'completed') AND approved_leave_request_id IS NULL
       AND starts_at <= ? AND ends_at >= ?
     ORDER BY ABS(julianday(starts_at) - julianday(?)) LIMIT 1`,
  ).bind(storeId, email, after, before, now.toISOString()).first<ShiftRow>();
}

export const GET = apiHandler(async () => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const now = new Date();
  const currentShift = await currentShiftFor(db, auth.actor.storeId, auth.actor.email, now);
  const shiftDate = currentShift ? businessDate(new Date(currentShift.starts_at)) : businessDate(now);
  const canManageAll = auth.actor.role === "owner"
    || auth.actor.permissions?.includes("handovers.manage") === true;
  const [handoversResult, nextShiftsResult, unfinishedResult] = await db.batch([
    db.prepare(
      `SELECT h.id, h.summary, h.manager_attention, h.shift_id, h.receiver_employee_id, h.next_shift_id,
              h.acknowledged_at, h.acknowledged_by, h.created_at,
              COALESCE(author.display_name, h.author_email) AS author_name,
              COALESCE(receiver.display_name, next_employee.display_name, next_shift.employee_email) AS receiver_name,
              next_shift.starts_at AS next_shift_starts_at, next_shift.employee_email AS next_shift_employee_email
       FROM handovers h
       LEFT JOIN employees author ON author.store_id = h.store_id AND lower(author.email) = lower(h.author_email)
       LEFT JOIN employees receiver ON receiver.id = h.receiver_employee_id AND receiver.store_id = h.store_id
       LEFT JOIN shifts next_shift ON next_shift.id = h.next_shift_id AND next_shift.store_id = h.store_id
       LEFT JOIN employees next_employee ON next_employee.store_id = h.store_id AND lower(next_employee.email) = lower(next_shift.employee_email)
       WHERE h.store_id = ? AND (
         ? = 1 OR lower(h.author_email) = lower(?) OR h.receiver_employee_id = ?
         OR lower(next_shift.employee_email) = lower(?)
       )
       ORDER BY h.created_at DESC LIMIT 30`,
    ).bind(auth.actor.storeId, canManageAll ? 1 : 0, auth.actor.email, auth.actor.id, auth.actor.email),
    db.prepare(
      `SELECT s.id, s.starts_at, s.ends_at, s.role_label, e.id AS employee_id,
              COALESCE(e.display_name, s.employee_email) AS employee_name
       FROM shifts s JOIN employees e ON e.store_id = s.store_id AND lower(e.email) = lower(s.employee_email)
       WHERE s.store_id = ? AND s.status = 'published' AND s.approved_leave_request_id IS NULL
         AND s.id <> ? AND s.starts_at >= ?
       ORDER BY s.starts_at ASC LIMIT 20`,
    ).bind(auth.actor.storeId, currentShift?.id ?? "", currentShift?.starts_at ?? now.toISOString()),
    db.prepare(
      `SELECT i.id, i.label, i.assignee, i.required
       FROM checklist_items i
       LEFT JOIN checklist_executions x ON x.item_id = i.id AND x.business_date = ?
       WHERE i.store_id = ? AND i.routine_type = 'shift_routine' AND i.shift_id = ?
         AND COALESCE(x.completed, 0) = 0
       ORDER BY i.required DESC, i.id`,
    ).bind(shiftDate, auth.actor.storeId, currentShift?.id ?? ""),
  ]);
  return Response.json({
    handovers: handoversResult.results.map((row) => {
      const item = row as Record<string, unknown>;
      const legacyManage = !item.receiver_employee_id && !item.next_shift_id && canManageAll;
      return {
        ...item,
        can_acknowledge: item.receiver_employee_id === auth.actor.id
          || String(item.next_shift_employee_email ?? "").toLowerCase() === auth.actor.email.toLowerCase()
          || legacyManage,
      };
    }),
    currentShift: currentShift ?? null,
    nextShifts: nextShiftsResult.results,
    unfinishedShiftItems: unfinishedResult.results,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, {
    summary: "string", managerAttention: "boolean", idempotencyKey: "string", shiftId: "string",
    receiverEmployeeId: "string", nextShiftId: "string",
  })) as {
    summary?: string; managerAttention?: boolean; idempotencyKey?: string; shiftId?: string;
    receiverEmployeeId?: string; nextShiftId?: string;
  };
  const summary = body.summary?.trim();
  const shiftId = body.shiftId?.trim();
  const receiverEmployeeId = body.receiverEmployeeId?.trim() || null;
  const nextShiftId = body.nextShiftId?.trim() || null;
  if (!summary || summary.length < 10) return Response.json({ error: "Nội dung bàn giao cần ít nhất 10 ký tự." }, { status: 400 });
  if (summary.length > 2000) return Response.json({ error: "Nội dung bàn giao tối đa 2.000 ký tự." }, { status: 400 });
  if (!shiftId || (!receiverEmployeeId && !nextShiftId)) {
    return Response.json({ error: "Hãy chọn ca đang bàn giao và người hoặc ca nhận." }, { status: 400 });
  }
  if (!body.idempotencyKey || !UUID_PATTERN.test(body.idempotencyKey)) {
    throw new ApplicationError("Thiếu mã gửi bàn giao hợp lệ.", 400, "invalid_idempotency_key");
  }
  const db = await ensureDatabase();
  const shift = await db.prepare(
    `SELECT id, starts_at, ends_at, employee_email, role_label FROM shifts
     WHERE id = ? AND store_id = ? AND lower(employee_email) = lower(?)
       AND status IN ('published', 'completed')`,
  ).bind(shiftId, auth.actor.storeId, auth.actor.email).first<ShiftRow>();
  if (!shift) return Response.json({ error: "Bạn chỉ có thể bàn giao ca được phân công cho mình." }, { status: 403 });

  let resolvedReceiverId = receiverEmployeeId;
  if (nextShiftId) {
    const target = await db.prepare(
      `SELECT s.id, e.id AS employee_id FROM shifts s
       JOIN employees e ON e.store_id = s.store_id AND lower(e.email) = lower(s.employee_email)
       WHERE s.id = ? AND s.store_id = ? AND s.id <> ? AND s.starts_at >= ?
         AND s.status = 'published' AND s.approved_leave_request_id IS NULL`,
    ).bind(nextShiftId, auth.actor.storeId, shift.id, shift.starts_at).first<{ id: string; employee_id: string }>();
    if (!target || (receiverEmployeeId && target.employee_id !== receiverEmployeeId)) {
      return Response.json({ error: "Ca nhận hoặc người nhận không còn hợp lệ." }, { status: 409 });
    }
    resolvedReceiverId = target.employee_id;
  } else {
    const receiver = await db.prepare(
      "SELECT id FROM employees WHERE id = ? AND store_id = ? AND status = 'active'",
    ).bind(receiverEmployeeId, auth.actor.storeId).first();
    if (!receiver) return Response.json({ error: "Người nhận không còn hoạt động trong cửa hàng." }, { status: 409 });
  }

  const managerAttention = Boolean(body.managerAttention);
  const hash = await payloadHash(summary, managerAttention, shiftId, resolvedReceiverId, nextShiftId);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const findReplay = () => db.prepare(
    `SELECT id, summary, manager_attention, shift_id, receiver_employee_id, next_shift_id, created_at, payload_hash
     FROM handovers WHERE store_id = ? AND lower(author_email) = lower(?) AND client_request_key = ?`,
  ).bind(auth.actor.storeId, auth.actor.email, body.idempotencyKey).first<{
    id: string; summary: string; manager_attention: number; shift_id: string; receiver_employee_id: string | null;
    next_shift_id: string | null; created_at: string; payload_hash: string | null;
  }>();
  const replay = await findReplay();
  if (replay) {
    if (replay.payload_hash !== hash) throw new ApplicationError("Mã gửi bàn giao đã được dùng cho nội dung khác.", 409, "idempotency_conflict");
    return Response.json({ handover: { ...replay, author_name: auth.actor.displayName }, replayed: true });
  }
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO handovers
          (id, store_id, author_email, summary, manager_attention, shift_id, receiver_employee_id, next_shift_id,
           client_request_key, payload_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, auth.actor.storeId, auth.actor.email, summary, managerAttention ? 1 : 0, shiftId, resolvedReceiverId, nextShiftId, body.idempotencyKey, hash, now),
      auditStatement(db, auth.actor.email, "handover", id, "handover.created", {
        managerAttention, shiftId, receiverEmployeeId: resolvedReceiverId, nextShiftId,
      }, now),
    ]);
  } catch (error) {
    const racedReplay = await findReplay();
    if (racedReplay) {
      if (racedReplay.payload_hash !== hash) throw new ApplicationError("Mã gửi bàn giao đã được dùng cho nội dung khác.", 409, "idempotency_conflict");
      return Response.json({ handover: { ...racedReplay, author_name: auth.actor.displayName }, replayed: true });
    }
    throw error;
  }
  return Response.json({
    handover: { id, summary, manager_attention: managerAttention ? 1 : 0, shift_id: shiftId, receiver_employee_id: resolvedReceiverId, next_shift_id: nextShiftId, created_at: now, author_name: auth.actor.displayName },
    replayed: false,
  });
});

export const PATCH = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const body = (await readObject(request, { id: "string", action: "string" })) as { id?: string; action?: string };
  if (!body.id || body.action !== "acknowledge") return Response.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
  const db = await ensureDatabase();
  const { acknowledgeHandover } = await import("@/modules/operations/application/manage-handovers");
  const result = await acknowledgeHandover(db, auth.actor, body.id);
  return Response.json(result);
});
