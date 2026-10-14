import { PersistentIssuesView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function IssuesPage() {
  const user = requireBusinessUser(await getLoopiUser("/app/issues"));
  return <PersistentIssuesView canManage={["owner", "manager", "team_lead"].includes(user.role)} />;
}
