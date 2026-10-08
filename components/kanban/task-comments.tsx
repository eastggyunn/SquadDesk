"use client";

import { memo, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, MessageSquare, Trash2 } from "lucide-react";
import type { TaskComment } from "@/lib/types";
import { getAvatarColor } from "@/lib/avatar-color";
import { formatRelativeTime } from "@/lib/format";
import { SPRING } from "@/lib/motion";
import { primaryButtonSm } from "@/components/ui/button-styles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useSupabaseTaskComments } from "@/lib/supabase/hooks/use-supabase-task-comments";
import { useTaskCommentsStore } from "@/lib/store/task-comments-store";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { MentionPopover, MOCK_MENTION_MEMBERS, type MentionMember } from "@/components/chat/mention-popover";
import { DeleteConfirmModal } from "./delete-confirm-modal";

interface TaskCommentsProps {
  taskId: string;
  projectId: string | null;
  /** Supabase 모드의 프로젝트 멤버. 멘션 후보이자, 댓글의 멘션 id를 이름으로 바꾸는 표다. */
  projectMembers: MentionMember[];
}

/** "@이름" 부분을 강조해 그린다. 실제로 멘션으로 저장된 이름만 강조한다(본문에 우연히 쓴 @는 그대로). */
function renderContent(content: string, mentionedNames: string[]): ReactNode {
  if (mentionedNames.length === 0) return content;
  const escaped = mentionedNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = content.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="rounded bg-cyan-500/15 px-0.5 font-medium text-cyan-400">
        {part}
      </span>
    ) : (
      part
    )
  );
}

interface CommentListProps {
  comments: TaskComment[];
  nameById: Map<string, string>;
  /** null이면(데모 모드 — 사용자가 "나" 한 명뿐) 모든 댓글을 지울 수 있다. */
  currentUserId: string | null;
  onRequestDelete: (comment: TaskComment) => void;
}

// 입력창(draft)과 분리해 memo — 타이핑할 때마다 모든 댓글의 강조 정규식·layout 측정을 다시 하지 않는다.
const CommentList = memo(function CommentList({ comments, nameById, currentUserId, onRequestDelete }: CommentListProps) {
  return (
    <ul className={comments.length > 0 ? "mt-4 space-y-4" : undefined}>
      <AnimatePresence initial={false}>
        {comments.map((comment) => (
          <motion.li
            key={comment.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: SPRING.exit }}
            transition={SPRING.popover}
            className="group flex gap-3"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${getAvatarColor(
                comment.author.name
              )}`}
            >
              {comment.author.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">{comment.author.name}</span>
                <time dateTime={comment.createdAt} className="text-xs text-zinc-500">
                  {formatRelativeTime(comment.createdAt)}
                </time>
                {(currentUserId === null || comment.authorId === currentUserId) && (
                  <button
                    type="button"
                    onClick={() => onRequestDelete(comment)}
                    aria-label="댓글 삭제"
                    className="ml-auto rounded p-1 text-zinc-600 opacity-0 transition-[opacity,color,transform] duration-150 hover:text-red-400 focus-visible:opacity-100 active:scale-90 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
                {renderContent(
                  comment.content,
                  comment.mentionedUserIds.map((id) => nameById.get(id) ?? "").filter(Boolean)
                )}
              </p>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
});

export function TaskComments({ taskId, projectId, projectMembers }: TaskCommentsProps) {
  const supabaseMode = isSupabaseConfigured();
  const currentUser = useCurrentUser();

  // 두 데이터 소스 모두 항상 호출한다(Hooks 규칙) — 데모 모드면 Supabase 훅에 taskId를 주지 않는다.
  const remote = useSupabaseTaskComments(supabaseMode ? taskId : null, projectId, currentUser.id, currentUser.assignee);
  const mockAll = useTaskCommentsStore((state) => state.comments);
  const mockAdd = useTaskCommentsStore((state) => state.addComment);
  const mockRemove = useTaskCommentsStore((state) => state.removeComment);
  const mockComments = useMemo(() => mockAll.filter((comment) => comment.taskId === taskId), [mockAll, taskId]);

  const comments = supabaseMode ? remote.comments : mockComments;
  const members = supabaseMode ? projectMembers : MOCK_MENTION_MEMBERS;
  const nameById = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members]);

  const [draft, setDraft] = useState("");
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionButtonRef = useRef<HTMLButtonElement>(null);

  async function submit() {
    const content = draft.trim();
    if (!content || isSubmitting) return;
    // 본문에 "@이름"이 남아 있는 멤버만 멘션으로 보낸다(지운 멘션은 빠진다). DB 트리거가 멤버십을 다시 거른다.
    const mentionedIds = members.filter((member) => content.includes(`@${member.name}`)).map((member) => member.id);
    if (!supabaseMode) {
      mockAdd({ taskId, author: currentUser.assignee, content, mentionedUserIds: mentionedIds });
      setDraft("");
      return;
    }
    setIsSubmitting(true);
    const ok = await remote.addComment(content, mentionedIds);
    setIsSubmitting(false);
    if (ok) setDraft(""); // 실패하면 입력을 남겨 다시 보낼 수 있게 한다(오류는 훅이 보여준다).
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    // 한글 IME 조합을 확정하는 Enter는 전송하지 않는다(채팅 입력창과 같은 처리).
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  }

  function handleMentionButtonClick() {
    if (!draft.endsWith("@")) setDraft((prev) => `${prev}@`);
    setIsMentionOpen(true);
  }

  function handleMentionSelect(name: string) {
    setDraft((prev) => {
      const atIndex = prev.lastIndexOf("@");
      return atIndex === -1 ? `${prev}@${name} ` : `${prev.slice(0, atIndex)}@${name} `;
    });
    setIsMentionOpen(false);
    textareaRef.current?.focus();
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    if (supabaseMode) remote.deleteComment(id);
    else mockRemove(id);
  }

  return (
    <section className="mt-8 border-t border-zinc-800 pt-6" aria-label="댓글">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <MessageSquare className="h-4 w-4 text-zinc-500" />
        댓글
        {comments.length > 0 && <span className="text-xs font-medium text-zinc-500">{comments.length}</span>}
      </h3>

      {comments.length === 0 && (
        <p className="mt-4 text-sm text-zinc-500">
          {supabaseMode && remote.isLoading
            ? "댓글을 불러오는 중입니다..."
            : "아직 댓글이 없습니다. @로 멤버를 불러 의견을 남겨보세요."}
        </p>
      )}
      {/* 목록은 비어 있어도 항상 마운트해 둔다 — 그래야 첫 댓글도 진입 애니메이션을 탄다(AnimatePresence initial={false}). */}
      <CommentList
        comments={comments}
        nameById={nameById}
        currentUserId={supabaseMode ? currentUser.id : null}
        onRequestDelete={setPendingDelete}
      />

      {supabaseMode && remote.error && <p className="mt-3 text-sm text-red-400">{remote.error}</p>}

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="rounded-xl border border-zinc-700 bg-zinc-950 transition-colors focus-within:border-cyan-500">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="댓글 남기기 (Enter 전송, Shift+Enter 줄바꿈)"
            aria-label="댓글 입력"
            className="max-h-40 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <button
              ref={mentionButtonRef}
              type="button"
              title="멘션"
              aria-label="멤버 멘션"
              onClick={handleMentionButtonClick}
              className="rounded-md p-1.5 text-zinc-500 transition-[color,background-color,transform] duration-150 hover:bg-zinc-800 hover:text-zinc-200 active:scale-90"
            >
              <AtSign className="h-4 w-4" />
            </button>
            <button type="submit" disabled={!draft.trim() || isSubmitting} className={primaryButtonSm}>
              {isSubmitting ? "등록 중..." : "댓글 달기"}
            </button>
          </div>
        </div>
      </form>

      <MentionPopover
        open={isMentionOpen}
        onClose={() => setIsMentionOpen(false)}
        anchorRef={mentionButtonRef}
        onSelect={handleMentionSelect}
        members={members}
      />

      <DeleteConfirmModal
        open={pendingDelete !== null}
        itemLabel="댓글"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
