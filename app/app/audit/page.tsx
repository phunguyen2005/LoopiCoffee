import { AuditView } from "@/components/system-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function AuditPage() {
  const user = await getLoopiUser("/app/audit");
  if (user.role !== "owner" && user.role !== "system_admin") redirect("/app");
  return <AuditView />;
}
