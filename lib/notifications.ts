import type { AppNotification, NotificationKind, TaskStatus } from "./types";
import { STATUS_LABELS } from "./task-status";

/** 알림 설정 화면의 순서·이름. 메일 요약과 종 아이콘이 같은 이름을 쓴다. */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  task_comment_mention: "작업 댓글 멘션",
  chat_mention: "채팅 멘션",
  task_comment: "내 작업에 달린 댓글",
  task_assigned: "작업 배정",
  bug_assigned: "버그 배정",
  task_status_changed: "내 작업 상태 변경",
  bug_status_changed: "내 버그 상태 변경",
  task_due_soon: "작업 마감 하루 전",
};

export const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_KIND_LABELS) as NotificationKind[];

type DescribableNotification = Pick<
  AppNotification,
  "kind" | "actorName" | "taskTitle" | "bugTitle" | "channelName" | "detail"
>;

/** "누가 무엇을 했다" 한 문장. 종 아이콘 목록과 메일 요약이 함께 쓴다. */
export function describeNotification(notification: DescribableNotification): string {
  const actor = notification.actorName ?? "알 수 없는 사용자";
  const task = notification.taskTitle ? `'${notification.taskTitle}'` : "작업";
  const bug = notification.bugTitle ? `'${notification.bugTitle}'` : "버그";
  switch (notification.kind) {
    case "task_comment_mention":
      return `${actor}님이 ${task} 댓글에서 회원님을 멘션했습니다.`;
    case "task_comment":
      return `${actor}님이 ${task}에 댓글을 남겼습니다.`;
    case "chat_mention":
      return `${actor}님이 #${notification.channelName ?? "채널"}에서 회원님을 멘션했습니다.`;
    case "task_assigned":
      return `${actor}님이 ${task}의 담당자로 회원님을 지정했습니다.`;
    case "bug_assigned":
      return `${actor}님이 버그 ${bug}의 담당자로 회원님을 지정했습니다.`;
    case "task_status_changed": {
      const status = notification.detail as TaskStatus | null;
      return `${actor}님이 ${task}을(를) '${status ? STATUS_LABELS[status] ?? status : "?"}'(으)로 옮겼습니다.`;
    }
    case "bug_status_changed":
      return `${actor}님이 버그 ${bug}을(를) '${notification.detail ?? "?"}'(으)로 바꿨습니다.`;
    case "task_due_soon":
      return `${task} 마감이 내일(${notification.detail ?? ""})입니다.`;
  }
}

/**
 * 알림을 눌렀을 때 갈 앱 안 경로. ?project는 ProjectFromUrl이 활성 프로젝트를 바꾸는 데 쓰고,
 * 각 화면은 ?task/?bug/?channel로 대상을 연다. 대상이 없으면(권한을 잃은 경우 등) null.
 */
export function notificationHref(
  notification: Pick<AppNotification, "projectId" | "taskId" | "bugId" | "channelId">
): string | null {
  const project = `project=${notification.projectId}`;
  if (notification.taskId) return `/kanban?task=${notification.taskId}&${project}`;
  if (notification.bugId) return `/bugs?bug=${notification.bugId}&${project}`;
  if (notification.channelId) return `/chat?channel=${notification.channelId}&${project}`;
  return null;
}
