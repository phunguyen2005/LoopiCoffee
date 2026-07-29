import { getChatGPTUser, requireChatGPTUser } from "./chatgpt-auth";

export type LoopiUser = {
  email: string;
  displayName: string;
  role: "owner" | "manager" | "employee";
};

export async function getLoopiUser(returnTo: string): Promise<LoopiUser> {
  const user = await getChatGPTUser();
  if (user) {
    return {
      email: user.email,
      displayName: user.fullName ?? user.displayName,
      role: "owner",
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      email: "linh.nguyen@loopicafe.local",
      displayName: "Nguyễn Minh Linh",
      role: "owner",
    };
  }

  const authenticated = await requireChatGPTUser(returnTo);
  return {
    email: authenticated.email,
    displayName: authenticated.fullName ?? authenticated.displayName,
    role: "owner",
  };
}
