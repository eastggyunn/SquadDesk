"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Assignee, ChatMessage } from "@/lib/types";
import type { ChatMessageRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import * as chatRepo from "@/lib/supabase/repositories/chat";

interface UseSupabaseChatMessagesResult {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  realtimeError: string | null;
  /** 채널/프로젝트/로그인 사용자 중 하나라도 없으면 아무 것도 하지 않고 null을 반환한다. */
  sendMessage: (content: string, mentionedUserIds?: string[]) => Promise<ChatMessage | null>;
  /** 이전 전송이 아직 서버 응답을 기다리는 중이면 true — 호출부는 이 동안 새 전송을 막아야 한다. */
  isSending: boolean;
  retryRealtime: () => void;
  /** 본인 메시지와 그 첨부를 지운다. 실패하면 error에 한국어 사유를 남긴다. */
  deleteMessage: (messageId: string) => Promise<void>;
  /** 삭제 요청이 진행 중인 메시지 id — 호출부는 이 동안 해당 행을 흐리게 보여준다. */
  deletingMessageIds: ReadonlySet<string>;
}

/**
 * 활성 채널의 메시지 조회·전송과 Supabase Realtime(postgres_changes INSERT)
 * 구독을 감싼 훅. 첨부 업로드/재시도/첨부 realtime은
 * use-chat-attachment-uploads.ts가 별도로 책임진다 — 메시지 CRUD와 첨부
 * 업로드는 생명주기(채널 전환 시 정리해야 할 상태)가 서로 다르기 때문이다.
 *
 * channelId가 바뀌면 이전 구독을 정리하고 새로 구독한다. 내가 보낸 메시지는
 * 전송 응답을 받는 즉시 로컬에 반영하므로, 같은 id의 realtime 이벤트가
 * 되돌아와도 seenIds로 걸러 중복 표시를 막는다. 삭제는 DELETE 이벤트로 다른
 * 멤버 화면에서도 같은 id를 지운다(chat_messages replica identity full — 00…27).
 */
export function useSupabaseChatMessages(
  channelId: string | null,
  projectId: string | null,
  currentUserId: string | null,
  currentUserAssignee: Assignee
): UseSupabaseChatMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [deletingMessageIds, setDeletingMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  const seenIds = useRef<Set<string>>(new Set());
  /** setIsSending과 별개로 동기적으로 읽어야 하는 in-flight 가드 — 같은 렌더 틱 안에서
   * 연타된 두 번째 호출도 state 업데이트 반영 전에 즉시 걸러내기 위함이다. */
  const isSendingRef = useRef(false);

  useEffect(() => {
    let ignore = false;

    if (!channelId) {
      setMessages([]);
      seenIds.current = new Set();
      return;
    }

    setIsLoading(true);
    setError(null);
    const supabase = getBrowserSupabaseClient();
    chatRepo
      .listMessages(supabase, channelId)
      .then((rows) => {
        if (ignore) return;
        seenIds.current = new Set(rows.map((message) => message.id));
        setMessages(rows);
      })
      .catch((err) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "메시지를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!channelId) return;
    setRealtimeError(null);
    const supabase = getBrowserSupabaseClient();
    let ignore = false;

    const realtimeChannel = supabase
      .channel(`chat-messages-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          chatRepo.enrichMessageRow(supabase, row).then((message) => {
            if (ignore) return;
            setMessages((prev) => [...prev, message]);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const deletedId = (payload.old as Partial<ChatMessageRow>).id;
          if (deletedId) setMessages((prev) => prev.filter((message) => message.id !== deletedId));
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeError("실시간 연결에 문제가 발생했습니다.");
        }
      });

    return () => {
      ignore = true;
      supabase.removeChannel(realtimeChannel);
    };
  }, [channelId, retryToken]);

  async function sendMessage(content: string, mentionedUserIds: string[] = []): Promise<ChatMessage | null> {
    if (!channelId || !projectId || !currentUserId) return null;
    if (isSendingRef.current) return null;

    isSendingRef.current = true;
    setIsSending(true);
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      const message = await chatRepo.sendMessage(
        supabase,
        projectId,
        channelId,
        currentUserId,
        currentUserAssignee,
        content,
        mentionedUserIds
      );
      // realtime INSERT 이벤트가 되돌아오기 전에 seenIds에 먼저 등록해 중복 표시를 막는다.
      seenIds.current.add(message.id);
      setMessages((prev) => [...prev, message]);
      return message;
    } catch (err) {
      setError(err instanceof Error ? err.message : "메시지를 보내지 못했습니다.");
      return null;
    } finally {
      isSendingRef.current = false;
      setIsSending(false);
    }
  }

  const deleteMessage = useCallback(async (messageId: string) => {
    setDeletingMessageIds((prev) => new Set(prev).add(messageId));
    setError(null);
    try {
      await chatRepo.deleteMessage(getBrowserSupabaseClient(), messageId);
      setMessages((prev) => prev.filter((message) => message.id !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "메시지를 삭제하지 못했습니다.");
    } finally {
      setDeletingMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  }, []);

  function retryRealtime() {
    setRealtimeError(null);
    setRetryToken((token) => token + 1);
  }

  return {
    messages,
    isLoading,
    error,
    realtimeError,
    sendMessage,
    isSending,
    retryRealtime,
    deleteMessage,
    deletingMessageIds,
  };
}
