"use client";

import { AlertTriangle, Gauge, ListChecks } from "lucide-react";
import type { Bug, Task } from "@/lib/types";
import { ErrorAlert } from "@/components/ui/error-alert";
import { computeTaskCompletion, isMyOpenTask, isOpenCriticalBug } from "@/lib/dashboard-metrics";

interface ProjectHealthWidgetProps {
  tasks: Task[];
  bugs: Bug[];
  currentUserName: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * 대시보드 최상단 "프로젝트 건강 요약". 예전 알파 빌드 진행도 카드(하드코딩된
 * 62%, 지난 목표일 2026-08-05로 항상 D-0을 표시하던 버그)를 대체한다 — 목표일
 * 필드가 스키마에 없으므로 새로 만들지 않고 "목표일 정보 없음"으로 고정 표시한다.
 * 완료율은 (구)스프린트 요약 카드의 같은 계산과 중복이었으므로 이 카드로 합쳤다.
 */
export function ProjectHealthWidget({ tasks, bugs, currentUserName, isLoading, error }: ProjectHealthWidgetProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-6">
        <ErrorAlert message={error} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-6">
        <p className="text-center text-xs text-zinc-600">불러오는 중입니다...</p>
      </div>
    );
  }

  const { done, total, percent } = computeTaskCompletion(tasks);
  const openCriticalBugs = bugs.filter(isOpenCriticalBug).length;
  const myOpenTasks = tasks.filter((task) => isMyOpenTask(task, currentUserName)).length;

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">프로젝트 건강 요약</h2>
            <p className="mt-0.5 text-xs text-zinc-500">목표일 정보 없음</p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-4xl font-bold text-zinc-50">{percent}%</span>
          <span className="text-xs text-zinc-500">
            전체 작업 진행률 · {done}/{total} 완료
          </span>
        </div>
        <div className="mt-3 h-3.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-zinc-800 pt-5 sm:grid-cols-2">
        <div className="flex items-center gap-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.03] px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-zinc-300">
            열린 치명적 버그&nbsp;<span className="font-semibold text-zinc-50">{openCriticalBugs}건</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg bg-zinc-950/50 px-3 py-2.5">
          <ListChecks className="h-4 w-4 shrink-0 text-cyan-400" />
          <p className="text-sm text-zinc-300">
            내 미완료 작업&nbsp;<span className="font-semibold text-zinc-50">{myOpenTasks}건</span>
          </p>
        </div>
      </div>
    </div>
  );
}
