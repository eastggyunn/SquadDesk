import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AcceptInvitationRow,
  Database,
  ProjectInvitationListRow,
  ProjectInvitationLookupRow,
  ProjectMemberDetailRow,
  ProjectMemberRole,
} from "../schema";

type Client = SupabaseClient<Database>;

export interface ProjectMemberOption {
  id: string;
  name: string;
  role: string;
}

/** 담당자/버그 보고자 선택지에 쓰는 "활성 프로젝트 멤버" 목록. */
export async function listProjectMembers(supabase: Client, projectId: string): Promise<ProjectMemberOption[]> {
  const { data: memberships, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;

  const userIds = (memberships ?? []).map((membership) => membership.user_id);
  if (userIds.length === 0) return [];

  const { data: users, error: usersError } = await supabase.from("users").select("*").in("id", userIds);
  if (usersError) throw usersError;

  return (users ?? [])
    .map((user) => ({ id: user.id, name: user.name, role: user.job_roles[0] ?? "Team" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// ---------------------------------------------------------------------------
// 멤버 관리 / 초대
//
// 권한·상태 검증은 전부 SQL에서 강제된다(UI 검증은 보조 수단일 뿐이다).
// 다만 강제 방식이 두 갈래다:
//  - 멤버 역할 변경/제거: 호출자가 볼 수 있는 project_members 행을 직접 쓰고,
//    owner 여부는 기존 RLS가, 마지막 owner 보호는 트리거가 막는다.
//  - 초대: token_hash처럼 호출자가 봐서는 안 되는 값을 다루므로 SECURITY
//    DEFINER RPC로만 접근한다.
// 자세한 규칙은 supabase/migrations/00000000000012_*.sql 참고.
// ---------------------------------------------------------------------------

/** 멤버 목록. email은 호출자가 owner일 때만 채워진다. */
export async function listProjectMemberDetails(
  supabase: Client,
  projectId: string
): Promise<ProjectMemberDetailRow[]> {
  const { data, error } = await supabase.rpc("list_project_members", { p_project_id: projectId });
  if (error) throw error;
  return data ?? [];
}

/**
 * 역할 변경/멤버 제거는 project_members RLS(owner만)와 마지막 owner 보호 트리거가 강제한다.
 *
 * RLS의 USING은 "거부"가 아니라 "필터"라서, 권한이 없으면 에러 없이 0행이 갱신되고
 * 조용히 성공한 것처럼 보인다. .select()로 실제 반영된 행을 돌려받아 0행이면 명시적으로
 * 실패시켜, RPC 경로(예외를 던짐)와 동일하게 실패가 눈에 보이게 만든다.
 */
async function assertAffected(rows: unknown[] | null, deniedMessage: string): Promise<void> {
  if (!rows || rows.length === 0) throw new Error(deniedMessage);
}

export async function updateProjectMemberRole(
  supabase: Client,
  projectId: string,
  userId: string,
  role: ProjectMemberRole
): Promise<void> {
  const { data, error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  await assertAffected(data, "역할을 변경할 권한이 없습니다. 프로젝트 owner만 변경할 수 있습니다.");
}

export async function removeProjectMember(
  supabase: Client,
  projectId: string,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  await assertAffected(data, "멤버를 제거할 권한이 없습니다. 프로젝트 owner만 제거할 수 있습니다.");
}

export async function listProjectInvitations(
  supabase: Client,
  projectId: string
): Promise<ProjectInvitationListRow[]> {
  const { data, error } = await supabase.rpc("list_project_invitations", { p_project_id: projectId });
  if (error) throw error;
  return data ?? [];
}

/** 초대를 만들고 원문 토큰을 돌려준다. 토큰은 DB에 해시로만 남아 다시 조회할 수 없다. */
export async function createProjectInvitation(
  supabase: Client,
  projectId: string,
  email: string,
  role: ProjectMemberRole
): Promise<string> {
  const { data, error } = await supabase.rpc("create_project_invitation", {
    p_project_id: projectId,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  return data;
}

export async function revokeProjectInvitation(supabase: Client, invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_project_invitation", { p_invitation_id: invitationId });
  if (error) throw error;
}

export async function getProjectInvitation(
  supabase: Client,
  token: string
): Promise<ProjectInvitationLookupRow | null> {
  const { data, error } = await supabase.rpc("get_project_invitation", { p_token: token });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function acceptProjectInvitation(
  supabase: Client,
  token: string
): Promise<AcceptInvitationRow | null> {
  const { data, error } = await supabase.rpc("accept_project_invitation", { p_token: token });
  if (error) throw error;
  return data?.[0] ?? null;
}
