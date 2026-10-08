import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";
import { getSupabaseEnv } from "./env";

/**
 * 서버 컴포넌트/서버 액션/라우트 핸들러에서 쓰는 Supabase 클라이언트.
 * 요청마다 새로 만들어야 한다(브라우저 클라이언트처럼 싱글턴으로 캐시하면
 * 서로 다른 사용자의 쿠키가 섞일 수 있다).
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서 호출되면 쿠키를 쓸 수 없다 — 세션 갱신은
          // middleware(lib/supabase/middleware.ts)가 담당하므로 무시해도 안전하다.
        }
      },
    },
  });
}

/**
 * createServerSupabaseClient()와 같지만, Supabase 환경 변수가 없을 때 예외 대신
 * null을 반환한다. "설정 안 됨"을 흔한 실패 경로로 다뤄야 하는 인증 액션/서버
 * 헬퍼(로그인, 회원가입, 로그아웃, 현재 사용자 조회)에서 반복되는 try/catch를 없앤다.
 */
export function tryCreateServerSupabaseClient(): SupabaseClient<Database> | null {
  try {
    return createServerSupabaseClient();
  } catch {
    return null;
  }
}
