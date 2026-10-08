"use client";

import { useCallback, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import * as syncedAssetsRepo from "@/lib/supabase/repositories/synced-assets";
import type { AssetSyncHistoryEntry } from "@/lib/supabase/repositories/synced-assets";

interface UseAssetVersionHistoryResult {
  entries: AssetSyncHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
  load: () => Promise<void>;
}

/**
 * 카테고리 하나의 버전 이력을 지연 조회한다. 다른 대시보드 훅과 달리 마운트
 * 시 자동으로 부르지 않는다 — 대시보드 진입 시 전체 이력을 조회하지 않고,
 * "버전 이력" 모달을 열 때만 load()를 호출해 그 카테고리 하나만 가져온다.
 */
export function useAssetVersionHistory(categoryId: string): UseAssetVersionHistoryResult {
  const [entries, setEntries] = useState<AssetSyncHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      setEntries(await syncedAssetsRepo.listAssetSyncHistory(supabase, categoryId));
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "버전 이력을 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [categoryId]);

  return { entries, isLoading, error, hasLoaded, load };
}
