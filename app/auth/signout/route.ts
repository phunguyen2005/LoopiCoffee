import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Nguồn yêu cầu không hợp lệ." }, { status: 403 });
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return Response.json({ error: "Không thể đăng xuất lúc này. Hãy thử lại." }, { status: 502 });
  return NextResponse.redirect(new URL('/auth/login', request.url), { status: 303 });
}
