import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, GitHubInstallationRow, ProjectRepositoryRow } from "../schema";

type Client = SupabaseClient<Database>;

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
  const { error } = await supabase
    .from("project_repositories")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("id", repositoryId);
  if (error) throw error;
}
