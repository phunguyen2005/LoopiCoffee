import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { localSupabaseOptions } from './local-guard';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_ONLY = process.env.LOOPI_LOCAL_ONLY === "true" || process.env.NEXT_PUBLIC_LOCAL_ONLY === "true";

export async function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase server configuration is unavailable.');
  }
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...localSupabaseOptions(SUPABASE_URL, LOCAL_ONLY),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot write refreshed cookies.
        }
      },
    },
  });
}

export function createAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase admin configuration is unavailable.');
  }
  return createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    ...localSupabaseOptions(SUPABASE_URL, LOCAL_ONLY),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
