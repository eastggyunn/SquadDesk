"use client";

import { memo, useState } from "react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import type { Task } from "@/lib/types";
import type { WorkDomain } from "@/lib/store/work-domains-store";
import { DomainTaskTable } from "./domain-task-table";
import { SPRING } from "@/lib/motion";

interface DomainCardProps {
  domain: WorkDomain;
  tasks: Task[];
  bugCountsByTask: Map<string, number>;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  // 콜백은 영역 id를 받는 안정된 함수로 받는다 — 카드가 memo라 서랍을 열고 닫을 때
  // 해당 작업이 든 카드만 다시 그려지게 하기 위함이다.
  onRemoveDomain: (domainId: string) => void;
  onSelectTask: (task: Task) => void;
  /** 이 카드에 든 작업이 서랍으로 열려 있을 때만 주어진다. */
  expandedTaskId?: string;
  onAddTask: (domainId: string) => void;
}

export const DomainCard = memo(function DomainCard({
  domain,
  tasks,
  bugCountsByTask,
  dragHandleProps,
  onRemoveDomain,
  onSelectTask,
  expandedTaskId,
  onAddTask,
}: DomainCardProps) {
  const [isOpen, setIsOpen] = useState(true);

  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "Done").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center gap-2 p-5">
        <button
          type="button"
          {...dragHandleProps}
          title="드래그해서 순서 변경"
          className="shrink-0 cursor-grab rounded p-1 text-zinc-600 transition-colors hover:text-zinc-300 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <motion.span
            animate={{ rotate: isOpen ? 0 : -90 }}
            transition={SPRING.popover}
          >
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
          </motion.span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-sm font-semibold text-zinc-100">{domain.label}</h2>
              <span className="shrink-0 text-xs text-zinc-500">
                {done}/{total} 완료 · {progress}%
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onRemoveDomain(domain.id)}
          title="업무 영역 삭제"
          className="shrink-0 rounded p-1.5 text-zinc-600 transition-colors hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING.collapse}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800/60 px-5 pb-5 pt-4">
              <DomainTaskTable
                tasks={tasks}
                bugCountsByTask={bugCountsByTask}
                onSelectTask={onSelectTask}
                expandedTaskId={expandedTaskId}
              />

              <button
                type="button"
                onClick={() => onAddTask(domain.id)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-400"
              >
                <Plus className="h-4 w-4" />
                하위 작업 추가
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
