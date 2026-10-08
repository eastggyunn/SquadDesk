-- ============================================================
-- Row Level Security
--
-- 모델: "인증된 팀 사용자"는 자신이 속한 프로젝트(project_members)의
-- 데이터만 읽고 쓸 수 있다. is_project_member() / is_project_owner()는
-- 00000000000002_projects_and_teams.sql에서 정의한 SECURITY DEFINER
-- 헬퍼 함수로, project_members 자체에 대한 RLS를 평가할 때 재귀 호출이
-- 발생하지 않도록 한다.
--
-- 이번 단계에서는 프로젝트 멤버라면 해당 프로젝트 리소스에 대해
-- 읽기/쓰기가 모두 가능한 단일 권한 등급으로 최소 구현한다. 역할별
-- 세분화된 쓰기 권한(예: QA만 버그 상태 변경 가능)은 이후 단계 과제로
-- 남겨둔다.
-- ============================================================

alter table public.users            enable row level security;
alter table public.projects         enable row level security;
alter table public.project_members  enable row level security;
alter table public.work_domains     enable row level security;
alter table public.tasks            enable row level security;
alter table public.bugs             enable row level security;
alter table public.chat_channels    enable row level security;
alter table public.chat_messages    enable row level security;
alter table public.attachments      enable row level security;
alter table public.asset_categories enable row level security;
alter table public.asset_syncs      enable row level security;

-- ---- users ----
-- 협업 도구 특성상 프로필(이름/아바타/직군)은 인증된 사용자 전체에 공개한다.
-- 본인 정보만 스스로 수정할 수 있고, 클라이언트에서 직접 삭제할 수는 없다
-- (탈퇴는 users.deactivated_at 소프트 삭제로 처리한다).
create policy users_select_authenticated on public.users
  for select to authenticated
  using (true);

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- projects ----
create policy projects_select_member on public.projects
  for select to authenticated
  using (public.is_project_member(id));

create policy projects_insert_authenticated on public.projects
  for insert to authenticated
  with check (true);

create policy projects_update_owner on public.projects
  for update to authenticated
  using (public.is_project_owner(id))
  with check (public.is_project_owner(id));

create policy projects_delete_owner on public.projects
  for delete to authenticated
  using (public.is_project_owner(id));

-- ---- project_members ----
create policy project_members_select_member on public.project_members
  for select to authenticated
  using (public.is_project_member(project_id));

create policy project_members_insert_owner on public.project_members
  for insert to authenticated
  with check (public.is_project_owner(project_id));

create policy project_members_update_owner on public.project_members
  for update to authenticated
  using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

create policy project_members_delete_owner on public.project_members
  for delete to authenticated
  using (public.is_project_owner(project_id));

-- ---- work_domains / tasks / bugs / chat_channels / attachments / asset_categories ----
-- 공통 패턴: project_id 컬럼을 직접 가진 테이블은 프로젝트 멤버라면 CRUD 가능.
create policy work_domains_all_member on public.work_domains
  for all to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy tasks_all_member on public.tasks
  for all to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy bugs_all_member on public.bugs
  for all to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy chat_channels_all_member on public.chat_channels
  for all to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy attachments_all_member on public.attachments
  for all to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy asset_categories_all_member on public.asset_categories
  for all to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

-- ---- asset_syncs ----
-- project_id가 직접 없으므로 소속 카테고리를 통해 멤버십을 확인한다.
create policy asset_syncs_select_member on public.asset_syncs
  for select to authenticated
  using (
    exists (
      select 1 from public.asset_categories c
      where c.id = asset_syncs.category_id
        and public.is_project_member(c.project_id)
    )
  );

create policy asset_syncs_insert_member on public.asset_syncs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.asset_categories c
      where c.id = asset_syncs.category_id
        and public.is_project_member(c.project_id)
    )
  );

create policy asset_syncs_delete_member on public.asset_syncs
  for delete to authenticated
  using (
    exists (
      select 1 from public.asset_categories c
      where c.id = asset_syncs.category_id
        and public.is_project_member(c.project_id)
    )
  );

-- ---- chat_messages ----
-- 채널(프로젝트) 멤버는 메시지를 읽을 수 있고, 작성/수정/삭제는 본인 메시지에만 허용한다.
create policy chat_messages_select_member on public.chat_messages
  for select to authenticated
  using (public.is_project_member(project_id));

create policy chat_messages_insert_self on public.chat_messages
  for insert to authenticated
  with check (public.is_project_member(project_id) and sender_id = auth.uid());

create policy chat_messages_update_self on public.chat_messages
  for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy chat_messages_delete_self on public.chat_messages
  for delete to authenticated
  using (sender_id = auth.uid());
