"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncedAsset, SyncedAssetCategory } from "@/lib/store/synced-assets-store";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as syncedAssetsRepo from "@/lib/supabase/repositories/synced-assets";

interface UseSupabaseSyncedAssetsResult {
  categories: SyncedAssetCategory[];
  /** 카테고리 id -> 최신 동기화 파일. Zustand 목업 store와 같은 모양이라 위젯이 그대로 재사용한다. */
  assets: Record<string, SyncedAsset>;
  isLoading: boolean;
  isAddingCategory: boolean;
  error: string | null;
  addCategory: (label: string) => Promise<void>;
  removeCategory: (categoryId: string) => Promise<void>;
  uploadAsset: (categoryId: string, file: File, sourceLabel: string) => Promise<void>;
  renameAsset: (categoryId: string, name: string) => Promise<void>;
}

/**
 * 대시보드 통합 에셋 위젯(전체 CRUD)과 작업 폼의 동기화 토글(카테고리·최신
 * 에셋 조회만)이 함께 쓰는 훅. projectId가 없으면(활성 프로젝트 미배정)
 * 아무 것도 조회/쓰기하지 않는다. currentUserId는 uploadAsset에만 필요하므로,
 * 업로드를 하지 않는 호출부(작업 폼)는 null을 넘겨도 된다.
 */
export function useSupabaseSyncedAssets(
  projectId: string | null,
  currentUserId: string | null
): UseSupabaseSyncedAssetsResult {
  const [categories, setCategories] = useState<SyncedAssetCategory[]>([]);
  const [assets, setAssets] = useState<Record<string, SyncedAsset>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 여러 조회/추가 요청이 겹칠 때 가장 최근 요청의 결과만 상태에 반영하기 위한 세대 번호.
  const beginRequest = useLatestRequest();
  // refetch 자신의 isLoading만 추적하는 별도 세대 번호. beginRequest는 addCategory도 함께
  // 호출하므로, 그대로 재사용하면 refetch 진행 중 addCategory가 끼어들 때 이 refetch의
  // finally가 스스로를 "낡은 요청"으로 오판해 isLoading을 영영 끄지 못하는 문제가 생긴다
  // (use-supabase-work-domains.ts에서 같은 문제를 수정한 이력이 있다).
  const beginLoading = useLatestRequest();
  // 추가 요청이 진행 중인 동안 동일 라벨의 중복 INSERT를 막는 in-flight guard.
  const isAddInFlightRef = useRef(false);

  const refetch = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    const { isCurrent: isCurrentLoad } = beginLoading();
    if (!projectId) {
      setCategories([]);
      setAssets({});
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const categoryRows = await syncedAssetsRepo.listAssetCategories(supabase, projectId);
      const assetsByCategoryId = await syncedAssetsRepo.listLatestSyncedAssets(
        supabase,
        categoryRows.map((category) => category.id)
      );
      if (!isCurrent()) return; // 더 최신 요청이 이미 진행됨
      setCategories(categoryRows);
      setAssets(Object.fromEntries(assetsByCategoryId));
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "통합 에셋을 불러오지 못했습니다.");
    } finally {
      if (isCurrentLoad()) setIsLoading(false);
    }
  }, [projectId, beginRequest, beginLoading]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /** 카테고리 하나의 최신 에셋만 다시 읽어 병합한다 — 업로드/이름변경은 그 카테고리에만 영향을 준다. */
  async function refetchAssetFor(categoryId: string) {
    try {
      const supabase = getBrowserSupabaseClient();
      const assetsByCategoryId = await syncedAssetsRepo.listLatestSyncedAssets(supabase, [categoryId]);
      setAssets((prev) => {
        const next = { ...prev };
        const updated = assetsByCategoryId.get(categoryId);
        if (updated) next[categoryId] = updated;
        else delete next[categoryId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "통합 에셋을 불러오지 못했습니다.");
    }
  }

  async function addCategory(label: string) {
    if (!projectId) return;
    if (isAddInFlightRef.current) return; // 이전 추가 요청이 아직 끝나지 않음 — 중복 제출 무시
    isAddInFlightRef.current = true;
    setIsAddingCategory(true);
    setError(null);
    const { isCurrent } = beginRequest();
    try {
      const supabase = getBrowserSupabaseClient();
      let savedCategory: SyncedAssetCategory;
      try {
        savedCategory = await syncedAssetsRepo.createAssetCategory(supabase, projectId, label);
      } catch (err) {
        if (err instanceof syncedAssetsRepo.DuplicateAssetCategoryLabelError) {
          if (isCurrent()) setError(err.message);
          return;
        }
        // 네트워크 오류 등으로 INSERT 성공 여부가 애매한 경우: 같은 요청을 재시도하지 않고
        // 실제로 저장됐는지 조회해 확인한다.
        let reconciled: SyncedAssetCategory | null = null;
        try {
          reconciled = await syncedAssetsRepo.findAssetCategoryByLabel(supabase, projectId, label);
        } catch {
          // 확인 조회마저 실패하면 원래 오류를 그대로 보고한다.
        }
        if (!reconciled) {
          if (isCurrent()) {
            setError(err instanceof Error ? err.message : "카테고리를 만들지 못했습니다.");
          }
          return;
        }
        // 실제로는 저장에 성공한 경우이므로 실패로 표시하지 않고 아래에서 목록에 반영한다.
        savedCategory = reconciled;
      }
      // createAssetCategory/findAssetCategoryByLabel이 이미 생성된 행을 그대로 반환하므로,
      // 목록을 다시 조회하지 않고 그 값을 그대로 뒤에 붙인다(정렬 기준인 created_at 오름차순과도 맞다).
      if (isCurrent()) {
        setCategories((prev) => [...prev, savedCategory]);
      }
    } finally {
      isAddInFlightRef.current = false;
      setIsAddingCategory(false);
    }
  }

  async function removeCategory(categoryId: string) {
    setError(null);
    try {
      await syncedAssetsRepo.removeAssetCategory(getBrowserSupabaseClient(), categoryId);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "카테고리를 삭제하지 못했습니다.");
    }
  }

  async function uploadAsset(categoryId: string, file: File, sourceLabel: string) {
    if (!projectId || !currentUserId) return;
    setError(null);
    try {
      await syncedAssetsRepo.uploadAndSyncAsset(
        getBrowserSupabaseClient(),
        projectId,
        categoryId,
        currentUserId,
        file,
        sourceLabel
      );
      await refetchAssetFor(categoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 업로드하지 못했습니다.");
    }
  }

  async function renameAsset(categoryId: string, name: string) {
    const attachmentId = assets[categoryId]?.attachment.id;
    if (!attachmentId) return;
    setError(null);
    try {
      await syncedAssetsRepo.renameAttachment(getBrowserSupabaseClient(), attachmentId, name);
      await refetchAssetFor(categoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "이름을 변경하지 못했습니다.");
    }
  }

  return { categories, assets, isLoading, isAddingCategory, error, addCategory, removeCategory, uploadAsset, renameAsset };
}
