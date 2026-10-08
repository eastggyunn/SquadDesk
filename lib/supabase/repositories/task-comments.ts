import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assignee, TaskComment } from "@/lib/types";
import type { Database, TaskCommentRow } from "../schema";
import { mapTaskCommentRowToTaskComment } from "../mappers";
import { fetchUsersById } from "./users";

type Client = SupabaseClient<Database>;

/** 작성자(users) 행을 따로 조회해 붙인다 — chat.ts의 enrichMessages와 같은 이유(임베디드 select 미사용). */
export async function enrichTaskComments(supabase: Client, rows: TaskCommentRow[]): Promise<TaskComment[]> {
  const usersById = await fetchUsersById(supabase, rows.map((row) => row.author_id));
  return rows.map((row) =>
    mapTaskCommentRowToTaskComment({ ...row, author: row.author_id ? (usersById.get(row.author_id) ?? null) : null })
  );
}

export async function listTaskComments(supabase: Client, taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return enrichTaskComments(supabase, data ?? []);
}

/**
 * 댓글을 저장한다. 작성자는 항상 로그인 사용자라 다시 조회하지 않고 호출부의 Assignee를 붙인다.
 * 멘션 알림은 DB 트리거(00000000000025)가 만든다 — 클라이언트는 mentioned_user_ids만 넘긴다.
 */
export async function createTaskComment(
  supabase: Client,
  input: { projectId: string; taskId: string; authorId: string; content: string; mentionedUserIds: string[] },
  authorAssignee: Assignee
): Promise<TaskComment> {
  const { data, error } = await supabase
    .from("task_comments")
    .insert({
      project_id: input.projectId,
      task_id: input.taskId,
      author_id: input.authorId,
      content: input.content,
      mentioned_user_ids: input.mentionedUserIds,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { ...mapTaskCommentRowToTaskComment({ ...data, author: null }), author: authorAssignee };
}

export async function deleteTaskComment(supabase: Client, commentId: string): Promise<void> {
  const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
  if (error) throw error;
}
