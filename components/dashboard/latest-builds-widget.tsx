"use client";

import Link from "next/link";
import { Download, Package } from "lucide-react";
import { useProjectBuilds } from "@/lib/supabase/hooks/use-project-builds";
import { useProjectRepositories } from "@/lib/supabase/hooks/use-project-repositories";
import { buildDownloadHref, buildTitle } from "@/lib/supabase/repositories/builds";
import { formatFileSize, formatRelativeTime } from "@/lib/format";
import { ErrorAlert } from "@/components/ui/error-alert";
import { primaryButtonSm } from "@/components/ui/button-styles";

/**
 * 연결된 저장소마다 가장 최근 빌드 1건 + 다운로드. 저장소를 연결하지 않은 프로젝트에서는 그리지 않는다 —
 * 빌드 연동을 쓰지 않는 팀의 대시보드에 빈 위젯을 남기지 않기 위해서다.
 * 동기화 에셋(asset_syncs)과는 파일 주인이 달라(GitHub) 별도 위젯으로 둔다.
 */
export function LatestBuildsWidget({ projectId }: { projectId: string }) {
  const { repositories } = useProjectRepositories(projectId);
  const { builds, isLoading, error } = useProjectBuilds(projectId);

  const activeRepositories = repositories.filter((repo) => !repo.disconnected_at);
  if (activeRepositories.length === 0) return null;

  // builds는 새것부터 정렬돼 있으므로 저장소별 첫 번째가 최신이다.
  const latest = activeRepositories.map((repo) => ({
    repo,
    build: builds.find((build) => build.repository_id === repo.id && !build.expired_at) ?? null,
  }));

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-zinc-200">최신 빌드</h2>
        </div>
        <Link href="/builds" className="text-xs text-zinc-500 hover:text-cyan-400">
          전체보기 →
        </Link>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorAlert message={error} />
        </div>
      ) : (
        <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
          {latest.map(({ repo, build }) => (
            <li
              key={repo.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-zinc-500">{repo.repo_full_name}</p>
                {build ? (
                  <>
                    <p className="mt-0.5 truncate text-sm text-zinc-100">
                      <span className="mr-1.5 font-mono font-semibold text-cyan-400">{build.version_label}</span>
                      {buildTitle(build)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {build.size_bytes !== null && `${formatFileSize(build.size_bytes)} · `}
                      {formatRelativeTime(build.created_at)}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm text-zinc-500">
                    {isLoading ? "불러오는 중입니다..." : "아직 받은 빌드가 없습니다"}
                  </p>
                )}
              </div>
              {build && (
                <a href={buildDownloadHref(build.id)} className={primaryButtonSm}>
                  <Download className="h-3.5 w-3.5" />
                  다운로드
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
