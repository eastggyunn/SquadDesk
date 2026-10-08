import { CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";
import type { BugStatus } from "@/lib/types";

const STATUS_ICONS: Record<BugStatus, typeof Circle> = {
  Open: Circle,
  "In Progress": CircleDot,
  Resolved: CheckCircle2,
  Closed: XCircle,
};

const STATUS_COLORS: Record<BugStatus, string> = {
  Open: "text-red-400",
  "In Progress": "text-blue-400",
  Resolved: "text-emerald-400",
  Closed: "text-zinc-600",
};

export function BugStatusIcon({ status }: { status: BugStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span title={status} className="inline-flex shrink-0">
      <Icon className={`h-4 w-4 ${STATUS_COLORS[status]}`} />
    </span>
  );
}
