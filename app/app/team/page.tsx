import { PersistentTeamView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function TeamPage() {
  const user = await getLoopiUser("/app/team");
  if (user.role === "employee") redirect("/app");
  return <PersistentTeamView />;
}
