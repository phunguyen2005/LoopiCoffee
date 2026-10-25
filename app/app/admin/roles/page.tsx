import { RbacView } from "@/components/rbac-view";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function RolesPage() {
  const user = await getLoopiUser("/app/admin/roles");
  if (user.role !== "system_admin") redirect("/app");
  return <RbacView />;
}

