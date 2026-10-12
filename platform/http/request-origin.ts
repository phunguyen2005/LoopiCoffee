/** Browser cookies must never authorize a cross-origin state change. */
export function rejectCrossOriginMutation(request: Request): Response | null {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null;
  const url = new URL(request.url);
  if ((url.pathname === "/api/cron/retention" || url.pathname === "/api/seed-users") && request.headers.get("authorization")?.startsWith("Bearer ")) return null;
  if (!url.pathname.startsWith("/api/") && url.pathname !== "/auth/signout") return null;
  const origin = request.headers.get("origin");
  if (origin !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Nguồn yêu cầu không hợp lệ.", code: "invalid_origin" }, { status: 403 });
  }
  return null;
}
