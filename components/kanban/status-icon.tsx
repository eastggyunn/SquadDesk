import type { TaskStatus } from "@/lib/types";

// 진행 정도를 원의 채움으로 표시한다 — 색만이 아니라 모양으로도 상태를 구분할 수 있게.
const FILL: Record<TaskStatus, number> = { Todo: 0, "In Progress": 0.5, QA: 0.75, Done: 1 };
const COLOR: Record<TaskStatus, string> = {
  Todo: "text-zinc-500",
  "In Progress": "text-blue-400",
  QA: "text-amber-400",
  Done: "text-emerald-400",
};
const PIE_RADIUS = 3;
const PIE_CIRCUMFERENCE = 2 * Math.PI * PIE_RADIUS;

export function StatusIcon({ status }: { status: TaskStatus }) {
  const fill = FILL[status];

  return (
    <svg viewBox="0 0 14 14" className={`h-3.5 w-3.5 shrink-0 ${COLOR[status]}`} aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill={fill === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" />
      {fill > 0 && fill < 1 && (
        <circle
          cx="7"
          cy="7"
          r={PIE_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={PIE_RADIUS * 2}
          strokeDasharray={`${fill * PIE_CIRCUMFERENCE} ${PIE_CIRCUMFERENCE}`}
          transform="rotate(-90 7 7)"
        />
      )}
      {fill === 1 && (
        <path d="M4.5 7.2 6.2 8.8 9.5 5.4" fill="none" stroke="rgb(var(--neutral-950))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
