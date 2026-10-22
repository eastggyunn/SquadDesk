import "server-only";
import { createAppJwt, getInstallationToken, GITHUB_API, githubHeaders, GitHubApiError } from "./app-auth";
import { workflowPathOf, type GitHubArtifact, type GitHubWorkflowRun } from "./webhook";

/**
 * 연동에 필요한 GitHub REST 호출만 모은 얇은 래퍼. 모든 호출은 설치 토큰(저장소 읽기 전용)
 * 또는 App JWT로 하며, 사용자 토큰은 쓰지 않는다.
 */

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, { headers: githubHeaders(token), cache: "no-store" });
  if (!response.ok) throw new GitHubApiError(response.status, `GitHub API 호출 실패 (${path})`);
  return (await response.json()) as T;
}

async function installationRequest<T>(installationId: number, path: string): Promise<T> {
  return request<T>(path, await getInstallationToken(installationId));
}

export type GitHubInstallationInfo = {
  id: number;
  account: { login: string; type: "User" | "Organization" };
  suspended_at: string | null;
};

export function getInstallation(installationId: number): Promise<GitHubInstallationInfo> {
  return request<GitHubInstallationInfo>(`/app/installations/${installationId}`, createAppJwt());
}

export type GitHubRepository = {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
};

/** 사용자가 이 설치에서 앱에 허용한 저장소 전체. */
export async function listInstallationRepositories(installationId: number): Promise<GitHubRepository[]> {
  const repositories: GitHubRepository[] = [];
  for (let page = 1; ; page += 1) {
    const body = await installationRequest<{ repositories: GitHubRepository[] }>(
      installationId,
      `/installation/repositories?per_page=100&page=${page}`
    );
    repositories.push(...body.repositories);
    if (body.repositories.length < 100) return repositories;
  }
}

export type GitHubWorkflow = { id: number; name: string; path: string; state: string };

/**
 * 저장소 id로 바로 워크플로 목록을 읽는다(이름 조회를 한 번 건너뛴다). 이 설치에서 앱에 허용되지 않은
 * 비공개 저장소면 GitHub이 404를 주므로 null. 공개 저장소는 설치와 무관하게 읽히지만 공개 정보라 문제없다
 * (연결 자체는 connectRepository가 설치의 저장소 목록으로 범위를 다시 확인한다).
 */
export async function listRepositoryWorkflows(
  installationId: number,
  repoId: number
): Promise<GitHubWorkflow[] | null> {
  try {
    const body = await installationRequest<{ workflows: GitHubWorkflow[] }>(
      installationId,
      `/repositories/${repoId}/actions/workflows?per_page=100`
    );
    return body.workflows;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return null;
    throw error;
  }
}

export async function listRunArtifacts(
  installationId: number,
  repoFullName: string,
  runId: number
): Promise<GitHubArtifact[]> {
  const body = await installationRequest<{ artifacts: GitHubArtifact[] }>(
    installationId,
    `/repos/${repoFullName}/actions/runs/${runId}/artifacts?per_page=100`
  );
  return body.artifacts;
}

/** 연결 직후 빈 목록을 피하려고 가져오는 최근 성공 실행(필터에 맞는 것). 없으면 null. */
export async function findLatestSuccessfulRun(
  installationId: number,
  repoFullName: string,
  filter: { workflowPath: string | null; branch: string | null }
): Promise<GitHubWorkflowRun | null> {
  const params = new URLSearchParams({ status: "success", per_page: "30" });
  if (filter.branch) params.set("branch", filter.branch);
  const body = await installationRequest<{ workflow_runs: GitHubWorkflowRun[] }>(
    installationId,
    `/repos/${repoFullName}/actions/runs?${params}`
  );
  return body.workflow_runs.find((run) => !filter.workflowPath || workflowPathOf(run) === filter.workflowPath) ?? null;
}

export type DownloadTarget = { kind: "artifact"; artifactId: number } | { kind: "release_asset"; assetId: number };

/**
 * 다운로드용 임시 서명 URL(수 분 유효)을 받는다. 파일은 우리 서버를 거치지 않는다.
 * 보관 기간이 지나 GitHub이 404/410을 주면 null.
 */
export async function getDownloadUrl(
  installationId: number,
  repoFullName: string,
  target: DownloadTarget
): Promise<string | null> {
  const path =
    target.kind === "artifact"
      ? `/repos/${repoFullName}/actions/artifacts/${target.artifactId}/zip`
      : `/repos/${repoFullName}/releases/assets/${target.assetId}`;
  const headers = githubHeaders(await getInstallationToken(installationId));
  if (target.kind === "release_asset") headers.Accept = "application/octet-stream";

  const response = await fetch(`${GITHUB_API}${path}`, { headers, redirect: "manual", cache: "no-store" });
  if (response.status === 404 || response.status === 410) return null;
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) return location;
  throw new GitHubApiError(response.status, `다운로드 주소 발급 실패 (${path})`);
}
