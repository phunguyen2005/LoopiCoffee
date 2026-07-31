import { ensureDatabase } from "@/db/runtime";
import { loadPayrollReport, resolvePayrollPeriod } from "@/lib/payroll-report";
import { auditStatement, requireApiUser } from "@/server/auth";

export async function POST(request: Request) {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "finalize" | "reopen";
    period?: string;
  };
  if (body.action !== "finalize" && body.action !== "reopen") {
    return Response.json({ error: "Thao tác kỳ lương không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const period = resolvePayrollPeriod(body.period);
  const existing = await db.prepare(
    `SELECT id, status FROM payroll_periods
     WHERE store_id = ? AND period_start = ? AND period_end = ? LIMIT 1`,
  ).bind(auth.actor.storeId, period.startIso, period.endExclusiveIso).first<{
    id: string;
    status: "reviewing" | "finalized" | "paid";
  }>();
  const now = new Date().toISOString();

  if (body.action === "reopen") {
    if (auth.actor.role !== "owner" && auth.actor.role !== "system_admin") {
      return Response.json({ error: "Chỉ Chủ quán mới có thể mở lại kỳ lương." }, { status: 403 });
    }
    if (!existing || existing.status === "reviewing") {
      return Response.json({ error: "Kỳ lương này đang ở trạng thái kiểm tra." }, { status: 409 });
    }
    if (existing.status === "paid") {
      return Response.json({ error: "Kỳ lương đã thanh toán không thể mở lại trực tiếp." }, { status: 409 });
    }
    await db.batch([
      db.prepare(
        `UPDATE payroll_periods
         SET status = 'reviewing', reopened_by = ?, reopened_at = ?, updated_at = ? WHERE id = ?`,
      ).bind(auth.actor.email, now, now, existing.id),
      auditStatement(db, auth.actor.email, "payroll_period", existing.id, "payroll.reopened", { period: period.key }, now),
    ]);
    return Response.json({ updated: true, status: "reviewing" });
  }

  if (existing?.status === "paid" || existing?.status === "finalized") {
    return Response.json({ error: "Kỳ lương đã được khóa. Hãy mở lại kỳ trước khi chốt lại." }, { status: 409 });
  }

  const report = await loadPayrollReport(db, {
    storeId: auth.actor.storeId,
    actorEmail: auth.actor.email,
    actorRole: auth.actor.role,
    periodKey: period.key,
  });
  const payrollRows = report.rows.filter((row) => row.includeInPayroll);
  const unresolved = payrollRows.filter((row) => row.pendingExceptionCount > 0);
  if (unresolved.length > 0) {
    return Response.json({
      error: `Còn ${unresolved.length} nhân viên có ngoại lệ chưa xử lý. Không thể chốt kỳ lương.`,
      employeeEmails: unresolved.map((row) => row.email),
    }, { status: 409 });
  }
  if (payrollRows.length === 0) {
    return Response.json({ error: "Kỳ này chưa có nhân viên đủ điều kiện tính lương." }, { status: 409 });
  }

  const periodId = existing?.id ?? crypto.randomUUID();
  const statements = [
    db.prepare(
      `INSERT INTO payroll_periods
        (id, store_id, period_start, period_end, status, finalized_by, finalized_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'finalized', ?, ?, ?, ?)
       ON CONFLICT(store_id, period_start, period_end) DO UPDATE SET
         status = 'finalized', finalized_by = excluded.finalized_by,
         finalized_at = excluded.finalized_at, updated_at = excluded.updated_at`,
    ).bind(
      periodId,
      auth.actor.storeId,
      period.startIso,
      period.endExclusiveIso,
      auth.actor.email,
      now,
      now,
      now,
    ),
    ...payrollRows.map((row) => db.prepare(
      `INSERT INTO payroll_entries
        (id, payroll_period_id, employee_email, approved_minutes, overtime_minutes,
         allowance_amount, bonus_amount, deduction_amount, total_amount, status, locked_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'payroll_finalized', ?, ?)
       ON CONFLICT(payroll_period_id, employee_email) DO UPDATE SET
         approved_minutes = excluded.approved_minutes,
         overtime_minutes = excluded.overtime_minutes,
         allowance_amount = excluded.allowance_amount,
         bonus_amount = excluded.bonus_amount,
         deduction_amount = excluded.deduction_amount,
         total_amount = excluded.total_amount,
         status = 'payroll_finalized', locked_at = excluded.locked_at, updated_at = excluded.updated_at`,
    ).bind(
      crypto.randomUUID(),
      periodId,
      row.email,
      row.approvedMinutes,
      row.overtimeMinutes,
      row.allowanceAmount,
      row.bonusAmount,
      row.deductionAmount,
      row.totalSalary,
      now,
      now,
    )),
    auditStatement(
      db,
      auth.actor.email,
      "payroll_period",
      periodId,
      "payroll.finalized",
      { period: period.key, employeeCount: payrollRows.length },
      now,
    ),
  ];
  await db.batch(statements);
  return Response.json({ updated: true, status: "finalized", employeeCount: payrollRows.length });
}
