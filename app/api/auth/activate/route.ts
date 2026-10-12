import { ensureDatabase } from "@/db/runtime";
import { getApiUser, getVerifiedIdentity } from "@/server/auth";
import { completeSignIn } from "@/modules/people/application/complete-sign-in";
import { apiHandler } from "@/platform/http/errors";

export const POST = apiHandler(async () => {
  const identity = await getVerifiedIdentity();
  if (!identity) return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401 });
  const member = await completeSignIn(await ensureDatabase(), identity);
  if (!member) return Response.json({ error: "Tài khoản chưa được mời hoặc đang bị vô hiệu hóa. Hãy liên hệ quản lý." }, { status: 403 });
  return Response.json({ updated: true, mustChangePassword: (await getApiUser())?.mustChangePassword === true });
});
