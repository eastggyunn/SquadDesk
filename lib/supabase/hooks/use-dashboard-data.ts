"use client";

import { useCallback, useEffect, useState } from "react";
import type { Bug, Task } from "@/lib/types";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as dashboardRepo from "@/lib/supabase/repositories/dashboard";
import type { ActivityEntry } from "@/lib/supabase/repositories/dashboard";

const ACTIVITY_LIMIT = 8;

interface UseDashboardDataResult {
  tasks: Task[];
  bugs: Bug[];
  activity: ActivityEntry[];
  isLoading: boolean;
  error: string | null;
}

/**
 * 대시보드 전용 읽기 훅. 칸반/버그 화면의 useSupabaseTasks/useSupabaseBugs(CRUD 훅)와는
 * 별개로, dashboardRepo.loadDashboardSnapshot() 한 번의 호출로 작업·버그·최근 활동을
 * 전부 가져온다 — tasks/bugs 테이블은 그 안에서 정확히 한 번씩만 조회되고, 대시보드의
 * 여러 위젯(건강 요약·내 작업·치명적 버그·최근 활동)이 그 결과를 나눠 쓴다.
 *
 * 프로젝트를 빠르게 연속 전환하면 먼저 보낸 요청이 나중에 도착할 수 있다(예: A → B로
 * 바꿨는데 A의 응답이 B의 응답보다 늦게 옴). generation 카운터로 "가장 최근에 시작한
 * 요청"만 상태를 반영하게 해 늦게 도착한 이전 프로젝트 응답이 지금 프로젝트 화면을
 * 덮어쓰지 않게 한다(useLatestRequest). projectId가 null로 바뀌는 경우도 놓치지 않도록
 * 요청 등록을 항상 맨 먼저 한다.
 *
 * 쓰기 기능은 없다(읽기 전용) — 대시보드에서 작업/버그를 만들거나 고치지 않는다.
 * 프로젝트가 보관 상태여도 조회 자체는 RLS가 허용하므로 그대로 동작한다.
 */
export function useDashboardData(projectId: string | null): UseDashboardDataResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginRequest = useLatestRequest();

  const refetch = useCallback(async () => {
    // 이 요청(또는 이 이펙트가 실행됐다는 사실 자체)을 최신 세대로 등록한다 — projectId가
    // null로 바뀌는 경우를 포함해 항상 가장 먼저 실행되어야, 그 이전에 떠 있던 요청이
    // 뒤늦게 도착해도 "낡은 세대"로 판정되어 무시된다.
    const { isCurrent, signal } = beginRequest();

    if (!projectId) {
      setTasks([]);
      setBugs([]);
      setActivity([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const snapshot = await dashboardRepo.loadDashboardSnapshot(supabase, projectId, ACTIVITY_LIMIT);
      if (!isCurrent()) return; // 그 사이 다른 프로젝트로 전환됨 — 이 응답은 버린다.
      setTasks(snapshot.tasks);
      setBugs(snapshot.bugs);
      setActivity(snapshot.activity);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "대시보드 데이터를 불러오지 못했습니다.");
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [projectId, beginRequest]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tasks, bugs, activity, isLoading, error };
}
