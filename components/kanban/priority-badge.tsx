import type { TaskPriority } from "@/lib/types";

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const LEVEL: Record<TaskPriority, number> = { High: 3, Medium: 2, Low: 1 };
const LIT_BAR: Record<TaskPriority, string> = {
  High: "bg-orange-400",
  Medium: "bg-zinc-300",
  Low: "bg-zinc-300",
};

/** 우선순위를 막대 3개(채워진 개수 = 단계)로 표시한다. 카드처럼 좁은 곳은 showLabel={false}. */
export function PriorityBadge({ priority, showLabel = true }: { priority: TaskPriority; showLabel?: boolean }) {
  return (
    <span
      title={`우선순위 ${priority}`}
      className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-zinc-400"
    >
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[5, 8, 11].map((height, index) => (
          <span
            key={height}
            style={{ height }}
            className={`w-[3px] rounded-[1px] ${index < LEVEL[priority] ? LIT_BAR[priority] : "bg-zinc-700"}`}
          />
        ))}
      </span>
      {showLabel ? priority : <span className="sr-only">{priority}</span>}
    </span>
  );
}
