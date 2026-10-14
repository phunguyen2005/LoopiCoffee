import { ScheduleManagerView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function SchedulePage() {
  const user = requireBusinessUser(await getLoopiUser("/app/schedule"));
  return <ScheduleManagerView canManage={user.role === "owner" || user.role === "manager"} />;
}
