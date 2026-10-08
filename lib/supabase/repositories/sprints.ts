import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Sprint } from "@/lib/types";
import type { Database } from "../schema";
import { mapSprintRowToSprint } from "../mappers";

type Client = SupabaseClient<Database>;

/** Postgres 유니크 제약 위반(23505) — 같은 프로젝트에 이름이 겹치는 스프린트가 이미 있을 때. */
const UNIQUE_VIOLATION_CODE = "23505";

export interface SprintWriteInput {
  name: string;
  startDate: string;
  endDate: string;
}

function throwSprintWriteError(error: PostgrestError | null): asserts error is null {
  if (!error) return;
  throw error.code === UNIQUE_VIOLATION_CODE ? new Error("이미 같은 이름의 스프린트가 있습니다.") : error;
}

export async function listSprints(supabase: Client, projectId: string): Promise<Sprint[]> {
  const { data, error } = await supabase
    .from("sprints")
    .select("*")
    .eq("project_id", projectId)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapSprintRowToSprint);
}

export async function createSprint(supabase: Client, projectId: string, input: SprintWriteInput): Promise<Sprint> {
  const { data, error } = await supabase
    .from("sprints")
    .insert({ project_id: projectId, name: input.name, start_date: input.startDate, end_date: input.endDate })
    .select("*")
    .single();
  throwSprintWriteError(error);
  return mapSprintRowToSprint(data);
}

export async function updateSprint(supabase: Client, sprintId: string, input: SprintWriteInput): Promise<Sprint> {
  const { data, error } = await supabase
    .from("sprints")
    .update({ name: input.name, start_date: input.startDate, end_date: input.endDate })
    .eq("id", sprintId)
    .select("*")
    .single();
  throwSprintWriteError(error);
  return mapSprintRowToSprint(data);
}

/** 스프린트를 지우면 DB의 on delete set null로 소속 작업은 백로그가 된다. */
export async function deleteSprint(supabase: Client, sprintId: string): Promise<void> {
  const { error } = await supabase.from("sprints").delete().eq("id", sprintId);
  if (error) throw error;
}
