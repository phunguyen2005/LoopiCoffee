import { OwnerOrdersView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OwnerOrdersPage() {
  const user = await getLoopiUser("/app/orders");
  if (!user.permissions.includes("orders.read")) redirect("/app");
  return <OwnerOrdersView permissions={user.permissions} />;
}
