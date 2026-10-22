"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuildLinkRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import {
  linkBuild,
  listProjectBuildLinks,
  unlinkBuild,
  type BuildLinkTarget,
} from "@/lib/supabase/repositories/builds";

interface UseBuildLinksResult {
  links: BuildLinkRow[];
  error: string | null;
  link: (buildId: string, target: BuildLinkTarget) => Promise<void>;
  unlink: (linkId: string) => Promise<void>;
}

/**
 * 프로젝트의 빌드 ↔ 태스크/스프린트 연결. 빌드 목록과 태스크 서랍이 같이 쓴다.
 * 다른 멤버가 연결하거나 풀면 build_links postgres_changes로 받아 다시 읽는다.
 */
export function useBuildLinks(projectId: string | null): UseBuildLinksResult {
  const [links, setLinks] = useState<BuildLinkRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const beginRequest = useLatestRequest();

  const refetch = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    if (!projectId) {
      setLinks([]);
      return;
    }
    try {
      const rows = await listProjectBuildLinks(withAbortSignal(getBrowserSupabaseClient(), signal), projectId);
      if (isCurrent()) setLinks(rows);
    } catch {
      if (isCurrent()) setError("빌드 연결 정보를 불러오지 못했습니다.");
    }
  }, [projectId, beginRequest]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!projectId) return;
    const supabase = getBrowserSupabaseClient();
    const channel = supabase
      .channel(`build-links-${projectId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "build_links", filter: `project_id=eq.${projectId}` },
        () => void refetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, refetch]);

  const link = useCallback(
    async (buildId: string, target: BuildLinkTarget) => {
      if (!projectId) return;
      setError(null);
      try {
        await linkBuild(getBrowserSupabaseClient(), projectId, buildId, target);
        await refetch();
      } catch {
        setError("빌드를 연결하지 못했습니다. 보관된 프로젝트인지 확인해주세요.");
      }
    },
    [projectId, refetch]
  );

  const unlink = useCallback(
    async (linkId: string) => {
      setError(null);
      // 칩이 바로 사라지게 먼저 지우고, 실패하면 다시 읽어 되돌린다.
      setLinks((current) => current.filter((row) => row.id !== linkId));
      try {
        await unlinkBuild(getBrowserSupabaseClient(), linkId);
      } catch {
        setError("빌드 연결을 해제하지 못했습니다.");
        await refetch();
      }
    },
    [refetch]
  );

  return { links, error, link, unlink };
}
