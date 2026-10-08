// Supabase Row(+조인 관계) -> 기존 화면이 쓰는 UI 타입(lib/types.ts) 변환.
// Zustand 스토어는 아직 이 모듈을 사용하지 않는다 — 화면은 계속 목업/localStorage
// 데이터로 동작하고, 이 파일은 다음 단계(실 CRUD 연결)를 위한 기반이다.

import type { Assignee, Attachment, Bug, ChatMessage, Sprint, Task, TaskComment } from "@/lib/types";
import type { ChatChannel } from "@/lib/store/chat-store";
import type { SyncedAsset, SyncedAssetCategory } from "@/lib/store/synced-assets-store";
import type { WorkDomain } from "@/lib/store/work-domains-store";
import { formatChatTimestamp } from "@/lib/format";
import type { AssetCategoryRow, AttachmentRow, BugRow, ChatChannelRow, ChatMessageRow, ProjectRow, SprintRow, TaskCommentRow, TaskRow, UserRow, WorkDomainRow } from "./schema";

// Task.assignee / Bug.reporter / ChatMessage.author는 UI 타입 상 필수 필드이지만,
// DB의 assignee_id/reporter_id/sender_id는 nullable(담당자 미배정, 탈퇴 사용자 등)이다.
// 화면 동작을 그대로 유지하기 위해 mapper 레벨에서 표시용 fallback을 채운다.
// 담당자 이름으로 "나"를 판별하는 화면(components/dashboard/my-tasks-widget.tsx)이
// 있으므로, 실제 사용자와 절대 겹치지 않도록 이 fallback인지 isPlaceholderAssignee로
// 판별할 수 있게 해둔다.
const UNASSIGNED: Assignee = { name: "미배정", role: "Unassigned" };
export const UNKNOWN_USER: Assignee = { name: "알 수 없음", role: "Unknown" };

/**
 * 보관 여부 판정의 단일 출처(서버 레이아웃과 클라이언트 훅이 같이 쓴다).
 * 마이그레이션 17 이전 DB에는 archived_at 컬럼이 없어 응답에서 통째로 빠지는데,
 * `!== null`로 보면 undefined가 걸려 모든 프로젝트가 보관 상태로 뒤집힌다.
 * 값이 실제로 있을 때만 보관으로 읽어, 미적용 DB를 "전부 활성"으로 다룬다.
 */
export function isProjectArchived(project: Pick<ProjectRow, "archived_at">): boolean {
  return Boolean(project.archived_at);
}

export function isPlaceholderAssignee(assignee: Assignee): boolean {
  return assignee === UNASSIGNED || assignee === UNKNOWN_USER;
}

export function mapUserRowToAssignee(user: UserRow | null | undefined, fallback: Assignee): Assignee {
  if (!user) return fallback;
  return { name: user.name, role: user.job_roles[0] ?? "Team" };
}

export function mapAttachmentRowToAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    name: row.original_filename,
    kind: row.kind,
    url: row.external_url ?? undefined,
    storagePath: row.storage_path ?? undefined,
  };
}

function mapAttachments(rows: AttachmentRow[]): Attachment[] | undefined {
  return rows.length > 0 ? rows.map(mapAttachmentRowToAttachment) : undefined;
}

export interface TaskRowWithRelations extends TaskRow {
  assignee: UserRow | null;
  attachments: AttachmentRow[];
}

export function mapTaskRowToTask(row: TaskRowWithRelations): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    assignee: mapUserRowToAssignee(row.assignee, UNASSIGNED),
    startDate: row.start_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    attachments: mapAttachments(row.attachments),
    domainId: row.domain_id ?? undefined,
    sprintId: row.sprint_id ?? undefined,
  };
}

export interface BugRowWithRelations extends BugRow {
  reporter: UserRow | null;
  attachments: AttachmentRow[];
}

export function mapBugRowToBug(row: BugRowWithRelations): Bug {
  return {
    id: row.id,
    title: row.title,
    severity: row.severity,
    location: row.location,
    reproductionSteps: row.reproduction_steps ?? "",
    consoleLog: row.console_log ?? undefined,
    reporter: mapUserRowToAssignee(row.reporter, UNKNOWN_USER),
    status: row.status,
    createdAt: row.created_at.slice(0, 10),
    taskId: row.task_id ?? undefined,
    attachments: mapAttachments(row.attachments),
  };
}

export interface ChatMessageRowWithRelations extends ChatMessageRow {
  sender: UserRow | null;
  attachments: AttachmentRow[];
}

export function mapChatMessageRowToChatMessage(row: ChatMessageRowWithRelations): ChatMessage {
  return {
    id: row.id,
    author: mapUserRowToAssignee(row.sender, UNKNOWN_USER),
    content: row.content,
    timestamp: formatChatTimestamp(new Date(row.created_at)),
    attachments: mapAttachments(row.attachments),
    senderId: row.sender_id ?? undefined,
  };
}

export function mapTaskCommentRowToTaskComment(row: TaskCommentRow & { author: UserRow | null }): TaskComment {
  return {
    id: row.id,
    taskId: row.task_id,
    author: mapUserRowToAssignee(row.author, UNKNOWN_USER),
    authorId: row.author_id ?? undefined,
    content: row.content,
    createdAt: row.created_at,
    mentionedUserIds: row.mentioned_user_ids,
  };
}

export function mapWorkDomainRowToWorkDomain(row: WorkDomainRow): WorkDomain {
  return { id: row.id, label: row.label };
}

export function mapSprintRowToSprint(row: SprintRow): Sprint {
  return { id: row.id, name: row.name, startDate: row.start_date, endDate: row.end_date };
}

export function mapChatChannelRowToChatChannel(row: ChatChannelRow): ChatChannel {
  return { id: row.id, name: row.name };
}

export function mapAssetCategoryRowToCategory(row: AssetCategoryRow): SyncedAssetCategory {
  return { id: row.id, label: row.label };
}

export interface LatestAssetSyncRowWithRelations {
  category_id: string;
  source_label: string;
  created_at: string;
  attachment: AttachmentRow;
}

export function mapLatestAssetSyncRowToSyncedAsset(row: LatestAssetSyncRowWithRelations): SyncedAsset {
  return {
    categoryId: row.category_id,
    attachment: mapAttachmentRowToAttachment(row.attachment),
    sourceLabel: row.source_label,
    updatedAt: row.created_at.slice(0, 10),
  };
}
