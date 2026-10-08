-- ============================================================
-- Chat attachment realtime
--
-- 채팅 메시지에 첨부된 파일(attachments, target_type='chat_message')의 INSERT를
-- 다른 사용자 화면에도 실시간으로 반영하기 위해 attachments 테이블을
-- supabase_realtime publication에 추가한다. RLS는 00000000000008에서 이미
-- 프로젝트 멤버십 기준으로 적용돼 있으므로(attachments_all_member) Realtime
-- 구독도 동일한 정책을 그대로 따른다 — 00000000000010의 chat_messages와 같은 패턴.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table public.attachments;
  end if;
end $$;
