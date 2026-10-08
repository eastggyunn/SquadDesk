"use client";

import { useEffect, useRef, useState } from "react";
import type { Assignee, TaskComment } from "@/lib/types";
import type { TaskCommentRow } from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import * as commentsRepo from "@/lib/supabase/repositories/task-comments";

interface UseSupabaseTaskCommentsResult {
  comments: TaskComment[];
  isLoading: boolean;
  error: string | null;
  /** 성공하면 true — 호출부는 그때만 입력창을 비운다. */
  addComment: (content: string, mentionedUserIds: string[]) => Promise<boolean>;
  deleteComment: (commentId: string) => Promise<void>;
}

/**
 * 작업 서랍의 댓글 목록 — task_comments 조회 + Realtime(INSERT/DELETE) 구독. 데모 모드는
 * 호출부(TaskComments)가 useTaskCommentsStore를 대신 쓴다. 내가 쓴 댓글은 저장 응답으로 바로 붙이고,
 * 같은 id의 realtime 이벤트는 seenIds로 걸러 중복 표시를 막는다(채팅과 같은 방식).
 */
export function useSupabaseTaskComments(
  taskId: string | null,
  projectId: string | null,
  currentUserId: string | null,
  currentUserAssignee: Assignee
): UseSupabaseTaskCommentsResult {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!taskId) {
      setComments([]);
      return;
    }
    let ignore = false;
    const supabase = getBrowserSupabaseClient();
    setIsLoading(true);
    setError(null);
    commentsRepo
      .listTaskComments(supabase, taskId)
      .then((rows) => {
        if (ignore) return;
        seenIds.current = new Set(rows.map((comment) => comment.id));
        setComments(rows);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof Error ? err.message : "댓글을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    const realtimeChannel = supabase
      .channel(`task-comments-${taskId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        (payload) => {
          const row = payload.new as TaskCommentRow;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          commentsRepo.enrichTaskComments(supabase, [row]).then(([comment]) => {
            if (!ignore) setComments((prev) => [...prev, comment]);
          });
        }
      )
      .on(
        "postgres_changes",
        // task_comments는 REPLICA IDENTITY FULL(00000000000025)이라 DELETE의 old에도 task_id가 있다.
        { event: "DELETE", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        (payload) => {
          const id = (payload.old as TaskCommentRow).id;
          setComments((prev) => prev.filter((comment) => comment.id !== id));
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(realtimeChannel);
    };
  }, [taskId]);

  async function addComment(content: string, mentionedUserIds: string[]): Promise<boolean> {
    if (!taskId || !projectId || !currentUserId) return false;
    setError(null);
    try {
      const comment = await commentsRepo.createTaskComment(
        getBrowserSupabaseClient(),
        { projectId, taskId, authorId: currentUserId, content, mentionedUserIds },
        currentUserAssignee
      );
      seenIds.current.add(comment.id);
      setComments((prev) => [...prev, comment]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글을 저장하지 못했습니다.");
      return false;
    }
  }

  async function deleteComment(commentId: string) {
    setError(null);
    try {
      await commentsRepo.deleteTaskComment(getBrowserSupabaseClient(), commentId);
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "댓글을 삭제하지 못했습니다.");
    }
  }

  return { comments, isLoading, error, addComment, deleteComment };
}
