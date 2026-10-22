import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuildRow, Database } from "../schema";

type Client = SupabaseClient<Database>;

export const BUILD_PAGE_SIZE = 50;

/** 프로젝트의 최근 빌드(새것부터). 빌드 행은 webhook·연결 액션(서버)만 만든다. */
export async function listProjectBuilds(supabase: Client, projectId: string): Promise<BuildRow[]> {
  const { data, error } = await supabase
    .from("builds")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(BUILD_PAGE_SIZE);
  if (error) throw error;
  return data ?? [];
}

/** 다운로드 주소(서버가 GitHub 임시 URL로 리다이렉트). 멤버 확인과 만료 처리는 라우트가 한다. */
export function buildDownloadHref(buildId: string): string {
  return `/api/builds/${buildId}/download`;
}
