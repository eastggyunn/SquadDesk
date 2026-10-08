/**
 * NEXT_PUBLIC_* 값은 빌드 타임에 인라인되므로 서버/클라이언트 어디서 호출해도
 * 안전하다. 칸반/버그 화면이 Supabase 실데이터 모드와 Zustand 목업 모드 중
 * 무엇을 쓸지 이 값 하나로 분기한다.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase 환경 변수가 설정되지 않았습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정하세요 (.env.local.example 참고)."
    );
  }

  return { url, anonKey };
}
