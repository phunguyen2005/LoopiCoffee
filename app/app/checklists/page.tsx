import { PersistentChecklistsView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function ChecklistsPage() {
  const user = requireBusinessUser(await getLoopiUser("/app/checklists"));
  return <PersistentChecklistsView canManage={["owner", "manager", "team_lead"].includes(user.role)} />;
}
