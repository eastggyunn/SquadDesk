-- ============================================================
-- Projects & Team Membership
--
-- 향후 RLS 정책이 "인증된 팀 사용자"를 판별할 수 있는 최소 단위가 필요하다.
-- work_domains의 "프로젝트별 정렬 순서" 요구사항도 프로젝트 개념을 전제로 한다.
-- 아직 인증/멀티 프로젝트 UI가 없으므로, 기존 테이블을 이 프로젝트로
-- 소급 연결하기 위한 부트스트랩 기본 프로젝트를 고정 UUID로 시드한다.
-- ============================================================

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.projects is '팀/프로젝트 단위. 모든 업무 데이터(work_domains, tasks, bugs, chat, attachments 등)는 프로젝트에 소속된다.';

create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  joined_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

comment on table public.project_members is '프로젝트-사용자 소속 관계. RLS의 "인증된 팀 사용자" 판별 기준이 된다.';

create index project_members_user_id_idx on public.project_members (user_id);

create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.project_members
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 부트스트랩 기본 프로젝트
-- 인증/프로젝트 생성 UI가 아직 없는 단계이므로, 이후 마이그레이션에서
-- 기존 tasks/bugs/chats 행을 여기에 소급 연결한다. 실제 프로젝트 생성
-- 플로우가 생기면 이 행은 그대로 두거나 이관해도 무방하다.
-- ------------------------------------------------------------

insert into public.projects (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Default Project', 'default')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 멤버십 조회 헬퍼 (SECURITY DEFINER로 RLS 재귀 평가를 피한다)
-- ------------------------------------------------------------

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.role = 'owner'
  );
$$;

-- 프로젝트 생성자를 자동으로 owner로 등록 (인증 컨텍스트가 없는
-- 마이그레이션/시드 실행 시에는 auth.uid()가 null이므로 건너뛴다)
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, auth.uid(), 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger handle_new_project
  after insert on public.projects
  for each row execute function public.handle_new_project();
