import { PersistedProfileView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export default async function ProfilePage() {
  const user = await getLoopiUser("/app/profile");
  return <PersistedProfileView initialUser={user} />;
}
