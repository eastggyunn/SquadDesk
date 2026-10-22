import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GitHubInstallationRow, ProjectRepositoryRow } from "../schema";

type Client = SupabaseClient<Database>;

/** RLS가 막은 update는 오류 없이 0행으로 끝난다 — 바뀐 행이 없으면 권한 없음으로 본다. */
async function updateOwnRepository(
  supabase: Client,
  repositoryId: string,
  values: Partial<ProjectRepositoryRow>
): Promise<void> {
  const { data, error } = await supabase
    .from("project_repositories")
    .update(values)
    .eq("id", repositoryId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("저장소 연결을 바꿀 권한이 없습니다.");
}

/** 프로젝트에 연결된 저장소(해제된 것 포함, 오래된 순). 연결 생성은 서버 액션만 한다. */
export async function listProjectRepositories(supabase: Client, projectId: string): Promise<ProjectRepositoryRow[]> {
  const { data, error } = await supabase
    .from("project_repositories")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 내가 설치 콜백에서 접근을 검증한 GitHub 계정들 — 저장소 연결 모달의 계정 선택지. */
export async function listMyGitHubInstallations(supabase: Client): Promise<GitHubInstallationRow[]> {
  const { data: access, error } = await supabase.from("github_installation_access").select("installation_id");
  if (error) throw error;
  const ids = (access ?? []).map((row) => row.installation_id);
  if (ids.length === 0) return [];

  const { data, error: installationsError } = await supabase
    .from("github_installations")
    .select("*")
    .in("installation_id", ids)
    .is("suspended_at", null)
    .order("account_login", { ascending: true });
  if (installationsError) throw installationsError;
  return data ?? [];
}

/** 연결 해제 — 연결한 본인 또는 owner만 RLS를 통과한다. 빌드 이력은 남는다. */
export async function disconnectProjectRepository(supabase: Client, repositoryId: string): Promise<void> {
  await updateOwnRepository(supabase, repositoryId, { disconnected_at: new Date().toISOString() });
}

/**
 * 받을 빌드의 범위(빌드 종류·워크플로·브랜치)를 바꾼다. 연결한 본인 또는 owner만 RLS를 통과하고,
 * 저장소·설치·연결자 같은 연결 대상은 트리거(guard_project_repository_update)가 못 바꾸게 막는다.
 */
export async function updateProjectRepositoryFilters(
  supabase: Client,
  repositoryId: string,
  filters: Pick<ProjectRepositoryRow, "build_source" | "workflow_path" | "branch_filter">
): Promise<void> {
  await updateOwnRepository(supabase, repositoryId, filters);
}
