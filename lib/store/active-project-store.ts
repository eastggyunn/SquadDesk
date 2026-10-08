"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProjectSummary } from "@/lib/supabase/current-user";

export const ACTIVE_PROJECT_STORE_KEY = "extraction-ops-active-project";

interface ActiveProjectState {
  activeProjectId: string | null;
  /**
   * 방금 만들거나 이름을 바꾸거나 보관·복원해서, 아직 서버(레이아웃)의 소속 프로젝트
   * 목록에 반영되지 않은 프로젝트. useActiveProject가 이 값이 목록에 나타날 때까지
   * 목록 위에 덮어써서, router.refresh()가 끝나기 전까지 사이드바 선택 목록·이름·
   * 대시보드 제목이 잠깐 비거나 옛 상태로 남는 것을 막는다. 실패한 요청은 이 값을
   * 세우지 않으므로 화면에 남는 optimistic 상태도 없다.
   */
  pendingProject: ProjectSummary | null;
  setActiveProjectId: (id: string | null) => void;
  /** 새로 만들거나 이름을 바꾼 프로젝트를 즉시 활성·표시한다. 목록에 반영되면 pending은 해제된다. */
  claimProject: (project: ProjectSummary) => void;
  /**
   * 선택은 그대로 두고 목록에 보일 상태만 먼저 덮어쓴다(보관·복원). 보관한 것이
   * 활성 프로젝트였다면 목록에서 빠지는 순간 useActiveProject가 다른 활성 프로젝트로
   * 넘어가므로, 여기서 다음 프로젝트를 고를 필요가 없다.
   */
  overlayProject: (project: ProjectSummary) => void;
}

/** 사용자가 마지막으로 선택한 프로젝트. 브라우저별 로컬 저장이며, 다른 사용자와 공유되지 않는다. */
export const useActiveProjectStore = create<ActiveProjectState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      pendingProject: null,
      setActiveProjectId: (id) => set({ activeProjectId: id, pendingProject: null }),
      claimProject: (project) => set({ activeProjectId: project.id, pendingProject: project }),
      overlayProject: (project) => set({ pendingProject: project }),
    }),
    { name: ACTIVE_PROJECT_STORE_KEY, partialize: (state) => ({ activeProjectId: state.activeProjectId }) }
  )
);
