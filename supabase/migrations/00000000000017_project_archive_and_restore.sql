-- ============================================================
-- 프로젝트 보관(archive) · 복원(restore)
--
-- 9단계에서 프로젝트를 UI로 만들 수 있게 됐지만, 끝난 프로젝트를 목록에서
-- 치울 방법이 없었다. 이 마이그레이션은 "치우되 지우지 않는" 경로를 만든다.
--
-- 설계 결정
-- 1) 물리 삭제는 이번에도 구현하지 않는다. 보관은 projects.archived_at 한 컬럼을
--    세우는 것이 전부이며, 행 삭제도 cascade도 일어나지 않는다 — 멤버십·초대·
--    작업·버그·채팅·첨부·Storage 파일은 전부 그대로 남는다. 채널 보관
--    (00000000000010_chat_archive_and_realtime.sql)이 이미 쓰는 어휘를 그대로 따른다.
-- 2) 보관된 프로젝트는 **읽기 전용**이다. 목록에서 감추는 것만으로는 UI를 우회한
--    쓰기를 막지 못하고, 무엇보다 삭제(작업·첨부·Storage 객체)까지 열려 있으면
--    "보관은 데이터를 보존한다"는 약속이 지켜지지 않는다. 그래서 select 정책은
--    그대로 두고(보관 데이터는 계속 읽을 수 있어야 한다), 쓰기 정책만
--    is_project_writable()로 좁힌다.
-- 3) 이름 중복 판정은 **활성 프로젝트끼리만** 한다. 보관한 이름을 영원히 못 쓰게
--    막을 이유가 없다. 대신 복원 시점에 같은 이름의 활성 프로젝트가 생겼을 수
--    있으므로 restore_project()가 그 순간 다시 확인한다 — 이름 트리거는 이름이
--    바뀔 때만 돌기 때문에 archived_at만 바꾸는 복원 경로는 잡지 못한다.
-- 4) 별도 teams 테이블은 만들지 않는다. 이 스키마에서 "팀"은 계속
--    projects + project_members다(00000000000002_projects_and_teams.sql).
-- ============================================================

-- ------------------------------------------------------------
-- 1. 상태 컬럼
-- ------------------------------------------------------------

alter table public.projects add column archived_at timestamptz;

comment on column public.projects.archived_at is
  '보관 시각. null이면 활성 프로젝트다. 보관은 행을 지우지 않으며(cascade 없음) 소속 데이터는 전부 보존된다. 보관된 프로젝트는 읽기 전용이다(is_project_writable).';

-- ------------------------------------------------------------
-- 2. 이름 중복은 "활성 프로젝트들" 사이에서만
--    (00000000000016_project_creation_and_rename.sql의 트리거 함수를 대체한다)
-- ------------------------------------------------------------

create or replace function public.enforce_project_name_unique_for_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- 인증 컨텍스트가 없는 실행(마이그레이션/시드/SQL Editor)은 검사 대상이 아니다.
  if v_actor is null then
    return new;
  end if;

  -- 보관된 프로젝트는 활성 이름 공간 밖이다 — 복원 시점에 restore_project()가 다시 본다.
  if new.archived_at is not null then
    return new;
  end if;

  -- 이름이 실질적으로 그대로면(대소문자·공백만 다름) 검사할 필요가 없다.
  if tg_op = 'UPDATE'
     and public.normalize_project_name(new.name) = public.normalize_project_name(old.name) then
    return new;
  end if;

  -- 같은 사용자가 동시에 같은 이름을 만들면 둘 다 "없음"을 보고 통과할 수 있다
  -- (READ COMMITTED). 호출자 행을 잠가 그 사용자의 이름 검사를 직렬화한다.
  perform 1 from public.users where id = v_actor for update;

  if exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.user_id = v_actor
      and p.id <> new.id
      and p.archived_at is null
      and public.normalize_project_name(p.name) = public.normalize_project_name(new.name)
  ) then
    raise exception '이미 같은 이름의 프로젝트가 있습니다. 다른 이름을 입력해주세요.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_project_name_unique_for_actor is
  '호출자가 속한 "활성" 프로젝트들 사이의 이름 중복을 막는다. 보관된 프로젝트의 이름은 다시 쓸 수 있다.';

-- ------------------------------------------------------------
-- 3. 쓰기 가능 판정 — 멤버이면서 프로젝트가 활성일 것
-- ------------------------------------------------------------

create or replace function public.is_project_writable(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_project_member(p_project_id)
     and exists (
       select 1 from public.projects p
       where p.id = p_project_id and p.archived_at is null
     );
$$;

comment on function public.is_project_writable is
  '보관되지 않은 프로젝트의 멤버인지. 쓰기 정책 전용이며, 읽기 정책은 계속 is_project_member()를 쓴다(보관 데이터도 조회는 된다).';

-- ------------------------------------------------------------
-- 4. 쓰기 정책만 좁힌다 (읽기는 그대로)
--    00000000000008_row_level_security.sql의 `for all` 정책을
--    select + write로 분리한다 — `for all`의 using은 select에도 걸려서,
--    거기에 보관 조건을 넣으면 보관 데이터를 읽지도 못하게 된다.
-- ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'work_domains', 'tasks', 'bugs', 'chat_channels', 'attachments', 'asset_categories'
  ] loop
    execute format('drop policy %I on public.%I', t || '_all_member', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_project_member(project_id))',
      t || '_select_member', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_project_writable(project_id))',
      t || '_insert_member', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_project_writable(project_id)) with check (public.is_project_writable(project_id))',
      t || '_update_member', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_project_writable(project_id))',
      t || '_delete_member', t);
  end loop;
end;
$$;

-- ---- chat_messages ----
-- 읽기는 멤버, 쓰기는 "활성 프로젝트의 본인 메시지"로 좁힌다.
drop policy chat_messages_insert_self on public.chat_messages;
drop policy chat_messages_update_self on public.chat_messages;
drop policy chat_messages_delete_self on public.chat_messages;

create policy chat_messages_insert_self on public.chat_messages
  for insert to authenticated
  with check (public.is_project_writable(project_id) and sender_id = auth.uid());

create policy chat_messages_update_self on public.chat_messages
  for update to authenticated
  using (public.is_project_writable(project_id) and sender_id = auth.uid())
  with check (public.is_project_writable(project_id) and sender_id = auth.uid());

create policy chat_messages_delete_self on public.chat_messages
  for delete to authenticated
  using (public.is_project_writable(project_id) and sender_id = auth.uid());

-- ---- asset_syncs ----
-- project_id가 없으므로 소속 카테고리를 통해 본다(기존 정책과 같은 경로).
drop policy asset_syncs_insert_member on public.asset_syncs;
drop policy asset_syncs_delete_member on public.asset_syncs;

create policy asset_syncs_insert_member on public.asset_syncs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.asset_categories c
      where c.id = asset_syncs.category_id
        and public.is_project_writable(c.project_id)
    )
  );

create policy asset_syncs_delete_member on public.asset_syncs
  for delete to authenticated
  using (
    exists (
      select 1 from public.asset_categories c
      where c.id = asset_syncs.category_id
        and public.is_project_writable(c.project_id)
    )
  );

-- ---- Storage (attachments 버킷) ----
-- 조회/다운로드는 그대로 두고 업로드·삭제만 막는다. 특히 삭제를 막지 않으면
-- 보관된 프로젝트의 첨부 원본이 사라질 수 있어 "보존" 약속이 깨진다.
drop policy attachments_bucket_insert_member on storage.objects;
drop policy attachments_bucket_delete_member on storage.objects;

create policy attachments_bucket_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.is_project_writable(public.attachment_object_project_id(name))
  );

create policy attachments_bucket_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_project_writable(public.attachment_object_project_id(name))
  );

-- ------------------------------------------------------------
-- 5. 보관 / 복원 RPC (owner 전용)
--
--    권한 거부를 한국어 예외로 돌려주기 위해 RPC를 둔다 — RLS의 using은
--    "거부"가 아니라 "필터"라서 직접 UPDATE하면 0행이 조용히 갱신될 뿐이다.
-- ------------------------------------------------------------

create or replace function public.archive_project(p_project_id uuid)
returns setof public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception '프로젝트 owner만 프로젝트를 보관할 수 있습니다.';
  end if;

  -- 이미 보관된 프로젝트를 다시 보관해도 보관 시각을 덮어쓰지 않는다(멱등).
  update public.projects
  set archived_at = coalesce(archived_at, now())
  where id = p_project_id
  returning * into v_project;

  return next v_project;
end;
$$;

comment on function public.archive_project is
  'owner만 프로젝트를 보관한다. archived_at만 세우며 행 삭제·cascade가 없어 멤버십·초대·작업·버그·채팅·첨부는 전부 남는다.';

create or replace function public.restore_project(p_project_id uuid)
returns setof public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception '프로젝트 owner만 보관된 프로젝트를 복원할 수 있습니다.';
  end if;

  select * into v_project from public.projects where id = p_project_id;

  if v_project.archived_at is null then
    return next v_project;
    return;
  end if;

  -- 보관해 둔 사이에 같은 이름의 활성 프로젝트가 생겼을 수 있다. 이름 트리거는
  -- 이름이 바뀔 때만 돌므로 archived_at만 되돌리는 이 경로에서 직접 확인한다.
  if exists (
    select 1
    from public.project_members pm
    join public.projects p on p.id = pm.project_id
    where pm.user_id = auth.uid()
      and p.id <> p_project_id
      and p.archived_at is null
      and public.normalize_project_name(p.name) = public.normalize_project_name(v_project.name)
  ) then
    raise exception '이미 같은 이름의 활성 프로젝트가 있습니다. 기존 프로젝트의 이름을 바꾼 뒤 다시 복원해주세요.';
  end if;

  update public.projects
  set archived_at = null
  where id = p_project_id
  returning * into v_project;

  return next v_project;
end;
$$;

comment on function public.restore_project is
  'owner만 보관된 프로젝트를 다시 활성으로 되돌린다. 같은 이름의 활성 프로젝트가 있으면 거부한다.';

-- ------------------------------------------------------------
-- 6. 실행 권한 — 로그인 사용자만
-- ------------------------------------------------------------

revoke all on function public.archive_project(uuid) from public, anon;
revoke all on function public.restore_project(uuid) from public, anon;
revoke all on function public.is_project_writable(uuid) from public, anon;

grant execute on function public.archive_project(uuid) to authenticated;
grant execute on function public.restore_project(uuid) to authenticated;
grant execute on function public.is_project_writable(uuid) to authenticated;
