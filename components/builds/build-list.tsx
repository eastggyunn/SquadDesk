"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, ExternalLink, GitBranch, Package } from "lucide-react";
import type { Sprint } from "@/lib/types";
import type { BuildLinkRow, BuildRow, ProjectRepositoryRow } from "@/lib/supabase/schema";
import { buildDownloadHref, buildTitle, type BuildLinkTarget } from "@/lib/supabase/repositories/builds";
import { formatFileSize, formatRelativeTime } from "@/lib/format";
import { SegmentedIndicator } from "@/components/ui/segmented-indicator";
import { Select } from "@/components/ui/select";
import { primaryButtonSm, segmentedGroup, segmentedItem } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";
import { BuildLinkControls, type LinkableTask } from "./build-link-controls";

interface BuildListProps {
  builds: BuildRow[];
  repositories: ProjectRepositoryRow[];
  isLoading: boolean;
  /** 알림(?build=)으로 들어왔을 때 강조하고 보이게 스크롤할 빌드. */
  highlightBuildId: string | null;
  links: BuildLinkRow[];
  tasks: LinkableTask[];
  sprints: Sprint[];
  /** 스프린트 필터(칸반의 "빌드 N개"에서 ?sprint=로 들어오면 미리 골라져 있다). ALL_SPRINTS면 전체. */
  sprintFilter: string;
  onSprintFilterChange: (sprintId: string) => void;
  onLink: (buildId: string, target: BuildLinkTarget) => void;
  onUnlink: (linkId: string) => void;
}

export const ALL_SPRINTS = "all";

const ALL_REPOSITORIES = "all";
/** 알림으로 들어온 빌드를 강조하는 시간. 끝나면 배경이 duration-700으로 천천히 빠진다. */
const HIGHLIGHT_MS = 2500;

/** "owner/name"에서 저장소 이름만. */
function repoShortName(repository: ProjectRepositoryRow): string {
  return repository.repo_full_name.split("/")[1];
}

/** 빌드 목록: 버전·커밋·브랜치·크기·시각 + 다운로드/GitHub 링크. 저장소가 여럿이면 필터가 생긴다. */
export function BuildList({
  builds,
  repositories,
  isLoading,
  highlightBuildId,
  links,
  tasks,
  sprints,
  sprintFilter,
  onSprintFilterChange,
  onLink,
  onUnlink,
}: BuildListProps) {
  const indicatorId = useId();
  const [repositoryFilter, setRepositoryFilter] = useState(ALL_REPOSITORIES);
  const highlightRef = useRef<HTMLLIElement>(null);
  const [activeHighlightId, setActiveHighlightId] = useState(highlightBuildId);
  const repositoryById = new Map(repositories.map((repo) => [repo.id, repo]));
  const linksByBuild = new Map<string, BuildLinkRow[]>();
  for (const link of links) linksByBuild.set(link.build_id, [...(linksByBuild.get(link.build_id) ?? []), link]);
  const visibleBuilds = builds.filter(
    (build) =>
      (repositoryFilter === ALL_REPOSITORIES || build.repository_id === repositoryFilter) &&
      (sprintFilter === ALL_SPRINTS || linksByBuild.get(build.id)?.some((link) => link.sprint_id === sprintFilter))
  );

  useEffect(() => {
    setActiveHighlightId(highlightBuildId);
    if (!highlightBuildId) return;
    const timer = setTimeout(() => setActiveHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightBuildId]);

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeHighlightId, builds.length]);

  if (builds.length === 0) {
    if (isLoading) return null;
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-6 py-10 text-center">
        <Package className="h-5 w-5 text-zinc-500" />
        <p className="text-sm text-zinc-400">아직 받은 빌드가 없습니다. 연결한 저장소에 push하면 여기에 올라옵니다.</p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-300">빌드</h2>
        <div className="flex flex-wrap items-center gap-2">
          {sprints.length > 0 && (
            <Select
              aria-label="스프린트로 거르기"
              value={sprintFilter}
              onChange={onSprintFilterChange}
              options={[
                { value: ALL_SPRINTS, label: "모든 스프린트" },
                ...sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
              ]}
              className="min-w-[8rem] rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs font-medium text-zinc-200 focus:border-cyan-500 focus:outline-none"
            />
          )}
          {repositories.length > 1 && (
            <div className={segmentedGroup}>
              {[
                { id: ALL_REPOSITORIES, label: "전체" },
                ...repositories.map((repo) => ({ id: repo.id, label: repoShortName(repo) })),
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRepositoryFilter(option.id)}
                  className={`relative ${segmentedItem} border-transparent ${
                    repositoryFilter === option.id ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {repositoryFilter === option.id && <SegmentedIndicator layoutId={indicatorId} />}
                  <span className="relative">{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
        {/* 실시간으로 새 빌드가 들어올 때만 펼쳐진다 — 첫 표시와 필터 전환(key로 새로 마운트)은 움직이지 않는다. */}
        <AnimatePresence key={`${repositoryFilter}-${sprintFilter}`} initial={false}>
          {visibleBuilds.map((build) => {
            const repository = repositoryById.get(build.repository_id);
            const unavailableReason = build.expired_at
              ? "보관 기간이 지나 받을 수 없습니다"
              : repository?.disconnected_at
                ? "저장소 연결이 해제되었습니다"
                : null;
            const isHighlighted = build.id === activeHighlightId;
            return (
              <motion.li
                key={build.id}
                ref={isHighlighted ? highlightRef : undefined}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: SPRING.exit }}
                transition={SPRING.collapse}
                className="overflow-hidden"
              >
                <div
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors duration-700 ${
                    isHighlighted ? "bg-cyan-500/10" : ""
                  }`}
                >
                  <span className="w-12 shrink-0 font-mono text-sm font-semibold text-cyan-400">
                    {build.version_label}
                  </span>
                  <div className={`min-w-0 flex-1 ${unavailableReason ? "opacity-50" : ""}`}>
                    <p className="truncate text-sm text-zinc-100">{buildTitle(build)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                      <span className="truncate">{build.name}</span>
                      {repositories.length > 1 && repository && <span>· {repoShortName(repository)}</span>}
                      {build.branch && (
                        <span className="inline-flex items-center gap-0.5">
                          · <GitBranch className="h-3 w-3" />
                          {build.branch}
                        </span>
                      )}
                      {build.commit_sha && <span className="font-mono">· {build.commit_sha.slice(0, 7)}</span>}
                      {build.actor_login && <span>· {build.actor_login}</span>}
                      {build.size_bytes !== null && <span>· {formatFileSize(build.size_bytes)}</span>}
                      <span title={new Date(build.created_at).toLocaleString("ko-KR")}>
                        · {formatRelativeTime(build.created_at)}
                      </span>
                    </p>
                    <div className="mt-2">
                      <BuildLinkControls
                        links={linksByBuild.get(build.id) ?? []}
                        tasks={tasks}
                        sprints={sprints}
                        onLink={(target) => onLink(build.id, target)}
                        onUnlink={onUnlink}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {unavailableReason ? (
                      <span className="text-xs text-zinc-500">{unavailableReason}</span>
                    ) : (
                      <a href={buildDownloadHref(build.id)} className={primaryButtonSm}>
                        <Download className="h-3.5 w-3.5" />
                        다운로드
                      </a>
                    )}
                    <a
                      href={build.html_url}
                      target="_blank"
                      rel="noreferrer"
                      title="GitHub에서 보기"
                      aria-label="GitHub에서 보기"
                      className="rounded-lg p-1.5 text-zinc-500 transition-[transform,color] duration-150 hover:text-zinc-200 active:scale-90"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {visibleBuilds.length === 0 && <p className="text-xs text-zinc-500">조건에 맞는 빌드가 없습니다.</p>}
    </section>
  );
}
