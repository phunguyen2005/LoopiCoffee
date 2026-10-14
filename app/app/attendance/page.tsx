import { AttendanceView } from "@/components/app-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function AttendancePage() {
  requireBusinessUser(await getLoopiUser("/app/attendance"));
  return <AttendanceView />;
}
