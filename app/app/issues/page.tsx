import { PersistentIssuesView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export default async function IssuesPage() {
  const user = await getLoopiUser("/app/issues");
  return <PersistentIssuesView canManage={user.role !== "employee"} />;
}
