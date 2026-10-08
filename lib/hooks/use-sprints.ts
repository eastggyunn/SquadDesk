"use client";

import { useMemo } from "react";
import type { Sprint } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useSupabaseSprints, type UseSupabaseSprintsResult } from "@/lib/supabase/hooks/use-supabase-sprints";
import { useSprintsStore } from "@/lib/store/sprints-store";
import { useTasksStore } from "@/lib/store/tasks-store";

/**
 * 화면이 모드(Supabase / 로컬 데모)를 신경 쓰지 않도록 같은 모양으로 감싼 스프린트 훅.
 * 목록은 항상 시작일 순이다.
 */
export function useSprints(projectId: string | null): UseSupabaseSprintsResult {
  const supabaseMode = isSupabaseConfigured();
  const remote = useSupabaseSprints(supabaseMode ? projectId : null);
  const mockSprints = useSprintsStore((state) => state.sprints);
  const mockAdd = useSprintsStore((state) => state.addSprint);
  const mockUpdate = useSprintsStore((state) => state.updateSprint);
  const mockRemove = useSprintsStore((state) => state.removeSprint);
  const clearTaskSprint = useTasksStore((state) => state.clearSprint);

  const sortedMock = useMemo<Sprint[]>(
    () => [...mockSprints].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [mockSprints]
  );

  if (supabaseMode) return remote;

  return {
    sprints: sortedMock,
    error: null,
    addSprint: async (input) => mockAdd(input),
    updateSprint: async (sprintId, input) => {
      mockUpdate(sprintId, input);
      return true;
    },
    removeSprint: async (sprintId) => {
      mockRemove(sprintId);
      clearTaskSprint(sprintId);
      return true;
    },
  };
}
