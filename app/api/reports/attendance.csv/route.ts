import { ensureDatabase } from "@/db/runtime";
import { loadPayrollReport } from "@/lib/payroll-report";
import { apiHandler } from "@/platform/http/errors";
import { requireApiUser } from "@/server/auth";

export const GET = apiHandler(async (request: Request) => {
  const auth = await requireApiUser();
  if (!auth.actor) return auth.response;
  const url = new URL(request.url);
  const db = await ensureDatabase();
  const report = await loadPayrollReport(db, {
    storeId: auth.actor.storeId,
    actorEmail: auth.actor.email,
    actorRole: auth.actor.role,
    periodKey: url.searchParams.get("period"),
  });

  const rows = [
    ["Nhân viên", "Email", "Chức danh", "Kỳ báo cáo", "Giờ lịch", "Giờ ghi nhận", "Giờ đã duyệt", "Tăng ca", "Đi muộn", "Về sớm", "Ngoại lệ", "Trạng thái"],
    ...report.rows.map((row) => [
      row.displayName,
      row.email,
      row.jobTitle,
      report.period.label,
      row.snapshotComplete === false ? "" : formatMinutes(row.scheduledMinutes),
      row.snapshotComplete === false ? "" : formatMinutes(row.recordedMinutes),
      formatMinutes(row.approvedMinutes),
      formatMinutes(row.overtimeMinutes),
      row.snapshotComplete === false ? "" : String(row.lateCount),
      row.snapshotComplete === false ? "" : String(row.earlyLeaveCount),
      row.snapshotComplete === false ? "" : String(row.exceptionCount),
      statusLabel(row.status),
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="loopicafe-attendance-${report.period.key}.csv"`,
      "cache-control": "private, no-store",
    },
  });
});

function formatMinutes(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function statusLabel(status: string) {
  if (status === "paid") return "Đã thanh toán";
  if (status === "payroll_finalized") return "Đã chốt lương";
  if (status === "attendance_approved") return "Đã duyệt công";
  if (status === "exception") return "Có ngoại lệ";
  return "Chưa kiểm tra";
}

export function sanitizeCsvCell(value: string): string {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trimStart();
  if (/^[=+\-@\t\r]/.test(value) || /^[=+\-@]/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsv(value: string) {
  const sanitized = sanitizeCsvCell(value);
  return `"${sanitized.replaceAll('"', '""')}"`;
}
