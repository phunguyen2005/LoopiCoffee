import { ScheduleManagerView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export default async function SchedulePage() {
  const user = await getLoopiUser("/app/schedule");
  return <ScheduleManagerView canManage={user.role !== "employee"} />;
}
