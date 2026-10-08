import { Fragment, type KeyboardEvent } from "react";
import type { Task } from "@/lib/types";
import { getAvatarColor } from "@/lib/avatar-color";
import { surfaceLayoutId } from "@/lib/motion";
import { SurfaceAnchor } from "@/components/ui/surface-anchor";
import { StatusBadge } from "./status-badge";
import { HEADER_HEIGHT, ROW_HEIGHT } from "./gantt-utils";

interface TaskListPanelProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  /** 막대가 없는(기간 미정) 작업 — 막대 대신 이 행이 서랍과 이어지는 표면이 된다. */
  barlessTaskIds: Set<string>;
  expandedTaskId?: string;
}

export function TaskListPanel({ tasks, onSelectTask, barlessTaskIds, expandedTaskId }: TaskListPanelProps) {
  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, task: Task) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelectTask(task);
  }

  return (
    // overflow-clip: 서랍과 이어진 행 배경(SurfaceAnchor)이 열린 동안 스크롤 영역을 키우지 않게 한다(GanttChart와 같은 이유).
    <div className="sticky left-0 z-20 w-64 shrink-0 overflow-clip border-r border-zinc-800/60 bg-zinc-900 sm:w-72">
      <div
        className="sticky top-0 z-30 flex items-center border-b border-zinc-800/60 bg-zinc-900/95 px-4 backdrop-blur"
        style={{ height: HEADER_HEIGHT }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">작업</span>
      </div>

      {tasks.map((task) => {
        const initials = task.assignee.name.slice(0, 1);
        const isBarless = barlessTaskIds.has(task.id);

        const row = (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectTask(task)}
            onKeyDown={(event) => handleRowKeyDown(event, task)}
            style={{ height: ROW_HEIGHT }}
            className="flex cursor-pointer items-center gap-2.5 border-b border-zinc-800/60 bg-zinc-900 px-4 transition-colors hover:bg-zinc-800/60"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
                task.assignee.name
              )}`}
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-100">{task.title}</p>
              <p className="truncate text-xs text-zinc-500">{isBarless ? `${task.assignee.name} · 기간 미정` : task.assignee.name}</p>
            </div>
            <StatusBadge status={task.status} />
          </div>
        );

        return isBarless ? (
          <SurfaceAnchor
            key={task.id}
            layoutId={surfaceLayoutId("task", task.id)}
            radius={0}
            isExpanded={task.id === expandedTaskId}
          >
            {row}
          </SurfaceAnchor>
        ) : (
          <Fragment key={task.id}>{row}</Fragment>
        );
      })}
    </div>
  );
}
