import { ensureDatabase } from "@/db/runtime";
import { completeSignIn } from "@/modules/people/application/complete-sign-in";
import { defaultAppPath } from "@/modules/people/domain/access";
import { getApiUser } from "@/server/auth";
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const authHeaders = new Headers();
  const redirect = (url: string) => NextResponse.redirect(url, { headers: authHeaders });
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const requestedNext = searchParams.get('next');
  let next: string | null = null;
  if (requestedNext) {
    try {
      const destination = new URL(requestedNext, origin);
      if (destination.origin === origin) next = `${destination.pathname}${destination.search}`;
    } catch { /* Ignore malformed or external redirect targets. */ }
  }

  if (code || (tokenHash && ["invite", "recovery", "magiclink", "email"].includes(type ?? ""))) {
    const supabase = await createClient(authHeaders);
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type as "invite" | "recovery" | "magiclink" | "email" });
    if (!error && data.user?.email) {
      const member = await completeSignIn(await ensureDatabase(), { email: data.user.email, displayName: data.user.email, authUserId: data.user.id });
      if (!member) return redirect(`${origin}/auth/access`);
      const actor = await getApiUser();
      if (type === "recovery" || searchParams.get("recovery") === "1" || actor?.mustChangePassword) {
        return redirect(`${origin}/auth/change-password`);
      }
      return redirect(`${origin}${next ?? (actor ? defaultAppPath(actor.role) : "/app")}`);
    }
  }

  // Supabase admin invitations can use the implicit flow. Browsers preserve the
  // original URL fragment across this redirect; only the client can exchange it.
  if (!code && !tokenHash && !searchParams.has("error")) return redirect(`${origin}/auth/confirm`);
  return redirect(`${origin}/auth/login?error=auth-code-error`);
}
