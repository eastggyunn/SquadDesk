-- ============================================================
-- Task comments & mention notifications (작업 댓글 · 멘션 알림)
--
-- task_comments: 작업마다 멤버가 남기는 댓글. 작성할 때 @로 고른 멤버는
--   mentioned_user_ids에 담긴다(이름은 바뀔 수 있어 본문 파싱 대신 id로 보관).
-- notifications: 받는 사람(user_id) 기준의 알림함. 클라이언트는 직접 만들 수
--   없고, 댓글 INSERT 트리거(SECURITY DEFINER)만 만든다 — 남에게 가짜 알림을
--   꽂는 경로를 막기 위함이다. 받는 사람은 자기 알림을 읽고 "읽음"만 바꿀 수 있다.
-- ============================================================

create table public.task_comments (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects (id) on delete cascade,
  task_id             uuid not null references public.tasks (id) on delete cascade,
  author_id           uuid references public.users (id) on delete set null,
  content             text not null check (length(btrim(content)) > 0),
  mentioned_user_ids  uuid[] not null default '{}',
  created_at          timestamptz not null default now()
);

comment on table public.task_comments is '작업 댓글. 프론트엔드 TaskComment(lib/types.ts)에 대응.';

create index task_comments_task_created_idx on public.task_comments (task_id, created_at);
create index task_comments_project_idx on public.task_comments (project_id);

-- 다른 프로젝트의 작업에 댓글을 달지 못하게 막는다(23번 스프린트와 같은 교차 검증).
create or replace function public.ensure_task_comment_same_project()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tasks t
    where t.id = new.task_id and t.project_id = new.project_id
  ) then
    raise exception '댓글과 작업의 프로젝트가 다릅니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger task_comments_same_project
  before insert on public.task_comments
  for each row execute function public.ensure_task_comment_same_project();

alter table public.task_comments enable row level security;

create policy task_comments_select_member on public.task_comments
  for select to authenticated
  using (public.is_project_member(project_id));

create policy task_comments_insert_self on public.task_comments
  for insert to authenticated
  with check (public.is_project_writable(project_id) and author_id = auth.uid());

create policy task_comments_delete_self on public.task_comments
  for delete to authenticated
  using (public.is_project_writable(project_id) and author_id = auth.uid());

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  kind        text not null check (kind in ('task_comment_mention')),
  actor_id    uuid references public.users (id) on delete set null,
  task_id     uuid references public.tasks (id) on delete cascade,
  comment_id  uuid references public.task_comments (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is '받는 사람(user_id)별 알림함. task_comments INSERT 트리거만 행을 만든다.';

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
-- 작업·댓글 삭제가 cascade로 알림을 지울 때 전체 스캔을 피한다.
create index notifications_task_idx on public.notifications (task_id);
create index notifications_comment_idx on public.notifications (comment_id);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- INSERT/DELETE 정책은 두지 않는다(= 거부). UPDATE도 read_at 한 컬럼만 열어 둔다.
revoke insert, update, delete on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- 멘션된 사람 중 "이 프로젝트 멤버이고 작성자 본인이 아닌" 사람에게만 알림을 만든다.
-- 클라이언트가 보낸 mentioned_user_ids를 그대로 믿지 않고 멤버십으로 다시 거른다.
create or replace function public.notify_task_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, project_id, kind, actor_id, task_id, comment_id)
  select distinct pm.user_id, new.project_id, 'task_comment_mention', new.author_id, new.task_id, new.id
  from public.project_members pm
  where pm.project_id = new.project_id
    and pm.user_id = any (new.mentioned_user_ids)
    and pm.user_id is distinct from new.author_id;
  return new;
end;
$$;

create trigger task_comments_notify_mentions
  after insert on public.task_comments
  for each row execute function public.notify_task_comment_mentions();

-- ------------------------------------------------------------
-- Realtime — 댓글은 열린 작업 서랍에, 알림은 상단 종 아이콘에 바로 반영한다.
-- task_comments는 DELETE도 구독하므로 24번 tasks와 같은 이유로 REPLICA IDENTITY FULL.
-- notifications는 INSERT/UPDATE만 구독한다(user_id 필터 + RLS).
-- ------------------------------------------------------------

alter table public.task_comments replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table public.task_comments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
