import type { BugSeverity } from "@/lib/types";

export const SEVERITY_ORDER: Record<BugSeverity, number> = {
  Blocker: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export const SEVERITY_STYLES: Record<BugSeverity, string> = {
  Blocker: "bg-red-500/15 text-red-400 border-red-500/30",
  High: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Low: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

export function SeverityBadge({ severity }: { severity: BugSeverity }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}
