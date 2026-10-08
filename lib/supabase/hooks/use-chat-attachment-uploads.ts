"use client";

import { useEffect, useRef, useState } from "react";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { AttachmentRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { mapAttachmentRowToAttachment } from "@/lib/supabase/mappers";
import * as attachmentsRepo from "@/lib/supabase/repositories/attachments";

export interface PendingChatAttachment {
  attachment: Attachment;
  status: "uploading" | "error";
}

export interface FileToSend {
  attachment: Attachment;
  file: File;
}

export interface AttachmentDeleteState {
  status: "deleting" | "error";
  message?: string;
}

interface UseChatAttachmentUploadsResult {
  /** 이번 세션에서 실시간으로 반영된(내가 올렸거나 다른 사용자가 올린) 첨부. messageId -> Attachment[]. */
  attachmentsByMessageId: Map<string, Attachment[]>;
  /** messageId -> 아직 업로드 중이거나 실패한 첨부. */
  pendingUploadsByMessageId: Map<string, PendingChatAttachment[]>;
  uploadFiles: (messageId: string, files: FileToSend[]) => Promise<void>;
  retryAttachmentUpload: (messageId: string, attachmentId: string) => Promise<void>;
  /** attachmentId -> 삭제 진행/실패 상태. 성공하면 지우고 removedAttachmentIds에 담는다. */
  attachmentDeleteState: Map<string, AttachmentDeleteState>;
  /** 삭제가 확정된 첨부 id. 초기 로드분(message.attachments)과 실시간 반영분(attachmentsByMessageId) 모두에서 이 id를 걸러 화면에서 없앤다. */
  removedAttachmentIds: Set<string>;
  deleteAttachment: (messageId: string, attachment: Attachment) => Promise<void>;
}

/**
 * 채팅 첨부 업로드(진행/실패/재시도)와 attachments 테이블 Realtime 구독을
 * 감싼 훅. use-supabase-chat-messages.ts(메시지 CRUD)와 책임을 분리해, 채널을
 * 옮기면 이전 채널의 업로드 진행 상태·재시도용 File 캐시도 함께 정리되게 한다.
 *
 * attachments에는 channel_id가 없어 realtime 필터는 project_id까지만 좁힐 수
 * 있다 — target_id가 messages(현재 로드된 메시지)에 있는지는 클라이언트에서
 * 확인해, 다른 채널의 메시지에 달린 첨부는 버린다.
 */
export function useChatAttachmentUploads(
  channelId: string | null,
  projectId: string | null,
  currentUserId: string | null,
  messages: ChatMessage[]
): UseChatAttachmentUploadsResult {
  const [attachmentsByMessageId, setAttachmentsByMessageId] = useState<Map<string, Attachment[]>>(new Map());
  const [pendingUploadsByMessageId, setPendingUploadsByMessageId] = useState<
    Map<string, PendingChatAttachment[]>
  >(new Map());
  const [attachmentDeleteState, setAttachmentDeleteState] = useState<Map<string, AttachmentDeleteState>>(new Map());
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<string>>(new Set());

  const seenAttachmentIds = useRef<Set<string>>(new Set());
  // 재시도 시 다시 올릴 수 있도록 업로드 시도한 File을 attachment id로 들고 있는다.
  const uploadFilesRef = useRef<Map<string, File>>(new Map());
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  // 채널을 옮기면 이전 채널의 업로드 진행 상태/재시도 캐시를 비운다.
  useEffect(() => {
    setAttachmentsByMessageId(new Map());
    setPendingUploadsByMessageId(new Map());
    setAttachmentDeleteState(new Map());
    setRemovedAttachmentIds(new Set());
    seenAttachmentIds.current = new Set();
    uploadFilesRef.current = new Map();
  }, [channelId]);

  useEffect(() => {
    if (!channelId || !projectId) return;
    const supabase = getBrowserSupabaseClient();

    const realtimeChannel = supabase
      .channel(`chat-attachments-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attachments", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new as AttachmentRow;
          if (row.target_type !== "chat_message") return;
          if (seenAttachmentIds.current.has(row.id)) return;

          const message = messagesRef.current.find((m) => m.id === row.target_id);
          if (!message) return; // 다른 채널의 메시지 — 이 화면에 표시할 대상이 없다.
          if ((message.attachments ?? []).some((a) => a.id === row.id)) return; // 이미 초기 로드에 포함됨

          seenAttachmentIds.current.add(row.id);
          const attachment = mapAttachmentRowToAttachment(row);
          setAttachmentsByMessageId((prev) => {
            const existing = prev.get(row.target_id) ?? [];
            const next = new Map(prev);
            next.set(row.target_id, [...existing, attachment]);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        // attachments는 REPLICA IDENTITY FULL이라(00000000000019) DELETE의 old
        // 레코드에 project_id 등 전체 컬럼이 담겨 이 필터와 RLS 평가가 모두 된다.
        { event: "DELETE", schema: "public", table: "attachments", filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.old as AttachmentRow;
          if (row.target_type !== "chat_message") return;
          markAttachmentRemoved(row.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [channelId, projectId]);

  function updatePendingUpload(messageId: string, attachmentId: string, status: PendingChatAttachment["status"]) {
    setPendingUploadsByMessageId((prev) => {
      const list = prev.get(messageId);
      if (!list) return prev;
      const next = new Map(prev);
      next.set(
        messageId,
        list.map((entry) => (entry.attachment.id === attachmentId ? { ...entry, status } : entry))
      );
      return next;
    });
  }

  function removePendingUpload(messageId: string, attachmentId: string) {
    setPendingUploadsByMessageId((prev) => {
      const list = prev.get(messageId);
      if (!list) return prev;
      const next = new Map(prev);
      const remaining = list.filter((entry) => entry.attachment.id !== attachmentId);
      if (remaining.length > 0) next.set(messageId, remaining);
      else next.delete(messageId);
      return next;
    });
  }

  /**
   * 첨부 하나를 업로드한다. 성공하면 해당 메시지의 첨부 목록에 합치고 대기
   * 목록에서 지운다. 실패해도 메시지나 다른 첨부에는 영향을 주지 않는다 —
   * 이 첨부만 error 상태로 남아 재시도할 수 있다.
   */
  async function runUpload(messageId: string, attachment: Attachment, file: File) {
    if (!projectId || !currentUserId) return;
    try {
      await attachmentsRepo.uploadAttachment(getBrowserSupabaseClient(), {
        projectId,
        targetType: "chat_message",
        targetId: messageId,
        uploadedBy: currentUserId,
        id: attachment.id,
        file,
      });
      seenAttachmentIds.current.add(attachment.id);
      uploadFilesRef.current.delete(attachment.id);
      setAttachmentsByMessageId((prev) => {
        const existing = prev.get(messageId) ?? [];
        const next = new Map(prev);
        next.set(messageId, [...existing, attachment]);
        return next;
      });
      removePendingUpload(messageId, attachment.id);
    } catch {
      updatePendingUpload(messageId, attachment.id, "error");
    }
  }

  async function uploadFiles(messageId: string, files: FileToSend[]) {
    if (files.length === 0) return;

    for (const { attachment, file } of files) uploadFilesRef.current.set(attachment.id, file);
    setPendingUploadsByMessageId((prev) => {
      const next = new Map(prev);
      next.set(
        messageId,
        files.map(({ attachment }) => ({ attachment, status: "uploading" as const }))
      );
      return next;
    });

    // 업로드 오류가 메시지 전송 전체를 실패한 것처럼 보이지 않도록, 여기서는
    // 실패를 던지지 않는다 — 각 첨부의 상태(uploading/error)로만 드러난다.
    await Promise.all(files.map(({ attachment, file }) => runUpload(messageId, attachment, file)));
  }

  async function retryAttachmentUpload(messageId: string, attachmentId: string) {
    const file = uploadFilesRef.current.get(attachmentId);
    const pending = pendingUploadsByMessageId.get(messageId)?.find((entry) => entry.attachment.id === attachmentId);
    if (!file || !pending) return;
    updatePendingUpload(messageId, attachmentId, "uploading");
    await runUpload(messageId, pending.attachment, file);
  }

  /** 첨부를 화면에서 확정적으로 없앤다 — 내가 삭제에 성공했을 때, 그리고 다른 탭의 삭제가 realtime DELETE로 들어왔을 때 공통으로 쓴다. */
  function markAttachmentRemoved(attachmentId: string) {
    setRemovedAttachmentIds((prev) => {
      if (prev.has(attachmentId)) return prev;
      const next = new Set(prev);
      next.add(attachmentId);
      return next;
    });
    setAttachmentDeleteState((prev) => {
      if (!prev.has(attachmentId)) return prev;
      const next = new Map(prev);
      next.delete(attachmentId);
      return next;
    });
  }

  /**
   * 첨부 하나를 삭제한다. 성공하면 removedAttachmentIds에 담아 화면(초기
   * 로드분·실시간 반영분 공통)에서 걸러낸다. 실패해도 메시지 본문이나 다른
   * 첨부에는 영향을 주지 않는다 — 이 첨부만 error 상태로 남아 재시도할 수
   * 있다. messageId는 다른 첨부 함수(retryAttachmentUpload 등)와 시그니처를
   * 맞추기 위한 것으로, 삭제 자체는 attachment.id만으로 충분하다.
   */
  async function deleteAttachment(_messageId: string, attachment: Attachment) {
    setAttachmentDeleteState((prev) => {
      const next = new Map(prev);
      next.set(attachment.id, { status: "deleting" });
      return next;
    });
    try {
      await attachmentsRepo.deleteChatAttachment(getBrowserSupabaseClient(), { id: attachment.id });
      markAttachmentRemoved(attachment.id);
    } catch (err) {
      setAttachmentDeleteState((prev) => {
        const next = new Map(prev);
        next.set(attachment.id, {
          status: "error",
          message: err instanceof Error ? err.message : "첨부파일을 삭제하지 못했습니다.",
        });
        return next;
      });
    }
  }

  return {
    attachmentsByMessageId,
    pendingUploadsByMessageId,
    uploadFiles,
    retryAttachmentUpload,
    attachmentDeleteState,
    removedAttachmentIds,
    deleteAttachment,
  };
}
