export type TaskStatus = "Todo" | "In Progress" | "QA" | "Done";
export type TaskPriority = "High" | "Medium" | "Low";

// Task.assignee / Bug.reporter / ChatMessage.author 필드는 required이지만, DB의
// 대응 컬럼(assignee_id/reporter_id/sender_id)은 nullable이다 — lib/supabase/mappers.ts가
// 미배정/탈퇴 사용자를 표시용 fallback Assignee로 채워 이 요구사항을 만족시킨다.
export interface Assignee {
  name: string;
  role: string;
}

export type AttachmentKind = "image" | "spreadsheet" | "build" | "spine" | "figma" | "link" | "other";

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  url?: string;
  /** Supabase Storage 경로. 실제 업로드 파일에만 있고, 외부 링크형 첨부(url만 있는 경우)는 없다. */
  storagePath?: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: Assignee;
  startDate?: string;
  dueDate?: string;
  attachments?: Attachment[];
  domainId?: string;
  /** 속한 스프린트. 없으면 백로그(어느 스프린트에도 들어가지 않은 작업). */
  sprintId?: string;
}

/** 프로젝트 안에서 기간을 정해 작업을 묶는 단위. 날짜는 "YYYY-MM-DD". */
export interface Sprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export type BugSeverity = "Blocker" | "High" | "Medium" | "Low";
export type BugStatus = "Open" | "In Progress" | "Resolved" | "Closed";

export interface Bug {
  id: string;
  title: string;
  severity: BugSeverity;
  location: string;
  reproductionSteps: string;
  consoleLog?: string;
  reporter: Assignee;
  status: BugStatus;
  createdAt: string;
  taskId?: string;
  attachments?: Attachment[];
}

export interface ChatMessage {
  id: string;
  author: Assignee;
  content: string;
  timestamp: string;
  attachments?: Attachment[];
  /** 발신자(users.id). 첨부파일 삭제 등 "작성자만" 권한을 클라이언트에서 판단할 때 쓴다. Supabase 모드에서만 채워진다. */
  senderId?: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  author: Assignee;
  /** 작성자(users.id). "본인 댓글만 삭제" 판단용 — Supabase 모드에서만 채워진다. */
  authorId?: string;
  content: string;
  /** ISO 시각. */
  createdAt: string;
  /** 작성할 때 @로 고른 멤버 id(목업 모드는 이름). 본문 강조와 알림 대상이 된다. */
  mentionedUserIds: string[];
}

/** 상단 종 아이콘의 알림 한 건. 지금은 작업 댓글 멘션 한 종류뿐이다. */
export interface AppNotification {
  id: string;
  kind: "task_comment_mention";
  projectId: string;
  actorName: string;
  taskId: string | null;
  taskTitle: string | null;
  commentExcerpt: string | null;
  createdAt: string;
  isRead: boolean;
}
