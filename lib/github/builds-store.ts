import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/schema";
import type { BuildInsert } from "./webhook";

const UNIQUE_VIOLATION_CODE = "23505";

/**
 * 빌드를 한 건씩 넣고, 이미 있는 artifact/asset(webhook 재전송, 재연결 후 첫 가져오기)은 건너뛴다.
 * 고유 인덱스가 부분 인덱스라 upsert(on conflict)를 쓸 수 없어 중복 오류를 무시하는 방식이다.
 * 새로 들어간 건수를 돌려준다.
 */
export async function insertBuilds(service: SupabaseClient<Database>, builds: BuildInsert[]): Promise<number> {
  let inserted = 0;
  for (const build of builds) {
    const { error } = await service.from("builds").insert(build);
    if (!error) inserted += 1;
    else if (error.code !== UNIQUE_VIOLATION_CODE) throw error;
  }
  return inserted;
}
