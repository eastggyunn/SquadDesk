"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Assignee, Attachment, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { MOCK_TASKS } from "@/lib/mock-tasks";

export interface TaskDraft {
  title: string;
  assignee: Assignee;
  startDate?: string;
  dueDate?: string;
  priority: TaskPriority;
  attachments: Attachment[];
  domainId?: string;
  sprintId?: string;
}

export const TASKS_STORE_KEY = "extraction-ops-tasks";

interface TasksState {
  tasks: Task[];
  addTask: (draft: TaskDraft) => void;
  updateTask: (taskId: string, draft: TaskDraft) => void;
  deleteTask: (taskId: string) => void;
  moveTask: (taskId: string, toStatus: TaskStatus) => void;
  /** 스프린트가 지워졌을 때 소속 작업을 백로그로 돌린다(DB의 on delete set null과 같은 동작). */
  clearSprint: (sprintId: string) => void;
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set) => ({
      tasks: MOCK_TASKS,

      addTask: (draft) =>
        set((state) => ({
          tasks: [...state.tasks, { id: crypto.randomUUID(), status: "Todo", ...draft }],
        })),

      updateTask: (taskId, draft) =>
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...draft } : task)),
        })),

      deleteTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== taskId),
        })),

      moveTask: (taskId, toStatus) =>
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, status: toStatus } : task)),
        })),

      clearSprint: (sprintId) =>
        set((state) => ({
          tasks: state.tasks.map((task) => (task.sprintId === sprintId ? { ...task, sprintId: undefined } : task)),
        })),
    }),
    { name: TASKS_STORE_KEY }
  )
);
