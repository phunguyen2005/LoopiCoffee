import { PersistentHandoversView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function HandoversPage() {
  requireBusinessUser(await getLoopiUser("/app/handovers"));
  return <PersistentHandoversView />;
}
