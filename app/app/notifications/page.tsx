import { NotificationsView } from "@/components/system-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function NotificationsPage() {
  requireBusinessUser(await getLoopiUser("/app/notifications"));
  return <NotificationsView />;
}
