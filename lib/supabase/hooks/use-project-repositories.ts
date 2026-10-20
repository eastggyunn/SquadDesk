"use client";

import { useCallback, useEffect, useState } from "react";
import type { GitHubInstallationRow, ProjectRepositoryRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import { listMyGitHubInstallations, listProjectRepositories } from "@/lib/supabase/repositories/project-repositories";

interface UseProjectRepositoriesResult {
  repositories: ProjectRepositoryRow[];
  /** 내가 검증한 GitHub 계정(설치). 게스트·미로그인은 항상 빈 배열. */
  installations: GitHubInstallationRow[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** 빌드 화면의 저장소 연결 상태. 연결/해제 직후 reload()로 다시 읽는다. */
export function useProjectRepositories(projectId: string | null): UseProjectRepositoriesResult {
  const [repositories, setRepositories] = useState<ProjectRepositoryRow[]>([]);
  const [installations, setInstallations] = useState<GitHubInstallationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const beginRequest = useLatestRequest();

  const reload = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    if (!projectId) {
      setRepositories([]);
      setInstallations([]);
      return;
    }
    setIsLoading(true);
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const [repositoryRows, installationRows] = await Promise.all([
        listProjectRepositories(supabase, projectId),
        listMyGitHubInstallations(supabase),
      ]);
      if (!isCurrent()) return;
      setRepositories(repositoryRows);
      setInstallations(installationRows);
      setError(null);
    } catch {
      if (isCurrent()) setError("저장소 연결 정보를 불러오지 못했습니다.");
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [projectId, beginRequest]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { repositories, installations, isLoading, error, reload };
}
