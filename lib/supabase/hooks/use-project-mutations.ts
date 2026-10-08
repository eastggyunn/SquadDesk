"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { useActiveProjectStore } from "@/lib/store/active-project-store";
import type { ProjectSummary } from "@/lib/supabase/current-user";
import type { ProjectRow } from "@/lib/supabase/schema";
import { isProjectArchived } from "@/lib/supabase/mappers";
import * as projectsRepo from "@/lib/supabase/repositories/projects";

interface UseProjectMutationsResult {
  error: string | null;
  isSubmitting: boolean;
  /** 성공하면 true. 새 프로젝트는 즉시 활성 프로젝트가 된다. */
  create: (name: string) => Promise<boolean>;
  rename: (projectId: string, name: string) => Promise<boolean>;
  /** 보관하면 선택 목록에서 빠지고, 활성 프로젝트였다면 다른 활성 프로젝트로 넘어간다. */
  archive: (projectId: string) => Promise<boolean>;
  restore: (projectId: string) => Promise<boolean>;
  clearError: () => void;
}

/**
 * 네 RPC 모두 owner에게만 성공하므로 role은 owner로 고정이다. 생성 직후의
 * 프로젝트도 만든 사람이 owner다(create_project).
 */
function toOwnerSummary(project: ProjectRow): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    role: "owner",
    isArchived: isProjectArchived(project),
  };
}

/**
 * 프로젝트 생성/이름 변경/보관/복원. 소속 프로젝트 목록은 서버 레이아웃(getCurrentUser)에서
 * 내려오므로 성공 후 router.refresh()로 사이드바·대시보드·선택 목록을 한 번에
 * 다시 그린다. 검증·권한 거부 문구는 RPC가 던진 한국어 메시지를 그대로 보여준다 —
 * 문구의 단일 출처가 SQL이다.
 */
export function useProjectMutations(): UseProjectMutationsResult {
  const router = useRouter();
  const claimProject = useActiveProjectStore((state) => state.claimProject);
  const overlayProject = useActiveProjectStore((state) => state.overlayProject);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function run(action: () => Promise<void>, fallbackMessage: string): Promise<boolean> {
    setError(null);
    setIsSubmitting(true);
    try {
      await action();
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    error,
    isSubmitting,
    clearError: () => setError(null),
    create: (name) =>
      run(async () => {
        const project = await projectsRepo.createProject(getBrowserSupabaseClient(), name);
        // 목록(서버)이 따라오기 전에 먼저 선택·표시해 둔다 — pendingProject가 그 사이를 덮는다.
        claimProject(toOwnerSummary(project));
      }, "프로젝트를 만들지 못했습니다."),
    rename: (projectId, name) =>
      run(async () => {
        const project = await projectsRepo.renameProject(getBrowserSupabaseClient(), projectId, name);
        // 실패하면 여기까지 오지 않으므로 화면에 남는 optimistic 이름도 없다.
        claimProject(toOwnerSummary(project));
      }, "프로젝트 이름을 변경하지 못했습니다."),
    archive: (projectId) =>
      run(async () => {
        const project = await projectsRepo.archiveProject(getBrowserSupabaseClient(), projectId);
        // 선택은 건드리지 않는다 — 목록에서 빠지는 순간 useActiveProject가 다음 활성 프로젝트를 고른다.
        overlayProject(toOwnerSummary(project));
      }, "프로젝트를 보관하지 못했습니다."),
    restore: (projectId) =>
      run(async () => {
        const project = await projectsRepo.restoreProject(getBrowserSupabaseClient(), projectId);
        overlayProject(toOwnerSummary(project));
      }, "프로젝트를 복원하지 못했습니다."),
  };
}
