-- ============================================================
-- Extraction Shooter Dev Collab Tool - Initial Schema
-- Tables: users, tasks, bugs, chats
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------

create type task_status as enum ('Todo', 'In Progress', 'QA', 'Done');

create type job_role as enum (
  'Programmer',
  'Artist',
  'Animator',       -- Spine 2D 애니메이터 등
  'Game Designer',
  'Sound',
  'QA',
  'PM'
);

create type bug_severity as enum ('Low', 'Medium', 'High', 'Critical');

create type bug_status as enum ('Open', 'In Progress', 'Resolved', 'Closed');

-- ------------------------------------------------------------
-- 1. users
--    Supabase Auth의 auth.users를 확장하는 프로필 테이블.
--    id는 auth.users.id를 그대로 참조(1:1)한다.
-- ------------------------------------------------------------

create table public.users (
  id           uuid primary key references auth.users (id) on delete cascade,
  name         text not null,
  avatar_url   text,
  job_roles    job_role[] not null default '{}', -- 직군 태그 (복수 태그 가능: 예) {Programmer, PM})
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.users is '팀원 프로필 정보 (auth.users 1:1 확장)';
comment on column public.users.job_roles is '직군 태그 목록 (예: Programmer, Artist, Animator 등 중복 선택 가능)';

-- ------------------------------------------------------------
-- 2. tasks
--    작업 리스트. 담당자/생성자는 users를 참조.
-- ------------------------------------------------------------

create table public.tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  status           task_status not null default 'Todo',
  assignee_id      uuid references public.users (id) on delete set null,
  reporter_id      uuid references public.users (id) on delete set null, -- 작업 생성자
  due_date         date,
  figma_link       text,       -- Figma 디자인 링크
  spine_file_path  text,       -- Spine 2D 파일 경로 (Storage 경로 or 로컬/공유 경로)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.tasks is '작업(태스크) 리스트';
comment on column public.tasks.figma_link is '해당 작업과 연결된 Figma 디자인 URL';
comment on column public.tasks.spine_file_path is 'Spine 2D 애니메이션 파일 경로 (Supabase Storage 등)';

create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_status_idx on public.tasks (status);
create index tasks_due_date_idx on public.tasks (due_date);

-- ------------------------------------------------------------
-- 3. bugs
--    QA 버그 리포트. 특정 task에 종속될 수도, 독립적일 수도 있음.
-- ------------------------------------------------------------

create table public.bugs (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid references public.tasks (id) on delete set null, -- 연관된 작업 (선택)
  title               text not null,
  symptom             text not null,        -- 발생 현상
  reproduction_steps  text,                 -- 재현 단계
  console_log         text,                 -- Unity Editor 콘솔 로그 원문
  severity            bug_severity not null default 'Medium',
  status              bug_status not null default 'Open',
  reporter_id         uuid references public.users (id) on delete set null, -- QA 담당자(발견자)
  assignee_id         uuid references public.users (id) on delete set null, -- 수정 담당자
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.bugs is 'QA 버그 리포트';
comment on column public.bugs.console_log is 'Unity Editor 콘솔에서 발생한 에러/경고 로그 원문';

create index bugs_task_id_idx on public.bugs (task_id);
create index bugs_assignee_id_idx on public.bugs (assignee_id);
create index bugs_severity_idx on public.bugs (severity);

-- ------------------------------------------------------------
-- 4. chats
--    회의용 실시간 채팅 로그. room_id로 회의/채널을 구분하고,
--    특정 task와 연관된 논의라면 task_id로 연결 가능.
-- ------------------------------------------------------------

create table public.chats (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null default 'general', -- 채팅방/회의 구분 (예: 'general', 'standup-2026-07-22')
  task_id     uuid references public.tasks (id) on delete set null, -- 특정 작업 관련 논의일 경우 연결
  sender_id   uuid references public.users (id) on delete set null,
  message     text not null,
  created_at  timestamptz not null default now()
);

comment on table public.chats is '회의/논의용 실시간 채팅 로그';

create index chats_room_id_created_at_idx on public.chats (room_id, created_at);
create index chats_task_id_idx on public.chats (task_id);

-- ------------------------------------------------------------
-- updated_at 자동 갱신 트리거
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger set_updated_at before update on public.bugs
  for each row execute function public.set_updated_at();
