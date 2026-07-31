import { EmployeeTodayView } from "@/components/operational-views";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TodayPage() {
  return <EmployeeTodayView />;
}
