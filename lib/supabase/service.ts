import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

/**
 * RLS를 우회하는 service_role 클라이언트. 크론·GitHub webhook·설치 콜백처럼 서버가
 * 직접 검증을 마친 뒤 쓰는 경로에서만 쓴다. 키가 없으면 null.
 */
export function tryCreateServiceSupabaseClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient<Database>(url, serviceRoleKey, { auth: { persistSession: false } });
}
