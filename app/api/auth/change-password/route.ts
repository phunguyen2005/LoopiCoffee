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
  const body = await readObject(request, { password: "string" });
  if (typeof body.password !== "string") throw new ApplicationError("Vui lòng nhập mật khẩu mới.");
  const authHeaders = new Headers();
  const supabase = await createClient(authHeaders);
  // Verify with the provider for this sensitive action; no cached identity or client metadata.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) throw new ApplicationError("Bạn cần đăng nhập lại.", 401, "unauthenticated");
  const result = await changePassword(await ensureDatabase(), { email: user.email, authUserId: user.id }, body.password,
    (password) => supabase.auth.updateUser({ password }));
  invalidateIdentityCache();
  return Response.json(result, { headers: authHeaders });
});
