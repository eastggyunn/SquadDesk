-- ============================================================
-- GitHub 빌드 연동 (docs/design/github-build-integration.md)
--
-- 멤버가 자기 GitHub 저장소를 SquadDesk Builds GitHub App으로 연결하면, 성공한
-- Actions artifact / Release asset이 builds 행으로 들어온다. 파일은 GitHub에 남고
-- 여기에는 메타데이터만 둔다(다운로드는 서버가 임시 URL로 리다이렉트).
--
--   github_installations        GitHub App 설치(= GitHub 계정/조직) 1건
--   github_installation_access  그 설치에 접근 가능함을 OAuth로 검증한 SquadDesk 사용자
--   project_repositories        프로젝트 ↔ 저장소 연결 (멤버 누구나, 게스트 제외 — 서버에서 검사)
--   builds                      성공한 빌드만. 실패한 실행은 webhook에서 버린다
--   build_links                 빌드 ↔ 태스크/스프린트 (다대다)
--
-- 설치·연결·빌드 행은 서버(service_role)만 만든다. 클라이언트는 읽기와,
-- 본인 연결의 설정 변경/해제, 빌드 링크 추가/삭제만 한다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. GitHub App 설치
-- ------------------------------------------------------------

create table public.github_installations (
  installation_id  bigint primary key,
  account_login    text not null,
  account_type     text not null check (account_type in ('User', 'Organization')),
  suspended_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.github_installations is 'SquadDesk Builds GitHub App 설치. 여러 프로젝트·사용자가 같은 설치를 공유할 수 있다.';

create trigger set_updated_at before update on public.github_installations
  for each row execute function public.set_updated_at();

-- 설치 콜백에서 GET /user/installations로 접근을 확인한 사용자만 이 설치의 저장소를 연결할 수 있다.
-- (installation_id만 알면 남의 저장소를 연결할 수 있는 구멍을 막는다.)
create table public.github_installation_access (
  installation_id  bigint not null references public.github_installations (installation_id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  verified_at      timestamptz not null default now(),
  primary key (installation_id, user_id)
);

create index github_installation_access_user_idx on public.github_installation_access (user_id);

-- ------------------------------------------------------------
-- 2. 프로젝트 ↔ 저장소 연결
-- ------------------------------------------------------------

create table public.project_repositories (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  provider          text not null default 'github' check (provider in ('github')),
  installation_id   bigint not null references public.github_installations (installation_id) on delete cascade,
  repo_id           bigint not null,
  repo_full_name    text not null,
  build_source      text not null default 'artifact' check (build_source in ('artifact', 'release', 'both')),
  workflow_path     text,
  branch_filter     text,
  connected_by      uuid references public.users (id) on delete set null,
  disconnected_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- 해제 후 다시 연결하면 같은 행을 되살린다(빌드 이력 유지).
  unique (project_id, repo_id)
);

comment on table public.project_repositories is '프로젝트에 연결된 GitHub 저장소. disconnected_at이 있으면 새 빌드를 받지 않고 다운로드도 막는다.';
comment on column public.project_repositories.repo_id is 'GitHub 저장소 숫자 id — 이름이 바뀌어도 그대로다.';
comment on column public.project_repositories.workflow_path is '이 워크플로 파일의 실행만 받는다(예: .github/workflows/main.yml). null이면 전체.';
comment on column public.project_repositories.branch_filter is '이 브랜치의 실행만 받는다. null이면 전체.';

create index project_repositories_project_idx on public.project_repositories (project_id);
create index project_repositories_active_repo_idx on public.project_repositories (repo_id) where disconnected_at is null;
create index project_repositories_installation_idx on public.project_repositories (installation_id);

create trigger set_updated_at before update on public.project_repositories
  for each row execute function public.set_updated_at();

-- 클라이언트가 바꿀 수 있는 건 받는 빌드의 범위와 해제 시각뿐이다.
-- 연결 대상(저장소·설치·프로젝트·연결자)은 서버만 정한다.
create or replace function public.guard_project_repository_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.project_id is distinct from old.project_id
    or new.installation_id is distinct from old.installation_id
    or new.repo_id is distinct from old.repo_id
    or new.repo_full_name is distinct from old.repo_full_name
    or new.connected_by is distinct from old.connected_by
    or (old.disconnected_at is not null and new.disconnected_at is null)
  then
    raise exception '저장소 연결 대상은 바꿀 수 없습니다. 연결을 해제하고 다시 연결하세요.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger project_repositories_guard_update
  before update on public.project_repositories
  for each row execute function public.guard_project_repository_update();

-- 연결한 사람이 프로젝트를 떠나면 그 사람의 저장소 빌드가 남은 팀원에게 계속 열리지 않게 해제한다.
create or replace function public.disconnect_repositories_of_removed_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.project_repositories
  set disconnected_at = now()
  where project_id = old.project_id
    and connected_by = old.user_id
    and disconnected_at is null;
  return old;
end;
$$;

create trigger project_members_disconnect_repositories
  after delete on public.project_members
  for each row execute function public.disconnect_repositories_of_removed_member();

-- ------------------------------------------------------------
-- 3. 빌드 (성공한 것만)
-- ------------------------------------------------------------

create table public.builds (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  repository_id       uuid not null references public.project_repositories (id) on delete cascade,
  source              text not null check (source in ('artifact', 'release')),
  name                text not null,
  version_label       text not null,
  branch              text,
  commit_sha          text,
  commit_message      text,
  actor_login         text,
  size_bytes          bigint,
  github_run_id       bigint,
  github_artifact_id  bigint,
  github_release_id   bigint,
  github_asset_id     bigint,
  html_url            text not null,
  expires_at          timestamptz,
  expired_at          timestamptz,
  created_at          timestamptz not null default now(),
  constraint builds_one_github_file check (num_nonnulls(github_artifact_id, github_asset_id) = 1),
  constraint builds_source_matches_file check (
    (source = 'artifact' and github_artifact_id is not null)
    or (source = 'release' and github_asset_id is not null)
  )
);

comment on table public.builds is 'CI가 만든 성공 빌드 1건(artifact 1개 또는 release asset 1개). 파일은 GitHub에 있다.';
comment on column public.builds.version_label is '#<run_number> 또는 release tag.';
comment on column public.builds.expired_at is '다운로드 시 GitHub이 410/404를 돌려주면 기록한다(artifact 보관 기간 만료).';

-- webhook 재전송에도 같은 빌드가 두 번 생기지 않게(멱등성)
create unique index builds_artifact_uniq on public.builds (repository_id, github_artifact_id) where github_artifact_id is not null;
create unique index builds_asset_uniq on public.builds (repository_id, github_asset_id) where github_asset_id is not null;
create index builds_project_created_idx on public.builds (project_id, created_at desc);
create index builds_repository_created_idx on public.builds (repository_id, created_at desc);

create or replace function public.ensure_build_repository_same_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.project_repositories r
    where r.id = new.repository_id and r.project_id = new.project_id
  ) then
    raise exception '빌드와 저장소 연결의 프로젝트가 다릅니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger builds_repository_same_project
  before insert or update of repository_id, project_id on public.builds
  for each row execute function public.ensure_build_repository_same_project();

-- ------------------------------------------------------------
-- 4. 빌드 ↔ 태스크 / 스프린트
-- ------------------------------------------------------------

create table public.build_links (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  build_id    uuid not null references public.builds (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  sprint_id   uuid references public.sprints (id) on delete cascade,
  linked_by   uuid references public.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint build_links_one_target check (num_nonnulls(task_id, sprint_id) = 1)
);

comment on table public.build_links is '빌드를 태스크 또는 스프린트에 연결한다. 한 행은 둘 중 하나만 가리킨다.';

create unique index build_links_task_uniq on public.build_links (build_id, task_id) where task_id is not null;
create unique index build_links_sprint_uniq on public.build_links (build_id, sprint_id) where sprint_id is not null;
create index build_links_project_idx on public.build_links (project_id);
create index build_links_task_idx on public.build_links (task_id);
create index build_links_sprint_idx on public.build_links (sprint_id);

-- RLS는 행 단위라 "빌드와 대상이 같은 프로젝트인가"를 못 본다 — 23번 스프린트와 같은 방식.
create or replace function public.ensure_build_link_same_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.builds b where b.id = new.build_id and b.project_id = new.project_id)
    or (new.task_id is not null and not exists (
      select 1 from public.tasks t where t.id = new.task_id and t.project_id = new.project_id))
    or (new.sprint_id is not null and not exists (
      select 1 from public.sprints s where s.id = new.sprint_id and s.project_id = new.project_id))
  then
    raise exception '빌드와 연결 대상의 프로젝트가 다릅니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger build_links_same_project
  before insert or update on public.build_links
  for each row execute function public.ensure_build_link_same_project();

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------

alter table public.github_installations enable row level security;
alter table public.github_installation_access enable row level security;
alter table public.project_repositories enable row level security;
alter table public.builds enable row level security;
alter table public.build_links enable row level security;

-- 설치: 내가 검증한 설치, 또는 내 프로젝트에 연결된 저장소의 설치(칩에 계정명 표시용)
create policy github_installations_select on public.github_installations
  for select to authenticated
  using (
    exists (
      select 1 from public.github_installation_access a
      where a.installation_id = github_installations.installation_id and a.user_id = auth.uid()
    )
    or exists (
      select 1 from public.project_repositories r
      where r.installation_id = github_installations.installation_id and public.is_project_member(r.project_id)
    )
  );

create policy github_installation_access_select_own on public.github_installation_access
  for select to authenticated
  using (user_id = auth.uid());

-- 연결: 읽기는 멤버, 설정 변경/해제/삭제는 연결한 본인 또는 owner (보관 프로젝트는 불가)
create policy project_repositories_select_member on public.project_repositories
  for select to authenticated
  using (public.is_project_member(project_id));

create policy project_repositories_update_connector_or_owner on public.project_repositories
  for update to authenticated
  using (
    public.is_project_writable(project_id)
    and (connected_by = auth.uid() or public.is_project_owner(project_id))
  )
  with check (
    public.is_project_writable(project_id)
    and (connected_by = auth.uid() or public.is_project_owner(project_id))
  );

create policy project_repositories_delete_connector_or_owner on public.project_repositories
  for delete to authenticated
  using (
    public.is_project_writable(project_id)
    and (connected_by = auth.uid() or public.is_project_owner(project_id))
  );

-- 빌드: 읽기는 멤버, 삭제는 저장소를 연결한 본인 또는 owner
create policy builds_select_member on public.builds
  for select to authenticated
  using (public.is_project_member(project_id));

create policy builds_delete_connector_or_owner on public.builds
  for delete to authenticated
  using (
    public.is_project_writable(project_id)
    and (
      public.is_project_owner(project_id)
      or exists (
        select 1 from public.project_repositories r
        where r.id = builds.repository_id and r.connected_by = auth.uid()
      )
    )
  );

-- 빌드 링크: 멤버 누구나 추가/삭제 (보관 프로젝트는 불가)
create policy build_links_select_member on public.build_links
  for select to authenticated
  using (public.is_project_member(project_id));

create policy build_links_insert_member on public.build_links
  for insert to authenticated
  with check (public.is_project_writable(project_id) and linked_by = auth.uid());

create policy build_links_delete_member on public.build_links
  for delete to authenticated
  using (public.is_project_writable(project_id));

-- 서버만 쓰는 테이블은 클라이언트 쓰기 권한 자체를 거둔다(정책이 없어도 이중으로 막는다).
revoke insert, update, delete on public.github_installations from anon, authenticated;
revoke insert, update, delete on public.github_installation_access from anon, authenticated;
revoke insert on public.project_repositories from anon, authenticated;
revoke insert, update on public.builds from anon, authenticated;
revoke update on public.build_links from anon, authenticated;

-- ------------------------------------------------------------
-- 6. Realtime — 빌드 목록·링크 칩이 새로고침 없이 갱신되게
--    (REPLICA IDENTITY FULL: 24번 tasks와 같은 이유 — DELETE 이벤트의 old에 project_id가 있어야 한다)
-- ------------------------------------------------------------

alter table public.builds replica identity full;
alter table public.build_links replica identity full;
alter table public.project_repositories replica identity full;

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_table in array array['builds', 'build_links', 'project_repositories'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 7. 알림 — build_ready(새 빌드), build_linked(내 작업에 빌드 연결)
-- ------------------------------------------------------------

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'task_comment_mention',
  'task_comment',
  'chat_mention',
  'task_assigned',
  'bug_assigned',
  'task_status_changed',
  'bug_status_changed',
  'task_due_soon',
  'build_ready',
  'build_linked'
));

alter table public.notifications
  add column build_id uuid references public.builds (id) on delete cascade;

create index notifications_build_idx on public.notifications (build_id);

-- notify_member에 p_build_id를 더한다. 인자만 늘려 create or replace하면 오버로드가 생겨
-- 기존 트리거의 이름 붙은 호출이 모호해지므로, 지우고 다시 만든다.
-- (기존 트리거 함수들은 실행 시점에 이름으로 찾으므로 그대로 동작한다.)
drop function public.notify_member(uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text);

create function public.notify_member(
  p_user_id     uuid,
  p_project_id  uuid,
  p_kind        text,
  p_actor_id    uuid,
  p_task_id     uuid default null,
  p_bug_id      uuid default null,
  p_comment_id  uuid default null,
  p_channel_id  uuid default null,
  p_message_id  uuid default null,
  p_detail      text default null,
  p_build_id    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_user_id is not distinct from p_actor_id then
    return;
  end if;
  if not exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = p_user_id
  ) then
    return;
  end if;

  insert into public.notifications
    (user_id, project_id, kind, actor_id, task_id, bug_id, comment_id, channel_id, message_id, detail, build_id)
  values
    (p_user_id, p_project_id, p_kind, p_actor_id, p_task_id, p_bug_id, p_comment_id, p_channel_id, p_message_id, p_detail, p_build_id);
end;
$$;

revoke execute on function public.notify_member(uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;

-- 새 빌드 → 프로젝트 멤버 전원(저장소를 연결한 본인 제외). detail = 버전 라벨.
create or replace function public.notify_build_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connected_by uuid;
  v_user_id uuid;
begin
  select r.connected_by into v_connected_by from public.project_repositories r where r.id = new.repository_id;

  for v_user_id in select pm.user_id from public.project_members pm where pm.project_id = new.project_id loop
    perform public.notify_member(v_user_id, new.project_id, 'build_ready', v_connected_by,
      p_build_id => new.id, p_detail => new.version_label);
  end loop;
  return new;
end;
$$;

create trigger builds_notify_ready
  after insert on public.builds
  for each row execute function public.notify_build_ready();

-- 빌드를 태스크에 연결 → 그 태스크 담당자(연결한 본인 제외)
create or replace function public.notify_build_linked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee_id uuid;
begin
  if new.task_id is null then
    return new;
  end if;
  select t.assignee_id into v_assignee_id from public.tasks t where t.id = new.task_id;
  perform public.notify_member(v_assignee_id, new.project_id, 'build_linked', new.linked_by,
    p_task_id => new.task_id, p_build_id => new.build_id);
  return new;
end;
$$;

create trigger build_links_notify_linked
  after insert on public.build_links
  for each row execute function public.notify_build_linked();
