import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function getApiUser() {
  const user = await getChatGPTUser();
  if (user) return { email: user.email, displayName: user.displayName, role: "owner" as const };
  if (process.env.NODE_ENV !== "production") {
    return { email: "linh.nguyen@loopicafe.local", displayName: "Nguyễn Minh Linh", role: "owner" as const };
  }
  return null;
}
