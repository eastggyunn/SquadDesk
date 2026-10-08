"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { countOpenBugs } from "@/lib/supabase/repositories/bugs";
import { useActiveProject } from "@/lib/supabase/use-active-project";
import { useBugsStore } from "@/lib/store/bugs-store";

/**
 * 사이드바 "버그 리포트" 뱃지에 쓰는 미처리 버그 수.
 * Supabase 모드는 실시간 구독이 없으므로 화면을 옮길 때마다 개수만 다시 센다 —
 * 버그 화면에서 상태를 바꾸고 나가면 뱃지가 바로 따라온다.
 */
export function useOpenBugCount(): number {
  const supabaseMode = isSupabaseConfigured();
  const pathname = usePathname();
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;
  const mockCount = useBugsStore(
    (state) => state.bugs.filter((bug) => bug.status === "Open" || bug.status === "In Progress").length
  );
  const [remoteCount, setRemoteCount] = useState(0);

  useEffect(() => {
    if (!supabaseMode || !projectId) {
      setRemoteCount(0);
      return;
    }
    let cancelled = false;
    countOpenBugs(getBrowserSupabaseClient(), projectId)
      .then((count) => {
        if (!cancelled) setRemoteCount(count);
      })
      .catch(() => {
        // 뱃지는 보조 정보라 실패하면 조용히 이전 값을 유지한다.
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseMode, projectId, pathname]);

  return supabaseMode ? remoteCount : mockCount;
}
