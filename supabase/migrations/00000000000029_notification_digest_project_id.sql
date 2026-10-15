-- ============================================================
-- 메일 요약 링크가 다른 프로젝트의 항목도 열 수 있게(?project=<id>)
-- list_notification_digest()가 project_id도 돌려준다. 반환 컬럼이 바뀌어 다시 만든다.
-- ============================================================

drop function public.list_notification_digest();

create or replace function public.list_notification_digest()
returns table (
  notification_id  uuid,
  user_id          uuid,
  email            text,
  recipient_name   text,
  kind             text,
  actor_name       text,
  project_id       uuid,
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
    p.id,
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
