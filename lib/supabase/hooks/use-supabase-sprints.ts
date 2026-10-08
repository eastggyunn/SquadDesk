"use client";

import { useCallback, useEffect, useState } from "react";
import type { Sprint } from "@/lib/types";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as sprintsRepo from "@/lib/supabase/repositories/sprints";

export interface UseSupabaseSprintsResult {
  sprints: Sprint[];
  error: string | null;
  addSprint: (input: sprintsRepo.SprintWriteInput) => Promise<Sprint | null>;
  updateSprint: (sprintId: string, input: sprintsRepo.SprintWriteInput) => Promise<boolean>;
  removeSprint: (sprintId: string) => Promise<boolean>;
}

/** 활성 프로젝트의 스프린트 목록 + CRUD. projectId가 없으면 아무 것도 조회/쓰기하지 않는다. */
export function useSupabaseSprints(projectId: string | null): UseSupabaseSprintsResult {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const beginRequest = useLatestRequest();

  const refetch = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    if (!projectId) {
      setSprints([]);
      return;
    }
    try {
      const rows = await sprintsRepo.listSprints(withAbortSignal(getBrowserSupabaseClient(), signal), projectId);
      if (isCurrent()) setSprints(rows);
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : "스프린트를 불러오지 못했습니다.");
    }
  }, [projectId, beginRequest]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function addSprint(input: sprintsRepo.SprintWriteInput) {
    if (!projectId) return null;
    setError(null);
    try {
      const sprint = await sprintsRepo.createSprint(getBrowserSupabaseClient(), projectId, input);
      setSprints((prev) => [...prev, sprint].sort((a, b) => a.startDate.localeCompare(b.startDate)));
      return sprint;
    } catch (err) {
      setError(err instanceof Error ? err.message : "스프린트를 만들지 못했습니다.");
      return null;
    }
  }

  async function updateSprint(sprintId: string, input: sprintsRepo.SprintWriteInput) {
    setError(null);
    try {
      const sprint = await sprintsRepo.updateSprint(getBrowserSupabaseClient(), sprintId, input);
      setSprints((prev) =>
        prev.map((item) => (item.id === sprintId ? sprint : item)).sort((a, b) => a.startDate.localeCompare(b.startDate))
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "스프린트를 저장하지 못했습니다.");
      return false;
    }
  }

  async function removeSprint(sprintId: string) {
    setError(null);
    try {
      await sprintsRepo.deleteSprint(getBrowserSupabaseClient(), sprintId);
      setSprints((prev) => prev.filter((item) => item.id !== sprintId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "스프린트를 삭제하지 못했습니다.");
      return false;
    }
  }

  return { sprints, error, addSprint, updateSprint, removeSprint };
}
