-- ============================================================
-- Sprints (스프린트)
--
-- 프로젝트별로 "정해진 기간 동안 끝낼 작업 묶음"을 만든다.
-- 작업(tasks)은 스프린트 하나에 속하거나(sprint_id) 어디에도 속하지 않는다(백로그).
-- 프론트엔드 Sprint(lib/types.ts)에 대응.
-- ============================================================

create table public.sprints (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sprints_date_range check (end_date >= start_date)
);

comment on table public.sprints is '스프린트 — 프로젝트 안에서 기간(start_date~end_date)을 정해 작업을 묶는 단위.';

create unique index sprints_project_name_idx on public.sprints (project_id, name);
create index sprints_project_start_idx on public.sprints (project_id, start_date);

create trigger set_updated_at before update on public.sprints
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- tasks.sprint_id — 스프린트를 지우면 작업은 백로그로 돌아간다(set null).
-- ------------------------------------------------------------

alter table public.tasks
  add column sprint_id uuid references public.sprints (id) on delete set null;

create index tasks_sprint_idx on public.tasks (sprint_id);

-- 다른 프로젝트의 스프린트를 가리키지 못하게 막는다(RLS는 행 단위라 이 교차 검증을 못 한다).
create or replace function public.ensure_task_sprint_same_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sprint_id is not null and not exists (
    select 1 from public.sprints s
    where s.id = new.sprint_id and s.project_id = new.project_id
  ) then
    raise exception '작업과 스프린트의 프로젝트가 다릅니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tasks_sprint_same_project
  before insert or update of sprint_id, project_id on public.tasks
  for each row execute function public.ensure_task_sprint_same_project();

-- ------------------------------------------------------------
-- RLS — 다른 업무 테이블(17번)과 같은 규칙:
-- 읽기는 프로젝트 멤버, 쓰기는 보관되지 않은 프로젝트의 멤버.
-- ------------------------------------------------------------

alter table public.sprints enable row level security;

create policy sprints_select_member on public.sprints
  for select to authenticated
  using (public.is_project_member(project_id));

create policy sprints_insert_member on public.sprints
  for insert to authenticated
  with check (public.is_project_writable(project_id));

create policy sprints_update_member on public.sprints
  for update to authenticated
  using (public.is_project_writable(project_id))
  with check (public.is_project_writable(project_id));

create policy sprints_delete_member on public.sprints
  for delete to authenticated
  using (public.is_project_writable(project_id));
