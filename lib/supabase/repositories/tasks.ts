import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment, Task, TaskPriority, TaskStatus } from "@/lib/types";
import type { Database, TaskRow, UserRow } from "../schema";
import { mapTaskRowToTask } from "../mappers";
import { deleteAttachmentsForTarget, listAttachmentsForTargets, syncAttachments } from "./attachments";

type Client = SupabaseClient<Database>;

/**
 * 담당자(users) 행을 별도 조회해 붙인다. 임베디드 select(`tasks.select("*, assignee:users(*)")`)
 * 대신 이 방식을 쓰는 이유는 lib/supabase/schema.ts가 손으로 쓴 최소 타입이라
 * PostgREST 임베딩에 필요한 Relationships 메타데이터가 없기 때문이다 — 팀/작업
 * 규모가 작아 2회 조회 비용은 무시할 만하다.
 *
 * export하는 이유: 대시보드 읽기 훅(lib/supabase/repositories/dashboard.ts)이 tasks
 * 테이블을 이 파일과 별개로 다시 조회하지 않도록, 자신이 이미 받아온 raw row를 이
 * 함수로 직접 enrich한다 — listTasks()를 또 호출하면 같은 project_id로 tasks를
 * 두 번 조회하게 된다.
 */
export async function enrichTasks(supabase: Client, rows: TaskRow[]): Promise<Task[]> {
  if (rows.length === 0) return [];

  const assigneeIds = Array.from(
    new Set(rows.map((row) => row.assignee_id).filter((id): id is string => Boolean(id)))
  );

  const [userRowsResult, attachmentsByTaskId] = await Promise.all([
    assigneeIds.length > 0
      ? supabase.from("users").select("*").in("id", assigneeIds)
      : Promise.resolve({ data: [] as UserRow[], error: null }),
    listAttachmentsForTargets(
      supabase,
      "task",
      rows.map((row) => row.id)
    ),
  ]);
  if (userRowsResult.error) throw userRowsResult.error;

  const usersById = new Map<string, UserRow>();
  for (const user of userRowsResult.data ?? []) usersById.set(user.id, user);

  return rows.map((row) =>
    mapTaskRowToTask({
      ...row,
      assignee: row.assignee_id ? (usersById.get(row.assignee_id) ?? null) : null,
      attachments: attachmentsByTaskId.get(row.id) ?? [],
    })
  );
}

export async function listTasks(supabase: Client, projectId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return enrichTasks(supabase, data ?? []);
}

export interface TaskWriteInput {
  title: string;
  assigneeId: string;
  priority: TaskPriority;
  startDate?: string;
  dueDate?: string;
  domainId?: string;
  sprintId?: string;
  attachments: Attachment[];
}

export async function createTask(
  supabase: Client,
  projectId: string,
  reporterId: string,
  input: TaskWriteInput,
  pendingFiles: Map<string, File>
): Promise<void> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      reporter_id: reporterId,
      title: input.title,
      assignee_id: input.assigneeId,
      priority: input.priority,
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      domain_id: input.domainId || null,
      sprint_id: input.sprintId || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await syncAttachments(
    supabase,
    { projectId, targetType: "task", targetId: data.id, uploadedBy: reporterId },
    input.attachments,
    pendingFiles
  );
}

export async function updateTask(
  supabase: Client,
  taskId: string,
  projectId: string,
  currentUserId: string,
  input: TaskWriteInput,
  pendingFiles: Map<string, File>
): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title,
      assignee_id: input.assigneeId,
      priority: input.priority,
      start_date: input.startDate || null,
      due_date: input.dueDate || null,
      domain_id: input.domainId || null,
      sprint_id: input.sprintId || null,
    })
    .eq("id", taskId);
  if (error) throw error;

  await syncAttachments(
    supabase,
    { projectId, targetType: "task", targetId: taskId, uploadedBy: currentUserId },
    input.attachments,
    pendingFiles
  );
}

export async function deleteTask(supabase: Client, taskId: string): Promise<void> {
  await deleteAttachmentsForTarget(supabase, "task", taskId);
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function moveTaskStatus(supabase: Client, taskId: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
  if (error) throw error;
}
