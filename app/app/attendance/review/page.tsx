import { AttendanceReviewView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";
import { redirect } from "next/navigation";

export default async function AttendanceReviewPage() {
  const user = await getLoopiUser("/app/attendance/review");
  if (user.role === "employee") redirect("/app/attendance");
  return <AttendanceReviewView />;
}
