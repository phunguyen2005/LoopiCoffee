import { AdminAccountsView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function AdminAccountsPage() {
  const user = await getLoopiUser("/app/admin/accounts");
  if (user.role !== "owner") redirect("/app");
  return <AdminAccountsView />;
}
