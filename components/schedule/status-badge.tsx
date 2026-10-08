import type { TaskStatus } from "@/lib/types";
import { STATUS_BADGE_STYLES, STATUS_LABELS } from "@/lib/task-status";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
