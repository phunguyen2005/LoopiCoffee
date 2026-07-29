import { ensureDatabase } from "@/db/runtime";
import { requireApiUser } from "@/server/auth";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const url = new URL(request.url);
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = validDate(url.searchParams.get("from")) ?? defaultFrom;
  const to = validDate(url.searchParams.get("to")) ?? now;
  if (to < from || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return Response.json({ error: "Khoảng báo cáo không hợp lệ." }, { status: 400 });
  }

  const db = await ensureDatabase();
  const ownOnly = auth.actor.role === "employee" ? "AND s.employee_email = ?" : "";
  const statement = db.prepare(
    `SELECT s.employee_email, COALESCE(emp.display_name, s.employee_email) AS display_name,
            COUNT(DISTINCT s.id) AS shift_count,
            COALESCE(SUM(s.worked_minutes), 0) AS worked_minutes,
            SUM(CASE WHEN e.verification_results LIKE '%"late"%' THEN 1 ELSE 0 END) AS late_count,
            SUM(CASE WHEN e.review_required = 1 THEN 1 ELSE 0 END) AS exception_count
     FROM attendance_sessions s
     LEFT JOIN employees emp ON lower(emp.email) = lower(s.employee_email)
     LEFT JOIN attendance_events e ON e.session_id = s.id
     WHERE s.store_id = ? AND COALESCE(s.opened_at, s.closed_at) BETWEEN ? AND ? ${ownOnly}
     GROUP BY s.employee_email, emp.display_name ORDER BY display_name`,
  );
  const params = [
    auth.actor.storeId,
    from.toISOString(),
    to.toISOString(),
    ...(auth.actor.role === "employee" ? [auth.actor.email] : []),
  ];
  const result = await statement.bind(...params).all<{
    display_name: string;
    shift_count: number;
    worked_minutes: number;
    late_count: number;
    exception_count: number;
  }>();

  const period = `${formatDate(from)}–${formatDate(to)}`;
  const rows = [
    ["Nhân viên", "Kỳ báo cáo", "Số ca", "Giờ công chính xác", "Đi trễ", "Ngoại lệ"],
    ...result.results.map((row) => [
      row.display_name,
      period,
      String(row.shift_count),
      formatMinutes(row.worked_minutes),
      String(row.late_count),
      String(row.exception_count),
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="loopicafe-attendance-${formatIsoDate(to)}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatIsoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
