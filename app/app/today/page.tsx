import { EmployeeTodayView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TodayPage() {
  requireBusinessUser(await getLoopiUser("/app/today"));
  return <EmployeeTodayView />;
}
