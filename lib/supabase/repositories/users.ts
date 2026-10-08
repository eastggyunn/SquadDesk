import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, UserRow } from "../schema";

type Client = SupabaseClient<Database>;

/** 중복과 빈 값(null — 미배정·탈퇴 사용자 등)을 뺀 id 목록. */
export function uniqueIds(values: (string | null | undefined)[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

/** users 행을 id로 조회해 Map으로 돌려준다. 빈 값·중복은 걸러내고, 남는 id가 없으면 조회하지 않는다. */
export async function fetchUsersById(
  supabase: Client,
  userIds: (string | null | undefined)[]
): Promise<Map<string, UserRow>> {
  const usersById = new Map<string, UserRow>();
  const ids = uniqueIds(userIds);
  if (ids.length === 0) return usersById;
  const { data, error } = await supabase.from("users").select("*").in("id", ids);
  if (error) throw error;
  for (const user of data ?? []) usersById.set(user.id, user);
  return usersById;
}
