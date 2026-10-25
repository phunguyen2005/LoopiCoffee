import { PersistentChecklistsView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function ChecklistsPage() {
  const user = requireBusinessUser(await getLoopiUser("/app/checklists"));
  return (
    <PersistentChecklistsView
      canManage={user.permissions.includes("checklists.manage") || user.role === "owner" || user.role === "manager"}
      userRole={user.role}
      userEmail={user.email}
      userName={user.displayName}
    />
  );
}
