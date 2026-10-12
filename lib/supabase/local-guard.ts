export function assertLocalSupabaseUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Local authentication requires a valid loopback URL."); }
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) {
    throw new Error("Local authentication cannot connect to a remote service.");
  }
}

export function localSupabaseOptions(url: string, localOnly: boolean) {
  if (!localOnly) return {};
  assertLocalSupabaseUrl(url);
  return {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        assertLocalSupabaseUrl(input instanceof Request ? input.url : String(input));
        // A local endpoint must never redirect an authorization header to a cloud host.
        return fetch(input, { ...init, redirect: "error" });
      },
    },
  };
}
