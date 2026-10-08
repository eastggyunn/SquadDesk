"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task, TaskStatus } from "@/lib/types";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as tasksRepo from "@/lib/supabase/repositories/tasks";
import type { TaskWriteInput } from "@/lib/supabase/repositories/tasks";

export type { TaskWriteInput };

interface UseSupabaseTasksResult {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  addTask: (input: TaskWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  updateTask: (taskId: string, input: TaskWriteInput, pendingFiles: Map<string, File>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (taskId: string, toStatus: TaskStatus) => Promise<void>;
}

/**
 * KanbanBoard가 Zustand useTasksStore와 동일한 모양(tasks + CRUD 함수)으로
 * 쓸 수 있도록 감싼 Supabase 데이터 훅. projectId/reporterId가 없으면(활성
 * 프로젝트 미배정) 아무 것도 조회/쓰기하지 않는다.
 *
 * addTask/updateTask는 실패 시 에러를 표시(setError)만 하지 않고 다시 던진다 —
 * 호출부(TaskForm)가 이를 await로 잡아 폼을 닫지 않고 재시도할 수 있게 하기 위함이다.
 */
export function useSupabaseTasks(projectId: string | null, reporterId: string | null): UseSupabaseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginRequest = useLatestRequest();

  const refetch = useCallback(async () => {
    const { isCurrent, signal } = beginRequest();
    if (!projectId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const rows = await tasksRepo.listTasks(supabase, projectId);
      if (!isCurrent()) return; // 그 사이 다른 프로젝트로 전환됨 — 이 응답은 버린다.
      setTasks(rows);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : "작업 목록을 불러오지 못했습니다.");
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [projectId, beginRequest]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function addTask(input: TaskWriteInput, pendingFiles: Map<string, File>) {
    if (!projectId || !reporterId) return;
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await tasksRepo.createTask(supabase, projectId, reporterId, input, pendingFiles);
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "작업을 저장하지 못했습니다.";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  async function updateTask(taskId: string, input: TaskWriteInput, pendingFiles: Map<string, File>) {
    if (!projectId || !reporterId) return;
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await tasksRepo.updateTask(supabase, taskId, projectId, reporterId, input, pendingFiles);
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : "작업을 저장하지 못했습니다.";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  async function deleteTask(taskId: string) {
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await tasksRepo.deleteTask(supabase, taskId);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업을 삭제하지 못했습니다.");
    }
  }

  async function moveTask(taskId: string, toStatus: TaskStatus) {
    setError(null);
    try {
      const supabase = getBrowserSupabaseClient();
      await tasksRepo.moveTaskStatus(supabase, taskId, toStatus);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업 상태를 변경하지 못했습니다.");
    }
  }

  return { tasks, isLoading, error, addTask, updateTask, deleteTask, moveTask };
}
