import { getApiUser } from "@/server/auth";

export async function GET() {
  const user = await getApiUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const rows = [
    ["Nhân viên", "Kỳ báo cáo", "Số ca", "Giờ công chính xác", "Đi trễ", "Ngoại lệ"],
    ["Trần Gia Hân", "21/07/2026–27/07/2026", "5", "42:16", "0", "0"],
    ["Phạm Minh Khoa", "21/07/2026–27/07/2026", "5", "38:02", "0", "1"],
    ["Lê Thảo Vy", "21/07/2026–27/07/2026", "4", "35:47", "2", "0"],
    ["Nguyễn Quốc Bảo", "21/07/2026–27/07/2026", "4", "31:28", "0", "0"],
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="loopicafe-attendance-2026-07-27.csv"',
      "cache-control": "private, no-store",
    },
  });
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
