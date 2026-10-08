"use client";

import { Activity, Bone, Bug, CheckCircle2, Figma, GitCommit, MessageSquare, type LucideIcon } from "lucide-react";
import { MOCK_ACTIVITY, type ActivityKind as MockActivityKind } from "@/lib/mock-activity";
import { formatRelativeTime } from "@/lib/format";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { ActivityEntry } from "@/lib/supabase/repositories/dashboard";

type DisplayKind = MockActivityKind | ActivityEntry["kind"];

interface DisplayActivityItem {
  id: string;
  kind: DisplayKind;
  authorName: string;
  description: string;
  timestampLabel: string;
}

const KIND_STYLES: Record<DisplayKind, { icon: LucideIcon; className: string }> = {
  commit: { icon: GitCommit, className: "bg-cyan-500/15 text-cyan-400" },
  asset: { icon: Bone, className: "bg-violet-500/15 text-violet-400" },
  bug: { icon: Bug, className: "bg-red-500/15 text-red-400" },
  design: { icon: Figma, className: "bg-pink-500/15 text-pink-400" },
  task: { icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-400" },
  chat: { icon: MessageSquare, className: "bg-amber-500/15 text-amber-400" },
};

interface RecentActivityWidgetProps {
  /** false(로컬 데모)면 MOCK_ACTIVITY를 그대로 쓰고, activity/isLoading/error는 무시한다. */
  supabaseMode: boolean;
  activity: ActivityEntry[];
  isLoading: boolean;
  error: string | null;
}

/**
 * 최근 활동. Supabase 모드에서는 MOCK_ACTIVITY를 쓰지 않는다 — 활성 프로젝트의
 * 작업/버그/에셋 동기화/채팅 메시지에서 모은 실데이터(useDashboardData)만 보여준다.
 */
export function RecentActivityWidget({ supabaseMode, activity, isLoading, error }: RecentActivityWidgetProps) {
  const items: DisplayActivityItem[] = supabaseMode
    ? activity.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        authorName: entry.author.name,
        description: entry.summary,
        timestampLabel: formatRelativeTime(entry.createdAt),
      }))
    : MOCK_ACTIVITY.map((item) => ({
        id: item.id,
        kind: item.kind,
        authorName: item.author.name,
        description: item.action,
        timestampLabel: item.timestamp,
      }));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-zinc-200">최근 활동</h2>
      </div>

      {supabaseMode && error ? (
        <div className="mt-4">
          <ErrorAlert message={error} />
        </div>
      ) : supabaseMode && isLoading ? (
        <p className="mt-4 text-center text-xs text-zinc-600">불러오는 중입니다...</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-center text-xs text-zinc-600">최근 활동이 없습니다</p>
      ) : (
        <ol className="mt-4">
          {items.map((item, index) => {
            const { icon: KindIcon, className } = KIND_STYLES[item.kind];
            const isLast = index === items.length - 1;

            return (
              <li key={item.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${className}`}
                  >
                    <KindIcon className="h-3.5 w-3.5" />
                  </span>
                  {!isLast && <span className="my-1 w-px flex-1 bg-zinc-800" />}
                </div>
                <div className={isLast ? "pb-0" : "pb-4"}>
                  <p className="text-sm text-zinc-300">
                    <span className="font-medium text-zinc-100">{item.authorName}</span>
                    <span className="text-zinc-500"> · {item.description}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600">{item.timestampLabel}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
