"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ProjectInvitationListRow,
  ProjectMemberDetailRow,
  ProjectMemberRole,
} from "@/lib/supabase/schema";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAbortSignal } from "@/lib/supabase/abortable-client";
import { useLatestRequest } from "@/lib/supabase/hooks/use-latest-request";
import * as membersRepo from "@/lib/supabase/repositories/project-members";

interface UseProjectAccessResult {
  members: ProjectMemberDetailRow[];
  invitations: ProjectInvitationListRow[];
  /** 첫 조회 중에만 true — 쓰기 후 재조회는 목록을 비우지 않는다. */
  isLoading: boolean;
  error: string | null;
  changeRole: (userId: string, role: ProjectMemberRole) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  /** 성공하면 새로 만든 초대 링크의 원문 토큰을 반환한다(재조회 불가 — 한 번만 보여준다). */
  invite: (email: string, role: ProjectMemberRole) => Promise<string | null>;
  revokeInvitation: (invitationId: string) => Promise<void>;
}

/**
 * 멤버 관리 화면의 데이터 훅. owner가 아니면 초대 목록 RPC가 SQL에서 거부되므로
 * isOwner일 때만 초대를 조회한다 — 멤버 목록은 프로젝트 멤버 누구나 볼 수 있고,
 * 이메일 컬럼은 owner에게만 채워져 내려온다.
 */
export function useProjectAccess(projectId: string | null, isOwner: boolean): UseProjectAccessResult {
  const [members, setMembers] = useState<ProjectMemberDetailRow[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitationListRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 프로젝트를 빠르게 바꾸면 앞선 조회가 나중에 끝나 이전 프로젝트의 멤버로
  // 덮어쓸 수 있다. 최신 요청의 응답만 반영하고(이전 요청은 취소), 언마운트 후 setState도 막는다.
  const beginRequest = useLatestRequest();

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      const { isCurrent, signal } = beginRequest();
      if (!projectId) {
        setMembers([]);
        setInvitations([]);
        setIsLoading(false);
        return;
      }
      if (!options?.silent) setIsLoading(true);
      try {
        const supabase = withAbortSignal(getBrowserSupabaseClient(), signal);
        const [memberRows, invitationRows] = await Promise.all([
          membersRepo.listProjectMemberDetails(supabase, projectId),
          isOwner ? membersRepo.listProjectInvitations(supabase, projectId) : Promise.resolve([]),
        ]);
        if (!isCurrent()) return;
        setMembers(memberRows);
        setInvitations(invitationRows);
      } catch (err) {
        if (!isCurrent()) return;
        setError(err instanceof Error ? err.message : "멤버 정보를 불러오지 못했습니다.");
      } finally {
        if (isCurrent() && !options?.silent) setIsLoading(false);
      }
    },
    [projectId, isOwner, beginRequest]
  );

  useEffect(() => {
    setError(null);
    load();
  }, [load]);

  /**
   * 쓰기 공통 래퍼. RPC/트리거/RLS가 던진 한국어 메시지를 그대로 노출한다 —
   * 검증 문구의 단일 출처가 SQL이다. 성공 시에만 조용히 재조회한다.
   */
  async function run<T>(action: () => Promise<T>, fallbackMessage: string): Promise<T | null> {
    setError(null);
    try {
      const result = await action();
      await load({ silent: true });
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
      return null;
    }
  }

  async function changeRole(userId: string, role: ProjectMemberRole) {
    if (!projectId) return;
    await run(
      () => membersRepo.updateProjectMemberRole(getBrowserSupabaseClient(), projectId, userId, role),
      "역할을 변경하지 못했습니다."
    );
  }

  async function removeMember(userId: string) {
    if (!projectId) return;
    await run(
      () => membersRepo.removeProjectMember(getBrowserSupabaseClient(), projectId, userId),
      "멤버를 제거하지 못했습니다."
    );
  }

  async function invite(email: string, role: ProjectMemberRole): Promise<string | null> {
    if (!projectId) return null;
    return run(
      () => membersRepo.createProjectInvitation(getBrowserSupabaseClient(), projectId, email, role),
      "초대를 만들지 못했습니다."
    );
  }

  async function revokeInvitation(invitationId: string) {
    await run(
      () => membersRepo.revokeProjectInvitation(getBrowserSupabaseClient(), invitationId),
      "초대를 취소하지 못했습니다."
    );
  }

  return { members, invitations, isLoading, error, changeRole, removeMember, invite, revokeInvitation };
}
