import type { SupabaseClient } from "@supabase/supabase-js";
import type { BuildLinkRow, BuildRow, Database } from "../schema";

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

/** 목록·서랍에 쓰는 빌드 제목: 커밋 메시지 첫 줄, 없으면(Release 등) 파일 이름. */
export function buildTitle(build: Pick<BuildRow, "commit_message" | "name">): string {
  return build.commit_message?.split("\n")[0] || build.name;
}

/** 다운로드 주소(서버가 GitHub 임시 URL로 리다이렉트). 멤버 확인과 만료 처리는 라우트가 한다. */
export function buildDownloadHref(buildId: string): string {
  return `/api/builds/${buildId}/download`;
}

// ---- 빌드 ↔ 태스크 / 스프린트 연결 (build_links) ----

export type BuildLinkTarget = { taskId: string } | { sprintId: string };

const UNIQUE_VIOLATION_CODE = "23505";

/** 프로젝트의 모든 빌드 연결. 행이 작아(빌드 × 연결 대상) 한 번에 읽고 화면에서 나눠 쓴다. */
export async function listProjectBuildLinks(supabase: Client, projectId: string): Promise<BuildLinkRow[]> {
  const { data, error } = await supabase.from("build_links").select("*").eq("project_id", projectId);
  if (error) throw error;
  return data ?? [];
}

/**
 * 빌드를 태스크 또는 스프린트에 연결한다. linked_by는 DB 기본값(auth.uid())이 채우고,
 * 같은 프로젝트인지는 트리거가 확인한다. 이미 연결돼 있으면 조용히 성공으로 본다.
 * 태스크에 연결하면 담당자에게 build_linked 알림이 간다(DB 트리거).
 */
export async function linkBuild(supabase: Client, projectId: string, buildId: string, target: BuildLinkTarget) {
  const { error } = await supabase.from("build_links").insert({
    project_id: projectId,
    build_id: buildId,
    task_id: "taskId" in target ? target.taskId : null,
    sprint_id: "sprintId" in target ? target.sprintId : null,
  });
  if (error && error.code !== UNIQUE_VIOLATION_CODE) throw error;
}

export async function unlinkBuild(supabase: Client, linkId: string): Promise<void> {
  const { error } = await supabase.from("build_links").delete().eq("id", linkId);
  if (error) throw error;
}

/** 연결 팝오버의 태스크 선택지(최근 수정 순). 칸반 훅 전체를 띄우지 않으려고 제목만 읽는다. */
export async function listLinkableTasks(supabase: Client, projectId: string): Promise<{ id: string; title: string }[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data ?? [];
}

/** 칸반 스프린트 헤더의 "빌드 N개". */
export async function countSprintBuilds(supabase: Client, sprintId: string): Promise<number> {
  const { count, error } = await supabase
    .from("build_links")
    .select("id", { count: "exact", head: true })
    .eq("sprint_id", sprintId);
  if (error) throw error;
  return count ?? 0;
}
