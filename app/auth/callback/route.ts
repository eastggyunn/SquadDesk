import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeRedirectPath } from "@/lib/supabase/redirect";

/**
 * 이메일 인증 링크(회원가입 시 emailRedirectTo)가 도착하는 곳.
 * PKCE code를 세션 쿠키로 교환한 뒤 원래 가려던 경로(기본값 "/")로 보낸다.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const target = sanitizeRedirectPath(searchParams.get("redirectTo"));

  if (code) {
    const supabase = createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${target}`);
}
