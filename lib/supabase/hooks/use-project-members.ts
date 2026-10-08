"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { listProjectMembers, type ProjectMemberOption } from "@/lib/supabase/repositories/project-members";

export interface UseProjectMembersResult {
  members: ProjectMemberOption[];
  isLoading: boolean;
}

/**
 * 활성 프로젝트 멤버 목록 조회 + 로딩 상태. 실패하면 빈 목록으로 조용히 대체한다.
 * 로딩 상태가 필요 없는 기존 호출부는 아래 useProjectMembers(배열만 반환)를 그대로 쓴다.
 */
export function useProjectMembersWithStatus(projectId: string | null): UseProjectMembersResult {
  const [members, setMembers] = useState<ProjectMemberOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    listProjectMembers(getBrowserSupabaseClient(), projectId)
      .then((result) => {
        if (!cancelled) setMembers(result);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { members, isLoading };
}

/** 활성 프로젝트 멤버 목록(담당자/보고자 선택지). 실패하면 빈 목록으로 조용히 대체한다. */
export function useProjectMembers(projectId: string | null): ProjectMemberOption[] {
  return useProjectMembersWithStatus(projectId).members;
}
