"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { BuildSourceSetting } from "@/lib/supabase/schema";
import { tryCreateServerSupabaseClient } from "@/lib/supabase/server";
import { tryCreateServiceSupabaseClient } from "@/lib/supabase/service";
import { getInstallUrl, GitHubApiError } from "./app-auth";
import {
  findLatestSuccessfulRun,
  getInstallationRepository,
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

async function requireConnectableMember(projectId: string): Promise<MemberCheck> {
  const supabase = tryCreateServerSupabaseClient();
  if (!supabase) return { error: "Supabase 설정 오류가 발생했습니다." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };
  if (user.is_anonymous) return { error: "게스트 모드에서는 GitHub을 연결할 수 없습니다." };

  const { data: project } = await supabase.from("projects").select("archived_at").eq("id", projectId).maybeSingle();
  if (!project) return { error: "프로젝트 멤버만 저장소를 연결할 수 있습니다." };
  if (project.archived_at) return { error: "보관된 프로젝트에는 저장소를 연결할 수 없습니다." };

  return { supabase, userId: user.id };
}

/** 멤버 확인 + 이 사용자가 설치 콜백에서 그 GitHub 설치에 접근 가능함을 검증했는지 확인. */
async function requireInstallationAccess(projectId: string, installationId: number): Promise<MemberCheck> {
  const access = await requireConnectableMember(projectId);
  if ("error" in access) return access;
  const { data } = await access.supabase
    .from("github_installation_access")
    .select("installation_id")
    .eq("installation_id", installationId)
    .maybeSingle();
  return data ? access : { error: "이 GitHub 계정에 대한 접근이 확인되지 않았습니다. 계정을 다시 연결해주세요." };
}

function describeError(error: unknown): string {
  if (error instanceof GitHubApiError) return `GitHub과 통신하지 못했습니다 (응답 ${error.status}). 잠시 후 다시 시도해주세요.`;
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
  const access = await requireInstallationAccess(projectId, installationId);
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
  const access = await requireInstallationAccess(projectId, installationId);
  if ("error" in access) return { ok: false, error: access.error };

  try {
    const repo = await getInstallationRepository(installationId, repoId);
    if (!repo) return { ok: false, error: "이 저장소에 대한 앱 권한이 없습니다." };
    const workflows = await listRepositoryWorkflows(installationId, repo.full_name);
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
  const access = await requireInstallationAccess(input.projectId, input.installationId);
  if ("error" in access) return { ok: false, error: access.error };
  const service = tryCreateServiceSupabaseClient();
  if (!service) return { ok: false, error: "서버 설정(SUPABASE_SERVICE_ROLE_KEY)이 없어 연결할 수 없습니다." };

  const workflowPath = input.workflowPath?.trim() || null;
  const branchFilter = input.branchFilter?.trim() || null;

  try {
    const repo = await getInstallationRepository(input.installationId, input.repoId);
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
