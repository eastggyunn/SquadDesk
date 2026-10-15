import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppNotification, NotificationKind } from "@/lib/types";
import type { Database, NotificationRow } from "../schema";
import { fetchUsersById, uniqueIds } from "./users";

type Client = SupabaseClient<Database>;

export const NOTIFICATION_PAGE_SIZE = 30;
const EXCERPT_LENGTH = 80;

/** id 목록으로 한 테이블에서 id→값 맵을 만든다. 빈 목록이면 조회하지 않는다. */
async function fetchColumnById(
  supabase: Client,
  table: "tasks" | "bugs" | "chat_channels" | "task_comments" | "chat_messages",
  column: "title" | "name" | "content",
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from(table).select(`id,${column}`).in("id", unique);
  if (error) throw error;
  return new Map(
    ((data ?? []) as unknown as Record<string, string>[]).map((row) => [row.id, row[column]])
  );
}

/**
 * 알림 행에 보낸 사람 이름·대상 제목·본문 앞부분을 붙인다. 조회는 서로 무관해 병렬로 돌린다.
 * 대상이 지워지면 알림도 cascade로 사라지므로, 빈 값은 RLS로 못 읽는 경우뿐이다.
 */
export async function enrichNotifications(supabase: Client, rows: NotificationRow[]): Promise<AppNotification[]> {
  if (rows.length === 0) return [];
  const [usersById, taskTitles, bugTitles, channelNames, comments, messages] = await Promise.all([
    fetchUsersById(supabase, rows.map((row) => row.actor_id)),
    fetchColumnById(supabase, "tasks", "title", rows.map((row) => row.task_id)),
    fetchColumnById(supabase, "bugs", "title", rows.map((row) => row.bug_id)),
    fetchColumnById(supabase, "chat_channels", "name", rows.map((row) => row.channel_id)),
    fetchColumnById(supabase, "task_comments", "content", rows.map((row) => row.comment_id)),
    fetchColumnById(supabase, "chat_messages", "content", rows.map((row) => row.message_id)),
  ]);

  return rows.map((row) => {
    const content =
      (row.comment_id && comments.get(row.comment_id)) || (row.message_id && messages.get(row.message_id)) || null;
    return {
      id: row.id,
      kind: row.kind,
      projectId: row.project_id,
      actorName: (row.actor_id && usersById.get(row.actor_id)?.name) || null,
      taskId: row.task_id,
      taskTitle: (row.task_id && taskTitles.get(row.task_id)) || null,
      bugId: row.bug_id,
      bugTitle: (row.bug_id && bugTitles.get(row.bug_id)) || null,
      channelId: row.channel_id,
      channelName: (row.channel_id && channelNames.get(row.channel_id)) || null,
      excerpt: content ? content.slice(0, EXCERPT_LENGTH) : null,
      detail: row.detail,
      createdAt: row.created_at,
      isRead: row.read_at !== null,
    };
  });
}

/**
 * 최근 알림 한 페이지. `before`(마지막으로 받은 created_at)를 주면 그보다 오래된 것을 잇는다.
 * RLS가 본인 알림만 돌려주지만 user_id도 명시해 인덱스를 탄다.
 */
export async function listNotifications(
  supabase: Client,
  userId: string,
  options: { before?: string; unreadOnly?: boolean } = {}
): Promise<AppNotification[]> {
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE);
  if (options.before) query = query.lt("created_at", options.before);
  if (options.unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
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

/** 화면에 불러온 것과 무관하게 서버의 안 읽은 알림 전부를 읽음 처리한다. */
export async function markAllNotificationsRead(supabase: Client, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

/** 안 읽은 알림 개수 — 불러온 페이지와 무관하게 정확해야 해서 서버에 개수만 묻는다. */
export async function countUnreadNotifications(supabase: Client, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteNotifications(supabase: Client, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("notifications").delete().in("id", ids);
  if (error) throw error;
}

/** 읽은 알림을 모두 지운다(아직 화면에 안 불러온 오래된 것까지). */
export async function deleteReadNotifications(supabase: Client, userId: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("user_id", userId).not("read_at", "is", null);
  if (error) throw error;
}

export interface NotificationPreferences {
  mutedKinds: NotificationKind[];
  emailMutedKinds: NotificationKind[];
}

export async function getNotificationPreferences(supabase: Client, userId: string): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return { mutedKinds: data?.muted_kinds ?? [], emailMutedKinds: data?.email_muted_kinds ?? [] };
}

export async function saveNotificationPreferences(
  supabase: Client,
  userId: string,
  preferences: NotificationPreferences
): Promise<void> {
  const { error } = await supabase.from("notification_preferences").upsert({
    user_id: userId,
    muted_kinds: preferences.mutedKinds,
    email_muted_kinds: preferences.emailMutedKinds,
  });
  if (error) throw error;
}
