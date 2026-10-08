"use client";

import Link from "next/link";
import { Calendar, ListChecks } from "lucide-react";
import type { Task } from "@/lib/types";
import { PriorityBadge, PRIORITY_ORDER } from "@/components/kanban/priority-badge";
import { ErrorAlert } from "@/components/ui/error-alert";
import { isMyOpenTask } from "@/lib/dashboard-metrics";

interface MyTasksWidgetProps {
  tasks: Task[];
  currentUserName: string;
  isLoading: boolean;
  error: string | null;
}

export function MyTasksWidget({ tasks, currentUserName, isLoading, error }: MyTasksWidgetProps) {
  const myTasks = tasks
    .filter((task) => isMyOpenTask(task, currentUserName))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 4);

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-zinc-200">내 작업</h2>
        </div>
        <Link href="/kanban" className="text-xs text-zinc-500 hover:text-cyan-400">
          전체보기 →
        </Link>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorAlert message={error} />
        </div>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {isLoading ? (
            <li className="rounded-lg bg-zinc-950/50 p-3 text-center text-xs text-zinc-600">
              불러오는 중입니다...
            </li>
          ) : myTasks.length > 0 ? (
            myTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start justify-between gap-3 rounded-lg bg-zinc-950/50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-100">{task.title}</p>
                  {task.dueDate && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                      <Calendar className="h-3 w-3" />
                      {task.dueDate}
                    </p>
                  )}
                </div>
                <PriorityBadge priority={task.priority} />
              </li>
            ))
          ) : (
            <li className="rounded-lg bg-zinc-950/50 p-3 text-center text-xs text-zinc-600">
              할당된 작업이 없습니다
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
