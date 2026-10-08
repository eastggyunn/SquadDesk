import type { Task } from "@/lib/types";
import { getAvatarColor } from "@/lib/avatar-color";
import { StatusBadge } from "./status-badge";
import { HEADER_HEIGHT, ROW_HEIGHT } from "./gantt-utils";

export function TaskListPanel({ tasks }: { tasks: Task[] }) {
  return (
    <div className="sticky left-0 z-20 w-64 shrink-0 border-r border-zinc-800/60 bg-zinc-900 sm:w-72">
      <div
        className="sticky top-0 z-30 flex items-center border-b border-zinc-800/60 bg-zinc-900/95 px-4 backdrop-blur"
        style={{ height: HEADER_HEIGHT }}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">작업</span>
      </div>

      {tasks.map((task) => {
        const initials = task.assignee.name.slice(0, 1);

        return (
          <div
            key={task.id}
            style={{ height: ROW_HEIGHT }}
            className="flex items-center gap-2.5 border-b border-zinc-800/60 bg-zinc-900 px-4"
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
              <p className="truncate text-xs text-zinc-500">{task.assignee.name}</p>
            </div>
            <StatusBadge status={task.status} />
          </div>
        );
      })}
    </div>
  );
}
