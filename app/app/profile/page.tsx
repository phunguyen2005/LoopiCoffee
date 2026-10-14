import { PersistedProfileView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function ProfilePage() {
  const user = requireBusinessUser(await getLoopiUser("/app/profile"));
  return <PersistedProfileView initialUser={user} />;
}
