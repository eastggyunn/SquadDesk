"use client";

import Link from "next/link";
import { AlertTriangle, MapPin } from "lucide-react";
import type { Bug } from "@/lib/types";
import { SeverityBadge, SEVERITY_ORDER } from "@/components/bugs/severity-badge";
import { ErrorAlert } from "@/components/ui/error-alert";
import { isOpenCriticalBug } from "@/lib/dashboard-metrics";

interface CriticalBugsWidgetProps {
  bugs: Bug[];
  isLoading: boolean;
  error: string | null;
}

export function CriticalBugsWidget({ bugs, isLoading, error }: CriticalBugsWidgetProps) {
  const criticalBugs = bugs
    .filter(isOpenCriticalBug)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-zinc-200">치명적 버그</h2>
        </div>
        <Link href="/bugs" className="text-xs text-zinc-500 hover:text-red-400">
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
          ) : criticalBugs.length > 0 ? (
            criticalBugs.map((bug) => (
              <li
                key={bug.id}
                className={`rounded-lg border p-3 ${
                  bug.severity === "Blocker"
                    ? "border-red-500/30 bg-zinc-950/50"
                    : "border-zinc-800/60 bg-zinc-950/50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug text-zinc-100">{bug.title}</p>
                  <SeverityBadge severity={bug.severity} />
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500">
                  <MapPin className="h-3 w-3" />
                  {bug.location}
                </p>
              </li>
            ))
          ) : (
            <li className="rounded-lg bg-zinc-950/50 p-3 text-center text-xs text-zinc-600">
              치명적 버그가 없습니다
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
