import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Assignee, ChatMessage } from "@/lib/types";
import type { ChatChannel } from "@/lib/store/chat-store";
import { formatChatTimestamp } from "@/lib/format";
import type { ChatMessageRow, Database } from "../schema";
import { mapChatChannelRowToChatChannel, mapChatMessageRowToChatMessage } from "../mappers";
import { deleteAttachmentsForTarget, listAttachmentsForTargets } from "./attachments";
import { fetchUsersById } from "./users";

type Client = SupabaseClient<Database>;

/** Postgres 유니크 제약 위반(23505) — 같은 프로젝트에 이름이 겹치는 활성 채널이 이미 있을 때. */
const UNIQUE_VIOLATION_CODE = "23505";
const DUPLICATE_CHANNEL_NAME_MESSAGE = "이미 같은 이름의 채널이 있습니다.";

export class DuplicateChannelNameError extends Error {}

function throwChannelWriteError(error: PostgrestError | null): asserts error is null {
  if (!error) return;
  throw error.code === UNIQUE_VIOLATION_CODE
    ? new DuplicateChannelNameError(DUPLICATE_CHANNEL_NAME_MESSAGE)
    : error;
}

export async function listChannels(supabase: Client, projectId: string): Promise<ChatChannel[]> {
  const { data, error } = await supabase
    .from("chat_channels")
    .select("*")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapChatChannelRowToChatChannel);
}

export async function createChannel(
  supabase: Client,
  projectId: string,
  createdBy: string,
  name: string
): Promise<ChatChannel> {
  const { data, error } = await supabase
    .from("chat_channels")
    .insert({ project_id: projectId, name, created_by: createdBy })
    .select("*")
    .single();
  throwChannelWriteError(error);
  return mapChatChannelRowToChatChannel(data);
}

/**
 * INSERT 응답이 네트워크 오류 등으로 애매할 때, 실제로 저장됐는지 확인하기 위한 조회.
 * 활성(보관되지 않은) 채널 중 같은 이름을 찾는다 — listChannels와 동일한 조건.
 */
export async function findChannelByName(
  supabase: Client,
  projectId: string,
  name: string
): Promise<ChatChannel | null> {
  const { data, error } = await supabase
    .from("chat_channels")
    .select("*")
    .eq("project_id", projectId)
    .eq("name", name)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapChatChannelRowToChatChannel(data) : null;
}

export async function renameChannel(supabase: Client, channelId: string, name: string): Promise<void> {
  const { error } = await supabase.from("chat_channels").update({ name }).eq("id", channelId);
  throwChannelWriteError(error);
}

/** 영구 삭제 대신 보관 처리한다 — 메시지 이력은 그대로 남는다. */
export async function archiveChannel(supabase: Client, channelId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_channels")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", channelId);
  if (error) throw error;
}

/**
 * 발신자(users) 행과 첨부파일을 별도 조회해 붙인다 — tasks.ts의 enrichTasks와
 * 같은 이유로 임베디드 select 대신 이 방식을 쓴다(schema.ts가 손으로 쓴 최소
 * 타입이라 Relationships 메타데이터가 없음). listAttachmentsForTargets는
 * attachments.ts가 작업/버그 첨부에도 쓰는 동일한 배치 조회 함수를 재사용한다.
 * 두 조회는 서로 무관하므로 병렬로 실행한다.
 */
async function enrichMessages(supabase: Client, rows: ChatMessageRow[]): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];

  const messageIds = rows.map((row) => row.id);

  const [usersById, attachmentsByMessageId] = await Promise.all([
    fetchUsersById(supabase, rows.map((row) => row.sender_id)),
    listAttachmentsForTargets(supabase, "chat_message", messageIds),
  ]);

  return rows.map((row) =>
    mapChatMessageRowToChatMessage({
      ...row,
      sender: row.sender_id ? (usersById.get(row.sender_id) ?? null) : null,
      attachments: attachmentsByMessageId.get(row.id) ?? [],
    })
  );
}

export async function listMessages(supabase: Client, channelId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return enrichMessages(supabase, data ?? []);
}

/**
 * Realtime postgres_changes로 들어온, 방금 막 생성된 단일 메시지 행에 발신자
 * 정보를 붙인다. 메시지는 항상 첨부보다 먼저 저장되므로(sendMessage 참고)
 * 이 시점의 메시지는 첨부를 가질 수 없다 — enrichMessages를 거치지 않고
 * attachments 조회를 건너뛴다. 뒤이어 도착하는 첨부는 attachments 테이블의
 * 별도 realtime 구독(use-chat-attachment-uploads.ts)이 채운다.
 */
export async function enrichMessageRow(supabase: Client, row: ChatMessageRow): Promise<ChatMessage> {
  const usersById = await fetchUsersById(supabase, [row.sender_id]);
  return mapChatMessageRowToChatMessage({
    ...row,
    sender: row.sender_id ? (usersById.get(row.sender_id) ?? null) : null,
    attachments: [],
  });
}

/**
 * 메시지를 저장한다. 발신자는 항상 현재 로그인 사용자이므로, 방금 저장한 값을
 * 다시 조회하는 대신 호출부가 이미 알고 있는 Assignee를 그대로 합성해 반환한다
 * (전송 즉시 로컬에 낙관적으로 반영하기 위한 왕복 절약).
 */
export async function sendMessage(
  supabase: Client,
  projectId: string,
  channelId: string,
  senderId: string,
  senderAssignee: Assignee,
  content: string,
  mentionedUserIds: string[] = []
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      project_id: projectId,
      channel_id: channelId,
      sender_id: senderId,
      content,
      // 00000000000028 트리거가 이 id들 중 프로젝트 멤버에게만 chat_mention 알림을 만든다.
      mentioned_user_ids: mentionedUserIds,
    })
    .select("*")
    .single();
  if (error) throw error;

  return {
    id: data.id,
    author: senderAssignee,
    content: data.content,
    timestamp: formatChatTimestamp(new Date(data.created_at)),
    senderId,
  };
}

/**
 * 메시지와 그 첨부를 함께 지운다. 첨부를 먼저 정리한다 — 첨부 삭제 RLS
 * (is_chat_attachment_deletable)가 "이 메시지의 발신자인가"를 메시지 행으로
 * 판정하므로, 메시지를 먼저 지우면 첨부를 지울 권한 판정 근거가 사라진다.
 * 권한 경계는 chat_messages_delete_self RLS(활성 프로젝트의 본인 메시지만)이고,
 * RLS는 거부 대신 0행을 조용히 거르므로 삭제된 행이 없으면 오류로 바꾼다.
 */
export async function deleteMessage(supabase: Client, messageId: string): Promise<void> {
  await deleteAttachmentsForTarget(supabase, "chat_message", messageId);
  const { data, error } = await supabase.from("chat_messages").delete().eq("id", messageId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("메시지를 삭제할 수 없습니다. 본인 메시지인지, 보관된 프로젝트가 아닌지 확인해주세요.");
  }
}
