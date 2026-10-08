"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatChannel } from "@/lib/store/chat-store";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as chatRepo from "@/lib/supabase/repositories/chat";

interface UseSupabaseChatChannelsResult {
  channels: ChatChannel[];
  isLoading: boolean;
  isAddingChannel: boolean;
  error: string | null;
  addChannel: (name: string) => Promise<ChatChannel | null>;
  renameChannel: (channelId: string, name: string) => Promise<void>;
  archiveChannel: (channelId: string) => Promise<void>;
}

/**
 * ChatWorkspace가 Zustand useChatStore와 동일한 모양(channels + CRUD 함수)으로
 * 쓸 수 있도록 감싼 Supabase 데이터 훅. projectId가 없으면(활성 프로젝트
 * 미배정) 아무 것도 조회/쓰기하지 않는다. 채널 삭제는 물리 삭제가 아니라
 * archiveChannel(보관) 하나만 제공한다 — 메시지 이력을 보존하기 위해서다.
 */
export function useSupabaseChatChannels(
  projectId: string | null,
  createdBy: string | null
): UseSupabaseChatChannelsResult {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 여러 조회/추가 요청이 겹칠 때 가장 최근 요청의 결과만 상태에 반영하기 위한 세대 번호.
  const beginRequest = useLatestRequest();
  // refetch 자신의 isLoading만 추적하는 별도 세대 번호. beginRequest는 addChannel도 함께
  // 호출하므로, 그대로 재사용하면 refetch 진행 중 addChannel이 끼어들 때 이 refetch의
  // finally가 스스로를 "낡은 요청"으로 오판해 isLoading을 영영 끄지 못하는 문제가 생긴다
  // (use-supabase-work-domains.ts에서 같은 문제를 수정한 이력이 있다).
  const beginLoading = useLatestRequest();
  // 추가 요청이 진행 중인 동안 동일 이름의 중복 INSERT를 막는 in-flight guard.
  const isAddInFlightRef = useRef(false);

  const refetch = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    const { isCurrent: isCurrentLoad } = beginLoading();
    if (!projectId) {
      setChannels([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const rows = await chatRepo.listChannels(supabase, projectId);
      if (!isCurrent()) return; // 더 최신 요청이 이미 진행됨
      setChannels(rows);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "채널 목록을 불러오지 못했습니다.");
    } finally {
      if (isCurrentLoad()) setIsLoading(false);
    }
  }, [projectId, beginRequest, beginLoading]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function addChannel(name: string): Promise<ChatChannel | null> {
    if (!projectId || !createdBy) return null;
    if (isAddInFlightRef.current) return null; // 이전 추가 요청이 아직 끝나지 않음 — 중복 제출 무시
    isAddInFlightRef.current = true;
    setIsAddingChannel(true);
    setError(null);
    const { isCurrent } = beginRequest();
    try {
      const supabase = getBrowserSupabaseClient();
      let savedChannel: ChatChannel;
      try {
        savedChannel = await chatRepo.createChannel(supabase, projectId, createdBy, name);
      } catch (err) {
        if (err instanceof chatRepo.DuplicateChannelNameError) {
          if (isCurrent()) setError(err.message);
          return null;
        }
        // 네트워크 오류 등으로 INSERT 성공 여부가 애매한 경우: 같은 요청을 재시도하지 않고
        // 실제로 저장됐는지 조회해 확인한다.
        let reconciled: ChatChannel | null = null;
        try {
          reconciled = await chatRepo.findChannelByName(supabase, projectId, name);
        } catch {
          // 확인 조회마저 실패하면 원래 오류를 그대로 보고한다.
        }
        if (!reconciled) {
          if (isCurrent()) {
            setError(err instanceof Error ? err.message : "채널을 만들지 못했습니다.");
          }
          return null;
        }
        // 실제로는 저장에 성공한 경우이므로 실패로 표시하지 않고 아래에서 목록에 반영한다.
        savedChannel = reconciled;
      }
      if (!isCurrent()) return null; // 더 최신 요청(프로젝트 전환 등)이 이미 진행됨
      // createChannel/findChannelByName이 이미 생성된 행을 그대로 반환하므로, 목록을 다시
      // 조회하지 않고 그 값을 뒤에 붙인다(addCategory와 동일한 패턴 — created_at 오름차순과도 맞다).
      setChannels((prev) => [...prev, savedChannel]);
      return savedChannel;
    } finally {
      isAddInFlightRef.current = false;
      setIsAddingChannel(false);
    }
  }

  async function renameChannel(channelId: string, name: string) {
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await chatRepo.renameChannel(supabase, channelId, name);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "채널 이름을 바꾸지 못했습니다.");
    }
  }

  async function archiveChannel(channelId: string) {
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await chatRepo.archiveChannel(supabase, channelId);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "채널을 보관하지 못했습니다.");
    }
  }

  return { channels, isLoading, isAddingChannel, error, addChannel, renameChannel, archiveChannel };
}
