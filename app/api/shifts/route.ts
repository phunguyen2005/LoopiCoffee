import { ensureDatabase } from "@/db/runtime";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const db = await ensureDatabase();
  const ownOnly = auth.actor.role === "employee" ? "AND s.employee_email = ?" : "";
  const statement = db.prepare(
    `SELECT s.id, s.employee_email, s.starts_at, s.ends_at, s.role_label,
            s.is_shift_lead, s.status, COALESCE(e.display_name, s.employee_email) AS employee_name
     FROM shifts s LEFT JOIN employees e ON lower(e.email) = lower(s.employee_email)
     WHERE s.store_id = ? ${ownOnly}
     ORDER BY s.starts_at ASC LIMIT 250`,
  );
  const result = auth.actor.role === "employee"
    ? await statement.bind(auth.actor.storeId, auth.actor.email).all()
    : await statement.bind(auth.actor.storeId).all();
  return Response.json({ shifts: result.results });
}

export async function POST(request: Request) {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    employeeEmail?: string;
    startsAt?: string;
    endsAt?: string;
    roleLabel?: string;
    isShiftLead?: boolean;
    // Weekly batch creation fields
    batch?: Array<{
      startsAt: string;
      endsAt: string;
      roleLabel?: string;
      isShiftLead?: boolean;
    }>;
  };

  const db = await ensureDatabase();
  const employeeEmail = body.employeeEmail?.trim().toLowerCase();
  if (!employeeEmail) {
    return Response.json({ error: "Chưa chọn nhân viên." }, { status: 400 });
  }

  const employee = await db.prepare(
    "SELECT id FROM employees WHERE lower(email) = lower(?) AND store_id = ? AND status = 'active'",
  ).bind(employeeEmail, auth.actor.storeId).first();
  if (!employee) {
    return Response.json({ error: "Nhân viên chưa hoạt động trong cửa hàng." }, { status: 404 });
  }

  const shiftsToCreate = body.batch && body.batch.length > 0
    ? body.batch
    : (body.startsAt && body.endsAt ? [{ startsAt: body.startsAt, endsAt: body.endsAt, roleLabel: body.roleLabel, isShiftLead: body.isShiftLead }] : []);

  if (shiftsToCreate.length === 0) {
    return Response.json({ error: "Không có ca làm việc nào hợp lệ được tạo." }, { status: 400 });
  }

  const createdShifts = [];
  const now = new Date().toISOString();

  for (const item of shiftsToCreate) {
    const startsAt = new Date(item.startsAt);
    const endsAt = new Date(item.endsAt);

    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt ||
      endsAt.getTime() - startsAt.getTime() > 24 * 60 * 60 * 1000
    ) {
      continue;
    }

    const overlap = await db.prepare(
      `SELECT id FROM shifts WHERE lower(employee_email) = lower(?) AND store_id = ?
         AND status IN ('draft', 'published') AND starts_at < ? AND ends_at > ? LIMIT 1`,
    ).bind(employeeEmail, auth.actor.storeId, endsAt.toISOString(), startsAt.toISOString()).first();

    if (overlap) {
      continue; // Skip overlapping shift
    }

    const id = crypto.randomUUID();
    const roleLabel = item.roleLabel?.trim().slice(0, 60) || "Nhân viên";
    const isShiftLead = item.isShiftLead ? 1 : 0;

    await db.batch([
      db.prepare(
        `INSERT INTO shifts
          (id, store_id, employee_email, starts_at, ends_at, timezone_snapshot,
           role_label, is_shift_lead, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'Asia/Ho_Chi_Minh', ?, ?, 'published', ?)`,
      ).bind(id, auth.actor.storeId, employeeEmail, startsAt.toISOString(), endsAt.toISOString(), roleLabel, isShiftLead, now),
      db.prepare(
        `INSERT INTO notifications
          (id, recipient_email, type, title, entity_href, created_at)
         VALUES (?, ?, 'shift_published', ?, '/app/schedule', ?)`,
      ).bind(crypto.randomUUID(), employeeEmail, `Ca mới: ${formatShiftTime(startsAt)}–${formatShiftTime(endsAt)}`, now),
      auditStatement(db, auth.actor.email, "shift", id, "shift.published", { employeeEmail }, now),
    ]);

    createdShifts.push({
      id,
      employee_email: employeeEmail,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      role_label: roleLabel,
      status: "published",
    });
  }

  return Response.json({
    message: `Đã xuất bản ${createdShifts.length} ca làm việc cho tuần này.`,
    shifts: createdShifts,
  });
}

function formatShiftTime(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
