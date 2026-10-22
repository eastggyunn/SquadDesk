"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuildRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import { listProjectBuilds } from "@/lib/supabase/repositories/builds";

interface UseProjectBuildsResult {
  builds: BuildRow[];
  /** 첫 조회 중에만 true — 실시간 재조회는 목록을 비우지 않는다. */
  isLoading: boolean;
  error: string | null;
}

/**
 * 빌드 목록. webhook이 새 빌드를 넣거나 다운로드에서 만료가 기록되면 builds postgres_changes로
 * 받아 조용히 다시 읽는다(31번 마이그레이션이 builds를 realtime publication에 넣었다).
 */
export function useProjectBuilds(projectId: string | null): UseProjectBuildsResult {
  const [builds, setBuilds] = useState<BuildRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beginRequest = useLatestRequest();

  const refetch = useCallback(
    async (options?: { silent?: boolean }) => {
      const { isCurrent, signal } = beginRequest();
      if (!projectId) {
        setBuilds([]);
        setIsLoading(false);
        return;
      }
      if (!options?.silent) setIsLoading(true);
      try {
        const rows = await listProjectBuilds(withAbortSignal(getBrowserSupabaseClient(), signal), projectId);
        if (!isCurrent()) return;
        setBuilds(rows);
        setError(null);
      } catch {
        if (isCurrent()) setError("빌드 목록을 불러오지 못했습니다.");
      } finally {
        if (isCurrent()) setIsLoading(false);
      }
    },
    [projectId, beginRequest]
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!projectId) return;
    const supabase = getBrowserSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 한 실행의 artifact 여러 개가 연달아 들어오므로 한 번만 재조회한다.
    const scheduleRefetch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refetch({ silent: true }), 250);
    };
    const channel = supabase
      .channel(`builds-${projectId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "builds", filter: `project_id=eq.${projectId}` },
        scheduleRefetch
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [projectId, refetch]);

  return { builds, isLoading, error };
}
