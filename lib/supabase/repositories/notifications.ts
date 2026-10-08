import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppNotification } from "@/lib/types";
import type { Database, NotificationRow } from "../schema";
import { UNKNOWN_USER } from "../mappers";
import { fetchUsersById, uniqueIds } from "./users";

type Client = SupabaseClient<Database>;

const LIST_LIMIT = 30;
const EXCERPT_LENGTH = 80;

/**
 * 알림 행에 보낸 사람 이름·작업 제목·댓글 앞부분을 붙인다. 세 조회는 서로 무관해 병렬로 돌린다.
 * 작업/댓글이 지워졌으면 알림도 cascade로 사라지므로, 빈 값은 RLS로 못 읽는 경우뿐이다.
 */
export async function enrichNotifications(supabase: Client, rows: NotificationRow[]): Promise<AppNotification[]> {
  if (rows.length === 0) return [];
  const taskIds = uniqueIds(rows.map((row) => row.task_id));
  const commentIds = uniqueIds(rows.map((row) => row.comment_id));

  const [usersById, tasksResult, commentsResult] = await Promise.all([
    fetchUsersById(supabase, rows.map((row) => row.actor_id)),
    taskIds.length > 0 ? supabase.from("tasks").select("id,title").in("id", taskIds) : null,
    commentIds.length > 0 ? supabase.from("task_comments").select("id,content").in("id", commentIds) : null,
  ]);
  if (tasksResult?.error) throw tasksResult.error;
  if (commentsResult?.error) throw commentsResult.error;

  const titleByTaskId = new Map((tasksResult?.data ?? []).map((task) => [task.id, task.title]));
  const contentByCommentId = new Map((commentsResult?.data ?? []).map((comment) => [comment.id, comment.content]));

  return rows.map((row) => {
    const content = row.comment_id ? contentByCommentId.get(row.comment_id) : undefined;
    return {
      id: row.id,
      kind: row.kind,
      projectId: row.project_id,
      actorName: (row.actor_id && usersById.get(row.actor_id)?.name) || UNKNOWN_USER.name,
      taskId: row.task_id,
      taskTitle: (row.task_id && titleByTaskId.get(row.task_id)) || null,
      commentExcerpt: content ? content.slice(0, EXCERPT_LENGTH) : null,
      createdAt: row.created_at,
      isRead: row.read_at !== null,
    };
  });
}

/** 최근 알림 LIST_LIMIT건. RLS가 본인 알림만 돌려주지만 user_id도 명시해 인덱스를 탄다. */
export async function listNotifications(supabase: Client, userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  return enrichNotifications(supabase, data ?? []);
}

export async function markNotificationsRead(supabase: Client, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
  if (error) throw error;
}
