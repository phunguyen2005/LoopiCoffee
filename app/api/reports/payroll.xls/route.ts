import { ensureDatabase } from "@/db/runtime";
import { loadPayrollReport } from "@/lib/payroll-report";
import { requireApiUser } from "@/server/auth";

export async function GET(request: Request) {
  const auth = await requireApiUser(["owner", "manager"]);
  if (!auth.actor) return auth.response;
  const url = new URL(request.url);
  const db = await ensureDatabase();
  const report = await loadPayrollReport(db, {
    storeId: auth.actor.storeId,
    actorEmail: auth.actor.email,
    actorRole: auth.actor.role,
    periodKey: url.searchParams.get("period"),
  });
  const rows = report.rows.filter((row) => row.includeInPayroll && row.hasPayrollData);
  const header = ["Nhân viên", "Email", "Chức danh", "Giờ đã duyệt", "Tăng ca", "Đơn giá", "Lương giờ", "Phụ cấp", "Thưởng", "Khấu trừ", "Thực nhận", "Trạng thái"];
  const workbookRows = [
    header.map((value) => cell(value, "Header")),
    ...rows.map((row) => [
      cell(row.displayName),
      cell(row.email),
      cell(row.jobTitle),
      cell(minutesLabel(row.approvedMinutes)),
      cell(minutesLabel(row.overtimeMinutes)),
      numberCell(row.hourlyRate),
      numberCell(row.baseSalary + row.overtimePay),
      numberCell(row.allowanceAmount),
      numberCell(row.bonusAmount),
      numberCell(row.deductionAmount),
      numberCell(row.totalSalary),
      cell(statusLabel(row.status)),
    ]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Segoe UI" ss:Size="10"/></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6F2939" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Money"><NumberFormat ss:Format="#,##0 [$₫-42A]"/><Alignment ss:Horizontal="Right"/></Style>
 </Styles>
 <Worksheet ss:Name="Bảng lương ${escapeXml(report.period.key)}">
  <Table>
   <Row><Cell ss:MergeAcross="11"><Data ss:Type="String">${escapeXml(`${report.storeName} — Kỳ lương ${report.period.label}`)}</Data></Cell></Row>
   ${workbookRows.map((row) => `<Row>${row.join("")}</Row>`).join("\n   ")}
  </Table>
 </Worksheet>
</Workbook>`;
  return new Response(xml, {
    headers: {
      "content-type": "application/vnd.ms-excel; charset=utf-8",
      "content-disposition": `attachment; filename="loopicafe-payroll-${report.period.key}.xls"`,
      "cache-control": "private, no-store",
    },
  });
}

function cell(value: string, style?: string) {
  return `<Cell${style ? ` ss:StyleID="${style}"` : ""}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function numberCell(value: number) {
  return `<Cell ss:StyleID="Money"><Data ss:Type="Number">${Math.round(value)}</Data></Cell>`;
}

function minutesLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function statusLabel(status: string) {
  if (status === "paid") return "Đã thanh toán";
  if (status === "payroll_finalized") return "Đã chốt lương";
  if (status === "attendance_approved") return "Đã duyệt công";
  if (status === "exception") return "Có ngoại lệ";
  return "Chưa kiểm tra";
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
