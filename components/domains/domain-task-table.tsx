"use client";

import { Bug as BugIcon, Paperclip } from "lucide-react";
import type { Task } from "@/lib/types";
import { getAvatarColor } from "@/lib/avatar-color";
import { PriorityBadge } from "@/components/kanban/priority-badge";
import { StatusBadge } from "@/components/schedule/status-badge";
import { SurfaceAnchor } from "@/components/ui/surface-anchor";
import { surfaceLayoutId } from "@/lib/motion";

const GRID_COLS = "grid-cols-[64px_minmax(160px,1fr)_120px_170px_150px_56px_56px]";

function formatSchedule(task: Task) {
  const short = (value: string) => value.slice(5).replace("-", ".");

  if (task.startDate && task.dueDate) return `${short(task.startDate)} ~ ${short(task.dueDate)}`;
  if (task.dueDate) return `~ ${short(task.dueDate)}`;
  if (task.startDate) return `${short(task.startDate)} ~`;
  return "-";
}

interface DomainTaskTableProps {
  tasks: Task[];
  bugCountsByTask: Map<string, number>;
  onSelectTask: (task: Task) => void;
  /** 지금 서랍으로 열려 있는 작업 — 그 행은 칸반 카드처럼 서랍으로 이어지고 내용이 잠시 사라진다. */
  expandedTaskId?: string;
}

export function DomainTaskTable({ tasks, bugCountsByTask, onSelectTask, expandedTaskId }: DomainTaskTableProps) {
  if (tasks.length === 0) {
    return <p className="py-4 text-center text-xs text-zinc-600">아직 등록된 작업이 없습니다</p>;
  }

  return (
    // 좁은 화면에서 고정 폭 열들이 공간을 다 차지해도 제목 열이 0으로 줄지 않도록, 최소 폭 아래로는 가로 스크롤한다.
    <div className="overflow-x-auto rounded-lg border border-zinc-800/60">
      <div className="min-w-min">
        <div
          className={`grid ${GRID_COLS} gap-2 border-b border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500`}
        >
          <span>우선순위</span>
          <span>업무 항목</span>
          <span>상태</span>
          <span>담당자</span>
          <span>작업 일정</span>
          <span className="flex justify-center" title="첨부파일">
            <Paperclip className="h-3.5 w-3.5" />
          </span>
          <span className="flex justify-center" title="연관 버그">
            <BugIcon className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* overflow-clip: 서랍이 열린 동안 framer가 행 배경(SurfaceAnchor)을 서랍 크기로 옮겨 두는데, 그게 스크롤 영역을 키워 스크롤바가 생겼다 사라지며 화면이 튀지 않도록 여기서 잘라 둔다(clip은 스크롤 영역을 만들지 않는다). */}
        <div className="divide-y divide-zinc-800/60 overflow-clip">
          {tasks.map((task) => {
            const attachmentCount = task.attachments?.length ?? 0;
            const bugCount = bugCountsByTask.get(task.id) ?? 0;
            const initials = task.assignee.name.slice(0, 1);

            return (
              <SurfaceAnchor
                key={task.id}
                layoutId={surfaceLayoutId("task", task.id)}
                radius={8}
                isExpanded={task.id === expandedTaskId}
              >
              <button
                type="button"
                onClick={() => onSelectTask(task)}
                className={`grid ${GRID_COLS} w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/40`}
              >
                <span>
                  <PriorityBadge priority={task.priority} />
                </span>
                <span className="truncate text-sm text-zinc-100">{task.title}</span>
                <span>
                  <StatusBadge status={task.status} />
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
                      task.assignee.name
                    )}`}
                  >
                    {initials}
                  </span>
                  <span className="truncate text-xs text-zinc-300">{task.assignee.name}</span>
                </span>
                <span className="truncate text-xs text-zinc-500">{formatSchedule(task)}</span>
                <span
                  className="flex items-center justify-center gap-1 text-xs text-zinc-500"
                  title={attachmentCount > 0 ? `첨부파일 ${attachmentCount}개` : undefined}
                >
                  {attachmentCount > 0 && (
                    <>
                      <Paperclip className="h-3.5 w-3.5" />
                      {attachmentCount}
                    </>
                  )}
                </span>
                <span
                  className="flex items-center justify-center"
                  title={bugCount > 0 ? `연관 버그 ${bugCount}건` : undefined}
                >
                  {bugCount > 0 && <BugIcon className="h-3.5 w-3.5 text-rose-400" />}
                </span>
              </button>
              </SurfaceAnchor>
            );
          })}
        </div>
      </div>
    </div>
  );
}
