import { OperationsDashboardView, EmployeeTodayView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const user = await getLoopiUser("/app");
  if (user.role === "system_admin") {
    redirect("/app/admin");
  }
  if (user.permissions.includes("dashboard.read")) {
    return <OperationsDashboardView />;
  }
  if (user.role === "employee" || user.role === "team_lead") {
    return <EmployeeTodayView />;
  }
  redirect("/app/profile");
}
