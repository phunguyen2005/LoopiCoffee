export { synchronizeSession as default } from "./server/session";
export const config = { matcher: ["/app/:path*", "/auth/login"] };
