// supabase/migrations/*.sql 스키마를 손으로 미러링한 Row 타입.
// 실제 Supabase 프로젝트가 생기면 `supabase gen types typescript`로 생성한
// 타입으로 교체하는 것을 권장한다.
//
// 아래 타입은 전부 `interface`가 아니라 `type`으로 선언한다 — @supabase/postgrest-js
// 2.11x는 Database/Row가 interface면 select("*")/insert()/update() 결과 타입을
// 조용히 never로 무너뜨리는 문제가 있다(테이블이 늘어나거나 필드가 3개 이상이면
// 재현됨). type 별칭으로 바꾸면 사라진다 — 실제 codegen 타입도 전부 type이라
// 이 프로젝트에서만 겪는 특이 케이스는 아니다.

// 상태/우선순위/심각도 등의 열거형은 lib/types.ts와 DB가 동일한 용어를
// 쓰도록 마이그레이션에서 맞췄으므로(BugSeverity의 'Blocker' 등), 두 곳에
// 같은 유니온을 따로 적어 드리프트가 생기지 않도록 여기서 재수출한다.
import type { AttachmentKind, BugSeverity, BugStatus, TaskPriority, TaskStatus } from "@/lib/types";

export type JobRole = "Programmer" | "Artist" | "Animator" | "Designer" | "Sound" | "QA" | "PM";

export type ProjectMemberRole = "owner" | "member";

export type TaskStatusRow = TaskStatus;
export type TaskPriorityRow = TaskPriority;
export type BugSeverityRow = BugSeverity;
export type BugStatusRow = BugStatus;
export type AttachmentKindRow = AttachmentKind;
export type AttachmentTargetType = "task" | "bug" | "chat_message" | "asset_category";

export type UserRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  job_roles: JobRole[];
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  /**
   * 00000000000017_*.sql — 보관 시각. null이면 활성 프로젝트다. 보관해도 행/데이터는 지워지지 않는다.
   * 그 마이그레이션 이전 DB에는 컬럼 자체가 없어 응답에서 빠지므로(undefined), 읽는 쪽은
   * `Boolean(archived_at)`으로 판정해 미적용 DB를 "전부 활성"으로 다룬다.
   */
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectMemberRow = {
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  joined_at: string;
  updated_at: string;
};

export type ProjectInvitationStatus = "pending" | "accepted" | "revoked";

export type ProjectInvitationRow = {
  id: string;
  project_id: string;
  email: string;
  role: ProjectMemberRole;
  token_hash: string;
  status: ProjectInvitationStatus;
  expires_at: string;
  invited_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SprintRow = {
  id: string;
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

export type WorkDomainRow = {
  id: string;
  project_id: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  project_id: string;
  domain_id: string | null;
  sprint_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatusRow;
  priority: TaskPriorityRow;
  assignee_id: string | null;
  reporter_id: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

export type BugRow = {
  id: string;
  project_id: string;
  task_id: string | null;
  title: string;
  location: string;
  reproduction_steps: string | null;
  console_log: string | null;
  severity: BugSeverityRow;
  status: BugStatusRow;
  reporter_id: string | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatChannelRow = {
  id: string;
  project_id: string;
  name: string;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  project_id: string;
  channel_id: string;
  task_id: string | null;
  sender_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export type AttachmentRow = {
  id: string;
  project_id: string;
  target_type: AttachmentTargetType;
  target_id: string;
  original_filename: string;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  kind: AttachmentKindRow;
  uploaded_by: string | null;
  created_at: string;
};

export type AssetCategoryRow = {
  id: string;
  project_id: string;
  label: string;
  created_at: string;
  updated_at: string;
};

export type AssetSyncRow = {
  id: string;
  category_id: string;
  attachment_id: string;
  source_label: string;
  created_at: string;
};

// Insert/Update는 codegen 전까지 Partial<Row>로 근사한다 (실제 필수/기본값
// 제약은 SQL 마이그레이션이 소스 오브 트루스). @supabase/supabase-js의
// GenericTable 형태를 만족시키기 위한 최소 보일러플레이트.
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type View<Row> = {
  Row: Row;
  Relationships: [];
};

// 00000000000012_project_invitations_and_member_management.sql이 만든 RPC의
// 인자/반환 타입. 초대·멤버 관리의 검증은 전부 이 함수들 안(SQL)에서 이뤄지며,
// 클라이언트는 결과 상태 코드만 해석한다.
export type ProjectMemberDetailRow = {
  user_id: string;
  name: string;
  /** owner가 호출했을 때만 채워진다 — member에게는 null로 내려온다. */
  email: string | null;
  role: ProjectMemberRole;
  joined_at: string;
  deactivated_at: string | null;
};

export type ProjectInvitationListRow = {
  id: string;
  email: string;
  role: ProjectMemberRole;
  status: ProjectInvitationStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  invited_by_name: string | null;
  accepted_by_name: string | null;
  is_expired: boolean;
};

export type InvitationLookupStatus =
  | "ok"
  | "not_found"
  | "expired"
  | "revoked"
  | "accepted"
  | "email_mismatch"
  | "already_member"
  /** 00000000000018_*.sql — 보관된 프로젝트의 초대는 수락할 수 없다. */
  | "archived";

export type ProjectInvitationLookupRow = {
  status: InvitationLookupStatus;
  project_id: string | null;
  project_name: string | null;
  invited_role: ProjectMemberRole | null;
};

export type AcceptInvitationRow = {
  status: InvitationLookupStatus;
  project_id: string | null;
  project_name: string | null;
};

export type TaskCommentRow = {
  id: string;
  project_id: string;
  task_id: string;
  author_id: string | null;
  content: string;
  mentioned_user_ids: string[];
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  project_id: string;
  kind: "task_comment_mention";
  actor_id: string | null;
  task_id: string | null;
  comment_id: string | null;
  read_at: string | null;
  created_at: string;
};

// __InternalSupabase는 최신 @supabase/postgrest-js가 클라이언트 옵션(PostgREST
// 버전 등)을 읽는 자리다. Tables/Views와 함께 Functions/Enums/CompositeTypes
// 네 키를 전부 채워 GenericSchema 제약을 명확히 만족시킨다 — 하나라도 비면
// 스키마 전체가 조용히 never로 무너지는 postgrest-js 2.11x의 함정이 있다.
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      users: Table<UserRow>;
      projects: Table<ProjectRow>;
      project_members: Table<ProjectMemberRow>;
      project_invitations: Table<ProjectInvitationRow>;
      work_domains: Table<WorkDomainRow>;
      sprints: Table<SprintRow>;
      tasks: Table<TaskRow>;
      task_comments: Table<TaskCommentRow>;
      notifications: Table<NotificationRow>;
      bugs: Table<BugRow>;
      chat_channels: Table<ChatChannelRow>;
      chat_messages: Table<ChatMessageRow>;
      attachments: Table<AttachmentRow>;
      asset_categories: Table<AssetCategoryRow>;
      asset_syncs: Table<AssetSyncRow>;
    };
    Views: {
      latest_asset_syncs: View<AssetSyncRow>;
    };
    Functions: {
      // 00000000000016_project_creation_and_rename.sql — 프로젝트 생성/이름 변경.
      // 두 함수 모두 `returns setof public.projects`라 결과 행은 ProjectRow 그대로다.
      create_project: {
        Args: { p_name: string };
        Returns: ProjectRow[];
      };
      rename_project: {
        Args: { p_project_id: string; p_name: string };
        Returns: ProjectRow[];
      };
      // 00000000000017_project_archive_and_restore.sql — 보관/복원. 둘 다
      // `returns setof public.projects`라 결과 행은 ProjectRow 그대로다.
      archive_project: {
        Args: { p_project_id: string };
        Returns: ProjectRow[];
      };
      restore_project: {
        Args: { p_project_id: string };
        Returns: ProjectRow[];
      };
      list_project_members: {
        Args: { p_project_id: string };
        Returns: ProjectMemberDetailRow[];
      };
      list_project_invitations: {
        Args: { p_project_id: string };
        Returns: ProjectInvitationListRow[];
      };
      create_project_invitation: {
        Args: { p_project_id: string; p_email: string; p_role: ProjectMemberRole };
        Returns: string;
      };
      revoke_project_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      get_project_invitation: {
        Args: { p_token: string };
        Returns: ProjectInvitationLookupRow[];
      };
      accept_project_invitation: {
        Args: { p_token: string };
        Returns: AcceptInvitationRow[];
      };
      remove_asset_category: {
        Args: { p_category_id: string };
        Returns: undefined;
      };
      // 00000000000020_attachment_integrity_hardening.sql — 채팅 첨부 삭제 전
      // 한국어 실패 사유를 미리 판정한다. 통과하면 DB에 저장된 storage_path를
      // 반환하고(브라우저가 전달한 경로를 신뢰하지 않기 위해), 실패하면 예외.
      // (00000000000019에서 처음 만들 때는 returns void였다 — 00000000000020이
      // 반환 타입을 text로 바꿔 재정의했다.)
      assert_can_delete_chat_attachment: {
        Args: { p_attachment_id: string };
        Returns: string | null;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
};
