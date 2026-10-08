import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { SyncedAsset, SyncedAssetCategory } from "@/lib/store/synced-assets-store";
import type { Attachment } from "@/lib/types";
import type { Database } from "../schema";
import { mapAssetCategoryRowToCategory, mapAttachmentRowToAttachment, mapLatestAssetSyncRowToSyncedAsset } from "../mappers";
import { ATTACHMENTS_BUCKET, deleteAttachmentRow, uploadAttachment } from "./attachments";

type Client = SupabaseClient<Database>;

const UNIQUE_VIOLATION_CODE = "23505";
const DUPLICATE_CATEGORY_MESSAGE = "이미 같은 이름의 카테고리가 있습니다.";

export class DuplicateAssetCategoryLabelError extends Error {}

function throwCategoryWriteError(error: PostgrestError | null): asserts error is null {
  if (!error) return;
  throw error.code === UNIQUE_VIOLATION_CODE
    ? new DuplicateAssetCategoryLabelError(DUPLICATE_CATEGORY_MESSAGE)
    : error;
}

export async function listAssetCategories(supabase: Client, projectId: string): Promise<SyncedAssetCategory[]> {
  const { data, error } = await supabase
    .from("asset_categories")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapAssetCategoryRowToCategory);
}

export async function createAssetCategory(
  supabase: Client,
  projectId: string,
  label: string
): Promise<SyncedAssetCategory> {
  const { data, error } = await supabase
    .from("asset_categories")
    .insert({ project_id: projectId, label })
    .select("*")
    .single();
  throwCategoryWriteError(error);
  return mapAssetCategoryRowToCategory(data);
}

/**
 * INSERT 응답이 네트워크 오류 등으로 애매할 때, 실제로 저장됐는지 확인하기 위한 조회.
 * (project_id, label) unique index를 그대로 활용한다.
 */
export async function findAssetCategoryByLabel(
  supabase: Client,
  projectId: string,
  label: string
): Promise<SyncedAssetCategory | null> {
  const { data, error } = await supabase
    .from("asset_categories")
    .select("*")
    .eq("project_id", projectId)
    .eq("label", label)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAssetCategoryRowToCategory(data) : null;
}

/**
 * 카테고리를 삭제한다. 이 카테고리 전용으로 대시보드에서 직접 업로드한 첨부
 * (target_type='asset_category')만 Storage 객체·메타데이터를 정리하고, 작업/
 * 버그/채팅에서 동기화된 원본 첨부(target_type이 그쪽인 행)는 손대지 않는다.
 *
 * Storage 오브젝트 삭제는 Postgres 트랜잭션과 원래 원자적으로 묶을 수 없는
 * 별도 시스템 호출이라 먼저 처리하고, "attachments 메타데이터 행 + 카테고리
 * 행" 삭제는 순수 Postgres 상태라 remove_asset_category RPC 한 트랜잭션으로
 * 묶어 원자성을 보장한다(둘을 앱에서 따로 delete하면 첫 번째만 성공하고 두
 * 번째가 실패했을 때 회복하기 애매한 중간 상태가 남을 수 있다). asset_syncs
 * 이력은 category_id의 on delete cascade로 RPC 안에서 함께 정리된다.
 */
export async function removeAssetCategory(supabase: Client, categoryId: string): Promise<void> {
  const { data: dashboardAttachments, error } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("target_type", "asset_category")
    .eq("target_id", categoryId);
  if (error) throw error;

  const storagePaths = (dashboardAttachments ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(storagePaths);
    if (removeError) throw removeError;
  }

  const { error: rpcError } = await supabase.rpc("remove_asset_category", { p_category_id: categoryId });
  if (rpcError) throw rpcError;
}

/** 카테고리별 "최신" 동기화 파일. latest_asset_syncs 뷰 + attachments를 2단계로 조인한다(임베디드 select 미지원). */
export async function listLatestSyncedAssets(
  supabase: Client,
  categoryIds: string[]
): Promise<Map<string, SyncedAsset>> {
  const map = new Map<string, SyncedAsset>();
  if (categoryIds.length === 0) return map;

  const { data: syncRows, error } = await supabase
    .from("latest_asset_syncs")
    .select("*")
    .in("category_id", categoryIds);
  if (error) throw error;
  if (!syncRows || syncRows.length === 0) return map;

  const attachmentIds = syncRows.map((row) => row.attachment_id);
  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("attachments")
    .select("*")
    .in("id", attachmentIds);
  if (attachmentError) throw attachmentError;

  const attachmentsById = new Map((attachmentRows ?? []).map((row) => [row.id, row]));

  for (const row of syncRows) {
    const attachment = attachmentsById.get(row.attachment_id);
    if (!attachment) continue; // 방어적: 참조된 첨부를 못 찾으면 건너뛴다(정상 상태라면 발생하지 않는다).
    map.set(row.category_id, mapLatestAssetSyncRowToSyncedAsset({ ...row, attachment }));
  }
  return map;
}

export interface AssetSyncHistoryEntry {
  /** asset_syncs.id — 버전 하나를 가리키는 식별자(비교 선택 등에 쓴다). */
  id: string;
  sourceLabel: string;
  createdAt: string;
  /** 가리키던 첨부가 삭제됐으면 null — 화면은 이 버전을 "파일을 찾을 수 없음"으로 표시한다. */
  attachment: Attachment | null;
}

/**
 * 카테고리 하나의 전체 동기화 이력을 최신순으로 조회한다("최신 버전"만 보여주는
 * listLatestSyncedAssets와 달리 전부 반환한다). 대시보드 진입 시 자동으로 부르지
 * 않고, 사용자가 "버전 이력"을 열었을 때만 호출한다(지연 조회).
 *
 * 쿼리는 정확히 2개다: asset_syncs를 category_id로 조회 + 그 행들이 가리키는
 * attachments를 attachment_id로 배치(.in()) 조회 — 버전이 몇 개든 N+1이 없다.
 * asset_syncs가 가리키는 attachment가 이미 삭제된 경우(작업/버그 삭제 시 연쇄
 * 삭제 등) attachment를 null로 남겨두고 그 한 항목만 "파일 없음"으로 표시할 수
 * 있게 한다 — 화면 전체를 실패시키지 않는다.
 */
export async function listAssetSyncHistory(supabase: Client, categoryId: string): Promise<AssetSyncHistoryEntry[]> {
  const { data: syncRows, error } = await supabase
    .from("asset_syncs")
    .select("*")
    .eq("category_id", categoryId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!syncRows || syncRows.length === 0) return [];

  const attachmentIds = Array.from(new Set(syncRows.map((row) => row.attachment_id)));
  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("attachments")
    .select("*")
    .in("id", attachmentIds);
  if (attachmentError) throw attachmentError;

  const attachmentsById = new Map((attachmentRows ?? []).map((row) => [row.id, row]));

  return syncRows.map((row) => {
    const attachmentRow = attachmentsById.get(row.attachment_id);
    return {
      id: row.id,
      sourceLabel: row.source_label,
      createdAt: row.created_at,
      attachment: attachmentRow ? mapAttachmentRowToAttachment(attachmentRow) : null,
    };
  });
}

/**
 * 작업/버그 등 다른 곳의 첨부를 새로 업로드하지 않고, 이미 저장된 attachment
 * 메타데이터를 그대로 가리키는 asset_syncs 이력 행만 추가한다. 호출부는
 * attachmentId가 attachments 테이블에 이미 존재함을 보장해야 한다(그렇지
 * 않으면 attachment_id FK 위반으로 실패한다) — task-form.tsx는 아직
 * Storage에 올라가지 않은 로컬 파일에는 이 함수를 호출하지 않는다.
 */
export async function syncExistingAttachment(
  supabase: Client,
  categoryId: string,
  attachmentId: string,
  sourceLabel: string
): Promise<void> {
  const { error } = await supabase
    .from("asset_syncs")
    .insert({ category_id: categoryId, attachment_id: attachmentId, source_label: sourceLabel });
  if (error) throw error;
}

/**
 * 대시보드에서 파일을 직접 업로드한다. Storage+attachments에 실제로 저장한 뒤
 * (uploadAttachment 재사용) 이 카테고리의 최신 동기화 이력으로 추가한다.
 * 동기화 이력 저장이 실패하면 방금 올린 파일을 정리해(uploadAttachment의
 * 보상 처리와 같은 원칙) Storage 고아 파일이 남지 않게 한다.
 */
export async function uploadAndSyncAsset(
  supabase: Client,
  projectId: string,
  categoryId: string,
  uploadedBy: string,
  file: File,
  sourceLabel: string
): Promise<void> {
  const attachmentId = crypto.randomUUID();
  const { storagePath } = await uploadAttachment(supabase, {
    projectId,
    targetType: "asset_category",
    targetId: categoryId,
    uploadedBy,
    id: attachmentId,
    file,
  });

  try {
    await syncExistingAttachment(supabase, categoryId, attachmentId, sourceLabel);
  } catch (err) {
    await deleteAttachmentRow(supabase, { id: attachmentId, storage_path: storagePath });
    throw err;
  }
}

/**
 * 카테고리의 최신 에셋 파일명을 바꾼다. 재업로드 없이 공유되는 동일한
 * attachments 행을 수정하므로(동기화는 복사가 아니라 참조다), 원본이 작업/
 * 버그/채팅 첨부라면 그쪽 화면에도 바뀐 이름이 함께 반영된다 — 의도된 동작이다.
 */
export async function renameAttachment(supabase: Client, attachmentId: string, name: string): Promise<void> {
  const { error } = await supabase.from("attachments").update({ original_filename: name }).eq("id", attachmentId);
  if (error) throw error;
}
