"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { BuildSourceSetting } from "@/lib/supabase/schema";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceSupabaseClient } from "@/lib/supabase/service";
import { getInstallationToken, getInstallUrl, GitHubApiError } from "./app-auth";
import {
  findLatestSuccessfulRun,
  listInstallationRepositories,
  listRepositoryWorkflows,
  listRunArtifacts,
} from "./api";
import { insertBuilds } from "./builds-store";
import { buildsFromRun } from "./webhook";
import { GITHUB_CONNECT_COOKIE, type GitHubConnectCookie } from "./connect-cookie";

/**
 * 저장소 연결 server action (docs/design/github-build-integration.md §4.1, §4.3).
 * 게스트를 제외한 프로젝트 멤버 누구나 쓸 수 있고, 연결할 수 있는 설치는 설치 콜백에서
 * 본인이 접근 가능함을 검증한(github_installation_access) 설치뿐이다.
 */

type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export type ConnectableRepository = { id: number; fullName: string; defaultBranch: string; isPrivate: boolean };
export type RepositoryWorkflow = { path: string; name: string };

const BUILD_SOURCES: BuildSourceSetting[] = ["artifact", "release", "both"];

type ServerClient = NonNullable<ReturnType<typeof tryCreateServerSupabaseClient>>;
type MemberCheck = { error: string } | { supabase: ServerClient; userId: string };

/**
 * 로그인·게스트·프로젝트 멤버·보관 여부를 확인한다. installationId를 주면 그 GitHub 설치에 대한
 * 접근 검증(설치 콜백이 남긴 github_installation_access)도 프로젝트 조회와 동시에 확인한다.
 */
async function requireConnectableMember(projectId: string, installationId?: number): Promise<MemberCheck> {
  const supabase = tryCreateServerSupabaseClient();
  if (!supabase) return { error: "Supabase 설정 오류가 발생했습니다." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (user.is_anonymous) return { error: "게스트 모드에서는 GitHub을 연결할 수 없습니다." };

  const [{ data: project }, installationAccess] = await Promise.all([
    supabase.from("projects").select("archived_at").eq("id", projectId).maybeSingle(),
    installationId === undefined
      ? Promise.resolve(null)
      : supabase
          .from("github_installation_access")
          .select("installation_id")
          .eq("installation_id", installationId)
          .maybeSingle(),
  ]);
  if (!project) return { error: "프로젝트 멤버만 저장소를 연결할 수 있습니다." };
  if (project.archived_at) return { error: "보관된 프로젝트에는 저장소를 연결할 수 없습니다." };
  if (installationAccess && !installationAccess.data) {
    return { error: "이 GitHub 계정에 대한 접근이 확인되지 않았습니다. 계정을 다시 연결해주세요." };
  }

  return { supabase, userId: user.id };
}

function describeError(error: unknown): string {
  if (error instanceof GitHubApiError)
    return `GitHub과 통신하지 못했습니다 (응답 ${error.status}). 잠시 후 다시 시도해주세요.`;
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

/** GitHub 앱 설치 화면으로 보낼 주소. 돌아올 때 확인할 일회용 state를 쿠키에 남긴다. */
export async function startGitHubInstall(projectId: string): Promise<ActionResult<{ url: string }>> {
  const access = await requireConnectableMember(projectId);
  if ("error" in access) return { ok: false, error: access.error };

  const value: GitHubConnectCookie = { nonce: randomUUID(), projectId };
  cookies().set(GITHUB_CONNECT_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/github",
  });
  return { ok: true, url: getInstallUrl(value.nonce) };
}

export async function listConnectableRepositories(
  projectId: string,
  installationId: number
): Promise<ActionResult<{ repositories: ConnectableRepository[] }>> {
  const access = await requireConnectableMember(projectId, installationId);
  if ("error" in access) return { ok: false, error: access.error };

  try {
    const repositories = await listInstallationRepositories(installationId);
    return {
      ok: true,
      repositories: repositories.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
      })),
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function listRepositoryWorkflowOptions(
  projectId: string,
  installationId: number,
  repoId: number
): Promise<ActionResult<{ workflows: RepositoryWorkflow[] }>> {
  // 설치 토큰 발급(서버가 막 뜬 경우 ~0.4초)을 권한 확인과 동시에 시작해 둔다. 토큰은 서버 메모리
  // 캐시에만 남고, 아래 확인을 통과하지 못하면 GitHub을 더 부르지 않는다.
  const tokenWarmup = getInstallationToken(installationId).catch(() => undefined);
  const access = await requireConnectableMember(projectId, installationId);
  if ("error" in access) return { ok: false, error: access.error };

  try {
    await tokenWarmup;
    const workflows = await listRepositoryWorkflows(installationId, repoId);
    if (!workflows) return { ok: false, error: "이 저장소에 대한 앱 권한이 없습니다." };
    return {
      ok: true,
      workflows: workflows
        .filter((workflow) => workflow.state === "active")
        .map((workflow) => ({ path: workflow.path, name: workflow.name })),
    };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

export async function connectRepository(input: {
  projectId: string;
  installationId: number;
  repoId: number;
  buildSource: BuildSourceSetting;
  workflowPath: string | null;
  branchFilter: string | null;
}): Promise<ActionResult<{ importedBuilds: number }>> {
  if (!BUILD_SOURCES.includes(input.buildSource)) return { ok: false, error: "빌드 소스 값이 올바르지 않습니다." };
  const access = await requireConnectableMember(input.projectId, input.installationId);
  if ("error" in access) return { ok: false, error: access.error };
  const service = tryCreateServiceSupabaseClient();
  if (!service) return { ok: false, error: "서버 설정(SUPABASE_SERVICE_ROLE_KEY)이 없어 연결할 수 없습니다." };

  const workflowPath = input.workflowPath?.trim() || null;
  const branchFilter = input.branchFilter?.trim() || null;

  try {
    // 설치에서 앱에 허용한 저장소 목록으로 확인한다. 저장소 id로 직접 조회하면 공개 저장소는
    // 설치 범위 밖이어도 읽혀서, webhook이 오지 않는 남의 공개 저장소가 연결될 수 있다.
    const repo = (await listInstallationRepositories(input.installationId)).find((item) => item.id === input.repoId);
    if (!repo) return { ok: false, error: "이 저장소에 대한 앱 권한이 없습니다." };

    const { data: existing } = await service
      .from("project_repositories")
      .select("id, disconnected_at, connected_by")
      .eq("project_id", input.projectId)
      .eq("repo_id", repo.id)
      .maybeSingle();
    if (existing && !existing.disconnected_at) {
      return { ok: false, error: "이미 이 프로젝트에 연결된 저장소입니다." };
    }

    const settings = {
      installation_id: input.installationId,
      repo_full_name: repo.full_name,
      build_source: input.buildSource,
      workflow_path: workflowPath,
      branch_filter: branchFilter,
      connected_by: access.userId,
      disconnected_at: null,
    };
    // 해제했던 저장소를 다시 연결하면 같은 행을 되살린다 — 예전 빌드 이력이 그대로 이어진다.
    const { data: link, error } = existing
      ? await service.from("project_repositories").update(settings).eq("id", existing.id).select("*").single()
      : await service
          .from("project_repositories")
          .insert({ ...settings, project_id: input.projectId, repo_id: repo.id })
          .select("*")
          .single();
    if (error) throw error;

    // 연결 직후 빈 목록이 되지 않게 최근 성공 실행 1건을 가져온다.
    let importedBuilds = 0;
    if (link.build_source !== "release") {
      const run = await findLatestSuccessfulRun(input.installationId, repo.full_name, {
        workflowPath,
        branch: branchFilter,
      });
      if (run) {
        const artifacts = await listRunArtifacts(input.installationId, repo.full_name, run.id);
        importedBuilds = await insertBuilds(service, buildsFromRun(run, artifacts, link));
      }
    }
    return { ok: true, importedBuilds };
  } catch (error) {
    console.error("[github-connect]", error);
    return { ok: false, error: describeError(error) };
  }
}
