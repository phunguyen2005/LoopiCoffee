import { PayrollReportsView } from "@/components/payroll-reports-view";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function AttendanceReportPage() {
  const user = await getLoopiUser("/app/reports/attendance");
  if (!user.permissions.includes("payroll.read") && !user.permissions.includes("attendance.review")) redirect("/app");
  return <PayrollReportsView />;
}
