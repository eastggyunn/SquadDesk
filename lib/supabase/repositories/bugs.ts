import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment, Bug, BugSeverity, BugStatus } from "@/lib/types";
import type { BugRow, Database, UserRow } from "../schema";
import { mapBugRowToBug } from "../mappers";
import { deleteAttachmentsForTarget, listAttachmentsForTargets, syncAttachments } from "./attachments";

type Client = SupabaseClient<Database>;

/**
 * 보고자(users) 행을 별도 조회해 붙인다 — tasks.ts의 enrichTasks와 같은 이유(임베디드 select 대신 2회 조회).
 * export하는 이유도 enrichTasks와 같다: 대시보드 읽기 훅이 bugs를 다시 조회하지 않고 이미 받아온
 * raw row를 이 함수로 직접 enrich하기 위해서다.
 */
export async function enrichBugs(supabase: Client, rows: BugRow[]): Promise<Bug[]> {
  if (rows.length === 0) return [];

  const reporterIds = Array.from(
    new Set(rows.map((row) => row.reporter_id).filter((id): id is string => Boolean(id)))
  );

  const [userRowsResult, attachmentsByBugId] = await Promise.all([
    reporterIds.length > 0
      ? supabase.from("users").select("*").in("id", reporterIds)
      : Promise.resolve({ data: [] as UserRow[], error: null }),
    listAttachmentsForTargets(
      supabase,
      "bug",
      rows.map((row) => row.id)
    ),
  ]);
  if (userRowsResult.error) throw userRowsResult.error;

  const usersById = new Map<string, UserRow>();
  for (const user of userRowsResult.data ?? []) usersById.set(user.id, user);

  return rows.map((row) =>
    mapBugRowToBug({
      ...row,
      reporter: row.reporter_id ? (usersById.get(row.reporter_id) ?? null) : null,
      attachments: attachmentsByBugId.get(row.id) ?? [],
    })
  );
}

export async function listBugs(supabase: Client, projectId: string): Promise<Bug[]> {
  const { data, error } = await supabase
    .from("bugs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return enrichBugs(supabase, data ?? []);
}

/** 아직 처리되지 않은(Open / In Progress) 버그 수만 센다 — 행은 받아오지 않는다. */
export async function countOpenBugs(supabase: Client, projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from("bugs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .in("status", ["Open", "In Progress"]);
  if (error) throw error;
  return count ?? 0;
}

export interface BugWriteInput {
  title: string;
  severity: BugSeverity;
  location: string;
  status: BugStatus;
  reproductionSteps: string;
  consoleLog: string;
  taskId?: string;
  attachments: Attachment[];
}

export async function createBug(
  supabase: Client,
  projectId: string,
  reporterId: string,
  input: BugWriteInput,
  pendingFiles: Map<string, File>
): Promise<void> {
  const { data, error } = await supabase
    .from("bugs")
    .insert({
      project_id: projectId,
      reporter_id: reporterId,
      title: input.title,
      severity: input.severity,
      location: input.location,
      status: input.status,
      reproduction_steps: input.reproductionSteps || null,
      console_log: input.consoleLog || null,
      task_id: input.taskId || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await syncAttachments(
    supabase,
    { projectId, targetType: "bug", targetId: data.id, uploadedBy: reporterId },
    input.attachments,
    pendingFiles
  );
}

export async function updateBug(
  supabase: Client,
  bugId: string,
  projectId: string,
  currentUserId: string,
  input: BugWriteInput,
  pendingFiles: Map<string, File>
): Promise<void> {
  const { error } = await supabase
    .from("bugs")
    .update({
      title: input.title,
      severity: input.severity,
      location: input.location,
      status: input.status,
      reproduction_steps: input.reproductionSteps || null,
      console_log: input.consoleLog || null,
      task_id: input.taskId || null,
    })
    .eq("id", bugId);
  if (error) throw error;

  await syncAttachments(
    supabase,
    { projectId, targetType: "bug", targetId: bugId, uploadedBy: currentUserId },
    input.attachments,
    pendingFiles
  );
}

export async function deleteBug(supabase: Client, bugId: string): Promise<void> {
  await deleteAttachmentsForTarget(supabase, "bug", bugId);
  const { error } = await supabase.from("bugs").delete().eq("id", bugId);
  if (error) throw error;
}

export async function setBugStatus(supabase: Client, bugId: string, status: BugStatus): Promise<void> {
  const { error } = await supabase.from("bugs").update({ status }).eq("id", bugId);
  if (error) throw error;
}
