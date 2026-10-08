"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useActiveProjectStore } from "@/lib/store/active-project-store";
import type { ProjectSummary } from "./current-user";

interface UseActiveProjectResult {
  /** 활성(보관되지 않은) 프로젝트만. 선택 목록과 이름 중복 검사 범위가 곧 이 목록이다. */
  projects: ProjectSummary[];
  /** 보관된 프로젝트. 선택 목록에서 분리해 따로 보여준다 — 활성으로 선택되지 않는다. */
  archivedProjects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  setActiveProjectId: (id: string) => void;
}

/**
 * 로그인 사용자가 속한 프로젝트 중 "지금 보고 있는" 프로젝트를 결정한다.
 * 선택값은 localStorage에 남아 새로고침 후에도 유지되고(useActiveProjectStore),
 * 그 값이 더 이상 활성 프로젝트 목록에 없으면(탈퇴·보관 등) 첫 번째 활성 프로젝트로
 * 되돌린 뒤 그 값을 다시 저장한다 — 잘못된 선택이 localStorage에 남지 않는다.
 *
 * 목록은 서버 레이아웃에서 내려오므로 생성·이름 변경·보관·복원 직후 router.refresh()가
 * 끝나기 전까지는 아직 옛 목록이다. 그 사이를 pendingProject가 덮는다 — 새 프로젝트는
 * 목록에 더하고, 이름이나 보관 상태가 바뀐 프로젝트는 새 상태로 바꿔 끼운다.
 */
export function useActiveProject(): UseActiveProjectResult {
  const { projects: serverProjects } = useCurrentUser();
  const activeProjectId = useActiveProjectStore((state) => state.activeProjectId);
  const pendingProject = useActiveProjectStore((state) => state.pendingProject);
  const setActiveProjectId = useActiveProjectStore((state) => state.setActiveProjectId);
  const isHydrated = useHasMounted();

  // 서버 목록이 아직 따라오지 못한 pendingProject만 남긴다 — 생성은 "목록에 없음",
  // 이름 변경·보관·복원은 "옛 상태로 있음"이 그 조건이다.
  const pendingOverlay =
    pendingProject !== null &&
    !serverProjects.some(
      (project) =>
        project.id === pendingProject.id &&
        project.name === pendingProject.name &&
        project.isArchived === pendingProject.isArchived
    )
      ? pendingProject
      : null;

  const merged =
    pendingOverlay === null
      ? serverProjects
      : serverProjects.some((project) => project.id === pendingOverlay.id)
        ? serverProjects.map((project) => (project.id === pendingOverlay.id ? pendingOverlay : project))
        : [...serverProjects, pendingOverlay];

  const projects = merged.filter((project) => !project.isArchived);
  const archivedProjects = merged.filter((project) => project.isArchived);

  const resolvedId = projects.some((project) => project.id === activeProjectId)
    ? activeProjectId
    : (projects[0]?.id ?? null);

  useEffect(() => {
    // hydration 렌더에서는 zustand가 localStorage 값 대신 초기값(null)을 돌려준다 — 그 값으로
    // 고치면 저장된 선택이 첫 프로젝트로 덮인다.
    if (!isHydrated) return;
    // 아직 목록이 따라오지 않았다면 pendingProject를 해제하면 안 된다(선택이 첫 프로젝트로 튄다).
    if (pendingOverlay !== null) return;
    if (resolvedId !== activeProjectId || pendingProject !== null) setActiveProjectId(resolvedId);
  }, [isHydrated, pendingOverlay, resolvedId, activeProjectId, pendingProject, setActiveProjectId]);

  return {
    projects,
    archivedProjects,
    // hydration 중에는 활성 프로젝트를 정하지 않는다 — 첫 프로젝트로 잠깐 잡히면 데이터 훅들이
    // 그 프로젝트를 조회하고, 늦게 도착한 그 응답이 실제 선택 프로젝트의 데이터를 덮어쓴다.
    activeProject: isHydrated ? (projects.find((project) => project.id === resolvedId) ?? null) : null,
    setActiveProjectId,
  };
}
