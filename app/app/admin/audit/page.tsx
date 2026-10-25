import { AdminAuditView } from "@/components/admin-audit-view";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function AdminAuditPage() {
  const user = await getLoopiUser("/app/admin/audit");
  if (user.role !== "system_admin") redirect("/app");
  return <AdminAuditView />;
}
