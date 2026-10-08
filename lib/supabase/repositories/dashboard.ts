import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignee, Bug, Task } from "@/lib/types";
import type { AssetSyncRow, AttachmentRow, BugRow, ChatMessageRow, Database, TaskRow, UserRow } from "../schema";
import { mapUserRowToAssignee } from "../mappers";
import { enrichTasks } from "./tasks";
import { enrichBugs } from "./bugs";

type Client = SupabaseClient<Database>;

export type ActivityKind = "task" | "bug" | "asset" | "chat";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  summary: string;
  author: Assignee;
  createdAt: string;
}

export interface DashboardSnapshot {
  tasks: Task[];
  bugs: Bug[];
  activity: ActivityEntry[];
}

const UNKNOWN_USER: Assignee = { name: "알 수 없음", role: "Unknown" };

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 대시보드 진입 한 번에 필요한 모든 데이터(작업·버그·최근 활동)를 tasks/bugs 각각
 * 정확히 한 번씩만 조회해서 만든다. 예전에는 이 함수가 최근 활동용으로 tasks/bugs를
 * 별도 조회해 useDashboardData가 이미 부른 listTasks()/listBugs()와 중복이었다 —
 * 이제 raw row를 한 번만 받아 (1) tasks.ts/bugs.ts의 enrichTasks/enrichBugs로 위젯용
 * Task[]/Bug[]를 만들고 (2) 같은 raw row에서 최근 것만 추려 활동 피드를 만든다.
 *
 * 활동 피드는 "완전한 수정 이력"이 아니라 각 테이블의 created_at 기준 최근 등록·
 * 동기화·메시지다(작업/버그의 상태 변경이나 재할당 같은 이후 수정은 반영되지 않는다).
 * 별도 감사 로그 테이블이나 트리거는 만들지 않는다 — README "최근 활동 데이터 기준"
 * 참고.
 */
export async function loadDashboardSnapshot(
  supabase: Client,
  projectId: string,
  activityLimit: number
): Promise<DashboardSnapshot> {
  // tasks/bugs는 여기서 딱 한 번만 조회한다. 정렬 기준은 각각 tasksRepo.listTasks()/
  // bugsRepo.listBugs()와 동일하게 맞춰, enrichTasks/enrichBugs가 만드는 Task[]/Bug[]
  // 순서가 그 함수들을 직접 썼을 때와 같게 유지한다(위젯 쪽 동작 변화 없음).
  const [taskResult, bugResult] = await Promise.all([
    supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
    supabase.from("bugs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  if (taskResult.error) throw taskResult.error;
  if (bugResult.error) throw bugResult.error;

  const taskRows = (taskResult.data ?? []) as TaskRow[];
  const bugRows = (bugResult.data ?? []) as BugRow[];

  // 활동 피드 후보는 최신 N개만 있으면 된다. bugRows는 이미 최신순이라 그대로 자르고,
  // taskRows는 위젯 순서(오름차순)를 유지해야 하므로 활동용으로만 복사해 내림차순 정렬한다.
  const recentTaskRows = [...taskRows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, activityLimit);
  const recentBugRows = bugRows.slice(0, activityLimit);

  const [tasks, bugs, activity] = await Promise.all([
    enrichTasks(supabase, taskRows),
    enrichBugs(supabase, bugRows),
    buildActivityEntries(supabase, projectId, recentTaskRows, recentBugRows, activityLimit),
  ]);

  return { tasks, bugs, activity };
}

/**
 * 작업·버그(이미 조회된 raw row)에 에셋 동기화·채팅 메시지를 더해 최신순으로 합친다.
 * 채팅/에셋은 대시보드 전용 데이터라 여기서 직접 조회한다 — 쿼리 수는 프로젝트
 * 규모와 무관하게 고정이다(채팅 1개 + 카테고리 1개 + 에셋 동기화 0~1개 + 작성자/
 * 첨부 이름 배치 조회 각 0~1개).
 */
async function buildActivityEntries(
  supabase: Client,
  projectId: string,
  recentTaskRows: TaskRow[],
  recentBugRows: BugRow[],
  limit: number
): Promise<ActivityEntry[]> {
  const [chatResult, categoryResult] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("asset_categories").select("id,label").eq("project_id", projectId),
  ]);
  if (chatResult.error) throw chatResult.error;
  if (categoryResult.error) throw categoryResult.error;

  const chatRows = (chatResult.data ?? []) as ChatMessageRow[];
  const categoryLabelById = new Map((categoryResult.data ?? []).map((row) => [row.id, row.label]));
  const categoryIds = Array.from(categoryLabelById.keys());

  const syncResult =
    categoryIds.length > 0
      ? await supabase
          .from("asset_syncs")
          .select("*")
          .in("category_id", categoryIds)
          .order("created_at", { ascending: false })
          .limit(limit)
      : { data: [] as AssetSyncRow[], error: null };
  if (syncResult.error) throw syncResult.error;
  const syncRows = (syncResult.data ?? []) as AssetSyncRow[];

  const attachmentIds = Array.from(new Set(syncRows.map((row) => row.attachment_id)));
  const attachmentResult =
    attachmentIds.length > 0
      ? await supabase.from("attachments").select("id,original_filename,uploaded_by").in("id", attachmentIds)
      : { data: [] as Pick<AttachmentRow, "id" | "original_filename" | "uploaded_by">[], error: null };
  if (attachmentResult.error) throw attachmentResult.error;
  const attachmentsById = new Map((attachmentResult.data ?? []).map((row) => [row.id, row]));

  const authorIds = Array.from(
    new Set(
      [
        ...recentTaskRows.map((row) => row.reporter_id),
        ...recentBugRows.map((row) => row.reporter_id),
        ...chatRows.map((row) => row.sender_id),
        ...Array.from(attachmentsById.values()).map((row) => row.uploaded_by),
      ].filter((id): id is string => Boolean(id))
    )
  );

  const usersResult =
    authorIds.length > 0
      ? await supabase.from("users").select("*").in("id", authorIds)
      : { data: [] as UserRow[], error: null };
  if (usersResult.error) throw usersResult.error;
  const usersById = new Map((usersResult.data ?? []).map((row) => [row.id, row]));

  const author = (userId: string | null) => mapUserRowToAssignee(userId ? usersById.get(userId) : null, UNKNOWN_USER);

  const entries: ActivityEntry[] = [
    ...recentTaskRows.map((row) => ({
      id: `task:${row.id}`,
      kind: "task" as const,
      summary: `${row.title} 작업 등록`,
      author: author(row.reporter_id),
      createdAt: row.created_at,
    })),
    ...recentBugRows.map((row) => ({
      id: `bug:${row.id}`,
      kind: "bug" as const,
      summary: `${row.title} 버그 등록`,
      author: author(row.reporter_id),
      createdAt: row.created_at,
    })),
    ...chatRows.map((row) => ({
      id: `chat:${row.id}`,
      kind: "chat" as const,
      // 첨부만 보낸 메시지는 본문이 비어 있다 — "메시지:" 뒤가 빈 항목으로 보이지 않게 한다.
      summary: row.content.trim() ? `메시지: ${truncate(row.content, 60)}` : "첨부파일 전송",
      author: author(row.sender_id),
      createdAt: row.created_at,
    })),
    ...syncRows.map((row) => {
      const attachment = attachmentsById.get(row.attachment_id);
      const categoryLabel = categoryLabelById.get(row.category_id) ?? "카테고리";
      return {
        id: `asset:${row.id}`,
        kind: "asset" as const,
        summary: `${categoryLabel}에 ${attachment?.original_filename ?? "파일"} 동기화`,
        author: author(attachment?.uploaded_by ?? null),
        createdAt: row.created_at,
      };
    }),
  ];

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
