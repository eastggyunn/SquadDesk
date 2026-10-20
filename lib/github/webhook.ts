import { createHmac, timingSafeEqual } from "node:crypto";
import type { BuildRow, ProjectRepositoryRow } from "@/lib/supabase/schema";

/**
 * GitHub webhook 서명 검증과 이벤트 → builds 행 변환. 네트워크·DB를 건드리지 않는
 * 순수 함수만 두어, 라우트(app/api/github/webhook)는 조회·저장만 하게 한다.
 * 실패한 실행은 저장하지 않는다 — 성공한 실행만 통과시킨다.
 */

/** X-Hub-Signature-256: "sha256=<hex>". 원문 body 그대로 검증해야 한다(파싱 후 재직렬화하면 달라진다). */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// ---- 이벤트 payload 중 쓰는 필드만 ----

type GitHubRepositoryRef = { id: number; full_name: string };
type GitHubUserRef = { login: string } | null;

export type GitHubWorkflowRun = {
  id: number;
  run_number: number;
  path: string;
  head_branch: string | null;
  head_sha: string;
  head_commit: { message: string } | null;
  status: string;
  conclusion: string | null;
  html_url: string;
  actor: GitHubUserRef;
};

export type GitHubArtifact = {
  id: number;
  name: string;
  size_in_bytes: number;
  expired: boolean;
  expires_at: string | null;
};

export type GitHubReleaseAsset = { id: number; name: string; size: number };

export type GitHubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  target_commitish: string;
  html_url: string;
  draft: boolean;
  author: GitHubUserRef;
  assets: GitHubReleaseAsset[];
};

export type WorkflowRunEvent = { action: string; workflow_run: GitHubWorkflowRun; repository: GitHubRepositoryRef };
export type ReleaseEvent = { action: string; release: GitHubRelease; repository: GitHubRepositoryRef };
export type InstallationEvent = {
  action: "created" | "deleted" | "suspend" | "unsuspend" | "new_permissions_accepted";
  installation: { id: number; account: { login: string; type: "User" | "Organization" } };
};
export type InstallationRepositoriesEvent = {
  action: "added" | "removed";
  installation: { id: number };
  repositories_removed: GitHubRepositoryRef[];
};
export type RepositoryEvent = { action: string; repository: GitHubRepositoryRef };

// ---- 필터 / 변환 ----

export type RepositoryLink = Pick<
  ProjectRepositoryRow,
  "id" | "project_id" | "build_source" | "workflow_path" | "branch_filter"
>;

export type BuildInsert = Omit<BuildRow, "id" | "created_at" | "expired_at">;

const EMPTY_FILE_IDS = {
  github_run_id: null,
  github_artifact_id: null,
  github_release_id: null,
  github_asset_id: null,
  expires_at: null,
} as const;

/** workflow_run.path는 ".github/workflows/main.yml" 형태지만 "@ref"가 붙어 오는 경우가 있어 떼어 낸다. */
export function workflowPathOf(run: Pick<GitHubWorkflowRun, "path">): string {
  return run.path.split("@")[0];
}

/** 끝난 성공 실행이고, 연결 설정(빌드 소스·워크플로·브랜치)에 맞을 때만 받는다. */
export function acceptsWorkflowRun(event: WorkflowRunEvent, link: RepositoryLink): boolean {
  const run = event.workflow_run;
  return (
    event.action === "completed" &&
    run.conclusion === "success" &&
    link.build_source !== "release" &&
    (!link.workflow_path || workflowPathOf(run) === link.workflow_path) &&
    (!link.branch_filter || run.head_branch === link.branch_filter)
  );
}

/** 실행의 artifact마다 빌드 1건. 이미 만료된 artifact는 받을 수 없으니 뺀다. */
export function buildsFromRun(run: GitHubWorkflowRun, artifacts: GitHubArtifact[], link: RepositoryLink): BuildInsert[] {
  return artifacts
    .filter((artifact) => !artifact.expired)
    .map((artifact) => ({
      ...EMPTY_FILE_IDS,
      project_id: link.project_id,
      repository_id: link.id,
      source: "artifact",
      name: artifact.name,
      version_label: `#${run.run_number}`,
      branch: run.head_branch,
      commit_sha: run.head_sha,
      commit_message: run.head_commit?.message ?? null,
      actor_login: run.actor?.login ?? null,
      size_bytes: artifact.size_in_bytes,
      github_run_id: run.id,
      github_artifact_id: artifact.id,
      html_url: run.html_url,
      expires_at: artifact.expires_at,
    }));
}

export function acceptsRelease(event: ReleaseEvent, link: RepositoryLink): boolean {
  return event.action === "published" && !event.release.draft && link.build_source !== "artifact";
}

/** release asset마다 빌드 1건. */
export function buildsFromRelease(release: GitHubRelease, link: RepositoryLink): BuildInsert[] {
  return release.assets.map((asset) => ({
    ...EMPTY_FILE_IDS,
    project_id: link.project_id,
    repository_id: link.id,
    source: "release",
    name: asset.name,
    version_label: release.tag_name,
    branch: release.target_commitish,
    commit_sha: null,
    commit_message: release.name,
    actor_login: release.author?.login ?? null,
    size_bytes: asset.size,
    github_release_id: release.id,
    github_asset_id: asset.id,
    html_url: release.html_url,
  }));
}
