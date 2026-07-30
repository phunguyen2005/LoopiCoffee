import { getChatGPTUser, requireChatGPTUser } from "./chatgpt-auth";
import { getApiUser } from "@/server/auth";
import { cache } from "react";

export type LoopiUser = {
  email: string;
  displayName: string;
  role: "owner" | "manager" | "employee";
};

const getRequestActor = cache(getApiUser);

export async function getLoopiUser(returnTo: string): Promise<LoopiUser> {
  const actor = await getRequestActor();
  if (actor) {
    return {
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
    };
  }
  let authenticated = await getChatGPTUser();
  if (!authenticated && process.env.NODE_ENV !== "production") {
    return { email: "linh.nguyen@loopicafe.local", displayName: "Nguyễn Minh Linh", role: "owner" };
  }
  if (!authenticated) {
    authenticated = await requireChatGPTUser(returnTo);
  }
  throw new Error(`Tài khoản ${authenticated.email} chưa được thêm vào LoopiCafe.`);
}
