-- ============================================================
-- 사용자 비활성화(소프트 삭제)
--
-- 설계 결정: 팀원을 "삭제"할 때 auth.users 계정 자체를 지우지 않고
-- deactivated_at을 채우는 방식을 표준 경로로 삼는다.
--
-- 이유: tasks/bugs의 assignee_id·reporter_id, chat_messages.sender_id는
-- 모두 on delete set null로 걸려 있어 사용자 행이 사라지면 관련 이력에서
-- "누가" 작업/버그를 만들었는지, "누가" 메시지를 보냈는지 정보 자체가
-- 사라진다. 실제 서비스에서는 팀원이 프로젝트를 떠나도 과거 작업 이력에
-- 이름이 남아 있어야 하므로, 삭제 대신 비활성화로 처리하고 UI에서는
-- deactivated_at이 채워진 사용자를 담당자 후보 목록 등에서 제외한다.
--
-- auth.users 행 자체가 완전히 삭제되는 경우(예: 컴플라이언스/GDPR 요청에
-- 의한 완전 삭제)는 public.users가 ON DELETE CASCADE로 함께 삭제되며,
-- 이때만 예외적으로 관련 이력의 담당자 정보가 NULL로 남는 것을 허용한다.
-- ============================================================

alter table public.users add column deactivated_at timestamptz;

comment on column public.users.deactivated_at is
  '팀원 비활성화 시각. 계정을 삭제하지 않고 이 값을 채워 작업/버그/채팅 이력의 담당자·작성자 정보를 보존한다.';

create index users_deactivated_at_idx on public.users (deactivated_at) where deactivated_at is not null;
