import { getChatGPTUser, requireChatGPTUser } from "./chatgpt-auth";
import { getApiUser } from "@/server/auth";

export type LoopiUser = {
  email: string;
  displayName: string;
  role: "owner" | "manager" | "employee";
};

export async function getLoopiUser(returnTo: string): Promise<LoopiUser> {
  let authenticated = await getChatGPTUser();
  if (!authenticated && process.env.NODE_ENV === "production") {
    authenticated = await requireChatGPTUser(returnTo);
  }
  const actor = await getApiUser();
  if (actor) {
    return {
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
    };
  }
  if (!authenticated && process.env.NODE_ENV !== "production") {
    return { email: "linh.nguyen@loopicafe.local", displayName: "Nguyễn Minh Linh", role: "owner" };
  }
  if (!authenticated) {
    authenticated = await requireChatGPTUser(returnTo);
  }
  throw new Error(`Tài khoản ${authenticated.email} chưa được thêm vào LoopiCafe.`);
}
