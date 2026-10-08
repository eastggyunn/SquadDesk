import type { TaskStatus } from "./types";

export const STATUS_ORDER: TaskStatus[] = ["Todo", "In Progress", "QA", "Done"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  Todo: "할 일",
  "In Progress": "진행 중",
  QA: "테스트/QA",
  Done: "완료",
};

export const STATUS_BAR_COLORS: Record<TaskStatus, string> = {
  Todo: "bg-zinc-500",
  "In Progress": "bg-blue-500",
  QA: "bg-amber-500",
  Done: "bg-emerald-500",
};

export const STATUS_BADGE_STYLES: Record<TaskStatus, string> = {
  Todo: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  "In Progress": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  QA: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};
