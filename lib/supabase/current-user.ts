import "server-only";
import type { Assignee } from "@/lib/types";
import type { ProjectMemberRole } from "./schema";
import { isProjectArchived, mapUserRowToAssignee } from "./mappers";
import { tryCreateServerSupabaseClient } from "./server";

export interface ProjectSummary {
  id: string;
  name: string;
  /** 로그인 사용자가 이 프로젝트에서 갖는 역할. 멤버 관리 화면 접근 여부를 가른다(실제 강제는 RLS/RPC). */
  role: ProjectMemberRole;
  /** 보관된 프로젝트인지. 보관된 것은 활성 프로젝트 선택 목록에서 빠지고 읽기 전용이 된다(is_project_writable). */
  isArchived: boolean;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  assignee: Assignee;
  /** 로그인 사용자가 속한 프로젝트 목록(보관된 것 포함). 활성 프로젝트가 하나도 없으면 "아직 배정된 프로젝트가 없습니다" 상태를 보여준다. */
  projects: ProjectSummary[];
}

/**
 * 로그인한 사용자 + public.users 프로필 + 소속 프로젝트 목록을 한 번에 조회한다.
 * Supabase 환경 변수가 없거나 세션이 없으면 null을 반환한다 — 호출부(레이아웃,
 * 사이드바)는 이 경우 안전한 기본 표시(게스트 등)로 대체해야 한다.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = tryCreateServerSupabaseClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("project_members").select("*").eq("user_id", user.id),
  ]);

  const roleByProjectId = new Map<string, ProjectMemberRole>(
    (memberships ?? []).map((membership) => [membership.project_id, membership.role])
  );
  const projectIds = Array.from(roleByProjectId.keys());
  const { data: projectRows } =
    projectIds.length > 0 ? await supabase.from("projects").select("*").in("id", projectIds) : { data: [] };

  const fallbackName = user.email?.split("@")[0] ?? "사용자";

  return {
    id: user.id,
    email: user.email ?? null,
    assignee: mapUserRowToAssignee(profile, { name: fallbackName, role: "Member" }),
    projects: (projectRows ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      role: roleByProjectId.get(project.id) ?? "member",
      isArchived: isProjectArchived(project),
    })),
  };
}
