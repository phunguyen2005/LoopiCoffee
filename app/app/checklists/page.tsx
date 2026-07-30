import { PersistentChecklistsView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export default async function ChecklistsPage() {
  const user = await getLoopiUser("/app/checklists");
  return <PersistentChecklistsView canManage={user.role !== "employee"} />;
}
