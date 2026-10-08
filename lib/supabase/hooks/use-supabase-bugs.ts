"use client";

import { useCallback, useEffect, useState } from "react";
import type { Bug, BugStatus } from "@/lib/types";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as bugsRepo from "@/lib/supabase/repositories/bugs";
import type { BugWriteInput } from "@/lib/supabase/repositories/bugs";

export type { BugWriteInput };

interface UseSupabaseBugsResult {
  bugs: Bug[];
  isLoading: boolean;
  error: string | null;
  addBug: (input: BugWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  updateBug: (bugId: string, input: BugWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  deleteBug: (bugId: string) => Promise<void>;
  setBugStatus: (bugId: string, status: BugStatus) => Promise<void>;
}

/**
 * BugBoard가 Zustand useBugsStore와 동일한 모양(bugs + CRUD 함수)으로 쓸 수
 * 있도록 감싼 Supabase 데이터 훅. projectId/reporterId가 없으면(활성 프로젝트
 * 미배정) 아무 것도 조회/쓰기하지 않는다. 보고자는 항상 현재 로그인 사용자로
 * 고정되고, 수정 화면에서는 바꿀 수 없다.
 *
 * addBug/updateBug는 실패 시 다시 던진다 — 호출부(BugForm)가 await로 잡아
 * 폼을 닫지 않고 재시도할 수 있게 하기 위함이다.
 */
export function useSupabaseBugs(projectId: string | null, reporterId: string | null): UseSupabaseBugsResult {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginRequest = useLatestRequest();

  const refetch = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    if (!projectId) {
      setBugs([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const rows = await bugsRepo.listBugs(supabase, projectId);
      if (!isCurrent()) return; // 그 사이 다른 프로젝트로 전환됨 — 이 응답은 버린다.
      setBugs(rows);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "버그 목록을 불러오지 못했습니다.");
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [projectId, beginRequest]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function addBug(input: BugWriteInput, pendingFiles: Map<string, File>) {
    if (!projectId || !reporterId) return;
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await bugsRepo.createBug(supabase, projectId, reporterId, input, pendingFiles);
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "버그를 저장하지 못했습니다.";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  async function updateBug(bugId: string, input: BugWriteInput, pendingFiles: Map<string, File>) {
    if (!projectId || !reporterId) return;
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await bugsRepo.updateBug(supabase, bugId, projectId, reporterId, input, pendingFiles);
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "버그를 저장하지 못했습니다.";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  async function deleteBug(bugId: string) {
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await bugsRepo.deleteBug(supabase, bugId);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "버그를 삭제하지 못했습니다.");
    }
  }

  async function setBugStatus(bugId: string, status: BugStatus) {
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await bugsRepo.setBugStatus(supabase, bugId, status);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "버그 상태를 변경하지 못했습니다.");
    }
  }

  return { bugs, isLoading, error, addBug, updateBug, deleteBug, setBugStatus };
}
