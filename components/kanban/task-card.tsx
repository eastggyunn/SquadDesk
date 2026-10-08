"use client";

import { forwardRef, type PointerEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bone, ChevronLeft, ChevronRight, Clock, Figma, Paperclip } from "lucide-react";
import type { Task } from "@/lib/types";
import { getAvatarColor } from "@/lib/avatar-color";
import { PriorityBadge } from "./priority-badge";
import { SPRING, expandedContentTransition, surfaceLayoutId } from "@/lib/motion";

// Keeps a press on an inner button from also triggering the card's whileTap. Must run in
// the capture phase: React's bubble handlers fire only after framer's native card listener.
const stopButtonPress = (event: PointerEvent) => {
  if ((event.target as Element).closest("button")) event.stopPropagation();
};

/** "2026-10-11" → "10/11". 오늘이면 "오늘", 완료 전인데 지났으면 빨갛게 표시한다. */
function describeDue(dueDate: string, isDone: boolean) {
  const today = new Date().toLocaleDateString("sv-SE");
  if (dueDate === today) return { label: "오늘", isLate: !isDone };
  const [, month, day] = dueDate.split("-");
  return { label: `${Number(month)}/${Number(day)}`, isLate: !isDone && dueDate < today };
}

interface TaskCardProps {
  task: Task;
  /** 이 카드가 지금 서랍으로 열려 있는지. 열린 동안은 카드 내용을 감춘다(배경은 서랍으로 넘어가 있다). */
  isExpanded?: boolean;
  /** 카드에 태그로 보여줄 업무 영역 이름. 없으면 태그를 숨긴다. */
  domainLabel?: string;
  isFirstColumn: boolean;
  isLastColumn: boolean;
  onEdit: (task: Task) => void;
  onRequestMove: (task: Task, direction: "prev" | "next") => void;
}

// forwardRef: AnimatePresence popLayout's PopChild attaches a ref to measure exiting cards.
export const TaskCard = forwardRef<HTMLDivElement, TaskCardProps>(function TaskCard(
  { task, domainLabel, isExpanded = false, isFirstColumn, isLastColumn, onEdit, onRequestMove },
  ref
) {
  const shouldReduceMotion = useReducedMotion();
  const initials = task.assignee.name.slice(0, 1);
  const figmaAttachment = task.attachments?.find((item) => item.kind === "figma");
  const spineAttachment = task.attachments?.find((item) => item.kind === "spine");
  const hasLinkedAssets = Boolean(figmaAttachment || spineAttachment);
  const attachmentCount = task.attachments?.length ?? 0;
  const due = task.dueDate ? describeDue(task.dueDate, task.status === "Done") : null;

  return (
    <motion.div
      ref={ref}
      layout
      layoutId={task.id}
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
      transition={
        shouldReduceMotion ? { duration: 0.15 } : { type: "spring", duration: 0.4, bounce: 0.15 }
      }
      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      // whileTap auto-adds tabIndex=0; keep cards out of the tab order as before.
      tabIndex={-1}
      onPointerDownCapture={stopButtonPress}
      onClick={() => onEdit(task)}
      className="group relative cursor-pointer p-3.5 outline-none"
    >
      {/* 카드 배경 — 서랍 배경과 layoutId를 공유해 카드가 그대로 커지며 서랍이 된다. */}
      <motion.div
        layoutId={surfaceLayoutId("task", task.id)}
        transition={SPRING.sheet}
        style={{ borderRadius: 12 }}
        className="absolute inset-0 border border-zinc-800/80 bg-zinc-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition-colors group-hover:border-zinc-700"
      />

      {!isFirstColumn && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRequestMove(task, "prev");
          }}
          title="이전 단계로 이동"
          className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-950/90 p-1 text-zinc-400 opacity-0 shadow-lg transition-[opacity,color,transform] duration-150 hover:text-cyan-400 group-hover:opacity-100 active:scale-90"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      {!isLastColumn && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRequestMove(task, "next");
          }}
          title="다음 단계로 이동"
          className="absolute right-0 top-1/2 z-10 translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-zinc-950/90 p-1 text-zinc-400 opacity-0 shadow-lg transition-[opacity,color,transform] duration-150 hover:text-cyan-400 group-hover:opacity-100 active:scale-90"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <motion.div
        className="relative"
        initial={false}
        animate={{ opacity: isExpanded ? 0 : 1 }}
        transition={expandedContentTransition(isExpanded)}
      >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug text-zinc-100">{task.title}</p>
        <PriorityBadge priority={task.priority} showLabel={false} />
      </div>

      {domainLabel && (
        <span className={`mt-2.5 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${getAvatarColor(domainLabel)}`}>
          {domainLabel}
        </span>
      )}

      <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
        {due && (
          <span className={`flex items-center gap-1 ${due.isLate ? "font-medium text-red-400" : ""}`}>
            <Clock className="h-3 w-3" />
            {due.label}
          </span>
        )}
        {attachmentCount > 0 && (
          <span className="flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {attachmentCount}
          </span>
        )}

        {hasLinkedAssets && (
          <div className="flex items-center gap-1.5">
            {figmaAttachment && (
              <button
                type="button"
                      onClick={(event) => {
                  event.stopPropagation();
                  if (figmaAttachment.url) {
                    window.open(
                      figmaAttachment.url.startsWith("http")
                        ? figmaAttachment.url
                        : `https://${figmaAttachment.url}`,
                      "_blank"
                    );
                  } else {
                    onEdit(task);
                  }
                }}
                title={figmaAttachment.url ? `Figma 시안 열기: ${figmaAttachment.name}` : "Figma 시안 연동"}
                className="rounded-md bg-zinc-800/80 p-1 text-zinc-400 transition-[color,background-color,transform] duration-150 hover:bg-purple-500/20 hover:text-purple-400 active:scale-90"
              >
                <Figma className="h-3.5 w-3.5" />
              </button>
            )}
            {spineAttachment && (
              <button
                type="button"
                      onClick={(event) => {
                  event.stopPropagation();
                  if (spineAttachment.url) {
                    window.open(
                      spineAttachment.url.startsWith("http")
                        ? spineAttachment.url
                        : `https://${spineAttachment.url}`,
                      "_blank"
                    );
                  } else {
                    onEdit(task);
                  }
                }}
                title={spineAttachment.url ? `Spine 2D 에셋 열기: ${spineAttachment.name}` : "Spine 2D 에셋 연동"}
                className="rounded-md bg-zinc-800/80 p-1 text-zinc-400 transition-[color,background-color,transform] duration-150 hover:bg-emerald-500/20 hover:text-emerald-400 active:scale-90"
              >
                <Bone className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <span
          title={`${task.assignee.name} · ${task.assignee.role}`}
          className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
            task.assignee.name
          )}`}
        >
          {initials}
        </span>
      </div>
      </motion.div>
    </motion.div>
  );
});
