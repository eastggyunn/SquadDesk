import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProjectRow } from "../schema";

type Client = SupabaseClient<Database>;

/** supabase/migrations/00000000000016_*.sql의 projects_name_length 제약과 같은 값. */
export const PROJECT_NAME_MAX_LENGTH = 50;

/**
 * 이름 비교용 정규화. SQL의 normalize_project_name()과 같은 규칙이어야 한다
 * (앞뒤 공백 제거 · 연속 공백 1칸 · 소문자) — 두 규칙이 어긋나면 UI가 통과시킨
 * 이름을 DB가 거부하는 식으로 조용히 갈라진다.
 */
export function normalizeProjectName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * 제출 전 클라이언트 검증. 오류 문구는 DB(create_project/rename_project)가 던지는
 * 것과 글자까지 동일하게 맞춰, 어느 쪽에서 걸리든 사용자가 같은 안내를 본다.
 *
 * 중복 판정 범위는 "호출자가 속한 프로젝트 목록"이다 — DB 트리거
 * enforce_project_name_unique_for_actor()가 project_members로 보는 범위와 같고,
 * 그 목록이 곧 사이드바에 보이는 프로젝트다.
 */
export function validateProjectName(name: string, otherProjectNames: string[]): string | null {
  const normalized = normalizeProjectName(name);
  if (normalized === "") return "프로젝트 이름을 입력해주세요.";

  // 길이는 DB의 char_length(v_name)과 같은 기준(공백 정리만 거친, 대소문자 보존 문자열)으로 잰다.
  // normalized는 소문자로도 바꾸므로 그 값을 쓰면 안 된다 — 드문 유니코드 문자는 소문자화로
  // 길이가 늘어날 수 있어(예: 터키어 대문자 İ → 소문자 두 글자), DB가 통과시킬 이름을 UI가
  // 잘못 막을 수 있다.
  const collapsed = name.trim().replace(/\s+/g, " ");
  if (collapsed.length > PROJECT_NAME_MAX_LENGTH) {
    return `프로젝트 이름은 ${PROJECT_NAME_MAX_LENGTH}자 이하로 입력해주세요.`;
  }
  if (otherProjectNames.some((other) => normalizeProjectName(other) === normalized)) {
    return "이미 같은 이름의 프로젝트가 있습니다. 다른 이름을 입력해주세요.";
  }
  return null;
}

/**
 * 프로젝트 + 생성자 owner 멤버십을 한 트랜잭션으로 만든다(SECURITY DEFINER RPC).
 * 실패하면 DB에서 전부 롤백되므로 프로젝트만 남는 부분 생성 상태가 없다.
 */
export async function createProject(supabase: Client, name: string): Promise<ProjectRow> {
  const { data, error } = await supabase.rpc("create_project", { p_name: name });
  if (error) throw error;
  return firstProjectOrThrow(data, "프로젝트를 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
}

/** owner만 호출할 수 있다(RPC가 검증). 멤버십·초대 링크·첨부·업무 데이터는 그대로 유지된다. */
export async function renameProject(
  supabase: Client,
  projectId: string,
  name: string
): Promise<ProjectRow> {
  const { data, error } = await supabase.rpc("rename_project", {
    p_project_id: projectId,
    p_name: name,
  });
  if (error) throw error;
  return firstProjectOrThrow(data, "프로젝트 이름을 변경하지 못했습니다.");
}

/**
 * 프로젝트를 보관한다(owner 전용, RPC가 검증). archived_at만 세우므로 행 삭제나
 * cascade가 없고 멤버십·초대·작업·버그·채팅·첨부·Storage 파일은 그대로 남는다.
 * 보관된 프로젝트는 읽기 전용이 된다 — 쓰기 차단은 is_project_writable() RLS가 한다.
 */
export async function archiveProject(supabase: Client, projectId: string): Promise<ProjectRow> {
  const { data, error } = await supabase.rpc("archive_project", { p_project_id: projectId });
  if (error) throw error;
  return firstProjectOrThrow(data, "프로젝트를 보관하지 못했습니다.");
}

/** 보관된 프로젝트를 다시 활성으로 되돌린다(owner 전용). 같은 이름의 활성 프로젝트가 있으면 RPC가 거부한다. */
export async function restoreProject(supabase: Client, projectId: string): Promise<ProjectRow> {
  const { data, error } = await supabase.rpc("restore_project", { p_project_id: projectId });
  if (error) throw error;
  return firstProjectOrThrow(data, "프로젝트를 복원하지 못했습니다.");
}

/**
 * 네 RPC 모두 `returns setof public.projects`라 성공하면 행이 정확히 하나다.
 * 빈 결과는 RLS/권한 때문에 조용히 걸러진 경우이므로 한국어 오류로 바꿔 던진다.
 */
function firstProjectOrThrow(rows: ProjectRow[] | null, fallbackMessage: string): ProjectRow {
  const project = rows?.[0];
  if (!project) throw new Error(fallbackMessage);
  return project;
}
