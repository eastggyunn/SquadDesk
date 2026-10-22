"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { listLinkableTasks } from "@/lib/supabase/repositories/builds";

/** 빌드 연결 팝오버의 태스크 선택지(id·제목). 실패하면 빈 목록 — 연결만 못 할 뿐 화면은 그대로 쓴다. */
export function useLinkableTasks(projectId: string | null): { id: string; title: string }[] {
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    listLinkableTasks(getBrowserSupabaseClient(), projectId)
      .then((rows) => {
        if (!cancelled) setTasks(rows);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return tasks;
}
