import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./schema";

// /invite도 보호 대상이다 — 미로그인 상태로 초대 링크를 열면 redirectTo를 달고
// /login으로 보내, 로그인/회원가입 후 같은 초대 화면으로 되돌아오게 한다.
/** 로그인하지 않으면 접근할 수 없는 기존 앱 경로. */
const PROTECTED_PATHS = ["/", "/kanban", "/bugs", "/chat", "/domains", "/schedule", "/members", "/invite"];
/** 이미 로그인한 사용자는 접근할 필요가 없는 경로. */
const AUTH_PATHS = ["/login", "/signup"];

function matchesPath(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));
}

/**
 * 모든 요청에서 Supabase 세션 쿠키를 갱신하고, 인증 상태에 따라
 * 보호된 경로 <-> 로그인/가입 경로 사이를 리다이렉트한다.
 * .env.local이 비어 있는 경우(Supabase 미설정) 게이트 없이 통과시켜
 * 로컬에서 UI만 확인하는 흐름을 막지 않는다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser()는 매번 Supabase Auth 서버에 세션을 검증한다(getSession()과 달리
  // 위조된 쿠키를 신뢰하지 않는다) — 미들웨어의 인증 게이트로 적합하다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && matchesPath(pathname, PROTECTED_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && matchesPath(pathname, AUTH_PATHS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
