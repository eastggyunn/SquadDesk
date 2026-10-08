"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TaskComment } from "@/lib/types";

export const TASK_COMMENTS_STORE_KEY = "extraction-ops-task-comments";

interface TaskCommentsState {
  comments: TaskComment[];
  addComment: (comment: Omit<TaskComment, "id" | "createdAt">) => void;
  removeComment: (commentId: string) => void;
}

/** Supabase 미설정(로컬 데모) 모드의 작업 댓글. 데모에는 받는 사람이 없어 알림은 만들지 않는다. */
export const useTaskCommentsStore = create<TaskCommentsState>()(
  persist(
    (set) => ({
      comments: [],
      addComment: (draft) =>
        set((state) => ({
          comments: [...state.comments, { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() }],
        })),
      removeComment: (commentId) =>
        set((state) => ({ comments: state.comments.filter((comment) => comment.id !== commentId) })),
    }),
    { name: TASK_COMMENTS_STORE_KEY }
  )
);
