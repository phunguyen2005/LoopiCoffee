import { ensureDatabase } from "@/db/runtime";
import { getApiUser, getVerifiedIdentity } from "@/server/auth";
import { completeSignIn } from "@/modules/people/application/complete-sign-in";
import { defaultAppPath } from "@/modules/people/domain/access";
import { apiHandler } from "@/platform/http/errors";

export const POST = apiHandler(async () => {
  const identity = await getVerifiedIdentity();
  if (!identity) return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  const member = await completeSignIn(await ensureDatabase(), identity);
  if (!member) return Response.json({ error: "Tài khoản chưa được mời hoặc đang bị vô hiệu hóa. Hãy liên hệ quản lý." }, { status: 403 });
  const actor = await getApiUser();
  return Response.json({
    updated: true,
    mustChangePassword: actor?.mustChangePassword === true,
    landingPath: actor ? defaultAppPath(actor.role) : "/app",
  });
});
