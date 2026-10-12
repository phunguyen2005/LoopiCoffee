export { synchronizeSession as middleware } from "./server/session";
export const config = { matcher: ["/app/:path*", "/auth/login"] };
