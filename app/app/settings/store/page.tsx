import { PersistentStoreSettingsView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function StoreSettingsPage() {
  const user = await getLoopiUser("/app/settings/store");
  if (user.role !== "owner") redirect("/app");
  return <PersistentStoreSettingsView />;
}
