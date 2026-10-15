-- ============================================================
-- Notification center (알림 센터 확장)
--
-- 25번은 작업 댓글 멘션 한 종류만 만들었다. 여기서 알림 종류를 넓히고,
-- 받는 사람이 알림을 지우거나 종류별로 끌 수 있게 하며, 하루 한 번 보내는
-- 메일 요약(app/api/cron/notification-digest)이 쓸 함수를 둔다.
--
-- 종류(kind)
--   task_comment_mention  작업 댓글에서 나를 멘션 (25번)
--   task_comment          내가 담당인 작업에 댓글(멘션으로 이미 받았으면 생략)
--   chat_mention          채팅에서 나를 멘션
--   task_assigned / bug_assigned              나를 담당자로 지정
--   task_status_changed / bug_status_changed  내 담당 항목의 상태를 남이 바꿈
--   task_due_soon         내 작업 마감 하루 전(크론이 generate_due_soon_notifications 호출)
--
-- 알림 행은 여전히 SECURITY DEFINER 함수만 만든다. 모든 경로는 notify_member를 거쳐
-- "프로젝트 멤버이고 행동한 본인이 아닌" 사람에게만 가고, 받는 사람이 끈 종류는
-- BEFORE INSERT 트리거가 버린다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. notifications 확장
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
  'task_due_soon'
));

alter table public.notifications
  add column bug_id      uuid references public.bugs (id) on delete cascade,
  add column channel_id  uuid references public.chat_channels (id) on delete cascade,
  add column message_id  uuid references public.chat_messages (id) on delete cascade,
  -- 종류별 부가 값: 상태 변경이면 바뀐 상태, 마감 임박이면 마감일(YYYY-MM-DD).
  add column detail      text,
  -- 메일 요약에 실린 시각. 한 알림이 두 번 메일로 가지 않게 한다.
  add column emailed_at  timestamptz;

create index notifications_bug_idx on public.notifications (bug_id);
create index notifications_channel_idx on public.notifications (channel_id);
create index notifications_message_idx on public.notifications (message_id);
create index notifications_digest_pending_idx on public.notifications (created_at)
  where emailed_at is null and read_at is null;

-- 받는 사람은 자기 알림을 지울 수 있다(알림함 관리).
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

grant delete on public.notifications to authenticated;

-- ------------------------------------------------------------
-- 2. 알림 설정 — 종류별로 앱 알림/메일 요약을 끈다
-- ------------------------------------------------------------

create table public.notification_preferences (
  user_id            uuid primary key references public.users (id) on delete cascade,
  -- 앱 알림을 끈 종류. 이 종류는 알림 행 자체가 만들어지지 않는다(따라서 메일에도 없다).
  muted_kinds        text[] not null default '{}',
  -- 메일 요약에서만 뺄 종류. 앱 알림은 그대로 온다.
  email_muted_kinds  text[] not null default '{}',
  updated_at         timestamptz not null default now()
);

comment on table public.notification_preferences is '사용자별 알림 설정. 행이 없으면 모든 종류가 켜진 것으로 본다.';

create trigger set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.skip_muted_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.notification_preferences p
    where p.user_id = new.user_id and new.kind = any (p.muted_kinds)
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger notifications_skip_muted
  before insert on public.notifications
  for each row execute function public.skip_muted_notification();

-- ------------------------------------------------------------
-- 3. 공통 발송 함수 — 멤버 확인 + 본인 제외를 한 곳에서
-- ------------------------------------------------------------

create or replace function public.notify_member(
  p_user_id     uuid,
  p_project_id  uuid,
  p_kind        text,
  p_actor_id    uuid,
  p_task_id     uuid default null,
  p_bug_id      uuid default null,
  p_comment_id  uuid default null,
  p_channel_id  uuid default null,
  p_message_id  uuid default null,
  p_detail      text default null
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
    (user_id, project_id, kind, actor_id, task_id, bug_id, comment_id, channel_id, message_id, detail)
  values
    (p_user_id, p_project_id, p_kind, p_actor_id, p_task_id, p_bug_id, p_comment_id, p_channel_id, p_message_id, p_detail);
end;
$$;

-- 클라이언트가 직접 불러 남에게 가짜 알림을 꽂지 못하게 한다(트리거 안에서만 쓴다).
revoke execute on function public.notify_member(uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. 작업 댓글 — 멘션 + 담당자에게 댓글 알림
-- ------------------------------------------------------------

create or replace function public.notify_task_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_assignee_id uuid;
begin
  for v_user_id in select distinct unnest(new.mentioned_user_ids) loop
    perform public.notify_member(v_user_id, new.project_id, 'task_comment_mention', new.author_id,
      p_task_id => new.task_id, p_comment_id => new.id);
  end loop;

  select t.assignee_id into v_assignee_id from public.tasks t where t.id = new.task_id;
  if v_assignee_id is not null and not (v_assignee_id = any (new.mentioned_user_ids)) then
    perform public.notify_member(v_assignee_id, new.project_id, 'task_comment', new.author_id,
      p_task_id => new.task_id, p_comment_id => new.id);
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. 채팅 멘션
-- ------------------------------------------------------------

alter table public.chat_messages
  add column mentioned_user_ids uuid[] not null default '{}';

create or replace function public.notify_chat_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in select distinct unnest(new.mentioned_user_ids) loop
    perform public.notify_member(v_user_id, new.project_id, 'chat_mention', new.sender_id,
      p_channel_id => new.channel_id, p_message_id => new.id);
  end loop;
  return new;
end;
$$;

create trigger chat_messages_notify_mentions
  after insert on public.chat_messages
  for each row
  when (cardinality(new.mentioned_user_ids) > 0)
  execute function public.notify_chat_message_mentions();

-- ------------------------------------------------------------
-- 6. 작업·버그 배정 / 상태 변경
--    행동한 사람은 auth.uid()다. 담당자가 바뀐 같은 수정에서 상태도 바뀌었다면
--    배정 알림 하나만 보낸다(새 담당자에게 둘 다 보내면 시끄럽다).
-- ------------------------------------------------------------

create or replace function public.notify_task_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify_member(new.assignee_id, new.project_id, 'task_assigned', auth.uid(),
      p_task_id => new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.notify_member(new.assignee_id, new.project_id, 'task_status_changed', auth.uid(),
      p_task_id => new.id, p_detail => new.status::text);
  end if;
  return null;
end;
$$;

create trigger tasks_notify_changes
  after insert or update of assignee_id, status on public.tasks
  for each row execute function public.notify_task_changes();

create or replace function public.notify_bug_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify_member(new.assignee_id, new.project_id, 'bug_assigned', auth.uid(),
      p_bug_id => new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.notify_member(new.assignee_id, new.project_id, 'bug_status_changed', auth.uid(),
      p_bug_id => new.id, p_detail => new.status::text);
  end if;
  return null;
end;
$$;

create trigger bugs_notify_changes
  after insert or update of assignee_id, status on public.bugs
  for each row execute function public.notify_bug_changes();

-- ------------------------------------------------------------
-- 7. 마감 임박 — 매일 크론이 한 번 부른다(service_role 전용)
--    한국 시간 기준 "내일"이 마감인, 끝나지 않은 작업의 담당자에게 보낸다.
--    같은 작업으로 최근 20시간 안에 이미 보냈으면 건너뛴다(크론 재시도 대비).
-- ------------------------------------------------------------

create or replace function public.generate_due_soon_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_count integer := 0;
begin
  for v_task in
    select t.id, t.project_id, t.assignee_id, t.due_date
    from public.tasks t
    join public.projects p on p.id = t.project_id and p.archived_at is null
    where t.assignee_id is not null
      and t.status <> 'Done'
      and t.due_date = (now() at time zone 'Asia/Seoul')::date + 1
      and not exists (
        select 1 from public.notifications n
        where n.task_id = t.id and n.kind = 'task_due_soon' and n.user_id = t.assignee_id
          and n.created_at > now() - interval '20 hours'
      )
  loop
    perform public.notify_member(v_task.assignee_id, v_task.project_id, 'task_due_soon', null,
      p_task_id => v_task.id, p_detail => v_task.due_date::text);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.generate_due_soon_notifications() from public, anon, authenticated;
grant execute on function public.generate_due_soon_notifications() to service_role;

-- ------------------------------------------------------------
-- 8. 메일 요약 — 안 읽고 아직 메일로 안 보낸 최근 3일 알림을 받는 사람별로 돌려준다
--    (service_role 전용). 메일 주소는 auth.users에만 있어 여기서 붙인다.
--    보낸 뒤 mark_notifications_emailed로 표시한다 — 발송이 실패한 사람 것은 다음 날 다시 실린다.
-- ------------------------------------------------------------

create or replace function public.list_notification_digest()
returns table (
  notification_id  uuid,
  user_id          uuid,
  email            text,
  recipient_name   text,
  kind             text,
  actor_name       text,
  project_name     text,
  task_id          uuid,
  task_title       text,
  bug_id           uuid,
  bug_title        text,
  channel_id       uuid,
  channel_name     text,
  excerpt          text,
  detail           text,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.user_id,
    au.email::text,
    u.name,
    n.kind,
    actor.name,
    p.name,
    n.task_id,
    t.title,
    n.bug_id,
    b.title,
    n.channel_id,
    ch.name,
    left(coalesce(c.content, m.content), 120),
    n.detail,
    n.created_at
  from public.notifications n
  join public.users u on u.id = n.user_id and u.deactivated_at is null
  join auth.users au on au.id = n.user_id and au.email is not null
  join public.projects p on p.id = n.project_id
  left join public.users actor on actor.id = n.actor_id
  left join public.tasks t on t.id = n.task_id
  left join public.bugs b on b.id = n.bug_id
  left join public.chat_channels ch on ch.id = n.channel_id
  left join public.task_comments c on c.id = n.comment_id
  left join public.chat_messages m on m.id = n.message_id
  left join public.notification_preferences pref on pref.user_id = n.user_id
  where n.read_at is null
    and n.emailed_at is null
    and n.created_at > now() - interval '3 days'
    and not (n.kind = any (coalesce(pref.email_muted_kinds, '{}')))
  order by n.user_id, n.created_at desc;
$$;

revoke execute on function public.list_notification_digest() from public, anon, authenticated;
grant execute on function public.list_notification_digest() to service_role;

create or replace function public.mark_notifications_emailed(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications set emailed_at = now()
  where id = any (p_ids) and emailed_at is null;
$$;

revoke execute on function public.mark_notifications_emailed(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_notifications_emailed(uuid[]) to service_role;
