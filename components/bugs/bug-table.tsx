import type { KeyboardEvent } from "react";
import { Paperclip, SearchX } from "lucide-react";
import type { Bug } from "@/lib/types";
import { getAvatarColor } from "@/lib/avatar-color";
import { SeverityBadge } from "./severity-badge";
import { BugStatusIcon } from "./bug-status-icon";
import { SurfaceAnchor } from "@/components/ui/surface-anchor";
import { surfaceLayoutId } from "@/lib/motion";

const GRID_COLS = "grid-cols-[40px_92px_minmax(0,1fr)_120px_130px_90px_60px]";

interface BugTableProps {
  bugs: Bug[];
  onSelectBug: (bug: Bug) => void;
  onToggleStatus: (bug: Bug) => void;
  /** 지금 서랍으로 열려 있는 버그 — 그 행은 칸반 카드처럼 서랍으로 이어지고 내용이 잠시 사라진다. */
  expandedBugId?: string;
}

export function BugTable({ bugs, onSelectBug, onToggleStatus, expandedBugId }: BugTableProps) {
  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, bug: Bug) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectBug(bug);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <div
        className={`grid ${GRID_COLS} gap-2 border-b border-zinc-800/60 bg-zinc-900/60 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500`}
      >
        <span className="text-center">상태</span>
        <span>치명도</span>
        <span>버그 제목</span>
        <span>발생 위치</span>
        <span>담당자</span>
        <span>등록일</span>
      </div>

      {bugs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 bg-zinc-900/30 py-16">
          <SearchX className="h-10 w-10 text-zinc-700" />
          <p className="text-sm text-zinc-600">조건에 일치하는 버그 리포트가 없습니다.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-800/60 overflow-clip">
        {/* overflow-clip: 서랍이 열린 동안 framer가 행 배경(SurfaceAnchor)을 서랍 크기로 옮겨 두는데, 그게 스크롤 영역을 키워 스크롤바가 생겼다 사라지며 화면이 튀지 않도록 여기서 잘라 둔다(clip은 스크롤 영역을 만들지 않는다). */}
        {bugs.map((bug) => {
          const isBlocker = bug.severity === "Blocker";
          const initials = bug.reporter.name.slice(0, 1);

          return (
            <SurfaceAnchor
              key={bug.id}
              layoutId={surfaceLayoutId("bug", bug.id)}
              radius={8}
              isExpanded={bug.id === expandedBugId}
            >
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelectBug(bug)}
              onKeyDown={(event) => handleRowKeyDown(event, bug)}
              className={`grid ${GRID_COLS} w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-800/40 ${
                isBlocker ? "bg-red-500/[0.04]" : "bg-zinc-900/30"
              }`}
            >
              <span className="flex justify-center">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleStatus(bug);
                  }}
                  title="Open ↔ Resolved 전환"
                  className="rounded p-0.5 transition-transform active:scale-90"
                >
                  <BugStatusIcon status={bug.status} />
                </button>
              </span>
              <span>
                <SeverityBadge severity={bug.severity} />
              </span>
              <span className="truncate text-sm text-zinc-100">{bug.title}</span>
              <span className="truncate text-xs text-zinc-500">{bug.location}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
                    bug.reporter.name
                  )}`}
                >
                  {initials}
                </span>
                <span className="truncate text-xs text-zinc-300">{bug.reporter.name}</span>
              </span>
              <span className="truncate text-xs text-zinc-500">{bug.createdAt}</span>
            </div>
            </SurfaceAnchor>
          );
        })}
        </div>
      )}
    </div>
  );
}
