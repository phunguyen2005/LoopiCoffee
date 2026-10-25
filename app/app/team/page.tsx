import { PersistentTeamView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function TeamPage() {
  const user = await getLoopiUser("/app/team");
  if (!user.permissions.includes("people.read")) redirect("/app");
  return <PersistentTeamView />;
}
