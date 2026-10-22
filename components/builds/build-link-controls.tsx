"use client";

import { useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList, Flag, Link2, Search, X } from "lucide-react";
import type { Sprint } from "@/lib/types";
import type { BuildLinkRow } from "@/lib/supabase/schema";
import type { BuildLinkTarget } from "@/lib/supabase/repositories/builds";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { SegmentedIndicator } from "@/components/ui/segmented-indicator";
import { segmentedGroup, segmentedItem } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";

export type LinkableTask = { id: string; title: string };

interface BuildLinkControlsProps {
  /** 이 빌드에 걸린 연결만. */
  links: BuildLinkRow[];
  tasks: LinkableTask[];
  sprints: Sprint[];
  onLink: (target: BuildLinkTarget) => void;
  onUnlink: (linkId: string) => void;
}

/** 빌드 행의 연결 칩(태스크·스프린트) + [연결] 팝오버. */
export function BuildLinkControls({ links, tasks, sprints, onLink, onUnlink }: BuildLinkControlsProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const taskTitle = new Map(tasks.map((task) => [task.id, task.title]));
  const sprintName = new Map(sprints.map((sprint) => [sprint.id, sprint.name]));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* 연결/해제한 칩만 톡 나타나고 사라진다 — 처음 그릴 때는 움직이지 않는다. */}
      <AnimatePresence initial={false}>
        {links.map((link) => {
          const label = link.task_id
            ? taskTitle.get(link.task_id)
            : link.sprint_id
              ? sprintName.get(link.sprint_id)
              : null;
          const Icon = link.task_id ? ClipboardList : Flag;
          return (
            <motion.span
              key={link.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: SPRING.exit }}
              transition={SPRING.popover}
              className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 py-0.5 pl-2 pr-1 text-[11px] text-zinc-300"
            >
              <Icon className="h-3 w-3 shrink-0 text-zinc-500" />
              <span className="truncate">{label ?? "알 수 없음"}</span>
              <button
                type="button"
                onClick={() => onUnlink(link.id)}
                aria-label={`${label ?? ""} 연결 해제`}
                className="rounded-full p-0.5 text-zinc-500 transition-[transform,color] duration-150 hover:text-zinc-200 active:scale-90"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.span>
          );
        })}
      </AnimatePresence>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500 transition-[transform,color,border-color] duration-150 hover:border-zinc-500 hover:text-zinc-300 active:scale-95"
      >
        <Link2 className="h-3 w-3" />
        연결
      </button>
      <AnchoredPopover
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        placement="bottom"
        widthClassName="w-72"
      >
        <BuildLinkPicker
          tasks={tasks}
          sprints={sprints}
          linkedTaskIds={new Set(links.flatMap((link) => (link.task_id ? [link.task_id] : [])))}
          linkedSprintIds={new Set(links.flatMap((link) => (link.sprint_id ? [link.sprint_id] : [])))}
          onPick={(target) => {
            onLink(target);
            setIsOpen(false);
          }}
        />
      </AnchoredPopover>
    </div>
  );
}

function BuildLinkPicker({
  tasks,
  sprints,
  linkedTaskIds,
  linkedSprintIds,
  onPick,
}: {
  tasks: LinkableTask[];
  sprints: Sprint[];
  linkedTaskIds: Set<string>;
  linkedSprintIds: Set<string>;
  onPick: (target: BuildLinkTarget) => void;
}) {
  const indicatorId = useId();
  const [kind, setKind] = useState<"task" | "sprint">("task");
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLowerCase();
  const options =
    kind === "task"
      ? tasks
          .filter((task) => !keyword || task.title.toLowerCase().includes(keyword))
          .map((task) => ({ id: task.id, label: task.title, linked: linkedTaskIds.has(task.id) }))
      : sprints.map((sprint) => ({ id: sprint.id, label: sprint.name, linked: linkedSprintIds.has(sprint.id) }));

  return (
    <div className="flex flex-col gap-2">
      <div className={`${segmentedGroup} w-full`}>
        {(["task", "sprint"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={`relative flex-1 ${segmentedItem} border-transparent ${
              kind === value ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {kind === value && <SegmentedIndicator layoutId={indicatorId} />}
            <span className="relative">{value === "task" ? "태스크" : "스프린트"}</span>
          </button>
        ))}
      </div>
      {kind === "task" && (
        <label className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="태스크 검색"
            className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </label>
      )}
      <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
        {options.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-zinc-500">
            {kind === "task" ? "연결할 태스크가 없습니다." : "스프린트가 없습니다. 칸반 보드에서 만들 수 있습니다."}
          </li>
        )}
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              disabled={option.linked}
              onClick={() => onPick(kind === "task" ? { taskId: option.id } : { sprintId: option.id })}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-zinc-200 transition-colors duration-150 hover:bg-zinc-800 disabled:cursor-default disabled:text-zinc-500 disabled:hover:bg-transparent"
            >
              <span className="truncate">{option.label}</span>
              {option.linked && <span className="shrink-0 text-[11px]">연결됨</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
