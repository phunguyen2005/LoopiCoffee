import { PersistentRequestsView } from "@/components/operational-views";
import { getLoopiUser, requireBusinessUser } from "@/app/loopi-user";

export default async function RequestsPage() {
  const user = requireBusinessUser(await getLoopiUser("/app/requests"));
  const canReviewLeave = user.permissions.includes("requests.leave.review");
  const canReviewCorrection = user.permissions.includes("requests.correction.review");
  const canApplySwap = user.permissions.includes("requests.swap.apply");
  const approvalScope = canReviewLeave || canReviewCorrection
    ? "all"
    : canApplySwap ? "swap_only" : "none";
  return (
    <PersistentRequestsView
      approvalScope={approvalScope}
      canReviewLeave={canReviewLeave}
      canReviewCorrection={canReviewCorrection}
      canApplySwap={canApplySwap}
    />
  );
}
