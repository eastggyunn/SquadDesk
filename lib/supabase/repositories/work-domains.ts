import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { WorkDomain } from "@/lib/store/work-domains-store";
import type { Database } from "../schema";
import { mapWorkDomainRowToWorkDomain } from "../mappers";

type Client = SupabaseClient<Database>;

/** Postgres 유니크 제약 위반(23505) — 같은 프로젝트에 이름이 겹치는 업무 영역이 이미 있을 때. */
const UNIQUE_VIOLATION_CODE = "23505";
const DUPLICATE_LABEL_MESSAGE = "이미 같은 이름의 업무 영역이 있습니다.";

export class DuplicateWorkDomainLabelError extends Error {}

function throwWorkDomainWriteError(error: PostgrestError | null): asserts error is null {
  if (!error) return;
  throw error.code === UNIQUE_VIOLATION_CODE ? new DuplicateWorkDomainLabelError(DUPLICATE_LABEL_MESSAGE) : error;
}

export async function listWorkDomains(supabase: Client, projectId: string): Promise<WorkDomain[]> {
  const { data, error } = await supabase
    .from("work_domains")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapWorkDomainRowToWorkDomain);
}

export async function createWorkDomain(
  supabase: Client,
  projectId: string,
  label: string,
  sortOrder: number
): Promise<WorkDomain> {
  const { data, error } = await supabase
    .from("work_domains")
    .insert({ project_id: projectId, label, sort_order: sortOrder })
    .select("*")
    .single();
  throwWorkDomainWriteError(error);
  return mapWorkDomainRowToWorkDomain(data);
}

/**
 * INSERT 응답이 네트워크 오류 등으로 애매할 때, 실제로 저장됐는지 확인하기 위한 조회.
 * (project_id, label) unique index를 그대로 활용한다.
 */
export async function findWorkDomainByLabel(
  supabase: Client,
  projectId: string,
  label: string
): Promise<WorkDomain | null> {
  const { data, error } = await supabase
    .from("work_domains")
    .select("*")
    .eq("project_id", projectId)
    .eq("label", label)
    .maybeSingle();
  if (error) throw error;
  return data ? mapWorkDomainRowToWorkDomain(data) : null;
}

export async function deleteWorkDomain(supabase: Client, domainId: string): Promise<void> {
  const { error } = await supabase.from("work_domains").delete().eq("id", domainId);
  if (error) throw error;
}

/**
 * 드래그 정렬 결과를 sort_order로 일괄 반영한다. upsert는 NOT NULL인 label/project_id
 * 없이 부분 컬럼만 보내면 충돌 시에도 제약 위반 여지가 있어(PostgREST가 INSERT ...
 * ON CONFLICT 문을 만드는 방식과 얽힘) 안전하게 행별 update를 병렬로 보낸다.
 */
export async function reorderWorkDomains(supabase: Client, orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from("work_domains").update({ sort_order: index }).eq("id", id))
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
