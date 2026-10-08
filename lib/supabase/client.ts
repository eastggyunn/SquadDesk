import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";
import { getSupabaseEnv } from "./env";

let client: SupabaseClient<Database> | null = null;

/**
 * 브라우저(클라이언트 컴포넌트)에서 쓰는 Supabase 클라이언트. 세션 쿠키를
 * @supabase/ssr가 관리하므로 서버(middleware/서버 컴포넌트)와 인증 상태가
 * 자동으로 동기화된다. 지연 초기화라 .env.local이 비어 있어도 이 함수를
 * 실제로 호출하기 전까지는 앱이 깨지지 않는다.
 */
export function getBrowserSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  const { url, anonKey } = getSupabaseEnv();
  client = createBrowserClient<Database>(url, anonKey);
  return client;
}
