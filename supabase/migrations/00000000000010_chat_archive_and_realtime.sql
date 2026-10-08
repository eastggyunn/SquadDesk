-- ============================================================
-- Chat channel archive + realtime
--
-- 채널 삭제는 메시지 이력을 보존하기 위해 물리 삭제 대신 archived_at을
-- 채우는 소프트 삭제(보관)로 처리한다. 기존 (project_id, name) 유니크
-- 인덱스는 보관된 채널의 이름까지 영구히 점유해버리므로, "보관되지
-- 않은 채널"에 대해서만 이름 중복을 막는 부분 유니크 인덱스로 바꾼다.
--
-- chat_messages는 채팅 화면의 실시간 동기화(Supabase Realtime
-- postgres_changes)를 위해 supabase_realtime publication에 추가한다.
-- RLS는 00000000000008에서 이미 프로젝트 멤버십 기준으로 적용돼 있으므로
-- Realtime 구독도 동일한 정책을 그대로 따른다.
-- ============================================================

alter table public.chat_channels add column archived_at timestamptz;

comment on column public.chat_channels.archived_at is
  '채널 보관(소프트 삭제) 시각. null이면 활성 채널. 메시지 이력을 보존하기 위해 물리 삭제 대신 사용한다.';

drop index if exists public.chat_channels_project_name_idx;

create unique index chat_channels_project_active_name_idx
  on public.chat_channels (project_id, name)
  where archived_at is null;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
