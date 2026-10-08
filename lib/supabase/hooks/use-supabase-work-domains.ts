"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkDomain } from "@/lib/store/work-domains-store";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as workDomainsRepo from "@/lib/supabase/repositories/work-domains";

interface UseSupabaseWorkDomainsResult {
  domains: WorkDomain[];
  isLoading: boolean;
  isAddingDomain: boolean;
  isRemovingDomain: boolean;
  error: string | null;
  addDomain: (label: string) => Promise<void>;
  /** 삭제 성공 여부를 반환한다 — 호출부(확인 모달)가 성공 시에만 모달을 닫을 수 있도록. */
  removeDomain: (domainId: string) => Promise<boolean>;
  reorderDomains: (startIndex: number, endIndex: number) => Promise<void>;
}

/**
 * DomainsView가 Zustand useWorkDomainsStore와 동일한 모양(domains + CRUD 함수)으로
 * 쓸 수 있도록 감싼 Supabase 데이터 훅. projectId가 없으면(활성 프로젝트 미배정)
 * 아무 것도 조회/쓰기하지 않는다.
 */
export function useSupabaseWorkDomains(projectId: string | null): UseSupabaseWorkDomainsResult {
  const [domains, setDomains] = useState<WorkDomain[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [isRemovingDomain, setIsRemovingDomain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 여러 조회/추가 요청이 겹칠 때 가장 최근 요청의 결과만 상태에 반영하기 위한 세대 번호.
  const beginRequest = useLatestRequest();
  // refetch 자신의 isLoading만 추적하는 별도 세대 번호. beginRequest는 addDomain도 함께 호출하므로
  // 그대로 재사용하면, refetch 진행 중 addDomain이 끼어들 때 이 refetch의 finally가 스스로를
  // "낡은 요청"으로 오판해 isLoading을 영영 끄지 못하는 문제가 생긴다.
  const beginLoading = useLatestRequest();
  // 추가 요청이 진행 중인 동안 동일 라벨의 중복 INSERT를 막는 in-flight guard.
  const isAddInFlightRef = useRef(false);
  // 삭제 확인 버튼 연타로 같은 DELETE가 중복 실행되는 것을 막는 in-flight guard.
  const isRemoveInFlightRef = useRef(false);

  const refetch = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    const { isCurrent: isCurrentLoad } = beginLoading();
    if (!projectId) {
      setDomains([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const rows = await workDomainsRepo.listWorkDomains(supabase, projectId);
      if (!isCurrent()) return; // 더 최신 요청이 이미 진행됨
      setDomains(rows);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "업무 영역을 불러오지 못했습니다.");
    } finally {
      if (isCurrentLoad()) setIsLoading(false);
    }
  }, [projectId, beginRequest, beginLoading]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function addDomain(label: string) {
    if (!projectId) return;
    if (isAddInFlightRef.current) return; // 이전 추가 요청이 아직 끝나지 않음 — 중복 제출 무시
    isAddInFlightRef.current = true;
    setIsAddingDomain(true);
    setError(null);
    const { isCurrent } = beginRequest();
    try {
      const supabase = getBrowserSupabaseClient();
      try {
        await workDomainsRepo.createWorkDomain(supabase, projectId, label, domains.length);
      } catch (err) {
        if (err instanceof workDomainsRepo.DuplicateWorkDomainLabelError) {
          if (isCurrent()) setError(err.message);
          return;
        }
        // 네트워크 오류 등으로 INSERT 성공 여부가 애매한 경우: 같은 요청을 재시도하지 않고
        // 실제로 저장됐는지 조회해 확인한다.
        let savedRow: WorkDomain | null = null;
        try {
          savedRow = await workDomainsRepo.findWorkDomainByLabel(supabase, projectId, label);
        } catch {
          // 확인 조회마저 실패하면 원래 오류를 그대로 보고한다.
        }
        if (!savedRow) {
          if (isCurrent()) {
            setError(err instanceof Error ? err.message : "업무 영역을 저장하지 못했습니다.");
          }
          return;
        }
        // 실제로는 저장에 성공한 경우이므로 실패로 표시하지 않고 아래에서 목록을 갱신한다.
      }
      try {
        const rows = await workDomainsRepo.listWorkDomains(supabase, projectId);
        if (isCurrent()) setDomains(rows);
      } catch {
        // 저장 자체는 성공했으므로 목록 재조회 실패를 저장 실패로 표시하지 않는다.
      }
    } finally {
      isAddInFlightRef.current = false;
      setIsAddingDomain(false);
    }
  }

  async function removeDomain(domainId: string): Promise<boolean> {
    if (isRemoveInFlightRef.current) return false; // 이전 삭제 요청이 아직 끝나지 않음 — 중복 실행 무시
    isRemoveInFlightRef.current = true;
    setIsRemovingDomain(true);
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await workDomainsRepo.deleteWorkDomain(supabase, domainId);
      // reorderDomains와 동일하게 성공 시 로컬 상태만 갱신한다 — 전체 목록 재조회(및 그에 따른
      // isLoading 깜빡임으로 카드 그리드 전체가 "불러오는 중" 화면으로 바뀌는 현상)를 피한다.
      setDomains((prev) => prev.filter((domain) => domain.id !== domainId));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "업무 영역을 삭제하지 못했습니다.");
      return false;
    } finally {
      isRemoveInFlightRef.current = false;
      setIsRemovingDomain(false);
    }
  }

  async function reorderDomains(startIndex: number, endIndex: number) {
    setError(null);
    const next = [...domains];
    const [moved] = next.splice(startIndex, 1);
    next.splice(endIndex, 0, moved);
    setDomains(next);
    try {
      const supabase = getBrowserSupabaseClient();
      await workDomainsRepo.reorderWorkDomains(supabase, next.map((domain) => domain.id));
      // 낙관적으로 반영한 next가 이미 서버에 저장한 순서와 같으므로 refetch로 다시
      // 확인하지 않는다 — 실패 시에만 서버 상태로 되돌린다.
    } catch (err) {
      setError(err instanceof Error ? err.message : "업무 영역 순서를 저장하지 못했습니다.");
      await refetch();
    }
  }

  return { domains, isLoading, isAddingDomain, isRemovingDomain, error, addDomain, removeDomain, reorderDomains };
}
