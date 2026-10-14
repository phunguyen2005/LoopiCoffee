import { PersistentRequestsView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function RequestsPage() {
  const user = requireBusinessUser(await getLoopiUser("/app/requests"));
  return <PersistentRequestsView approvalScope={user.role === "team_lead" ? "swap_only" : ["owner", "manager"].includes(user.role) ? "all" : "none"} />;
}
