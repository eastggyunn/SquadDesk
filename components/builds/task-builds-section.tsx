"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Link2, Package, X } from "lucide-react";
import { useProjectBuilds } from "@/lib/supabase/hooks/use-project-builds";
import { useBuildLinks } from "@/lib/supabase/hooks/use-build-links";
import { buildDownloadHref, buildTitle } from "@/lib/supabase/repositories/builds";
import { formatRelativeTime } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { ErrorAlert } from "@/components/ui/error-alert";

interface TaskBuildsSectionProps {
  taskId: string;
  projectId: string;
}

/**
 * 태스크 서랍의 "빌드" 섹션: 이 작업이 들어간(연결된) 빌드를 받고, 최근 빌드를 골라 연결한다.
 * 프로젝트에 빌드가 하나도 없으면(저장소 미연결) 섹션 자체를 그리지 않는다.
 */
export function TaskBuildsSection({ taskId, projectId }: TaskBuildsSectionProps) {
  const { builds } = useProjectBuilds(projectId);
  const { links, error, link, unlink } = useBuildLinks(projectId);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  if (builds.length === 0) return null;

  const taskLinks = links.filter((row) => row.task_id === taskId);
  const buildById = new Map(builds.map((build) => [build.id, build]));
  const linkedBuildIds = new Set(taskLinks.map((row) => row.build_id));
  const candidates = builds.filter((build) => !linkedBuildIds.has(build.id)).slice(0, 20);

  return (
    <section className="mt-8 border-t border-zinc-800 pt-6" aria-label="빌드">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Package className="h-4 w-4 text-zinc-500" />
          빌드
          {taskLinks.length > 0 && <span className="text-xs font-medium text-zinc-500">{taskLinks.length}</span>}
        </h3>
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setIsPickerOpen((open) => !open)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 transition-[transform,color,background-color] duration-150 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
        >
          <Link2 className="h-3.5 w-3.5" />
          빌드 연결
        </button>
      </div>

      <ErrorAlert message={error} className="mt-3 !text-xs" />

      {taskLinks.length === 0 && (
        <p className="mt-3 text-sm text-zinc-500">이 작업을 확인할 빌드를 연결하면 담당자에게 알림이 갑니다.</p>
      )}

      <ul className={taskLinks.length > 0 ? "mt-3 flex flex-col gap-1.5" : undefined}>
        <AnimatePresence initial={false}>
          {taskLinks.map((row) => {
            const build = buildById.get(row.build_id);
            if (!build) return null;
            return (
              <motion.li
                key={row.id}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0, transition: SPRING.exit }}
                transition={SPRING.collapse}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                  <span className="font-mono text-xs font-semibold text-cyan-400">{build.version_label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-zinc-200">{buildTitle(build)}</p>
                    <p className="text-[11px] text-zinc-500">
                      {build.name} · {formatRelativeTime(build.created_at)}
                    </p>
                  </div>
                  {build.expired_at ? (
                    <span className="text-[11px] text-zinc-500">만료됨</span>
                  ) : (
                    <a
                      href={buildDownloadHref(build.id)}
                      aria-label={`${build.version_label} 다운로드`}
                      title="다운로드"
                      className="rounded-md p-1.5 text-zinc-400 transition-[transform,color] duration-150 hover:text-cyan-400 active:scale-90"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void unlink(row.id)}
                    aria-label={`${build.version_label} 연결 해제`}
                    title="연결 해제"
                    className="rounded-md p-1.5 text-zinc-500 transition-[transform,color] duration-150 hover:text-zinc-200 active:scale-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <AnchoredPopover
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        anchorRef={anchorRef}
        placement="bottom"
        align="end"
        widthClassName="w-72"
      >
        <p className="px-1 pb-2 text-xs font-medium text-zinc-400">최근 빌드</p>
        <ul className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="px-2 py-3 text-center text-xs text-zinc-500">연결할 수 있는 빌드가 없습니다.</li>
          )}
          {candidates.map((build) => (
            <li key={build.id}>
              <button
                type="button"
                onClick={() => {
                  void link(build.id, { taskId });
                  setIsPickerOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-zinc-800"
              >
                <span className="w-9 shrink-0 font-mono text-xs font-semibold text-cyan-400">
                  {build.version_label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-zinc-200">{buildTitle(build)}</span>
                  <span className="block text-[11px] text-zinc-500">{formatRelativeTime(build.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </AnchoredPopover>
    </section>
  );
}
