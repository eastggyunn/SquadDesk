"use client";

import { useRef, useState } from "react";
import type { Attachment } from "@/lib/types";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { createAttachmentPreviewUrl, downloadAttachment, validateAttachmentFile } from "@/lib/supabase/repositories/attachments";

/**
 * TaskForm/BugForm이 Supabase 모드에서 AttachmentPicker와 실 업로드 사이를 잇는
 * 공유 상태. 실제 업로드/삭제 자체는 폼 제출 시 리포지토리 레이어(syncAttachments)가
 * 수행하고, 이 훅은 그때까지 "아직 Storage에 올라가지 않은 로컬 파일"을 attachment id
 * 기준으로 들고 있다가 제출 시 넘겨주는 역할만 한다.
 */
export function useAttachmentUploadState(initial: Attachment[]) {
  const [attachments, setAttachmentsState] = useState<Attachment[]>(initial);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pendingFilesRef = useRef<Map<string, File>>(new Map());

  function setAttachments(next: Attachment[]) {
    const nextIds = new Set(next.map((attachment) => attachment.id));
    for (const id of Array.from(pendingFilesRef.current.keys())) {
      if (!nextIds.has(id)) pendingFilesRef.current.delete(id);
    }
    setAttachmentsState(next);
  }

  function handleFilesAdded(items: { attachment: Attachment; file: File }[]) {
    const errors: string[] = [];
    const invalidIds = new Set<string>();

    for (const { attachment, file } of items) {
      const validationError = validateAttachmentFile(file);
      if (validationError) {
        errors.push(validationError);
        invalidIds.add(attachment.id);
      } else {
        pendingFilesRef.current.set(attachment.id, file);
      }
    }

    if (errors.length > 0) {
      setUploadError(errors.join(" "));
      setAttachmentsState((prev) => prev.filter((attachment) => !invalidIds.has(attachment.id)));
    }
  }

  function isPending(attachmentId: string): boolean {
    return pendingFilesRef.current.has(attachmentId);
  }

  async function handleDownload(attachment: Attachment) {
    if (!attachment.storagePath) return;
    try {
      await downloadAttachment(getBrowserSupabaseClient(), {
        storagePath: attachment.storagePath,
        name: attachment.name,
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "다운로드에 실패했습니다.");
    }
  }

  /**
   * 미리보기용 signed URL을 만든다. AttachmentPicker에 그대로 넘겨 이미지 첨부를
   * 눌렀을 때 지연 호출된다 — storagePath가 없으면(업로드가 아직 끝나지 않은 로컬
   * 파일 등) 파일이 없다는 한국어 메시지로 거부해 모달이 "파일 없음" 상태를 보여줄
   * 수 있게 한다.
   */
  async function resolvePreviewUrl(attachment: Attachment): Promise<string> {
    if (!attachment.storagePath) throw new Error("파일을 찾을 수 없습니다.");
    return createAttachmentPreviewUrl(getBrowserSupabaseClient(), attachment.storagePath);
  }

  return {
    attachments,
    setAttachments,
    pendingFiles: pendingFilesRef.current,
    uploadError,
    setUploadError,
    handleFilesAdded,
    isPending,
    handleDownload,
    resolvePreviewUrl,
  };
}
