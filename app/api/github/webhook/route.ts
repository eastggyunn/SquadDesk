import { NextResponse, type NextRequest } from "next/server";
import { getGitHubAppEnv } from "@/lib/github/app-auth";
import { listRunArtifacts } from "@/lib/github/api";
import { insertBuilds } from "@/lib/github/builds-store";
import {
  acceptsRelease,
  acceptsWorkflowRun,
  buildsFromRelease,
  buildsFromRun,
  verifyWebhookSignature,
  type InstallationEvent,
  type InstallationRepositoriesEvent,
  type ReleaseEvent,
  type RepositoryEvent,
  type WorkflowRunEvent,
} from "@/lib/github/webhook";
import { tryCreateServiceSupabaseClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type ServiceClient = NonNullable<ReturnType<typeof tryCreateServiceSupabaseClient>>;

/** 결과를 응답하면서 한 줄 로그로 남긴다 — Vercel Logs에서 이벤트 처리 결과를 확인하려고. */
function respond(body: Record<string, unknown>, status = 200) {
  (status === 200 ? console.log : console.error)(`[github-webhook] ${status} ${JSON.stringify(body)}`);
  return NextResponse.json(body, { status });
}

/**
 * SquadDesk Builds GitHub App webhook (docs/design/github-build-integration.md §4.4).
 * 성공한 workflow_run / 게시된 release만 builds로 저장하고(알림은 DB 트리거가 보낸다),
 * 설치·저장소 변경은 연결 상태에 반영한다. 처리할 것이 없는 이벤트도 200으로 끝낸다.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), getGitHubAppEnv().webhookSecret)) {
    return respond({ error: "invalid signature" }, 401);
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") return respond({ event, ok: true });
  const payload = JSON.parse(rawBody) as { action?: string };

  // 실패·진행 중 실행은 DB를 보기 전에 버린다 — 대부분의 workflow_run 이벤트가 여기서 끝난다.
  if (event === "workflow_run") {
    const run = (payload as WorkflowRunEvent).workflow_run;
    if (payload.action !== "completed" || run.conclusion !== "success") {
      return respond({ event, ignored: run.conclusion ?? payload.action });
    }
  }

  const service = tryCreateServiceSupabaseClient();
  if (!service) return respond({ error: "SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다." }, 500);

  try {
    switch (event) {
      case "workflow_run":
        return respond({ event, ...(await handleWorkflowRun(service, payload as WorkflowRunEvent)) });
      case "release":
        return respond({ event, ...(await handleRelease(service, payload as ReleaseEvent)) });
      case "installation":
        return respond({ event, ...(await handleInstallation(service, payload as InstallationEvent)) });
      case "installation_repositories":
        return respond({
          event,
          ...(await handleInstallationRepositories(service, payload as InstallationRepositoriesEvent)),
        });
      case "repository":
        return respond({ event, ...(await handleRepository(service, payload as RepositoryEvent)) });
      default:
        return respond({ event, ignored: "unhandled event" });
    }
  } catch (error) {
    // 500을 돌려주면 GitHub 앱 설정의 Recent Deliveries에서 실패로 보이고 재전송할 수 있다.
    return respond({ event, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

/** 이 저장소를 연결한(해제되지 않은) 모든 프로젝트. 같은 저장소를 여러 프로젝트가 받을 수 있다. */
async function activeLinks(service: ServiceClient, repoId: number) {
  const { data, error } = await service
    .from("project_repositories")
    .select("id, project_id, build_source, workflow_path, branch_filter, installation_id, repo_full_name")
    .eq("repo_id", repoId)
    .is("disconnected_at", null);
  if (error) throw error;
  return data ?? [];
}

async function handleWorkflowRun(service: ServiceClient, event: WorkflowRunEvent) {
  const links = (await activeLinks(service, event.repository.id)).filter((link) => acceptsWorkflowRun(event, link));
  if (links.length === 0) return { ignored: "no matching repository link" };

  // artifact 목록은 저장소 단위라 한 번만 조회한다(어느 연결의 설치로 읽어도 같다).
  const artifacts = await listRunArtifacts(links[0].installation_id, event.repository.full_name, event.workflow_run.id);
  let inserted = 0;
  for (const link of links) inserted += await insertBuilds(service, buildsFromRun(event.workflow_run, artifacts, link));
  return { run: event.workflow_run.id, links: links.length, artifacts: artifacts.length, inserted };
}

async function handleRelease(service: ServiceClient, event: ReleaseEvent) {
  const links = (await activeLinks(service, event.repository.id)).filter((link) => acceptsRelease(event, link));
  if (links.length === 0) return { ignored: "no matching repository link" };

  let inserted = 0;
  for (const link of links) inserted += await insertBuilds(service, buildsFromRelease(event.release, link));
  return { release: event.release.id, links: links.length, inserted };
}

async function handleInstallation(service: ServiceClient, event: InstallationEvent) {
  const installationId = event.installation.id;
  switch (event.action) {
    case "created":
    case "new_permissions_accepted": {
      // 누가 접근 가능한지는 설치 콜백(/api/github/setup)이 검증해 기록한다 — 여기서는 계정 정보만.
      const { error } = await service.from("github_installations").upsert({
        installation_id: installationId,
        account_login: event.installation.account.login,
        account_type: event.installation.account.type,
      });
      if (error) throw error;
      return { installation: installationId, action: event.action };
    }
    case "suspend":
    case "unsuspend": {
      const { error } = await service
        .from("github_installations")
        .update({ suspended_at: event.action === "suspend" ? new Date().toISOString() : null })
        .eq("installation_id", installationId);
      if (error) throw error;
      return { installation: installationId, action: event.action };
    }
    case "deleted": {
      // 행을 지우면 연결·빌드 이력까지 cascade로 사라진다. 이력은 남기고 연결만 끊는다.
      const now = new Date().toISOString();
      const results = await Promise.all([
        service.from("github_installations").update({ suspended_at: now }).eq("installation_id", installationId),
        service.from("github_installation_access").delete().eq("installation_id", installationId),
        service
          .from("project_repositories")
          .update({ disconnected_at: now })
          .eq("installation_id", installationId)
          .is("disconnected_at", null),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      return { installation: installationId, action: event.action };
    }
  }
}

async function handleInstallationRepositories(service: ServiceClient, event: InstallationRepositoriesEvent) {
  const removedIds = event.action === "removed" ? event.repositories_removed.map((repo) => repo.id) : [];
  if (removedIds.length === 0) return { ignored: event.action };

  const { error } = await service
    .from("project_repositories")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("installation_id", event.installation.id)
    .in("repo_id", removedIds)
    .is("disconnected_at", null);
  if (error) throw error;
  return { installation: event.installation.id, disconnectedRepos: removedIds.length };
}

async function handleRepository(service: ServiceClient, event: RepositoryEvent) {
  if (event.action !== "renamed" && event.action !== "transferred") return { ignored: event.action };
  const { error } = await service
    .from("project_repositories")
    .update({ repo_full_name: event.repository.full_name })
    .eq("repo_id", event.repository.id);
  if (error) throw error;
  return { repo: event.repository.full_name, action: event.action };
}
