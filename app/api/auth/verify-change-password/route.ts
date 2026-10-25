import { ensureDatabase } from "@/db/runtime";
import { createClient } from "@/lib/supabase/server";
import { changePassword } from "@/modules/people/application/change-password";
import { apiHandler, ApplicationError } from "@/platform/http/errors";
import { readObject } from "@/platform/http/input";
import { invalidateIdentityCache } from "@/server/auth";

export const POST = apiHandler(async (request: Request) => {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new ApplicationError("Nguồn yêu cầu không hợp lệ.", 403, "invalid_origin");
  }
  const body = await readObject(request, { currentPassword: "string", newPassword: "string" });
  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    throw new ApplicationError("Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.");
  }
  if (body.currentPassword === body.newPassword) {
    throw new ApplicationError("Mật khẩu mới phải khác mật khẩu hiện tại.", 400, "password_unchanged");
  }

  const authHeaders = new Headers();
  const supabase = await createClient(authHeaders);
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.id || !user.email) {
    throw new ApplicationError("Bạn cần đăng nhập lại.", 401, "unauthenticated");
  }

  const { data: verified, error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: body.currentPassword,
  });
  if (verifyError || verified.user?.id !== user.id) {
    throw new ApplicationError("Mật khẩu hiện tại không đúng.", 400, "current_password_invalid");
  }

  const result = await changePassword(
    await ensureDatabase(),
    { email: user.email, authUserId: user.id },
    body.newPassword,
    (password) => supabase.auth.updateUser({ password }),
  );
  invalidateIdentityCache();
  return Response.json(result, { headers: authHeaders });
});
