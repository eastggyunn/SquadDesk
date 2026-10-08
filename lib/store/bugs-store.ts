"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Assignee, Attachment, Bug, BugSeverity, BugStatus } from "@/lib/types";
import { MOCK_BUGS } from "@/lib/mock-bugs";

export interface BugDraft {
  title: string;
  severity: BugSeverity;
  location: string;
  status: BugStatus;
  reproductionSteps: string;
  consoleLog: string;
  attachments: Attachment[];
}

export const BUGS_STORE_KEY = "extraction-ops-bugs";

interface BugsState {
  bugs: Bug[];
  addBug: (draft: BugDraft, reporter: Assignee) => void;
  updateBug: (bugId: string, draft: BugDraft) => void;
  deleteBug: (bugId: string) => void;
  setBugStatus: (bugId: string, status: BugStatus) => void;
}

export const useBugsStore = create<BugsState>()(
  persist(
    (set) => ({
      bugs: MOCK_BUGS,

      addBug: (draft, reporter) =>
        set((state) => ({
          bugs: [
            {
              ...draft,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString().slice(0, 10),
              reporter,
            },
            ...state.bugs,
          ],
        })),

      updateBug: (bugId, draft) =>
        set((state) => ({
          bugs: state.bugs.map((bug) => (bug.id === bugId ? { ...bug, ...draft } : bug)),
        })),

      deleteBug: (bugId) =>
        set((state) => ({
          bugs: state.bugs.filter((bug) => bug.id !== bugId),
        })),

      setBugStatus: (bugId, status) =>
        set((state) => ({
          bugs: state.bugs.map((bug) => (bug.id === bugId ? { ...bug, status } : bug)),
        })),
    }),
    { name: BUGS_STORE_KEY }
  )
);

/** Single source of truth for the "how many bugs reference this task" relationship. */
export function countBugsByTask(bugs: Bug[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const bug of bugs) {
    if (!bug.taskId) continue;
    counts.set(bug.taskId, (counts.get(bug.taskId) ?? 0) + 1);
  }
  return counts;
}
