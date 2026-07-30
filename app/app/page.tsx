import { OperationsDashboardView, EmployeeTodayView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export default async function DashboardPage() {
  const user = await getLoopiUser("/app");
  if (user.role === "employee") {
    return <EmployeeTodayView />;
  }
  return <OperationsDashboardView />;
}
