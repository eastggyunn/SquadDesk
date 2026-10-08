"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AlertTriangle, AtSign, Hash, Paperclip, Plus, Send, X } from "lucide-react";
import type { Attachment, ChatMessage } from "@/lib/types";
import { formatChatTimestamp } from "@/lib/format";
import { AttachmentIcon, inferAttachmentKind } from "@/components/kanban/attachment-icon";
import { useAttachmentUploadState } from "@/lib/hooks/use-attachment-upload-state";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useSupabaseChatMessages } from "@/lib/supabase/hooks/use-supabase-chat-messages";
import { useChatAttachmentUploads, type FileToSend } from "@/lib/supabase/hooks/use-chat-attachment-uploads";
import type { ProjectMemberOption } from "@/lib/supabase/repositories/project-members";
import { MessageRow } from "./message-row";
import { EmojiPopover } from "./emoji-popover";
import { MentionPopover, MOCK_MENTION_MEMBERS, type MentionMember } from "./mention-popover";

interface ChatRoomProps {
  channelName: string;
  initialMessages: ChatMessage[];
  /** true면 Supabase 실데이터 + Realtime 모드, false면 기존 목업 동작을 그대로 유지한다. */
  supabaseMode: boolean;
  channelId: string | null;
  projectId: string | null;
  /** Supabase 모드에서 ChatWorkspace가 내려주는 활성 프로젝트의 실제 멤버 목록. */
  projectMembers: ProjectMemberOption[];
  projectMembersLoading: boolean;
}

function toAttachment(file: File): Attachment {
  return { id: crypto.randomUUID(), name: file.name, kind: inferAttachmentKind(file.name) };
}

export function ChatRoom({
  channelName,
  initialMessages,
  supabaseMode,
  channelId,
  projectId,
  projectMembers,
  projectMembersLoading,
}: ChatRoomProps) {
  const currentUser = useCurrentUser();
  // ProjectMemberOption({id,name,role})은 MentionMember({id,name})의 상위 집합이라 그대로 대입된다.
  const mentionMembers: MentionMember[] = supabaseMode ? projectMembers : MOCK_MENTION_MEMBERS;
  const supabaseChat = useSupabaseChatMessages(channelId, projectId, currentUser.id, currentUser.assignee);
  const uploads = useChatAttachmentUploads(channelId, projectId, currentUser.id, supabaseChat.messages);

  const [mockMessages, setMockMessages] = useState<ChatMessage[]>(initialMessages);
  const messages = supabaseMode ? supabaseChat.messages : mockMessages;

  const [draft, setDraft] = useState("");
  // 목업 모드의 전송 전 첨부 목록. Supabase 모드는 같은 목적을 useAttachmentUploadState
  // (task/bug 폼과 동일한 훅)로 처리한다 — 파일 선택·검증·재시도용 File 보관 로직을
  // 새로 만들지 않고 그대로 재사용한다.
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const attachmentUpload = useAttachmentUploadState([]);
  const composerAttachments = supabaseMode ? attachmentUpload.attachments : pendingAttachments;

  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mentionButtonRef = useRef<HTMLButtonElement>(null);
  // sendMessage 호출 시점의 draft/첨부와, 응답이 돌아온 시점의 "현재" draft/첨부를
  // 비교하기 위한 ref. 클로저로 캡처된 draft는 await 도중 사용자가 새로 입력해도
  // 갱신되지 않으므로, 최신 값을 읽으려면 렌더마다 갱신되는 ref가 필요하다.
  const draftRef = useRef(draft);
  const composerAttachmentsRef = useRef(composerAttachments);
  // 같은 렌더 틱에서 연타된 두 번째 호출도 setState 반영 전에 즉시 걸러내기 위한 동기 가드.
  const sendGuardRef = useRef(false);

  draftRef.current = draft;
  composerAttachmentsRef.current = composerAttachments;

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const content = draft.trim();
    if (!content && composerAttachments.length === 0) return;
    if (sendGuardRef.current) return;

    const draftSnapshot = draft;
    const attachmentsSnapshot = composerAttachments;

    sendGuardRef.current = true;
    setIsSubmitting(true);
    try {
      if (supabaseMode) {
        const filesToSend: FileToSend[] = [];
        for (const attachment of attachmentUpload.attachments) {
          const file = attachmentUpload.pendingFiles.get(attachment.id);
          if (file) filesToSend.push({ attachment, file });
        }

        const message = await supabaseChat.sendMessage(content);
        // 전송 실패 — 오류는 훅이 이미 세팅했다. draft/첨부를 지우지 않아 재시도할 수 있게 한다.
        if (!message) return;

        clearComposerAfterSend(draftSnapshot, attachmentsSnapshot, attachmentUpload.setAttachments);
        await uploads.uploadFiles(message.id, filesToSend);
        return;
      }

      setMockMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          author: currentUser.assignee,
          content,
          timestamp: formatChatTimestamp(new Date()),
          attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
        },
      ]);
      clearComposerAfterSend(draftSnapshot, attachmentsSnapshot, setPendingAttachments);
    } finally {
      sendGuardRef.current = false;
      setIsSubmitting(false);
    }
  }

  /**
   * 전송 성공 후 draft/첨부를 비운다. 단, 전송 중 사용자가 이미 새 내용을 입력했다면
   * (draftRef/composerAttachmentsRef가 스냅샷과 달라졌다면) 그 값을 보존한다 — 첨부는
   * 스냅샷에 없던 항목만 남기고 방금 보낸 것만 제거한다.
   */
  function clearComposerAfterSend(
    draftSnapshot: string,
    attachmentsSnapshot: Attachment[],
    setAttachments: (next: Attachment[]) => void
  ) {
    if (draftRef.current === draftSnapshot) setDraft("");

    if (composerAttachmentsRef.current === attachmentsSnapshot) {
      setAttachments([]);
    } else {
      const sentIds = new Set(attachmentsSnapshot.map((attachment) => attachment.id));
      setAttachments(composerAttachmentsRef.current.filter((attachment) => !sentIds.has(attachment.id)));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setDraft(value);
    setIsMentionOpen(value.endsWith("@"));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // 한글/일본어 등 IME 조합 중 확정용 Enter는 조합만 확정하고 전송하지 않는다.
    // isComposing이 브라우저마다 일관되지 않을 수 있어 legacy keyCode 229도 함께 확인한다.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    sendMessage();
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const newAttachments = files.map(toAttachment);

    if (supabaseMode) {
      attachmentUpload.setAttachments([...attachmentUpload.attachments, ...newAttachments]);
      attachmentUpload.handleFilesAdded(
        newAttachments.map((attachment, index) => ({ attachment, file: files[index] }))
      );
      return;
    }

    setPendingAttachments((prev) => [...prev, ...newAttachments]);
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(event.target.files);
    event.target.value = "";
  }

  function removeComposerAttachment(id: string) {
    if (supabaseMode) {
      attachmentUpload.setAttachments(attachmentUpload.attachments.filter((attachment) => attachment.id !== id));
      return;
    }
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setDraft((prev) => prev + text);
      return;
    }

    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + text.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function handleMentionButtonClick() {
    if (!draft.endsWith("@")) {
      setDraft((prev) => `${prev}@`);
    }
    setIsMentionOpen(true);
  }

  function handleMentionSelect(name: string) {
    setDraft((prev) => {
      const atIndex = prev.lastIndexOf("@");
      if (atIndex === -1) return `${prev}@${name} `;
      return `${prev.slice(0, atIndex)}@${name} `;
    });
    setIsMentionOpen(false);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-zinc-900/20">
      <div className="flex items-center gap-2 border-b border-zinc-800/60 px-5 py-3.5">
        <Hash className="h-4 w-4 text-zinc-500" />
        <h1 className="text-sm font-semibold text-zinc-50">{channelName}</h1>
      </div>

      {supabaseMode && supabaseChat.error && (
        <p className="mx-4 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {supabaseChat.error}
        </p>
      )}

      {supabaseMode && supabaseChat.realtimeError && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {supabaseChat.realtimeError}
          </span>
          <button
            type="button"
            onClick={supabaseChat.retryRealtime}
            className="shrink-0 rounded px-2 py-0.5 font-medium text-amber-300 transition-colors hover:bg-amber-500/15"
          >
            재시도
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-3">
        {supabaseMode && supabaseChat.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            메시지를 불러오는 중입니다...
          </div>
        ) : messages.length > 0 ? (
          <>
            {messages.map((message, index) => {
              const isGrouped =
                index > 0 && messages[index - 1].author.name === message.author.name;
              const liveAttachments = supabaseMode ? uploads.attachmentsByMessageId.get(message.id) : undefined;
              const hasRemoved = message.attachments?.some((a) => uploads.removedAttachmentIds.has(a.id));
              // liveAttachments도 삭제된 것도 없으면 message를 그대로 재사용한다 — 매 렌더마다
              // 새 객체를 만들면 MessageRow(memo)가 이 메시지의 실제 변경 없이도 다시 렌더된다.
              const rowMessage =
                (liveAttachments && liveAttachments.length > 0) || hasRemoved
                  ? {
                      ...message,
                      attachments: [...(message.attachments ?? []), ...(liveAttachments ?? [])].filter(
                        (attachment) => !uploads.removedAttachmentIds.has(attachment.id)
                      ),
                    }
                  : message;

              return (
                <MessageRow
                  key={message.id}
                  message={rowMessage}
                  isGrouped={isGrouped}
                  pendingAttachments={supabaseMode ? uploads.pendingUploadsByMessageId.get(message.id) : undefined}
                  onRetryAttachment={supabaseMode ? uploads.retryAttachmentUpload : undefined}
                  currentUserId={supabaseMode ? currentUser.id : undefined}
                  attachmentDeleteState={supabaseMode ? uploads.attachmentDeleteState : undefined}
                  onDeleteAttachment={supabaseMode ? uploads.deleteAttachment : undefined}
                />
              );
            })}
            <div ref={scrollAnchorRef} />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Hash className="h-8 w-8 text-zinc-700" />
            <p className="text-sm text-zinc-500">#{channelName} 채널의 시작이에요</p>
            <p className="text-xs text-zinc-600">아직 메시지가 없습니다. 첫 메시지를 남겨보세요.</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-4 pb-4 pt-1">
        <div className="rounded-xl border border-zinc-700 bg-zinc-950 transition-colors focus-within:border-cyan-500">
          {composerAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 px-3 pb-2 pt-3">
              {composerAttachments.map((attachment) => (
                <span
                  key={attachment.id}
                  className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
                >
                  <AttachmentIcon kind={attachment.kind} className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  <span className="max-w-[160px] truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => removeComposerAttachment(attachment.id)}
                    className="rounded p-0.5 text-zinc-500 transition-colors hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {supabaseMode && attachmentUpload.uploadError && (
            <p className="border-b border-zinc-800 px-3 pb-2 pt-3 text-xs text-red-400">
              {attachmentUpload.uploadError}
            </p>
          )}

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder={`#${channelName}에 메시지 보내기`}
            className="max-h-40 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-0.5">
              {[Plus, Paperclip].map((AttachIcon, index) => (
                <button
                  key={index}
                  type="button"
                  title="파일 첨부"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <AttachIcon className="h-4 w-4" />
                </button>
              ))}
              <EmojiPopover onSelect={(emoji) => insertAtCursor(emoji)} />
              <button
                ref={mentionButtonRef}
                type="button"
                title="멘션"
                onClick={handleMentionButtonClick}
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <AtSign className="h-4 w-4" />
              </button>
            </div>

            <button
              type="submit"
              disabled={(!draft.trim() && composerAttachments.length === 0) || isSubmitting}
              aria-busy={isSubmitting}
              className="flex items-center justify-center rounded-lg bg-cyan-500 p-2 text-zinc-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-500"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </form>

      <MentionPopover
        open={isMentionOpen}
        onClose={() => setIsMentionOpen(false)}
        anchorRef={mentionButtonRef}
        onSelect={handleMentionSelect}
        members={mentionMembers}
        isLoading={projectMembersLoading}
      />
    </div>
  );
}
