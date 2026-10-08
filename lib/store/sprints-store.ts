"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Sprint } from "@/lib/types";
import { MOCK_SPRINTS } from "@/lib/mock-sprints";

export const SPRINTS_STORE_KEY = "extraction-ops-sprints";

export type SprintDraft = Omit<Sprint, "id">;

interface SprintsState {
  sprints: Sprint[];
  addSprint: (draft: SprintDraft) => Sprint;
  updateSprint: (sprintId: string, draft: SprintDraft) => void;
  removeSprint: (sprintId: string) => void;
}

/** Supabase 미설정(로컬 데모) 모드의 스프린트 목록. */
export const useSprintsStore = create<SprintsState>()(
  persist(
    (set) => ({
      sprints: MOCK_SPRINTS,

      addSprint: (draft) => {
        const sprint = { id: crypto.randomUUID(), ...draft };
        set((state) => ({ sprints: [...state.sprints, sprint] }));
        return sprint;
      },

      updateSprint: (sprintId, draft) =>
        set((state) => ({
          sprints: state.sprints.map((sprint) => (sprint.id === sprintId ? { ...sprint, ...draft } : sprint)),
        })),

      removeSprint: (sprintId) =>
        set((state) => ({ sprints: state.sprints.filter((sprint) => sprint.id !== sprintId) })),
    }),
    { name: SPRINTS_STORE_KEY }
  )
);
