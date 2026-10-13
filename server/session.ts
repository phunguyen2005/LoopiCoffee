import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { localSupabaseOptions } from "@/lib/supabase/local-guard";

export async function synchronizeSession(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.next();
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true") return NextResponse.next();
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...localSupabaseOptions(process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.LOOPI_LOCAL_ONLY === "true" || process.env.NEXT_PUBLIC_LOCAL_ONLY === "true"),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const url = new URL(request.url);

  // Dynamic nonce CSP for HTML responses
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const localOnly = process.env.LOOPI_RUNTIME_PROFILE === "local" || process.env.LOOPI_LOCAL_ONLY === "true" || process.env.NEXT_PUBLIC_LOCAL_ONLY === "true";
  const connectSources = localOnly
    ? "'self' http://127.0.0.1:54321 ws://127.0.0.1:54321"
    : "'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org";
  const imageSources = localOnly
    ? "'self' data: blob:"
    : "'self' data: blob: https://*.tile.openstreetmap.org";

  const cspHeader = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src ${connectSources}; img-src ${imageSources}; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;

  request.headers.set("content-security-policy", cspHeader);
  request.headers.set("x-nonce", nonce);
  supabaseResponse.headers.set("Content-Security-Policy", cspHeader);
  supabaseResponse.headers.set("x-nonce", nonce);

  // Protect /app routes
  if (url.pathname.startsWith('/app')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }
  }

  return supabaseResponse;
}
