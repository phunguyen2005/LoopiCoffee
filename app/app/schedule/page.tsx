import { ScheduleManagerView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function SchedulePage() {
  const user = requireBusinessUser(await getLoopiUser("/app/schedule"));
  const canCreate = user.permissions.includes("shifts.create");
  const canPublish = user.permissions.includes("shifts.publish");
  const canAdjust = user.permissions.includes("shifts.adjust");
  const canCancel = user.permissions.includes("shifts.cancel");
  const canReadTeam = user.permissions.includes("shifts.read_team") || user.permissions.includes("people.read");
  return (
    <ScheduleManagerView
      canManage={canCreate || canPublish || canAdjust || canCancel}
      canCreate={canCreate}
      canPublish={canPublish}
      canAdjust={canAdjust}
      canCancel={canCancel}
      canReadTeam={canReadTeam}
    />
  );
}
