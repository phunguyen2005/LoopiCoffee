import { PersistentRequestsView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export default async function RequestsPage() {
  const user = await getLoopiUser("/app/requests");
  return <PersistentRequestsView canApprove={user.role !== "employee"} />;
}
