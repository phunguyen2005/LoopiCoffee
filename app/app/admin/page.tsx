import { AdminDashboardView } from "@/components/admin-dashboard-view";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const user = await getLoopiUser("/app/admin");
  if (user.role !== "system_admin") redirect("/app");
  return <AdminDashboardView />;
}

