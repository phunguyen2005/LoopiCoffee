import { AppShell } from "@/components/app-shell";
import { getLoopiUser } from "../loopi-user";
import { requiresSupabasePasswordChange } from "@/server/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await requiresSupabasePasswordChange()) redirect("/auth/change-password");
  const user = await getLoopiUser("/app");
  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  return <AppShell user={user} dateLabel={dateLabel}>{children}</AppShell>;
}
