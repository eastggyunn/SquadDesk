import type { SupabaseClient } from "@supabase/supabase-js";
import type { Attachment, AttachmentKind } from "@/lib/types";
import { inferAttachmentKind } from "@/components/kanban/attachment-icon";
import type { AttachmentRow, AttachmentTargetType, Database } from "../schema";

type Client = SupabaseClient<Database>;

export const ATTACHMENTS_BUCKET = "attachments";

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  "png", "jpg", "jpeg", "gif", "webp", "svg",
  "xlsx", "xls", "csv",
  "zip", "apk", "ipa",
  "spine",
  "pdf", "doc", "docx", "ppt", "pptx", "txt", "log", "json",
];

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

/** 확장자/용량 제한을 벗어나면 한국어 안내 메시지를, 문제 없으면 null을 반환한다. */
export function validateAttachmentFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension)) {
    return `지원하지 않는 파일 형식입니다: ${file.name}`;
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    const maxMb = MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024);
    return `파일 크기가 ${maxMb}MB를 초과했습니다: ${file.name}`;
  }
  return null;
}

function sanitizeFilenameForPath(filename: string): string {
  const cleaned = filename.replace(/[^\w.\-\s가-힣]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "file";
}

function buildStoragePath(projectId: string, attachmentId: string, filename: string): string {
  return `${projectId}/${attachmentId}/${sanitizeFilenameForPath(filename)}`;
}

interface AttachmentTarget {
  projectId: string;
  targetType: AttachmentTargetType;
  targetId: string;
  uploadedBy: string;
}

/**
 * 파일을 Storage에 올리고 attachments 메타데이터 행을 추가한다. Storage 업로드는
 * 성공했는데 메타데이터 저장이 실패하면(예: 네트워크 끊김) 고아 Storage 파일이
 * 남지 않도록 업로드한 파일을 즉시 삭제(보상 처리)하고 에러를 던진다. 호출부가
 * 이후 자기만의 보상 처리를 해야 할 때(예: synced-assets.ts) storage_path를
 * 다시 계산하지 않도록 반환한다.
 */
export async function uploadAttachment(
  supabase: Client,
  ctx: AttachmentTarget & { id: string; file: File }
): Promise<{ storagePath: string }> {
  const validationError = validateAttachmentFile(ctx.file);
  if (validationError) throw new Error(validationError);

  const storagePath = buildStoragePath(ctx.projectId, ctx.id, ctx.file.name);

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, ctx.file, { contentType: ctx.file.type || undefined, upsert: false });
  if (uploadError) throw new Error(`파일 업로드에 실패했습니다: ${ctx.file.name}`);

  const { error: insertError } = await supabase.from("attachments").insert({
    id: ctx.id,
    project_id: ctx.projectId,
    target_type: ctx.targetType,
    target_id: ctx.targetId,
    original_filename: ctx.file.name,
    storage_path: storagePath,
    mime_type: ctx.file.type || null,
    size_bytes: ctx.file.size,
    kind: inferAttachmentKind(ctx.file.name),
    uploaded_by: ctx.uploadedBy,
  });

  if (insertError) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
    throw new Error(`파일 정보를 저장하지 못해 업로드를 취소했습니다: ${ctx.file.name}`);
  }

  return { storagePath };
}

/** 외부 링크(Figma 등)형 첨부의 메타데이터 행만 추가한다 — Storage 업로드는 없다. */
export async function insertLinkAttachment(
  supabase: Client,
  ctx: AttachmentTarget & { id: string; name: string; url: string; kind: AttachmentKind }
): Promise<void> {
  const { error } = await supabase.from("attachments").insert({
    id: ctx.id,
    project_id: ctx.projectId,
    target_type: ctx.targetType,
    target_id: ctx.targetId,
    original_filename: ctx.name,
    external_url: ctx.url,
    kind: ctx.kind,
    uploaded_by: ctx.uploadedBy,
  });
  if (error) throw new Error(`링크 첨부를 저장하지 못했습니다: ${ctx.name}`);
}

export async function deleteAttachmentRow(
  supabase: Client,
  row: { id: string; storage_path: string | null }
): Promise<void> {
  if (row.storage_path) {
    const { error: removeError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([row.storage_path]);
    if (removeError) throw new Error("첨부파일 삭제에 실패했습니다. 다시 시도해주세요.");
  }
  const { error } = await supabase.from("attachments").delete().eq("id", row.id);
  if (error) throw new Error("첨부파일 정보를 삭제하지 못했습니다. 다시 시도해주세요.");
}

/**
 * 채팅 메시지에 달린 첨부 하나만 지운다(메시지 본문·다른 첨부는 그대로 둔다).
 * 실제 삭제 권한 경계는 attachments/storage.objects의 RLS 정책(발신자만
 * 허용, 00000000000019_chat_attachment_delete_hardening.sql)이다. 그 전에
 * assert_can_delete_chat_attachment RPC를 먼저 호출해, RLS가 조용히 0행을
 * 거르는 대신 구체적인 한국어 사유(작성자 아님/보관됨 등)를 먼저 받는다.
 *
 * storage_path는 브라우저 state가 아니라 이 RPC가 DB에서 막 조회해 돌려준
 * 값만 쓴다(00000000000020_attachment_integrity_hardening.sql) — 호출부가
 * 임의의(혹은 오래된) 경로를 넘겨 다른 파일을 지우는 일이 없도록, id와 경로를
 * 항상 같은 조회로 짝짓는다. 통과하면 deleteAttachmentRow를 그대로 재사용해
 * Storage 우선 삭제 → 메타데이터 삭제 순서를 작업/버그 첨부 삭제와 동일하게
 * 유지한다.
 *
 * 이미 지워진 첨부(예: 다른 탭에서 먼저 삭제됨)에 대한 재시도는 RPC가
 * "찾을 수 없습니다" 오류를 던지는데, 목표 상태(첨부가 없음)는 이미
 * 달성됐으므로 이 경우엔 성공으로 취급한다.
 */
export async function deleteChatAttachment(supabase: Client, attachment: { id: string }): Promise<void> {
  const { data: storagePath, error: assertError } = await supabase.rpc("assert_can_delete_chat_attachment", {
    p_attachment_id: attachment.id,
  });
  if (assertError) {
    if (assertError.message.includes("찾을 수 없습니다")) return;
    throw new Error(assertError.message);
  }
  await deleteAttachmentRow(supabase, { id: attachment.id, storage_path: storagePath ?? null });
}

/** 작업/버그 삭제 시 함께 정리한다 — 연결된 모든 첨부의 Storage 객체와 메타데이터 행을 지운다. */
export async function deleteAttachmentsForTarget(
  supabase: Client,
  targetType: AttachmentTargetType,
  targetId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("attachments")
    .select("id, storage_path")
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (error) throw error;
  if (!data || data.length === 0) return;

  const storagePaths = data.map((row) => row.storage_path).filter((path): path is string => Boolean(path));
  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(storagePaths);
    if (removeError) throw removeError;
  }

  const { error: deleteError } = await supabase
    .from("attachments")
    .delete()
    .eq("target_type", targetType)
    .eq("target_id", targetId);
  if (deleteError) throw deleteError;
}

/**
 * 폼에서 최종 확정된 첨부 목록(finalAttachments)과 아직 업로드되지 않은 로컬 파일
 * (pendingFiles, id로 매칭)을 받아 DB 상태와 맞춘다: 목록에서 빠진 기존 첨부는
 * 삭제하고, pendingFiles에 있는 새 항목은 업로드하고, url만 있는 새 항목은 링크로
 * 저장한다. 이미 존재하는 항목은 건드리지 않는다 — 그래서 도중에 실패해도 같은
 * 인자로 다시 호출하면(재시도) 이미 끝난 항목은 건너뛰고 이어서 처리된다.
 */
export async function syncAttachments(
  supabase: Client,
  ctx: AttachmentTarget,
  finalAttachments: Attachment[],
  pendingFiles: Map<string, File>
): Promise<void> {
  const { data: existingRows, error } = await supabase
    .from("attachments")
    .select("id, storage_path")
    .eq("target_type", ctx.targetType)
    .eq("target_id", ctx.targetId);
  if (error) throw error;

  const existingById = new Map((existingRows ?? []).map((row) => [row.id, row]));
  const finalIds = new Set(finalAttachments.map((attachment) => attachment.id));

  const toDelete = (existingRows ?? []).filter((row) => !finalIds.has(row.id));
  await Promise.all(toDelete.map((row) => deleteAttachmentRow(supabase, row)));

  const toAdd = finalAttachments.filter((attachment) => !existingById.has(attachment.id));
  await Promise.all(
    toAdd.map((attachment) => {
      const file = pendingFiles.get(attachment.id);
      if (file) {
        return uploadAttachment(supabase, { ...ctx, id: attachment.id, file });
      }
      if (attachment.url) {
        return insertLinkAttachment(supabase, {
          ...ctx,
          id: attachment.id,
          name: attachment.name,
          url: attachment.url,
          kind: attachment.kind,
        });
      }
      return Promise.resolve();
    })
  );
}

/** 여러 작업/버그의 첨부를 한 번에 조회해 target_id별로 묶는다 (enrichTasks/enrichBugs용). */
export async function listAttachmentsForTargets(
  supabase: Client,
  targetType: AttachmentTargetType,
  targetIds: string[]
): Promise<Map<string, AttachmentRow[]>> {
  const map = new Map<string, AttachmentRow[]>();
  if (targetIds.length === 0) return map;

  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("target_type", targetType)
    .in("target_id", targetIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const list = map.get(row.target_id);
    if (list) list.push(row);
    else map.set(row.target_id, [row]);
  }
  return map;
}

/** 제한 시간이 있는 signed URL을 받아 실제 파일 다운로드를 시작한다. */
export async function downloadAttachment(
  supabase: Client,
  attachment: { storagePath: string; name: string }
): Promise<void> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(attachment.storagePath, 60, { download: attachment.name });
  if (error || !data) throw new Error("다운로드 링크를 만들지 못했습니다. 다시 시도해주세요.");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

const PREVIEW_SIGNED_URL_TTL_SECONDS = 120;

/**
 * 미리보기용 signed URL. downloadAttachment와 달리 `download` 옵션을 주지 않아
 * <img src>로 바로 렌더할 수 있다(Content-Disposition이 attachment로 강제되지
 * 않는다). 항상 private 버킷의 시간 제한 URL만 만든다 — public URL이나 영구
 * 링크는 절대 만들지 않는다. 반환값은 호출부가 컴포넌트 상태로만 들고 있어야
 * 하고, localStorage나 DB에 저장해서는 안 된다.
 */
export async function createAttachmentPreviewUrl(supabase: Client, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, PREVIEW_SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error("미리보기 링크를 만들지 못했습니다. 다시 시도해주세요.");
  return data.signedUrl;
}
