import { PersistentIssuesView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function IssuesPage() {
  const user = requireBusinessUser(await getLoopiUser("/app/issues"));
  return <PersistentIssuesView canManage={user.permissions.includes("incidents.transition")} />;
}
