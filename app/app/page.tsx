import { OperationsDashboardView, EmployeeTodayView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const user = await getLoopiUser("/app");
  if (user.role === "employee") {
    return <EmployeeTodayView />;
  }
  return <OperationsDashboardView />;
}
