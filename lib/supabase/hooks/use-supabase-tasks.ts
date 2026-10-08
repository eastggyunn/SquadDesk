"use client";

import { useCallback, useEffect, useState } from "react";
import type { Task, TaskStatus } from "@/lib/types";
import type { AttachmentRow } from "@/lib/supabase/schema";
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
 * 다른 멤버의 변경은 tasks·작업 첨부(attachments) postgres_changes를 구독해 받는다.
 * 이벤트 행만으로는 담당자/첨부까지 채운 Task를 만들 수 없으므로, 짧게 모아(debounce)
 * 조용히(로딩 표시 없이) 목록 전체를 다시 조회한다. 재연결 시에도 끊긴 동안 놓친
 * 변경을 메우려고 한 번 다시 조회한다.
 *
 * addTask/updateTask는 실패 시 에러를 표시(setError)만 하지 않고 다시 던진다 —
 * 호출부(TaskForm)가 이를 await로 잡아 폼을 닫지 않고 재시도할 수 있게 하기 위함이다.
 */
export function useSupabaseTasks(projectId: string | null, reporterId: string | null): UseSupabaseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginRequest = useLatestRequest();

  /** silent: realtime 재조회 — 로딩 표시를 띄우지 않고, 실패해도 기존 목록/에러를 덮지 않는다. */
  const refetch = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const { isCurrent, signal } = beginRequest();
    if (!projectId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }
    if (!silent) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
      const rows = await tasksRepo.listTasks(supabase, projectId);
      if (!isCurrent()) return; // 그 사이 다른 프로젝트로 전환됨 — 이 응답은 버린다.
      setTasks(rows);
    } catch (err) {
      if (!isCurrent() || silent) return;
      setError(err instanceof Error ? err.message : "작업 목록을 불러오지 못했습니다.");
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [projectId, beginRequest]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!projectId) return;
    const supabase = getBrowserSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hasSubscribed = false;
    // 작업 저장은 tasks 행과 첨부 행을 연달아 쓰므로 이벤트가 몰려 온다 — 한 번만 재조회한다.
    const scheduleRefetch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refetch({ silent: true }), 250);
    };
    const filter = `project_id=eq.${projectId}`;

    // 같은 화면에서 이 훅을 여러 번 써도(예: 버그 화면의 작업 연결) 채널 이름이 겹치지 않게 한다.
    const realtimeChannel = supabase
      .channel(`tasks-${projectId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments", filter }, (payload) => {
        // attachments는 REPLICA IDENTITY FULL(00000000000019)이라 DELETE의 old에도 target_type이 있다.
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as AttachmentRow;
        if (row.target_type === "task") scheduleRefetch();
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (hasSubscribed) scheduleRefetch();
        hasSubscribed = true;
      });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(realtimeChannel);
    };
  }, [projectId, refetch]);

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
