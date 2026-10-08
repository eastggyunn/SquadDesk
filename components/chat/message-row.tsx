import { memo, useState, type ReactNode } from "react";
import { Eye, Loader2, MessageSquare, MoreHorizontal, RefreshCw, Smile, Trash2 } from "lucide-react";
import type { Attachment, ChatMessage } from "@/lib/types";
import { getAvatarColor } from "@/lib/avatar-color";
import { AttachmentIcon, isImageAttachment } from "@/components/kanban/attachment-icon";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { createAttachmentPreviewUrl, downloadAttachment } from "@/lib/supabase/repositories/attachments";
import { AttachmentPreviewModal } from "@/components/ui/attachment-preview-modal";
import { DeleteConfirmModal } from "@/components/kanban/delete-confirm-modal";
import type {
  AttachmentDeleteState,
  PendingChatAttachment,
} from "@/lib/supabase/hooks/use-chat-attachment-uploads";

interface MessageRowProps {
  message: ChatMessage;
  isGrouped: boolean;
  /** Supabase 모드에서 이 메시지에 딸린, 아직 업로드 중이거나 실패한 첨부. */
  pendingAttachments?: PendingChatAttachment[];
  onRetryAttachment?: (messageId: string, attachmentId: string) => void;
  /** 로그인한 사용자 id. message.senderId와 같을 때만 첨부 삭제 버튼을 보여준다(실제 권한 경계는 DB의 RLS). */
  currentUserId?: string | null;
  /** attachmentId -> 삭제 진행/실패 상태. */
  attachmentDeleteState?: Map<string, AttachmentDeleteState>;
  onDeleteAttachment?: (messageId: string, attachment: Attachment) => void;
}

type ChipTone = "default" | "muted" | "error";

const CHIP_TONE_CLASSNAME: Record<ChipTone, string> = {
  default: "border-zinc-800 bg-zinc-950/50 text-zinc-300",
  muted: "border-zinc-800 bg-zinc-950/50 text-zinc-400",
  error: "border-red-500/30 bg-red-500/10 text-red-400",
};

function AttachmentChip({ tone = "default", children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${CHIP_TONE_CLASSNAME[tone]}`}>
      {children}
    </span>
  );
}

function MessageRowComponent({
  message,
  isGrouped,
  pendingAttachments,
  onRetryAttachment,
  currentUserId,
  attachmentDeleteState,
  onDeleteAttachment,
}: MessageRowProps) {
  const initials = message.author.name.slice(0, 1);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [previewingAttachment, setPreviewingAttachment] = useState<Attachment | null>(null);
  const [attachmentPendingDelete, setAttachmentPendingDelete] = useState<Attachment | null>(null);

  const canDeleteAttachments = Boolean(
    onDeleteAttachment && currentUserId && message.senderId && message.senderId === currentUserId
  );

  function confirmDeleteAttachment() {
    if (attachmentPendingDelete) onDeleteAttachment?.(message.id, attachmentPendingDelete);
    setAttachmentPendingDelete(null);
  }

  async function handleDownload(attachment: Attachment) {
    if (!attachment.storagePath) return;
    try {
      await downloadAttachment(getBrowserSupabaseClient(), {
        storagePath: attachment.storagePath,
        name: attachment.name,
      });
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "다운로드에 실패했습니다.");
    }
  }

  async function resolvePreviewUrl(attachment: Attachment): Promise<string> {
    if (!attachment.storagePath) throw new Error("파일을 찾을 수 없습니다.");
    return createAttachmentPreviewUrl(getBrowserSupabaseClient(), attachment.storagePath);
  }

  return (
    <div
      className={`group relative flex gap-3 px-4 transition-colors hover:bg-zinc-800/40 ${
        isGrouped ? "py-0.5" : "pt-3 pb-0.5"
      }`}
    >
      <div className="flex w-9 shrink-0 items-start justify-center">
        {isGrouped ? (
          <span className="pt-0.5 text-[11px] text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100">
            {message.timestamp}
          </span>
        ) : (
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${getAvatarColor(
              message.author.name
            )}`}
          >
            {initials}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!isGrouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-zinc-100">{message.author.name}</span>
            <span className="text-[11px] text-zinc-500">{message.author.role}</span>
            <span className="text-[11px] text-zinc-600">{message.timestamp}</span>
          </div>
        )}
        {message.content && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{message.content}</p>
        )}
        {((message.attachments && message.attachments.length > 0) ||
          (pendingAttachments && pendingAttachments.length > 0)) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.attachments?.map((attachment) => {
              const deleteState = attachmentDeleteState?.get(attachment.id);

              if (deleteState?.status === "deleting") {
                return (
                  <AttachmentChip key={attachment.id} tone="muted">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span className="max-w-[140px] truncate">{attachment.name}</span>
                    <span className="shrink-0 text-zinc-500">삭제 중...</span>
                  </AttachmentChip>
                );
              }

              if (deleteState?.status === "error") {
                return (
                  <AttachmentChip key={attachment.id} tone="error">
                    <span className="max-w-[140px] truncate" title={deleteState.message}>
                      {attachment.name}
                    </span>
                    <span className="shrink-0" title={deleteState.message}>
                      삭제 실패
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteAttachment?.(message.id, attachment)}
                      title="다시 삭제"
                      className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 font-medium text-red-300 transition-colors hover:bg-red-500/15"
                    >
                      <RefreshCw className="h-3 w-3" />
                      재시도
                    </button>
                  </AttachmentChip>
                );
              }

              return (
                <AttachmentChip key={attachment.id}>
                  <AttachmentIcon kind={attachment.kind} className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  {attachment.storagePath ? (
                    <button
                      type="button"
                      onClick={() => handleDownload(attachment)}
                      title="다운로드"
                      className="max-w-[180px] truncate text-left hover:underline"
                    >
                      {attachment.name}
                    </button>
                  ) : (
                    <span className="max-w-[180px] truncate">{attachment.name}</span>
                  )}
                  {attachment.storagePath && isImageAttachment(attachment) && (
                    <button
                      type="button"
                      onClick={() => setPreviewingAttachment(attachment)}
                      title="미리보기"
                      className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-cyan-400"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDeleteAttachments && (
                    <button
                      type="button"
                      onClick={() => setAttachmentPendingDelete(attachment)}
                      title="삭제"
                      className="shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </AttachmentChip>
              );
            })}
            {pendingAttachments?.map(({ attachment, status }) =>
              status === "uploading" ? (
                <AttachmentChip key={attachment.id} tone="muted">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span className="max-w-[140px] truncate">{attachment.name}</span>
                  <span className="shrink-0 text-zinc-500">업로드 중...</span>
                </AttachmentChip>
              ) : (
                <AttachmentChip key={attachment.id} tone="error">
                  <span className="max-w-[140px] truncate">{attachment.name}</span>
                  <span className="shrink-0">업로드 실패</span>
                  <button
                    type="button"
                    onClick={() => onRetryAttachment?.(message.id, attachment.id)}
                    title="다시 업로드"
                    className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 font-medium text-red-300 transition-colors hover:bg-red-500/15"
                  >
                    <RefreshCw className="h-3 w-3" />
                    재시도
                  </button>
                </AttachmentChip>
              )
            )}
          </div>
        )}
        {downloadError && <p className="mt-1 text-xs text-red-400">{downloadError}</p>}
      </div>

      <AttachmentPreviewModal
        open={previewingAttachment !== null}
        fileName={previewingAttachment?.name ?? ""}
        resolveUrl={previewingAttachment ? () => resolvePreviewUrl(previewingAttachment) : null}
        onClose={() => setPreviewingAttachment(null)}
      />

      <DeleteConfirmModal
        open={attachmentPendingDelete !== null}
        itemLabel={attachmentPendingDelete ? `첨부파일 "${attachmentPendingDelete.name}"` : "이 첨부파일"}
        onCancel={() => setAttachmentPendingDelete(null)}
        onConfirm={confirmDeleteAttachment}
      />

      <div className="pointer-events-none absolute -top-3 right-4 flex items-center gap-0.5 rounded-md border border-zinc-700 bg-zinc-900 p-0.5 opacity-0 shadow-md transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        <button
          type="button"
          title="리액션 추가"
          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <Smile className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="스레드 답글"
          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="더 보기"
          className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export const MessageRow = memo(MessageRowComponent);
